import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { validateRequest, grade, choices } from './validation.js';
import { generateQuestions, ProviderError } from './provider.js';
import { SupabaseStore, MemoryStore, StoreError } from './store.js';

const messages = {
  missing_key: 'A geração ainda não foi configurada. Configure a chave Gemini no servidor.',
  model: 'O modelo Gemini configurado não está disponível para esta chave.',
  quota: 'A cota do Gemini foi atingida. Tente mais tarde ou consulte os limites da sua conta no Google AI Studio.',
  network: 'Não foi possível conectar ao serviço de geração. Tente novamente.',
  unavailable: 'O serviço de geração está indisponível no momento. Tente novamente.',
  provider: 'Não foi possível gerar o simulado agora. Confira a configuração do servidor.',
  invalid: 'As questões geradas não passaram na conferência. Tente gerar novamente.',
  missing_config: 'O histórico ainda não foi configurado. Configure o Supabase no servidor.',
  failed: 'Não foi possível acessar o histórico agora. Tente novamente.'
};

export function send(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  if (req.body !== undefined) {
    const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(value).length > 70000) throw new Error('O texto enviado é grande demais.');
    return value;
  }
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 70000) throw new Error('O texto enviado é grande demais.');
  }
  return JSON.parse(data);
}

function owner(req, res) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)study_session=([a-f0-9]{64})(?:;|$)/);
  const token = match?.[1] || randomBytes(32).toString('hex');
  if (!match) {
    const secure = process.env.VERCEL || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `study_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`);
  }
  return createHash('sha256').update(token).digest('hex');
}

const publicQuiz = row => ({
  id: row.id, subject: row.subject, difficulty: row.difficulty,
  materialUsed: row.material_used, demo: row.demo,
  sourceSimulationId: row.source_simulation_id || null,
  notes: row.notes || {},
  questions: row.questions.map(({ correct, explanation, reference, ...question }) => question)
});

function validateNotes(value, questions) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Anotações inválidas.');
  const allowed = new Set(questions.map(question => question.id));
  const notes = {};
  for (const [id, text] of Object.entries(value)) {
    if (!allowed.has(id) || typeof text !== 'string' || text.length > 1000) throw new Error('Cada anotação deve ter até 1.000 caracteres.');
    if (text.trim()) notes[id] = text.trim();
  }
  return notes;
}

function errorResponse(res, error) {
  if (error instanceof ProviderError) {
    return send(res, error.code === 'quota' ? 429 : error.code === 'missing_key' ? 503 : 502, { error: messages[error.code] || messages.provider });
  }
  if (error instanceof StoreError) return send(res, 503, { error: error.code === 'missing_config' ? messages.missing_config : messages.failed });
  return send(res, 500, { error: 'Ocorreu um erro inesperado. Tente novamente.' });
}

export function createApi({ store = new SupabaseStore(), provider } = {}) {
  return async function handle(req, res, route) {
    const url = new URL(req.url, 'http://localhost');
    const ownerHash = owner(req, res);
    try {
      if (route === 'generate' && req.method === 'POST') {
        let input;
        try { input = validateRequest(await readBody(req)); }
        catch (error) { return send(res, 400, { error: error instanceof SyntaxError ? 'Dados inválidos.' : error.message }); }
        const reservation = await store.reserve(ownerHash);
        if (!reservation) return send(res, 429, { error: 'Aguarde antes de gerar outro simulado.' }, { 'Retry-After': '60' });
        try {
          const questions = await generateQuestions(input, provider);
          const row = await store.create({
            id: randomUUID(), owner_hash: ownerHash, subject: input.subject,
            difficulty: input.difficulty, question_count: input.count,
            material_used: !!input.material, demo: process.env.PROVIDER === 'mock', questions, notes: {}
          });
          return send(res, 200, publicQuiz(row));
        } finally { try { await store.release(reservation); } catch { /* A reserva expira no banco. */ } }
      }
      if (route === 'retry' && req.method === 'POST') {
        let value;
        try { value = await readBody(req); } catch { return send(res, 400, { error: 'Dados inválidos.' }); }
        if (!/^[a-f0-9-]{36}$/.test(value?.id || '')) return send(res, 400, { error: 'Simulado inválido.' });
        const source = await store.find(value.id, ownerHash);
        if (!source) return send(res, 404, { error: 'Simulado não encontrado neste navegador.' });
        if (!source.completed_at) return send(res, 409, { error: 'Finalize o simulado antes de refazer as questões pendentes.' });
        const questions = source.questions.filter(question => source.answers?.[question.id] !== question.correct).map(question => structuredClone(question));
        if (!questions.length) return send(res, 409, { error: 'Todas as questões deste simulado já foram acertadas.' });
        const notes = Object.fromEntries(questions.filter(question => source.notes?.[question.id]).map(question => [question.id, source.notes[question.id]]));
        const row = await store.createRetry({
          id: randomUUID(), owner_hash: ownerHash, source_simulation_id: source.id,
          subject: source.subject, difficulty: source.difficulty,
          question_count: questions.length, material_used: source.material_used,
          demo: source.demo, questions, notes
        });
        return send(res, 200, publicQuiz(row));
      }
      if (route === 'simulation' && req.method === 'DELETE') {
        const id = url.searchParams.get('id') || '';
        if (!/^[a-f0-9-]{36}$/.test(id)) return send(res, 400, { error: 'Simulado inválido.' });
        if (!await store.remove(id, ownerHash)) return send(res, 404, { error: 'Simulado não encontrado neste navegador.' });
        return send(res, 200, { deleted: true });
      }
      if (route === 'simulation' && req.method === 'PATCH') {
        let value;
        try { value = await readBody(req); } catch { return send(res, 400, { error: 'Dados inválidos.' }); }
        if (!/^[a-f0-9-]{36}$/.test(value?.id || '') || typeof value?.questionId !== 'string') return send(res, 400, { error: 'Anotação inválida.' });
        const row = await store.find(value.id, ownerHash);
        if (!row?.completed_at) return send(res, 404, { error: 'Simulado concluído não encontrado neste navegador.' });
        if (!row.questions.some(question => question.id === value.questionId) || typeof value.text !== 'string' || value.text.length > 1000) return send(res, 400, { error: 'A anotação deve ter até 1.000 caracteres.' });
        const notes = { ...(row.notes || {}) };
        if (value.text.trim()) notes[value.questionId] = value.text.trim();
        else delete notes[value.questionId];
        const saved = await store.updateNotes(row.id, ownerHash, notes);
        if (!saved) return send(res, 404, { error: 'Simulado não encontrado neste navegador.' });
        return send(res, 200, { notes: saved.notes || {} });
      }
      if (route === 'submit' && req.method === 'POST') {
        let value;
        try { value = await readBody(req); } catch { return send(res, 400, { error: 'Dados inválidos.' }); }
        if (!/^[a-f0-9-]{36}$/.test(value?.id || '') || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)) return send(res, 400, { error: 'Respostas inválidas.' });
        const row = await store.find(value.id, ownerHash);
        if (!row) return send(res, 410, { error: 'Este simulado não está disponível neste navegador.' });
        if (row.completed_at) return send(res, 200, grade(row.questions, row.answers || {}));
        let notes;
        try { notes = value.notes === undefined ? row.notes || {} : validateNotes(value.notes, row.questions); }
        catch (error) { return send(res, 400, { error: error.message }); }
        const answers = Object.fromEntries(row.questions.filter(question => choices.includes(value.answers[question.id])).map(question => [question.id, value.answers[question.id]]));
        const result = grade(row.questions, answers);
        const saved = await store.finish(row.id, ownerHash, {
          answers, notes, correct_count: result.correct, wrong_count: result.wrong,
          unanswered_count: result.unanswered, percent: result.percent,
          completed_at: new Date().toISOString()
        });
        return send(res, 200, grade(saved.questions, saved.answers || {}));
      }
      if (route === 'history' && req.method === 'GET') {
        const rows = await store.history(ownerHash);
        return send(res, 200, { items: rows, persistent: !(store instanceof MemoryStore) });
      }
      if (route === 'review' && req.method === 'GET') {
        const id = url.searchParams.get('id') || '';
        if (!/^[a-f0-9-]{36}$/.test(id)) return send(res, 400, { error: 'Simulado inválido.' });
        const row = await store.find(id, ownerHash);
        if (!row?.completed_at) return send(res, 404, { error: 'Simulado não encontrado neste navegador.' });
        return send(res, 200, { quiz: publicQuiz(row), result: grade(row.questions, row.answers || {}) });
      }
      return send(res, 405, { error: 'Método não permitido.' });
    } catch (error) { return errorResponse(res, error); }
  };
}
