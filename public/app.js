const key = 'simulados-policiais-tentativa';
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const labels = { A: 'A', B: 'B', C: 'C', D: 'D' };
let state = { quiz: null, answers: {}, notes: {}, result: null };
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved?.quiz?.id && Array.isArray(saved.quiz.questions)) state = { ...saved, notes: saved.notes || saved.quiz.notes || {} };
} catch { localStorage.removeItem(key); }
const save = () => localStorage.setItem(key, JSON.stringify(state));
const show = (view) => {
  $('#setup').hidden = view !== 'setup';
  $('#quiz-view').hidden = view !== 'quiz';
  $('#result-view').hidden = view !== 'result';
  document.body.dataset.view = view;
  setActiveNav(view === 'setup' ? 'setup-link' : null);
  renderSessionIndex(view);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function setActiveNav(id) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.id === id);
    if (link.id === id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function renderSessionIndex(view) {
  const nav = $('#session-nav');
  nav.hidden = view === 'setup';
  if (nav.hidden || !state.quiz) return;
  const reviewing = view === 'result';
  const questions = reviewing ? state.result.results : state.quiz.questions;
  nav.innerHTML = `<div class="session-nav-label">${reviewing ? 'SUA REVISÃO' : 'NESTA SESSÃO'}</div><nav class="question-index" aria-label="Índice das questões">${questions.map((question, index) => {
    const status = reviewing ? question.isCorrect ? 'Correta' : question.selected ? 'Incorreta' : 'Não respondida' : state.answers[question.id] ? 'Respondida' : 'Não respondida';
    const className = reviewing ? question.isCorrect ? 'index-correct' : 'index-wrong' : state.answers[question.id] ? 'answered' : '';
    return `<a href="#${reviewing ? 'review-' : ''}question-${index + 1}" class="${className}" aria-label="Questão ${index + 1}: ${status}">${String(index + 1).padStart(2, '0')}</a>`;
  }).join('')}</nav><p class="index-caption">${reviewing ? 'Selecione uma questão para rever.' : 'Selecione um número para ir à questão.'}</p>`;
}

function updatePreview() {
  const subject = $('#subject').value.trim();
  $('#preview-subject').textContent = subject || 'Um assunto. Uma nova página.';
  $('#preview-count').textContent = $('#count').value;
  $('#preview-difficulty').textContent = $('#difficulty').selectedOptions[0].textContent.replace(' (todos os níveis)', '');
  $('#preview-material').textContent = $('#material').value.trim() ? 'Seu material' : 'Tema escolhido';
}
const header = (eyebrow, title, description) => `<div class="eyebrow"><span class="eyebrow-line"></span>${eyebrow}</div><h1 tabindex="-1" class="view-title">${title}</h1><p class="intro">${description}</p>`;
const note = (quiz) => `<div class="notice"><span class="info-dot" aria-hidden="true">i</span><span>${quiz.materialUsed ? 'Material fornecido usado como referência prioritária. ' : ''}Questões geradas para estudo. Explicações produzidas por IA; confira a legislação e o edital atualizados.${quiz.demo ? ' Modo demonstração: conteúdo fictício, sem valor jurídico.' : ''}</span></div>`;
function addQuestionLevels(container, questions, selector) {
  container.querySelectorAll(selector).forEach((meta, index) => {
    if (!questions[index]?.difficulty) return;
    const badge = document.createElement('span');
    badge.className = 'question-level';
    badge.textContent = questions[index].difficulty;
    meta.append(badge);
  });
}

function addQuestionNotes(container, questions) {
  container.querySelectorAll('fieldset.question-card').forEach((card, index) => {
    const question = questions[index];
    const layout = document.createElement('div');
    layout.className = 'question-layout';
    const content = document.createElement('div');
    content.className = 'question-content';
    content.append(card.querySelector('h2'), card.querySelector('.options'));
    const panel = document.createElement('div');
    panel.className = 'question-note-panel';
    const noteId = `note-${index + 1}`;
    panel.innerHTML = `<div class="note-heading"><span class="note-icon" aria-hidden="true">✎</span><label for="${noteId}">Suas anotações</label></div><p>Registre o que revisar ou uma relação com outro conteúdo.</p><textarea id="${noteId}" data-note-id="${escapeHtml(question.id)}" maxlength="1000" rows="7" placeholder="Ex.: preciso rever este tema; conteúdo X ajuda a entender esta questão."></textarea><div class="note-footer"><span>Salvo neste navegador até finalizar</span><span class="note-count">0/1000</span></div>`;
    const textarea = panel.querySelector('textarea');
    textarea.value = state.notes[question.id] || '';
    panel.querySelector('.note-count').textContent = `${textarea.value.length}/1000`;
    layout.append(content, panel);
    card.append(layout);
  });
}

function addReviewNotes(container, questions) {
  container.querySelectorAll('article.question-card.review').forEach((card, index) => {
    const question = questions[index];
    const id = `review-note-${index + 1}`;
    const panel = document.createElement('div');
    panel.className = 'review-note-panel';
    panel.innerHTML = `<div class="review-note-heading"><label for="${id}">Sua anotação</label><span>Uso pessoal · até 1.000 caracteres</span></div><textarea id="${id}" data-review-note-id="${escapeHtml(question.id)}" maxlength="1000" rows="4" placeholder="Escreva o que precisa rever ou uma dica para lembrar depois."></textarea><div class="review-note-actions"><span class="review-note-status" role="status">${state.notes[question.id] ? 'Anotação salva' : 'Sem anotação'}</span><button type="button" class="button secondary" data-save-note-id="${escapeHtml(question.id)}">Salvar anotação</button></div>`;
    panel.querySelector('textarea').value = state.notes[question.id] || '';
    const learning = document.createElement('div');
    learning.className = 'review-learning';
    learning.append(card.querySelector('.explanation'), panel);
    card.append(learning);
  });
}

function addDeleteControl(container, quiz) {
  const management = document.createElement('div');
  management.className = 'view-management';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button danger';
  button.dataset.deleteId = quiz.id;
  button.dataset.isRevision = String(!!quiz.sourceSimulationId);
  button.textContent = quiz.sourceSimulationId ? 'Apagar esta revisão' : 'Apagar este simulado';
  const error = document.createElement('div');
  error.className = 'alert delete-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  management.append(button, error);
  container.querySelector('.notice').after(management);
}

function groupHistory(items) {
  const byId = new Map(items.map(item => [item.id, item]));
  const groups = new Map();
  for (const item of items) {
    let root = item;
    const visited = new Set([item.id]);
    while (root.source_simulation_id && byId.has(root.source_simulation_id) && !visited.has(root.source_simulation_id)) {
      root = byId.get(root.source_simulation_id);
      visited.add(root.id);
    }
    if (!groups.has(root.id)) groups.set(root.id, { root, revisions: [] });
    if (item.id !== root.id) groups.get(root.id).revisions.push(item);
  }
  return [...groups.values()].map(group => {
    group.revisions.sort((a, b) => a.completed_at.localeCompare(b.completed_at));
    return group;
  }).sort((a, b) => {
    const latestA = a.revisions.at(-1)?.completed_at || a.root.completed_at;
    const latestB = b.revisions.at(-1)?.completed_at || b.root.completed_at;
    return latestB.localeCompare(latestA);
  });
}

function renderHistoryItem(item, revisionNumber = 0) {
  const label = revisionNumber ? `Revisão ${revisionNumber} · ` : item.source_simulation_id ? 'Revisão de pendências · ' : '';
  return `<article class="history-item ${revisionNumber ? 'history-revision' : ''}">
    <div class="history-date">${escapeHtml(new Date(item.completed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }))}</div>
    <div class="history-subject"><strong>${escapeHtml(item.subject)}</strong><small>${label}${item.question_count} questões · ${escapeHtml(item.difficulty)}${item.material_used ? ' · com material' : ''}</small></div>
    <div class="history-score"><strong>${item.correct_count}/${item.question_count}</strong><span>${item.percent}% de acerto</span></div>
    <div class="history-actions"><button type="button" class="history-review" data-review-id="${escapeHtml(item.id)}" aria-label="Rever ${revisionNumber ? 'revisão' : 'simulado'} sobre ${escapeHtml(item.subject)}">Rever <span aria-hidden="true">↗</span></button>${item.wrong_count ? `<button type="button" class="history-review history-retry" data-retry-id="${escapeHtml(item.id)}" aria-label="Refazer ${item.wrong_count} questões pendentes sobre ${escapeHtml(item.subject)}">Refazer ${item.wrong_count}</button>` : ''}<button type="button" class="history-delete" data-delete-id="${escapeHtml(item.id)}" data-is-revision="${!!item.source_simulation_id}" aria-label="Apagar ${revisionNumber ? 'revisão' : 'simulado'} sobre ${escapeHtml(item.subject)}">Apagar</button></div>
  </article>`;
}

async function loadHistory() {
  const container = $('#history-content');
  try {
    const response = await fetch('/api/history');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Histórico indisponível.');
    const items = data.items || [];
    const temporary = data.persistent === false ? '<p class="history-temporary">Modo local: o histórico será apagado ao reiniciar o servidor. Configure o Supabase para guardá-lo permanentemente.</p>' : '';
    if (!items.length) {
      container.innerHTML = `${temporary}<div class="history-empty"><span class="empty-page" aria-hidden="true">01</span><div><h3>A primeira página está por vir.</h3><p>Conclua um simulado para acompanhar seus resultados e retomar os assuntos.</p></div></div>`;
      return;
    }
    const originals = items.filter(item => !item.source_simulation_id);
    const totalQuestions = originals.reduce((sum, item) => sum + item.question_count, 0);
    const totalCorrect = originals.reduce((sum, item) => sum + item.correct_count, 0);
    const overall = totalQuestions ? Math.round(totalCorrect / totalQuestions * 100) : 0;
    container.innerHTML = `${temporary}
      <div class="history-stats"><div><strong>${originals.length}</strong><span>Simulados exibidos</span></div><div><strong>${totalQuestions}</strong><span>Questões praticadas</span></div><div><strong>${overall}%</strong><span>Aproveitamento exibido</span></div></div>
      <div class="history-list">${groupHistory(items).map(({ root, revisions }) => `<section class="history-group" aria-label="Simulado sobre ${escapeHtml(root.subject)}">
        ${renderHistoryItem(root)}
        ${revisions.length ? `<details class="error-notebook"><summary><span>Caderno de erros</span><small>${revisions.length} ${revisions.length === 1 ? 'revisão' : 'revisões'}</small></summary><div class="notebook-items">${revisions.map((revision, index) => renderHistoryItem(revision, index + 1)).join('')}</div></details>` : ''}
      </section>`).join('')}</div>`;
  } catch (error) { container.innerHTML = `<div class="history-empty"><p>${escapeHtml(error.message || 'Não foi possível carregar o histórico.')}</p><button type="button" id="history-retry" class="button secondary">Tentar novamente</button></div>`; }
}

function renderQuiz() {
  const quiz = state.quiz;
  const answered = Object.keys(state.answers).filter(id => state.answers[id]).length;
  $('#quiz-view').innerHTML = `${header('SIMULADO EM ANDAMENTO', escapeHtml(quiz.subject), `${quiz.questions.length} questões · Dificuldade ${escapeHtml(quiz.difficulty)}`)}${note(quiz)}<div class="progress-row"><strong>${answered} de ${quiz.questions.length} respondidas</strong><span>Revise antes de finalizar</span></div><div class="progress"><span style="width:${answered / quiz.questions.length * 100}%"></span></div><form id="quiz-form">${quiz.questions.map((q, i) => `<fieldset class="question-card" id="question-${i + 1}"><legend><span class="question-number">QUESTÃO ${String(i + 1).padStart(2, '0')}</span><span class="topic">${escapeHtml(q.topic)}</span></legend><h2>${escapeHtml(q.statement)}</h2><div class="options">${q.options.map(option => `<label class="option ${state.answers[q.id] === option.id ? 'selected' : ''}"><input type="radio" name="${escapeHtml(q.id)}" value="${option.id}" ${state.answers[q.id] === option.id ? 'checked' : ''}><span class="option-letter">${labels[option.id] || ''}</span><span>${escapeHtml(option.text)}</span></label>`).join('')}</div></fieldset>`).join('')}<div class="quiz-actions"><button type="button" class="button quiet" id="back-btn">← Voltar ao formulário</button><button type="submit" class="button primary">Finalizar simulado <span aria-hidden="true">↗</span></button></div><div id="quiz-error" class="alert" role="alert" hidden></div></form>`;
  addQuestionLevels($('#quiz-view'), quiz.questions, '.question-card legend');
  addQuestionNotes($('#quiz-view'), quiz.questions);
  addDeleteControl($('#quiz-view'), quiz);
  if (quiz.sourceSimulationId) $('#quiz-view .eyebrow').textContent = 'REVISÃO DE PENDÊNCIAS';
  show('quiz');
  $('#quiz-view h1').focus();
}

function renderResult() {
  const { quiz, result } = state;
  $('#result-view').innerHTML = `${header('SIMULADO FINALIZADO', 'Seu resultado.', escapeHtml(quiz.subject))}${note(quiz)}<div class="score-panel"><div><span class="score-label">PERCENTUAL DE ACERTO</span><strong class="score-number">${result.percent}<small>%</small></strong><span class="score-sub">${result.correct} de ${result.results.length} questões</span></div><div class="score-stats"><div><strong>${result.correct}</strong><span>Acertos</span></div><div><strong>${result.wrong}</strong><span>Erros${result.unanswered ? ' (inclui não respondidas)' : ''}</span></div><div><strong>${result.unanswered}</strong><span>Não respondidas</span></div></div></div><div class="review-heading"><div><span class="eyebrow">REVISÃO</span><h2>Confira questão por questão</h2></div><button class="button secondary" id="new-btn-top">Criar outro simulado</button></div>${result.results.map((q, i) => `<article class="question-card review ${q.isCorrect ? 'correct' : 'incorrect'}"><div class="question-meta"><span class="question-number">QUESTÃO ${String(i + 1).padStart(2, '0')}</span><span class="status ${q.isCorrect ? 'good' : 'bad'}">${!q.selected ? 'Não respondida' : q.isCorrect ? 'Correta' : 'Incorreta'}</span></div><h3>${escapeHtml(q.statement)}</h3><div class="options">${q.options.map(option => `<div class="option result-option ${option.id === q.correct ? 'is-answer' : ''} ${option.id === q.selected && !q.isCorrect ? 'is-wrong' : ''}"><span class="option-letter">${option.id}</span><span>${escapeHtml(option.text)}</span>${option.id === q.correct ? '<strong>Correta</strong>' : option.id === q.selected ? '<strong>Sua resposta</strong>' : ''}</div>`).join('')}</div><div class="explanation"><strong>Explicação</strong><p>${escapeHtml(q.explanation)}</p>${q.reference ? `<small>Referência no material fornecido: ${escapeHtml(q.reference)}</small>` : ''}${!q.selected ? '<small>Você deixou esta questão sem resposta.</small>' : ''}</div></article>`).join('')}<div class="end-actions"><button class="button primary" id="new-btn-bottom">Criar outro simulado <span aria-hidden="true">↗</span></button></div>`;
  addQuestionLevels($('#result-view'), result.results, '.question-meta');
  addReviewNotes($('#result-view'), result.results);
  $('#result-view').querySelectorAll('.question-card').forEach((card, index) => { card.id = `review-question-${index + 1}`; });
  addDeleteControl($('#result-view'), quiz);
  if (quiz.sourceSimulationId) {
    $('#result-view .eyebrow').textContent = 'REVISÃO CONCLUÍDA';
    $('#result-view .intro').textContent = `Revisão de pendências · ${quiz.subject}`;
  }
  if (result.wrong) {
    const label = `Refazer ${result.wrong} ${result.wrong === 1 ? 'questão pendente' : 'questões pendentes'}`;
    for (const selector of ['.review-heading', '.end-actions']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button primary';
      button.dataset.retryId = quiz.id;
      button.textContent = label;
      $('#result-view').querySelector(selector).append(button);
    }
    $('#result-view .score-panel').insertAdjacentHTML('afterend', '<div id="result-retry-error" class="alert" role="alert" hidden></div>');
  }
  show('result');
  $('#result-view h1').focus();
}

function newQuiz() {
  if (state.quiz && !state.result && !confirm('Há um simulado em andamento. Deseja descartá-lo e voltar ao formulário?')) return false;
  state = { quiz: null, answers: {}, notes: {}, result: null };
  localStorage.removeItem(key);
  show('setup');
  loadHistory();
  $('#subject').focus();
  return true;
}

let retryBusy = false;
let deleteBusy = false;
async function deleteSimulation(button) {
  if (deleteBusy || button.disabled || retryBusy) return;
  const isRevision = button.dataset.isRevision === 'true';
  const message = isRevision
    ? 'Apagar esta revisão e as revisões derivadas? O simulado original será mantido. Esta ação não pode ser desfeita.'
    : 'Apagar este simulado e todo o seu caderno de erros? Esta ação não pode ser desfeita.';
  if (!confirm(message)) return;
  deleteBusy = true;
  const id = button.dataset.deleteId;
  const buttons = document.querySelectorAll(`[data-delete-id="${id}"]`);
  buttons.forEach(item => { item.disabled = true; });
  const error = button.closest('#history-section') ? $('#history-action-error') : button.closest('section')?.querySelector('.delete-error');
  if (error) error.hidden = true;
  try {
    const response = await fetch(`/api/simulation?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível apagar o simulado.');
    if (state.quiz?.id === id) {
      state = { quiz: null, answers: {}, notes: {}, result: null };
      localStorage.removeItem(key);
      show('setup');
      $('#subject').focus();
    }
    await loadHistory();
  } catch (cause) {
    if (error) {
      error.textContent = cause instanceof TypeError ? 'Falha de conexão. Tente apagar novamente.' : cause.message;
      error.hidden = false;
    }
  } finally {
    deleteBusy = false;
    buttons.forEach(item => { item.disabled = false; });
  }
}

async function startRetry(id, fromHistory) {
  if (retryBusy) return;
  retryBusy = true;
  const buttons = document.querySelectorAll(`[data-retry-id="${id}"]`);
  buttons.forEach(button => { button.disabled = true; });
  const error = fromHistory ? $('#history-action-error') : $('#result-retry-error');
  if (error) error.hidden = true;
  try {
    const response = await fetch('/api/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar a revisão.');
    state = { quiz: data, answers: {}, notes: data.notes || {}, result: null };
    save(); renderQuiz();
  } catch (cause) {
    if (error) {
      error.textContent = cause instanceof TypeError ? 'Falha de conexão. Tente novamente.' : cause.message;
      error.hidden = false;
      error.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  } finally {
    retryBusy = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}

$('#home-link').addEventListener('click', (event) => {
  event.preventDefault();
  if ($('#setup').hidden) newQuiz();
  else { setActiveNav('setup-link'); window.scrollTo({ top: 0, behavior: 'smooth' }); $('#subject').focus(); }
});

$('#setup-link').addEventListener('click', event => {
  event.preventDefault();
  if ($('#setup').hidden && !newQuiz()) return;
  setActiveNav('setup-link');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#subject').focus({ preventScroll: true });
});
$('#history-link').addEventListener('click', event => {
  event.preventDefault();
  if ($('#setup').hidden && !newQuiz()) return;
  setActiveNav('history-link');
  $('#history-section').scrollIntoView({ behavior: 'smooth' });
  $('#history-title').focus({ preventScroll: true });
});
$('#session-nav').addEventListener('click', event => {
  const link = event.target.closest('.question-index a');
  if (!link) return;
  event.preventDefault();
  const card = document.querySelector(link.getAttribute('href'));
  card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const heading = card?.querySelector('h2, h3');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
});
$('#create-form').addEventListener('input', updatePreview);
$('#create-form').addEventListener('change', updatePreview);

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
    state = { quiz: data, answers: {}, notes: data.notes || {}, result: null };
    save(); renderQuiz();
  } catch (cause) { error.textContent = cause instanceof TypeError ? 'Falha de conexão. Verifique a internet e tente novamente.' : cause.message; error.hidden = false; }
  finally { button.disabled = false; button.innerHTML = '<span>Gerar simulado</span><span aria-hidden="true">→</span>'; }
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
  renderSessionIndex('quiz');
});

$('#quiz-view').addEventListener('input', event => {
  const textarea = event.target.closest('textarea[data-note-id]');
  if (!textarea) return;
  if (textarea.value) state.notes[textarea.dataset.noteId] = textarea.value;
  else delete state.notes[textarea.dataset.noteId];
  save();
  textarea.closest('.question-note-panel').querySelector('.note-count').textContent = `${textarea.value.length}/1000`;
});

$('#quiz-view').addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-id]');
  if (button) return deleteSimulation(button);
  if (event.target.closest('#back-btn')) newQuiz();
});
$('#quiz-view').addEventListener('submit', async (event) => {
  event.preventDefault();
  const unanswered = state.quiz.questions.length - Object.keys(state.answers).length;
  if (unanswered && !confirm(`${unanswered} ${unanswered === 1 ? 'questão está' : 'questões estão'} sem resposta. Deseja finalizar mesmo assim?`)) return;
  const button = $('#quiz-form button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true; button.textContent = 'Corrigindo...';
  const error = $('#quiz-error'); error.hidden = true;
  try {
    const response = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: state.quiz.id, answers: state.answers, notes: state.notes }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível corrigir o simulado.');
    state.result = data; save(); renderResult(); loadHistory();
  } catch (cause) { error.textContent = cause instanceof TypeError ? 'Falha de conexão. Tente finalizar novamente.' : cause.message; error.hidden = false; }
  finally { button.disabled = false; button.textContent = 'Finalizar simulado ↗'; }
});
$('#result-view').addEventListener('click', event => {
  const deletion = event.target.closest('[data-delete-id]');
  if (deletion) return deleteSimulation(deletion);
  const retry = event.target.closest('[data-retry-id]');
  if (retry) return startRetry(retry.dataset.retryId, false);
  const noteButton = event.target.closest('[data-save-note-id]');
  if (noteButton) return saveReviewNote(noteButton);
  if (event.target.closest('#new-btn-top, #new-btn-bottom')) newQuiz();
});

$('#result-view').addEventListener('input', event => {
  const textarea = event.target.closest('textarea[data-review-note-id]');
  if (!textarea) return;
  textarea.closest('.review-note-panel').querySelector('.review-note-status').textContent = 'Alterações não salvas';
});

let reviewNoteBusy = false;
async function saveReviewNote(button) {
  if (button.disabled || reviewNoteBusy) return;
  const panel = button.closest('.review-note-panel');
  const textarea = panel.querySelector('textarea');
  const status = panel.querySelector('.review-note-status');
  const quizId = state.quiz.id;
  reviewNoteBusy = true;
  const buttons = [...$('#result-view').querySelectorAll('[data-save-note-id]')];
  buttons.forEach(item => { item.disabled = true; });
  textarea.disabled = true;
  status.textContent = 'Salvando...';
  try {
    const response = await fetch('/api/simulation', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: quizId, questionId: button.dataset.saveNoteId, text: textarea.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a anotação.');
    if (state.quiz?.id === quizId) {
      state.notes = data.notes || {};
      state.quiz.notes = state.notes;
      save();
    }
    status.textContent = 'Anotação salva';
  } catch (cause) {
    status.textContent = cause instanceof TypeError ? 'Falha de conexão. Tente salvar novamente.' : cause.message;
  } finally { reviewNoteBusy = false; buttons.forEach(item => { item.disabled = false; }); textarea.disabled = false; }
}
$('#history-section').addEventListener('click', async event => {
  if (event.target.closest('#history-retry')) return loadHistory();
  const deletion = event.target.closest('[data-delete-id]');
  if (deletion) return deleteSimulation(deletion);
  const retry = event.target.closest('[data-retry-id]');
  if (retry) return startRetry(retry.dataset.retryId, true);
  const button = event.target.closest('[data-review-id]');
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/review?id=${encodeURIComponent(button.dataset.reviewId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível abrir a revisão.');
    state = { quiz: data.quiz, answers: {}, notes: data.quiz.notes || {}, result: data.result };
    save(); renderResult();
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; }
});
window.addEventListener('beforeunload', event => { if (state.quiz && !state.result) { event.preventDefault(); event.returnValue = ''; } });
if (state.result) renderResult(); else if (state.quiz) renderQuiz();
updatePreview();
loadHistory();
