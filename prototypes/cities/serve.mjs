// Tiny static server for the cities prototype: node prototypes/cities/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = +(process.argv[2] ?? process.env.PORT ?? 3610);
const SHOT_DIR = process.env.SHOT_DIR ?? process.argv[3];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  // dev only: POST /__shot?name=x with a PNG data URL saves it under SHOT_DIR (for visual review)
  if (req.method === 'POST' && req.url.startsWith('/__shot') && SHOT_DIR) {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') ?? 'shot').replace(/[^\w.-]/g, '_');
    let body = '';
    for await (const c of req) body += c;
    await writeFile(join(SHOT_DIR, `${name}.png`), Buffer.from(body.replace(/^data:image\/png;base64,/, ''), 'base64'));
    res.writeHead(200).end('ok');
    return;
  }
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(root, path === '' || path === '.' ? 'index.html' : path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(port, () => console.log(`cities prototype on http://localhost:${port}`));
