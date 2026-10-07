import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Store } from './db';
import { WorldHost } from './host';
import { chatFor, directory, marketFrame, playerView, publicState } from '../src/world/view';
import { validHandle, COUNTRIES } from '../src/world/players';
import { DEFAULT_WORLD_PORT, type AuthRes, type ClientMsg, type ServerMsg } from '../src/net/protocol';
import type { ChatMessage } from '../src/world/types';

/**
 * The world server: one persistent world, a 5-second tick, a WebSocket per player.
 *   PORT (8787) · DATA_DIR (./world-data) · SEED (avalon) · TICK_MS (5000) · WARMUP_DAYS (63)
 *   ADMIN_TOKEN (enables POST /api/admin/advance for dev and tests)
 */
const PORT = Number(process.env.PORT ?? DEFAULT_WORLD_PORT);
const DATA_DIR = process.env.DATA_DIR ?? './world-data';
const SEED = process.env.SEED ?? 'avalon';
const TICK_MS = Number(process.env.TICK_MS ?? 5000);
const WARMUP_DAYS = Number(process.env.WARMUP_DAYS ?? 63);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const MAX_MSG = 16 * 1024;

const log = (m: string) => console.log(`[world ${new Date().toISOString()}] ${m}`);
const store = new Store(DATA_DIR);
const host = new WorldHost(store, { seed: SEED, tickMs: TICK_MS, warmupDays: WARMUP_DAYS, snapshotEvery: 60, log });
host.boot();

interface Conn { ws: WebSocket; pid: string | null; budget: number; last: number }
const conns = new Set<Conn>();

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > MAX_MSG) throw new Error('too large');
  }
  try { return JSON.parse(data || '{}'); } catch { return {}; }
}

/** crude per-IP limiter for account creation */
const registrations = new Map<string, number[]>();
function allowRegister(ip: string): boolean {
  const now = Date.now();
  const arr = (registrations.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (arr.length >= 20) return false;
  arr.push(now);
  registrations.set(ip, arr);
  return true;
}

const http = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, tick: host.g.market.tick, players: Object.keys(host.g.players).length, online: [...conns].filter((c) => c.pid).length });
    }
    if (req.method === 'POST' && url.pathname === '/api/register') {
      const b = await body(req);
      const handle = validHandle(String(b.handle ?? ''));
      const country = COUNTRIES.some((c) => c.code === b.country) ? String(b.country) : 'XX';
      if (!handle) return json(res, 400, { ok: false, error: 'Handle: 3–18 letters, digits, _ . -' } satisfies AuthRes);
      if (!allowRegister(req.socket.remoteAddress ?? '?')) return json(res, 429, { ok: false, error: 'Too many new accounts from here' } satisfies AuthRes);
      if (store.handleTaken(handle) || Object.values(host.g.players).some((p) => p.handle.toLowerCase() === handle.toLowerCase())) {
        return json(res, 409, { ok: false, error: 'That handle is taken' } satisfies AuthRes);
      }
      const id = `u_${randomUUID().slice(0, 12)}`;
      const r = host.command(id, { type: 'join', handle, country });
      if (!r.ok) return json(res, 400, { ok: false, error: r.error } satisfies AuthRes);
      const token = store.createAccount(id, handle);
      log(`new player ${handle} (${country})`);
      return json(res, 200, { ok: true, token, playerId: id, handle } satisfies AuthRes);
    }
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const b = await body(req);
      const r = store.login(String(b.handle ?? ''), String(b.password ?? ''));
      if (!r) return json(res, 401, { ok: false, error: 'Wrong handle or password' } satisfies AuthRes);
      return json(res, 200, { ok: true, token: r.token, playerId: r.id } satisfies AuthRes);
    }
    if (req.method === 'POST' && url.pathname === '/api/password') {
      const b = await body(req);
      const acct = store.accountForToken(String(b.token ?? ''));
      const pw = String(b.password ?? '');
      if (!acct) return json(res, 401, { ok: false, error: 'Not signed in' });
      if (pw.length < 8 || pw.length > 128) return json(res, 400, { ok: false, error: 'Password: 8 to 128 characters' });
      store.setPassword(acct.id, pw);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/grant') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      const p = Object.values(host.g.players).find((x) => x.handle.toLowerCase() === String(b.handle ?? '').toLowerCase());
      if (!p) return json(res, 404, { ok: false });
      return json(res, 200, host.command(p.id, { type: 'admin.grant', amount: Number(b.amount) || 0 }));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/advance') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const n = Math.max(1, Math.min(20_000, Number(url.searchParams.get('n') ?? 1)));
      host.advance(n);
      return json(res, 200, { ok: true, tick: host.g.market.tick });
    }
    json(res, 404, { ok: false });
  } catch (e) {
    log(`http error: ${(e as Error).message}`);
    json(res, 500, { ok: false, error: 'server error' });
  }
});

const wss = new WebSocketServer({ server: http, maxPayload: MAX_MSG });

wss.on('connection', (ws) => {
  const c: Conn = { ws, pid: null, budget: 30, last: Date.now() };
  conns.add(c);
  ws.on('message', (raw) => {
    // token bucket: 20 messages per second sustained, bursts of 30
    const now = Date.now();
    c.budget = Math.min(30, c.budget + ((now - c.last) / 1000) * 20);
    c.last = now;
    if (c.budget < 1) return send(ws, { t: 'error', message: 'Slow down' });
    c.budget -= 1;
    let msg: ClientMsg;
    try { msg = JSON.parse(String(raw)); } catch { return send(ws, { t: 'error', message: 'Bad message' }); }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'hello': {
        const acct = store.accountForToken(msg.token);
        if (!acct || !host.g.players[acct.id]) return send(ws, { t: 'error', message: 'auth' });
        c.pid = acct.id;
        host.command(acct.id, { type: 'presence', online: true });
        send(ws, {
          t: 'welcome', playerId: acct.id, seed: host.g.seed, tickMs: TICK_MS, frame: marketFrame(host.g, true),
          me: playerView(host.g, acct.id)!, pub: publicState(host.g), directory: directory(host.g), chat: chatFor(host.g, acct.id),
          serverTime: Date.now(),
        });
        return;
      }
      case 'cmd': {
        if (!c.pid) return send(ws, { t: 'error', message: 'auth' });
        const cmd = msg.cmd;
        if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string' || cmd.type === 'join' || cmd.type.startsWith('admin.') || cmd.type === 'presence') {
          return send(ws, { t: 'ack', id: msg.id, ok: false, error: 'bad command' });
        }
        const r = host.command(c.pid, cmd);
        send(ws, { t: 'ack', id: msg.id, ok: r.ok, ...(r.error ? { error: r.error } : {}), ...(r.data !== undefined ? { data: r.data } : {}), me: playerView(host.g, c.pid)! });
        // chat is delivered right away, not on the next tick
        if (cmd.type === 'chat.send' && r.ok) {
          const m = { ...(r.data as ChatMessage), channel: cmd.channel };
          for (const o of conns) if (o.pid && canSee(o.pid, cmd.channel)) send(o.ws, { t: 'chat', chat: [m] });
        }
        return;
      }
      case 'history':
        return send(ws, { t: 'history', id: msg.id, data: typeof msg.series === 'string' ? host.historyFor(msg.series) : null });
      case 'nw-history':
        if (!c.pid) return;
        return send(ws, { t: 'nw-history', id: msg.id, data: host.nwHistoryFor(c.pid) });
      case 'ping':
        return send(ws, { t: 'pong' });
    }
  });
  ws.on('close', () => {
    conns.delete(c);
    if (c.pid && ![...conns].some((o) => o.pid === c.pid)) host.command(c.pid, { type: 'presence', online: false });
  });
});

function canSee(pid: string, channel: string): boolean {
  const p = host.g.players[pid];
  if (!p) return false;
  if (channel === 'world') return true;
  if (channel.startsWith('country:')) return channel === `country:${p.country}`;
  if (channel.startsWith('alliance:')) return channel === `alliance:${p.allianceId}`;
  if (channel.startsWith('dm:')) return channel.split(':').includes(pid);
  return false;
}

host.onTick((out, publicTick) => {
  const frame = marketFrame(host.g, publicTick);
  const pub = publicTick ? publicState(host.g) : undefined;
  const dir = publicTick ? directory(host.g) : undefined;
  const chat = out.chat as (ChatMessage & { channel?: string })[];
  for (const c of conns) {
    if (!c.pid) continue;
    const me = playerView(host.g, c.pid);
    if (!me) continue;
    send(c.ws, {
      t: 'tick', frame, me, wire: out.wire, inbox: out.inbox[c.pid] ?? [],
      chat: chat.filter((m) => canSee(c.pid!, m.channel ?? 'world')).map((m) => ({ ...m, channel: m.channel ?? 'world' })),
      rankUps: out.rankUps, ...(pub ? { pub, directory: dir } : {}), serverTime: Date.now(),
    });
  }
});

http.listen(PORT, () => log(`listening on :${PORT} (tick ${TICK_MS} ms, data ${DATA_DIR})`));
host.start();

const shutdown = () => {
  log('saving and shutting down…');
  host.stop();
  store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
