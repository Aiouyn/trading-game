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
import { CAPITAL, DEP, type EconState, type Firm } from './modules/economy/index.ts';
import { GOODS, SECTOR_NAMES } from './modules/economy/content.ts';
import { navOf, type Fund } from './modules/funds/book.ts';
import { careBill, epidemicNow, illnessName } from './modules/health/index.ts';
import { optionChain } from './modules/options/index.ts';
import { careerCard } from './modules/careers/index.ts';
import { pledgeValue, saleProceeds, saleValue } from './modules/markets/index.ts';
import { act, ensurePlayer, playerIndex, soleSeat, view, type Command } from './modules/player/index.ts';
import { civicSnapshot } from './modules/politics/index.ts';
import { attentionOf } from './modules/law/index.ts';
import { districts, homeBoard, lateRent, parcelView } from './modules/property/index.ts';
import { circleBoard, circlePerson } from './modules/circle/index.ts';
import { calendarOf, societyView } from './modules/society/index.ts';
import { listScenarios, liveCard, openScenario } from './modules/player/scenarios.ts';
import { tutorialOf } from './modules/player/tutorial.ts';
import { parseCommand } from './play.ts';

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
  gdp: Pt[];
  power: Pt[];
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
      if (typeof b.person === 'string' && b.person.trim()) cmd.person = b.person.trim();
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
    case 'reply': {
      const msg = whole(b.msg, 0);
      if (msg === undefined) return 'reply needs a message';
      if (typeof b.text !== 'string' || !b.text.trim()) return 'reply needs yes, no, or a few words';
      return { kind: 'reply', msg, text: b.text.trim() };
    }
    case 'lend':
    case 'gift': {
      const cents = whole(b.cents, 1);
      if (cents === undefined) return 'amount is in cents';
      const slot = b.slot === undefined ? -1 : whole(b.slot, 0);
      if (slot === undefined) return 'slot is a contact number';
      return b.kind === 'gift' ? { kind: 'gift', slot, cents } : { kind: 'lend', slot, cents };
    }
    case 'invite': {
      const place = typeof b.place === 'string' && b.place.trim() ? b.place.trim() : 'dinner';
      const slot = b.slot === undefined ? -1 : whole(b.slot, 0);
      if (slot === undefined) return 'slot is a contact number';
      return { kind: 'invite', slot, place };
    }
    case 'introduce': {
      const slot = b.slot === undefined ? -1 : whole(b.slot, 0);
      if (slot === undefined) return 'slot is a contact number';
      return { kind: 'introduce', slot };
    }
    case 'mail': return { kind: 'mail' };
    case 'jobs': return { kind: 'jobs' };
    case 'apply': {
      const n = whole(b.n, 1);
      if (n === undefined) return 'apply needs a job number';
      return { kind: 'apply', n };
    }
    case 'quit': return { kind: 'quit' };
    case 'raise': return { kind: 'raise' };
    case 'study': {
      if (typeof b.field !== 'string' || !b.field.trim()) return 'study needs a field';
      return { kind: 'study', field: b.field.trim() };
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

/** A relationship as one sentence. The trust byte stays in the graph. */
function relationSentence(name: string, word: string, kind: string): string {
  const who = (name.trim().split(/\s+/)[0] || 'Someone');
  let bond = `${who} is ${word.toLowerCase()}`;
  if (word === 'Trusts you') bond = `${who} trusts you`;
  else if (word === 'Confides') bond = `${who} confides in you`;
  else if (word === 'Unsure') bond = `${who} is unsure of you`;
  else if (word === 'Wary') bond = `${who} is wary of you`;
  else if (word === 'Unknown' || word === 'Empty') return `You have not met ${who}`;
  const tie = kind === 'family' ? 'you are family' : 'you work together';
  return `${bond}; ${tie}`;
}

function heardOf(facts: FactRow[], heard: { factId: number; eventId: number; from: number; day: number }[], who: number): { factId: number; eventId: number; day: number; text: string }[] {
  const out: { factId: number; eventId: number; day: number; text: string }[] = [];
  for (const h of heard) {
    if (h.from !== who) continue;
    const fact = facts[h.factId];
    if (!fact || fact.drop || !fact.msg) continue;
    out.push({ factId: h.factId, eventId: fact.eventId ?? h.eventId, day: h.day, text: fact.msg });
  }
  return out;
}

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
      depth: d, id: e.id, day: e.day, kind: e.kind, actor: e.actor, person, firm, name, msg: speakIds(w, e.msg), exo: e.exo, again,
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
const macro: Macro = { unemployment: [], inflation: [], policy: [], fx: [], index: [], gdp: [], power: [] };

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
  macro.gdp = [];
  macro.power = [];
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
    else if (e.kind === 'energy.price') {
      const v = grab(/wholesale power is\s+([\d.]+)/, e.msg);
      if (v !== undefined) pushPt(macro.power, { day: e.day, v, eventId: e.id });
    } else if (e.kind === 'macro.demand') {
      const v = grab(/spending\s+([\d.]+)M/, e.msg);
      if (v !== undefined) pushPt(macro.gdp, { day: e.day, v: v * 1_000_000 * 360, eventId: e.id });
    }
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
  const grid = w.state.energy as { wholesale?: number; priceEv?: number; root?: number } | undefined;
  const powerEv = grid?.priceEv !== undefined && grid.priceEv >= 0 ? grid.priceEv : grid?.root && grid.root > 0 ? grid.root : w.genesis;
  if (finite(grid?.wholesale)) pushPt(macro.power, { day, v: grid.wholesale, eventId: powerEv });
  const gdpEv = s.macroEv || w.genesis;
  if (s.yGdpEma > 1) pushPt(macro.gdp, { day, v: s.yGdpEma * 360 / 100, eventId: gdpEv });
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

function quotesOf(w: World): { instr: string; symbol: string; name: string; issuer: string; sector: string; px: number; prev: number; chg: number; vol: number; pe: number | null; pos: number; eventId: number; spark: number[]; bid: number; ask: number; book: BookSide }[] {
  const root = (w.state.markets as { root?: number } | undefined)?.root ?? w.genesis;
  const books = booksOf(w);
  const who = playerIndex(w);
  const id = who >= 0 ? econ(w).P.id(who) : '';
  const firms = econ(w).firms;
  return stocksOf(w).map((st) => {
    const ses = session(st);
    const book = books.get(st.instr) ?? { bids: [], asks: [] };
    const f = firms.find((x) => x.id === st.issuer);
    const shares = Math.floor(w.ledger.issued.get(st.instr) ?? 0);
    let pe: number | null = null;
    if (f && !f.closed && shares >= 1) {
      const eps = f.lastProfit * 12 / shares;
      if (eps > 1) pe = Math.round((ses.px / eps) * 10) / 10;
    }
    return {
      instr: st.instr,
      symbol: symbolOf(st.instr),
      name: issuerName(w, st.issuer),
      issuer: st.issuer,
      sector: st.issuer === 'bank_1' ? 'Bank' : (f?.sector ?? ''),
      px: ses.px,
      prev: ses.prev,
      chg: ses.prev > 0 ? ses.px / ses.prev - 1 : 0,
      vol: ses.vol,
      pe,
      pos: id ? Math.floor(w.ledger.balance(id, st.instr)) : 0,
      spark: sparkOf(st),
      bid: book.bids[0]?.px ?? 0,
      ask: book.asks[0]?.px ?? 0,
      book,
      eventId: (() => {
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
  const care = careNotes(w, house.map((h) => h.index));
  return {
    health: self?.health ?? 0,
    illness: self?.illness ?? '',
    cover: self?.cover ?? 'uninsured',
    owed: self?.owed ?? 0,
    eventId: self?.eventId ?? w.genesis,
    epidemic: epi,
    house,
    visits: care.visits,
    waves: care.waves,
  };
}

/** Hospital bills, sick leave, and recent care events. Read-only; the health book is unchanged. */
function careNotes(w: World, people: number[]): { visits: Record<string, unknown>[]; waves: Record<string, unknown>[] } {
  const P = econ(w).P;
  const firms = econ(w).firms;
  const st = w.state.health as {
    dueWho?: Int32Array; dueAmt?: Int32Array; dueHosp?: Int16Array; dueN?: number; openEv?: number;
  } | undefined;
  const openEv = st?.openEv || w.genesis;
  const ids = new Set<string>();
  for (const i of people) if (i >= 0 && i < P.n) ids.add(P.id(i));
  const visits: Record<string, unknown>[] = [];
  const me = playerIndex(w);
  if (me >= 0 && me < P.n && P.outUntil[me] > w.day) {
    visits.push({
      day: w.day, kind: 'stay', who: me,
      text: `${P.name(me)} is away from work, under care`,
      until: P.outUntil[me],
      eventId: P.lastEv[me] >= 0 ? P.lastEv[me] : openEv,
    });
  }
  const dueN = st?.dueN ?? 0;
  const house = new Set(people);
  if (st?.dueWho && st.dueAmt && st.dueHosp) {
    for (let k = 0; k < dueN; k++) {
      const who = st.dueWho[k];
      const owed = st.dueAmt[k];
      if (!house.has(who) || owed <= 0) continue;
      const hosp = firms[st.dueHosp[k]];
      visits.push({
        day: w.day, kind: 'bill', who, owed,
        hospital: hosp?.name ?? 'the hospital',
        text: `${P.name(who)} owes care at ${hosp?.name ?? 'the hospital'}`,
        eventId: P.lastEv[who] >= 0 ? P.lastEv[who] : openEv,
      });
    }
  }
  const found: Record<string, unknown>[] = [];
  const waves: Record<string, unknown>[] = [];
  const visitKind = new Set(['health.injury', 'health.debt', 'player.clinic', 'player.health']);
  const waveKind = new Set(['health.arrive', 'health.quarantine']);
  const count = w.events.count;
  const start = Math.max(0, count - 16000);
  for (let id = count - 1; id >= start; id--) {
    if (found.length >= 12 && waves.length >= 6) break;
    const e = w.events.get(id);
    if (!e) continue;
    if (waveKind.has(e.kind) && waves.length < 6) waves.push({ day: e.day, text: e.msg, eventId: e.id });
    if (visitKind.has(e.kind) && found.length < 12 && e.actor && ids.has(e.actor)) {
      const who = e.actor.startsWith('p_') ? Number(e.actor.slice(2)) : -1;
      found.push({ day: e.day, kind: e.kind, who, text: e.msg, eventId: e.id });
    }
  }
  found.reverse();
  waves.reverse();
  return { visits: visits.concat(found), waves };
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
interface PauseAction { label: string; line: string }
interface PauseHit {
  why: string;
  eventId: number;
  kind: 'margin' | 'sale' | 'bankruptcy' | 'bid' | 'arrest' | 'death' | 'strike' | 'milestone' | 'end';
  text: string;
  actions?: PauseAction[];
}
interface LotSnap { instr: string; symbol: string; name: string; qty: number; close: number }
interface TakenLot { symbol: string; name: string; qty: number; close: number; day: number; how: string }
interface StoryLine { title: string; text: string; cause: string }
interface SaveMeta {
  id: string; label: string; scenario: string; scenarioId: string;
  player: string; day: number; date: string; netWorth: number; savedAt: number;
}
interface GenJob { id: string; cash?: number; difficulty?: number; seed?: string; beat?: number; again?: boolean }

const feed: FeedLine[] = [];
const pausedIds = new Set<number>();
let feedSeen = -1;
let pauseNote: PauseHit | null = null;
let pauseQueue: PauseHit[] = [];
/** Holdings at the last screen, so a later forced sale can name the quantity and the last close. */
let heldSnap: LotSnap[] = [];
let lastTaken: TakenLot[] = [];
let lastRuin: { why: string; brief: string } | null = null;
/** History scanned at boot must not open an interrupt. A later hit does, even if the clock is already paused. */
let played = false;
let sawOutcome = '';
let sawShock = false;
let lastSavedMonth = -1;
let challengeBeat = 0;
let generating = false;

function dateLabel(day: number): string {
  const doy = ((day % 360) + 360) % 360;
  return `Y${Math.floor(day / 360) + 1} M${Math.floor(doy / 30) + 1} D${(doy % 30) + 1}`;
}

function moneyLabel(cents: number): string {
  const neg = cents < 0;
  const [whole, frac] = (Math.abs(Math.round(cents)) / 100).toFixed(2).split('.');
  return `${neg ? '-' : ''}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

function progressOf(w: World): { progress: number; meter: string } {
  const sc = w.state.scenario as {
    goal?: { kind?: string; cents?: number; generations?: number };
    fired?: boolean;
    shockUntil?: number;
    outcome?: string;
  } | undefined;
  const g = sc?.goal;
  if (!g?.kind || g.kind === 'none') return { progress: 0, meter: 'no goal' };
  const i = playerIndex(w);
  const id = i >= 0 ? econ(w).P.id(i) : '';
  const now = i >= 0 ? Math.round(w.ledger.netWorth(id, markOf(w))) : 0;
  if (g.kind === 'worth') {
    const cents = g.cents ?? 0;
    return { progress: cents > 0 ? now / cents : 0, meter: `${moneyLabel(now)} of ${moneyLabel(cents)}` };
  }
  if (g.kind === 'dynasty') {
    const gen = soleSeat(w)?.generation ?? 1;
    const need = g.generations && g.generations > 0 ? g.generations : 1;
    return { progress: gen / need, meter: `generation ${gen} of ${need}` };
  }
  if (g.kind === 'crash') {
    const during = !!sc?.fired && !(sc.shockUntil !== undefined && w.day >= sc.shockUntil);
    const after = !!sc?.fired && sc.shockUntil !== undefined && w.day >= sc.shockUntil;
    const progress = after ? (now > 0 ? 1 : 0) : during ? 0.5 : 0;
    const meter = after ? (now > 0 ? 'solvent after the shock' : 'the shock took the book') : during ? 'the shock is on' : 'before the shock';
    return { progress, meter };
  }
  const won = sc?.outcome === 'win';
  return { progress: won ? 1 : 0, meter: won ? 'met' : 'not yet' };
}

function openingLine(w: World): string {
  const i = playerIndex(w);
  const seat = soleSeat(w);
  if (seat && i >= 0) {
    const t = tutorialOf(w, seat, i);
    if (!t.done && t.hint) return t.hint;
  }
  const hints = (w.state.scenario as { hints?: Record<string, string> } | undefined)?.hints;
  return hints?.desk || hints?.help || '';
}

function storyFive(chronicle: string | undefined, events: string[] | undefined): StoryLine[] {
  const lines: StoryLine[] = [];
  const raw = (chronicle ?? '').replace(/\r\n/g, '\n');
  const at = raw.indexOf('What mattered');
  const body = at >= 0 ? raw.slice(at + 'What mattered'.length) : '';
  const parts = body.split(/\n(?=\d+\. )/).map((p) => p.trim()).filter((p) => /^\d+\. /.test(p));
  for (const part of parts) {
    if (lines.length >= 5) break;
    const cut = part.split('\n');
    const stop = cut.findIndex((l, n) => n > 0 && /^(The family|The firms|The city during this life|Years \d)/.test(l.trim()));
    const kept = (stop >= 0 ? cut.slice(0, stop) : cut).join('\n').trim();
    const nl = kept.indexOf('\n');
    const title = (nl >= 0 ? kept.slice(0, nl) : kept).replace(/^\d+\.\s*/, '').trim();
    const rest = nl >= 0 ? kept.slice(nl + 1).trim() : '';
    const paras = rest.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    let cause = '';
    const textBits: string[] = [];
    for (const para of paras) {
      if (para.includes('This followed from') || para.startsWith('This was an outside shock')) cause = para;
      else if (!para.startsWith('People:')) textBits.push(para.replace(/\s+/g, ' '));
    }
    lines.push({ title, text: textBits.join(' '), cause });
  }
  for (const e of events ?? []) {
    if (lines.length >= 5) break;
    if (!e) continue;
    lines.push({ title: e, text: '', cause: '' });
  }
  return lines;
}

function scenarioCard(w: World): Record<string, unknown> | null {
  const live = liveCard(w);
  if (!live) return null;
  const sc = w.state.scenario as { deadline?: number; limit?: number; begun?: number; outcome?: string } | undefined;
  const left = sc?.deadline && sc.deadline > 0 ? Math.max(0, sc.deadline - w.day) : -1;
  let timeLeft = 'open-ended';
  if (left >= 0) {
    if (left >= 360 && left % 360 === 0) timeLeft = `${left / 360} years left`;
    else if (left >= 30 && left % 30 === 0) timeLeft = `${left / 30} months left`;
    else if (left === 1) timeLeft = '1 day left';
    else timeLeft = `${left} days left`;
  }
  const prog = progressOf(w);
  const begun = sc?.begun ?? w.day;
  const ahead = !live.outcome && prog.progress >= 1 && (live.goal || '').startsWith('net worth');
  return {
    ...live,
    goal: speakIds(w, live.goal || ''),
    daysLeft: left,
    timeLeft: live.outcome ? 'The run is over' : timeLeft,
    beat: challengeBeat,
    progress: prog.progress,
    meter: prog.meter,
    first: openingLine(w),
    fresh: begun === w.day && !sc?.outcome,
    ahead,
    pullback: ahead ? pullbackLine(w) : '',
    lines: live.outcome ? runStory(w, live) : [],
    begun,
  };
}

const TWIST_LINE: Record<string, string> = {
  illness: 'Someone at home can fall ill, and that bill can pull the book back under the aim.',
  shock: 'A shock can hit the firm. Six losing months and the seat is lost.',
  redeem: 'The outside money can be asked back, and the fee is worse if the cash is already gone.',
  repair: 'A repair bill can arrive, and a hard year can cost more than the houses.',
  bidwar: 'A rival can raise what the holders will accept.',
  layoff: 'The firm can let you go before the clock ends.',
};

function pullbackLine(w: World): string {
  const claims = scenarioClaims(w);
  const twist = (w.state.scenario as { twist?: string } | undefined)?.twist ?? '';
  const bits = ['You are already past the aim. It locks at the next review, and it can still be lost.'];
  if (claims.length) {
    const n = claims.reduce((a, c) => a + c.owed, 0);
    bits.push(`The book already owes ${moneyLabel(n)} that is not cash and not a bank loan.`);
  }
  if (twist && TWIST_LINE[twist]) bits.push(TWIST_LINE[twist]);
  return bits.join(' ');
}

function shortenCause(cause: string): string {
  if (!cause) return '';
  const cut = cause.split(/\b(?:CPI|households spending|policy rate|industrial machinery)\b/i)[0].replace(/,\s*$/, '').trim();
  if (cut.length >= 40 && cut.length < cause.length) return cut.endsWith('.') ? cut : `${cut}.`;
  if (cause.length > 180) return `${cause.slice(0, 176).replace(/\s+\S*$/, '')}…`;
  return cause;
}

function playerDid(w: World): string {
  const log = (w.state.player as { log?: { status: string; cmd?: Record<string, unknown> }[] } | undefined)?.log ?? [];
  const bits: string[] = [];
  for (const row of log) {
    if (!row || row.status !== 'accepted' || !row.cmd || typeof row.cmd.kind !== 'string') continue;
    const kind = row.cmd.kind;
    if (kind === 'wait' || kind === 'sheet' || kind === 'help' || kind === 'hints' || kind === 'story') continue;
    const t = fillText(row.cmd);
    if (!t || t === kind) continue;
    bits.push(t);
  }
  const pick = bits.length <= 6 ? bits : [...bits.slice(0, 3), '…', ...bits.slice(-3)];
  return pick.join('; ');
}

function runStory(w: World, live: { reason?: string; chronicle?: string; score?: { events?: string[] } }): StoryLine[] {
  const i = playerIndex(w);
  const name = i >= 0 ? econ(w).P.name(i) : '';
  const out: StoryLine[] = [];
  if (lastRuin && /bankrupt|sold your shares|forced close/i.test(lastRuin.why)) {
    out.push({ title: lastRuin.why, text: lastRuin.brief, cause: '' });
  }
  if (live.reason) out.push({ title: 'How it ended', text: speakIds(w, live.reason), cause: '' });
  const did = playerDid(w);
  if (did) out.push({ title: 'What you did', text: did, cause: '' });
  const beats = storyFive(live.chronicle, live.score?.events);
  const mine: StoryLine[] = [];
  const rest: StoryLine[] = [];
  for (const b of beats) {
    const blob = `${b.title} ${b.text}`;
    if (name && blob.includes(name)) mine.push(b);
    else rest.push(b);
  }
  for (const b of [...mine, ...rest]) {
    if (out.length >= 5) break;
    out.push({ title: b.title, text: speakIds(w, b.text), cause: shortenCause(b.cause) });
  }
  return out.slice(0, 5);
}

function feedCtx(w: World): { id: string; family: Set<string>; firms: { id: string; name: string }[]; employer: string; employerId: string } {
  const i = playerIndex(w);
  const P = econ(w).P;
  const id = i >= 0 ? P.id(i) : '';
  const family = new Set<string>();
  for (const h of houseIds(w)) if (h.role !== 'you' && h.index >= 0) family.add(P.id(h.index));
  const emp = i >= 0 && P.employer[i] >= 0 ? econ(w).firms[P.employer[i]] : undefined;
  return { id, family, firms: i >= 0 ? playerFirms(w, i) : [], employer: emp?.name ?? '', employerId: emp?.id ?? '' };
}

function mentionsFirm(msg: string, actor: string | undefined, firms: { id: string; name: string }[]): boolean {
  if (actor && firms.some((f) => f.id === actor)) return true;
  return firms.some((f) => f.name.length > 0 && msg.includes(f.name));
}

function classify(e: { id: number; day: number; kind: string; actor?: string; msg: string }, ctx: ReturnType<typeof feedCtx>, news: number): FeedLine | null {
  const you = !!ctx.id && e.actor === ctx.id;
  let tag = '';
  if (you && (e.kind.startsWith('player.') || e.kind === 'loan.grant' || e.kind === 'loan.margin' || e.kind === 'loan.default' || e.kind === 'loan.sell' || e.kind === 'loan.shortfall' || e.kind === 'loan.writeoff' || e.kind === 'court.bankruptcy' || e.kind === 'court.sale' || e.kind === 'court.pay' || e.kind === 'opt.marginCall' || e.kind === 'futures.marginCall' || e.kind.startsWith('law.') || e.kind === 'person.breakdown' || e.kind === 'health.injury' || e.kind === 'health.debt' || e.kind === 'person.died')) tag = 'you';
  else if (e.kind === 'person.died' && e.actor && ctx.family.has(e.actor)) tag = 'family';
  else if ((e.kind === 'health.injury' || e.kind === 'health.debt') && e.actor && ctx.family.has(e.actor)) tag = 'family';
  else if ((e.kind === 'firm.bid' || e.kind === 'firm.takeover' || e.kind === 'firm.layoffs' || e.kind === 'firm.failed' || e.kind === 'firm.ceoFired' || e.kind === 'labour.strike' || e.kind === 'labour.lockout') && mentionsFirm(e.msg, e.actor, ctx.firms)) tag = 'firm';
  else if (e.kind.startsWith('shock.')) tag = 'city';
  else if ((e.kind === 'news.story' || e.kind === 'media.story') && (news < 3 || (ctx.id && e.msg.includes(ctx.id)))) tag = 'wire';
  if (!tag) return null;
  const text = e.msg.length > 280 ? e.msg.slice(0, 277) + '…' : e.msg;
  return { eventId: e.id, day: e.day, tag, text };
}

function speakIds(w: World, msg: string): string {
  const P = econ(w).P;
  return msg
    .replace(/\beq:frm_[a-z0-9_]+|\bfrm_[a-z0-9_]+/gi, (m) => findFirm(w, m.replace(/^eq:/i, ''))?.name ?? m)
    .replace(/\bp_\d+\b/g, (m) => {
      const n = Number(m.slice(2));
      return Number.isInteger(n) && n >= 0 && n < P.n ? P.name(n) : m;
    });
}

function holdingsNow(w: World): LotSnap[] {
  const i = playerIndex(w);
  if (i < 0) return [];
  const id = econ(w).P.id(i);
  const rows: LotSnap[] = [];
  for (const st of stocksOf(w)) {
    const qty = Math.floor(w.ledger.balance(id, st.instr));
    if (qty < 1) continue;
    rows.push({ instr: st.instr, symbol: symbolOf(st.instr), name: issuerName(w, st.issuer), qty, close: Math.round(st.last) });
  }
  return rows;
}

function lotsSold(before: LotSnap[], after: LotSnap[], day: number, how: string): TakenLot[] {
  const now = new Map(after.map((r) => [r.instr, r.qty]));
  const out: TakenLot[] = [];
  for (const b of before) {
    const qty = b.qty - (now.get(b.instr) ?? 0);
    if (qty < 1) continue;
    out.push({ symbol: b.symbol, name: b.name, qty, close: b.close, day, how });
  }
  return out;
}

function isRuin(hit: PauseHit): boolean {
  return hit.kind === 'margin' || hit.kind === 'sale' || hit.kind === 'bankruptcy';
}

function rankPause(hit: PauseHit): number {
  if (hit.kind === 'bankruptcy') return 80;
  if (hit.kind === 'sale') return 70;
  if (hit.kind === 'margin') return 60;
  if (hit.kind === 'end') return 55;
  if (hit.kind === 'death') return 40;
  if (hit.kind === 'arrest') return 30;
  if (hit.kind === 'bid') return 20;
  return 10;
}

function pauseHit(e: { id: number; kind: string; actor?: string; msg: string }, ctx: ReturnType<typeof feedCtx>): PauseHit | null {
  if (!ctx.id) return null;
  const you = e.actor === ctx.id;
  if (you && (e.kind === 'court.bankruptcy' || e.kind === 'player.bankrupt')) {
    return { why: 'The court declares you bankrupt', eventId: e.id, kind: 'bankruptcy', text: e.msg };
  }
  if (you && (e.kind === 'loan.sell' || e.kind === 'court.sale')) {
    return { why: 'The bank sold your shares', eventId: e.id, kind: 'sale', text: e.msg };
  }
  if (you && (e.kind === 'opt.marginCall' || e.kind === 'futures.marginCall') && /closed out/i.test(e.msg)) {
    return { why: 'A forced close', eventId: e.id, kind: 'sale', text: e.msg };
  }
  if (you && (e.kind === 'opt.marginCall' || e.kind === 'futures.marginCall' || e.kind === 'loan.margin')) {
    return { why: 'A margin call', eventId: e.id, kind: 'margin', text: e.msg };
  }
  if (e.kind === 'firm.bid' && e.actor !== ctx.id && ctx.firms.some((f) => e.msg.includes('for ' + f.name))) {
    return { why: 'a takeover bid', eventId: e.id, kind: 'bid', text: e.msg };
  }
  if (you && (e.kind === 'law.charge' || e.kind === 'law.trial')) return { why: 'an arrest', eventId: e.id, kind: 'arrest', text: e.msg };
  if (e.kind === 'person.died' && e.actor && ctx.family.has(e.actor)) return { why: 'a death in the family', eventId: e.id, kind: 'death', text: e.msg };
  if ((e.kind === 'labour.strike' || e.kind === 'labour.lockout') && ctx.employer) {
    const atYou = (ctx.employerId && e.actor === ctx.employerId) || e.msg.includes(ctx.employer);
    if (atYou) return { why: 'a strike at your employer', eventId: e.id, kind: 'strike', text: e.msg };
  }
  return null;
}

function milestone(w: World): PauseHit | null {
  const sc = w.state.scenario as { outcome?: string; reason?: string; fired?: boolean } | undefined;
  if (!sc) return null;
  if (sc.outcome && sc.outcome !== sawOutcome) {
    sawOutcome = sc.outcome;
    const ev = w.events.last('player.scenario') ?? w.genesis;
    return { why: sc.reason || (sc.outcome === 'win' ? 'the goal is met' : 'the scenario ends'), eventId: ev, kind: 'end', text: sc.reason || '' };
  }
  if (sc.fired && !sawShock) {
    sawShock = true;
    const ev = w.events.last('shock.forced') ?? w.genesis;
    return { why: 'the scenario shock', eventId: ev, kind: 'milestone', text: '' };
  }
  return null;
}

function tradeSym(instr: string): string {
  let s = instr.startsWith('eq:') ? instr.slice(3) : instr;
  if (s.startsWith('frm_')) s = s.slice(4);
  return s;
}

function pauseActions(w: World, hit: PauseHit): PauseAction[] {
  if (hit.kind === 'end') return [];
  const v = view(w);
  switch (hit.kind) {
    case 'margin':
    case 'sale':
    case 'bankruptcy': {
      const owed = v.loans.reduce((a, l) => a + l.owed, 0);
      const pay = Math.min(v.cash, owed);
      const actions: PauseAction[] = [];
      if (hit.kind === 'margin' && pay >= 1) actions.push({ label: `Repay ${moneyLabel(pay)}`, line: `repay ${(pay / 100).toFixed(2)}` });
      if (hit.kind === 'margin') {
        const sh = v.shares.find((s) => s.qty >= 2);
        if (sh) {
          const sym = tradeSym(sh.instr);
          const half = Math.max(1, Math.floor(sh.qty / 2));
          actions.push({ label: `Sell half of ${sym}`, line: `sell ${sym} ${half}` });
        }
      }
      actions.push({ label: 'Read the sheet', line: 'sheet' });
      if (hit.kind !== 'margin') actions.push({ label: 'See who is hiring', line: 'jobs' });
      return actions;
    }
    case 'bid':
      return [{ label: 'Open the board', line: 'board' }, { label: 'Read the desk', line: 'desk' }];
    case 'arrest':
      return [{ label: 'Call a lawyer', line: 'lawyer' }, { label: 'Read the sheet', line: 'sheet' }];
    case 'death':
      return [{ label: 'Read the sheet', line: 'sheet' }];
    case 'strike': {
      const actions: PauseAction[] = [];
      const firm = v.firm || v.employer;
      if (firm) actions.push({ label: `Quote ${v.employer || firm}`, line: `quote ${firm}` });
      actions.push({ label: 'Read the news', line: 'news' });
      return actions;
    }
    case 'milestone':
      return [{ label: 'Read the news', line: 'news' }, { label: 'Read the sheet', line: 'sheet' }];
    default:
      return [];
  }
}

function decoratePause(w: World, hit: PauseHit): PauseHit {
  let text = hit.text;
  if (!text) {
    try { text = w.events.get(hit.eventId)?.msg ?? hit.why; }
    catch { text = hit.why; }
  }
  if (!isRuin(hit)) text = speakIds(w, text);
  let actions: PauseAction[] = [];
  try { actions = pauseActions(w, hit); }
  catch { actions = []; }
  return { ...hit, text, actions };
}

function composeRuin(w: World, hits: PauseHit[], extra: string[], before: LotSnap[]): PauseHit {
  const worst = hits.reduce((a, b) => (rankPause(b) > rankPause(a) ? b : a));
  const kind = worst.kind;
  const after = holdingsNow(w);
  const how = kind === 'bankruptcy' ? 'were sold for the creditors' : 'were sold into the book';
  const sold = kind === 'margin' || before.length === 0 ? [] : lotsSold(before, after, w.day, how);
  if (sold.length) lastTaken = sold;
  const i = playerIndex(w);
  const P = econ(w).P;
  const id = i >= 0 ? P.id(i) : '';
  const name = i >= 0 ? P.name(i) : 'You';
  const book = w.state.banking as { lock?: Int32Array; bust?: Int32Array; ln: number; lnOpen: Uint8Array; lnPerson: Int32Array } | undefined;
  let owed = 0;
  if (book && i >= 0) for (let k = 0; k < book.ln; k++) {
    if (!book.lnOpen[k] || book.lnPerson[k] !== i) continue;
    owed += Math.floor(w.ledger.issued.get('pl_' + k) ?? 0);
  }
  const claims = scenarioClaims(w);
  const claim = claims.reduce((a, c) => a + c.owed, 0);
  const cash = id ? Math.floor(w.ledger.balance(id, DEP)) : 0;
  const homes = (view(w).homes ?? []).filter((h) => h.mine).map((h) => h.neighbourhood);
  const barred = book?.lock && i >= 0 && book.lock[i] > w.day ? book.lock[i] : -1;
  const lines: string[] = [];
  for (const h of hits) {
    const t = speakIds(w, h.text || '');
    if (t && !lines.includes(t)) lines.push(t);
  }
  for (const line of extra) {
    const t = speakIds(w, line);
    if (t && !lines.includes(t)) lines.push(t);
  }
  const parts: string[] = [lines.join(' ')];
  let brief = '';
  if (kind === 'margin') {
    const held = after.map((r) => `${r.qty} ${r.name} (${r.symbol}), last close ${moneyLabel(r.close)}`).join('; ');
    const sale = held
      ? `What the bank would sell: ${held}. The close is not the price the book will pay.`
      : 'No listed shares are in the account for the bank to sell.';
    parts.push(sale);
    brief = sale;
  } else if (sold.length) {
    const sale = `What was sold: ${sold.map((l) => {
      const px = l.close > 0 ? ` The last close on the book before the sale was ${moneyLabel(l.close)}. That is the day's close, not the price each share fetched. The book does not keep the fill.` : '';
      return `${l.qty} ${l.name} (${l.symbol}) ${l.how}.${px}`;
    }).join(' ')}`;
    parts.push(sale);
    brief = sale;
  } else {
    const sale = 'No listed share quantity changed against the last count on this screen. A forced close can still flatten futures or written options. The book does not keep a fill price for those.';
    parts.push(sale);
    brief = sale;
  }
  const owe = `You owe the bank ${moneyLabel(owed)} on open loans.${claim > 0 ? ` The book also owes ${moneyLabel(claim)} that is not a bank loan.` : ''} Cash in hand is ${moneyLabel(cash)}.`;
  parts.push(owe);
  brief = `${brief} ${owe}`;
  if (kind === 'bankruptcy' || (book?.bust && i >= 0 && book.bust[i] >= 0)) {
    const until = barred >= 0 ? ` You cannot borrow until ${dateLabel(barred)}, six years from the declaration.` : ' You cannot borrow for six years.';
    const home = homes.length ? ` You still have a home in ${homes.join(', ')}.` : ' No home is in your name.';
    const still = `${name} can still work and save, and can sell whatever is left.${until}${home}`;
    parts.push(still);
    brief = `${brief} ${still}`;
  } else if (kind === 'sale') {
    const still = owed > 0
      ? 'What you can still do: repay what remains, work, and save. If the court has barred borrowing, a new loan will be refused.'
      : 'The loan that triggered the sale is paid down. You can still work, save, and buy again.';
    parts.push(still);
    brief = `${brief} ${still}`;
  } else {
    parts.push('What you can still do: repay the loan, or sell shares yourself, before the three trading days run out. After that the bank sells into the book.');
  }
  const why = kind === 'bankruptcy' ? 'The court declares you bankrupt' : kind === 'sale' ? 'The bank sold your shares' : 'A margin call';
  lastRuin = { why, brief };
  return { why, eventId: worst.eventId, kind, text: parts.filter(Boolean).join('\n\n') };
}

function enqueuePause(w: World, hit: PauseHit): void {
  const decorated = decoratePause(w, hit);
  if (isRuin(decorated)) {
    pauseQueue = pauseQueue.filter((p) => !isRuin(p));
    if (pauseNote && isRuin(pauseNote)) {
      if (rankPause(decorated) >= rankPause(pauseNote)) {
        pauseNote = decorated;
        speed = 'pause';
      }
      return;
    }
  }
  if (!pauseNote) {
    pauseNote = decorated;
    speed = 'pause';
    return;
  }
  if (pauseNote.eventId === decorated.eventId || pauseQueue.some((p) => p.eventId === decorated.eventId)) return;
  if (rankPause(decorated) > rankPause(pauseNote)) {
    pauseQueue.unshift(pauseNote);
    pauseNote = decorated;
    speed = 'pause';
    return;
  }
  pauseQueue.push(decorated);
}

/** New lines since the last call. Pause hits are remembered so a reload of the same event does not stop the clock twice. */
function collect(w: World, minDay = -1): FeedLine[] {
  const before = heldSnap;
  const ctx = feedCtx(w);
  const count = w.events.count;
  const start = feedSeen < 0 ? Math.max(0, count - 8000) : feedSeen;
  const lines: FeedLine[] = [];
  const raw: PauseHit[] = [];
  const extra: string[] = [];
  let news = 0;
  for (let id = start; id < count; id++) {
    const e = w.events.get(id);
    if (!e) continue;
    if (minDay >= 0 && e.day < minDay && !e.kind.startsWith('player.')) continue;
    const line = classify(e, ctx, news);
    if (line) {
      if (/frm_|p_\d/.test(line.text)) line.text = speakIds(w, line.text);
      if (line.tag === 'wire') news++;
      lines.push(line);
      feed.push(line);
    }
    if (ctx.id && e.actor === ctx.id && (e.kind === 'loan.shortfall' || e.kind === 'loan.writeoff' || e.kind === 'court.pay' || e.kind === 'player.margin')) extra.push(e.msg);
    const pause = pauseHit(e, ctx);
    if (pause && !pausedIds.has(pause.eventId)) {
      pausedIds.add(pause.eventId);
      raw.push(pause);
    }
  }
  feedSeen = count;
  if (feed.length > 100) feed.splice(0, feed.length - 100);
  const mile = milestone(w);
  if (played || speed !== 'pause') {
    const ruin = raw.filter((h) => isRuin(h));
    const rest = raw.filter((h) => !isRuin(h));
    if (ruin.length) enqueuePause(w, composeRuin(w, ruin, extra, before));
    for (const h of rest) enqueuePause(w, h);
    if (!raw.length && mile) enqueuePause(w, mile);
  }
  heldSnap = holdingsNow(w);
  return lines;
}

function seedFeed(w: World): void {
  played = false;
  feed.length = 0;
  feedSeen = -1;
  pausedIds.clear();
  pauseNote = null;
  pauseQueue = [];
  heldSnap = [];
  lastTaken = [];
  lastRuin = null;
  collect(w, Math.max(0, w.day - 2));
  played = true;
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
  if (started && !job.again) return 'a game is already open';
  if (!listScenarios().some((s) => s.id === job.id)) return `no scenario ${job.id}`;
  if (started) {
    speed = 'pause';
    pumping = false;
    started = false;
    over = false;
    pauseNote = null;
    pauseQueue = [];
  }
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

interface PropBook {
  n: number;
  nb: Uint8Array;
  kind: Uint8Array;
  size: Uint16Array;
  cond: Uint8Array;
  ownK: Uint8Array;
  own: Int32Array;
  tenK: Uint8Array;
  ten: Int32Array;
  rent: Float64Array;
  marked: Float64Array;
  missR: Uint8Array;
  mtg: Int32Array;
  ln: number;
  lnOpen: Uint8Array;
  live?: Int32Array;
  px: Float64Array;
  priceEv: number;
  lastSaleEv: number;
}

function propBook(w: World): PropBook | undefined {
  const st = w.state.property as PropBook | undefined;
  if (!st || !st.kind) return;
  return st;
}

function holderName(w: World, k: number, id: number): string {
  const P = econ(w).P;
  if (k === 1 && id >= 0 && id < P.n) return P.name(id);
  if (k === 2) {
    const f = econ(w).firms[id];
    return f?.name ?? 'a firm';
  }
  if (k === 3) return 'a fund';
  if (k === 4) return 'a bank';
  if (k === 5) return 'the city';
  return 'nobody';
}

function residentsOf(w: World, parcel: number): { index: number; name: string }[] {
  const live = propBook(w)?.live;
  if (!live) return [];
  const P = econ(w).P;
  const out: { index: number; name: string }[] = [];
  const n = Math.min(P.n, live.length);
  for (let i = 0; i < n; i++) {
    if (live[i] !== parcel || !P.alive(i)) continue;
    const name = personName(w, i);
    if (name) out.push(name);
  }
  return out;
}

function parcelPage(w: World, id: number): Record<string, unknown> | undefined {
  const st = propBook(w);
  const home = parcelView(w, id);
  const me = playerIndex(w);
  if (home && st) {
    const lives = residentsOf(w, id);
    return {
      ...home,
      kind: 'home',
      mine: home.owner === me,
      live: me >= 0 && st.live?.[me] === id,
      owner: personName(w, home.owner),
      tenant: personName(w, home.tenant),
      firm: null,
      lives,
    };
  }
  if (!st || id < 0 || id >= st.n || st.kind[id] !== 2) return;
  const nb = st.nb[id] ?? 0;
  const dist = districts(w);
  const firmIdx = st.tenK[id] === 2 ? st.ten[id] : -1;
  const firm = firmIdx >= 0 ? econ(w).firms[firmIdx] : undefined;
  let mortgage = 0;
  const k = st.mtg[id];
  if (k >= 0 && k < st.ln && st.lnOpen[k]) mortgage = Math.round(w.ledger.issued.get('pm_' + k) ?? 0);
  const eventId = st.lastSaleEv >= 0 ? st.lastSaleEv : st.priceEv;
  return {
    id,
    kind: 'plant',
    neighbourhood: dist[nb]?.name ?? '',
    price: Math.round(st.marked[id] || st.px[nb] || 0),
    rent: Math.round(st.rent[id]),
    size: st.size[id],
    condition: st.cond[id],
    vacant: st.tenK[id] === 0,
    missed: st.missR[id],
    mortgage,
    mine: st.ownK[id] === 1 && st.own[id] === me,
    live: me >= 0 && st.live?.[me] === id,
    owner: st.ownK[id] === 1 ? personName(w, st.own[id]) : null,
    tenant: st.tenK[id] === 1 ? personName(w, st.ten[id]) : null,
    firm: firm ? { id: firm.id, name: firm.name } : null,
    ownerName: holderName(w, st.ownK[id], st.own[id]),
    lives: residentsOf(w, id),
    eventId,
  };
}

function accountName(w: World, id: string): string {
  if (id.startsWith('p_')) {
    const n = Number(id.slice(2));
    if (!Number.isInteger(n)) return id;
    return personName(w, n)?.name ?? id;
  }
  if (id === 'bank_1') return 'the city bank';
  if (id === 'bank_2') return 'the second bank';
  if (id === 'bank_3') return 'the third bank';
  if (id === 'bank_4') return 'the fourth bank';
  if (id.startsWith('frm_')) return findFirm(w, id)?.name ?? id;
  if (id === 'fund_value') return 'Value';
  if (id === 'fund_value_2') return 'Value (second book)';
  if (id === 'fund_mom') return 'Momentum';
  if (id === 'fund_mm') return 'The market maker';
  if (id.startsWith('hf_')) {
    const rows = (w.state.funds as { funds?: { id: string; name: string }[] } | undefined)?.funds ?? [];
    return rows.find((f) => f.id === id)?.name ?? id;
  }
  return id;
}

function rankedHolders(w: World, instr: string, n: number): { id: string; name: string; shares: number }[] {
  const rows = [...w.ledger.holders(instr).entries()].filter(([, q]) => q > 0.5);
  rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return rows.slice(0, n).map(([id, shares]) => ({ id, name: accountName(w, id), shares: Math.round(shares) }));
}

function sizeWord(workers: number): string {
  if (workers < 12) return 'A shop';
  if (workers < 60) return 'A works';
  return 'A large works';
}

function profitWord(cents: number): string {
  if (cents > 100) return 'In profit';
  if (cents < -100) return 'Losing';
  return 'Even';
}

function yearWord(bps: number): string {
  if (bps >= 800) return 'Strong';
  if (bps > 0) return 'Ahead';
  if (bps === 0) return 'Unchanged';
  if (bps > -800) return 'Behind';
  return 'Down';
}

function plantWord(units: number): string {
  if (units < 1) return 'Bare';
  if (units < 20) return 'A small plant';
  return 'A working plant';
}

function bankHealthWord(failed: boolean, ratio: number): string {
  if (failed) return 'Failed';
  if (ratio >= 0.12) return 'Sound';
  if (ratio >= 0.08) return 'Thin';
  if (ratio >= 0) return 'Strained';
  return 'Insolvent';
}

function coverWord(live: number): string {
  if (live === 1) return 'Covered';
  if (live === 2) return 'Behind';
  return 'Bare';
}

function rateWord(rate: number): string {
  if (rate < 0.012) return 'Quiet';
  if (rate < 0.02) return 'Ordinary';
  if (rate < 0.03) return 'Dear';
  return 'Severe';
}

function staffPeople(w: World, f: Firm): { index: number; name: string }[] {
  const out: { index: number; name: string }[] = [];
  const push = (i: number): void => {
    if (out.length >= 8 || out.some((p) => p.index === i)) return;
    const n = personName(w, i);
    if (n) out.push(n);
  };
  push(f.ceo);
  for (const i of f.staff) push(i);
  return out;
}

function suppliersOf(w: World, f: Firm): { id: string; name: string; good: string; goodName: string }[] {
  const out: { id: string; name: string; good: string; goodName: string }[] = [];
  for (const good of Object.keys(GOODS[f.good]?.inputs ?? {})) {
    for (const o of econ(w).firms) {
      if (o.closed || o.good !== good) continue;
      out.push({ id: o.id, name: o.name, good, goodName: GOODS[good]?.name ?? good });
      if (out.length >= 4) return out;
    }
  }
  return out;
}

function boardOf(w: World, f: Firm): { id: string; name: string; role: string }[] {
  const P = econ(w).P;
  const out: { id: string; name: string; role: string }[] = [];
  if (f.ceo >= 0 && f.ceo < P.n) out.push({ id: P.id(f.ceo), name: P.name(f.ceo), role: 'chief' });
  const top = rankedHolders(w, 'eq:' + f.id, 1)[0];
  if (top && !out.some((r) => r.id === top.id)) out.push({ id: top.id, name: top.name, role: 'largest holder' });
  return out;
}

function directoryPanel(w: World): Record<string, unknown> {
  const P = econ(w).P;
  const firms = econ(w).firms.filter((f) => !f.closed).map((f) => {
    const top = rankedHolders(w, 'eq:' + f.id, 1)[0];
    return {
      id: f.id,
      name: f.name,
      sector: f.sector,
      good: f.good,
      goodName: GOODS[f.good]?.name ?? f.good,
      size: f.workers,
      sizeWord: sizeWord(f.workers),
      owner: top?.name ?? 'No holder',
      chief: f.ceo >= 0 ? P.name(f.ceo) : 'Vacant',
      profit: Math.round(f.lastProfit),
      profitWord: profitWord(f.lastProfit),
      profitEv: f.profitEv ?? f.priceWho ?? f.priceEv ?? econ(w).macroEv,
      listed: f.listed,
      family: f.family,
    };
  });
  return { firms, sectors: [...SECTOR_NAMES] };
}

interface BankRow { id: string; depo: string; failed: boolean; runEv: number }
interface BankBook {
  banks?: BankRow[];
  ln: number;
  lnOpen: Uint8Array;
  lnPerson: Int32Array;
  lnKind: Uint8Array;
  lnRate: Float64Array;
}

function scenarioClaims(w: World): { owed: number; eventId: number; text: string }[] {
  const i = playerIndex(w);
  if (i < 0) return [];
  const id = econ(w).P.id(i);
  const out: { owed: number; eventId: number; text: string }[] = [];
  const ev = w.events.last('player.heir') ?? w.genesis;
  let text = '';
  try { text = w.events.get(ev)?.msg ?? ''; } catch { text = ''; }
  for (const [instr, inst] of w.ledger.instruments) {
    if (inst.issuer !== id || inst.kind !== 'claim') continue;
    if (instr.startsWith('pl_') || instr.startsWith('pm_')) continue;
    const owed = Math.floor(w.ledger.issued.get(instr) ?? 0);
    if (owed <= 0) continue;
    out.push({ owed, eventId: ev, text: text || `The book owes ${moneyLabel(owed)} that is not a bank loan.` });
  }
  return out;
}

function bankPanel(w: World): Record<string, unknown> {
  const i = playerIndex(w);
  const P = econ(w).P;
  const id = i >= 0 ? P.id(i) : '';
  const book = w.state.banking as BankBook | undefined;
  const banks = (book?.banks ?? []).map((b) => {
    const equity = Math.round(w.ledger.netWorth(b.id));
    const depo = Math.round(w.ledger.issued.get(b.depo) ?? 0);
    const sight = b.id === 'bank_1' ? Math.round(w.ledger.issued.get(DEP) ?? 0) : 0;
    const deposits = depo + sight;
    const assets = equity + deposits;
    const ratio = assets > 1 ? equity / assets : (equity >= 0 ? 1 : -1);
    return {
      id: b.id,
      name: accountName(w, b.id),
      equity,
      deposits,
      ratio,
      word: bankHealthWord(b.failed, ratio),
      failed: b.failed,
      eventId: b.runEv >= 0 ? b.runEv : (econ(w).rateWho ?? econ(w).rateEv ?? w.genesis),
    };
  });
  const deposits = !book?.banks || i < 0 ? [] : book.banks.flatMap((b) => {
    const cents = Math.floor(w.ledger.balance(id, b.depo));
    return cents > 0 ? [{ bank: b.id, name: accountName(w, b.id), cents, eventId: econ(w).rateWho ?? w.genesis }] : [];
  });
  const loans: { kind: string; owed: number; rate: number; eventId: number }[] = [];
  let marginOwed = 0;
  let marginRate = 0;
  const grant = w.events.last('loan.grant') ?? w.genesis;
  if (book && i >= 0) for (let k = 0; k < book.ln; k++) {
    if (!book.lnOpen[k] || book.lnPerson[k] !== i) continue;
    const owed = Math.floor(w.ledger.issued.get('pl_' + k) ?? 0);
    if (owed <= 0) continue;
    const kind = book.lnKind[k] === 1 ? 'mortgage' : book.lnKind[k] === 3 ? 'margin' : 'consumer';
    loans.push({ kind, owed, rate: book.lnRate[k], eventId: grant });
    if (kind === 'margin') { marginOwed += owed; marginRate = book.lnRate[k]; }
  }
  const limit = i >= 0 ? pledgeValue(w, id) : 0;
  const room = Math.max(0, limit - marginOwed);
  const claims = scenarioClaims(w);
  return {
    cash: i >= 0 ? Math.floor(w.ledger.balance(id, DEP)) : 0,
    cashEv: w.genesis,
    deposits,
    claims,
    loans,
    margin: {
      limit,
      owed: marginOwed,
      room,
      rate: marginRate,
      word: room > 0 ? 'Open' : marginOwed > 0 ? 'Full' : 'No collateral',
      eventId: grant,
    },
    banks,
  };
}

interface FundBook {
  id: string; name: string; style: string; kind: 'market' | 'hedge';
  nav: number; shares: number; px: number; yours: number; yBps: number; word: string; open: string;
  manager: string; managerEv: number; flowEv: number; wind: number; lever: number;
  holdings: { instr: string; name: string; qty: number; value: number }[];
  eventId: number;
}

const MKT_NAME: Record<string, string> = {
  fund_value: 'Value', fund_value_2: 'Value (second book)', fund_mom: 'Momentum', fund_mm: 'The market maker',
};

function fundHoldings(w: World, actor: string): FundBook['holdings'] {
  const rows: FundBook['holdings'] = [];
  for (const st of stocksOf(w)) {
    const qty = Math.floor(w.ledger.balance(actor, st.instr));
    if (qty < 1) continue;
    rows.push({ instr: st.instr, name: issuerName(w, st.issuer), qty, value: Math.round(qty * st.last) });
  }
  rows.sort((a, b) => b.value - a.value || (a.instr < b.instr ? -1 : 1));
  return rows.slice(0, 5);
}

function cashNav(w: World, id: string): number {
  let v = Math.floor(w.ledger.balance(id, DEP));
  for (const st of stocksOf(w)) {
    const q = w.ledger.balance(id, st.instr);
    if (q) v += Math.round(q * st.last);
  }
  return v;
}

function fundsPanel(w: World, url: URL): Record<string, unknown> {
  const i = playerIndex(w);
  const pid = i >= 0 ? econ(w).P.id(i) : '';
  const mkt = (w.state.markets as { funds?: { id: string; style: string }[]; root?: number } | undefined);
  const hedge = (w.state.funds as { funds?: Fund[] } | undefined)?.funds ?? [];
  const books: FundBook[] = [];
  for (const f of mkt?.funds ?? []) {
    const nav = cashNav(w, f.id);
    const shares = Math.round(w.ledger.issued.get('eq:' + f.id) ?? 0);
    books.push({
      id: f.id, name: MKT_NAME[f.id] ?? f.id, style: f.style, kind: 'market',
      nav, shares, px: shares > 0 ? Math.round(nav / shares) : 0,
      yours: pid ? Math.floor(w.ledger.balance(pid, 'eq:' + f.id)) : 0,
      yBps: 0, word: 'Unchanged', open: 'Trades for its own account',
      manager: '', managerEv: -1, flowEv: -1, wind: 0, lever: 0,
      holdings: fundHoldings(w, f.id), eventId: mkt?.root ?? w.genesis,
    });
  }
  const P = econ(w).P;
  for (const f of hedge) {
    const nav = navOf(w, f);
    const shares = Math.round(w.ledger.issued.get('eq:' + f.id) ?? 0);
    books.push({
      id: f.id, name: f.name, style: f.strat, kind: 'hedge',
      nav, shares, px: shares > 0 ? Math.round(nav / shares) : 0,
      yours: pid ? Math.floor(w.ledger.balance(pid, 'eq:' + f.id)) : 0,
      yBps: f.yBps, word: yearWord(f.yBps), open: f.wind > 0 ? 'Winding down' : 'Open',
      manager: f.manager >= 0 && f.manager < P.n ? P.name(f.manager) : 'No manager',
      managerEv: f.hiredEv, flowEv: f.flowEv, wind: f.wind, lever: f.lever,
      holdings: fundHoldings(w, f.id),
      eventId: f.flowEv >= 0 ? f.flowEv : (f.hiredEv >= 0 ? f.hiredEv : w.genesis),
    });
  }
  const cents = whole(Number(url.searchParams.get('cents')), 1);
  const fund = url.searchParams.get('fund') ?? '';
  let quote: Record<string, unknown> | undefined;
  if (cents !== undefined && fund) {
    const book = books.find((b) => b.id === fund);
    if (!book) quote = { fund, why: 'no such fund' };
    else if (book.shares < 1 || book.nav < 1) quote = { fund, why: 'The fund takes new money from its own investors. This book is not selling shares.', nav: book.nav, yours: book.yours };
    else {
      const shares = Math.floor(cents * book.shares / book.nav);
      const cost = shares > 0 ? Math.round(shares * book.nav / book.shares) : 0;
      quote = {
        fund, shares, px: book.px, cost, nav: book.nav, yours: book.yours,
        line: shares < 1
          ? 'That cash would not buy a share. The fund takes new money from its own investors; your holding is what the book shows.'
          : `At this value, that cash would buy ${shares} shares. The fund takes new money from its own investors; your holding is what the book shows.`,
      };
    }
  }
  return { books, quote };
}

interface InsBook {
  insId: string[];
  rate: number;
  premiums: number;
  claims: number;
  n: number;
  live: Uint8Array;
  polKind: Uint8Array;
  ref: Int32Array;
  ins: Uint8Array;
  cover: Float64Array;
  prem: Float64Array;
  firmPol: Int32Array;
  homePol: Int32Array;
  root: number;
  lastLoss: number;
}

function firmQuoteCover(w: World, f: Firm): number {
  const good = GOODS[f.good];
  const units = w.ledger.balance(f.id, CAPITAL);
  const plant = units * 360 * econ(w).wage / Math.max(0.01, good?.prod ?? 1);
  let stock = 0;
  if (good && !good.perishable) stock = Math.round(w.ledger.balance(f.id, 'good:' + f.good) * Math.max(0, f.price));
  return Math.max(0, Math.round(plant * 0.9 + Math.min(stock, plant * 0.45)));
}

function insurancePanel(w: World): Record<string, unknown> {
  const st = w.state.insurance as InsBook | undefined;
  const i = playerIndex(w);
  const rate = st?.rate ?? 0;
  const eventId = st && st.lastLoss >= 0 ? st.lastLoss : (st?.root ?? w.genesis);
  const insurers = (st?.insId ?? []).map((id) => {
    const f = findFirm(w, id);
    const equity = Math.round(w.ledger.netWorth(id));
    const word = !f || f.closed ? 'Wound up' : equity <= 0 ? 'Thin' : 'Open';
    return { id, name: f?.name ?? id, word, equity, eventId };
  });
  const policies: Record<string, unknown>[] = [];
  const quotes: Record<string, unknown>[] = [];
  if (st && i >= 0) {
    for (const h of homeBoard(w, i)) {
      if (!h.mine) continue;
      const k = h.id < st.homePol.length ? st.homePol[h.id] : -1;
      const live = k >= 0 && k < st.n ? st.live[k] : 0;
      const parcel = parcelView(w, h.id);
      if (k >= 0 && live) {
        const ins = st.insId[st.ins[k]] ?? '';
        policies.push({
          kind: 'home', id: h.id, name: h.neighbourhood, insurer: findFirm(w, ins)?.name ?? ins,
          cover: Math.round(st.cover[k]), prem: Math.round(st.prem[k]), word: coverWord(live), eventId,
        });
      } else {
        const cover = Math.round(h.price * 0.85);
        quotes.push({
          kind: 'home', id: h.id, name: h.neighbourhood, cover,
          prem: Math.max(1, Math.round(cover * rate * 0.12)),
          word: 'Bare', mortgaged: (parcel?.mortgage ?? 0) > 0, eventId: parcel?.eventId ?? eventId,
        });
      }
    }
    for (const post of companyPosts(w, i)) {
      const f = findFirm(w, post.id);
      if (!f) continue;
      const k = f.idx < st.firmPol.length ? st.firmPol[f.idx] : -1;
      const live = k >= 0 && k < st.n ? st.live[k] : 0;
      if (k >= 0 && live) {
        const ins = st.insId[st.ins[k]] ?? '';
        policies.push({
          kind: 'firm', id: f.id, name: f.name, insurer: findFirm(w, ins)?.name ?? ins,
          cover: Math.round(st.cover[k]), prem: Math.round(st.prem[k]), word: coverWord(live), eventId,
        });
      } else {
        const cover = firmQuoteCover(w, f);
        quotes.push({
          kind: 'firm', id: f.id, name: f.name, cover,
          prem: Math.max(1, Math.round(cover * rate)),
          word: 'Bare', eventId: f.profitEv ?? econ(w).macroEv,
        });
      }
    }
  }
  const claims = w.events.recent(['hazard.loss', 'ins.rate', 'ins.open', 'hazard.fire', 'hazard.flood', 'hazard.storm', 'hazard.collision'], 8)
    .map((e) => ({ eventId: e.id, day: e.day, kind: e.kind, text: e.msg }));
  return {
    rate, rateWord: rateWord(rate), rateEv: eventId,
    premiums: Math.round(st?.premiums ?? 0), claimsTotal: Math.round(st?.claims ?? 0),
    insurers, policies, quotes, claims,
  };
}

function tailPts(arr: Pt[], live: Pt | null): Pt[] {
  const copy = arr.slice(-96);
  if (!live) return copy;
  const last = copy[copy.length - 1];
  if (!last || live.day > last.day) copy.push(live);
  else if (live.day === last.day) copy[copy.length - 1] = live;
  return copy;
}

function cityPanel(w: World, district: string): Record<string, unknown> {
  const st = propBook(w);
  const dist = districts(w);
  const prop = w.state.property as { lastSaleEv?: number; priceEv?: number } | undefined;
  const eventId = prop?.lastSaleEv !== undefined && prop.lastSaleEv >= 0 ? prop.lastSaleEv : prop?.priceEv ?? w.genesis;
  const counts = dist.map(() => ({ homes: 0, plants: 0, vacant: 0 }));
  const me = playerIndex(w);
  let homeDistrict = '';
  if (st) {
    const homeId = me >= 0 && st.live ? st.live[me] : -1;
    if (homeId >= 0 && homeId < st.n) homeDistrict = dist[st.nb[homeId]]?.name ?? '';
    for (let p = 0; p < st.n; p++) {
      const nb = st.nb[p] ?? 0;
      const row = counts[nb];
      if (!row) continue;
      if (st.kind[p] === 2) row.plants++;
      else if (st.kind[p] === 1) {
        row.homes++;
        if (st.tenK[p] === 0) row.vacant++;
      }
    }
  }
  const want = district.trim().toLowerCase();
  const parcels: Record<string, unknown>[] = [];
  if (st && want) {
    for (let p = 0; p < st.n; p++) {
      const nb = st.nb[p] ?? 0;
      const name = dist[nb]?.name ?? '';
      if (name.toLowerCase() !== want) continue;
      const kind = st.kind[p] === 2 ? 'plant' : st.kind[p] === 1 ? 'home' : '';
      if (!kind) continue;
      const firm = st.tenK[p] === 2 ? econ(w).firms[st.ten[p]] : undefined;
      parcels.push({
        id: p,
        kind,
        price: Math.round(st.marked[p] || 0),
        rent: Math.round(st.rent[p]),
        mine: st.ownK[p] === 1 && st.own[p] === me,
        live: me >= 0 && st.live?.[me] === p,
        vacant: st.tenK[p] === 0,
        owner: holderName(w, st.ownK[p], st.own[p]),
        who: firm?.name ?? (st.tenK[p] === 1 ? holderName(w, 1, st.ten[p]) : st.tenK[p] === 0 ? '' : holderName(w, st.tenK[p], st.ten[p])),
      });
    }
  }
  const port = w.state.port as {
    name?: string; berths?: number; berthed?: number; freight?: number; closedUntil?: number; strikeOn?: boolean;
    freightEv?: number; closeEv?: number; root?: number; cranes?: number;
    ships?: { name: string; way: string; eta: number; line: string }[];
  } | undefined;
  const grid = w.state.energy as {
    plants?: { name: string; fuel: string; utility: number; out: number; ready: number }[];
    wholesale?: number; tariff?: number; priceEv?: number; root?: number; marginal?: string;
  } | undefined;
  const firms = econ(w).firms;
  const powerEv = grid?.priceEv !== undefined && grid.priceEv >= 0 ? grid.priceEv : grid?.root && grid.root > 0 ? grid.root : eventId;
  return {
    eventId,
    homeDistrict,
    districts: dist.map((d, i) => ({ ...d, eventId, ...(counts[i] ?? { homes: 0, plants: 0, vacant: 0 }) })),
    parcels,
    port: {
      name: port?.name ?? 'the port',
      berths: port?.berths ?? 0,
      berthed: port?.berthed ?? 0,
      cranes: port?.cranes ?? 0,
      freight: port?.freight ?? 0,
      closed: (port?.closedUntil ?? 0) > w.day,
      strike: !!port?.strikeOn,
      eventId: port?.closeEv && port.closeEv > 0 ? port.closeEv : port?.freightEv && port.freightEv > 0 ? port.freightEv : port?.root && port.root > 0 ? port.root : eventId,
      ships: (port?.ships ?? []).slice(0, 8).map((s) => ({ name: s.name, way: s.way, line: s.line, eta: s.eta })),
    },
    plants: (grid?.plants ?? []).map((p) => ({
      name: p.name,
      fuel: p.fuel.toLowerCase(),
      utility: firms[p.utility]?.name ?? '',
      down: p.out > 0 || p.ready > w.day,
    })),
    power: { wholesale: grid?.wholesale ?? 0, tariff: grid?.tariff ?? 0, marginal: grid?.marginal ?? '', eventId: powerEv },
  };
}

function institutionsPanel(w: World): Record<string, unknown> {
  const s = econ(w);
  const day = w.day;
  // jobsWho, cpiWho and rateWho are seeded with the genesis id, so ?? never reaches a later event.
  const own = (id: number | undefined): number | undefined => id !== undefined && id >= 0 && id !== w.genesis ? id : undefined;
  const jobs = own(s.jobsWho) ?? w.events.last('macro.jobs.who') ?? w.events.last('macro.jobs') ?? own(s.macroEv) ?? w.genesis;
  const cpi = own(s.cpiWho) ?? w.events.last('macro.cpi.who') ?? w.events.last('macro.cpi') ?? own(s.macroEv) ?? w.genesis;
  const deskId = w.events.last('cb.desk') ?? w.events.last('cb.rate');
  const rateId = deskId ?? own(s.rateEv) ?? own(s.rateWho) ?? w.genesis;
  const abroad = w.state.abroad as { mid?: number; fxWho?: number; rateEv?: number; cfg?: { currency?: string; name?: string } } | undefined;
  const fxEv = own(abroad?.fxWho) ?? own(abroad?.rateEv) ?? w.events.last('fx.desk') ?? w.genesis;
  const grid = w.state.energy as { wholesale?: number; tariff?: number; priceEv?: number; root?: number; marginal?: string } | undefined;
  const powerEv = grid?.priceEv !== undefined && grid.priceEv >= 0 ? grid.priceEv : grid?.root && grid.root > 0 ? grid.root : w.genesis;
  const gdpEv = s.macroEv || w.genesis;
  const gdpLive = s.yGdpEma > 1 ? s.yGdpEma * 360 / 100 : 0;
  const bonds = w.state.bonds as { y?: Record<string, number> } | undefined;
  const curve = ['3m', '2y', '10y', '30y'].map((tenor) => {
    const y = bonds?.y?.[tenor];
    const hit = (w.state.bonds as { bonds?: { tenor: string; onRun: boolean; faceLeft: number; issueEv: number }[] } | undefined)?.bonds
      ?.find((b) => b.onRun && b.faceLeft > 0 && b.tenor === tenor);
    return { tenor, v: finite(y) ? y * 100 : 0, eventId: hit?.issueEv ?? rateId };
  });
  const decision = deskId !== undefined ? w.events.get(deskId) : undefined;
  const reading = [jobs, cpi].flatMap((id) => {
    if (id === w.genesis) return [];
    const e = w.events.get(id);
    return e ? [{ id: e.id, msg: e.msg, name: '' }] : [];
  });
  const reasons = decision
    ? chain(w, deskId!).filter((line) => line.depth > 0 && !line.missing).slice(0, 6).map((line) => ({
      id: line.id, msg: line.msg, name: line.name ?? '',
    }))
    : reading;
  const gov = (w.state.politics as { governor?: number } | undefined)?.governor ?? -1;
  const P = econ(w).P;
  return {
    unemployment: { v: s.unemployment * 100, eventId: jobs, points: tailPts(macro.unemployment, { day, v: s.unemployment * 100, eventId: jobs }) },
    inflation: { v: yoyOf(s) * 100, eventId: cpi, points: tailPts(macro.inflation, { day, v: yoyOf(s) * 100, eventId: cpi }) },
    policy: { v: s.policyRate * 100, eventId: decision ? deskId! : (reading[0]?.id ?? rateId), points: tailPts(macro.policy, { day, v: s.policyRate * 100, eventId: decision ? deskId! : rateId }) },
    gdp: { v: gdpLive, eventId: gdpEv, counted: gdpLive > 0, points: tailPts(macro.gdp, gdpLive > 0 ? { day, v: gdpLive, eventId: gdpEv } : null) },
    fx: {
      v: abroad?.mid ?? 0,
      eventId: fxEv,
      name: abroad?.cfg?.name ?? '',
      currency: abroad?.cfg?.currency ?? '',
      points: tailPts(macro.fx, finite(abroad?.mid) ? { day, v: abroad.mid, eventId: fxEv } : null),
    },
    power: {
      v: grid?.tariff ?? grid?.wholesale ?? 0,
      wholesale: grid?.wholesale ?? 0,
      marginal: (grid?.marginal ?? '').toLowerCase(),
      eventId: powerEv,
      points: tailPts(macro.power, finite(grid?.wholesale) ? { day, v: grid.wholesale, eventId: powerEv } : null),
    },
    curve,
    bank: {
      text: decision?.msg ?? `The opening rate stands at ${(s.policyRate * 100).toFixed(2)}%`,
      eventId: decision ? deskId! : (reading[0]?.id ?? rateId),
      governor: gov >= 0 && gov < P.n ? { index: gov, name: P.name(gov) } : null,
      reasons,
    },
  };
}

function civicPanel(w: World): Record<string, unknown> {
  const i = playerIndex(w);
  const snap = civicSnapshot(w, i);
  const P = econ(w).P;
  const s = econ(w);
  const seat = soleSeat(w);
  const worth = i >= 0 ? Math.round(w.ledger.netWorth(P.id(i), markOf(w))) : 0;
  const board = seat ? lifeBoard(w, i, seat, worth) : null;
  const donate = board?.choices.find((c) => c.id === 'donate');
  const person = (idx: number, role: string) => (
    idx >= 0 && idx < P.n ? { index: idx, name: P.name(idx), role, eventId: snap.govEv >= 0 ? snap.govEv : w.genesis } : null
  );
  const taxEv = w.events.last('politics.tax') ?? w.events.last('gov.tax') ?? (snap.platformEv >= 0 ? snap.platformEv : w.genesis);
  const spend = Object.values(GOODS)
    .filter((g) => g.gov > 0)
    .map((g) => ({ name: g.name, share: g.gov * (s.spendPri?.[g.good] ?? 1), weight: s.spendPri?.[g.good] ?? 1 }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);
  const ballot = snap.ballot >= 0 ? snap.parties[snap.ballot] : undefined;
  const voted = snap.voted >= 0 ? snap.parties[snap.voted] : undefined;
  return {
    ...snap,
    ballotName: ballot?.name ?? '',
    votedName: voted?.name ?? '',
    offices: [person(snap.leader, 'premier'), person(snap.finance, 'finance'), person(snap.governor, 'governor'), person(snap.regulator, 'regulator')].filter((x) => x),
    tax: {
      income: s.taxRate,
      profit: s.profitTax ?? 0,
      dividend: s.divRate ?? 0,
      benefit: s.benefitRate ?? 0,
      scale: s.spendScale ?? 1,
      eventId: taxEv,
    },
    spend,
    donate: donate ? { cost: donate.cost, left: donate.left, line: donate.line } : null,
  };
}

function kindWord(k: string): string {
  switch (k) {
    case 'insider': return 'insider trading';
    case 'manipulation': return 'market manipulation';
    case 'fraud': return 'fraud';
    case 'debt': return 'unpaid debt';
    case 'street': return 'a street offence';
    default: return k;
  }
}

function legalPanel(w: World): Record<string, unknown> {
  const i = playerIndex(w);
  const P = econ(w).P;
  const law = w.state.law as {
    staff?: number[];
    offences?: { person: number; firm: number; kind: string; gain: number; event: number }[];
    cases?: { off: number; investigator: number; opened: number; phase: number; invEvent: number; chargeEvent: number; trialEvent: number }[];
    root?: number;
  } | undefined;
  const reg = (w.state.politics as { regulator?: number } | undefined)?.regulator ?? -1;
  const offences = law?.offences ?? [];
  const firms = econ(w).firms;
  const phaseWord = (p: number): string => p === 0 ? 'Investigation' : p === 1 ? 'Charged' : p === 2 ? 'Trial' : 'Closed';
  const eventFor = (c: { phase: number; invEvent: number; chargeEvent: number; trialEvent: number }): number => (
    c.phase >= 2 && c.trialEvent >= 0 ? c.trialEvent : c.phase >= 1 && c.chargeEvent >= 0 ? c.chargeEvent : c.invEvent
  );
  const open = (law?.cases ?? []).flatMap((c) => {
    if (c.phase >= 3) return [];
    const o = offences[c.off];
    if (!o) return [];
    const who = o.person >= 0 && o.person < P.n ? P.name(o.person) : 'someone';
    const inv = c.investigator >= 0 && c.investigator < P.n ? P.name(c.investigator) : '';
    return [{
      phase: phaseWord(c.phase),
      kind: kindWord(o.kind),
      who,
      whoIndex: o.person,
      investigator: inv,
      investigatorIndex: c.investigator,
      firm: o.firm >= 0 ? firms[o.firm]?.name ?? '' : '',
      day: c.opened,
      eventId: eventFor(c),
      mine: o.person === i,
    }];
  }).slice(0, 40);
  const staff = (law?.staff ?? []).flatMap((idx) => {
    if (idx < 0 || idx >= P.n) return [];
    const files = open.filter((c) => c.investigatorIndex === idx).length;
    return [{ index: idx, name: P.name(idx), role: idx === reg ? 'Regulator' : 'Investigator', files }];
  });
  const seat = soleSeat(w);
  const worth = i >= 0 ? Math.round(w.ledger.netWorth(i >= 0 ? P.id(i) : '', markOf(w))) : 0;
  const board = seat ? lifeBoard(w, i, seat, worth) : null;
  const lawyer = board?.choices.find((c) => c.id === 'lawyer');
  const att = i >= 0 ? attentionOf(w, i) : null;
  const stat = board?.stats.find((x) => x.id === 'attention');
  const mine = open.filter((c) => c.mine);
  return {
    open,
    staff,
    record: {
      word: stat?.word ?? 'Quiet',
      hover: stat?.hover ?? '',
      line: att?.line ?? 'The regulator has no file',
      eventId: stat?.eventId ?? att?.eventId ?? law?.root ?? w.genesis,
      convictions: seat?.convictions ?? 0,
      prison: i >= 0 && (P.flags[i] & 4) !== 0,
      cases: mine,
    },
    lawyer: lawyer ? { cost: lawyer.cost, left: lawyer.left, line: lawyer.line } : null,
  };
}

function wirePanel(w: World): Record<string, unknown> {
  const i = playerIndex(w);
  const P = econ(w).P;
  const id = i >= 0 ? P.id(i) : '';
  const contacts = new Set<string>();
  if (i >= 0) for (const r of relations(w, i)) if (r.who >= 0) contacts.add(P.id(r.who));
  const held = new Set<string>();
  for (const st of stocksOf(w)) if (id && w.ledger.balance(id, st.instr) > 0) held.add(st.issuer);
  const employer = i >= 0 && P.employer[i] >= 0 ? econ(w).firms[P.employer[i]] : undefined;
  const items = new Map<number, { eventId: number; day: number; text: string; tags: string[] }>();
  const add = (eventId: number, day: number, text: string, tags: string[]): void => {
    if (!tags.length || eventId < 0) return;
    const prev = items.get(eventId);
    if (prev) {
      for (const t of tags) if (!prev.tags.includes(t)) prev.tags.push(t);
      return;
    }
    items.set(eventId, { eventId, day, text: text.length > 280 ? text.slice(0, 277) + '…' : text, tags });
  };
  const tagOf = (e: { kind: string; actor?: string; msg: string }): string[] => {
    const tags: string[] = [];
    const you = !!id && e.actor === id;
    const contact = !!e.actor && contacts.has(e.actor);
    const firmHit = !!e.actor && held.has(e.actor) || [...held].some((fid) => {
      const f = econ(w).firms.find((x) => x.id === fid);
      return !!f && e.msg.includes(f.name);
    });
    if (you || e.kind.startsWith('player.')) tags.push('you');
    if (contact) tags.push('contacts');
    if (firmHit) tags.push('holdings');
    if (e.kind.startsWith('shock.') || e.kind.startsWith('politics.') || e.kind.startsWith('port.') || e.kind.startsWith('energy.') || e.kind.startsWith('macro.') || e.kind.startsWith('health.') || e.kind === 'property.open' || e.kind.startsWith('labour.')) tags.push('city');
    if (e.kind.startsWith('mkt.') || e.kind === 'firm.price' || e.kind === 'firm.profit' || e.kind.startsWith('cb.') || e.kind.startsWith('fx.') || e.kind.startsWith('opt.') || e.kind === 'news.story' || e.kind === 'media.story') tags.push('markets');
    return tags;
  };
  const from = Math.max(0, w.events.count - 4000);
  for (let n = w.events.count - 1; n >= from; n--) {
    const e = w.events.get(n);
    if (!e) continue;
    add(e.id, e.day, e.msg, tagOf(e));
  }
  if (i >= 0) for (const r of relations(w, i)) {
    const ev = P.lastEv[r.who];
    const e = ev >= 0 ? w.events.get(ev) : undefined;
    if (e) add(e.id, e.day, e.msg, ['contacts']);
  }
  for (const line of headlines(w)) {
    const aboutHeld = line.firms.some((f) => held.has(f.id));
    add(line.eventId, line.day, line.text, aboutHeld ? ['holdings', 'markets'] : ['city']);
  }
  const heard = soleSeat(w)?.heard ?? [];
  for (const h of heard) {
    const e = w.events.get(h.eventId);
    if (!e) continue;
    const tags = ['you'];
    if (h.from >= 0) tags.push('contacts');
    add(e.id, e.day, e.msg, tags);
  }
  if (employer) {
    const ev = employer.profitEv ?? employer.priceEv ?? employer.priceWho;
    if (ev !== undefined && ev >= 0) {
      const e = w.events.get(ev);
      if (e) add(e.id, e.day, e.msg, ['you', 'holdings']);
    }
  }
  const list = [...items.values()].sort((a, b) => b.day - a.day || b.eventId - a.eventId);
  const kept: typeof list = [];
  const seen: Record<string, number> = { you: 0, contacts: 0, holdings: 0, city: 0, markets: 0 };
  for (const item of list) {
    const room = item.tags.some((t) => (seen[t] ?? 0) < 24);
    if (!room) continue;
    kept.push(item);
    for (const t of item.tags) seen[t] = (seen[t] ?? 0) + 1;
    if (kept.length >= 80) break;
  }
  return { items: kept };
}

function panelSlice(w: World, name: string, url: URL): Record<string, unknown> {
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
    case 'directory':
      return directoryPanel(w);
    case 'bank':
      return bankPanel(w);
    case 'funds':
      return fundsPanel(w, url);
    case 'insurance':
      return insurancePanel(w);
    case 'city':
      return cityPanel(w, url.searchParams.get('district') ?? '');
    case 'institutions':
      return institutionsPanel(w);
    case 'civic':
      return civicPanel(w);
    case 'legal':
      return legalPanel(w);
    case 'wire':
      return wirePanel(w);
    default:
      return {};
  }
}

interface OccQuote { id: string; name: string; rank: number }

let occQuotes: OccQuote[] | null = null;

/** Names and ranks from occupations.txt, index-aligned with the careers book. Index 0 is unused. */
function occTable(): OccQuote[] {
  if (occQuotes) return occQuotes;
  const file = process.env.SIM_CONTENT
    ? path.join(process.env.SIM_CONTENT, 'occupations.txt')
    : fileURLToPath(new URL('./content/occupations.txt', import.meta.url));
  const rows: OccQuote[] = [{ id: '', name: '', rank: 0 }];
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const block of text.split('[OCCUPATION:').slice(1)) {
      const id = block.slice(0, block.indexOf(']')).trim().toLowerCase();
      const name = /\[NAME:([^\]]+)\]/.exec(block)?.[1]?.trim() || id;
      const rank = Number(/\[RANK:(\d+)\]/.exec(block)?.[1] ?? 1);
      if (id) rows.push({ id, name, rank: Number.isFinite(rank) ? rank : 1 });
    }
  } catch { /* the card still works without a study menu */ }
  occQuotes = rows;
  return rows;
}

function careerView(w: World, person: number, eventId: number): Record<string, unknown> {
  const card = careerCard(w, person);
  const occ = occTable();
  const firms = w.state.economy ? econ(w).firms : [];
  const wage = w.state.economy ? econ(w).wage : 0;
  const st = w.state.careers as {
    apps?: { person: number; firm: number; occ: number; due: number; n: number }[];
    study?: { person: number; occ: number; due: number }[];
    notices?: { person: number; day: number; text: string }[];
  } | undefined;
  const study = occ.filter((o) => o.id).map((o) => ({
    field: o.name,
    name: o.name,
    days: 12 + 6 * o.rank,
    cost: Math.round(wage * (8 + 6 * o.rank)),
  }));
  const pending = (st?.apps ?? []).filter((a) => a.person === person).map((a) => ({
    n: a.n,
    firm: firms[a.firm]?.name ?? 'a firm',
    role: occ[a.occ]?.name ?? 'a seat',
    due: a.due,
    daysLeft: Math.max(0, a.due - w.day),
  }));
  const course = (st?.study ?? []).find((row) => row.person === person);
  const letters = (st?.notices ?? []).filter((n) => n.person === person && w.day - n.day <= 40).map((n) => ({
    day: n.day,
    text: n.text,
  }));
  return {
    ...card,
    eventId,
    study,
    pending,
    course: course ? {
      name: occ[course.occ]?.name ?? 'a trade',
      due: course.due,
      daysLeft: Math.max(0, course.due - w.day),
    } : null,
    letters,
  };
}

function withDue(w: World, inbox: { threads: unknown; pending: { id?: number; day?: number; kind?: string }[] }): { threads: unknown; pending: Record<string, unknown>[] } {
  const asks = (w.state.circle as { asks?: { id: number; due: number }[] } | undefined)?.asks ?? [];
  const due = new Map<number, number>();
  for (const a of asks) if (a.due > 0) due.set(a.id, a.due);
  return {
    threads: inbox.threads,
    pending: inbox.pending.map((p) => {
      const id = typeof p.id === 'number' ? p.id : -1;
      const day = typeof p.day === 'number' ? p.day : w.day;
      const known = due.get(id);
      const fallback = day + (p.kind === 'invite' ? 21 : 90);
      return { ...p, due: known ?? fallback };
    }),
  };
}

function screen(w: World): Record<string, unknown> {
  const v = view(w);
  const P = econ(w).P;
  const me = playerIndex(w);
  const rels = me >= 0 ? relations(w, me) : [];
  const facts = (w.state.social as { facts?: FactRow[] } | undefined)?.facts ?? [];
  const heard = soleSeat(w)?.heard ?? [];
  const board = circleBoard(w);
  const contacts = rels.map((r) => {
    const g = regardOf(w, me, r.slot);
    const name = r.who >= 0 && r.who < P.n ? P.name(r.who) : '';
    const told = heardOf(facts, heard, r.who);
    const person = board.people[r.who];
    return {
      slot: r.slot,
      who: r.who,
      name,
      kind: r.kind,
      word: g.word,
      line: g.line,
      sentence: relationSentence(name, g.word, r.kind),
      told,
      role: person?.role ?? (r.kind === 'family' ? 'family' : 'colleague'),
      stance: person?.stance ?? '',
      bond: person?.bond ?? { word: g.word, score: 0, why: [] as { day: number; delta: number; text: string; eventId: number }[] },
      together: person?.together ?? [],
    };
  });
  for (const extra of board.added) {
    contacts.push({
      slot: extra.slot,
      who: extra.who,
      name: extra.name,
      kind: 'work',
      word: extra.word,
      line: extra.why[extra.why.length - 1]?.text ?? '',
      sentence: relationSentence(extra.name, extra.word, 'work'),
      told: heardOf(facts, heard, extra.who),
      role: extra.role,
      stance: extra.stance,
      bond: { word: extra.word, score: extra.score, why: extra.why },
      together: extra.together,
    });
  }
  const firms = econ(w).firms;
  const news = v.news.map((n) => {
    const fact = facts.find((f) => f && f.eventId === n.eventId && f.msg === n.text);
    const named = (fact?.firms ?? []).flatMap((idx) => {
      const f = firms[idx];
      return f ? [{ id: f.id, name: f.name }] : [];
    });
    return { ...n, firms: named };
  });
  const priv = v.private.map((p) => {
    const h = heard.find((x) => x.factId === p.factId);
    return { ...p, fromIndex: h?.from ?? -1 };
  });
  const s = econ(w);
  const abroad = w.state.abroad as { mid?: number; rateEv?: number; fxWho?: number; policy?: number; cfg?: { currency?: string; name?: string } } | undefined;
  const bonds = w.state.bonds as { y?: Record<string, number>; bonds?: { id: string; tenor: string; onRun: boolean; faceLeft: number; last: number; prev: number; issueEv: number; coupon: number }[] } | undefined;
  const curve = ['3m', '2y', '10y', '30y'].map((tenor) => {
    const y = bonds?.y?.[tenor];
    const on = bonds?.bonds?.find((b) => b.onRun && b.faceLeft > 0 && b.tenor === tenor);
    return {
      tenor,
      yield: finite(y) ? y : 0,
      id: on?.id ?? '',
      px: on?.last ?? 0,
      prev: on?.prev ?? on?.last ?? 0,
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
  const job = me >= 0 && P.employer[me] >= 0 ? firms[P.employer[me]] : undefined;
  return {
    ...v,
    bonds: markedBonds(w, v.bonds),
    homes: decorateHomes(w, v.homes),
    districts: districtsOf(w),
    alerts: alertsOf(w),
    healthPanel: healthPanel(w),
    heir: heirOf(w),
    bids: recentBids(w),
    companies: desks(w),
    player: me,
    ageEvent: me >= 0 && P.lastEv[me] >= 0 ? P.lastEv[me] : w.genesis,
    jobEvent: job ? (job.staffEv ?? job.ceoEv ?? econ(w).jobsWho ?? w.genesis) : w.genesis,
    contacts,
    inbox: withDue(w, board.inbox),
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
    chain: optionChain(w, me >= 0 ? P.id(me) : ''),
    career: careerView(w, me, job ? (job.staffEv ?? job.ceoEv ?? econ(w).jobsWho ?? w.genesis) : w.genesis),
    futuresBoard: futures,
    coinBoard: coins,
    fx: fxOf(w),
    risk: riskOf(w),
    fills: fillsOf(w),
    speed,
    books: booksOk ? { ok: true } : { ok: false, lines: booksBad },
    over: v.over || !v.alive,
    scenario: scenarioCard(w),
    feed,
    calendar: calendarOf(w),
    society: societyView(w),
    pause: pauseNote,
  };
}

function topHolders(w: World, instr: string): { id: string; name: string; index?: number; qty: number }[] {
  let rows: [string, number][];
  try { rows = [...w.ledger.holders(instr)].filter(([, n]) => n > 0); }
  catch { return []; }
  rows.sort((a, b) => b[1] - a[1]);
  const P = econ(w).P;
  return rows.slice(0, 5).map(([hid, n]) => {
    if (hid.startsWith('p_')) {
      const k = Number(hid.slice(2));
      if (Number.isInteger(k) && k >= 0 && k < P.n) return { id: hid, name: P.name(k), index: k, qty: Math.floor(n) };
    }
    return { id: hid, name: hid, qty: Math.floor(n) };
  });
}

function moveLine(w: World, eventId: number | undefined): { eventId: number; day: number; text: string } | undefined {
  if (eventId === undefined || eventId < 0) return;
  const e = w.events.get(eventId);
  if (!e) return { eventId, day: w.day, text: '' };
  return { eventId: e.id, day: e.day, text: e.msg };
}

function optRequirement(w: World, actor: string): number {
  const contracts = (w.state.options as { contracts?: { live: boolean; shortId: string; mid: number; right: string; strike: number; instr: string }[] } | undefined)?.contracts ?? [];
  const last = new Map(stocksOf(w).map((st) => [st.instr, st.last]));
  let n = 0;
  for (const c of contracts) {
    if (!c.live) continue;
    const q = Math.floor(w.ledger.balance(actor, c.shortId));
    if (q < 1) continue;
    const spot = last.get(c.instr) ?? 0;
    const otm = c.right === 'C' ? Math.max(0, c.strike - spot) : Math.max(0, spot - c.strike);
    const cushion = Math.max(0, spot * 100 * 0.1 - otm * 100 * 0.5);
    n += q * Math.max(100, Math.round(c.mid * 100 + cushion));
  }
  return n;
}

function riskOf(w: World): Record<string, unknown> {
  const i = playerIndex(w);
  const seat = soleSeat(w);
  if (i < 0 || !seat) return { open: false, word: 'Closed', eventId: w.genesis, used: 0, limit: 0, distance: 0, sold: [], taken: lastTaken };
  const id = econ(w).P.id(i);
  const cash = Math.floor(w.ledger.balance(id, DEP));
  const futPosted = Math.round(w.ledger.balance(id, 'cmdty:margin'));
  const optPosted = Math.round(w.ledger.balance(id, 'opt:margin'));
  let loanOwed = 0;
  let loanRate = 0;
  const book = w.state.banking as { ln: number; lnOpen: Uint8Array; lnPerson: Int32Array; lnKind: Uint8Array; lnRate: Float64Array } | undefined;
  if (book) for (let k = 0; k < book.ln; k++) {
    if (!book.lnOpen[k] || book.lnPerson[k] !== i || book.lnKind[k] !== 3) continue;
    loanOwed += Math.floor(w.ledger.issued.get('pl_' + k) ?? 0);
    if (book.lnRate[k] > 0) loanRate = book.lnRate[k];
  }
  const limit = pledgeValue(w, id);
  const sale = saleValue(w, id);
  let futNote = 0;
  const cmd = w.state.commodities as { books?: { lot: number; tenors: { longId: string; shortId: string; px: number }[] }[] } | undefined;
  for (const b of cmd?.books ?? []) for (const t of b.tenors) {
    const net = Math.round(w.ledger.balance(id, t.longId) - w.ledger.balance(id, t.shortId));
    if (net) futNote += Math.abs(net) * t.px * b.lot;
  }
  const futInit = Math.round(futNote * 0.12);
  const futMaint = Math.round(futNote * 0.08);
  const optNeed = optRequirement(w, id);
  const optMaint = Math.round(optNeed * 0.72);
  const open = seat.margin || loanOwed > 0 || futPosted > 0 || optPosted > 0 || seat.loans.length > 0;
  const cushions: { kind: string; cents: number }[] = [];
  if (loanOwed > 0 || seat.margin) cushions.push({ kind: 'loan', cents: sale - loanOwed });
  if (futNote > 0) cushions.push({ kind: 'futures', cents: futPosted - futMaint });
  if (optNeed > 0) cushions.push({ kind: 'options', cents: Math.min(optPosted - optMaint, optPosted + cash - optNeed) });
  let distance = cushions[0] ?? { kind: 'loan', cents: sale };
  for (const c of cushions) if (c.cents < distance.cents) distance = c;
  const called = (loanOwed > 0 && loanOwed > sale) || (futNote > 0 && futPosted < futMaint) || (optNeed > 0 && (optPosted < optMaint || optPosted + cash < optNeed));
  const thin = !called && ((limit > 0 && loanOwed > limit * 0.85) || (futInit > 0 && futPosted < futInit) || (optNeed > 0 && optPosted < optNeed));
  const close = !called && !thin && limit > 0 && loanOwed > limit * 0.5;
  const word = !open ? 'Closed' : called ? 'Called' : thin ? 'Thin' : close ? 'Close' : 'Room';
  const sold: { instr: string; symbol: string; name: string; qty: number; proceeds: number; eventId: number }[] = [];
  for (const st of stocksOf(w)) {
    const qty = Math.floor(w.ledger.balance(id, st.instr));
    if (qty < 1) continue;
    const f = econ(w).firms.find((x) => x.id === st.issuer);
    sold.push({
      instr: st.instr,
      symbol: symbolOf(st.instr),
      name: issuerName(w, st.issuer),
      qty,
      proceeds: saleProceeds(w, st.instr, qty, id),
      eventId: st.moveEv ?? f?.priceWho ?? f?.profitEv ?? w.genesis,
    });
  }
  const eventId = w.events.last('loan.margin') ?? w.events.last('loan.grant') ?? w.events.last('futures.marginCall') ?? w.events.last('opt.marginCall') ?? (seat.arrived >= 0 ? seat.arrived : w.genesis);
  return {
    open, word, cash, limit, loanOwed, loanRate, sale,
    futPosted, futInit, futMaint, futNote,
    optPosted, optNeed, optMaint,
    distance: distance.cents, distanceKind: distance.kind,
    used: loanOwed, sold, taken: lastTaken, eventId,
  };
}

function fxOf(w: World): Record<string, unknown> {
  const abroad = w.state.abroad as { mid?: number; policy?: number; fx?: string; rateEv?: number; fxWho?: number; cfg?: { name?: string; currency?: string; spread?: number } } | undefined;
  const i = playerIndex(w);
  const id = i >= 0 ? econ(w).P.id(i) : '';
  const mid = abroad?.mid ?? 0;
  const spread = abroad?.cfg?.spread ?? 0;
  const half = spread / 2;
  const fx = abroad?.fx ?? '';
  return {
    name: abroad?.cfg?.name ?? '',
    currency: abroad?.cfg?.currency ?? '',
    mid,
    bid: mid * (1 - half),
    ask: mid * (1 + half),
    held: id && fx ? Math.floor(w.ledger.balance(id, fx)) : 0,
    bonds: id ? Math.floor(w.ledger.balance(id, 'bond:fx')) : 0,
    eventId: abroad?.fxWho ?? abroad?.rateEv ?? w.genesis,
    homeRate: econ(w).policyRate,
    foreignRate: abroad?.policy ?? 0,
  };
}

function fillText(cmd: Record<string, unknown>): string {
  const k = cmd.kind;
  if (k === 'order') return `${cmd.side} ${cmd.qty} ${cmd.instr}${cmd.limit ? ` @ ${(Number(cmd.limit) / 100).toFixed(2)}` : ''}`;
  if (k === 'bond') return `bond ${cmd.side} ${cmd.bonds} ${cmd.tenor}`;
  if (k === 'fut') return `fut ${cmd.side} ${cmd.side === 'flat' ? '' : cmd.qty + ' '}${cmd.good} m+${cmd.months}`;
  if (k === 'coin') return `coin ${cmd.side} ${cmd.qty} ${cmd.coin}`;
  if (k === 'launch') return 'launch a coin';
  if (k === 'optbuy' || k === 'write') return `${k === 'write' ? 'write' : 'buy'} ${cmd.right === 'P' ? 'put' : 'call'} ${cmd.qty} ${cmd.instr} m+${cmd.months}`;
  if (k === 'optclose') return `close ${cmd.id || cmd.instr}${cmd.qty ? ' ' + cmd.qty : ''}`;
  if (k === 'cash') return `${cmd.op} ${(Number(cmd.cents) / 100).toFixed(2)}`;
  return String(k ?? '');
}

function fillsOf(w: World): { day: number; kind: string; text: string; eventId: number }[] {
  const log = (w.state.player as { log?: { day: number; status: string; cmd?: Record<string, unknown> }[] } | undefined)?.log ?? [];
  const root = (w.state.markets as { root?: number } | undefined)?.root ?? w.genesis;
  const keep = new Set(['order', 'bond', 'fut', 'coin', 'launch', 'optbuy', 'write', 'optclose', 'cash']);
  const out: { day: number; kind: string; text: string; eventId: number }[] = [];
  for (let i = log.length - 1; i >= 0 && out.length < 40; i--) {
    const row = log[i];
    const kind = row?.cmd && typeof row.cmd.kind === 'string' ? row.cmd.kind : '';
    if (!row || row.status !== 'accepted' || !keep.has(kind)) continue;
    out.push({ day: row.day, kind, text: fillText(row.cmd as Record<string, unknown>), eventId: root });
  }
  return out.reverse();
}

function markedBonds(w: World, rows: { instr: string; face: number; eventId: number }[]): { instr: string; face: number; eventId: number; px: number; prev: number; tenor: string }[] {
  const list = (w.state.bonds as { bonds?: { id: string; tenor: string; last: number; prev: number }[] } | undefined)?.bonds ?? [];
  return rows.map((b) => {
    const row = list.find((x) => x.id === b.instr);
    return { ...b, px: row?.last ?? 0, prev: row?.prev ?? row?.last ?? 0, tenor: row?.tenor ?? '' };
  });
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
      holders: topHolders(w, 'eq:bank_1'),
      move: moveLine(w, st?.moveEv ?? econ(w).rateWho ?? econ(w).macroEv),
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
    listed: f.listed,
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
    holders: st ? topHolders(w, st.instr) : topHolders(w, 'eq:' + f.id),
    move: moveLine(w, st?.moveEv ?? f.priceWho ?? f.profitEv ?? econ(w).macroEv),
    news: firmNews(w, f.idx),
    accounts: {
      revenue: Math.round(f.mRev),
      cost: Math.round(f.mCost),
      profit: Math.round(f.lastProfit),
      cash: Math.floor(w.ledger.balance(f.id, DEP)),
      debt: Math.round(w.ledger.issued.get('loan:' + f.id) ?? 0),
    },
    people: staffPeople(w, f),
    plant: {
      units: w.ledger.balance(f.id, CAPITAL),
      word: plantWord(w.ledger.balance(f.id, CAPITAL)),
      eventId: f.profitEv ?? f.priceWho ?? econ(w).macroEv,
    },
    suppliers: suppliersOf(w, f),
    holders: rankedHolders(w, 'eq:' + f.id, 8),
    board: boardOf(w, f),
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
    circle: circlePerson(w, index),
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
  if (pauseNote && speed === 'pause') broadcast('speed', { speed, ...pauseNote });
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

function startOpts(body: unknown): { id: string; cash?: number; difficulty?: number; again?: boolean } | string {
  if (!body || typeof body !== 'object') return 'missing scenario';
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id) return 'missing scenario';
  const out: { id: string; cash?: number; difficulty?: number; again?: boolean } = { id: b.id };
  if (b.again === true) out.again = true;
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
    if (req.method === 'POST' && pathname === '/release') {
      speed = 'pause';
      pumping = false;
      started = false;
      over = false;
      pauseNote = null;
      pauseQueue = [];
      send(res, 200, { ok: true });
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
    if (req.method === 'GET' && pathname === '/panel') { send(res, 200, panelSlice(w, url.searchParams.get('name') || '', url)); return; }
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
      if (over && next !== 'pause') {
        const who = playerIndex(w);
        const alive = who >= 0 && econ(w).P.alive(who);
        send(res, 409, { error: alive ? 'the run is over' : 'you have died' });
        return;
      }
      if (next !== 'pause' && pauseQueue.length) {
        pauseNote = pauseQueue.shift() ?? null;
        speed = 'pause';
        if (pauseNote) broadcast('speed', { speed: 'pause', ...pauseNote });
        send(res, 200, { speed: 'pause' });
        return;
      }
      if (next !== 'pause') pauseNote = null;
      speed = next;
      send(res, 200, { speed });
      pump();
      return;
    }
    if (req.method === 'POST' && pathname === '/act') {
      const body = await readBody(req);
      const line = body && typeof body === 'object' && typeof (body as { line?: unknown }).line === 'string'
        ? (body as { line: string }).line.trim()
        : '';
      let cmd: Command | string;
      if (line) {
        const parsed = parseCommand(line, view(w).firm || '');
        cmd = 'error' in parsed ? parsed.error : parsed;
      } else cmd = commandOf(body);
      if (typeof cmd === 'string') { send(res, 400, { status: 'rejected', why: cmd }); return; }
      if (!booksOk) { send(res, 409, { status: 'rejected', why: 'the books do not balance' }); return; }
      const playerId = body && typeof body === 'object' && typeof (body as { playerId?: unknown }).playerId === 'string'
        ? (body as { playerId: string }).playerId
        : undefined;
      const result = playerId ? act(w, playerId, cmd) : act(w, cmd);
      const held = pauseNote;
      collect(w);
      if (pauseNote && pauseNote !== held) broadcast('speed', { speed: 'pause', ...pauseNote });
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
