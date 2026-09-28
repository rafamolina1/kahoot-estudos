const key = 'simulados-policiais-tentativa';
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const labels = { A: 'A', B: 'B', C: 'C', D: 'D' };
let state = { quiz: null, answers: {}, result: null };
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved?.quiz?.id && Array.isArray(saved.quiz.questions)) state = saved;
} catch { localStorage.removeItem(key); }
const save = () => localStorage.setItem(key, JSON.stringify(state));
const show = (view) => {
  $('#setup').hidden = view !== 'setup';
  $('#quiz-view').hidden = view !== 'quiz';
  $('#result-view').hidden = view !== 'result';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
const header = (eyebrow, title, description) => `<div class="eyebrow"><span class="eyebrow-line"></span>${eyebrow}</div><h1 tabindex="-1" class="view-title">${title}</h1><p class="intro">${description}</p>`;
const note = (quiz) => `<div class="notice"><span class="info-dot" aria-hidden="true">i</span><span>${quiz.materialUsed ? 'Material fornecido usado como referência prioritária. ' : ''}Questões geradas para estudo. Explicações produzidas por IA; confira a legislação e o edital atualizados.${quiz.demo ? ' Modo demonstração: conteúdo fictício, sem valor jurídico.' : ''}</span></div>`;

async function loadHistory() {
  const container = $('#history-content');
  try {
    const response = await fetch('/api/history');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Histórico indisponível.');
    const items = data.items || [];
    const temporary = data.persistent === false ? '<p class="history-temporary">Modo local: o histórico será apagado ao reiniciar o servidor. Configure o Supabase para guardá-lo permanentemente.</p>' : '';
    if (!items.length) {
      container.innerHTML = `${temporary}<div class="history-empty"><span aria-hidden="true">◇</span><p>Seu histórico começa após o primeiro simulado concluído.</p></div>`;
      return;
    }
    const totalQuestions = items.reduce((sum, item) => sum + item.question_count, 0);
    const totalCorrect = items.reduce((sum, item) => sum + item.correct_count, 0);
    const overall = Math.round(totalCorrect / totalQuestions * 100);
    container.innerHTML = `${temporary}<div class="history-stats"><div><strong>${items.length}</strong><span>Simulados exibidos</span></div><div><strong>${totalQuestions}</strong><span>Questões praticadas</span></div><div><strong>${overall}%</strong><span>Aproveitamento exibido</span></div></div><div class="history-list">${items.map(item => `<article class="history-item"><div class="history-date">${escapeHtml(new Date(item.completed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }))}</div><div class="history-subject"><strong>${escapeHtml(item.subject)}</strong><small>${item.question_count} questões · ${escapeHtml(item.difficulty)}${item.material_used ? ' · com material' : ''}</small></div><div class="history-score"><strong>${item.correct_count}/${item.question_count}</strong><span>${item.percent}% de acerto</span></div><button type="button" class="history-review" data-review-id="${escapeHtml(item.id)}" aria-label="Rever simulado sobre ${escapeHtml(item.subject)}">Rever <span aria-hidden="true">↗</span></button></article>`).join('')}</div>`;
  } catch (error) { container.innerHTML = `<div class="history-empty"><p>${escapeHtml(error.message || 'Não foi possível carregar o histórico.')}</p><button type="button" id="history-retry" class="button secondary">Tentar novamente</button></div>`; }
}

function renderQuiz() {
  const quiz = state.quiz;
  const answered = Object.keys(state.answers).filter(id => state.answers[id]).length;
  $('#quiz-view').innerHTML = `${header('SIMULADO EM ANDAMENTO', escapeHtml(quiz.subject), `${quiz.questions.length} questões · Dificuldade ${escapeHtml(quiz.difficulty)}`)}${note(quiz)}<div class="progress-row"><strong>${answered} de ${quiz.questions.length} respondidas</strong><span>Revise antes de finalizar</span></div><div class="progress"><span style="width:${answered / quiz.questions.length * 100}%"></span></div><form id="quiz-form">${quiz.questions.map((q, i) => `<fieldset class="question-card" id="question-${i + 1}"><legend><span class="question-number">QUESTÃO ${String(i + 1).padStart(2, '0')}</span><span class="topic">${escapeHtml(q.topic)}</span></legend><h2>${escapeHtml(q.statement)}</h2><div class="options">${q.options.map(option => `<label class="option ${state.answers[q.id] === option.id ? 'selected' : ''}"><input type="radio" name="${escapeHtml(q.id)}" value="${option.id}" ${state.answers[q.id] === option.id ? 'checked' : ''}><span class="option-letter">${labels[option.id] || ''}</span><span>${escapeHtml(option.text)}</span></label>`).join('')}</div></fieldset>`).join('')}<div class="quiz-actions"><button type="button" class="button quiet" id="back-btn">← Voltar ao formulário</button><button type="submit" class="button primary">Finalizar simulado <span aria-hidden="true">↗</span></button></div><div id="quiz-error" class="alert" role="alert" hidden></div></form>`;
  show('quiz');
  $('#quiz-view h1').focus();
}

function renderResult() {
  const { quiz, result } = state;
  $('#result-view').innerHTML = `${header('SIMULADO FINALIZADO', 'Seu resultado.', escapeHtml(quiz.subject))}${note(quiz)}<div class="score-panel"><div><span class="score-label">PERCENTUAL DE ACERTO</span><strong class="score-number">${result.percent}<small>%</small></strong><span class="score-sub">${result.correct} de ${result.results.length} questões</span></div><div class="score-stats"><div><strong>${result.correct}</strong><span>Acertos</span></div><div><strong>${result.wrong}</strong><span>Erros${result.unanswered ? ' (inclui não respondidas)' : ''}</span></div><div><strong>${result.unanswered}</strong><span>Não respondidas</span></div></div></div><div class="review-heading"><div><span class="eyebrow">REVISÃO</span><h2>Confira questão por questão</h2></div><button class="button secondary" id="new-btn-top">Criar outro simulado</button></div>${result.results.map((q, i) => `<article class="question-card review ${q.isCorrect ? 'correct' : 'incorrect'}"><div class="question-meta"><span class="question-number">QUESTÃO ${String(i + 1).padStart(2, '0')}</span><span class="status ${q.isCorrect ? 'good' : 'bad'}">${!q.selected ? 'Não respondida' : q.isCorrect ? 'Correta' : 'Incorreta'}</span></div><h3>${escapeHtml(q.statement)}</h3><div class="options">${q.options.map(option => `<div class="option result-option ${option.id === q.correct ? 'is-answer' : ''} ${option.id === q.selected && !q.isCorrect ? 'is-wrong' : ''}"><span class="option-letter">${option.id}</span><span>${escapeHtml(option.text)}</span>${option.id === q.correct ? '<strong>Correta</strong>' : option.id === q.selected ? '<strong>Sua resposta</strong>' : ''}</div>`).join('')}</div><div class="explanation"><strong>Explicação</strong><p>${escapeHtml(q.explanation)}</p>${q.reference ? `<small>Referência no material fornecido: ${escapeHtml(q.reference)}</small>` : ''}${!q.selected ? '<small>Você deixou esta questão sem resposta.</small>' : ''}</div></article>`).join('')}<div class="end-actions"><button class="button primary" id="new-btn-bottom">Criar outro simulado <span aria-hidden="true">↗</span></button></div>`;
  show('result');
  $('#result-view h1').focus();
}

function newQuiz() {
  if (state.quiz && !state.result && !confirm('Há um simulado em andamento. Deseja descartá-lo e voltar ao formulário?')) return;
  state = { quiz: null, answers: {}, result: null };
  localStorage.removeItem(key);
  show('setup');
  loadHistory();
  $('#subject').focus();
}

$('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#generate-btn');
  if (button.disabled) return;
  const error = $('#setup-error');
  error.hidden = true;
  button.disabled = true;
  button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Gerando questões...';
  try {
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o simulado.');
    state = { quiz: data, answers: {}, result: null };
    save(); renderQuiz();
  } catch (cause) { error.textContent = cause instanceof TypeError ? 'Falha de conexão. Verifique a internet e tente novamente.' : cause.message; error.hidden = false; }
  finally { button.disabled = false; button.innerHTML = '<span>Gerar simulado</span><span aria-hidden="true">↗</span>'; }
});

$('#quiz-view').addEventListener('change', (event) => {
  if (!event.target.matches('input[type="radio"]')) return;
  state.answers[event.target.name] = event.target.value;
  save();
  const fieldset = event.target.closest('fieldset');
  fieldset.querySelectorAll('.option').forEach(option => option.classList.toggle('selected', option.querySelector('input').checked));
  const answered = Object.keys(state.answers).length;
  $('#quiz-view .progress-row strong').textContent = `${answered} de ${state.quiz.questions.length} respondidas`;
  $('#quiz-view .progress span').style.width = `${answered / state.quiz.questions.length * 100}%`;
});

$('#quiz-view').addEventListener('click', (event) => { if (event.target.closest('#back-btn')) newQuiz(); });
$('#quiz-view').addEventListener('submit', async (event) => {
  event.preventDefault();
  const unanswered = state.quiz.questions.length - Object.keys(state.answers).length;
  if (unanswered && !confirm(`${unanswered} ${unanswered === 1 ? 'questão está' : 'questões estão'} sem resposta. Deseja finalizar mesmo assim?`)) return;
  const button = $('#quiz-form button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true; button.textContent = 'Corrigindo...';
  const error = $('#quiz-error'); error.hidden = true;
  try {
    const response = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: state.quiz.id, answers: state.answers }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível corrigir o simulado.');
    state.result = data; save(); renderResult(); loadHistory();
  } catch (cause) { error.textContent = cause instanceof TypeError ? 'Falha de conexão. Tente finalizar novamente.' : cause.message; error.hidden = false; }
  finally { button.disabled = false; button.textContent = 'Finalizar simulado ↗'; }
});
$('#result-view').addEventListener('click', event => { if (event.target.closest('#new-btn-top, #new-btn-bottom')) newQuiz(); });
$('#history-section').addEventListener('click', async event => {
  if (event.target.closest('#history-retry')) return loadHistory();
  const button = event.target.closest('[data-review-id]');
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/review?id=${encodeURIComponent(button.dataset.reviewId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível abrir a revisão.');
    state = { quiz: data.quiz, answers: {}, result: data.result };
    save(); renderResult();
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; }
});
window.addEventListener('beforeunload', event => { if (state.quiz && !state.result) { event.preventDefault(); event.returnValue = ''; } });
if (state.result) renderResult(); else if (state.quiz) renderQuiz();
loadHistory();
