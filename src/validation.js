export const choices = ['A', 'B', 'C', 'D'];
export const counts = [5, 10, 15, 20, 30, 40, 50];
export const questionDifficulties = ['básica', 'intermediária', 'avançada'];
export const difficulties = [...questionDifficulties, 'variada'];
export const mixedDifficultyPlan = count => Array.from({ length: count }, (_, index) => questionDifficulties[index % questionDifficulties.length]);

export function validateRequest(value) {
  const subject = typeof value?.subject === 'string' ? value.subject.trim() : '';
  const material = typeof value?.material === 'string' ? value.material.trim() : '';
  const count = Number(value?.count);
  const difficulty = value?.difficulty;
  if (subject.length < 3 || subject.length > 160) throw new Error('Informe um assunto de 3 a 160 caracteres.');
  if (!counts.includes(count)) throw new Error('Escolha 5, 10, 15, 20, 30, 40 ou 50 questões.');
  if (!difficulties.includes(difficulty)) throw new Error('Escolha uma dificuldade válida.');
  if (material.length > 12000) throw new Error('O material pode ter até 12.000 caracteres.');
  return { subject, material, count, difficulty };
}

const clean = (value) => typeof value === 'string' ? value.trim() : '';
const comparable = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\W+/g, ' ').trim();

export function validateQuiz(value, count, hasMaterial, expectedDifficulty) {
  if (!value || !Array.isArray(value.questions) || value.questions.length !== count) throw new Error('Quantidade de questões inválida.');
  const ids = new Set();
  const stems = new Set();
  const questions = value.questions.map((raw, index) => {
    const id = clean(raw?.id);
    const statement = clean(raw?.statement);
    const explanation = clean(raw?.explanation);
    const topic = clean(raw?.topic);
    const difficulty = clean(raw?.difficulty);
    const correct = raw?.correct;
    const reference = clean(raw?.reference);
    if (!id || !statement || !explanation || !topic || !questionDifficulties.includes(difficulty) || !choices.includes(correct)) throw new Error('Questão incompleta.');
    if (statement.length < 20 || statement.length > 1200 || explanation.length > 1600 || topic.length > 160 || reference.length > 300) throw new Error('Tamanho de campo inválido.');
    if (ids.has(id) || stems.has(comparable(statement))) throw new Error('Questões repetidas.');
    ids.add(id); stems.add(comparable(statement));
    if (!Array.isArray(raw.options) || raw.options.length !== 4) throw new Error('Alternativas inválidas.');
    const options = raw.options.map(option => ({ id: option?.id, text: clean(option?.text) }));
    if (options.some((option, i) => option.id !== choices[i] || !option.text || option.text.length > 500)) throw new Error('Alternativas incompletas.');
    if (new Set(options.map(option => comparable(option.text))).size !== 4) throw new Error('Alternativas repetidas.');
    // Sem consulta independente, referência só pode apontar o material recebido.
    return { id, statement, options, correct, explanation, topic, difficulty, reference: hasMaterial ? 'Material fornecido pelo estudante' : null, number: index + 1 };
  });
  if (expectedDifficulty === 'variada') {
    const plan = mixedDifficultyPlan(count);
    for (const level of questionDifficulties) {
      if (questions.filter(question => question.difficulty === level).length !== plan.filter(item => item === level).length) throw new Error('Distribuição de dificuldades inválida.');
    }
  } else if (expectedDifficulty && questions.some(question => question.difficulty !== expectedDifficulty)) {
    throw new Error('Dificuldade da questão inválida.');
  }
  return questions;
}

export function grade(questions, answers) {
  const results = questions.map(question => {
    const selected = choices.includes(answers?.[question.id]) ? answers[question.id] : null;
    return { ...question, selected, isCorrect: selected === question.correct };
  });
  const correct = results.filter(result => result.isCorrect).length;
  return { correct, wrong: results.length - correct, unanswered: results.filter(result => !result.selected).length, percent: Math.round(correct / results.length * 100), results };
}
