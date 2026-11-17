// Screens: node sim/server.ts [--load worlds/7 | --scenario first-paycheck]
// One process, the world, and the static files in ui/. No install and no build.
// With neither flag the page opens on the scenario list.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import type { World } from './kernel/index.ts';
import { openWorld } from './run.ts';
import { applySnapshot, snapshotSeed, writeSnapshot } from './modules/history/save.ts';
import { parseCode } from './modules/history/commands.ts';
import { lifeBoard } from './modules/player/life.ts';
import { knows, regardOf } from './modules/social/index.ts';
import { innerOf } from './modules/psyche/index.ts';
import { companyPosts } from './modules/corporate/index.ts';
import { DEP, type EconState, type Firm } from './modules/economy/index.ts';
import { GOODS } from './modules/economy/content.ts';
import { careBill, epidemicNow, illnessName } from './modules/health/index.ts';
import { optionChain } from './modules/options/index.ts';
import { act, ensurePlayer, playerIndex, soleSeat, view, type Command } from './modules/player/index.ts';
import { districts, homeBoard, lateRent, parcelView } from './modules/property/index.ts';
import { listScenarios, liveCard, openScenario } from './modules/player/scenarios.ts';

type Speed = 'pause' | 'day' | 'week' | 'month';

interface Bar { o: number; h: number; l: number; c: number; v: number }
interface Stock {
  instr: string; issuer: string; last: number; prev: number; vol: number; hist: Bar[]; moveEv?: number;
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
const SAVES = path.join(fileURLToPath(new URL('..', import.meta.url)), 'worlds', 'saves');
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
      if (typeof b.thing === 'string' && b.thing.trim()) return { kind: 'why', thing: b.thing.trim() };
      const id = whole(b.id, 0);
      if (id === undefined) return 'why needs a thing or an event id';
      return { kind: 'why', id };
    }
    case 'holiday': return { kind: 'holiday' };
    case 'donate': return { kind: 'donate' };
    case 'lawyer': return { kind: 'lawyer' };
    case 'clinic': return { kind: 'clinic' };
    case 'overtime': return { kind: 'overtime' };
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
    case 'court':
    case 'marry': {
      const n = b.slot === undefined ? -1 : whole(b.slot, 0);
      if (n === undefined) return 'that needs a contact slot';
      return b.kind === 'marry' ? { kind: 'marry', slot: n } : { kind: 'court', slot: n };
    }
    case 'child': return { kind: 'child' };
    case 'school': {
      const nth = b.nth === undefined ? 0 : whole(b.nth, 0);
      if (nth === undefined) return 'school needs a child number';
      return { kind: 'school', nth };
    }
    case 'will': {
      const how = b.how === 'spouse' || b.how === 'child' || b.how === 'slot' ? b.how : undefined;
      if (!how) return 'will names a spouse, a child or a contact slot';
      const nth = b.nth === undefined ? 0 : whole(b.nth, 0);
      if (nth === undefined) return 'will needs a number';
      return { kind: 'will', how, nth };
    }
    case 'retire': return { kind: 'retire' };
    case 'hand': {
      if (typeof b.firm !== 'string' || !b.firm) return 'hand needs a firm';
      return { kind: 'hand', firm: b.firm };
    }
    case 'die': return { kind: 'die' };
    case 'help': return { kind: 'help', command: typeof b.command === 'string' ? b.command : '' };
    case 'opt': {
      if (b.instr !== undefined && typeof b.instr !== 'string') return 'opt needs a symbol';
      return { kind: 'opt', instr: typeof b.instr === 'string' ? b.instr : '' };
    }
    case 'optbuy':
    case 'write': {
      if (b.right !== 'C' && b.right !== 'P') return 'right must be C or P';
      if (typeof b.instr !== 'string' || !b.instr) return 'option needs a symbol';
      const qty = whole(b.qty, 1);
      if (qty === undefined) return 'qty is a number of contracts';
      const months = b.months === undefined ? 2 : whole(b.months, 0);
      if (months === undefined || months > 6) return 'months is 0 to 6';
      const strike = b.strike === undefined ? 0 : whole(b.strike, 0);
      if (strike === undefined) return 'strike is a price in cents, or 0';
      return b.kind === 'write'
        ? { kind: 'write', right: b.right, instr: b.instr, qty, months, strike }
        : { kind: 'optbuy', right: b.right, instr: b.instr, qty, months, strike };
    }
    case 'optclose': {
      const id = typeof b.id === 'string' ? b.id : '';
      const instr = typeof b.instr === 'string' ? b.instr : '';
      if (!id && !instr) return 'close needs a contract or a symbol';
      const qty = b.qty === undefined ? 0 : whole(b.qty, 0);
      if (qty === undefined) return 'qty is a number of contracts';
      return { kind: 'optclose', id, instr, qty };
    }
    case 'homes': return { kind: 'homes' };
    case 'homebid': {
      const id = whole(b.id, 0);
      if (id === undefined) return 'bid needs a home';
      const cents = b.cents === undefined ? 0 : whole(b.cents, 0);
      if (cents === undefined) return 'price is in cents';
      return { kind: 'homebid', id, cents };
    }
    case 'homesell': {
      const id = whole(b.id, 0);
      if (id === undefined) return 'sell needs a home';
      return { kind: 'homesell', id };
    }
    case 'let': {
      const id = whole(b.id, 0);
      const cents = whole(b.cents, 1);
      if (id === undefined || cents === undefined) return 'let needs a home and a rent';
      return { kind: 'let', id, cents };
    }
    case 'move': {
      const id = whole(b.id, 0);
      if (id === undefined) return 'move needs a home';
      return { kind: 'move', id };
    }
    case 'mortgage': {
      const id = whole(b.id, 0);
      if (id === undefined) return 'mortgage needs a home';
      const cents = b.cents === undefined ? 0 : whole(b.cents, 0);
      if (cents === undefined) return 'amount is in cents';
      return { kind: 'mortgage', id, cents };
    }
    case 'tip': {
      const fact = whole(b.fact, 0);
      if (fact === undefined) return 'tip needs a fact';
      return { kind: 'tip', fact };
    }
    case 'report': {
      const slot = whole(b.slot, 0);
      if (slot === undefined) return 'report needs a contact';
      if (typeof b.text !== 'string' || !b.text.trim()) return 'report needs a few words';
      return { kind: 'report', slot, text: b.text.trim() };
    }
    case 'hints': {
      if (b.on !== true && b.on !== false) return 'hints needs on true or false';
      return { kind: 'hints', on: b.on };
    }
    case 'story': return { kind: 'story' };
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
  const abroad = w.state.abroad as { mid?: number; rateEv?: number; fxWho?: number } | undefined;
  const mkt = w.state.markets as { index?: number; root?: number } | undefined;
  const jobs = s.jobsWho ?? w.events.last('macro.jobs.who') ?? w.events.last('macro.jobs') ?? s.macroEv ?? w.genesis;
  const cpi = s.cpiWho ?? w.events.last('macro.cpi.who') ?? w.events.last('macro.cpi') ?? s.macroEv ?? w.genesis;
  const rate = s.rateWho ?? w.events.last('cb.desk') ?? w.events.last('cb.rate') ?? s.rateEv ?? w.genesis;
  const fxEv = abroad?.fxWho ?? abroad?.rateEv ?? w.genesis;
  const idxEv = w.events.last('mkt.who') ?? w.events.last('mkt.move') ?? s.cpiWho ?? mkt?.root ?? w.genesis;
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

function sparkOf(st: Stock): number[] {
  const h = st.hist;
  const start = Math.max(0, h.length - 28);
  const out: number[] = [];
  for (let i = start; i < h.length; i++) out.push(h[i].c);
  if (!out.length) {
    out.push(st.prev > 0 ? st.prev : st.last);
    if (st.last !== out[0]) out.push(st.last);
  } else if (st.last !== out[out.length - 1]) out.push(st.last);
  if (out.length > 28) out.splice(0, out.length - 28);
  return out;
}

interface BookLevel { px: number; qty: number }
interface BookSide { bids: BookLevel[]; asks: BookLevel[] }

/** Resting limit orders, collapsed to price levels. The book already lives on the market. */
function booksOf(w: World): Map<string, BookSide> {
  const orders = (w.state.markets as { orders?: { open: boolean; skip?: boolean; instr: string; side: string; qty: number; limit: number | null }[] } | undefined)?.orders ?? [];
  const bid = new Map<string, Map<number, number>>();
  const ask = new Map<string, Map<number, number>>();
  for (const o of orders) {
    if (!o.open || o.skip || o.limit === null || o.qty < 1) continue;
    const side = o.side === 'buy' ? bid : o.side === 'sell' ? ask : undefined;
    if (!side) continue;
    let levels = side.get(o.instr);
    if (!levels) { levels = new Map(); side.set(o.instr, levels); }
    levels.set(o.limit, (levels.get(o.limit) ?? 0) + o.qty);
  }
  const top = (m: Map<number, number> | undefined, desc: boolean): BookLevel[] => {
    if (!m) return [];
    return [...m.entries()].sort((a, b) => desc ? b[0] - a[0] : a[0] - b[0]).slice(0, 8).map(([px, qty]) => ({ px, qty }));
  };
  const out = new Map<string, BookSide>();
  for (const instr of new Set([...bid.keys(), ...ask.keys()])) {
    out.set(instr, { bids: top(bid.get(instr), true), asks: top(ask.get(instr), false) });
  }
  return out;
}

function quotesOf(w: World): { instr: string; symbol: string; name: string; issuer: string; px: number; prev: number; chg: number; vol: number; eventId: number; spark: number[]; bid: number; ask: number; book: BookSide }[] {
  const root = (w.state.markets as { root?: number } | undefined)?.root ?? w.genesis;
  const books = booksOf(w);
  return stocksOf(w).map((st) => {
    const ses = session(st);
    const book = books.get(st.instr) ?? { bids: [], asks: [] };
    return {
      instr: st.instr,
      symbol: symbolOf(st.instr),
      name: issuerName(w, st.issuer),
      issuer: st.issuer,
      px: ses.px,
      prev: ses.prev,
      chg: ses.prev > 0 ? ses.px / ses.prev - 1 : 0,
      vol: ses.vol,
      spark: sparkOf(st),
      bid: book.bids[0]?.px ?? 0,
      ask: book.asks[0]?.px ?? 0,
      book,
      eventId: (() => {
        const f = econ(w).firms.find((x) => x.id === st.issuer);
        if (st.issuer === 'bank_1') return st.moveEv ?? econ(w).rateWho ?? econ(w).cpiWho ?? root;
        return st.moveEv ?? f?.priceWho ?? f?.profitEv ?? f?.staffEv ?? root;
      })(),
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
    eventId: w.events.last('mkt.who') ?? w.events.last('mkt.move') ?? econ(w).cpiWho ?? mkt?.root ?? w.genesis,
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
  const heard = soleSeat(w)?.heard ?? [];
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

interface Alert {
  kind: 'margin' | 'bid' | 'strike' | 'letter' | 'child' | 'rent';
  text: string;
  page: string;
  arg: string;
  eventId: number;
}
interface Pin { alert: Alert; day: number }
const pins: Pin[] = [];
let notedThrough = -1;

function pin(alert: Alert, day: number): void {
  if (pins.some((p) => p.alert.kind === alert.kind && p.alert.eventId === alert.eventId)) return;
  pins.push({ alert, day });
  if (pins.length > 32) pins.shift();
}

function playerFirms(w: World, person: number): { id: string; name: string; idx: number }[] {
  const firms = econ(w).firms;
  const employer = econ(w).P.employer[person];
  const out: { id: string; name: string; idx: number }[] = [];
  for (const f of firms) {
    if (f.closed) continue;
    if (f.ceo === person || f.idx === employer) out.push({ id: f.id, name: f.name, idx: f.idx });
  }
  return out;
}

function ingest(w: World): void {
  const count = w.events.count;
  if (notedThrough >= count - 1) return;
  const P = econ(w).P;
  const i = playerIndex(w);
  const id = i >= 0 ? P.id(i) : '';
  const mine = i >= 0 ? playerFirms(w, i) : [];
  const from = notedThrough < 0 ? Math.max(0, count - 3000) : notedThrough + 1;
  const start = Math.max(from, count - 20000);
  for (let ev = start; ev < count; ev++) {
    const e = w.events.get(ev);
    if (!e) continue;
    if ((e.kind === 'opt.marginCall' || e.kind === 'futures.marginCall') && e.actor === id) {
      pin({ kind: 'margin', text: 'a margin call closed the position out', page: 'desk', arg: '', eventId: e.id }, e.day);
    } else if (e.kind === 'firm.bid' && e.actor !== id) {
      const hit = mine.find((f) => e.msg.includes('for ' + f.name));
      if (hit) pin({ kind: 'bid', text: e.msg, page: 'boards', arg: hit.id, eventId: e.id }, e.day);
    } else if ((e.kind === 'law.investigation' || e.kind === 'law.charge' || e.kind === 'law.trial') && e.actor === id) {
      pin({ kind: 'letter', text: e.msg, page: 'person', arg: String(i), eventId: e.id }, e.day);
    } else if ((e.kind === 'labour.strike' || e.kind === 'labour.lockout') && mine.some((f) => e.msg.includes(f.name))) {
      const hit = mine.find((f) => e.msg.includes(f.name));
      pin({ kind: 'strike', text: e.msg, page: 'firms', arg: hit?.id ?? '', eventId: e.id }, e.day);
    }
  }
  notedThrough = count - 1;
  const keep = w.day - 30;
  while (pins.length && pins[0].day < keep) pins.shift();
}

function alertsOf(w: World): Alert[] {
  ingest(w);
  const out: Alert[] = [];
  const seen = new Set<string>();
  const push = (a: Alert): void => {
    const k = a.kind + ':' + a.eventId + ':' + a.arg;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(a);
  };
  for (const p of pins) if (w.day - p.day <= 30) push(p.alert);
  const P = econ(w).P;
  const i = playerIndex(w);
  if (i < 0) return out;
  const id = P.id(i);
  const pst = soleSeat(w);
  const cash = Math.floor(w.ledger.balance(id, DEP));
  let face = 0;
  for (const loan of pst?.loans ?? []) face += loan.face;
  const posted = Math.round(w.ledger.balance(id, 'cmdty:margin'));
  if ((face > 0 && cash < face * 0.25) || (posted > 0 && cash < posted)) {
    const ev = w.events.last('futures.marginCall') ?? w.events.last('opt.marginCall') ?? (pst && pst.arrived >= 0 ? pst.arrived : w.genesis);
    push({ kind: 'margin', text: 'margin is short of what the position needs', page: 'desk', arg: '', eventId: ev });
  }
  const firms = econ(w).firms;
  const mine = new Set<number>();
  if (P.employer[i] >= 0) mine.add(P.employer[i]);
  for (const f of firms) if (!f.closed && f.ceo === i) mine.add(f.idx);
  const labour = w.state.labour as { unions?: { strikeUntil: number; strikeEv: number; struck: number[]; lock: boolean }[] } | undefined;
  for (const u of labour?.unions ?? []) {
    if (!(u.strikeUntil > w.day)) continue;
    for (const idx of u.struck) {
      if (!mine.has(idx)) continue;
      const f = firms[idx];
      if (!f) continue;
      push({
        kind: 'strike',
        text: `${u.lock ? 'a lockout' : 'a strike'} at ${f.name}`,
        page: 'firms',
        arg: f.id,
        eventId: u.strikeEv || w.genesis,
      });
    }
  }
  const law = w.state.law as { cases?: { phase: number; off: number; invEvent: number; chargeEvent: number }[]; offences?: { person: number; firm: number }[] } | undefined;
  for (const c of law?.cases ?? []) {
    if (c.phase >= 3) continue;
    const o = law?.offences?.[c.off];
    if (!o) continue;
    const aboutFirm = o.firm >= 0 && mine.has(o.firm);
    if (o.person !== i && !aboutFirm) continue;
    push({
      kind: 'letter',
      text: o.person === i ? 'a letter from the regulator' : `the regulator has a file on ${firms[o.firm]?.name ?? 'a firm'}`,
      page: o.person === i ? 'person' : 'firms',
      arg: o.person === i ? String(i) : (firms[o.firm]?.id ?? ''),
      eventId: c.chargeEvent >= 0 ? c.chargeEvent : c.invEvent,
    });
  }
  const epi = epidemicNow(w);
  for (const k of P.kids(i)) {
    if (!P.alive(k) || P.ill[k] <= 0) continue;
    push({
      kind: 'child',
      text: `${P.name(k)} is sick with ${illnessName(P.ill[k])}`,
      page: 'health',
      arg: '',
      eventId: P.lastEv[k] >= 0 ? P.lastEv[k] : (epi?.eventId ?? w.genesis),
    });
  }
  for (const late of lateRent(w, i)) {
    const who = late.tenant >= 0 && late.tenant < P.n ? P.name(late.tenant) : 'a tenant';
    push({
      kind: 'rent',
      text: `${who} has missed ${late.missed} rent${late.missed === 1 ? '' : 's'} on #${late.id}`,
      page: 'parcel',
      arg: String(late.id),
      eventId: late.eventId,
    });
  }
  return out;
}

function personName(w: World, i: number): { index: number; name: string } | null {
  const P = econ(w).P;
  if (i < 0 || i >= P.n) return null;
  return { index: i, name: P.name(i) };
}

function districtsOf(w: World): Record<string, unknown>[] {
  const prop = w.state.property as { lastSaleEv?: number; priceEv?: number } | undefined;
  const eventId = prop?.lastSaleEv !== undefined && prop.lastSaleEv >= 0 ? prop.lastSaleEv : prop?.priceEv ?? w.genesis;
  return districts(w).map((d) => ({ ...d, eventId }));
}

function decorateHomes(w: World, rows: { id: number; live?: boolean }[]): Record<string, unknown>[] {
  const me = playerIndex(w);
  return rows.map((h) => {
    const p = parcelView(w, h.id);
    const tenant = p && p.tenant >= 0 && p.tenant !== me ? personName(w, p.tenant) : null;
    return {
      ...h,
      size: p?.size ?? 0,
      condition: p?.condition ?? 0,
      missed: p?.missed ?? 0,
      mortgage: p?.mortgage ?? 0,
      owner: p ? personName(w, p.owner) : null,
      tenant,
      eventId: p?.eventId ?? w.genesis,
    };
  });
}

function heirOf(w: World): { index: number; name: string; eventId: number } | null {
  const will = soleSeat(w)?.will;
  const P = econ(w).P;
  if (!will || will.heir < 0 || will.heir >= P.n) return null;
  return { index: will.heir, name: P.name(will.heir), eventId: will.eventId };
}

function houseIds(w: World): { index: number; role: string }[] {
  const P = econ(w).P;
  const pst = soleSeat(w);
  const me = playerIndex(w);
  const order: number[] = [];
  const roles = new Map<number, string>();
  const add = (i: number, role: string): void => {
    if (i < 0 || i >= P.n) return;
    if (!roles.has(i)) order.push(i);
    if (!roles.has(i) || (roles.get(i) === 'kin' && role !== 'kin')) roles.set(i, role);
  };
  if (pst) for (const i of pst.line ?? []) add(i, 'kin');
  add(me, 'you');
  if (me >= 0) {
    add(P.spouse[me], 'spouse');
    for (const k of P.kids(me)) add(k, 'child');
    add(P.parent[me], 'parent');
  }
  return order.map((index) => ({ index, role: roles.get(index) ?? 'kin' }));
}

function healthPanel(w: World): Record<string, unknown> {
  const P = econ(w).P;
  const me = playerIndex(w);
  const epi = epidemicNow(w);
  const house = houseIds(w).map(({ index, role }) => ({
    index,
    name: P.name(index),
    role,
    alive: P.alive(index),
    age: P.age(w, index),
    health: P.health[index],
    illness: illnessName(P.ill[index]),
    cover: P.cover[index] === 1 ? 'insured' : 'uninsured',
    owed: careBill(w, index),
    eventId: P.lastEv[index] >= 0 ? P.lastEv[index] : (epi?.eventId ?? w.genesis),
  }));
  const self = house.find((h) => h.index === me);
  return {
    health: self?.health ?? 0,
    illness: self?.illness ?? '',
    cover: self?.cover ?? 'uninsured',
    owed: self?.owed ?? 0,
    eventId: self?.eventId ?? w.genesis,
    epidemic: epi,
    house,
  };
}

function desks(w: World): Record<string, unknown>[] {
  const i = playerIndex(w);
  if (i < 0) return [];
  return companyPosts(w, i).map((c) => {
    const f = findFirm(w, c.id);
    return { ...c, family: !!f?.family, goodName: f ? (GOODS[f.good]?.name ?? f.good) : c.good };
  });
}

function recentBids(w: World): { eventId: number; day: number; kind: string; text: string; firm: string; name: string }[] {
  const firms = econ(w).firms;
  const out: { eventId: number; day: number; kind: string; text: string; firm: string; name: string }[] = [];
  const from = Math.max(0, w.events.count - 5000);
  for (let id = w.events.count - 1; id >= from && out.length < 16; id--) {
    const e = w.events.get(id);
    if (!e || (e.kind !== 'firm.bid' && e.kind !== 'firm.resist' && e.kind !== 'firm.takeover' && e.kind !== 'firm.whiteKnight')) continue;
    const firm = firms.find((f) => e.msg.includes(f.name));
    out.push({ eventId: e.id, day: e.day, kind: e.kind, text: e.msg, firm: firm?.id ?? '', name: firm?.name ?? '' });
  }
  return out.reverse();
}

function markOf(w: World): (instr: string) => number {
  const map = new Map(stocksOf(w).map((s) => [s.instr, s.last]));
  const crypto = w.state.crypto as { majors?: { id: string; last: number }[]; memes?: { id: string; pool: string; rugged: boolean }[] } | undefined;
  return (instr: string): number => {
    const hit = map.get(instr);
    if (hit !== undefined) return hit;
    const major = crypto?.majors?.find((m) => m.id === instr);
    if (major) return major.last;
    const meme = crypto?.memes?.find((m) => m.id === instr);
    if (meme && !meme.rugged) {
      const tok = w.ledger.balance(meme.pool, meme.id);
      if (tok > 0) return w.ledger.balance(meme.pool, DEP) / tok;
    }
    return 0;
  };
}

function lightDynasty(w: World): Record<string, unknown> {
  const P = econ(w).P;
  const pst = soleSeat(w);
  const price = markOf(w);
  const people = houseIds(w).map(({ index, role }) => ({
    index, name: P.name(index), role, alive: P.alive(index), age: P.age(w, index),
    worth: P.alive(index) ? Math.round(w.ledger.netWorth(P.id(index), price)) : 0,
  }));
  return {
    generation: pst?.generation ?? 1,
    worth: people.reduce((t, p) => t + p.worth, 0),
    founded: pst?.founded ?? 0,
    controlled: pst?.controlled ?? 0,
    offices: pst?.offices ?? 0,
    convictions: pst?.convictions ?? 0,
    people,
  };
}

function headlines(w: World): { eventId: number; day: number; text: string; firms: { id: string; name: string }[] }[] {
  const i = playerIndex(w);
  const facts = (w.state.social as { facts?: FactRow[] } | undefined)?.facts ?? [];
  const firms = econ(w).firms;
  const news: { eventId: number; day: number; text: string; firms: { id: string; name: string }[] }[] = [];
  if (i < 0) return news;
  for (let f = facts.length - 1; f >= 0 && news.length < 24; f--) {
    const fact = facts[f];
    if (!fact || fact.drop || !fact.pub || !knows(w, i, fact.id)) continue;
    const named = (fact.firms ?? []).flatMap((idx) => {
      const firm = firms[idx];
      return firm ? [{ id: firm.id, name: firm.name }] : [];
    });
    news.push({ eventId: fact.eventId, day: fact.day, text: fact.msg, firms: named });
  }
  news.reverse();
  return news;
}

function playerBook(w: World): { shares: { instr: string; qty: number; px: number; eventId: number }[]; orders: { id: number; book: string; instr: string; side: string; qty: number; limit: number | null; eventId: number }[] } {
  const i = playerIndex(w);
  const id = i >= 0 ? econ(w).P.id(i) : '';
  const root = (w.state.markets as { root?: number } | undefined)?.root ?? w.genesis;
  const coinRoot = (w.state.crypto as { root?: number } | undefined)?.root ?? w.genesis;
  const shares: { instr: string; qty: number; px: number; eventId: number }[] = [];
  if (i >= 0) for (const st of stocksOf(w)) {
    const qty = Math.floor(w.ledger.balance(id, st.instr));
    if (qty > 0) shares.push({ instr: st.instr, qty, px: session(st).px, eventId: root });
  }
  const orders: { id: number; book: string; instr: string; side: string; qty: number; limit: number | null; eventId: number }[] = [];
  const mOrders = (w.state.markets as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number | null; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of mOrders) if (o.open && o.actor === id) orders.push({ id: o.id, book: 'shares', instr: o.instr, side: o.side, qty: o.qty, limit: o.limit, eventId: root });
  const bOrders = (w.state.bonds as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number | null; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of bOrders) if (o.open && o.actor === id) orders.push({ id: o.id, book: 'bonds', instr: o.instr, side: o.side, qty: o.qty, limit: o.limit, eventId: root });
  const cOrders = (w.state.crypto as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of cOrders) if (o.open && o.actor === id) orders.push({ id: o.id, book: 'crypto', instr: o.instr, side: o.side, qty: o.qty, limit: o.limit, eventId: coinRoot });
  return { shares, orders };
}

interface FeedLine { eventId: number; day: number; tag: string; text: string }
interface PauseHit { why: string; eventId: number }
interface SaveMeta {
  id: string; label: string; scenario: string; scenarioId: string;
  player: string; day: number; date: string; netWorth: number; savedAt: number;
}
interface GenJob { id: string; cash?: number; difficulty?: number; seed?: string; beat?: number }

const feed: FeedLine[] = [];
const pausedIds = new Set<number>();
let feedSeen = -1;
let pauseNote: PauseHit | null = null;
let sawOutcome = '';
let sawShock = false;
let lastSavedMonth = -1;
let challengeBeat = 0;
let generating = false;

function dateLabel(day: number): string {
  const doy = ((day % 360) + 360) % 360;
  return `Y${Math.floor(day / 360) + 1} M${Math.floor(doy / 30) + 1} D${(doy % 30) + 1}`;
}

function scenarioCard(w: World): Record<string, unknown> | null {
  const live = liveCard(w);
  if (!live) return null;
  const sc = w.state.scenario as { deadline?: number; limit?: number } | undefined;
  const left = sc?.deadline && sc.deadline > 0 ? Math.max(0, sc.deadline - w.day) : -1;
  let timeLeft = 'open-ended';
  if (left >= 0) {
    if (left >= 360 && left % 360 === 0) timeLeft = `${left / 360} years left`;
    else if (left >= 30 && left % 30 === 0) timeLeft = `${left / 30} months left`;
    else if (left === 1) timeLeft = '1 day left';
    else timeLeft = `${left} days left`;
  }
  return { ...live, daysLeft: left, timeLeft, beat: challengeBeat };
}

function feedCtx(w: World): { id: string; family: Set<string>; firms: { id: string; name: string }[] } {
  const i = playerIndex(w);
  const P = econ(w).P;
  const id = i >= 0 ? P.id(i) : '';
  const family = new Set<string>();
  for (const h of houseIds(w)) if (h.role !== 'you' && h.index >= 0) family.add(P.id(h.index));
  return { id, family, firms: i >= 0 ? playerFirms(w, i) : [] };
}

function mentionsFirm(msg: string, actor: string | undefined, firms: { id: string; name: string }[]): boolean {
  if (actor && firms.some((f) => f.id === actor)) return true;
  return firms.some((f) => f.name.length > 0 && msg.includes(f.name));
}

function classify(e: { id: number; day: number; kind: string; actor?: string; msg: string }, ctx: ReturnType<typeof feedCtx>, news: number): FeedLine | null {
  const you = !!ctx.id && e.actor === ctx.id;
  let tag = '';
  if (you && (e.kind.startsWith('player.') || e.kind === 'loan.grant' || e.kind === 'loan.margin' || e.kind === 'loan.default' || e.kind === 'opt.marginCall' || e.kind === 'futures.marginCall' || e.kind.startsWith('law.') || e.kind === 'person.breakdown' || e.kind === 'health.injury' || e.kind === 'health.debt' || e.kind === 'person.died')) tag = 'you';
  else if (e.kind === 'person.died' && e.actor && ctx.family.has(e.actor)) tag = 'family';
  else if ((e.kind === 'health.injury' || e.kind === 'health.debt') && e.actor && ctx.family.has(e.actor)) tag = 'family';
  else if ((e.kind === 'firm.bid' || e.kind === 'firm.takeover' || e.kind === 'firm.layoffs' || e.kind === 'firm.failed' || e.kind === 'firm.ceoFired' || e.kind === 'labour.strike' || e.kind === 'labour.lockout') && mentionsFirm(e.msg, e.actor, ctx.firms)) tag = 'firm';
  else if (e.kind.startsWith('shock.')) tag = 'city';
  else if ((e.kind === 'news.story' || e.kind === 'media.story') && (news < 3 || (ctx.id && e.msg.includes(ctx.id)))) tag = 'wire';
  if (!tag) return null;
  const text = e.msg.length > 280 ? e.msg.slice(0, 277) + '…' : e.msg;
  return { eventId: e.id, day: e.day, tag, text };
}

function pauseHit(e: { id: number; kind: string; actor?: string; msg: string }, ctx: ReturnType<typeof feedCtx>): PauseHit | null {
  if (!ctx.id) return null;
  const you = e.actor === ctx.id;
  if (you && (e.kind === 'opt.marginCall' || e.kind === 'futures.marginCall' || e.kind === 'loan.margin')) {
    return { why: 'a margin call', eventId: e.id };
  }
  if (e.kind === 'firm.bid' && e.actor !== ctx.id && ctx.firms.some((f) => e.msg.includes('for ' + f.name))) {
    return { why: 'a takeover bid', eventId: e.id };
  }
  if (you && (e.kind === 'law.charge' || e.kind === 'law.trial')) return { why: 'an arrest', eventId: e.id };
  if (e.kind === 'person.died' && e.actor && ctx.family.has(e.actor)) return { why: 'a death in the family', eventId: e.id };
  return null;
}

function milestone(w: World): PauseHit | null {
  const sc = w.state.scenario as { outcome?: string; reason?: string; fired?: boolean } | undefined;
  if (!sc) return null;
  if (sc.outcome && sc.outcome !== sawOutcome) {
    sawOutcome = sc.outcome;
    const ev = w.events.last('player.scenario') ?? w.genesis;
    return { why: sc.reason || (sc.outcome === 'win' ? 'the goal is met' : 'the scenario ends'), eventId: ev };
  }
  if (sc.fired && !sawShock) {
    sawShock = true;
    const ev = w.events.last('shock.forced') ?? w.genesis;
    return { why: 'the scenario shock', eventId: ev };
  }
  return null;
}

/** New lines since the last call. Pause hits are remembered so a reload of the same event does not stop the clock twice. */
function collect(w: World, minDay = -1): FeedLine[] {
  const ctx = feedCtx(w);
  const count = w.events.count;
  const start = feedSeen < 0 ? Math.max(0, count - 8000) : feedSeen;
  const lines: FeedLine[] = [];
  let news = 0;
  let hit: PauseHit | undefined;
  for (let id = start; id < count; id++) {
    const e = w.events.get(id);
    if (!e) continue;
    if (minDay >= 0 && e.day < minDay && !e.kind.startsWith('player.')) continue;
    const line = classify(e, ctx, news);
    if (line) {
      if (line.tag === 'wire') news++;
      lines.push(line);
      feed.push(line);
    }
    const pause = pauseHit(e, ctx);
    if (pause && !pausedIds.has(pause.eventId)) {
      pausedIds.add(pause.eventId);
      if (!hit) hit = pause;
    }
  }
  feedSeen = count;
  if (feed.length > 100) feed.splice(0, feed.length - 100);
  if (!hit) hit = milestone(w) ?? undefined;
  if (hit && speed !== 'pause') {
    speed = 'pause';
    pauseNote = hit;
  }
  return lines;
}

function seedFeed(w: World): void {
  feed.length = 0;
  feedSeen = -1;
  pausedIds.clear();
  pauseNote = null;
  collect(w, Math.max(0, w.day - 2));
  const sc = w.state.scenario as { outcome?: string; fired?: boolean } | undefined;
  sawOutcome = sc?.outcome ?? '';
  sawShock = !!sc?.fired;
  lastSavedMonth = Math.floor(w.day / 30);
}

function listSaves(): SaveMeta[] {
  if (!fs.existsSync(SAVES)) return [];
  const out: SaveMeta[] = [];
  for (const name of fs.readdirSync(SAVES)) {
    if (name.startsWith('.')) continue;
    const dir = path.join(SAVES, name);
    if (!fs.existsSync(path.join(dir, 'world.json'))) continue;
    const metaPath = path.join(dir, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as SaveMeta;
      if (meta && typeof meta.id === 'string') out.push(meta);
    } catch { /* a half-written save is not listed */ }
  }
  out.sort((a, b) => b.savedAt - a.savedAt || b.day - a.day);
  return out;
}

function saveDir(id: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(id)) return;
  const root = path.resolve(SAVES);
  const dir = path.resolve(root, id);
  if (dir !== root && !dir.startsWith(root + path.sep)) return;
  if (!fs.existsSync(path.join(dir, 'world.json'))) return;
  return dir;
}

function writeSave(id: string, label: string): SaveMeta {
  const dir = path.join(SAVES, id);
  fs.mkdirSync(dir, { recursive: true });
  writeSnapshot(dir, w);
  const who = playerIndex(w);
  const P = econ(w).P;
  const sc = liveCard(w);
  const meta: SaveMeta = {
    id,
    label,
    scenario: sc?.name ?? '',
    scenarioId: sc?.id ?? '',
    player: who >= 0 ? P.name(who) : '',
    day: w.day,
    date: dateLabel(w.day),
    netWorth: who >= 0 ? Math.round(w.ledger.netWorth(P.id(who), markOf(w))) : 0,
    savedAt: Date.now(),
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
  return meta;
}

function slug(s: string): string {
  const t = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return t || 'save';
}

function freshId(base: string): string {
  let id = base;
  let n = 2;
  while (fs.existsSync(path.join(SAVES, id)) && n < 40) id = `${base}-${n++}`;
  return id;
}

function maybeAutosave(): void {
  if (!started) return;
  const month = Math.floor(w.day / 30);
  if (month === lastSavedMonth) return;
  lastSavedMonth = month;
  try { broadcast('saved', writeSave('autosave', 'Autosave')); }
  catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    broadcast('saved', { error: why });
  }
}

function hookHistory(onLine: (year: number, text: string) => void): () => void {
  const orig = Array.prototype.push;
  Array.prototype.push = function (this: unknown[], ...items: unknown[]) {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const e = item as { year?: unknown; text?: unknown; kind?: unknown; cause?: unknown; firms?: unknown };
      if (typeof e.year !== 'number' || typeof e.text !== 'string' || typeof e.kind !== 'string' || typeof e.cause !== 'string' || !Array.isArray(e.firms)) continue;
      try { onLine(e.year, e.text); }
      catch { /* a dropped progress line is not a failed world */ }
    }
    return orig.apply(this, items);
  };
  return () => { Array.prototype.push = orig; };
}

function runGenWorker(): void {
  const job = workerData as GenJob & { dir: string };
  const send = (msg: unknown): void => { try { parentPort?.postMessage(msg); } catch { /* parent gone */ } };
  const unhook = hookHistory((year, text) => send({ type: 'line', year, text }));
  try {
    send({ type: 'phase', text: 'Writing the city…' });
    const world = openScenario(job.id, { cash: job.cash, difficulty: job.difficulty, seed: job.seed });
    unhook();
    send({ type: 'phase', text: 'Saving the new city…' });
    writeSnapshot(job.dir, world);
    send({ type: 'done', dir: job.dir, seed: world.seed });
  } catch (err) {
    unhook();
    send({ type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
  setTimeout(() => process.exit(0), 50);
}

function beginGeneration(job: GenJob): string | null {
  if (generating) return 'a city is already being written';
  if (started) return 'a game is already open';
  if (!listScenarios().some((s) => s.id === job.id)) return `no scenario ${job.id}`;
  generating = true;
  challengeBeat = job.beat && job.beat > 0 ? job.beat : 0;
  const dir = path.join(SAVES, '.boot');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  broadcast('gen', { phase: 'open', text: 'Writing the city…' });
  const worker = new Worker(new URL('./server.ts', import.meta.url), {
    workerData: { ...job, dir },
    execArgv: process.execArgv.filter((a) => !a.startsWith('--inspect')),
  });
  let settled = false;
  const fail = (error: string): void => {
    if (settled) return;
    settled = true;
    generating = false;
    broadcast('gen', { phase: 'error', error });
  };
  worker.on('message', (msg: { type?: string; year?: number; text?: string; error?: string; dir?: string }) => {
    if (msg.type === 'line') broadcast('gen', { phase: 'line', year: msg.year, text: msg.text });
    else if (msg.type === 'phase') broadcast('gen', { phase: 'phase', text: msg.text });
    else if (msg.type === 'error') fail(msg.error || 'the city could not be written');
    else if (msg.type === 'done' && msg.dir) {
      if (settled) return;
      settled = true;
      broadcast('gen', { phase: 'read', text: 'Reading the city into the books…' });
      setImmediate(() => {
        try {
          const world = openWorld(snapshotSeed(msg.dir as string), new Set());
          applySnapshot(world, msg.dir as string);
          ensurePlayer(world);
          boot(world);
          try {
            fs.rmSync(path.join(SAVES, 'autosave'), { recursive: true, force: true });
            fs.renameSync(msg.dir as string, path.join(SAVES, 'autosave'));
            const who = playerIndex(w);
            const P = econ(w).P;
            const sc = liveCard(w);
            const meta: SaveMeta = {
              id: 'autosave', label: 'Autosave', scenario: sc?.name ?? '', scenarioId: sc?.id ?? '',
              player: who >= 0 ? P.name(who) : '', day: w.day, date: dateLabel(w.day),
              netWorth: who >= 0 ? Math.round(w.ledger.netWorth(P.id(who), markOf(w))) : 0,
              savedAt: Date.now(),
            };
            fs.writeFileSync(path.join(SAVES, 'autosave', 'meta.json'), JSON.stringify(meta));
          } catch {
            try { writeSave('autosave', 'Autosave'); }
            catch { /* the game is open even if the first autosave could not be written */ }
          }
          broadcast('gen', { phase: 'ready' });
        } catch (err) {
          const why = err instanceof Error ? err.message : String(err);
          broadcast('gen', { phase: 'error', error: why });
        }
        generating = false;
      });
    }
  });
  worker.on('error', (err) => fail(err.message));
  worker.on('exit', (code) => { if (!settled && code !== 0) fail('the city could not be written'); });
  return null;
}

function openSave(dir: string): void {
  speed = 'pause';
  const world = openWorld(snapshotSeed(dir), new Set());
  applySnapshot(world, dir);
  ensurePlayer(world);
  boot(world);
}

function tickFrame(w: World): Record<string, unknown> {
  const P = econ(w).P;
  const i = playerIndex(w);
  const pst = soleSeat(w);
  const id = i >= 0 ? P.id(i) : '';
  const abs = w.day;
  const doy = abs % 360;
  const price = markOf(w);
  const idx = indexPair(w);
  const book = playerBook(w);
  const alive = i >= 0 && P.alive(i);
  return {
    date: { year: Math.floor(abs / 360) + 1, month: Math.floor(doy / 30) + 1, day: (doy % 30) + 1, abs },
    name: i >= 0 ? P.name(i) : '',
    age: i >= 0 ? P.age(w, i) : 0,
    health: i >= 0 ? P.health[i] : 0,
    alive,
    over: (pst?.over ?? false) || !alive,
    final: pst?.final ?? '',
    cash: i >= 0 ? Math.floor(w.ledger.balance(id, DEP)) : 0,
    netWorth: i >= 0 ? Math.round(w.ledger.netWorth(id, price)) : 0,
    dynasty: lightDynasty(w),
    heir: heirOf(w),
    healthPanel: healthPanel(w),
    alerts: alertsOf(w),
    companies: desks(w),
    index: idx.index,
    indexChg: idx.prev > 0 ? idx.index / idx.prev - 1 : 0,
    quotes: quotesOf(w).map((q) => ({ instr: q.instr, px: q.px, prev: q.prev, chg: q.chg, vol: q.vol, spark: q.spark, bid: q.bid, ask: q.ask, book: q.book })),
    shares: book.shares,
    orders: book.orders,
    news: headlines(w),
    scenario: scenarioCard(w),
    feed,
    speed,
    pause: pauseNote,
    stats: pst ? lifeBoard(w, i, pst, i >= 0 ? Math.round(w.ledger.netWorth(id, price)) : 0).stats : [],
  };
}

function parcelPage(w: World, id: number): Record<string, unknown> | undefined {
  const p = parcelView(w, id);
  if (!p) return;
  const me = playerIndex(w);
  const live = me >= 0 && (w.state.property as { live?: Int32Array } | undefined)?.live?.[me] === id;
  return {
    ...p,
    mine: p.owner === me,
    live,
    owner: personName(w, p.owner),
    tenant: personName(w, p.tenant),
  };
}

function panelSlice(w: World, name: string): Record<string, unknown> {
  const i = playerIndex(w);
  switch (name) {
    case 'options':
      return { chain: optionChain(w, i >= 0 ? econ(w).P.id(i) : '') };
    case 'homes':
      return { homes: decorateHomes(w, homeBoard(w, i)), districts: districtsOf(w) };
    case 'firms':
      return { companies: desks(w) };
    case 'boards':
      return {
        companies: desks(w),
        bids: recentBids(w),
        firms: econ(w).firms.filter((f) => !f.closed).map((f) => ({ id: f.id, name: f.name })),
      };
    default:
      return {};
  }
}

function screen(w: World): Record<string, unknown> {
  const v = view(w);
  const P = econ(w).P;
  const me = playerIndex(w);
  const rels = me >= 0 ? relations(w, me) : [];
  const contacts = rels.map((r) => {
    const g = regardOf(w, me, r.slot);
    return {
      slot: r.slot,
      who: r.who,
      name: r.who >= 0 && r.who < P.n ? P.name(r.who) : '',
      kind: r.kind,
      word: g.word,
      line: g.line,
    };
  });
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
  const heard = soleSeat(w)?.heard ?? [];
  const priv = v.private.map((p) => {
    const h = heard.find((x) => x.factId === p.factId);
    return { ...p, fromIndex: h?.from ?? -1 };
  });
  const s = econ(w);
  const abroad = w.state.abroad as { mid?: number; rateEv?: number; fxWho?: number; policy?: number; cfg?: { currency?: string; name?: string } } | undefined;
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
    homes: decorateHomes(w, v.homes),
    districts: districtsOf(w),
    alerts: alertsOf(w),
    healthPanel: healthPanel(w),
    heir: heirOf(w),
    bids: recentBids(w),
    companies: desks(w),
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
        jobs: s.jobsWho ?? w.events.last('macro.jobs') ?? s.macroEv,
        cpi: s.cpiWho ?? w.events.last('macro.cpi') ?? s.macroEv,
        rate: s.rateWho ?? w.events.last('cb.rate') ?? s.rateEv,
        fx: abroad?.fxWho ?? abroad?.rateEv ?? w.genesis,
        index: idx.eventId,
        wage: s.wageWho ?? s.wageEv,
      },
    },
    curve,
    futuresBoard: futures,
    coinBoard: coins,
    speed,
    books: booksOk ? { ok: true } : { ok: false, lines: booksBad },
    over: v.over || !v.alive,
    scenario: scenarioCard(w),
    feed,
    pause: pauseNote,
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
      eventId: econ(w).rateWho ?? st?.moveEv ?? econ(w).macroEv,
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
    events: {
      staff: f.staffEv ?? f.layoffEv ?? f.ceoEv ?? econ(w).jobsWho ?? econ(w).macroEv,
      price: f.priceWho ?? f.priceEv ?? econ(w).macroEv,
      sales: f.priceWho ?? f.priceEv ?? econ(w).macroEv,
      revenue: f.profitEv ?? f.priceWho ?? econ(w).macroEv,
      profit: f.profitEv ?? f.priceWho ?? f.priceEv ?? econ(w).macroEv,
      debt: econ(w).rateWho ?? econ(w).rateEv,
      share: stocksOf(w).find((s) => s.issuer === f.id)?.moveEv ?? f.priceWho ?? econ(w).macroEv,
    },
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
    moodWord: moodWord(mood),
    contact: rel ? { slot: rel.slot, kind: rel.kind, ...regardOf(w, me, rel.slot) } : null,
    inner: innerOf(w, index),
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
const scenarioId = arg('scenario', '');
const port = +arg('port', '4173');
let w!: World;
let started = false;
let speed: Speed = 'pause';
let booksOk = true;
let booksBad: string[] = [];
let over = false;
let openWorth = 0;
let closeWorth = 0;
let nwChange = 0;
const clients = new Set<http.ServerResponse>();

function boot(world: World): void {
  w = world;
  pins.length = 0;
  notedThrough = -1;
  bandDay = -1;
  const opening = w.ledger.check();
  if (opening.length) {
    console.error(`BOOKS DO NOT BALANCE:\n  ${opening.slice(0, 8).join('\n  ')}`);
    process.exit(1);
  }
  started = true;
  booksOk = true;
  booksBad = [];
  speed = 'pause';
  const arrived = view(w);
  over = arrived.over || !arrived.alive;
  openWorth = arrived.netWorth;
  closeWorth = openWorth;
  nwChange = 0;
  seedFeed(w);
  console.log('reading the event log for the macro lines…');
  const tMacro = Date.now();
  buildMacro(w);
  console.log(`macro lines ready in ${Date.now() - tMacro} ms`);
}

if (isMainThread && load) {
  const world = openWorld(snapshotSeed(load), new Set());
  applySnapshot(world, load);
  ensurePlayer(world);
  boot(world);
} else if (isMainThread && scenarioId) {
  const cash = arg('cash', ''), difficulty = arg('difficulty', '');
  boot(openScenario(scenarioId, {
    cash: cash ? Number(cash) : undefined,
    difficulty: difficulty ? Number(difficulty) : undefined,
  }));
}

function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); }
    catch { clients.delete(res); }
  }
}

function stepDay(): string | undefined {
  let stepped: ReturnType<typeof act>;
  try { stepped = act(w, { kind: 'wait', days: 1 }); }
  catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    booksOk = false;
    booksBad = [why];
    speed = 'pause';
    broadcast('books', { ok: false, lines: booksBad });
    return why;
  }
  if (stepped.books) {
    booksOk = false;
    booksBad = stepped.books.split('; ');
    speed = 'pause';
    broadcast('books', { ok: false, lines: booksBad });
    return booksBad[0];
  }
  let frame: Record<string, unknown>;
  try {
    collect(w);
    const seat = soleSeat(w);
    const who = playerIndex(w);
    if ((seat?.over ?? false) || who < 0 || !econ(w).P.alive(who)) { speed = 'pause'; over = true; }
    frame = tickFrame(w);
  }
  catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    speed = 'pause';
    broadcast('books', { ok: false, lines: [why] });
    return why;
  }
  const now = frame.netWorth as number;
  nwChange = now - closeWorth;
  closeWorth = now;
  frame.nwChange = nwChange;
  frame.sinceOpen = now - openWorth;
  frame.speed = speed;
  if (w.day % 30 === 0) sampleMacro(w);
  maybeAutosave();
  if (pauseNote && speed === 'pause') broadcast('speed', { speed, why: pauseNote.why, eventId: pauseNote.eventId });
  broadcast('day', frame);
  return undefined;
}

let pumping = false;
function pump(): void {
  if (pumping) return;
  if (speed === 'pause' || !booksOk || over || !started) return;
  pumping = true;
  if (speed === 'month') {
    const left = (30 - (w.day % 30)) || 30;
    let n = 0;
    const next = (): void => {
      if (speed !== 'month' || !booksOk || over) {
        pumping = false;
        if (speed !== 'pause' && speed !== 'month') pump();
        return;
      }
      if (n >= left) {
        speed = 'pause';
        pumping = false;
        broadcast('speed', { speed: 'pause', quiet: true });
        return;
      }
      const bad = stepDay();
      n++;
      if (bad || speed === 'pause') { pumping = false; return; }
      setImmediate(next);
    };
    next();
    return;
  }
  const goal = daysFor(speed);
  if (goal < 1) { pumping = false; return; }
  const t0 = Date.now();
  let n = 0;
  const next = (): void => {
    if (speed === 'pause' || speed === 'month' || !booksOk || over) {
      pumping = false;
      if (speed === 'month') pump();
      return;
    }
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

function startOpts(body: unknown): { id: string; cash?: number; difficulty?: number } | string {
  if (!body || typeof body !== 'object') return 'missing scenario';
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id) return 'missing scenario';
  const out: { id: string; cash?: number; difficulty?: number } = { id: b.id };
  if (b.cash !== undefined) {
    const n = Number(b.cash);
    if (!Number.isFinite(n) || n < 0) return 'cash must be a number of dollars';
    out.cash = n;
  }
  if (b.difficulty !== undefined) {
    const n = Number(b.difficulty);
    if (!Number.isFinite(n) || n <= 0) return 'difficulty must be a positive number';
    out.difficulty = n;
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;
  try {
    if (req.method === 'GET' && pathname === '/scenarios') { send(res, 200, { scenarios: listScenarios() }); return; }
    if (req.method === 'GET' && pathname === '/title') {
      const saves = listSaves();
      send(res, 200, { scenarios: listScenarios(), saves, last: saves[0] ?? null });
      return;
    }
    if (req.method === 'GET' && pathname === '/saves') { send(res, 200, { saves: listSaves() }); return; }
    if (req.method === 'POST' && pathname === '/start') {
      const opts = startOpts(await readBody(req));
      if (typeof opts === 'string') { send(res, 400, { error: opts }); return; }
      const why = beginGeneration(opts);
      if (why) { send(res, 409, { error: why }); return; }
      send(res, 202, { ok: true });
      return;
    }
    if (req.method === 'POST' && pathname === '/challenge') {
      const body = await readBody(req) as { code?: unknown };
      let parsed: ReturnType<typeof parseCode>;
      try { parsed = parseCode(typeof body.code === 'string' ? body.code : ''); }
      catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        send(res, 400, { error: why });
        return;
      }
      const why = beginGeneration({ id: parsed.scenario, seed: parsed.seed, difficulty: parsed.difficulty, beat: parsed.score });
      if (why) { send(res, 409, { error: why }); return; }
      send(res, 202, { ok: true, beat: parsed.score, scenario: parsed.scenario, seed: parsed.seed });
      return;
    }
    if (req.method === 'POST' && (pathname === '/load' || pathname === '/continue')) {
      if (generating) { send(res, 409, { error: 'a city is already being written' }); return; }
      const saves = listSaves();
      let id = '';
      if (pathname === '/continue') {
        if (!saves.length) { send(res, 404, { error: 'no save to continue' }); return; }
        id = saves[0].id;
      } else {
        const body = await readBody(req) as { id?: unknown };
        id = typeof body.id === 'string' ? body.id : '';
      }
      const dir = saveDir(id);
      if (!dir) { send(res, 404, { error: 'no such save' }); return; }
      try { openSave(dir); }
      catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        send(res, 400, { error: why });
        return;
      }
      send(res, 200, { view: screen(w) });
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
    if (!started) {
      if (req.method === 'GET' && pathname === '/view') { send(res, 409, { need: 'scenario', scenarios: listScenarios() }); return; }
      if (req.method === 'GET') {
        const file = staticPath(pathname);
        if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) { send(res, 404, { error: 'not found' }); return; }
        const ext = path.extname(file);
        res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
        fs.createReadStream(file).pipe(res);
        return;
      }
      send(res, 409, { error: 'choose a scenario' });
      return;
    }
    if (req.method === 'GET' && pathname === '/view') { send(res, 200, screen(w)); return; }
    if (req.method === 'GET' && pathname === '/panel') { send(res, 200, panelSlice(w, url.searchParams.get('name') || '')); return; }
    if (req.method === 'GET' && pathname.startsWith('/parcel/')) {
      const id = Number(pathname.slice('/parcel/'.length));
      const page = parcelPage(w, id);
      if (!page) { send(res, 404, { error: 'no such home' }); return; }
      send(res, 200, page);
      return;
    }
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
    if (req.method === 'POST' && pathname === '/save') {
      const body = await readBody(req) as { label?: unknown };
      const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 60) : `Save ${dateLabel(w.day)}`;
      const id = freshId(slug(label) === 'autosave' ? 'save' : slug(label));
      try { send(res, 200, { save: writeSave(id, label) }); }
      catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        send(res, 500, { error: why });
      }
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
      if (next !== 'pause') pauseNote = null;
      speed = next;
      send(res, 200, { speed });
      pump();
      return;
    }
    if (req.method === 'POST' && pathname === '/act') {
      const body = await readBody(req);
      const cmd = commandOf(body);
      if (typeof cmd === 'string') { send(res, 400, { status: 'rejected', why: cmd }); return; }
      if (!booksOk) { send(res, 409, { status: 'rejected', why: 'the books do not balance' }); return; }
      const playerId = body && typeof body === 'object' && typeof (body as { playerId?: unknown }).playerId === 'string'
        ? (body as { playerId: string }).playerId
        : undefined;
      const result = playerId ? act(w, playerId, cmd) : act(w, cmd);
      collect(w);
      const seat = soleSeat(w);
      const who = playerIndex(w);
      if ((seat?.over ?? false) || who < 0 || !econ(w).P.alive(who)) { speed = 'pause'; over = true; }
      maybeAutosave();
      const books = result.books;
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

if (!isMainThread) runGenWorker();

if (isMainThread) setInterval(() => {
  if (started && clients.size) broadcast('ping', { day: w.day });
}, 15000);

if (isMainThread) server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE' ? `port ${port} is in use` : err.message);
  process.exit(1);
});

if (isMainThread) server.listen(port, '127.0.0.1', () => {
  console.log(`http://localhost:${port}`);
  if (!started) {
    console.log('choose a scenario');
    return;
  }
  const v = view(w);
  const who = v.alive ? `${v.name}, ${v.age}, ${v.employer || 'unemployed'}` : `${v.name} has died`;
  const tFull = Date.now();
  const full = JSON.stringify(screen(w));
  const fullMs = Date.now() - tFull;
  const tDay = Date.now();
  const day = JSON.stringify(tickFrame(w));
  const dayMs = Date.now() - tDay;
  console.log(`Year ${v.date.year} month ${v.date.month} day ${v.date.day}. ${who}.`);
  console.log('Books balanced every day.');
  console.log(`screen ${full.length} bytes in ${fullMs} ms; day frame ${day.length} bytes in ${dayMs} ms`);
});
