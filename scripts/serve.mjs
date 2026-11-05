import { createServer } from 'node:http';
import { realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { readLimitedFile } from '../src/local-io.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FILES = new Map([
  ['/index.html', 'text/html; charset=utf-8'], ['/assets/app.mjs', 'text/javascript; charset=utf-8'], ['/assets/style.css', 'text/css; charset=utf-8'],
  ['/src/core.mjs', 'text/javascript; charset=utf-8'], ['/src/api.mjs', 'text/javascript; charset=utf-8'], ['/src/ui-state.mjs', 'text/javascript; charset=utf-8'],
  ['/fixtures/synthetic.mjs', 'text/javascript; charset=utf-8'], ['/docs/contract.md', 'text/plain; charset=utf-8']
]);
export function createStaticServer(root = ROOT) {
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return; }
    let path;
    try {
      path = decodeURIComponent((req.url ?? '').split('?')[0]);
      if (!path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid path');
    } catch { res.writeHead(400); res.end('Invalid path'); return; }
    if (path === '/') path = '/index.html';
    const type = FILES.get(path);
    if (!type) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const base = await realpath(root);
      const filename = await realpath(resolve(base, path.slice(1)));
      if (!filename.startsWith(`${base}${sep}`)) { res.writeHead(403); res.end('Forbidden'); return; }
      const bytes = await readLimitedFile(filename, 2097152);
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); res.end('Asset unavailable'); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 32;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] ?? 4173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    process.stderr.write('Port must be an integer from 1024 to 65535.\n'); process.exitCode = 1;
  } else {
    const server = createStaticServer();
    server.on('error', error => { process.stderr.write(`Local server failed (${error.code ?? 'SERVER_ERROR'}).\n`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => process.stdout.write(`Evidence board: http://127.0.0.1:${port}\nBound to loopback only; stop with Ctrl+C.\n`));
  }
}
