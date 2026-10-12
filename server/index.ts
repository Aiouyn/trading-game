import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Store } from './db';
import { BACKUP_EVERY_MS, Backups } from './backup';
import { acquireLock } from './lock';
import { textConfigFromEnv } from './text/config';
import { TextEnricher } from './text/enricher';
import { enrichItemOf } from './text/facts';
import { WorldHost } from './host';
import { chatFor, configSeq, directory, directoryFor, marketFrame, playerView, publicState, topDirectory } from '../src/world/view';
import { lpPageOf } from '../src/world/launchpad/view';
import { visitView } from '../src/world/home';
import { DepthWire, ListWire, ShortInterestWire, welcomeJson, welcomeShortInterest } from './wire';
import { TournamentJob } from './tournamentJob';
import { TOURNAMENT_SYSTEM } from '../src/world/tournamentWeek';
import { validHandle, COUNTRIES } from '../src/world/players';
import { freshWorldSeed } from '../src/world/seed';
import { DEFAULT_WORLD_PORT, type AuthRes, type ClientMsg, type ServerMsg } from '../src/net/protocol';
import type { ChatMessage } from '../src/world/types';

/**
 * The world server: one persistent world, a 5-second tick, a WebSocket per player.
 *   PORT (8787) · DATA_DIR (./world-data) · SEED (random at first boot, then kept in the database) · TICK_MS (5000) · WARMUP_DAYS (63)
 *   ADMIN_TOKEN (enables POST /api/admin/advance for dev and tests)
 *   Backups: DATA_DIR/backups, hourly and at shutdown (server/backup.ts). The data folder is locked while the server runs (server/lock.ts).
 */
const PORT = Number(process.env.PORT ?? DEFAULT_WORLD_PORT);
const DATA_DIR = process.env.DATA_DIR ?? './world-data';
const TICK_MS = Number(process.env.TICK_MS ?? 5000);
const WARMUP_DAYS = Number(process.env.WARMUP_DAYS ?? 63);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const MAX_MSG = 16 * 1024;
/** new accounts per IP per hour (raise it for load tests) */
const REGISTER_LIMIT = Number(process.env.REGISTER_LIMIT ?? 20);

const log = (m: string) => console.log(`[world ${new Date().toISOString()}] ${m}`);
// one world per data folder: a second server (or a restore) on the same folder would corrupt the replay
let releaseLock: () => void;
try {
  releaseLock = acquireLock(DATA_DIR);
} catch (e) {
  console.error(`[world] ${(e as Error).message}`);
  process.exit(1);
}
const store = new Store(DATA_DIR);
/** an explicit SEED (tests, e2e, a dev world) wins; otherwise the live world keeps the random seed drawn at its first boot */
const SEED = process.env.SEED ?? store.worldSeed(freshWorldSeed);
const host = new WorldHost(store, { seed: SEED, tickMs: TICK_MS, warmupDays: WARMUP_DAYS, snapshotEvery: 60, log });
host.boot();
/** the world's backups: hourly (between ticks, see the timer below) and at shutdown */
const backups = new Backups(host, store.db, join(DATA_DIR, 'world.db'), join(DATA_DIR, 'backups'), log);
/** the asset list wire: the version the tick stream last sent, and the cached defs (see server/wire.ts) */
const listWire = new ListWire(host.g);
/** the weekly tournament settlement: a due week runs in a child process and comes back as a logged settle command */
const tournamentJob = new TournamentJob(
  (week, seeds, rows) => {
    const r = host.command(TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds, rows });
    if (!r.ok) log(`tournament week ${week} settle refused: ${r.error}`);
  },
  log,
);
/** the public short interest on the tick stream: slow cadence, sent on change (see server/wire.ts) */
const shortInterest = new ShortInterestWire();
/** the order depth of the latest closed day, on the tick that closed it and in every welcome (see server/wire.ts DepthWire) */
const depthWire = new DepthWire();
/** the model text slot (server/text): off unless TEXT_PROVIDER=claude and ANTHROPIC_API_KEY are set; its overlay is presentation only */
const textEnricher = new TextEnricher(textConfigFromEnv(), store);

/** textSeq: the model overlay version this connection was last sent (its welcome, then each tick's lines after it) */
interface Conn { ws: WebSocket; pid: string | null; budget: number; last: number; textSeq: number }
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
  if (arr.length >= REGISTER_LIMIT) return false;
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
      // the browser's device id is hashed here and only the hash goes into the world (collusion.ts), never the raw id
      const rawDevice = typeof b.device === 'string' ? b.device.slice(0, 128) : '';
      const device = rawDevice.length >= 16 ? createHash('sha256').update(`device|${rawDevice}`).digest('hex') : undefined;
      const r = host.command(id, { type: 'join', handle, country, ...(device ? { device } : {}) });
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
    if (req.method === 'POST' && url.pathname === '/api/admin/age') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      const p = Object.values(host.g.players).find((x) => x.handle.toLowerCase() === String(b.handle ?? '').toLowerCase());
      if (!p) return json(res, 404, { ok: false });
      return json(res, 200, host.command(p.id, { type: 'admin.age', playerId: p.id, ticks: Number(b.ticks) || 0 }));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/ipo-ready') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      const p = Object.values(host.g.players).find((x) => x.handle.toLowerCase() === String(b.handle ?? '').toLowerCase());
      if (!p) return json(res, 404, { ok: false });
      return json(res, 200, host.command(p.id, { type: 'admin.ipoReady', playerId: p.id }));
    }
    if (req.method === 'POST' && (url.pathname === '/api/admin/filed-late' || url.pathname === '/api/admin/launch-credit')) {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      const p = Object.values(host.g.players).find((x) => x.handle.toLowerCase() === String(b.handle ?? '').toLowerCase());
      if (!p) return json(res, 404, { ok: false });
      const cmd = url.pathname === '/api/admin/filed-late'
        ? { type: 'admin.filedLate' as const, playerId: p.id }
        : { type: 'admin.launchCredit' as const, playerId: p.id, score: Number(b.score) };
      return json(res, 200, host.command(p.id, cmd));
    }
    if (req.method === 'POST' && (url.pathname === '/api/admin/tip' || url.pathname === '/api/admin/inquiry')) {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      const p = Object.values(host.g.players).find((x) => x.handle.toLowerCase() === String(b.handle ?? '').toLowerCase());
      if (!p) return json(res, 404, { ok: false });
      const assetId = String(b.assetId ?? '');
      const cmd = url.pathname === '/api/admin/tip'
        ? { type: 'admin.tip' as const, playerId: p.id, assetId }
        : { type: 'admin.inquiry' as const, playerId: p.id, assetId };
      return json(res, 200, host.command(p.id, cmd));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/shock') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      return json(res, 200, host.command('admin', { type: 'admin.shock', assetId: String(b.assetId ?? ''), pct: Number(b.pct) }));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/event') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      const days = b.days === undefined ? undefined : Number(b.days);
      return json(res, 200, host.command('admin', { type: 'admin.event', kind: String(b.kind ?? '') as 'crash', ...(days !== undefined ? { days } : {}) }));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/lp-fill') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      return json(res, 200, host.command('admin', { type: 'admin.lpFill', ticker: String(b.ticker ?? '') }));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/streak-accent') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      const p = Object.values(host.g.players).find((x) => x.handle.toLowerCase() === String(b.handle ?? '').toLowerCase());
      if (!p) return json(res, 404, { ok: false });
      return json(res, 200, host.command(p.id, { type: 'admin.streakAccent', playerId: p.id, accent: String(b.accent ?? '') }));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/auction-open') {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      const b = await body(req);
      const week = b.week === undefined ? undefined : Number(b.week);
      const ticksLeft = b.ticksLeft === undefined ? undefined : Number(b.ticksLeft);
      return json(res, 200, host.command('admin', { type: 'admin.auctionOpen', ...(week !== undefined ? { week } : {}), ...(ticksLeft !== undefined ? { ticksLeft } : {}) }));
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/text') {
      // the model text readout: calls, cache hits, rejects by reason, spend today and the cap (admin token only)
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 403, { ok: false });
      return json(res, 200, { ok: true, ...textEnricher.readout() });
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
  const c: Conn = { ws, pid: null, budget: 30, last: Date.now(), textSeq: 0 };
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
        const shared = publicCache();
        const dir = shared.topJson ?? JSON.stringify(directoryFor(host.g, shared.all, shared.top, acct.id));
        // the welcome carries every kept overlay line, so this connection's cursor starts at the current version
        if (textEnricher.enabled) c.textSeq = textEnricher.version();
        ws.send(welcomeJson({
          playerId: acct.id, tickMs: TICK_MS, frameJson: shared.frameJson, defsJson: listWire.defsJson(host.g),
          meJson: JSON.stringify(playerView(host.g, acct.id)), pubJson: shared.pubJson, directoryJson: dir,
          chatJson: JSON.stringify(chatFor(host.g, acct.id)), serverTime: Date.now(),
          ...(textEnricher.enabled ? { textOverlayJson: JSON.stringify(textEnricher.overlay()) } : {}),
        }));
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
      case 'lp-page':
        if (!c.pid) return;
        // a bad ticker must never take the process down: the page is read in a guard, and a failure answers with no page
        try {
          return send(ws, { t: 'lp-page', id: msg.id, data: lpPageOf(host.g, c.pid, String(msg.ticker ?? '')) });
        } catch (e) {
          log(`lp-page error: ${(e as Error).message}`);
          return send(ws, { t: 'lp-page', id: msg.id, data: null });
        }
      case 'visit': {
        // another player's home room and collection: each is null unless its owner has opened it (no note that anything is hidden)
        // an unauthenticated socket gets the null answer too, so the client's request always settles
        if (!c.pid) return send(ws, { t: 'visit', id: msg.id, data: null });
        const owner = typeof msg.playerId === 'string' ? msg.playerId : '';
        if (!host.g.players[owner]) return send(ws, { t: 'visit', id: msg.id, data: null });
        return send(ws, { t: 'visit', id: msg.id, data: visitView(host.g, c.pid, owner) });
      }
      case 'ping':
        return send(ws, { t: 'pong' });
    }
  });
  ws.on('close', () => {
    conns.delete(c);
    if (c.pid && ![...conns].some((o) => o.pid === c.pid)) host.command(c.pid, { type: 'presence', online: false });
  });
});

/** Public state, directory and the full market frame, built at most once per tick and shared by every welcome. */
let pubCache: { tick: number; cfgSeq: number; pubJson: string; all: ReturnType<typeof directory>; top: ReturnType<typeof directory>; topJson: string | null; frameJson: string } | null = null;
function publicCache() {
  // keyed by the asset list version too, so a welcome's frame and defs always describe the same list
  if (!pubCache || pubCache.tick !== host.g.market.tick || pubCache.cfgSeq !== configSeq(host.g)) {
    const all = directory(host.g);
    const top = topDirectory(all);
    const depth = depthWire.frame(host.g);
    pubCache = {
      tick: host.g.market.tick, cfgSeq: configSeq(host.g), pubJson: JSON.stringify(publicState(host.g)), all, top,
      topJson: all.length <= top.length ? JSON.stringify(top) : null,
      frameJson: JSON.stringify({ ...marketFrame(host.g, true), shortInterest: welcomeShortInterest(host.g), ...(depth ? { depth } : {}) }),
    };
  }
  return pubCache;
}

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
  // the weekly tournament's settlement runs off the tick loop: a due week is checked every 60 ticks (5 real minutes), and its
  // rows come back as a logged command (server/tournamentJob.ts)
  if (host.g.market.tick % 60 === 0) tournamentJob.check(host.g);
  // the asset list moves on an IPO, a delisting or a spin-off: the frame of that tick carries it once. Clients connected
  // since then got it in their welcome, so a normal tick carries only the small cfgSeq.
  // shared parts are serialized once per tick, not once per socket
  const frame = listWire.tickFrame(host.g, publicTick);
  const si = shortInterest.due(host.g);
  const dep = depthWire.due(host.g);
  const frameJson = JSON.stringify({ ...frame, ...(si ? { shortInterest: si } : {}), ...(dep ? { depth: dep } : {}) });
  const wireJson = JSON.stringify(out.wire);
  const rankJson = JSON.stringify(out.rankUps);
  const pubJson = publicTick ? JSON.stringify(publicState(host.g)) : null;
  const all = publicTick ? directory(host.g) : null;
  const top = all ? topDirectory(all) : null;
  const topJson = top && all!.length <= top.length ? JSON.stringify(top) : null;
  const chat = out.chat as (ChatMessage & { channel?: string })[];
  // the model text slot: this tick's new items are offered (never inside the step), and the overlay lines that landed since the last tick go out
  // the handles of every player are passed too, so an item that names one (of any player) is never offered
  if (textEnricher.enabled && out.wire.length > 0) {
    const handles = new Set(Object.values(host.g.players).map((p) => p.handle));
    for (const w of out.wire) {
      const item = enrichItemOf(w, handles);
      if (item) textEnricher.offer(item);
    }
  }
  const now = Date.now();
  for (const c of conns) {
    if (!c.pid || c.ws.readyState !== c.ws.OPEN) continue;
    const me = playerView(host.g, c.pid);
    if (!me) continue;
    // each connection gets the overlay lines that landed after its own cursor, so a line is never lost to a socket that was skipped
    const overlayDelta = textEnricher.enabled ? textEnricher.since(c.textSeq) : null;
    if (textEnricher.enabled) c.textSeq = textEnricher.version();
    const overlayPart = overlayDelta ? `,"textOverlay":${JSON.stringify(overlayDelta)}` : '';
    const myChat = chat.filter((m) => canSee(c.pid!, m.channel ?? 'world')).map((m) => ({ ...m, channel: m.channel ?? 'world' }));
    let extra = '';
    if (pubJson) extra = `,"pub":${pubJson},"directory":${topJson ?? JSON.stringify(directoryFor(host.g, all!, top!, c.pid))}`;
    c.ws.send(`{"t":"tick","frame":${frameJson},"me":${JSON.stringify(me)},"wire":${wireJson},"inbox":${JSON.stringify(out.inbox[c.pid] ?? [])},"chat":${JSON.stringify(myChat)},"rankUps":${rankJson}${extra}${overlayPart},"serverTime":${now}}`);
  }
});

const hourly = setInterval(() => {
  try { backups.take('hourly'); } catch (e) { log(`backup failed: ${(e as Error).message}`); }
}, BACKUP_EVERY_MS);

http.listen(PORT, undefined, 4096, () => log(`listening on :${PORT} (tick ${TICK_MS} ms, data ${DATA_DIR})`));
host.start();

const shutdown = () => {
  log('saving and shutting down…');
  clearInterval(hourly);
  host.stop(); // saves the world at its tick
  try { backups.take('shutdown'); } catch (e) { log(`shutdown backup failed: ${(e as Error).message}`); }
  store.close();
  releaseLock();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
