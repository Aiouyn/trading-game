// The six stats the player sees, as words, with the event that last moved each one.
// Relationship bytes, facets, memories and habit timers stay off this surface.
import type { World } from '../../kernel/index.ts';
import { DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { GOODS } from '../economy/content.ts';
import { attentionOf } from '../law/index.ts';
import { nudgeStanding, regardOf, standingOf } from '../social/index.ts';
import { standingMult } from './standing.ts';
import { ledgerFlow, outgoings, type Outgoings } from './cashbook.ts';
import { residenceOf } from '../property/index.ts';
import { usd } from './gamedate.ts';

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
  /** Sentences that explain the reading, for its Why?. */
  why?: string[];
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

export interface BudgetLine { id: string; label: string; cents: number; note: string }
export interface HouseholdBudget {
  weekly: number;
  lines: BudgetLine[];
  gross: number;
  tax: number;
  takeHome: number;
  benefit: number;
  benefitEnd: string;
  runwayWeeks: number;
  cash: number;
  why: string[];
}
export interface LifeBoard {
  stats: StatView[];
  choices: ChoiceView[];
  runwayWeeks: number;
  weekly: number;
  levels: Record<StatId, number>;
  budget: HouseholdBudget;
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
/**
 * The one word for an amount of money, cash or net worth alike. Every screen uses this scale (the screens mirror it in
 * src/components/ui/format.ts), so the same wallet always reads the same: five thousand dollars is getting by, not broke.
 */
export function moneyWord(cents: number): string {
  if (cents < 0) return 'In debt';
  if (cents < 25_000) return 'Broke';
  if (cents < 150_000) return 'Short';
  if (cents < 1_500_000) return 'Getting by';
  if (cents < 10_000_000) return 'Comfortable';
  if (cents < 100_000_000) return 'Well off';
  if (cents < 1_000_000_000) return 'Rich';
  return 'Wealthy';
}
export function worthWord(cents: number, _wage?: number): string { return moneyWord(cents); }
export function cashWord(cents: number): string { return moneyWord(cents); }
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

/** The city's shopper thrift. Copied from the economy so a short cash book uses the same week the city will spend. */
function shopThrift(s: EconState): number {
  const n = s.cpiHist.length;
  const prev = n < 2 ? 0 : s.cpiHist[Math.max(0, n - 13)];
  const yoy = n < 2 ? 0.02 : prev > 0 ? s.cpi / prev - 1 : 0;
  const real = s.policyRate - Math.max(-0.02, Math.min(0.12, yoy));
  const cut = 0.8 * Math.max(0, s.policyRate - 0.02) + 1.4 * Math.max(0, real - 0.012);
  const scarce = Math.max(0, 0.04 - s.unemployment);
  return Math.max(0.74, Math.min(1.02, 1 - cut - 5 * scarce));
}

function wageMul(w: World, firmIdx: number): number {
  const prem = (w.state.labour as { prem?: ArrayLike<number> } | undefined)?.prem;
  if (!prem || firmIdx < 0 || firmIdx >= prem.length) return 1;
  const m = prem[firmIdx];
  if (!(m > 0)) return 1;
  return m < 3 ? m : 3;
}

/** A week of spending on the same rule the city uses for a shopper. Income is the stored average only: a wage is not invented when none has been earned. */
export function weeklySpend(w: World, i: number): number {
  const s = econ(w), P = s.P;
  if (i < 0 || i >= P.n) return 0;
  const cash = Math.max(0, Math.floor(w.ledger.balance(P.id(i), DEP)));
  const fear = w.day < P.fearUntil[i] ? 0.8 : 1;
  const inc = P.incEma[i] > 0 ? P.incEma[i] : 0;
  const raw = 7 * (P.cY[i] * fear * shopThrift(s) * inc + 0.001 * cash);
  return Math.max(0, Math.floor(Math.min(cash, raw)));
}

const FOOD = ['GROCERIES'];
const TRANSPORT = ['TRANSIT', 'AIR_TRAVEL'];
const UTILITIES = ['ELECTRICITY', 'NATURAL_GAS', 'TELECOM'];

function basketShare(ids: string[]): number {
  let t = 0;
  for (const id of ids) t += GOODS[id]?.share ?? 0;
  return t;
}

function contractualDebt(w: World, i: number): number {
  const book = w.state.banking as { ln: number; lnOpen: Uint8Array; lnPerson: Int32Array; lnRate: Float64Array } | undefined;
  if (!book || i < 0) return 0;
  let week = 0;
  for (let k = 0; k < book.ln; k++) {
    if (!book.lnOpen[k] || book.lnPerson[k] !== i) continue;
    const owed = Math.floor(w.ledger.issued.get('pl_' + k) ?? 0);
    if (owed <= 0) continue;
    week += owed * book.lnRate[k] / 52;
  }
  return Math.max(0, Math.round(week));
}

/** Rent, food, transport, utilities, debt, tax and the benefit, each from the lease or the cash book. The outgoing lines add up to `weekly`. */
export function householdBudget(w: World, i: number): HouseholdBudget {
  const s = econ(w), P = s.P;
  const empty: HouseholdBudget = {
    weekly: 0, lines: [], gross: 0, tax: 0, takeHome: 0, benefit: 0,
    benefitEnd: 'No benefit on this week.', runwayWeeks: 0, cash: 0,
    why: ['No household is on the book.'],
  };
  if (i < 0 || i >= P.n) return empty;
  const cash = Math.max(0, Math.floor(w.ledger.balance(P.id(i), DEP)));
  const since = 0;
  const home = residenceOf(w, i);
  const rentMonth = home && home.tenure === 'rented' && home.rent > 0 ? home.rent : 0;
  const rentWeek = Math.round(rentMonth * 7 / 30);
  const consBook = ledgerFlow(w, ['consumption', 'consumption.refund'], since);
  const consSpent = Math.max(0, -consBook.cents);
  const useBook = consBook.days >= 14 && consSpent > 0;
  const consWeek = useBook ? Math.round(consSpent / consBook.days * 7) : weeklySpend(w, i);
  const housing = GOODS.HOUSING?.share ?? 0;
  const foodS = basketShare(FOOD);
  const tranS = basketShare(TRANSPORT);
  const utilS = basketShare(UTILITIES);
  const denom = Math.max(0.01, 1 - housing);
  const split = (share: number): number => Math.round(consWeek * (share / denom));
  let food = split(foodS);
  let transport = split(tranS);
  let utilities = split(utilS);
  let other = consWeek - food - transport - utilities;
  if (other < 0) {
    const over = -other;
    const cut = Math.min(food, over);
    food -= cut;
    other = consWeek - food - transport - utilities;
  }
  const debtBook = ledgerFlow(w, ['loan.interest', 'loan.repay'], since);
  const debtSpent = Math.max(0, -debtBook.cents);
  const debt = debtBook.days >= 14 && debtSpent > 0 ? Math.round(debtSpent / debtBook.days * 7) : contractualDebt(w, i);
  const lines: BudgetLine[] = [
    { id: 'rent', label: 'Rent', cents: rentWeek, note: rentMonth > 0 ? `${usd(rentMonth)} a month on the lease, ${usd(rentWeek)} of it in a week.` : 'No lease rent on the book.' },
    { id: 'food', label: 'Food', cents: food, note: useBook ? 'The groceries share of everyday spending on the cash book, with housing taken out so rent is not counted twice.' : 'The groceries share of the week the city will spend from the income already on the book. No wage is assumed.' },
    { id: 'transport', label: 'Transport', cents: transport, note: 'Public transport and air travel, from the same basket.' },
    { id: 'utilities', label: 'Utilities', cents: utilities, note: 'Electricity, gas and telecoms, from the same basket.' },
    { id: 'other', label: 'Other household', cents: other, note: 'The rest of everyday spending once rent, food, transport and utilities are taken out.' },
    { id: 'debt', label: 'Debt service', cents: debt, note: debtBook.days >= 14 && debtSpent > 0 ? 'Interest and repayments on the cash book, as a week.' : debt > 0 ? 'Contractual interest on open loans, a week of the annual rate. Nothing has been posted yet.' : 'No debt service on the book.' },
  ];
  const weekly = lines.reduce((t, l) => t + l.cents, 0);
  const taxRate = s.taxRate || 0;
  const employed = P.employer[i] >= 0;
  const wageBook = ledgerFlow(w, ['wages'], since);
  let gross = 0, tax = 0, takeHome = 0, benefit = 0, benefitEnd = '';
  if (employed) {
    const paid = Math.max(0, wageBook.cents);
    if (wageBook.days >= 7 && paid > 0) {
      takeHome = Math.round(paid / wageBook.days * 7);
      gross = taxRate < 0.95 ? Math.round(takeHome / (1 - taxRate)) : takeHome;
      tax = gross - takeHome;
    } else {
      const m = wageMul(w, P.employer[i]);
      gross = Math.round(P.skill[i] * s.wage * 7 * m);
      tax = Math.round(gross * taxRate);
      takeHome = gross - tax;
    }
    benefitEnd = 'Not drawing. The benefit stops the week a job starts, and pays again only while you are out of work with a work record.';
  } else {
    const paid = Math.max(0, wageBook.cents);
    if (wageBook.days >= 7 && paid > 0) {
      takeHome = Math.round(paid / wageBook.days * 7);
      gross = taxRate < 0.95 ? Math.round(takeHome / (1 - taxRate)) : takeHome;
      tax = gross - takeHome;
    }
    const retired = (P.flags[i] & 2) !== 0;
    const record = P.migrant[i] !== 3;
    if (!retired && record && P.adult(w, i)) {
      benefit = Math.round(s.wage * (s.benefitRate ?? 0.4) * 7 * Math.min(1, P.skill[i]));
      benefitEnd = 'No statutory end date. It pays each week while you are out of work with a work record, and stops the week a job starts.';
    } else if (!record) {
      benefitEnd = 'No benefit: a newcomer with no work record here draws none. It would stop the week a job starts.';
    } else {
      benefitEnd = 'No benefit on this week.';
    }
  }
  const weeks = weekly > 0 ? cash / weekly : cash > 0 ? 99 : 0;
  const shown = weeks >= 99.5 ? 'more than 99' : weeks.toFixed(1);
  const parts = lines.map((l) => `${l.label.toLowerCase()} ${usd(l.cents)}`);
  const why = [
    `A week of outgoings is ${parts.join(' + ')} = ${usd(weekly)}.`,
    `Runway is cash divided by that week: ${usd(cash)} / ${usd(weekly)} = ${shown} weeks before the cash runs out with no money coming in.`,
    employed
      ? `Gross pay is ${usd(gross)} and tax is ${usd(tax)}, so take-home is ${usd(takeHome)}. Tax is already out of pay, so it is not added to the week again.`
      : gross > 0
        ? `Last pay was gross ${usd(gross)}, tax ${usd(tax)}, take-home ${usd(takeHome)}. The job has ended, so that pay is not in this week. Tax was already out of it, and it is not added again.`
        : `Gross pay is ${usd(gross)} and tax is ${usd(tax)}, so take-home is ${usd(takeHome)}. No wage has been posted.`,
    benefit > 0 ? `Benefit is ${usd(benefit)} a week. ${benefitEnd}` : benefitEnd,
  ];
  return { weekly, lines, gross, tax, takeHome, benefit, benefitEnd, runwayWeeks: weeks, cash, why };
}

/** What a choice costs: days of the city's wage, halved for a newcomer's purse and following the player's standing up from there. */
export function feeOf(w: World, days: number): number {
  const st = w.state.player as { ids?: string[]; seat?: Record<string, { who?: number }> } | undefined;
  const me = st?.ids?.[0] ? st.seat?.[st.ids[0]]?.who ?? -1 : -1;
  return Math.max(5000, Math.round(econ(w).wage * days * 0.5 * (me >= 0 ? standingMult(w, me) : 1)));
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

interface Raw { worth: number; cash: number; stress: number; health: number; reputation: number; attention: number; weekly: number; weeks: number; out: Outgoings | null; budget: HouseholdBudget | null }

/** The player's real week of outgoings: the cash book's everyday spending, rent and monthly bills. A newcomer with a short book leans on the city's usual spending until two weeks have passed. */
export function weeklyOut(w: World, i: number, since: number): Outgoings {
  const home = i >= 0 ? residenceOf(w, i) : null;
  const rent = home && home.tenure === 'rented' && home.rent > 0 ? home.rent : 0;
  const out = outgoings(w, Math.max(0, since), rent);
  if (out.days < 14) {
    const model = weeklySpend(w, i);
    const everyday = Math.round((out.everyday * out.days + model * (14 - out.days)) / 14);
    out.weekly += everyday - out.everyday;
    out.everyday = everyday;
  }
  out.weekly = Math.max(1, out.weekly);
  return out;
}

function rawOf(w: World, i: number, counsel: number, since = -1): Raw {
  const s = econ(w), P = s.P;
  const budget = i >= 0 ? householdBudget(w, i) : null;
  const cash = budget ? budget.cash : 0;
  const out = i >= 0 && since >= 0 ? weeklyOut(w, i, since) : null;
  const weekly = budget ? budget.weekly : 0;
  const weeks = budget ? budget.runwayWeeks : 0;
  const standing = i >= 0 ? standingOf(w, i) : { score: 0, eventId: w.genesis, line: '' };
  const heat = i >= 0 ? attentionOf(w, i) : { score: 0, open: 0, flagged: 0, eventId: w.genesis, line: '' };
  return {
    worth: 0, cash,
    stress: i >= 0 ? P.stress[i] : 0,
    health: i >= 0 ? P.health[i] : 0,
    reputation: standing.score,
    attention: Math.max(0, Math.min(100, heat.score - counsel)),
    weekly, weeks, out, budget,
  };
}

function wordOf(id: StatId, raw: Raw, wage: number): string {
  switch (id) {
    case 'worth': return moneyWord(raw.worth);
    case 'cash': return moneyWord(raw.cash);
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

/** The runway, in sentences: cash over a real week of outgoings, and the sum that week is made of. */
function runwayWhy(raw: Raw): string[] {
  if (raw.budget) return [`Cash is ${usd(raw.cash)}: ${moneyWord(raw.cash).toLowerCase()}.`, ...raw.budget.why];
  const weeks = raw.weeks >= 99.5 ? 'more than 99' : raw.weeks.toFixed(1);
  return [
    `Cash is ${usd(raw.cash)}: ${moneyWord(raw.cash).toLowerCase()}.`,
    `Runway is cash divided by that week: ${usd(raw.cash)} / ${usd(raw.weekly)} = ${weeks} weeks before the cash runs out with no money coming in.`,
  ];
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
    if (!e) continue;
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
    if (!e) continue;
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
  const raw = rawOf(w, i, mem.counsel, mem.arrived >= 0 ? (w.events.get(mem.arrived)?.day ?? 0) : 0);
  if (worth !== undefined) raw.worth = worth;
  const levels: Record<StatId, number> = {
    worth: raw.worth, cash: raw.cash, stress: raw.stress, health: raw.health, reputation: raw.reputation, attention: raw.attention,
  };
  const stats: StatView[] = STATS.map(({ id, label }) => ({
    id,
    label,
    word: wordOf(id, raw, 0),
    trend: mem.trend[id] ?? 0,
    hover: hoverOf(id, raw),
    note: noteOf(id, raw),
    eventId: mem.statEv[id] ?? causeFor(w, i, id, mem),
    ...(id === 'cash' ? { why: runwayWhy(raw) } : id === 'worth' ? { why: [`Net worth is ${usd(raw.worth)}: ${moneyWord(raw.worth).toLowerCase()}. It is your cash plus what everything you hold would bring if sold now, less what you owe.`] } : {}),
  }));
  const choices: ChoiceView[] = CHOICES.map((c) => {
    const until = mem.cool[c.id] ?? -1;
    const left = until > w.day ? until - w.day : 0;
    return { id: c.id, label: c.label, cost: feeOf(w, c.days), left, line: c.line };
  });
  return { stats, choices, runwayWeeks: raw.weeks, weekly: raw.weekly, levels, budget: raw.budget ?? householdBudget(w, -1) };
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
  if (q === 'margin' || q === 'futures') return { id: lastOf('loan.margin', 'player.margin', 'opt.marginCall', 'court.bankruptcy', 'cmdty.fill', 'cmdty.mark', 'player.fut') };
  if (q === 'loan' || q === 'loans' || q === 'mortgage') return { id: lastOf('court.bankruptcy', 'loan.shortfall', 'loan.margin', 'player.bankrupt', 'bank.loan', 'bank.draw', 'player.home') };
  if (q === 'bond' || q === 'bonds') return { id: lastOf('bond.fill', 'bond.trade', 'bond.issue') };
  if (q === 'stake') {
    // Without a stake in the employer there is nothing to explain; do not fall through to an unrelated market move.
    const s0 = econ(w);
    const e = i >= 0 ? s0.P.employer[i] : -1;
    const f = e >= 0 ? s0.firms[e] : undefined;
    if (!f || w.ledger.balance(s0.P.id(i), 'eq:' + f.id) < 1) return { error: 'you hold no stake in your employer. why shares shows the market; why price FIRM shows a firm' };
  }
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
  const known = [...board.stats.map((x) => x.id), 'wage', 'rate', 'jobs', 'inflation', 'fx', 'index', 'price <name>', 'staff <firm>', 'profit <firm>'];
  return { error: `no number called ${thing}. try ${known.slice(0, 8).join(', ')}` };
}

export { regardOf };
