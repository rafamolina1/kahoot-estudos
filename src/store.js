export class StoreError extends Error {
  constructor(code = 'failed') { super(code); this.code = code; }
}

const summaryFields = 'id,subject,difficulty,question_count,material_used,correct_count,wrong_count,unanswered_count,percent,created_at,completed_at';

export class SupabaseStore {
  constructor({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY, fetchImpl = fetch } = {}) {
    this.url = url;
    this.key = key;
    this.fetchImpl = fetchImpl;
  }

  async request(path, { method = 'GET', body, prefer } = {}) {
    if (!this.url || !this.key) throw new StoreError('missing_config');
    let response;
    try {
      response = await this.fetchImpl(`${this.url.replace(/\/$/, '')}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: this.key,
          'Content-Type': 'application/json',
          ...(prefer ? { Prefer: prefer } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000)
      });
    } catch { throw new StoreError('unavailable'); }
    if (!response.ok) throw new StoreError('failed');
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw new StoreError('failed'); }
  }

  async reserve(ownerHash) {
    return this.request('rpc/reserve_generation', { method: 'POST', body: { p_owner_hash: ownerHash } });
  }

  async release(reservationId) {
    if (!reservationId) return;
    await this.request(`generation_events?id=eq.${reservationId}`, { method: 'PATCH', body: { finished_at: new Date().toISOString() } });
  }

  async create(record) {
    const rows = await this.request('simulations?select=*', { method: 'POST', body: record, prefer: 'return=representation' });
    return rows?.[0];
  }

  async find(id, ownerHash) {
    const rows = await this.request(`simulations?id=eq.${id}&owner_hash=eq.${ownerHash}&select=*`);
    return rows?.[0] || null;
  }

  async finish(id, ownerHash, update) {
    const rows = await this.request(`simulations?id=eq.${id}&owner_hash=eq.${ownerHash}&completed_at=is.null&select=*`, {
      method: 'PATCH', body: update, prefer: 'return=representation'
    });
    return rows?.[0] || this.find(id, ownerHash);
  }

  async history(ownerHash) {
    return this.request(`simulations?owner_hash=eq.${ownerHash}&completed_at=not.is.null&select=${summaryFields}&order=completed_at.desc&limit=500`);
  }
}

// Apenas para testes e modo de demonstração local.
export class MemoryStore {
  constructor() { this.simulations = new Map(); this.events = []; }
  async reserve(ownerHash) {
    const now = Date.now();
    this.events = this.events.filter(event => now - event.at < 4 * 60_000);
    if (this.events.some(event => event.ownerHash === ownerHash && !event.finished) || this.events.filter(event => event.ownerHash === ownerHash && now - event.at < 60_000).length >= 3) return null;
    const id = this.events.length ? Math.max(...this.events.map(event => event.id)) + 1 : 1;
    this.events.push({ id, ownerHash, at: now, finished: false });
    return id;
  }
  async release(id) { const event = this.events.find(item => item.id === id); if (event) event.finished = true; }
  async create(record) { const row = { ...record, created_at: new Date().toISOString(), completed_at: null }; this.simulations.set(row.id, row); return row; }
  async find(id, ownerHash) { const row = this.simulations.get(id); return row?.owner_hash === ownerHash ? row : null; }
  async finish(id, ownerHash, update) { const row = await this.find(id, ownerHash); if (!row) return null; if (!row.completed_at) Object.assign(row, update); return row; }
  async history(ownerHash) { return [...this.simulations.values()].filter(row => row.owner_hash === ownerHash && row.completed_at).sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, 500).map(({ questions, answers, owner_hash, ...summary }) => summary); }
}
