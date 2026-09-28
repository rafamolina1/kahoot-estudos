import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApi, send } from './src/api.js';
import { MemoryStore } from './src/store.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const files = { '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/app.js': 'app.js' };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

export function createServer({ provider, store = !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY ? new MemoryStore() : undefined } = {}) {
  const api = createApi({ provider, store });
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const route = pathname.match(/^\/api\/(generate|submit|history|review)$/)?.[1];
    if (route) return api(req, res, route);
    if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido.' });
    const filename = files[pathname];
    if (!filename) return send(res, 404, { error: 'Página não encontrada.' });
    try {
      const file = await readFile(path.join(root, 'public', filename));
      res.writeHead(200, { 'Content-Type': `${types[path.extname(filename)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
      res.end(file);
    } catch { send(res, 500, { error: 'Não foi possível abrir a página.' }); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => process.stdout.write(`Simulados em http://localhost:${port}\n`));
}
