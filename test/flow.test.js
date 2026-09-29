import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { generateMock, generateQuestions, generateGemini, makePrompt, ProviderError } from '../src/provider.js';
import { validateQuiz } from '../src/validation.js';
import { MemoryStore, SupabaseStore, StoreError } from '../src/store.js';

const cookies = new Map();
async function withServer(provider, run, store = new MemoryStore()) {
  const server = createServer({ provider, store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  cookies.delete(base);
  try { await run(base); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function request(base, endpoint, value, { noCookie = false } = {}) {
  const response = await fetch(`${base}${endpoint}`, {
    method: value === undefined ? 'GET' : 'POST',
    headers: { ...(value === undefined ? {} : { 'Content-Type': 'application/json' }), ...(noCookie || !cookies.get(base) ? {} : { Cookie: cookies.get(base) }) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) })
  });
  const cookie = response.headers.get('set-cookie');
  if (cookie && !noCookie) cookies.set(base, cookie.split(';')[0]);
  return response;
}

test('gera 10 questões, oculta gabarito, corrige escolhas e não respondidas', async () => {
  await withServer(generateMock, async base => {
    const generated = await request(base, '/api/generate', { subject: 'Direito Penal', count: 10, difficulty: 'intermediária', material: 'Trecho de estudo.' });
    assert.equal(generated.status, 200);
    const quiz = await generated.json();
    assert.equal(quiz.questions.length, 10);
    assert.equal(quiz.materialUsed, true);
    assert.ok(quiz.questions.every(q => !('correct' in q) && !('explanation' in q)));
    const submitted = await request(base, '/api/submit', { id: quiz.id, answers: { q1: 'A', q2: 'A' } });
    assert.equal(submitted.status, 200);
    const result = await submitted.json();
    assert.equal(result.correct, 1);
    assert.equal(result.wrong, 9);
    assert.equal(result.unanswered, 8);
    assert.equal(result.percent, 10);
    assert.equal(result.results[0].selected, 'A');
    assert.equal(result.results[1].correct, 'B');
    assert.equal(result.results[2].selected, null);
    assert.match(result.results[0].explanation, /alternativa A/);
    assert.equal(result.results[0].reference, 'Material fornecido pelo estudante');
    const history = await (await request(base, '/api/history')).json();
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].subject, 'Direito Penal');
    assert.equal(history.items[0].correct_count, 1);
    assert.equal(history.items[0].percent, 10);
    const review = await (await request(base, `/api/review?id=${quiz.id}`)).json();
    assert.equal(review.result.percent, 10);
    assert.equal(review.quiz.questions.length, 10);
    assert.ok(review.quiz.questions.every(question => !('correct' in question)));
    const otherBrowser = await request(base, `/api/review?id=${quiz.id}`, undefined, { noCookie: true });
    assert.equal(otherBrowser.status, 404);
  });
});

test('refaz erros e não respondidas sem chamar o provedor e preserva o simulado original', async () => {
  let providerCalls = 0;
  await withServer(input => { providerCalls++; return generateMock(input); }, async base => {
    const source = await (await request(base, '/api/generate', { subject: 'Direito Penal', count: 5, difficulty: 'intermediária', material: '' })).json();
    const unfinished = await request(base, '/api/retry', { id: source.id });
    assert.equal(unfinished.status, 409);
    await request(base, '/api/submit', { id: source.id, answers: { q1: 'A', q2: 'A' } });

    const retryResponse = await request(base, '/api/retry', { id: source.id });
    assert.equal(retryResponse.status, 200);
    const retry = await retryResponse.json();
    assert.equal(retry.sourceSimulationId, source.id);
    assert.deepEqual(retry.questions.map(question => question.id), ['q2', 'q3', 'q4', 'q5']);
    assert.ok(retry.questions.every(question => !('correct' in question) && !('explanation' in question)));
    assert.equal(providerCalls, 1);
    assert.equal((await (await request(base, '/api/retry', { id: source.id })).json()).id, retry.id);

    const corrected = await (await request(base, '/api/submit', { id: retry.id, answers: { q2: 'B' } })).json();
    assert.equal(corrected.correct, 1);
    assert.equal(corrected.unanswered, 3);
    const finalRetry = await (await request(base, '/api/retry', { id: retry.id })).json();
    assert.equal(finalRetry.questions.length, 3);
    const allCorrect = await (await request(base, '/api/submit', { id: finalRetry.id, answers: { q3: 'C', q4: 'D', q5: 'A' } })).json();
    assert.equal(allCorrect.percent, 100);
    assert.equal((await request(base, '/api/retry', { id: finalRetry.id })).status, 409);
    assert.equal(providerCalls, 1);

    const history = (await (await request(base, '/api/history')).json()).items;
    assert.equal(history.length, 3);
    assert.equal(history.find(item => item.id === source.id).correct_count, 1);
    assert.equal(history.find(item => item.id === retry.id).source_simulation_id, source.id);
    assert.equal(history.find(item => item.id === finalRetry.id).source_simulation_id, retry.id);
    assert.equal((await request(base, '/api/retry', { id: source.id }, { noCookie: true })).status, 404);
  });
});

test('permite refazer uma única questão errada', async () => {
  await withServer(generateMock, async base => {
    const source = await (await request(base, '/api/generate', { subject: 'Direito Penal', count: 5, difficulty: 'básica', material: '' })).json();
    await request(base, '/api/submit', { id: source.id, answers: { q1: 'B', q2: 'B', q3: 'C', q4: 'D', q5: 'A' } });
    const retry = await (await request(base, '/api/retry', { id: source.id })).json();
    assert.equal(retry.questions.length, 1);
    assert.equal(retry.questions[0].id, 'q1');
    const corrected = await (await request(base, '/api/submit', { id: retry.id, answers: { q1: 'A' } })).json();
    assert.equal(corrected.percent, 100);
  });
});

test('tentativa continua após recriar o servidor com o mesmo armazenamento', async () => {
  const store = new MemoryStore();
  let quiz;
  let sessionCookie;
  await withServer(generateMock, async base => {
    quiz = await (await request(base, '/api/generate', { subject: 'Direito Penal', count: 5, difficulty: 'básica', material: '' })).json();
    sessionCookie = cookies.get(base);
  }, store);
  await withServer(generateMock, async base => {
    const response = await fetch(`${base}/api/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ id: quiz.id, answers: { q1: 'A' } })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).correct, 1);
  }, store);
});

test('aceita 30, 40 e 50 questões e corrige um simulado de 50', async () => {
  await withServer(generateMock, async base => {
    for (const count of [30, 40, 50]) {
      const response = await request(base, '/api/generate', { subject: 'Direito Penal', count, difficulty: 'intermediária', material: '' });
      assert.equal(response.status, 200);
      const quiz = await response.json();
      assert.equal(quiz.questions.length, count);
      if (count === 50) {
        const answers = Object.fromEntries(quiz.questions.map((question, index) => [question.id, 'ABCD'[index % 4]]));
        const submitted = await request(base, '/api/submit', { id: quiz.id, answers });
        assert.equal(submitted.status, 200);
        const result = await submitted.json();
        assert.equal(result.correct, 50);
        assert.equal(result.percent, 100);
        assert.equal(result.results.length, 50);
      }
    }
  });
});

test('modo variado distribui os três níveis e rejeita uma distribuição incorreta', async () => {
  const input = { subject: 'Direito Penal', count: 10, difficulty: 'variada', material: '' };
  assert.match(makePrompt(input), /4 questões de dificuldade básica, 3 questões de dificuldade intermediária, 3 questões de dificuldade avançada/);
  await withServer(generateMock, async base => {
    const response = await request(base, '/api/generate', input);
    assert.equal(response.status, 200);
    const quiz = await response.json();
    assert.equal(quiz.difficulty, 'variada');
    assert.deepEqual(quiz.questions.map(question => question.difficulty), ['básica', 'intermediária', 'avançada', 'básica', 'intermediária', 'avançada', 'básica', 'intermediária', 'avançada', 'básica']);
    const submitted = await request(base, '/api/submit', { id: quiz.id, answers: { q1: 'A' } });
    assert.equal(submitted.status, 200);
    assert.equal((await submitted.json()).results[0].difficulty, 'básica');
  });
  const invalid = generateMock(input);
  invalid.questions[0].difficulty = 'intermediária';
  assert.throws(() => validateQuiz(invalid, 10, false, 'variada'), /Distribuição de dificuldades inválida/);
});

test('entrada inválida e ausência de chave mostram erros sem segredos', async () => {
  const old = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await withServer(undefined, async base => {
      const invalid = await request(base, '/api/generate', { subject: 'X', count: 10, difficulty: 'intermediária' });
      assert.equal(invalid.status, 400);
      const missing = await request(base, '/api/generate', { subject: 'Direito Penal', count: 10, difficulty: 'intermediária' });
      assert.equal(missing.status, 503);
      assert.match((await missing.json()).error, /chave Gemini/);
    });
  } finally { if (old) process.env.GEMINI_API_KEY = old; }
});

test('resposta inválida recebe uma correção controlada', async () => {
  let calls = 0;
  const provider = input => {
    calls++;
    if (calls === 1) return { questions: [] };
    return generateMock(input);
  };
  const questions = await generateQuestions({ subject: 'Direito Penal', count: 5, difficulty: 'básica', material: '' }, provider);
  assert.equal(questions.length, 5);
  assert.equal(calls, 2);
});

test('erro persistente e alternativas duplicadas são rejeitados', async () => {
  const input = { subject: 'Direito Penal', count: 5, difficulty: 'básica', material: '' };
  let calls = 0;
  await assert.rejects(generateQuestions(input, () => { calls++; return { questions: [] }; }), error => error instanceof ProviderError && error.code === 'invalid');
  assert.equal(calls, 2);
  const quiz = generateMock(input);
  quiz.questions[0].options[1].text = quiz.questions[0].options[0].text;
  assert.throws(() => validateQuiz(quiz, 5, false), /Alternativas repetidas/);
});

test('limita gerações repetidas e traduz falha de cota', async () => {
  const input = { subject: 'Direito Penal', count: 5, difficulty: 'básica', material: '' };
  await withServer(generateMock, async base => {
    for (let i = 0; i < 3; i++) assert.equal((await request(base, '/api/generate', input)).status, 200);
    const limited = await request(base, '/api/generate', input);
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).error, /Aguarde/);
  });
  await withServer(() => { throw new ProviderError('quota'); }, async base => {
    const response = await request(base, '/api/generate', input);
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /cota/);
  });
});

test('integração Interactions envia chave só no servidor e interpreta saída estruturada', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'chave-de-teste';
  try {
    const input = { subject: 'Direito Penal', count: 5, difficulty: 'básica', material: '' };
    const data = await generateGemini(input, false, async (url, options) => {
      assert.match(url, /\/interactions$/);
      assert.equal(options.headers['x-goog-api-key'], 'chave-de-teste');
      const sent = JSON.parse(options.body);
      assert.equal(sent.store, false);
      assert.equal(sent.response_format.mime_type, 'application/json');
      assert.equal(sent.generation_config.max_output_tokens, 6750);
      return { ok: true, json: async () => ({ steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(generateMock(input)) }] }] }) };
    });
    assert.equal(data.questions.length, 5);
  } finally { if (previous) process.env.GEMINI_API_KEY = previous; else delete process.env.GEMINI_API_KEY; }
});

test('Supabase usa secret key somente no servidor e falha claramente sem configuração', async () => {
  const calls = [];
  const store = new SupabaseStore({
    url: 'https://projeto.supabase.co', key: 'sb_secret_teste',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => 42 };
    }
  });
  assert.equal(await store.reserve('a'.repeat(64)), 42);
  assert.equal(calls[0].url, 'https://projeto.supabase.co/rest/v1/rpc/reserve_generation');
  assert.equal(calls[0].options.headers.apikey, 'sb_secret_teste');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  await assert.rejects(new SupabaseStore({ url: '', key: '' }).history('a'.repeat(64)), error => error instanceof StoreError && error.code === 'missing_config');
});

test('Supabase reaproveita uma revisão aberta sem inserir outra linha', async () => {
  const record = { id: '12345678-1234-1234-1234-123456789abc', owner_hash: 'a'.repeat(64), source_simulation_id: '87654321-4321-4321-4321-cba987654321' };
  let saved = null;
  let inserts = 0;
  const store = new SupabaseStore({
    url: 'https://projeto.supabase.co', key: 'sb_secret_teste',
    fetchImpl: async (url, options) => {
      if (options.method === 'POST') { inserts++; saved = record; }
      else assert.match(url, /source_simulation_id=eq\./);
      return { ok: true, status: 200, json: async () => saved ? [saved] : [] };
    }
  });
  assert.equal((await store.createRetry(record)).id, record.id);
  assert.equal((await store.createRetry(record)).id, record.id);
  assert.equal(inserts, 1);
});
