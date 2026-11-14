// Screens: node sim/server.ts --load worlds/7
// One process, the world, and the static files in ui/. No install and no build.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { World } from './kernel/index.ts';
import { openWorld } from './run.ts';
import { applySnapshot, snapshotSeed } from './modules/history/save.ts';
import { knows } from './modules/social/index.ts';
import { DEP, type EconState, type Firm } from './modules/economy/index.ts';
import { GOODS } from './modules/economy/content.ts';
import { act, ensurePlayer, playerIndex, view, type Command, type PlayerState } from './modules/player/index.ts';

type Speed = 'pause' | 'day' | 'week' | 'month';

interface Bar { o: number; h: number; l: number; c: number; v: number }
interface Stock {
  instr: string; issuer: string; last: number; prev: number; vol: number; hist: Bar[];
}
interface FactRow {
  id: number; eventId: number; day: number; msg: string; pub: boolean; drop: boolean; firms: number[];
}
interface Pt { day: number; v: number; eventId: number }
interface Macro {
  unemployment: Pt[];
  inflation: Pt[];
  policy: Pt[];
  fx: Pt[];
  index: Pt[];
}
interface DayHit { jobs?: number; cpi?: number; rate?: number; fx?: number; mkt?: number }

const arg = (k: string, d: string): string => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const UI = fileURLToPath(new URL('../ui/', import.meta.url));
const DEG = 16;
const B_FRIEND = 3;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const econ = (w: World): EconState => w.state.economy as EconState;
const stocksOf = (w: World): Stock[] => (w.state.markets as { stocks?: Stock[] } | undefined)?.stocks ?? [];

function daysFor(speed: Speed): number {
  switch (speed) {
    case 'pause': return 0;
    case 'day': return 1;
    case 'week': return 7;
    case 'month': return 30;
    default: {
      const never: never = speed;
      return never;
    }
  }
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function whole(n: unknown, min: number): number | undefined {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min) return;
  return n;
}

function commandOf(body: unknown): Command | string {
  if (!body || typeof body !== 'object') return 'missing command';
  const b = body as Record<string, unknown>;
  switch (b.kind) {
    case 'order': {
      const side = b.side;
      if (side !== 'buy' && side !== 'sell' && side !== 'short') return 'side must be buy, sell or short';
      if (typeof b.instr !== 'string' || !b.instr) return 'order needs a symbol';
      const qty = whole(b.qty, 1);
      if (qty === undefined) return 'qty must be a positive integer';
      const cmd: Command = { kind: 'order', side, instr: b.instr, qty };
      if (b.limit !== undefined) {
        const limit = whole(b.limit, 1);
        if (limit === undefined) return 'limit must be a positive integer price in cents';
        cmd.limit = limit;
      }
      return cmd;
    }
    case 'cancel': {
      const orderId = whole(b.orderId, 0);
      if (orderId === undefined) return 'cancel needs an order id';
      return { kind: 'cancel', orderId };
    }
    case 'bond': {
      if (b.side !== 'buy' && b.side !== 'sell') return 'bond side must be buy or sell';
      if (typeof b.tenor !== 'string' || !b.tenor) return 'bond needs a tenor';
      const bonds = whole(b.bonds, 1);
      if (bonds === undefined) return 'qty is a number of bonds';
      const cmd: Command = { kind: 'bond', side: b.side, tenor: b.tenor, bonds };
      if (b.limit !== undefined) {
        const limit = whole(b.limit, 1);
        if (limit === undefined) return 'limit must be a positive integer price in cents';
        cmd.limit = limit;
      }
      return cmd;
    }
    case 'fut': {
      if (b.side !== 'long' && b.side !== 'short' && b.side !== 'flat') return 'future side must be long, short or flat';
      if (typeof b.good !== 'string' || !b.good) return 'future needs a good';
      const qty = b.side === 'flat' ? 0 : whole(b.qty, 1);
      if (qty === undefined) return 'qty is a number of contracts';
      const months = whole(b.months, 0);
      if (months === undefined) return 'month must be 0 to 5';
      return { kind: 'fut', side: b.side, good: b.good, qty, months };
    }
    case 'coin': {
      if (b.side !== 'buy' && b.side !== 'sell') return 'coin side must be buy or sell';
      if (typeof b.coin !== 'string' || !b.coin) return 'coin needs a name';
      const qty = whole(b.qty, 1);
      if (qty === undefined) return 'qty must be a positive integer';
      const cmd: Command = { kind: 'coin', side: b.side, coin: b.coin, qty };
      if (b.limit !== undefined) {
        const limit = whole(b.limit, 1);
        if (limit === undefined) return 'limit must be a positive integer price in cents';
        cmd.limit = limit;
      }
      return cmd;
    }
    case 'launch': return { kind: 'launch' };
    case 'cash': {
      if (b.op !== 'deposit' && b.op !== 'withdraw' && b.op !== 'borrow' && b.op !== 'repay') return 'cash op must be deposit, withdraw, borrow or repay';
      const cents = whole(b.cents, 1);
      if (cents === undefined) return 'amount must be a positive number of cents';
      return { kind: 'cash', op: b.op, cents };
    }
    case 'talk': {
      const slot = whole(b.slot, 0);
      if (slot === undefined) return 'talk needs a contact slot';
      return { kind: 'talk', slot };
    }
    case 'ask': {
      const slot = whole(b.slot, 0);
      if (slot === undefined) return 'ask needs a contact slot';
      if (typeof b.firm !== 'string') return 'ask needs a firm';
      return { kind: 'ask', slot, firm: b.firm };
    }
    case 'news': return { kind: 'news' };
    case 'why': {
      const id = whole(b.id, 0);
      if (id === undefined) return 'why needs an event id';
      return { kind: 'why', id };
    }
    case 'wait': {
      const days = whole(b.days, 1);
      if (days === undefined) return 'wait needs a length of time';
      if (days > 360) return 'wait at most one year at a time';
      return { kind: 'wait', days };
    }
    case 'found': {
      if (typeof b.name !== 'string' || b.name.trim().length < 2) return 'found needs a name';
      if (typeof b.sector !== 'string' || !b.sector) return 'found needs a sector';
      const cents = b.cents === undefined ? 0 : whole(b.cents, 0);
      if (cents === undefined) return 'cash must be a number of cents';
      return { kind: 'found', name: b.name, sector: b.sector, cents, loan: b.loan === true };
    }
    case 'ceo': {
      if (typeof b.firm !== 'string' || !b.firm) return 'ceo needs a firm';
      if (b.op !== 'report' && b.op !== 'price' && b.op !== 'hires' && b.op !== 'dividend' && b.op !== 'invest') return 'ceo op must be report, price, hires, dividend or invest';
      const cmd: Command = { kind: 'ceo', firm: b.firm, op: b.op, auto: b.auto === true };
      if (b.value !== undefined) {
        const value = Number(b.value);
        if (!Number.isFinite(value) || value < 0) return 'value must be a number';
        cmd.value = value;
      }
      return cmd;
    }
    case 'ipo': {
      if (typeof b.firm !== 'string' || !b.firm) return 'ipo needs a firm';
      const fraction = Number(b.fraction);
      if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 0.9) return 'fraction is the part of your stake you sell';
      return { kind: 'ipo', firm: b.firm, fraction };
    }
    case 'bid': {
      if (typeof b.firm !== 'string' || !b.firm) return 'bid needs a firm';
      const cents = b.cents === undefined ? 0 : whole(b.cents, 0);
      const multiple = Number(b.multiple ?? 0);
      if (cents === undefined || !Number.isFinite(multiple) || multiple < 0) return 'bid needs a price';
      return { kind: 'bid', firm: b.firm, cents, multiple, paper: b.paper === true };
    }
    case 'board': {
      if (b.op !== 'list' && b.op !== 'chief' && b.op !== 'merge' && b.op !== 'sell') return 'board op must be list, chief, merge or sell';
      const cmd: Command = { kind: 'board', op: b.op };
      if (typeof b.firm === 'string') cmd.firm = b.firm;
      if (b.slot !== undefined) {
        const slot = whole(b.slot, 0);
        if (slot === undefined) return 'slot is a contact number';
        cmd.slot = slot;
      }
      if (typeof b.into === 'string') cmd.into = b.into;
      return cmd;
    }
    default: return 'unknown command';
  }
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer) => {
      n += c.length;
      if (n > 1_000_000) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!n) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('body is not json')); }
    });
    req.on('error', reject);
  });
}

function findFirm(w: World, key: string): Firm | undefined {
  const k = key.toLowerCase().replace(/^eq:/, '');
  for (const f of econ(w).firms) {
    const bare = f.id.startsWith('frm_') ? f.id.slice(4) : f.id;
    if (f.id.toLowerCase() === k || bare === k || f.name.toLowerCase() === k) return f;
  }
  return undefined;
}

function symbolOf(instr: string): string {
  if (instr === 'eq:bank_1') return 'BANK';
  if (instr.startsWith('eq:frm_')) return instr.slice(7).toUpperCase();
  return instr;
}

function issuerName(w: World, issuer: string): string {
  if (issuer === 'bank_1') return 'the bank';
  return findFirm(w, issuer)?.name ?? issuer;
}

function session(st: Stock): { px: number; prev: number; vol: number } {
  const moved = st.vol > 0 || st.last !== st.prev;
  if (moved) return { px: st.last, prev: st.prev > 0 ? st.prev : st.last, vol: st.vol };
  const h = st.hist;
  if (h.length >= 2) {
    const c = h[h.length - 1].c;
    const p = h[h.length - 2].c;
    return { px: c, prev: p > 0 ? p : c, vol: h[h.length - 1].v };
  }
  return { px: st.last, prev: st.prev > 0 ? st.prev : st.last, vol: st.vol };
}

function yoyOf(s: EconState): number {
  const h = s.cpiHist;
  if (h.length < 13 || !(h[h.length - 13] > 0)) return 0;
  return h[h.length - 1] / h[h.length - 13] - 1;
}

interface Rel { slot: number; who: number; familiarity: number; trust: number; friendship: number; kind: string }

function relations(w: World, person: number): Rel[] {
  const st = w.state.social as { contact?: Int32Array; fam?: Uint16Array; trust?: Uint8Array; bond?: Uint8Array; kind?: Uint8Array } | undefined;
  if (!st?.contact || person < 0) return [];
  const out: Rel[] = [];
  const b = person * DEG;
  for (let k = 0; k < DEG; k++) {
    const who = st.contact[b + k];
    if (who < 0) continue;
    const q = (b + k) * 4;
    out.push({
      slot: k,
      who,
      familiarity: st.fam?.[b + k] ?? 0,
      trust: st.trust?.[b + k] ?? 0,
      friendship: st.bond?.[q + B_FRIEND] ?? 0,
      kind: st.kind?.[b + k] === 1 ? 'family' : 'work',
    });
  }
  return out;
}

interface ChainLine {
  depth: number; id: number; day: number; kind: string; actor?: string;
  person?: number; firm?: string; name?: string; msg: string; exo: boolean; missing?: boolean; again?: boolean;
}

function chain(w: World, id: number, maxDepth = 8): ChainLine[] {
  const out: ChainLine[] = [];
  const seen = new Set<number>();
  const firms = econ(w).firms;
  const byId = new Map(firms.map((f) => [f.id, f]));
  const P = econ(w).P;
  const walk = (i: number, d: number): void => {
    const e = w.events.get(i);
    if (!e) {
      out.push({ depth: d, id: i, day: -1, kind: 'gone', msg: `event ${i} is older than the log keeps`, exo: false, missing: true });
      return;
    }
    const again = seen.has(i);
    let person: number | undefined;
    let firm: string | undefined;
    let name: string | undefined;
    if (e.actor?.startsWith('p_')) {
      const n = +e.actor.slice(2);
      if (Number.isInteger(n) && n >= 0 && n < P.n) { person = n; name = P.name(n); }
    } else if (e.actor === 'bank_1') { firm = 'bank_1'; name = 'the bank'; }
    else if (e.actor) {
      const f = byId.get(e.actor);
      if (f) { firm = f.id; name = f.name; }
    }
    out.push({
      depth: d, id: e.id, day: e.day, kind: e.kind, actor: e.actor, person, firm, name, msg: e.msg, exo: e.exo, again,
    });
    if (again || d >= maxDepth) return;
    seen.add(i);
    for (const c of e.causes) walk(c, d + 1);
  };
  walk(id, 0);
  return out;
}

function firstEvent(w: World): number {
  let lo = 0, hi = w.events.count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (w.events.get(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function grab(re: RegExp, msg: string): number | undefined {
  const m = re.exec(msg);
  if (!m) return;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

let byDay = new Map<number, DayHit>();
const macro: Macro = { unemployment: [], inflation: [], policy: [], fx: [], index: [] };

function noteDay(day: number, key: keyof DayHit, id: number): void {
  let hit = byDay.get(day);
  if (!hit) { hit = {}; byDay.set(day, hit); }
  hit[key] = id;
}

function near(day: number, key: keyof DayHit, radius: number): number | undefined {
  for (let d = 0; d <= radius; d++) {
    const a = byDay.get(day + d)?.[key];
    if (a !== undefined) return a;
    if (d) {
      const b = byDay.get(day - d)?.[key];
      if (b !== undefined) return b;
    }
  }
  return undefined;
}

function pushPt(arr: Pt[], p: Pt): void {
  const last = arr[arr.length - 1];
  if (last && last.day === p.day) arr[arr.length - 1] = p;
  else if (!last || p.day > last.day) arr.push(p);
}

function buildMacro(w: World): void {
  byDay = new Map();
  macro.unemployment = [];
  macro.inflation = [];
  macro.policy = [];
  macro.fx = [];
  macro.index = [];
  const root = (w.state.markets as { root?: number } | undefined)?.root ?? w.genesis;
  for (let id = firstEvent(w); id < w.events.count; id++) {
    const e = w.events.get(id);
    if (!e) continue;
    if (e.kind === 'macro.jobs') {
      noteDay(e.day, 'jobs', e.id);
      const v = grab(/unemployment\s+([\d.]+)%/, e.msg);
      if (v !== undefined) pushPt(macro.unemployment, { day: e.day, v, eventId: e.id });
    } else if (e.kind === 'macro.cpi') {
      noteDay(e.day, 'cpi', e.id);
      const v = grab(/([\d.]+)% on the year/, e.msg);
      if (v !== undefined) pushPt(macro.inflation, { day: e.day, v, eventId: e.id });
    } else if (e.kind === 'cb.rate') {
      noteDay(e.day, 'rate', e.id);
      const v = grab(/->\s*([\d.]+)%/, e.msg) ?? grab(/policy rate\s+([\d.]+)%/, e.msg);
      if (v !== undefined) pushPt(macro.policy, { day: e.day, v, eventId: e.id });
    } else if (e.kind === 'fx.rate') {
      noteDay(e.day, 'fx', e.id);
      const v = grab(/(?:at|to)\s+([\d.]+)/, e.msg);
      if (v !== undefined) pushPt(macro.fx, { day: e.day, v, eventId: e.id });
    } else if (e.kind === 'mkt.move') noteDay(e.day, 'mkt', e.id);
  }
  const s = econ(w);
  const hist = s.cpiHist;
  // Month-end prints live in cpiHist for the whole run. The event log has dropped the early ones.
  if (hist.length >= 13) {
    macro.inflation = [];
    for (let i = 12; i < hist.length; i++) {
      const base = hist[i - 12];
      if (!(base > 0)) continue;
      const day = i * 30 - 1;
      // A month whose print has aged out of the log still charts. Its chain is the founding, not a later print.
      const eventId = near(day, 'cpi', 30) ?? w.genesis;
      pushPt(macro.inflation, { day, v: (hist[i] / base - 1) * 100, eventId });
    }
  }
  const list = stocksOf(w);
  const n = list.length ? Math.min(...list.map((st) => st.hist.length)) : 0;
  const mkt = w.state.markets as { index?: number; baseCap?: number; root?: number } | undefined;
  const base = mkt?.baseCap || 1;
  if (n > 0) {
    const shares = list.map((st) => w.ledger.issued.get(st.instr) ?? 1_000_000);
    const origin = w.day - n;
    const step = Math.max(1, Math.floor(n / 480));
    for (let i = 0; i < n; i += step) {
      let cap = 0;
      for (let sIdx = 0; sIdx < list.length; sIdx++) cap += list[sIdx].hist[i].c * shares[sIdx];
      const day = origin + i;
      const eventId = near(day, 'mkt', step) ?? near(day, 'cpi', step) ?? root;
      pushPt(macro.index, { day, v: 100 * cap / base, eventId });
    }
  }
  sampleMacro(w);
}

function sampleMacro(w: World): void {
  const s = econ(w);
  const abroad = w.state.abroad as { mid?: number; rateEv?: number } | undefined;
  const mkt = w.state.markets as { index?: number; root?: number } | undefined;
  const jobs = w.events.last('macro.jobs') ?? s.macroEv ?? w.genesis;
  const cpi = w.events.last('macro.cpi') ?? s.macroEv ?? w.genesis;
  const rate = w.events.last('cb.rate') ?? s.rateEv ?? w.genesis;
  const fxEv = abroad?.rateEv ?? w.genesis;
  const idxEv = w.events.last('mkt.move') ?? mkt?.root ?? w.genesis;
  const day = Math.max(0, w.day - 1);
  pushPt(macro.unemployment, { day, v: s.unemployment * 100, eventId: jobs });
  pushPt(macro.inflation, { day, v: yoyOf(s) * 100, eventId: cpi });
  pushPt(macro.policy, { day, v: s.policyRate * 100, eventId: rate });
  if (finite(abroad?.mid)) pushPt(macro.fx, { day, v: abroad.mid, eventId: fxEv });
  if (finite(mkt?.index)) pushPt(macro.index, { day, v: mkt.index, eventId: idxEv });
}

let bandDay = -1;
let bandEdges: number[] = [0, 0, 0, 0];

function wealthEdges(w: World): number[] {
  if (bandDay === w.day) return bandEdges;
  const s = econ(w), P = s.P;
  const owed = (w.state.banking as { owed?: Float64Array } | undefined)?.owed;
  const list = stocksOf(w);
  const slotOf = new Int32Array(Math.max(1, w.ledger.ids.length));
  slotOf.fill(-1);
  const vals: number[] = [];
  const worth = new Float64Array(P.n);
  for (let i = 0; i < P.n; i++) {
    if (!P.alive(i)) continue;
    const slot = P.slot[i];
    if (slot >= 0 && slot < slotOf.length) slotOf[slot] = i;
    let n = slot >= 0 ? w.ledger.balS(slot, DEP) : 0;
    if (owed && i < owed.length) n -= owed[i];
    worth[i] = n;
  }
  for (const st of list) {
    let holders: ReadonlyMap<number, number>;
    try { holders = w.ledger.holdersS(st.instr); }
    catch { continue; }
    for (const [slot, qty] of holders) {
      if (!(qty > 0) || slot < 0 || slot >= slotOf.length) continue;
      const person = slotOf[slot];
      if (person >= 0) worth[person] += qty * st.last;
    }
  }
  for (let i = 0; i < P.n; i++) if (P.alive(i)) vals.push(worth[i]);
  vals.sort((a, b) => a - b);
  const q = (p: number): number => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * (vals.length - 1)))] : 0;
  bandEdges = [q(0.2), q(0.4), q(0.6), q(0.8)];
  bandDay = w.day;
  return bandEdges;
}

function wealthOf(w: World, i: number): number {
  const P = econ(w).P;
  const slot = P.slot[i];
  let n = slot >= 0 ? w.ledger.balS(slot, DEP) : 0;
  const owed = (w.state.banking as { owed?: Float64Array } | undefined)?.owed;
  if (owed && i < owed.length) n -= owed[i];
  for (const st of stocksOf(w)) {
    if (slot < 0) break;
    const q = w.ledger.balS(slot, st.instr);
    if (q) n += q * st.last;
  }
  return n;
}

function bandOf(cents: number, edges: number[]): string {
  if (cents <= edges[0]) return 'strained';
  if (cents <= edges[1]) return 'thin';
  if (cents <= edges[2]) return 'modest';
  if (cents <= edges[3]) return 'comfortable';
  return 'wealthy';
}

function moodWord(n: number): string {
  if (n < 25) return 'bleak';
  if (n < 45) return 'low';
  if (n < 65) return 'steady';
  if (n < 85) return 'bright';
  return 'high';
}

function quotesOf(w: World): { instr: string; symbol: string; name: string; issuer: string; px: number; prev: number; chg: number; vol: number; eventId: number }[] {
  const root = (w.state.markets as { root?: number } | undefined)?.root ?? w.genesis;
  return stocksOf(w).map((st) => {
    const ses = session(st);
    return {
      instr: st.instr,
      symbol: symbolOf(st.instr),
      name: issuerName(w, st.issuer),
      issuer: st.issuer,
      px: ses.px,
      prev: ses.prev,
      chg: ses.prev > 0 ? ses.px / ses.prev - 1 : 0,
      vol: ses.vol,
      eventId: root,
    };
  });
}

function indexPair(w: World): { index: number; prev: number; eventId: number } {
  const mkt = w.state.markets as { index?: number; baseCap?: number; root?: number } | undefined;
  const list = stocksOf(w);
  const base = mkt?.baseCap || 1;
  let now = 0, prev = 0;
  for (const st of list) {
    const sh = w.ledger.issued.get(st.instr) ?? 1_000_000;
    const ses = session(st);
    now += ses.px * sh;
    prev += ses.prev * sh;
  }
  return {
    index: list.length ? 100 * now / base : (mkt?.index ?? 0),
    prev: list.length ? 100 * prev / base : (mkt?.index ?? 0),
    eventId: w.events.last('mkt.move') ?? mkt?.root ?? w.genesis,
  };
}

function closes(st: Stock, today: number, span: boolean): { day: number; px: number; vol?: number }[] {
  const h = st.hist;
  const n = h.length;
  if (!n) return [{ day: today, px: st.last, vol: st.vol }];
  const origin = today - n;
  const out: { day: number; px: number; vol?: number }[] = [];
  if (span) {
    const step = Math.max(1, Math.ceil(n / 480));
    for (let i = 0; i < n; i += step) out.push({ day: origin + i, px: h[i].c });
    const lastDay = origin + n - 1;
    if (out[out.length - 1].day !== lastDay) out.push({ day: lastDay, px: h[n - 1].c });
  } else {
    const start = Math.max(0, n - 360);
    for (let i = start; i < n; i++) out.push({ day: origin + i, px: h[i].c, vol: h[i].v });
  }
  if (st.vol > 0 || st.last !== st.prev) out.push({ day: today, px: st.last, vol: st.vol });
  return out;
}

function firmNews(w: World, firmIdx: number): { eventId: number; day: number; text: string; private: boolean; from?: string; fromIndex?: number }[] {
  const facts = (w.state.social as { facts?: FactRow[] } | undefined)?.facts ?? [];
  const P = econ(w).P;
  const me = playerIndex(w);
  const heard = (w.state.player as PlayerState | undefined)?.heard ?? [];
  const out: { eventId: number; day: number; text: string; private: boolean; from?: string; fromIndex?: number }[] = [];
  for (let i = facts.length - 1; i >= 0 && out.length < 40; i--) {
    const f = facts[i];
    if (!f || f.drop || !f.firms?.includes(firmIdx)) continue;
    if (!f.pub && (me < 0 || !knows(w, me, f.id))) continue;
    let from: string | undefined;
    let fromIndex: number | undefined;
    if (!f.pub) {
      const h = heard.find((x) => x.factId === f.id);
      if (h && h.from >= 0 && h.from < P.n) { fromIndex = h.from; from = P.name(h.from); }
    }
    out.push({ eventId: f.eventId, day: f.day, text: f.msg, private: !f.pub, from, fromIndex });
  }
  return out.reverse();
}

function screen(w: World): Record<string, unknown> {
  const v = view(w);
  const P = econ(w).P;
  const me = playerIndex(w);
  const rels = me >= 0 ? relations(w, me) : [];
  const contacts = rels.map((r) => ({
    slot: r.slot,
    who: r.who,
    name: r.who >= 0 && r.who < P.n ? P.name(r.who) : '',
    trust: r.trust,
    familiarity: r.familiarity,
    friendship: r.friendship,
    kind: r.kind,
  }));
  const facts = (w.state.social as { facts?: FactRow[] } | undefined)?.facts ?? [];
  const firms = econ(w).firms;
  const news = v.news.map((n) => {
    const fact = facts.find((f) => f && f.eventId === n.eventId && f.msg === n.text);
    const named = (fact?.firms ?? []).flatMap((idx) => {
      const f = firms[idx];
      return f ? [{ id: f.id, name: f.name }] : [];
    });
    return { ...n, firms: named };
  });
  const heard = (w.state.player as PlayerState | undefined)?.heard ?? [];
  const priv = v.private.map((p) => {
    const h = heard.find((x) => x.factId === p.factId);
    return { ...p, fromIndex: h?.from ?? -1 };
  });
  const s = econ(w);
  const abroad = w.state.abroad as { mid?: number; rateEv?: number; policy?: number; cfg?: { currency?: string; name?: string } } | undefined;
  const bonds = w.state.bonds as { y?: Record<string, number>; bonds?: { id: string; tenor: string; onRun: boolean; faceLeft: number; last: number; issueEv: number; coupon: number }[] } | undefined;
  const curve = ['3m', '2y', '10y', '30y'].map((tenor) => {
    const y = bonds?.y?.[tenor];
    const on = bonds?.bonds?.find((b) => b.onRun && b.faceLeft > 0 && b.tenor === tenor);
    return {
      tenor,
      yield: finite(y) ? y : 0,
      id: on?.id ?? '',
      px: on?.last ?? 0,
      coupon: on?.coupon ?? 0,
      eventId: on?.issueEv ?? w.genesis,
    };
  });
  const cmd = w.state.commodities as { books?: { good: string; name: string; lot: number; tenors: { month: number; px: number; prev: number }[] }[]; root?: number } | undefined;
  const futures = (cmd?.books ?? []).map((b) => ({
    good: b.good,
    name: b.name,
    lot: b.lot,
    eventId: cmd?.root ?? w.genesis,
    tenors: b.tenors.map((t) => ({ monthsAhead: t.month - w.month, px: t.px, prev: t.prev })),
  }));
  const crypto = w.state.crypto as { majors?: { id: string; name: string; last: number; prev: number }[]; memes?: { id: string; name: string; pool: string; rugged: boolean; live: boolean; launchEv: number }[]; root?: number } | undefined;
  const coins: { id: string; name: string; px: number; prev: number; live: boolean; eventId: number }[] = [];
  for (const m of crypto?.majors ?? []) coins.push({ id: m.id, name: m.name, px: m.last, prev: m.prev, live: true, eventId: crypto?.root ?? w.genesis });
  for (const m of crypto?.memes ?? []) {
    if (!m.live && !v.coins.some((c) => c.id === m.id)) continue;
    const tok = w.ledger.balance(m.pool, m.id);
    const px = !m.rugged && tok > 0 ? w.ledger.balance(m.pool, DEP) / tok : 0;
    coins.push({ id: m.id, name: m.name, px, prev: px, live: m.live && !m.rugged, eventId: m.launchEv });
  }
  const idx = indexPair(w);
  const firmsDir = firms.map((f) => ({ id: f.id, name: f.name }));
  return {
    ...v,
    player: me,
    contacts,
    news,
    private: priv,
    nwChange,
    sinceOpen: v.netWorth - openWorth,
    quotes: quotesOf(w),
    firms: firmsDir,
    tape: {
      unemployment: s.unemployment,
      inflation: yoyOf(s),
      policy: s.policyRate,
      fx: abroad?.mid ?? 0,
      fxName: abroad?.cfg?.name ?? '',
      currency: abroad?.cfg?.currency ?? '',
      foreignRate: abroad?.policy ?? 0,
      index: idx.index,
      indexChg: idx.prev > 0 ? idx.index / idx.prev - 1 : 0,
      events: {
        jobs: w.events.last('macro.jobs') ?? s.macroEv,
        cpi: w.events.last('macro.cpi') ?? s.macroEv,
        rate: w.events.last('cb.rate') ?? s.rateEv,
        fx: abroad?.rateEv ?? w.genesis,
        index: idx.eventId,
      },
    },
    curve,
    futuresBoard: futures,
    coinBoard: coins,
    speed,
    books: booksOk ? { ok: true } : { ok: false, lines: booksBad },
    over: v.over || !v.alive,
  };
}

function firmPage(w: World, key: string): Record<string, unknown> | undefined {
  if (key.toLowerCase() === 'bank_1' || key.toLowerCase() === 'bank' || key.toLowerCase() === 'eq:bank_1') {
    const st = stocksOf(w).find((s) => s.instr === 'eq:bank_1');
    return {
      id: 'bank_1',
      name: 'the bank',
      kind: 'bank',
      deposits: Math.round(w.ledger.issued.get(DEP) ?? 0),
      equity: Math.round(w.ledger.netWorth('bank_1')),
      share: st ? { instr: st.instr, ...session(st) } : undefined,
      daily: st ? closes(st, w.day, false) : [],
      span: st ? closes(st, w.day, true) : [],
      news: [],
    };
  }
  const f = findFirm(w, key);
  if (!f) return;
  const P = econ(w).P;
  const st = stocksOf(w).find((s) => s.issuer === f.id);
  const good = GOODS[f.good];
  return {
    id: f.id,
    name: f.name,
    kind: 'firm',
    good: f.good,
    goodName: good?.name ?? f.good,
    sector: f.sector,
    family: f.family,
    ceo: f.ceo >= 0 ? { index: f.ceo, name: P.name(f.ceo) } : null,
    staff: f.staff.length,
    price: f.price,
    sales: f.soldEma,
    revenue: f.mRev,
    profit: f.lastProfit,
    debt: Math.round(w.ledger.issued.get('loan:' + f.id) ?? 0),
    share: st ? { instr: st.instr, symbol: symbolOf(st.instr), ...session(st) } : undefined,
    daily: st ? closes(st, w.day, false) : [],
    span: st ? closes(st, w.day, true) : [],
    news: firmNews(w, f.idx),
  };
}

function personPage(w: World, index: number): Record<string, unknown> | undefined {
  const P = econ(w).P;
  if (!Number.isInteger(index) || index < 0 || index >= P.n) return;
  const s = econ(w);
  const me = playerIndex(w);
  const employer = P.employer[index];
  const firm = employer >= 0 ? s.firms[employer] : undefined;
  let title = 'unemployed';
  if (!P.alive(index)) title = 'dead';
  else if ((P.flags[index] & 4) !== 0) title = 'in prison';
  else if ((P.flags[index] & 2) !== 0) title = 'retired';
  else if (firm && firm.ceo === index) title = 'chief executive';
  else if (firm) title = 'on the staff';
  const parent = P.parent[index];
  const kids = P.kids(index).slice(0, 12).map((i) => ({ index: i, name: P.name(i), alive: P.alive(i) }));
  const sibs = (parent >= 0 ? P.kids(parent) : []).filter((i) => i !== index).slice(0, 8).map((i) => ({ index: i, name: P.name(i), alive: P.alive(i) }));
  const spouse = P.spouse[index];
  const rel = me >= 0 && me !== index ? relations(w, me).find((r) => r.who === index) : undefined;
  const cents = wealthOf(w, index);
  const mood = P.mood[index];
  return {
    index,
    name: P.name(index),
    self: index === me,
    age: P.age(w, index),
    alive: P.alive(index),
    title,
    employer: firm ? { id: firm.id, name: firm.name } : null,
    good: firm ? (GOODS[firm.good]?.name ?? firm.good) : '',
    family: {
      spouse: spouse >= 0 ? { index: spouse, name: P.name(spouse), alive: P.alive(spouse) } : null,
      parent: parent >= 0 ? { index: parent, name: P.name(parent), alive: P.alive(parent) } : null,
      children: kids,
      siblings: sibs,
    },
    wealthBand: bandOf(cents, wealthEdges(w)),
    mood,
    moodWord: moodWord(mood),
    contact: rel ? { slot: rel.slot, familiarity: rel.familiarity, trust: rel.trust, friendship: rel.friendship, kind: rel.kind } : null,
    lastEvent: P.lastEv[index] >= 0 ? P.lastEv[index] : undefined,
  };
}

function historyPage(w: World): Record<string, unknown> {
  const entries = (w.state.history as { entries?: { year: number; day: number; kind: string; people: string[]; firms: string[]; text: string; cause: string }[] } | undefined)?.entries ?? [];
  const P = econ(w).P;
  const firms = econ(w).firms;
  const firmByName = new Map(firms.map((f) => [f.name, f.id]));
  const personByName = new Map<string, number>();
  for (let i = 0; i < P.n; i++) if (!personByName.has(P.name(i))) personByName.set(P.name(i), i);
  const take = entries.slice(-160);
  return {
    total: entries.length,
    entries: take.map((e) => ({
      year: e.year,
      day: e.day,
      kind: e.kind,
      text: e.text,
      cause: e.cause,
      people: e.people.map((name) => ({ name, index: personByName.get(name) ?? -1 })),
      firms: e.firms.map((name) => ({ name, id: firmByName.get(name) ?? (name === 'bank_1' ? 'bank_1' : '') })),
    })),
    macro,
  };
}

const load = arg('load', '');
if (!load) {
  console.error('usage: node sim/server.ts --load worlds/7');
  process.exit(1);
}
const port = +arg('port', '4173');
const w = openWorld(snapshotSeed(load), new Set());
applySnapshot(w, load);
ensurePlayer(w);
const opening = w.ledger.check();
if (opening.length) {
  console.error(`BOOKS DO NOT BALANCE:\n  ${opening.slice(0, 8).join('\n  ')}`);
  process.exit(1);
}
let speed: Speed = 'pause';
let booksOk = true;
let booksBad: string[] = [];
const arrived = view(w);
let over = arrived.over || !arrived.alive;
let openWorth = arrived.netWorth;
let closeWorth = openWorth;
let nwChange = 0;
const clients = new Set<http.ServerResponse>();

console.log('reading the event log for the macro lines…');
const tMacro = Date.now();
buildMacro(w);
console.log(`macro lines ready in ${Date.now() - tMacro} ms`);

function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); }
    catch { clients.delete(res); }
  }
}

function compact(snap: Record<string, unknown>): Record<string, unknown> {
  const tape = snap.tape as { index: number; indexChg: number };
  return {
    date: snap.date,
    netWorth: snap.netWorth,
    nwChange: snap.nwChange,
    sinceOpen: snap.sinceOpen,
    cash: snap.cash,
    alive: snap.alive,
    over: snap.over,
    index: tape.index,
    indexChg: tape.indexChg,
    quotes: (snap.quotes as { instr: string; px: number; prev: number; chg: number; vol: number }[]).map((q) => ({
      instr: q.instr, px: q.px, prev: q.prev, chg: q.chg, vol: q.vol,
    })),
    shares: snap.shares,
    orders: snap.orders,
    news: snap.news,
  };
}

function stepDay(): string | undefined {
  try { w.step(); }
  catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    booksOk = false;
    booksBad = [why];
    speed = 'pause';
    broadcast('books', { ok: false, lines: booksBad });
    return why;
  }
  const bad = w.ledger.check();
  if (bad.length) {
    booksOk = false;
    booksBad = bad.slice(0, 8);
    speed = 'pause';
    broadcast('books', { ok: false, lines: booksBad });
    return bad[0];
  }
  let snap: Record<string, unknown>;
  try { snap = screen(w); }
  catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    speed = 'pause';
    broadcast('books', { ok: false, lines: [why] });
    return why;
  }
  const now = snap.netWorth as number;
  nwChange = now - closeWorth;
  closeWorth = now;
  snap.nwChange = nwChange;
  snap.sinceOpen = now - openWorth;
  if (w.day % 30 === 0) sampleMacro(w);
  if (snap.over) { speed = 'pause'; over = true; }
  broadcast('day', compact(snap));
  return undefined;
}

let pumping = false;
function pump(): void {
  if (pumping) return;
  const goal = daysFor(speed);
  if (goal < 1 || !booksOk || over) return;
  pumping = true;
  const t0 = Date.now();
  let n = 0;
  const next = (): void => {
    if (speed === 'pause' || !booksOk || over) { pumping = false; return; }
    if (n >= goal) {
      pumping = false;
      const wait = Math.max(16, 1000 - (Date.now() - t0));
      setTimeout(pump, wait);
      return;
    }
    const bad = stepDay();
    n++;
    if (bad) { pumping = false; return; }
    setImmediate(next);
  };
  next();
}

function runDays(days: number): string | undefined {
  for (let i = 0; i < days; i++) {
    const bad = stepDay();
    if (bad) return bad;
    if (over) return undefined;
  }
  return undefined;
}

function send(res: http.ServerResponse, code: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(json);
}

function staticPath(pathname: string): string | undefined {
  let rel = pathname;
  try { rel = decodeURIComponent(pathname); }
  catch { return; }
  rel = rel.replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const root = path.resolve(UI);
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) return;
  return full;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;
  try {
    if (req.method === 'GET' && pathname === '/view') { send(res, 200, screen(w)); return; }
    if (req.method === 'GET' && pathname === '/history') { send(res, 200, historyPage(w)); return; }
    if (req.method === 'GET' && pathname.startsWith('/explain/')) {
      const id = Number(pathname.slice('/explain/'.length));
      if (!Number.isSafeInteger(id) || id < 0) { send(res, 400, { error: 'bad event' }); return; }
      send(res, 200, { id, lines: chain(w, id) });
      return;
    }
    if (req.method === 'GET' && pathname.startsWith('/person/')) {
      const index = Number(pathname.slice('/person/'.length));
      const page = personPage(w, index);
      if (!page) { send(res, 404, { error: 'no such person' }); return; }
      send(res, 200, page);
      return;
    }
    if (req.method === 'GET' && pathname.startsWith('/firm/')) {
      let key = pathname.slice('/firm/'.length);
      try { key = decodeURIComponent(key); } catch { /* keep the raw segment */ }
      const page = firmPage(w, key);
      if (!page) { send(res, 404, { error: 'no such firm' }); return; }
      send(res, 200, page);
      return;
    }
    if (req.method === 'GET' && pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write('retry: 2000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && pathname === '/speed') {
      const body = await readBody(req) as { speed?: string };
      const next = body.speed;
      if (next !== 'pause' && next !== 'day' && next !== 'week' && next !== 'month') {
        send(res, 400, { error: 'speed must be pause, day, week or month' });
        return;
      }
      if (!booksOk) { send(res, 409, { error: 'the books do not balance', lines: booksBad }); return; }
      if (over && next !== 'pause') { send(res, 409, { error: 'you have died' }); return; }
      speed = next;
      send(res, 200, { speed });
      pump();
      return;
    }
    if (req.method === 'POST' && pathname === '/act') {
      const cmd = commandOf(await readBody(req));
      if (typeof cmd === 'string') { send(res, 400, { status: 'rejected', why: cmd }); return; }
      if (!booksOk) { send(res, 409, { status: 'rejected', why: 'the books do not balance' }); return; }
      const result = act(w, cmd);
      let books: string | undefined;
      if (result.status === 'accepted' && result.days) books = runDays(result.days);
      const snap = screen(w);
      if (books) send(res, 409, { ...result, status: 'rejected', why: `BOOKS DO NOT BALANCE: ${books}`, view: snap });
      else send(res, 200, { ...result, view: snap });
      return;
    }
    if (req.method === 'GET') {
      const file = staticPath(pathname);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) { send(res, 404, { error: 'not found' }); return; }
      const ext = path.extname(file);
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) send(res, 500, { error: why });
  }
});

setInterval(() => {
  if (clients.size) broadcast('ping', { day: w.day });
}, 15000);

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE' ? `port ${port} is in use` : err.message);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  const v = view(w);
  const who = v.alive ? `${v.name}, ${v.age}, ${v.employer || 'unemployed'}` : `${v.name} has died`;
  console.log(`http://localhost:${port}`);
  console.log(`Year ${v.date.year} month ${v.date.month} day ${v.date.day}. ${who}.`);
  console.log('Books balanced every day.');
});
