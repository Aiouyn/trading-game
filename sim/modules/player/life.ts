// The six stats the player sees, as words, with the event that last moved each one.
// Relationship bytes, facets, memories and habit timers stay off this surface.
import type { World } from '../../kernel/index.ts';
import { DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { attentionOf } from '../law/index.ts';
import { nudgeStanding, regardOf, standingOf } from '../social/index.ts';

export type StatId = 'worth' | 'cash' | 'stress' | 'health' | 'reputation' | 'attention';
export type ChoiceId = 'holiday' | 'donate' | 'lawyer' | 'clinic' | 'overtime';

export interface StatView {
  id: StatId;
  label: string;
  word: string;
  trend: -1 | 0 | 1;
  hover: string;
  note: string;
  eventId: number;
}

export interface ChoiceView {
  id: ChoiceId;
  label: string;
  cost: number;
  left: number;
  line: string;
}

export interface LifeMemory {
  arrived: number;
  counsel: number;
  statEv: Partial<Record<StatId, number>>;
  mark: Record<StatId, number> | null;
  trend: Partial<Record<StatId, -1 | 0 | 1>>;
  words: Partial<Record<StatId, string>>;
  cool: Partial<Record<ChoiceId, number>>;
  /** The player's own cash event: a wage, a purchase, or the cash they hold. Never a stranger's. */
  moneyEv?: number;
  payEv?: number;
  payCents?: number;
  spendEv?: number;
  spendCents?: number;
}

export interface LifeBoard {
  stats: StatView[];
  choices: ChoiceView[];
  runwayWeeks: number;
  weekly: number;
  levels: Record<StatId, number>;
}

const STATS: { id: StatId; label: string }[] = [
  { id: 'worth', label: 'worth' },
  { id: 'cash', label: 'cash' },
  { id: 'stress', label: 'stress' },
  { id: 'health', label: 'health' },
  { id: 'reputation', label: 'reputation' },
  { id: 'attention', label: 'attention' },
];

const CHOICES: { id: ChoiceId; label: string; days: number; cool: number; line: string }[] = [
  { id: 'holiday', label: 'holiday', days: 20, cool: 360, line: 'lowers stress, costs money and a month' },
  { id: 'donate', label: 'donate', days: 15, cool: 90, line: 'raises reputation, costs money' },
  { id: 'lawyer', label: 'lawyer', days: 25, cool: 180, line: 'lowers regulator attention, costs money' },
  { id: 'clinic', label: 'clinic', days: 8, cool: 90, line: 'raises health, costs money' },
  { id: 'overtime', label: 'overtime', days: 5, cool: 30, line: 'raises cash, costs stress' },
];

const econ = (w: World): EconState => w.state.economy as EconState;

export function stressWord(n: number): string {
  if (n >= 140) return 'Breaking';
  if (n >= 70) return 'Strained';
  return 'Calm';
}
export function healthWord(n: number): string {
  if (n >= 75) return 'Sound';
  if (n >= 45) return 'Worn';
  return 'Failing';
}
export function worthWord(cents: number, wage: number): string {
  const year = Math.max(1, wage * 360);
  if (cents < 0) return 'Ruined';
  if (cents < year * 0.5) return 'Thin';
  if (cents < year * 4) return 'Modest';
  if (cents < year * 20) return 'Comfortable';
  return 'Wealthy';
}
export function cashWord(weeks: number): string {
  if (weeks < 2) return 'Broke';
  if (weeks < 8) return 'Tight';
  if (weeks < 26) return 'Holding';
  return 'Flush';
}
export function repWord(n: number): string {
  if (n >= 70) return 'Admired';
  if (n >= 45) return 'Known';
  if (n >= 25) return 'Slight';
  return 'Unknown';
}
export function heatWord(n: number): string {
  if (n >= 70) return 'Hunted';
  if (n >= 40) return 'Watched';
  if (n >= 15) return 'Noticed';
  return 'Quiet';
}

export function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return sign + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A week of spending on the same rule the city uses for a shopper. */
export function weeklySpend(w: World, i: number): number {
  const s = econ(w), P = s.P;
  if (i < 0 || i >= P.n) return 1;
  const cash = Math.floor(w.ledger.balance(P.id(i), DEP));
  const thrift = Math.max(0.88, 1 - 0.8 * Math.max(0, s.policyRate - 0.02));
  const fear = w.day < P.fearUntil[i] ? 0.8 : 1;
  const inc = P.incEma[i] > 1 ? P.incEma[i] : s.wage * Math.max(0.4, P.skill[i]) * (1 - (s.taxRate || 0));
  return Math.max(1, Math.floor(7 * (P.cY[i] * fear * thrift * inc + 0.001 * Math.max(0, cash))));
}

export function feeOf(w: World, days: number): number {
  return Math.max(10000, Math.round(econ(w).wage * days));
}

function sign(n: number): -1 | 0 | 1 {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

function blankMemory(): LifeMemory {
  return { arrived: -1, counsel: 0, statEv: {}, mark: null, trend: {}, words: {}, cool: {} };
}

export function memoryOf(st: Partial<LifeMemory> | undefined): LifeMemory {
  const m = blankMemory();
  if (!st) return m;
  m.arrived = st.arrived ?? -1;
  m.counsel = st.counsel ?? 0;
  m.statEv = st.statEv ?? {};
  m.mark = st.mark ?? null;
  m.trend = st.trend ?? {};
  m.words = st.words ?? {};
  m.cool = st.cool ?? {};
  m.moneyEv = st.moneyEv;
  m.payEv = st.payEv;
  m.payCents = st.payCents;
  m.spendEv = st.spendEv;
  m.spendCents = st.spendCents;
  return m;
}

interface Raw { worth: number; cash: number; stress: number; health: number; reputation: number; attention: number; weekly: number; weeks: number }

function rawOf(w: World, i: number, counsel: number): Raw {
  const s = econ(w), P = s.P;
  const cash = i >= 0 ? Math.floor(w.ledger.balance(P.id(i), DEP)) : 0;
  const weekly = weeklySpend(w, i);
  const weeks = cash <= 0 ? 0 : cash / weekly;
  const standing = i >= 0 ? standingOf(w, i) : { score: 0, eventId: w.genesis, line: '' };
  const heat = i >= 0 ? attentionOf(w, i) : { score: 0, open: 0, flagged: 0, eventId: w.genesis, line: '' };
  return {
    worth: 0, cash,
    stress: i >= 0 ? P.stress[i] : 0,
    health: i >= 0 ? P.health[i] : 0,
    reputation: standing.score,
    attention: Math.max(0, Math.min(100, heat.score - counsel)),
    weekly, weeks,
  };
}

function wordOf(id: StatId, raw: Raw, wage: number): string {
  switch (id) {
    case 'worth': return worthWord(raw.worth, wage);
    case 'cash': return cashWord(raw.weeks);
    case 'stress': return stressWord(raw.stress);
    case 'health': return healthWord(raw.health);
    case 'reputation': return repWord(raw.reputation);
    case 'attention': return heatWord(raw.attention);
    default: { const n: never = id; return n; }
  }
}

function hoverOf(id: StatId, raw: Raw): string {
  switch (id) {
    case 'worth': return dollars(raw.worth);
    case 'cash': return `${dollars(raw.cash)} · ${raw.weeks.toFixed(1)} weeks`;
    case 'stress': return raw.stress.toFixed(0);
    case 'health': return String(Math.round(raw.health));
    case 'reputation': return raw.reputation.toFixed(0);
    case 'attention': return raw.attention.toFixed(0);
    default: { const n: never = id; return n; }
  }
}

function weeksOf(weeks: number): string {
  if (weeks >= 99.5) return '99+ weeks of costs';
  const n = Math.max(0, Math.round(weeks));
  return `${n} ${n === 1 ? 'week' : 'weeks'} of costs`;
}

function noteOf(id: StatId, raw: Raw): string {
  switch (id) {
    case 'worth': return `(${dollars(raw.worth)})`;
    case 'cash': return `(${dollars(raw.cash)} cash, ${weeksOf(raw.weeks)})`;
    case 'stress': return `(${Math.round(raw.stress)})`;
    case 'health': return `(${Math.round(raw.health)})`;
    case 'reputation': return `(${Math.round(raw.reputation)})`;
    case 'attention': return `(${Math.round(raw.attention)})`;
    default: { const n: never = id; return n; }
  }
}

function causeFor(w: World, i: number, id: StatId, mem: LifeMemory): number {
  const s = econ(w), P = s.P;
  const arrived = mem.arrived >= 0 ? mem.arrived : s.macroEv >= 0 ? s.macroEv : w.genesis;
  if (id === 'reputation' && i >= 0) {
    const ev = standingOf(w, i).eventId;
    return ev >= 0 ? ev : arrived;
  }
  if (id === 'attention' && i >= 0) {
    const ev = attentionOf(w, i).eventId;
    return ev >= 0 ? ev : arrived;
  }
  if (id === 'health') {
    const ev = w.events.last('player.health') ?? w.events.last('player.clinic') ?? (i >= 0 ? P.lastEv[i] : -1);
    return ev !== undefined && ev >= 0 ? ev : arrived;
  }
  if (id === 'stress' && i >= 0 && P.lastEv[i] >= 0) return P.lastEv[i];
  if (id === 'cash') return ownMoneyId(w, i, mem);
  return arrived;
}

const OWN_MONEY = new Set(['player.overtime', 'player.holiday', 'player.donate', 'player.lawyer', 'player.clinic', 'loan.grant']);

function personId(w: World, i: number): string {
  return i >= 0 ? econ(w).P.id(i) : '';
}

/** A cash event this seat recorded, or the latest one that names the player's own money. */
function ownMoneyId(w: World, i: number, mem: LifeMemory): number {
  const arrived = mem.arrived >= 0 ? mem.arrived : econ(w).macroEv >= 0 ? econ(w).macroEv : w.genesis;
  if (mem.moneyEv !== undefined && mem.moneyEv >= 0) {
    const e = w.events.get(mem.moneyEv);
    if (e) return e.id;
  }
  if (i < 0) return arrived;
  const pid = personId(w, i);
  const fromDay = w.events.get(arrived)?.day ?? 0;
  for (let id = w.events.count - 1; id >= 0; id--) {
    const e = w.events.get(id);
    if (!e) break;
    if (e.day < fromDay) break;
    if (e.kind.startsWith('life.') || (e.actor === pid && OWN_MONEY.has(e.kind))) return e.id;
  }
  return arrived;
}

function mentions(msg: string, n: number): boolean {
  const re = /\$?\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg))) {
    const v = Number(m[0].replace(/[$,]/g, ''));
    if (!Number.isFinite(v)) continue;
    if (v === n || Math.round(v) === n || Math.round(v * 100) === n) return true;
  }
  return false;
}

function centsMatch(cents: number, n: number): boolean {
  if (!(cents > 0) || !Number.isFinite(n)) return false;
  return cents === n || Math.round(cents / 100) === n;
}

/**
 * A dollar figure the player can see. The head of the chain is their wage, their purchase,
 * or their own cash. A stranger's event id is not an answer.
 */
export function explainNumber(w: World, n: number, mem: LifeMemory, person?: number): { id: number } | { error: string } {
  const i = person ?? (w.state.player as { who?: number } | undefined)?.who ?? -1;
  if (!Number.isFinite(n) || n < 0 || i < 0) return { error: 'that number is not yours' };
  const pid = personId(w, i);
  const arrived = mem.arrived >= 0 ? mem.arrived : w.genesis;
  const fromDay = w.events.get(arrived)?.day ?? 0;
  for (let id = w.events.count - 1; id >= 0; id--) {
    const e = w.events.get(id);
    if (!e) break;
    if (e.day < fromDay) break;
    const own = e.kind.startsWith('life.') || e.actor === pid;
    if (own && mentions(e.msg, n)) return { id: e.id };
  }
  const cash = Math.floor(w.ledger.balance(pid, DEP));
  if (centsMatch(cash, n)) return { id: ownMoneyId(w, i, mem) };
  if (mem.payCents && centsMatch(mem.payCents, n) && mem.payEv !== undefined && mem.payEv >= 0) return { id: mem.payEv };
  if (mem.spendCents && centsMatch(mem.spendCents, n) && mem.spendEv !== undefined && mem.spendEv >= 0) return { id: mem.spendEv };
  const ev = w.events.get(n);
  if (ev && ev.actor === pid && ev.day >= fromDay) return { id: ev.id };
  return { error: 'that number is not yours' };
}

export function lifeBoard(w: World, i: number, mem: LifeMemory, worth?: number): LifeBoard {
  const s = econ(w);
  const raw = rawOf(w, i, mem.counsel);
  if (worth !== undefined) raw.worth = worth;
  const levels: Record<StatId, number> = {
    worth: raw.worth, cash: raw.cash, stress: raw.stress, health: raw.health, reputation: raw.reputation, attention: raw.attention,
  };
  const stats: StatView[] = STATS.map(({ id, label }) => ({
    id,
    label,
    word: wordOf(id, raw, s.wage),
    trend: mem.trend[id] ?? 0,
    hover: hoverOf(id, raw),
    note: noteOf(id, raw),
    eventId: mem.statEv[id] ?? causeFor(w, i, id, mem),
  }));
  const choices: ChoiceView[] = CHOICES.map((c) => {
    const until = mem.cool[c.id] ?? -1;
    const left = until > w.day ? until - w.day : 0;
    return { id: c.id, label: c.label, cost: feeOf(w, c.days), left, line: c.line };
  });
  return { stats, choices, runwayWeeks: raw.weeks, weekly: raw.weekly, levels };
}

/** Remember yesterday's levels and, when a word changes, name the player on a new event. */
export function noteBoard(w: World, i: number, mem: LifeMemory, worth: number): void {
  const P = econ(w).P;
  const board = lifeBoard(w, i, mem, worth);
  const now = board.levels;
  const prev = mem.mark;
  for (const s of board.stats) {
    mem.trend[s.id] = prev ? sign(now[s.id] - prev[s.id]) : 0;
    if (mem.statEv[s.id] === undefined || mem.words[s.id] !== s.word) {
      const cause = causeFor(w, i, s.id, mem);
      const arrived = mem.arrived >= 0 ? mem.arrived : cause;
      const causes = arrived !== cause ? [cause, arrived] : [cause];
      mem.statEv[s.id] = w.events.emit('player.stat', `${P.name(i)} is ${s.word} (${s.label})`, causes, P.id(i));
    }
    mem.words[s.id] = s.word;
  }
  mem.mark = now;
}

export function coolLeft(mem: LifeMemory, id: ChoiceId, day: number): number {
  const until = mem.cool[id] ?? -1;
  return until > day ? until - day : 0;
}

export function choiceSpec(id: ChoiceId): { days: number; cool: number; line: string } {
  const c = CHOICES.find((x) => x.id === id);
  if (!c) return { days: 1, cool: 30, line: '' };
  return c;
}

/** Pay a fee to the government. The books move only through the ledger. */
export function payGov(w: World, from: string, cents: number, reason: string, cause: number): boolean {
  return pay(w, from, GOV, cents, reason, cause);
}

export function firmByKey(w: World, key: string): Firm | undefined {
  const k = key.toLowerCase();
  for (const f of econ(w).firms) {
    if (f.closed) continue;
    const bare = f.id.startsWith('frm_') ? f.id.slice(4) : f.id;
    if (f.id.toLowerCase() === k || bare === k || f.name.toLowerCase() === k) return f;
  }
  return undefined;
}

const ALIAS: Record<string, StatId> = {
  worth: 'worth', 'net worth': 'worth', networth: 'worth', nw: 'worth',
  cash: 'cash', runway: 'cash', money: 'cash',
  stress: 'stress',
  health: 'health',
  reputation: 'reputation', rep: 'reputation', standing: 'reputation',
  attention: 'attention', regulator: 'attention', 'regulator attention': 'attention', heat: 'attention',
};

const WORD: Record<string, StatId> = {
  ruined: 'worth', thin: 'worth', modest: 'worth', comfortable: 'worth', wealthy: 'worth',
  broke: 'cash', tight: 'cash', holding: 'cash', flush: 'cash',
  calm: 'stress', strained: 'stress', breaking: 'stress',
  failing: 'health', worn: 'health', sound: 'health',
  unknown: 'reputation', slight: 'reputation', known: 'reputation', admired: 'reputation',
  quiet: 'attention', noticed: 'attention', watched: 'attention', hunted: 'attention',
};

/** The event behind a number the status line or a screen can show. */
export function explainThing(w: World, thing: string, mem: LifeMemory, worth?: number): { id: number } | { error: string } {
  const q = thing.trim().toLowerCase();
  if (!q) return { error: 'usage: why <thing>' };
  const i = (w.state.player as { who?: number } | undefined)?.who ?? -1;
  if (/^\d+$/.test(q)) return explainNumber(w, Number(q), mem, i);
  const board = lifeBoard(w, i, mem, worth);
  const statId = ALIAS[q] ?? WORD[q];
  if (statId) {
    if (statId === 'cash') return { id: ownMoneyId(w, i, mem) };
    const s = board.stats.find((x) => x.id === statId);
    if (s) return { id: s.eventId };
  }
  const s = econ(w);
  if (q === 'wage' || q === 'wages' || q === 'pay') return { id: s.wageWho ?? s.wageEv ?? w.genesis };
  if (q === 'rate' || q === 'policy') return { id: s.rateWho ?? s.rateEv ?? w.genesis };
  if (q === 'jobs' || q === 'unemployment') return { id: s.jobsWho ?? w.events.last('macro.jobs') ?? s.macroEv };
  if (q === 'inflation' || q === 'cpi') return { id: w.events.last('macro.cpi') ?? s.macroEv };
  if (q === 'fx' || q === 'exchange') {
    const fx = w.state.abroad as { fxWho?: number; rateEv?: number } | undefined;
    return { id: fx?.fxWho ?? fx?.rateEv ?? w.genesis };
  }
  if (q === 'index' || q === 'idx') return { id: w.events.last('mkt.who') ?? w.events.last('mkt.move') ?? w.genesis };
  const arrived = mem.arrived >= 0 ? mem.arrived : w.genesis;
  const lastOf = (...kinds: string[]): number => {
    for (const k of kinds) {
      const id = w.events.last(k);
      if (id !== undefined && id >= 0) return id;
    }
    return arrived;
  };
  if (q === 'age') return { id: i >= 0 && econ(w).P.lastEv[i] >= 0 ? econ(w).P.lastEv[i] : arrived };
  if (q === 'margin' || q === 'futures') return { id: lastOf('cmdty.fill', 'cmdty.mark', 'player.fut') };
  if (q === 'loan' || q === 'loans' || q === 'mortgage') return { id: lastOf('bank.loan', 'bank.draw', 'player.home') };
  if (q === 'bond' || q === 'bonds') return { id: lastOf('bond.fill', 'bond.trade', 'bond.issue') };
  if (q === 'share' || q === 'shares' || q === 'stake') return { id: lastOf('mkt.who', 'mkt.move', 'mkt.fill') };
  if (q === 'order' || q === 'orders') return { id: lastOf('mkt.fill', 'mkt.who', 'player.order') };
  if (q === 'coin' || q === 'coins') return { id: lastOf('coin.trade', 'coin.launch', 'crypto.trade') };
  if (q === 'conviction' || q === 'convictions') return { id: lastOf('law.judgment', 'law.charge') };
  if (q === 'office' || q === 'offices') return { id: lastOf('pol.seated', 'pol.election', 'pol.office') };
  if (q === 'founded' || q === 'firms' || q === 'controlled') return { id: lastOf('firm.founded', 'firm.control', 'firm.takeover') };
  if (q === 'school') return { id: lastOf('player.school', 'person.school') };
  if (q === 'family' || q === 'children' || q === 'child') return { id: lastOf('player.birth', 'player.wed') };
  const parts = q.split(/\s+/);
  const head = parts[0];
  const rest = parts.slice(1).join(' ');
  if ((head === 'price' || head === 'px' || head === 'staff' || head === 'workers' || head === 'profit' || head === 'wage') && rest) {
    const firm = firmByKey(w, rest);
    const stocks = (w.state.markets as { stocks?: { instr: string; issuer: string; moveEv?: number }[] } | undefined)?.stocks ?? [];
    const st = stocks.find((x) => {
      if (firm && (x.issuer === firm.id || x.instr === 'eq:' + firm.id)) return true;
      const bare = x.instr.startsWith('eq:') ? x.instr.slice(3) : x.instr;
      const key = bare.startsWith('frm_') ? bare.slice(4) : bare;
      return x.instr.toLowerCase() === rest || x.issuer.toLowerCase() === rest || key === rest;
    });
    if (head === 'price' || head === 'px') {
      if (st?.moveEv !== undefined && st.moveEv >= 0) return { id: st.moveEv };
      if (st) {
        const root = (w.state.markets as { root?: number } | undefined)?.root;
        if (root !== undefined && root >= 0) return { id: root };
      }
      if (firm) return { id: firm.priceWho ?? firm.priceEv ?? firm.profitEv ?? s.macroEv };
      return { error: `no price for ${rest}` };
    }
    if (!firm && st) {
      const named = econ(w).firms.find((f) => f.id === st.issuer);
      if (named) {
        if (head === 'staff' || head === 'workers') return { id: named.staffEv ?? named.layoffEv ?? named.ceoEv ?? s.jobsWho ?? s.macroEv };
        if (head === 'profit') return { id: named.profitEv ?? named.priceWho ?? s.macroEv };
      }
    }
    if (!firm) return { error: `no firm ${rest}` };
    if (head === 'staff' || head === 'workers') return { id: firm.staffEv ?? firm.layoffEv ?? firm.ceoEv ?? s.jobsWho ?? s.macroEv };
    if (head === 'profit') return { id: firm.profitEv ?? firm.priceWho ?? firm.priceEv ?? s.macroEv };
    if (head === 'wage') return { id: s.wageWho ?? s.wageEv };
  }
  if ((head === 'staff' || head === 'workers' || head === 'profit') && !rest && i >= 0) {
    const emp = econ(w).P.employer[i];
    const firm = emp >= 0 ? econ(w).firms[emp] : undefined;
    if (firm) return explainThing(w, `${head} ${firm.id}`, mem, worth);
  }
  if (head === 'home' && rest) {
    const id = Number(rest);
    if (Number.isInteger(id)) {
      const ev = (w.state.property as { lastSaleEv?: number; priceEv?: number } | undefined);
      return { id: (ev?.lastSaleEv !== undefined && ev.lastSaleEv >= 0 ? ev.lastSaleEv : ev?.priceEv) ?? w.genesis };
    }
  }
  const known = board.stats.map((x) => x.id).concat(['wage', 'rate', 'jobs', 'inflation', 'fx', 'index', 'price <name>', 'staff <firm>', 'profit <firm>']);
  return { error: `no number called ${thing}. try ${known.slice(0, 8).join(', ')}` };
}

export { regardOf };
