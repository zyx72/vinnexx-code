import { createServer, request as proxyRequest } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = new URL('./dist/', import.meta.url).pathname;
const port = Number(process.env.PORT || 5173);
const apiTarget = new URL(process.env.VINNEXX_API_ORIGIN || 'http://127.0.0.1:8787');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.map':'application/json' };

createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    const upstream = proxyRequest({ hostname: apiTarget.hostname, port: apiTarget.port, path: req.url, method: req.method, headers: { ...req.headers, host: apiTarget.host } }, (up) => {
      res.writeHead(up.statusCode || 502, up.headers); up.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end('API unavailable'); });
    req.pipe(upstream); return;
  }
  const requested = normalize((req.url || '/').split('?')[0]).replace(/^\.\.(\/|\\)/, '');
  let file = join(root, requested === '/' ? 'index.html' : requested);
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); }
  catch { file = join(root, 'index.html'); }
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${port}`));
