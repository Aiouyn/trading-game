// Socket load test: registers N players on a running world server, keeps N WebSockets open,
// sends some commands, and measures tick delivery (spacing, lateness) and bandwidth.
// Start the server with REGISTER_LIMIT high, e.g.:
//   PORT=8899 DATA_DIR=./load-data TICK_MS=1000 WARMUP_DAYS=1 REGISTER_LIMIT=100000 npx tsx server/index.ts
// then: node scripts/load/socket-load.mjs [http://localhost:8899] [clients=2000] [seconds=30]
// the `ws` client: Node's built-in WebSocket caps concurrent connections per origin in a single process
import WebSocket from 'ws';

const base = process.argv[2] ?? 'http://localhost:8899';
const N = Number(process.argv[3] ?? 2000);
const SECONDS = Number(process.argv[4] ?? 30);
const ws = base.replace(/^http/, 'ws');

const t0 = Date.now();
const tokens = [];
for (let i = 0; i < N; i += 50) {
  const batch = await Promise.all(Array.from({ length: Math.min(50, N - i) }, (_, k) => fetch(`${base}/api/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: `ld${Date.now() % 1e6}${i + k}`.slice(0, 18), country: 'FR' }),
  }).then((r) => r.json())));
  for (const b of batch) if (b.token) tokens.push(b.token);
}
console.log(`registered ${tokens.length} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

let bytes = 0;
let ticks = 0;
const arrivals = new Map(); // tick → [first, last] arrival
let welcomed = 0;
let errors = 0;
let closes = 0;
let stopping = false;
const closeCodes = {};
const sockets = [];
for (const [i, token] of tokens.entries()) {
  if (i % 200 === 0 && i) await new Promise((r) => setTimeout(r, 100)); // a login wave, not one instant
  sockets[i] = open(token, i);
}
function open(token, i, attempt = 0) {
  const s = new WebSocket(ws);
  let got = false;
  s.onopen = () => s.send(JSON.stringify({ t: 'hello', token }));
  s.onmessage = (ev) => {
    const data = String(ev.data);
    bytes += data.length;
    if (data.startsWith('{"t":"welcome"')) {
      welcomed++;
      got = true;
      if (i % 10 === 0) s.send(JSON.stringify({ t: 'cmd', id: 1, cmd: { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1 } } }));
      return;
    }
    if (!data.startsWith('{"t":"tick"')) return;
    ticks++;
    const m = /"frame":\{"tick":(\d+)/.exec(data);
    if (!m) return;
    const t = Number(m[1]);
    const now = Date.now();
    const a = arrivals.get(t);
    if (a) a[1] = now; else arrivals.set(t, [now, now]);
  };
  s.onerror = (e) => { if (errors++ === 0) console.log('first socket error:', e?.message, e?.error?.code, e?.error?.message); };
  s.onclose = (e) => {
    closes++;
    closeCodes[e.code] = (closeCodes[e.code] ?? 0) + 1;
    // like the real client: reconnect with backoff when the connection drops before the welcome
    if (!got && attempt < 6 && !stopping) setTimeout(() => { sockets[i] = open(token, i, attempt + 1); }, 500 * 2 ** attempt);
  };
  return s;
}

const start = Date.now();
await new Promise((r) => setTimeout(r, SECONDS * 1000));
const secs = (Date.now() - start) / 1000;
stopping = true;
const spans = [...arrivals.values()].map(([a, b]) => b - a).sort((x, y) => x - y);
const firsts = [...arrivals.values()].map(([a]) => a).sort((x, y) => x - y);
const gaps = firsts.slice(1).map((v, k) => v - firsts[k]).sort((x, y) => x - y);
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? 0;
console.log(`connect retries ${closes} (socket errors ${errors})`, JSON.stringify(closeCodes));
console.log(`clients ${welcomed}/${N} · tick messages ${ticks} · ${(bytes / secs / 1e6).toFixed(1)} MB/s total, ${(bytes / secs / Math.max(1, welcomed) / 1e3).toFixed(1)} kB/s per client`);
console.log(`fan-out time per tick (first → last client): p50 ${pct(spans, 0.5)} ms, p99 ${pct(spans, 0.99)} ms`);
console.log(`tick spacing: p50 ${pct(gaps, 0.5)} ms, p99 ${pct(gaps, 0.99)} ms`);
for (const s of sockets) s.close();
const health = await fetch(`${base}/health`).then((r) => r.json());
console.log('server', JSON.stringify(health));
process.exit(0);
