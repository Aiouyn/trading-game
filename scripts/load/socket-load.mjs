// Socket load test: registers N players on a running world server, keeps N WebSockets open,
// sends some commands, and measures tick delivery (fan-out, overrun) and bandwidth.
// Start the server with REGISTER_LIMIT high, e.g.:
//   PORT=8899 DATA_DIR=./load-data TICK_MS=5000 WARMUP_DAYS=1 REGISTER_LIMIT=100000 npx tsx server/index.ts
// then: node scripts/load/socket-load.mjs [http://localhost:8899] [clients=2000] [seconds=30]
// The exit code is the gate (V1-PHASE9 R-9-8b, track 9C): 0 when ALL clients welcomed, the tick fan-out p99 (the server's
// tick start, the frame's serverTime, to the last client's receipt) is under 2.5 s, AND the tick overrun p99 (spacing between
// consecutive tick starts minus the nominal tick, the welcome's tickMs) is under 0.5 s; 1 otherwise. A 1 s stress run gets the
// same printout, and its exit code is reported as a stress number, not as the gate (R-9-8b). Client and server share one clock.
// The env RAMP=batch/ms (default 200/250) sets the connect ramp.
// The env WINDOW_ALIGN=N (V1-PHASE9 R-9-12) starts the measured window at the first tick whose number is a multiple of N (N=60, the
// public tick BOARD_EVERY), and the window then lasts the same SECONDS. The window is not started early: a window that starts at a
// public tick holds it, so the record reads the stall the public tick causes. NEED_PUBLIC=k (default 0) makes the gate also need k
// public ticks (tick % PUBLIC_EVERY === 0, default 60) in the window; the printout always states the count.
// The env PANEL_READERS=k (R-9-12) makes the first k clients read the boards and the directory ('panel' requests) on every public tick of
// the window, as a Social screen does; their replies are counted and printed. The gate does not include them (the default is 0).
// Sample size: the window is 60 s, so a 5 s tick gives 7 to 11 gaps (a healthy server: 11 or 12 ticks) and the p99 of the
// overrun or fan-out is the maximum of those few samples. A 1 s stress gives about 54 gaps. The printout states the count
// (N ticks, N gaps); read the p99 as the worst sample of the window, not as a population percentile.
// the `ws` client: Node's built-in WebSocket caps concurrent connections per origin in a single process
import WebSocket from 'ws';

const base = process.argv[2] ?? 'http://localhost:8899';
const N = Number(process.argv[3] ?? 2000);
const SECONDS = Number(process.argv[4] ?? 30);
const ALIGN = Number(process.env.WINDOW_ALIGN ?? 0);
const PUBLIC_EVERY = Number(process.env.PUBLIC_EVERY ?? 60);
const NEED_PUBLIC = Number(process.env.NEED_PUBLIC ?? 0);
// PANEL_READERS=k (V1-PHASE9 R-9-12): k of the clients read the public panels on every public tick of the window (see onmessage)
const PANEL_READERS = Number(process.env.PANEL_READERS ?? 0);
let panelReplies = 0;
let panelBytes = 0;
let panelSeq = 1000;
const ws = base.replace(/^http/, 'ws');

const t0 = Date.now();
// connect ramp: RAMP=batch/ms (default 200/250) opens the sockets in waves of `batch`, `ms` apart. An instant burst of N connects
// overflows the server's accept queue and the surplus is refused (ECONNREFUSED), the 253-client failure of V1-PHASE4 O-19 and the
// 2,890-of-4,000 run of V1-PHASE9 9C. RAMP=0/0 turns the ramp off (the old burst).
const [RAMP_BATCH, RAMP_MS] = (process.env.RAMP ?? '200/250').split('/').map(Number);
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
// the measured window: open from the start (WINDOW_ALIGN unset), or from the first aligned tick (WINDOW_ALIGN=N)
let windowOn = ALIGN === 0;
let windowStart = 0;
const arrivals = new Map(); // frame tick → { first, last } client receipt (ms), and st: the server's serverTime stamp of that tick
let nominal = null; // the server's tick period (ms), from the welcome's tickMs
let welcomed = 0;
let errors = 0;
let closes = 0;
let stopping = false;
const closeCodes = {};
const sockets = [];
console.log(RAMP_BATCH > 0 ? `connect ramp ${RAMP_BATCH} per ${RAMP_MS} ms` : 'connect ramp off (one burst)');
for (const [i, token] of tokens.entries()) {
  if (RAMP_BATCH > 0 && i && i % RAMP_BATCH === 0) await new Promise((r) => setTimeout(r, RAMP_MS)); // a login wave, not one instant
  sockets[i] = open(token, i);
}
function open(token, i, attempt = 0) {
  const s = new WebSocket(ws);
  let got = false;
  s.onopen = () => s.send(JSON.stringify({ t: 'hello', token }));
  s.onmessage = (ev) => {
    const data = String(ev.data);
    if (windowOn) bytes += data.length;
    if (data.startsWith('{"t":"panel"')) {
      if (windowOn) { panelReplies++; panelBytes += data.length; }
      return;
    }
    if (data.startsWith('{"t":"welcome"')) {
      welcomed++;
      got = true;
      if (nominal === null) nominal = Number(/"tickMs":(\d+)/.exec(data)?.[1] ?? process.env.TICK_MS ?? 5000);
      if (i % 10 === 0) s.send(JSON.stringify({ t: 'cmd', id: 1, cmd: { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1 } } }));
      return;
    }
    if (!data.startsWith('{"t":"tick"')) return;
    const m = /"frame":\{"tick":(\d+)/.exec(data);
    if (!m) return;
    const t = Number(m[1]);
    if (!windowOn) {
      // the window opens at the first aligned tick (WINDOW_ALIGN); before it nothing is counted or recorded
      if (t % ALIGN !== 0) return;
      windowOn = true;
      windowStart = Date.now();
      bytes = 0;
      ticks = 0;
    }
    ticks++;
    const now = Date.now();
    const a = arrivals.get(t);
    if (a) a.last = now;
    else {
      // serverTime is the last field of a tick message: the server's stamp at the tick's broadcast (the tick start)
      const si = data.lastIndexOf('"serverTime":');
      arrivals.set(t, { first: now, last: now, st: si >= 0 ? parseInt(data.slice(si + 13), 10) : NaN });
    }
    // PANEL_READERS (R-9-12): the first k clients read the boards and the directory on each public tick of the window, as a client
    // with Social open does (usePublicPanel). Their replies are counted and reported; the gate does not read them.
    if (i < PANEL_READERS && windowOn && data.includes('"panels":')) {
      s.send(JSON.stringify({ t: 'panel', id: ++panelSeq, panel: 'boards' }));
      s.send(JSON.stringify({ t: 'panel', id: ++panelSeq, panel: 'directory' }));
    }
  };
  s.onerror = (e) => { if (errors++ === 0) console.log('first socket error:', e?.message, e?.error?.code, e?.error?.message); };
  s.onclose = (e) => {
    closes++;
    closeCodes[e.code] = (closeCodes[e.code] ?? 0) + 1;
    // like the real client: reconnect with backoff when the connection drops before the welcome
    // as src/net/client.ts: reconnect until the welcome, backoff 500 ms doubling, capped at 15 s
    if (!got && !stopping) setTimeout(() => { sockets[i] = open(token, i, attempt + 1); }, Math.min(15_000, 500 * 2 ** attempt));
  };
  return s;
}

// the measured window starts once every client has welcomed (at most 240 s), so the tick numbers describe the full population
// and not the clients still in backoff
const settleStart = Date.now();
while (welcomed < N && Date.now() - settleStart < 240_000) await new Promise((r) => setTimeout(r, 250));
console.log(`settled after ${((Date.now() - settleStart) / 1000).toFixed(1)} s: welcomed ${welcomed} of ${N}`);
// the window's own counters: the settle period (clients still in backoff) is not part of the tick numbers
if (ALIGN === 0) {
  arrivals.clear();
  bytes = 0;
  ticks = 0;
  windowStart = Date.now();
} else {
  // the aligned start: wait for the first tick whose number is a multiple of ALIGN (at most 15 min), then the same length
  while (!windowOn && Date.now() - settleStart < 900_000) await new Promise((r) => setTimeout(r, 50));
  if (!windowOn) console.log(`no tick aligned to ${ALIGN} arrived in 15 min: the window is empty`);
}
const start = windowStart || Date.now();
await new Promise((r) => setTimeout(r, Math.max(0, start + SECONDS * 1000 - Date.now())));
windowOn = false;
const secs = (Date.now() - start) / 1000;
stopping = true;
// per tick of the window, sorted by the frame tick: tick start (the server's serverTime stamp) and the client receipts
const perTick = [...arrivals.entries()].filter(([, v]) => Number.isFinite(v.st)).sort((x, y) => x[0] - y[0]).map(([t, v]) => ({ t, ...v }));
const fanOut = perTick.map((k) => k.last - k.st).sort((x, y) => x - y);
const overrun = [];
for (let i = 1; i < perTick.length; i++) {
  const perTickSpacing = (perTick[i].st - perTick[i - 1].st) / Math.max(1, perTick[i].t - perTick[i - 1].t);
  overrun.push(perTickSpacing - (nominal ?? 5000));
}
overrun.sort((x, y) => x - y);
const spans = [...arrivals.values()].map((v) => v.last - v.first).sort((x, y) => x - y);
const firsts = [...arrivals.values()].map((v) => v.first).sort((x, y) => x - y);
const arrivalGaps = firsts.slice(1).map((v, k) => v - firsts[k]).sort((x, y) => x - y);
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? 0;
console.log(`connect retries ${closes} (socket errors ${errors})`, JSON.stringify(closeCodes));
console.log(`clients ${welcomed}/${N} · tick messages ${ticks} · ${(bytes / secs / 1e6).toFixed(1)} MB/s total, ${(bytes / secs / Math.max(1, welcomed) / 1e3).toFixed(1)} kB/s per client`);
const publicCount = perTick.filter((k) => k.t % PUBLIC_EVERY === 0).length;
console.log(`ticks in window ${perTick.length} · public ticks in window ${publicCount} (tick % ${PUBLIC_EVERY}, first tick ${perTick[0]?.t ?? '-'}) · nominal tick ${nominal} ms (welcome tickMs)`);
if (PANEL_READERS > 0) console.log(`panel readers ${PANEL_READERS} · panel replies in window ${panelReplies} · ${(panelBytes / 1e6).toFixed(1)} MB (boards and directory)`);
console.log(`fan-out per tick (tick start to last client receipt, ${fanOut.length} ticks): p50 ${pct(fanOut, 0.5)} ms, p99 ${pct(fanOut, 0.99)} ms, max ${fanOut.at(-1) ?? 0} ms`);
console.log(`tick overrun (spacing minus nominal, ${overrun.length} gaps): p50 ${pct(overrun, 0.5)} ms, p99 ${pct(overrun, 0.99)} ms, max ${overrun.at(-1) ?? 0} ms`);
console.log(`reference: client first→last receipt per tick p50 ${pct(spans, 0.5)} ms, p99 ${pct(spans, 0.99)} ms; client arrival spacing p50 ${pct(arrivalGaps, 0.5)} ms, p99 ${pct(arrivalGaps, 0.99)} ms`);
// the machine gate (V1-PHASE9 R-9-8b): every client welcomed (the settle loop gives up at 240 s), fan-out p99 under 2.5 s, overrun p99 under 0.5 s
const allWelcomed = welcomed === N;
const fanP99 = pct(fanOut, 0.99);
const overP99 = pct(overrun, 0.99);
const publicOk = publicCount >= NEED_PUBLIC;
const pass = allWelcomed && fanOut.length > 0 && overrun.length > 0 && fanP99 < 2500 && overP99 < 500 && publicOk;
console.log(`GATE ${pass ? 'PASS' : 'FAIL'}: welcomed ${welcomed}/${N} (need ${N}); fan-out p99 ${fanP99} ms (need < 2500); overrun p99 ${overP99} ms (need < 500); public ticks ${publicCount} (need ${NEED_PUBLIC})`);
for (const s of sockets) s.close();
const health = await fetch(`${base}/health`).then((r) => r.json());
console.log('server', JSON.stringify(health));
process.exit(pass ? 0 : 1);
