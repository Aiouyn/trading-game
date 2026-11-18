// A scenario is a start, a goal and a clock on top of a world from worldgen.
// Money still moves only through the ledger. Shares move; they are not minted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRaws, RawReader } from '../../kernel/content.ts';
import { DAYS_PER_YEAR, type World } from '../../kernel/index.ts';
import { SECTOR_NAMES, SHOCKS } from '../economy/content.ts';
import { BANK, DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { joinFirm, labourOf, leaveJob, retargetLabour } from '../economy/people.ts';
import { simulate } from '../history/boot.ts';
import { applySnapshot, snapshotSeed } from '../history/save.ts';
import { markHolding } from '../markets/index.ts';
import { contactsOf, nudgeLink, seatPerson } from '../social/index.ts';
import { marginLimit } from '../banking/index.ts';
import { owner } from '../corporate/owner.ts';
import { deskOf } from '../earnings/index.ts';
import { challengeOf } from '../history/commands.ts';
import { playerChronicle } from '../history/story.ts';
import { openWorld } from '../../run.ts';
import { repWord } from './life.ts';
import { PLAYER, ensurePlayer, noteScript, onPlayerDay, playerIndex, rememberJob, soleSeat, view, type ScriptNote } from './index.ts';

type Goal =
  | { kind: 'worth'; cents: number }
  | { kind: 'firm'; firm: string }
  | { kind: 'sector'; sector: string }
  | { kind: 'office' }
  | { kind: 'dynasty'; generations: number }
  | { kind: 'crash' }
  | { kind: 'turn'; firm: string; days: number }
  | { kind: 'homes'; count: number }
  | { kind: 'decide'; firm: string }
  | { kind: 'none' };

type Kin = 'none' | 'spouse' | 'child';

interface ScenarioDef {
  id: string;
  name: string;
  story: string[];
  age: number;
  cash: number;
  job: string;
  family: Kin;
  kin: Kin[];
  contacts: number;
  holdings: Record<string, number>;
  inherit: boolean;
  seed: string;
  years: number;
  world: string;
  goal: Goal;
  limit: number;
  loan: number;
  regulator: number;
  rivals: number;
  beginner: boolean;
  hints: Record<string, string>;
  shock: string;
  shockIn: number;
  twist: string;
  /** Percent of the clock. The twist arrives once, before the deadline. */
  twistIn: number;
  /** Personal claim in cents. Zero means none. */
  debt: number;
  /** Personal claim as a fraction of the family stake. Zero means use `debt`. */
  debtPct: number;
  keepPlaying: boolean;
}

export interface ScenarioRun {
  id: string;
  name: string;
  story: string[];
  goal: Goal;
  limit: number;
  deadline: number;
  begun: number;
  indexAtStart: number;
  worthAtStart: number;
  loan: number;
  regulator: number;
  rivals: number;
  beginner: boolean;
  hintsOn: boolean;
  hints: Record<string, string>;
  who: number;
  difficulty: number;
  outcome?: 'win' | 'loss';
  reason?: string;
  shock: string;
  shockIn: number;
  shockUntil?: number;
  fired: boolean;
  twist: string;
  /** Absolute day the twist fires. Zero means there is no twist. */
  twistAt: number;
  twisted: boolean;
  /** One sentence from the twist, kept for the closing paragraph. */
  twistNote: string;
  /** Firm the player has to keep the chief's seat at. Losing it ends the run. */
  seat: string;
  /** Share price, in cents, of a firm goal at the start. The bid-war twist reads it. */
  mark: number;
  /** Written from the world at the start: names, firms and numbers, not the catalog line. */
  opening: string;
  /** Written when the outcome is set, from the world at that moment. */
  closing?: string;
  continueAfter: boolean;
  /** employer-week: the friend whose money is on offer, and the cash they keep ready for the first two months. */
  friend?: number;
  floor?: number;
}

export interface ScenarioCard {
  id: string;
  name: string;
  story: string;
  goal: string;
  limit: string;
  difficulty: string;
  beginner: boolean;
  sandbox: boolean;
}

export interface ScenarioScore {
  worth: number;
  worthX: number;
  indexX: number;
  firms: number;
  reputation: number;
  convictions: number;
  events: string[];
}

export interface ScenarioLive {
  id: string;
  name: string;
  story: string;
  goal: string;
  outcome?: 'win' | 'loss';
  reason?: string;
  hintsOn: boolean;
  showHints: boolean;
  hints: Record<string, string>;
  score?: ScenarioScore;
  code?: string;
  chronicle?: string;
  opening: string;
  closing: string;
}

const contentDir = fileURLToPath(new URL('../../content/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const econ = (w: World): EconState => w.state.economy as EconState;
const money = (cents: number): string => `${cents < 0 ? '-' : ''}$${(Math.abs(Math.round(cents)) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function goalOf(r: RawReader): Goal {
  const args = r.all('GOAL')[0];
  const kind = args?.[0] ?? '';
  switch (kind) {
    case 'WORTH': {
      const dollars = Number(args?.[1]);
      if (!Number.isFinite(dollars) || dollars < 0) throw new Error(`${r.where()}: [GOAL:WORTH] needs a dollar amount`);
      return { kind: 'worth', cents: Math.round(dollars * 100) };
    }
    case 'FIRM': {
      const firm = args?.[1] ?? '';
      if (!firm) throw new Error(`${r.where()}: [GOAL:FIRM] needs a firm id`);
      return { kind: 'firm', firm };
    }
    case 'SECTOR': {
      const sector = args?.[1] ?? '';
      if (!SECTOR_NAMES.includes(sector)) throw new Error(`${r.where()}: unknown sector ${sector}`);
      return { kind: 'sector', sector };
    }
    case 'OFFICE': return { kind: 'office' };
    case 'DYNASTY': {
      const generations = Number(args?.[1]);
      if (!Number.isInteger(generations) || generations < 1) throw new Error(`${r.where()}: [GOAL:DYNASTY] needs a number of generations`);
      return { kind: 'dynasty', generations };
    }
    case 'CRASH': return { kind: 'crash' };
    case 'TURN': {
      const days = Number(args?.[1]);
      if (!Number.isFinite(days) || days <= 0) throw new Error(`${r.where()}: [GOAL:TURN] needs days of wages to keep in the box`);
      return { kind: 'turn', firm: '', days };
    }
    case 'HOMES': {
      const count = Number(args?.[1]);
      if (!Number.isInteger(count) || count < 1) throw new Error(`${r.where()}: [GOAL:HOMES] needs a count`);
      return { kind: 'homes', count };
    }
    case 'NONE': return { kind: 'none' };
    default: throw new Error(`${r.where()}: unknown goal ${kind || '(missing)'}`);
  }
}

function kinList(r: RawReader, family: Kin): Kin[] {
  const raw = r.str('KIN', '');
  if (!raw) return [family];
  const out: Kin[] = [];
  for (const part of raw.split(',')) {
    const v = part.trim();
    if (v !== 'none' && v !== 'spouse' && v !== 'child') throw new Error(`${r.where()}: [KIN] is none, spouse or child`);
    out.push(v);
  }
  return out.length ? out : [family];
}

function familyOf(r: RawReader): ScenarioDef['family'] {
  const v = r.str('FAMILY', 'none');
  switch (v) {
    case 'none':
    case 'spouse':
    case 'child': return v;
    default: throw new Error(`${r.where()}: [FAMILY] is none, spouse or child`);
  }
}

function loadOne(r: RawReader): ScenarioDef {
  const shock = r.str('SHOCK', '');
  if (shock && !SHOCKS.some((s) => s.id === shock)) throw new Error(`${r.where()}: unknown shock ${shock}`);
  const hints: Record<string, string> = {};
  for (const args of r.all('HINT')) {
    const screen = args[0];
    const text = args.slice(1).join(':');
    if (!screen || !text) throw new Error(`${r.where()}: [HINT:screen:text] expected`);
    hints[screen] = text;
  }
  return {
    id: r.raw.id,
    name: r.str('NAME'),
    story: r.all('STORY').map((a) => a.join(':')).filter(Boolean),
    age: r.num('AGE', 30),
    cash: r.num('CASH', 0),
    job: r.str('JOB', 'any'),
    family: familyOf(r),
    kin: kinList(r, familyOf(r)),
    contacts: r.num('CONTACTS', 4),
    holdings: r.pairs('HOLD'),
    inherit: r.has('INHERIT'),
    seed: r.str('SEED', '1'),
    years: r.num('YEARS', 0),
    world: r.str('WORLD', ''),
    goal: goalOf(r),
    limit: r.num('LIMIT', 0),
    loan: r.num('LOAN', 1),
    regulator: r.num('REGULATOR', 1),
    rivals: r.num('RIVALS', 1),
    beginner: r.has('BEGINNER'),
    hints,
    shock,
    shockIn: r.num('SHOCK_IN', 0),
    twist: r.str('TWIST', ''),
    twistIn: r.num('TWIST_IN', 0),
    debt: Math.round(r.num('DEBT', 0) * 100),
    debtPct: r.num('DEBT_PCT', 0) / 100,
    keepPlaying: r.has('CONTINUE'),
  };
}

const catalog: ScenarioDef[] = loadRaws(process.env.SIM_CONTENT ?? contentDir).filter((raw) => raw.type === 'SCENARIO').map((raw) => loadOne(new RawReader(raw)));

const EMPLOYER_WEEK: ScenarioDef = {
  id: 'employer-week', name: 'Employer week',
  story: ['You work at a small listed firm with a quarter about to print. A friend in finance has a head start on what the street thinks, the bank will write you a credit line against your shares, and the board cannot decide between selling a division and laying people off. A stake would let you decide.'],
  age: 34, cash: 40000, job: 'small', family: 'none', kin: ['none', 'spouse'], contacts: 6, holdings: {}, inherit: false,
  seed: '3', years: 1, world: '', goal: { kind: 'decide', firm: '' }, limit: 360, loan: 1, regulator: 1, rivals: 1, beginner: false, hints: {},
  shock: '', shockIn: 0, twist: '', twistIn: 0, debt: 0, debtPct: 0, keepPlaying: false,
};
catalog.push(EMPLOYER_WEEK);

/** The economy lets go, and poaches, whoever joined a firm last. A person put at the front of the list keeps the desk for the week. */
function shelter(s: EconState, person: number, f: Firm): void {
  const P = s.P, k = P.staffPos[person], first = f.staff[0];
  if (P.employer[person] !== f.idx || k < 1 || first === undefined) return;
  f.staff[0] = person; f.staff[k] = first;
  P.staffPos[person] = 0; P.staffPos[first] = k;
}

function decided(w: World, person: number, firmId: string): boolean {
  const f = firmBy(w, firmId);
  if (!f || f.closed || !controls(w, person, f)) return false;
  return (owner(w).choices ?? []).some((c) => c.firm === f.idx && c.by === person);
}

/** Cheapest listed firm with a real staff whose quarter prints this month. */
function smallListed(w: World): Firm | undefined {
  const rows = operating(w).filter((f) => f.listed && f.workers >= 8 && sharePx(w, f.id) >= 500);
  const cap = (f: Firm): number => sharePx(w, f.id) * (w.ledger.issued.get('eq:' + f.id) ?? 0);
  rows.sort((a, b) => cap(a) - cap(b) || (a.id < b.id ? -1 : 1));
  return rows.find((f) => f.idx % 3 === w.month % 3) ?? rows[0];
}

/**
 * The week before the print. Savings and a friend's money are scaled to what control of this firm costs, so the way
 * in is savings, a credit line and a friend, not a legacy. Nothing here touches the firm's own books.
 */
function stageEmployerWeek(w: World, i: number, cause: number): { friend: number; floor: number } {
  const s = econ(w), P = s.P, pid = P.id(i);
  const none = { friend: -1, floor: 0 };
  const f = P.employer[i] >= 0 ? s.firms[P.employer[i]] : undefined;
  if (!f) return none;
  const px = sharePx(w, f.id);
  const issued = Math.floor(w.ledger.issued.get('eq:' + f.id) ?? 0);
  const cost = Math.round(0.3 * issued * px * 1.12);
  setCash(w, pid, Math.max(1_500_000, Math.min(6_000_000, Math.round(cost * 0.3))), cause);
  // Shares in two big names: what the credit line is lent against.
  const big = operating(w).filter((o) => o.listed && o.idx !== f.idx && sharePx(w, o.id) > 0)
    .sort((a, b) => sharePx(w, b.id) * (w.ledger.issued.get('eq:' + b.id) ?? 0) - sharePx(w, a.id) * (w.ledger.issued.get('eq:' + a.id) ?? 0) || (a.id < b.id ? -1 : 1));
  const stock = Math.max(2_500_000, Math.min(6_000_000, Math.round(cost * 0.35)));
  for (const o of big.slice(0, 2)) giveStake(w, i, o, stock / 200, 0.01, cause);
  // A friend from your circle who now works at a firm that prints this month, and has money to put behind you.
  const printing = operating(w).filter((o) => o.listed && o.idx !== f.idx && o.idx % 3 === w.month % 3 && o.staff.length >= 5);
  const pick = printing.find((o) => o.sector === 'FINANCE') ?? printing[0];
  const mates = contactsOf(w, i).filter((c) => c.who >= 0 && P.alive(c.who) && P.adult(w, c.who) && P.employer[c.who] !== f.idx);
  const friend = mates.sort((a, b) => b.trust - a.trust || w.ledger.balance(P.id(b.who), DEP) - w.ledger.balance(P.id(a.who), DEP) || a.who - b.who)[0];
  if (!friend || !pick) return none;
  const seats = new Set(deskOf(w, pick.idx));
  const who = seats.has(friend.who) || pick.ceo === friend.who ? undefined : friend.who;
  if (who === undefined) return none;
  joinFirm(s, who, pick);
  shelter(s, who, pick);
  const floor = Math.max(5_000_000, Math.min(40_000_000, Math.round(cost * 1.5 / 0.4)));
  setCash(w, P.id(who), floor, cause);
  nudgeLink(w, i, who, 40);
  w.events.emit('player.scenario', `${P.name(who)}, who used to work beside ${P.name(i)} at ${f.name}, now works at ${pick.name} and keeps money to spare`, [cause], P.id(who));
  return { friend: who, floor };
}

function aan(phrase: string): string {
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

/** How far the mark sits over the opening book. The chief's firm can still fall, so that mark is a little higher; the heir and the fund sit just over the open. */
function earnRate(id: string): number {
  return id === 'struggling-ceo' ? 105 : 101;
}

function earnedWorth(opened: number, rate: number): number {
  const lifted = Math.ceil((Math.round(opened) * rate) / 100);
  const dollar = Math.ceil(lifted / 100) * 100;
  const above = Math.ceil((Math.round(opened) + 1) / 100) * 100;
  return Math.max(dollar, above);
}

/** Bank deposits, not cash left in the drawer. The twist asks which one the household did. */
function banked(w: World): number {
  return view(w).deposits.reduce((a, d) => a + Math.max(0, d.cents), 0);
}

function cushioned(saved: number, worthAtStart: number): boolean {
  return saved >= Math.round(Math.max(0, worthAtStart) * 0.2);
}

function goalText(g: Goal): string {
  switch (g.kind) {
    case 'worth': return `net worth ${money(g.cents)}`;
    case 'firm': return g.firm && g.firm !== '*' ? `control ${g.firm}` : 'control a listed firm';
    case 'sector': return `control ${aan(g.sector)} firm`;
    case 'office': return 'hold a political office';
    case 'dynasty': return `a dynasty of ${g.generations} generations`;
    case 'crash': return 'survive the crash';
    case 'turn': return g.firm ? `keep the seat at ${g.firm} with ${g.days} days of wages in the box` : `keep the seat with ${g.days} days of wages in the box`;
    case 'homes': return `own ${g.count} ${g.count === 1 ? 'home' : 'homes'} and stay solvent`;
    case 'decide': return g.firm ? `take the chair at ${g.firm} and make the hard choice yourself` : 'take the chair at your employer and make the hard choice yourself';
    case 'none': return 'no goal';
    default: {
      const never: never = g;
      return never;
    }
  }
}

function limitText(days: number): string {
  if (days <= 0) return 'open-ended';
  if (days % 360 === 0) return days === 360 ? '1 year' : `${days / 360} years`;
  if (days % 30 === 0) return `${days / 30} months`;
  return `${days} days`;
}

function diffText(loan: number, regulator: number, rivals: number): string {
  const n = (x: number): string => `${x.toFixed(2)}×`;
  return `loans ${n(loan)} · regulator ${n(regulator)} · rivals ${n(rivals)}`;
}

export function listScenarios(): ScenarioCard[] {
  return catalog.map((sc) => ({
    id: sc.id,
    name: sc.name,
    story: sc.story.join(' '),
    goal: goalText(sc.goal),
    limit: limitText(sc.limit),
    difficulty: diffText(sc.loan, sc.regulator, sc.rivals),
    beginner: sc.beginner,
    sandbox: sc.goal.kind === 'none',
  }));
}

export function runOf(w: World): ScenarioRun | undefined {
  const sc = w.state.scenario as ScenarioRun | undefined;
  if (!sc || typeof sc.id !== 'string') return;
  return sc;
}

function worldDir(rel: string): string | undefined {
  if (!rel) return;
  for (const root of [process.cwd(), repoRoot]) {
    const full = path.resolve(root, rel);
    if (fs.existsSync(path.join(full, 'world.json'))) return full;
  }
  return;
}

function firmBy(w: World, key: string): Firm | undefined {
  const k = key.toLowerCase();
  const id = k.startsWith('frm_') ? k : 'frm_' + k;
  return econ(w).firms.find((f) => !f.closed && (f.id === id || f.id === k || f.name.toLowerCase() === k));
}

function giveShares(w: World, to: string, instr: string, qty: number, cause: number): void {
  if (qty <= 0) return;
  const rows = [...w.ledger.holders(instr).entries()].filter(([id, n]) => id !== to && n > 0);
  rows.sort((a, b) => b[1] - a[1]);
  let need = qty;
  for (const [id, n] of rows) {
    if (need <= 0) break;
    const m = Math.min(need, Math.floor(n));
    if (m > 0 && w.ledger.move(instr, id, to, m, 'player.inheritance', cause)) need -= m;
  }
}

function inheritFirm(w: World, person: number, cause: number): Firm | undefined {
  const s = econ(w);
  const families = s.firms.filter((f) => f.family && !f.closed);
  if (!families.length) return;
  families.sort((a, b) => a.lastProfit - b.lastProfit || a.workers - b.workers || a.idx - b.idx);
  const f = families[0];
  const instr = 'eq:' + f.id;
  const issued = Math.floor(w.ledger.issued.get(instr) ?? 0);
  const want = Math.ceil(issued * 0.55);
  const pid = s.P.id(person);
  const have = Math.floor(w.ledger.balance(pid, instr));
  if (have < want) giveShares(w, pid, instr, want - have, cause);
  f.ceo = person;
  return f;
}

function marry(w: World, person: number): number {
  const P = econ(w).P;
  for (let k = 0; k < P.n; k++) {
    if (k === person || !P.alive(k) || P.spouse[k] >= 0) continue;
    const age = P.age(w, k);
    if (age < 22 || age > 42 || P.retired(k)) continue;
    P.spouse[person] = k;
    P.spouse[k] = person;
    return k;
  }
  return -1;
}

function setCash(w: World, id: string, target: number, cause: number): void {
  const have = Math.floor(w.ledger.balance(id, DEP));
  if (target > have) {
    if (!pay(w, BANK, id, target - have, 'player.endowment', cause)) throw new Error('the endowment did not clear');
  } else if (have > target) {
    if (!pay(w, id, BANK, have - target, 'player.endowment', cause)) throw new Error('the endowment did not clear');
  }
}

/** A hash of the seed. It does not draw on the world, so two replays of one seed match. */
function mix(seed: string, id: string, salt: string): number {
  let h = 2166136261;
  const s = `${seed}|${id}|${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function copyGoal(g: Goal): Goal {
  switch (g.kind) {
    case 'worth': return { kind: 'worth', cents: g.cents };
    case 'firm': return { kind: 'firm', firm: g.firm };
    case 'sector': return { kind: 'sector', sector: g.sector };
    case 'dynasty': return { kind: 'dynasty', generations: g.generations };
    case 'turn': return { kind: 'turn', firm: g.firm, days: g.days };
    case 'homes': return { kind: 'homes', count: g.count };
    case 'decide': return { kind: 'decide', firm: g.firm };
    case 'office': return { kind: 'office' };
    case 'crash': return { kind: 'crash' };
    case 'none': return { kind: 'none' };
    default: {
      const never: never = g;
      return never;
    }
  }
}

function sharePx(w: World, firmId: string): number {
  const stocks = (w.state.markets as { stocks?: { instr: string; last: number }[] } | undefined)?.stocks ?? [];
  for (const s of stocks) if (s.instr === 'eq:' + firmId && s.last > 0) return s.last;
  return 0;
}

function operating(w: World): Firm[] {
  return econ(w).firms.filter((f) => !f.closed).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function pickOf(pool: Firm[], seed: string, id: string, salt: string): Firm | undefined {
  if (!pool.length) return;
  return pool[mix(seed, id, salt) % pool.length];
}

function owePlayer(w: World, pid: string, cents: number, reason: string, cause: number): void {
  const n = Math.round(cents);
  if (n <= 0) return;
  const id = 'scen_' + pid;
  if (!w.ledger.instruments.has(id)) w.ledger.define({ id, kind: 'claim', issuer: pid });
  w.ledger.issue(id, BANK, n, reason, cause);
}

function claimOf(w: World, pid: string): number {
  return Math.floor(w.ledger.issued.get('scen_' + pid) ?? 0);
}

function liquidOf(w: World, pid: string): number {
  let n = Math.floor(w.ledger.balance(pid, DEP));
  const banks = (w.state.banking as { banks?: { depo: string }[] } | undefined)?.banks ?? [];
  for (const b of banks) n += Math.floor(w.ledger.balance(pid, b.depo));
  return n;
}

function giveStake(w: World, person: number, f: Firm, dollars: number, capFraction: number, cause: number): number {
  const px = sharePx(w, f.id);
  const issued = Math.floor(w.ledger.issued.get('eq:' + f.id) ?? 0);
  if (px <= 0 || issued <= 0 || dollars <= 0) return 0;
  const qty = Math.min(Math.floor(issued * capFraction), Math.max(1, Math.round(dollars * 100 / px)));
  giveShares(w, econ(w).P.id(person), 'eq:' + f.id, qty, cause);
  return markedStake(w, person, f);
}

/** What the book will count this stake at. A block is not worth the last print. */
function markedStake(w: World, person: number, f: Firm): number {
  const pid = econ(w).P.id(person);
  const instr = 'eq:' + f.id;
  const qty = Math.floor(w.ledger.balance(pid, instr));
  if (qty < 1) return 0;
  const per = markHolding(w, pid, instr, qty);
  if (per > 0) return Math.round(per * qty);
  return Math.round(sharePx(w, f.id) * qty);
}

/** Listed family firms, cheapest half first so the debt is a real share of the stake. */
function familyPool(w: World): Firm[] {
  const rows = operating(w).filter((f) => f.family && f.listed && sharePx(w, f.id) > 0);
  rows.sort((a, b) => sharePx(w, a.id) * (w.ledger.issued.get('eq:' + a.id) ?? 0) - sharePx(w, b.id) * (w.ledger.issued.get('eq:' + b.id) ?? 0));
  const half = rows.slice(0, Math.max(1, Math.ceil(rows.length / 2)));
  return half.sort((a, b) => (a.id < b.id ? -1 : 1));
}

function chiefPool(w: World): Firm[] {
  const rows = operating(w).filter((f) => f.listed && sharePx(w, f.id) > 0 && f.workers >= 10 && f.workers <= 90);
  return (rows.length ? rows : operating(w).filter((f) => f.listed && sharePx(w, f.id) > 0));
}

function activistPool(w: World, cashCents: number): Firm[] {
  const rows = operating(w).filter((f) => f.listed && sharePx(w, f.id) > 0).map((f) => {
    const cap = sharePx(w, f.id) * (w.ledger.issued.get('eq:' + f.id) ?? 0);
    return { f, cap };
  });
  // Cheap enough to attempt, including names a premium will price out of a cash bid.
  // A bid the cash cannot cover asks the bank for a loan against a cause that is not a number.
  const band = rows.filter((r) => r.cap >= cashCents * 0.12 && r.cap <= cashCents).map((r) => r.f);
  if (band.length) return band.sort((a, b) => (a.id < b.id ? -1 : 1));
  rows.sort((a, b) => a.cap - b.cap);
  return rows.slice(0, 5).map((r) => r.f);
}

function employerPool(w: World): Firm[] {
  const rows = operating(w).filter((f) => f.workers >= 8);
  return rows.length ? rows : operating(w);
}

function shockFor(good: string): string {
  switch (good) {
    case 'GRAIN':
    case 'LIVESTOCK': return 'DROUGHT';
    case 'CRUDE_OIL':
    case 'FUEL': return 'OIL_EMBARGO';
    case 'FREIGHT': return 'PORT_STRIKE';
    case 'COAL':
    case 'IRON_ORE':
    case 'STEEL': return 'MINE_COLLAPSE';
    case 'CHIPS':
    case 'ELECTRONICS': return 'FAB_FIRE';
    case 'ELECTRICITY': return 'HEATWAVE';
    default: return 'PANDEMIC';
  }
}

function prior(w: World, kinds: string[], fallback: number): number {
  for (const k of kinds) {
    const id = w.events.last(k);
    if (id !== undefined) return id;
  }
  return fallback >= 0 ? fallback : w.genesis;
}

function cityLine(w: World, seed: string, id: string): string {
  const s = econ(w);
  const u = (s.unemployment * 100).toFixed(1);
  const rate = (s.policyRate * 100).toFixed(2);
  const pool = operating(w).filter((f) => f.workers > 0);
  const f = pool.length ? pool[mix(seed, id, 'news') % pool.length] : undefined;
  const box = f ? money(Math.floor(w.ledger.balance(f.id, DEP))) : '';
  const who = f ? ` ${f.name} has ${box} in the cash box.` : '';
  return `Unemployment is ${u}% and the policy rate is ${rate}%.${who}`;
}

function named(w: World, i: number): string {
  const P = econ(w).P;
  return i >= 0 && i < P.n ? P.name(i) : 'nobody';
}

function kinLine(w: World, person: number): string {
  const P = econ(w).P;
  const bits: string[] = [];
  const sp = P.spouse[person];
  if (sp >= 0 && P.alive(sp)) bits.push(`married to ${P.name(sp)}`);
  const kids = P.kids(person).filter((k) => P.alive(k)).map((k) => P.name(k));
  if (kids.length === 1) bits.push(`with a child, ${kids[0]}`);
  else if (kids.length) bits.push(`with children ${kids.join(' and ')}`);
  return bits.length ? bits.join(', ') : 'with no family in the city';
}

function jobLine(w: World, person: number): string {
  const P = econ(w).P;
  const e = P.employer[person];
  if (e < 0) return 'holds no job';
  const f = econ(w).firms[e];
  return f ? `works at ${f.name}` : 'holds no job';
}

function familyFirm(w: World, person: number): Firm | undefined {
  const s = econ(w);
  return s.firms.find((f) => f.family && !f.closed && f.ceo === person);
}

/** One paragraph from the city as it stands when the scenario opens. */
function openingOf(w: World, def: ScenarioDef, person: number, worthCents: number, difficulty: number, goalIn: Goal, seed: string): string {
  const P = econ(w).P;
  const name = P.name(person);
  const age = P.age(w, person);
  const cash = money(Math.floor(w.ledger.balance(P.id(person), DEP)));
  const worth = money(worthCents);
  const job = jobLine(w, person);
  const kin = kinLine(w, person);
  const goal = goalText(goalIn);
  const clock = def.limit > 0 ? `The clock is ${limitText(def.limit)}.` : 'There is no clock.';
  const city = cityLine(w, seed, def.id);
  const owed = claimOf(w, P.id(person));
  const debt = owed > 0 ? ` The book owes ${money(owed)}.` : '';
  switch (def.id) {
    case 'first-paycheck':
      return `${name} is ${age} and ${job}, with ${cash} just cleared, ${kin}. ${city} ${clock} The goal is ${goal}. Save it, and buy one share, before the job goes.`;
    case 'heir-debts': {
      const f = familyFirm(w, person);
      const fname = f ? `${f.name}` : 'the family firm';
      const box = f ? money(Math.floor(w.ledger.balance(f.id, DEP))) : cash;
      return `${name}, ${age}, takes the seat at ${fname}, ${kin}. The firm's cash box holds ${box}.${debt} The household shows ${cash} in cash and ${worth} of net worth. ${city} ${clock} The goal is ${goal}.`;
    }
    case 'struggling-ceo': {
      const f = familyFirm(w, person) ?? econ(w).firms.find((x) => x.ceo === person && !x.closed);
      const fname = f ? f.name : 'the firm';
      const box = f ? money(Math.floor(w.ledger.balance(f.id, DEP))) : cash;
      return `${name}, ${age}, is chief executive of ${fname}, ${kin}. The cash box holds ${box}, and the household shows ${cash}.${debt} ${city} ${clock} The goal is ${goal}.`;
    }
    case 'hedge-fund':
      return `${name} is ${age}, ${kin}, with ${cash} of which a large part is outside money.${debt} Net worth is ${worth}. ${city} ${clock} The goal is ${goal}.`;
    case 'property-developer':
      return `${name} is ${age} and ${job}, ${kin}, holding ${cash}. ${city} ${clock} The goal is ${goal}.`;
    case 'activist': {
      const id = goalIn.kind === 'firm' ? goalIn.firm : '';
      const f = id ? firmBy(w, id) : undefined;
      const firm = f ? `${f.name}` : 'a listed firm';
      return `${name} arrives at ${age} with ${cash} and no job, ${kin}, meaning to take ${firm}. ${city} ${clock} The goal is ${goal}.`;
    }
    case 'the-savings': {
      const n = contactsOf(w, person).length;
      return `${name} is ${age} and ${job}. ${cash} already sits in the book, and ${n} people know the name. ${clock} The goal is ${goal}.`;
    }
    case 'hostile-takeover': {
      const id = def.goal.kind === 'firm' ? def.goal.firm : '';
      const f = id ? firmBy(w, id) : undefined;
      const firm = f ? `${f.name} (${f.id})` : id || 'the firm';
      return `${name} arrives at ${age} with ${cash} and no job, meaning to take ${firm}. ${clock} The goal is ${goal}.`;
    }
    case 'the-crash': {
      const shock = SHOCKS.find((s) => s.id === def.shock);
      const what = shock?.text ?? 'a shock hits the city';
      return `${name} is ${age}, ${job}, ${kin}, holding ${cash}. The papers are calm. In ${def.shockIn} days, ${what}. ${clock} The goal is ${goal}.`;
    }
    case 'family-business': {
      const f = familyFirm(w, person);
      const box = f ? money(Math.floor(w.ledger.balance(f.id, DEP))) : cash;
      const fname = f ? `${f.name} (${f.id})` : 'the family firm';
      return `${name}, ${age}, inherits ${fname}, ${kin}. The firm's cash box holds ${box}, and the household book shows ${cash}. ${clock} The goal is ${goal}.`;
    }
    case 'dynasty':
      return `${name} is ${age}, ${job}, ${kin}. The point is the name, and the book shows ${worth}. ${clock} The goal is ${goal}.`;
    case 'the-ministry': {
      const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number } | undefined;
      const seats = `${named(w, pol?.leader ?? -1)} holds the leadership, ${named(w, pol?.finance ?? -1)} the finance ministry, ${named(w, pol?.governor ?? -1)} the central bank, and ${named(w, pol?.regulator ?? -1)} the regulator.`;
      return `${name} is ${age}, holds no office, and keeps ${cash} aside. ${seats} ${clock} The goal is ${goal}.`;
    }
    case 'sector-stake': {
      const sector = def.goal.kind === 'sector' ? def.goal.sector : 'a sector';
      return `${name} is ${age} with ${cash} and no job, treating ${sector} as a sector rather than one gate. ${clock} The goal is ${goal}.`;
    }
    case 'employer-week': {
      const f = P.employer[person] >= 0 ? econ(w).firms[P.employer[person]] : undefined;
      if (!f) return `${name} is ${age} with ${cash} and no job.`;
      const weekly = Math.max(1, f.eff * econ(w).wage * 7);
      const weeks = Math.floor(w.ledger.balance(f.id, DEP) / weekly);
      const px = sharePx(w, f.id);
      const issued = Math.floor(w.ledger.issued.get('eq:' + f.id) ?? 0);
      const friend = contactsOf(w, person).map((c) => c.who).filter((x) => x >= 0 && P.alive(x) && P.employer[x] >= 0 && P.employer[x] !== f.idx).sort((a, b) => w.ledger.balance(P.id(b), DEP) - w.ledger.balance(P.id(a), DEP))[0];
      const mate = friend !== undefined ? `${P.name(friend)} (now at ${econ(w).firms[P.employer[friend]].name}) has money and a head start on the street` : 'nobody in your circle has money to spare';
      const line = marginLimit(w, person);
      return `${name}, ${age}, works at ${f.name}: ${f.workers} staff, ${money(Math.floor(w.ledger.balance(f.id, DEP)))} in the cash box (${weeks} weeks of payroll), shares at ${money(px)} (${issued.toLocaleString('en-US')} issued). Its quarter prints at the end of the month. ${cash} in the book, and the bank will lend up to ${money(line)} against your shares. ${mate}. The board cannot agree: sell a division, or lay people off. Whoever holds the chair decides. ${clock} The goal is ${goal}.`;
    }
    case 'sandbox': {
      const loan = def.loan / difficulty;
      const regulator = def.regulator * difficulty;
      const rivals = def.rivals * difficulty;
      return `${name} is ${age}, ${job}, with ${cash} to spend and ${worth} of net worth. There is no goal and no clock. Loans are ${loan.toFixed(2)}×, the regulator ${regulator.toFixed(2)}×, and rivals ${rivals.toFixed(2)}×.`;
    }
    default:
      return `${name}, ${age}, ${job}, ${kin}. The book shows ${cash} in cash and ${worth} of net worth. ${clock} The goal is ${goal}.`;
  }
}

/** One paragraph from the city as it stands when the scenario ends. */
function closingOf(w: World, sc: ScenarioRun, result: 'win' | 'loss'): string {
  const v = view(w);
  const name = v.name || 'The player';
  const worth = money(v.netWorth);
  const start = money(sc.worthAtStart);
  const where = v.employer ? `${name} is at ${v.employer}` : `${name} holds no job`;
  const life = v.alive ? where : `${name} has died`;
  const book = `${life}. The book began at ${start} and stands at ${worth}.`;
  const goal = sc.goal.kind === 'worth' ? money(sc.goal.cents) : goalText(sc.goal);
  switch (sc.id) {
    case 'first-paycheck':
      return result === 'win'
        ? `${name} saved the wage, bought a share, and the book reached ${goal}. ${book}`
        : `${name} did not get the book to ${goal} before the job and the clock ran out. ${book}`;
    case 'the-savings':
      return result === 'win'
        ? `${name} filled the savings book to ${goal}. ${book}`
        : `${name} left the savings book short of ${goal}. ${book}`;
    case 'hostile-takeover': {
      const id = sc.goal.kind === 'firm' ? sc.goal.firm : '';
      const f = id ? firmBy(w, id) : undefined;
      const firm = f ? f.name : id || 'the firm';
      return result === 'win'
        ? `${name} took control of ${firm}. ${book}`
        : `${name} never took control of ${firm}. ${book}`;
    }
    case 'the-crash': {
      const shock = SHOCKS.find((s) => s.id === sc.shock);
      const what = shock?.text ?? 'the shock';
      return result === 'win'
        ? `${name} was still solvent when it lifted: ${what}. ${book}`
        : `${name} did not stay solvent through it: ${what}. ${book}`;
    }
    case 'family-business': {
      const i = playerIndex(w);
      const f = i >= 0 ? familyFirm(w, i) : undefined;
      const fname = f ? f.name : 'the family firm';
      const box = f ? money(Math.floor(w.ledger.balance(f.id, DEP))) : 'nothing';
      return result === 'win'
        ? `${name} kept ${fname} and made the house worth ${goal}. The cash box holds ${box}. ${book}`
        : `${name} did not make ${fname} worth ${goal}. The cash box holds ${box}. ${book}`;
    }
    case 'dynasty': {
      const gen = soleSeat(w)?.generation ?? 1;
      return result === 'win'
        ? `The house of ${name} reached generation ${gen}. ${book}`
        : `The house of ${name} ended at generation ${gen}, short of ${goal}. ${book}`;
    }
    case 'the-ministry': {
      const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number } | undefined;
      const i = playerIndex(w);
      const held = i >= 0 && (pol?.leader === i || pol?.finance === i || pol?.governor === i || pol?.regulator === i);
      const who = `${named(w, pol?.leader ?? -1)} leads, ${named(w, pol?.finance ?? -1)} keeps the finance ministry, ${named(w, pol?.governor ?? -1)} the central bank, and ${named(w, pol?.regulator ?? -1)} the regulator.`;
      return result === 'win' || held
        ? `${name} holds office. ${who} ${book}`
        : `${name} never held office. ${who} ${book}`;
    }
    case 'sector-stake': {
      const sector = sc.goal.kind === 'sector' ? sc.goal.sector : 'the sector';
      return result === 'win'
        ? `${name} controls ${aan(sector)} firm. ${book}`
        : `${name} never controlled ${aan(sector)} firm. ${book}`;
    }
    case 'sandbox':
      return `${name} set the book down at ${worth}, from ${start}, with no goal to miss. ${where}.`;
    default:
      return result === 'win'
        ? `${name} met the goal, ${goal}. ${book}`
        : `${name} did not meet the goal, ${goal}. ${book}`;
  }
}

function applyStart(w: World, def: ScenarioDef, opts?: { cash?: number; difficulty?: number; seed?: string }): void {
  const s = econ(w), P = s.P;
  let i = ensurePlayer(w);
  const st = soleSeat(w);
  if (!st) throw new Error('the player was not seated');
  if (!P.alive(i)) {
    P.flags[i] &= ~PLAYER;
    st.who = -1;
    i = ensurePlayer(w);
  }
  const seed = opts?.seed || def.seed;
  P.born[i] = w.day - def.age * DAYS_PER_YEAR;
  const cause = st.arrived >= 0 ? st.arrived : w.genesis;
  let seated: Firm | undefined;
  let stake = 0;
  if (def.job === 'none') leaveJob(s, i);
  else if (def.job === 'inherit' || def.inherit) {
    seated = pickOf(familyPool(w), seed, def.id, 'heir');
    if (seated) {
      seated.ceo = i;
      joinFirm(s, i, seated);
      stake = giveStake(w, i, seated, 30_000, 0.01, cause);
    } else {
      seated = inheritFirm(w, i, cause);
      if (seated) joinFirm(s, i, seated);
    }
  } else if (def.job === 'chief') {
    seated = pickOf(chiefPool(w), seed, def.id, 'chief');
    if (seated) {
      seated.ceo = i;
      joinFirm(s, i, seated);
      giveStake(w, i, seated, 40_000, 0.01, cause);
    }
  } else if (def.job === 'small') {
    const small = smallListed(w);
    if (small) { joinFirm(s, i, small); shelter(s, i, small); }
  } else if (def.job !== 'any') {
    const namedFirm = firmBy(w, def.job);
    if (namedFirm) joinFirm(s, i, namedFirm);
  } else {
    const employer = pickOf(employerPool(w), seed, def.id, 'job');
    if (employer) joinFirm(s, i, employer);
  }
  const kin = def.kin[mix(seed, def.id, 'kin') % Math.max(1, def.kin.length)] ?? def.family;
  if (kin === 'spouse' || kin === 'child') {
    const spouse = marry(w, i);
    if (spouse >= 0) w.events.emit('player.wed', `${P.name(i)} marries ${P.name(spouse)}`, [cause], P.id(i));
    if (kin === 'child' && spouse >= 0) P.add(w, w.day, i, spouse);
  }
  const contacts = 2 + (mix(seed, def.id, 'contacts') % 7);
  seatPerson(w, i, contacts);
  const pid = P.id(i);
  for (const [key, qty] of Object.entries(def.holdings)) {
    const f = firmBy(w, key);
    if (f && qty > 0) giveShares(w, pid, 'eq:' + f.id, Math.round(qty), cause);
  }
  const d = opts?.difficulty && opts.difficulty > 0 ? opts.difficulty : 1;
  const dollars = opts?.cash !== undefined && Number.isFinite(opts.cash) && opts.cash >= 0 ? opts.cash : def.cash;
  setCash(w, pid, Math.round(dollars * 100), cause);
  const staged = def.id === 'employer-week' ? stageEmployerWeek(w, i, cause) : undefined;
  if (def.debtPct > 0 && stake > 0) owePlayer(w, pid, Math.round(stake * def.debtPct), 'player.heir', cause);
  else if (def.debt > 0) owePlayer(w, pid, def.debt, 'player.heir', cause);
  const owed = claimOf(w, pid);
  if (owed > 0) w.events.emit('player.heir', `${P.name(i)} owes ${money(owed)} that is not cash in the book`, [cause], pid);
  const goal = copyGoal(def.goal);
  if (goal.kind === 'turn' && seated) goal.firm = seated.id;
  if (goal.kind === 'decide' && P.employer[i] >= 0) goal.firm = s.firms[P.employer[i]].id;
  if (goal.kind === 'firm' && (!goal.firm || goal.firm === '*')) {
    const cashNow = Math.floor(w.ledger.balance(pid, DEP));
    const target = pickOf(activistPool(w, cashNow), seed, def.id, 'target');
    if (target) goal.firm = target.id;
  }
  const mark = goal.kind === 'firm' && goal.firm ? sharePx(w, goal.firm.startsWith('frm_') ? goal.firm : goal.firm) : 0;
  const held = Math.floor(w.ledger.balance(pid, DEP));
  st.moneyEv = w.events.emit('life.cash', `You hold ${money(held)} in cash`, [cause]);
  st.cashSeen = held;
  st.cashDay = w.day;
  const arrived = w.events.get(st.arrived);
  if (arrived) {
    const job = P.employer[i];
    const firm = job >= 0 ? s.firms[job] : undefined;
    const seatWord = seated && (def.job === 'chief' || def.job === 'inherit' || def.inherit) ? ` and takes the seat at ${seated.name}` : '';
    arrived.msg = firm
      ? `${P.name(i)} arrives, aged ${def.age}, and takes a job at ${firm.name}${seatWord}`
      : `${P.name(i)} arrives, aged ${def.age}, and holds no job`;
  }
  const opened = Math.round(view(w).netWorth);
  if (goal.kind === 'worth' && (def.id === 'heir-debts' || def.id === 'struggling-ceo' || def.id === 'hedge-fund')) {
    goal.cents = earnedWorth(opened, earnRate(def.id));
  }
  const last = st.score[st.score.length - 1];
  if (last && last.day === w.day) last.worth = opened;
  else st.score.push({ day: w.day, worth: opened });
  const story = def.story[0] ?? def.name;
  w.events.emit('player.scenario', `${P.name(i)} begins ${def.name}. ${story}`, [cause], pid);
  const index = (w.state.markets as { index?: number } | undefined)?.index ?? 100;
  const run: ScenarioRun = {
    id: def.id,
    name: def.name,
    story: def.story,
    goal,
    limit: def.limit,
    deadline: def.limit > 0 ? w.day + def.limit : 0,
    begun: w.day,
    indexAtStart: index > 0 ? index : 100,
    worthAtStart: opened,
    loan: def.loan / d,
    regulator: def.regulator * d,
    rivals: def.rivals * d,
    beginner: def.beginner,
    hintsOn: def.beginner,
    hints: def.hints,
    who: i,
    difficulty: d,
    shock: def.shock,
    shockIn: def.shockIn,
    fired: false,
    twist: def.twist,
    twistAt: def.twist && def.limit > 0 ? w.day + Math.max(1, Math.round(def.limit * Math.max(0, def.twistIn) / 100)) : 0,
    twisted: !def.twist,
    twistNote: '',
    seat: seated && (def.job === 'inherit' || def.job === 'chief' || def.inherit) ? seated.id : '',
    mark,
    opening: openingOf(w, def, i, opened, d, goal, seed),
    continueAfter: def.keepPlaying,
  };
  if (staged && staged.friend >= 0) { run.friend = staged.friend; run.floor = staged.floor; }
  w.state.scenario = run;
  rememberJob(w);
}

export function openScenario(id: string, opts?: { cash?: number; difficulty?: number; seed?: string }): World {
  const def = catalog.find((s) => s.id === id);
  if (!def) throw new Error(`no scenario ${id}. ${catalog.map((s) => s.id).join(', ')}`);
  const saved = worldDir(def.world);
  const seed = opts?.seed || (saved ? snapshotSeed(saved) : def.seed);
  const w = openWorld(seed, new Set(), true);
  if (saved) applySnapshot(w, saved);
  else if (def.years > 0) simulate(w, def.years, 1, false);
  applyStart(w, def, { cash: opts?.cash, difficulty: opts?.difficulty, seed });
  const note: ScriptNote = {
    id: def.id,
    seed,
    difficulty: opts?.difficulty && opts.difficulty > 0 ? opts.difficulty : 1,
  };
  if (opts?.cash !== undefined) note.cash = opts.cash;
  noteScript(w, note);
  const bad = w.ledger.check();
  if (bad.length) throw new Error(`books failed at the start: ${bad.slice(0, 5).join('; ')}`);
  return w;
}

function controls(w: World, person: number, f: Firm): boolean {
  if (f.closed) return false;
  if (f.ceo === person) return true;
  const chair = (w.state.corporate as { chair?: number[] } | undefined)?.chair;
  if (chair && f.idx < chair.length && chair[f.idx] === person) return true;
  const issued = w.ledger.issued.get('eq:' + f.id) ?? 0;
  if (issued <= 0) return false;
  return w.ledger.balance(econ(w).P.id(person), 'eq:' + f.id) * 2 > issued;
}

function firmControlled(w: World, person: number, key: string, listed: boolean): boolean {
  const f = firmBy(w, key);
  if (!f) return false;
  if (listed && !f.listed) return false;
  return controls(w, person, f);
}

function sectorControlled(w: World, person: number, sector: string): boolean {
  return econ(w).firms.some((f) => f.sector === sector && controls(w, person, f));
}

function holdsOffice(w: World, person: number): boolean {
  const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number } | undefined;
  return pol?.leader === person || pol?.finance === person || pol?.governor === person || pol?.regulator === person;
}

function worthNow(w: World): number {
  return Math.round(view(w).netWorth);
}

function turnMet(w: World, person: number, firmId: string, days: number): boolean {
  const f = firmBy(w, firmId);
  if (!f || f.closed || f.ceo !== person) return false;
  const daily = Math.max(1, f.eff * econ(w).wage);
  return Math.floor(w.ledger.balance(f.id, DEP)) >= daily * days;
}

function crashSurvived(w: World, sc: ScenarioRun): boolean {
  if (!sc.fired || sc.shockUntil === undefined || w.day < sc.shockUntil) return false;
  const i = playerIndex(w);
  return i >= 0 && econ(w).P.alive(i) && worthNow(w) > 0;
}

function met(w: World, sc: ScenarioRun, person: number): boolean {
  const g = sc.goal;
  switch (g.kind) {
    case 'none': return false;
    case 'worth': return worthNow(w) >= g.cents;
    case 'firm': return firmControlled(w, person, g.firm, true);
    case 'sector': return sectorControlled(w, person, g.sector);
    case 'office': return holdsOffice(w, person);
    case 'dynasty': return (soleSeat(w)?.generation ?? 1) >= g.generations;
    case 'crash': return crashSurvived(w, sc);
    case 'homes': return view(w).homes.filter((h) => h.mine).length >= g.count && worthNow(w) > 0;
    case 'turn': return turnMet(w, person, g.firm, g.days);
    case 'decide': return decided(w, person, g.firm);
    default: {
      const never: never = g;
      return never;
    }
  }
}

function reasonOf(sc: ScenarioRun, result: 'win' | 'loss'): string {
  const g = sc.goal;
  switch (g.kind) {
    case 'worth': return result === 'win' ? `You reached ${money(g.cents)}.` : `You did not reach ${money(g.cents)} in time.`;
    case 'firm': return result === 'win' ? `You control ${g.firm}.` : `You never took control of ${g.firm}.`;
    case 'sector': return result === 'win' ? `You control ${aan(g.sector)} firm.` : `You never controlled ${aan(g.sector)} firm.`;
    case 'office': return result === 'win' ? 'You hold office.' : 'You never held office.';
    case 'dynasty': return result === 'win' ? `The house reached generation ${g.generations}.` : `The house ended before generation ${g.generations}.`;
    case 'crash': return result === 'win' ? 'You came through the crisis solvent.' : 'You did not come through the crisis.';
    case 'homes': return result === 'win' ? `You own ${g.count} ${g.count === 1 ? 'home' : 'homes'}.` : `You do not own ${g.count} ${g.count === 1 ? 'home' : 'homes'}.`;
    case 'turn': return result === 'win' ? `The cash box holds ${g.days} days of wages and you still have the seat.` : `The cash box never held ${g.days} days of wages while you kept the seat.`;
    case 'decide': return result === 'win' ? 'You took the chair and made the choice.' : 'You never took the chair and decided.';
    case 'none': return 'There was no goal.';
    default: {
      const never: never = g;
      return never;
    }
  }
}

function matters(w: World, pid: string, name: string, firmId: string): string[] {
  const floor = Math.max(0, w.events.count - 8000);
  const mine: { id: number; day: number; kind: string; msg: string; causes: number[]; actor?: string }[] = [];
  for (let id = w.events.count - 1; id >= floor; id--) {
    const e = w.events.get(id);
    if (e && e.actor === pid) mine.push(e);
  }
  mine.sort((a, b) => b.causes.length - a.causes.length || b.id - a.id);
  const picked: { id: number; day: number; kind: string; msg: string; causes: number[] }[] = [];
  const seen = new Set<number>();
  const add = (e: { id: number; day: number; kind: string; msg: string; causes: number[] } | undefined): void => {
    if (!e || seen.has(e.id) || picked.length >= 5) return;
    seen.add(e.id);
    picked.push(e);
  };
  const walk = (id: number, depth: number): void => {
    if (depth > 6 || picked.length >= 5) return;
    const e = w.events.get(id);
    add(e);
    if (!e) return;
    for (const c of e.causes) walk(c, depth + 1);
  };
  for (const e of mine) {
    walk(e.id, 0);
    if (picked.length >= 5) break;
  }
  if (picked.length < 5) {
    const extra: { id: number; day: number; kind: string; msg: string; causes: number[] }[] = [];
    for (let id = w.events.count - 1; id >= floor; id--) {
      const e = w.events.get(id);
      if (!e || seen.has(e.id)) continue;
      const own = (name && e.msg.includes(name)) || (firmId && e.actor === firmId);
      if (own) extra.push(e);
    }
    extra.sort((a, b) => b.causes.length - a.causes.length || b.id - a.id);
    for (const e of extra) add(e);
  }
  return picked.map((e) => `[day ${e.day}] ${e.kind}: ${e.msg}`);
}

export function scoreOf(w: World, sc: ScenarioRun): ScenarioScore {
  const v = view(w);
  const i = playerIndex(w);
  const index = (w.state.markets as { index?: number } | undefined)?.index ?? sc.indexAtStart;
  const contacts = i >= 0 ? contactsOf(w, i) : [];
  const reputation = contacts.length ? Math.round(contacts.reduce((a, c) => a + c.trust, 0) / contacts.length) : 0;
  const firms = i >= 0 ? econ(w).firms.filter((f) => controls(w, i, f)).length : 0;
  const employer = i >= 0 && econ(w).P.employer[i] >= 0 ? econ(w).firms[econ(w).P.employer[i]]?.id ?? '' : '';
  const st = soleSeat(w);
  const start = sc.worthAtStart > 0 ? sc.worthAtStart : 1;
  return {
    worth: v.netWorth,
    worthX: v.netWorth / start,
    indexX: index / (sc.indexAtStart > 0 ? sc.indexAtStart : 100),
    firms,
    reputation,
    convictions: st?.convictions ?? 0,
    events: matters(w, i >= 0 ? econ(w).P.id(i) : '', i >= 0 ? econ(w).P.name(i) : '', employer),
  };
}

function finish(w: World, sc: ScenarioRun, result: 'win' | 'loss', reason: string): void {
  sc.outcome = result;
  sc.reason = reason;
  sc.closing = closingOf(w, sc, result);
  if (sc.twistNote) sc.closing = `${sc.closing} ${sc.twistNote}`;
  const st = soleSeat(w);
  if (!st) return;
  st.over = true;
  if (!st.final) st.final = `${sc.name}: ${reason}`;
  const now = Math.round(view(w).netWorth);
  const last = st.score[st.score.length - 1];
  if (last && last.day === w.day) last.worth = now;
  else st.score.push({ day: w.day, worth: now });
}

function armShock(w: World, sc: ScenarioRun): void {
  if (!sc.shock || sc.fired || w.day < sc.begun + sc.shockIn) return;
  const def = SHOCKS.find((s) => s.id === sc.shock);
  if (!def) return;
  const ev = w.events.exo('shock.forced', def.text, 'world');
  const until = w.day + def.days;
  econ(w).shocks.push({ def, until, ev });
  sc.fired = true;
  sc.shockUntil = until;
}

/** Step the city the way play does. `over` means the life or the scenario has ended. */
export function runDays(w: World, days: number): string | undefined {
  for (let d = 0; d < days; d++) {
    w.step();
    reviewScenario(w);
    const bad = w.ledger.check();
    if (bad.length) return bad.slice(0, 8).join('; ');
    const v = view(w);
    if (v.over || !v.alive) return 'over';
  }
  return undefined;
}

function noteTwist(w: World, sc: ScenarioRun, pid: string, text: string, cause: number): void {
  sc.twistNote = text;
  w.events.emit('player.twist', text, [cause], pid);
}

function levyFirm(w: World, f: Firm, days: number, cause: number): number {
  const bill = Math.round(Math.max(0, f.eff * econ(w).wage * days));
  const have = Math.floor(w.ledger.balance(f.id, DEP));
  const n = Math.min(have, bill);
  if (n > 0) pay(w, f.id, GOV, n, 'player.twist', cause);
  return n;
}

/** One mid-run turn, taken from something the city has already done. */
function applyTwist(w: World, sc: ScenarioRun): void {
  if (!sc.twist || sc.twisted || sc.twistAt <= 0 || w.day < sc.twistAt) return;
  sc.twisted = true;
  const s = econ(w), P = s.P, i = sc.who;
  if (i < 0 || i >= P.n) return;
  const pid = P.id(i);
  const name = P.name(i);
  const fallback = s.jobsWho ?? s.macroEv ?? w.genesis;
  if (sc.twist === 'layoff') {
    const e = P.employer[i];
    const f = e >= 0 ? s.firms[e] : undefined;
    const cause = prior(w, ['firm.takeover', 'firm.layoffs', 'firm.cashCrunch', 'macro.jobs'], f?.profitEv ?? fallback);
    if (f) leaveJob(s, i);
    const where = f ? f.name : 'the firm';
    const u = (s.unemployment * 100).toFixed(1);
    const saved = view(w).deposits.reduce((a, d) => a + Math.max(0, d.cents), 0);
    const extra = saved < 5_000 ? 40_000 : 0;
    if (extra > 0) owePlayer(w, pid, extra, 'player.twist', cause);
    const cushion = extra > 0 ? ` Nothing was set aside, so the household owes ${money(extra)} more.` : '';
    noteTwist(w, sc, pid, `${name} is let go by ${where}. Unemployment is ${u}%, and the wage stops.${cushion}`, cause);
    return;
  }
  if (sc.twist === 'illness') {
    const before = labourOf(P, i, w.day);
    P.health[i] = Math.max(20, P.health[i] - 16);
    retargetLabour(s, i, before, labourOf(P, i, w.day));
    const cause = prior(w, ['health.injury', 'player.wed', 'macro.jobs'], P.spouse[i] >= 0 && P.lastEv[P.spouse[i]] >= 0 ? P.lastEv[P.spouse[i]] : fallback);
    const inj = w.events.emit('health.injury', `${name} falls ill at home`, [cause], pid);
    const saved = banked(w);
    const prepared = cushioned(saved, sc.worthAtStart);
    const bill = prepared ? 0 : Math.max(400_000, Math.round(sc.worthAtStart * 0.18)) + (saved < 50_000 ? 200_000 : 0);
    if (bill > 0) owePlayer(w, pid, bill, 'player.twist', inj);
    const thin = saved < 50_000 ? ' Nothing was set aside, so the bill is larger.' : '';
    const line = prepared
      ? `${name} falls ill. The money set aside meets the bill, so the book owes nothing new.`
      : `${name} falls ill and the household owes ${money(bill)} for the care.${thin}`;
    noteTwist(w, sc, pid, line, inj);
    return;
  }
  if (sc.twist === 'shock') {
    const f = sc.seat ? firmBy(w, sc.seat) : undefined;
    const mapped = f ? shockFor(f.good) : 'HEATWAVE';
    const def = SHOCKS.find((x) => x.id === mapped);
    if (def && !sc.fired) {
      sc.shock = def.id;
      sc.shockIn = Math.max(0, w.day - sc.begun);
      armShock(w, sc);
    }
    const cause = prior(w, ['shock.forced', 'macro.jobs', 'cb.rate'], fallback);
    const levied = f ? levyFirm(w, f, 8, cause) : 0;
    const saved = banked(w);
    const prepared = cushioned(saved, sc.worthAtStart);
    const bill = prepared ? 0 : Math.round(sc.worthAtStart * 0.1) + (saved < 50_000 ? 150_000 : 0);
    if (bill > 0) owePlayer(w, pid, bill, 'player.twist', cause);
    const u = (s.unemployment * 100).toFixed(1);
    const what = def?.text ?? 'the city tightens';
    const paid = levied > 0 ? ` ${f?.name ?? 'The firm'} pays ${money(levied)} out of the cash box.` : '';
    const thin = prepared ? ' The money set aside meets the household bill.' : saved < 50_000 ? ' Nothing was set aside, so the household bill is larger.' : '';
    const owed = bill > 0 ? ` The household owes ${money(bill)} more.` : '';
    noteTwist(w, sc, pid, `Unemployment is ${u}%. ${what}.${paid}${owed}${thin}`, cause);
    return;
  }
  if (sc.twist === 'redeem') {
    const owed = claimOf(w, pid);
    const cause = prior(w, ['cb.rate', 'macro.jobs'], s.rateEv ?? fallback);
    const thin = liquidOf(w, pid) < Math.max(1, owed) * 0.25;
    const rate = Math.max(0.04, s.policyRate);
    if (!thin && owed > 0) {
      const cut = Math.min(owed, Math.round(owed * 0.05));
      const released = cut > 0 && w.ledger.redeem('scen_' + pid, BANK, cut, 'player.twist', cause);
      const back = released ? cut : 0;
      noteTwist(w, sc, pid, `Outside money asks to be paid. The cash was set aside, so the partners release ${money(back)} and charge no fee.`, cause);
    } else {
      const fee = Math.round(owed * rate * 0.9);
      if (fee > 0) owePlayer(w, pid, fee, 'player.twist', cause);
      noteTwist(w, sc, pid, `Outside money asks to be paid. The cash is already spoken for, so the fee is ${money(fee)}.`, cause);
    }
    return;
  }
  if (sc.twist === 'repair') {
    const mine = view(w).homes.filter((h) => h.mine);
    const value = mine.reduce((a, h) => a + h.price, 0);
    // A hard year is a fixed slice of seeds (hash of seed + scenario, not w.rng). A third roof is always the dear bill.
    const harsh = mix(w.seed, sc.id, 'repair') % 10 <= 2;
    const heavy = mine.length >= 3;
    const rate = heavy ? 1.35 : mine.length === 2 ? (harsh ? 1.9 : 0.22) : mine.length === 1 ? 0.45 : 0;
    const bill = mine.length ? Math.round(value * rate) : Math.round(Math.max(0, w.ledger.balance(pid, DEP)) * 0.1);
    const cause = prior(w, ['shock.forced', 'macro.cpi', 'property.repair'], s.macroEv ?? fallback);
    if (bill > 0) owePlayer(w, pid, bill, 'player.twist', cause);
    const what = heavy
      ? `${name} owes ${money(bill)} to repair a stretched portfolio.`
      : harsh && mine.length
        ? `${name} owes ${money(bill)}. This year the repairs cost more than the houses.`
        : mine.length
          ? `${name} owes ${money(bill)} for repairs on the homes.`
          : `${name} owes ${money(bill)} and still owns no home.`;
    noteTwist(w, sc, pid, what, cause);
    return;
  }
  if (sc.twist === 'bidwar') {
    const g = sc.goal;
    const firmId = g.kind === 'firm' ? g.firm : '';
    const f = firmId ? firmBy(w, firmId) : undefined;
    const gone = !f || f.closed || !f.listed;
    const cause = prior(w, ['firm.takeover', 'firm.price', 'mkt.move'], fallback);
    if (gone && g.kind === 'firm') {
      const cash = Math.floor(w.ledger.balance(pid, DEP));
      const next = activistPool(w, Math.max(cash, sc.worthAtStart)).find((x) => x.id !== f?.id);
      if (next) {
        g.firm = next.id;
        sc.mark = sharePx(w, next.id);
        noteTwist(w, sc, pid, `${f?.name ?? 'The first target'} is out of reach. The bid moves to ${next.name}.`, cause);
        return;
      }
    }
    sc.rivals = Math.min(2.2, sc.rivals * 1.15);
    noteTwist(w, sc, pid, `A rival bid forces a higher price for ${f?.name ?? 'the target'}. Holders now want more.`, cause);
    return;
  }
  const cause = prior(w, ['macro.jobs', 'cb.rate'], fallback);
  noteTwist(w, sc, pid, `The city turns, and the old plan no longer fits.`, cause);
}

/** Called once a day from play and from the server. Idle runs never set a scenario, so this returns. */
/** A chief who keeps the surplus draws one salary from the firm, half a year in. The firm pays it. */
function drawRetained(w: World, sc: ScenarioRun): void {
  if (w.day !== sc.begun + 179) return;
  if (sc.id !== 'heir-debts' && sc.id !== 'struggling-ceo') return;
  if (!sc.seat) return;
  const st = soleSeat(w);
  if (!st || st.who < 0) return;
  const s = econ(w);
  const f = s.firms.find((x) => x.id === sc.seat);
  if (!f || f.closed || f.ceo !== st.who) return;
  if (!cushioned(banked(w), sc.worthAtStart)) return;
  const cents = Math.round(sc.worthAtStart * 0.08);
  if (cents < 1) return;
  const pid = s.P.id(st.who);
  const cause = f.profitEv >= 0 ? f.profitEv : w.genesis;
  if (!pay(w, f.id, pid, cents, 'player.draw', cause)) return;
  w.events.emit('player.draw', `${s.P.name(st.who)} draws ${money(cents)} from ${f.name} for keeping the seat`, [cause], pid);
}

/** Rich people put idle cash into shares within days. The friend's offer stands for two months, or until you have bought in. */
function keepFriend(w: World, sc: ScenarioRun): void {
  if (sc.friend === undefined || sc.friend < 0 || !sc.floor || w.day >= sc.begun + 60) return;
  const P = econ(w).P;
  if (!P.alive(sc.friend) || owner(w).held.some((h) => h.by === sc.who)) return;
  const fid = P.id(sc.friend);
  const have = Math.floor(w.ledger.balance(fid, DEP));
  if (have < sc.floor) pay(w, BANK, fid, sc.floor - have, 'player.endowment', w.events.last('player.scenario') ?? w.genesis);
}

export function reviewScenario(w: World): void {
  const sc = runOf(w);
  if (!sc || sc.outcome) return;
  keepFriend(w, sc);
  drawRetained(w, sc);
  armShock(w, sc);
  applyTwist(w, sc);
  const st = soleSeat(w);
  if (!st || st.who < 0) return;
  sc.who = st.who;
  const P = econ(w).P;
  const dead = st.over || st.who >= P.n || !P.alive(st.who);
  if (dead && sc.goal.kind === 'none') return;
  if (!dead && w.day > sc.begun && sc.goal.kind !== 'none' && w.day % 7 === 0 && worthNow(w) <= 0) {
    finish(w, sc, 'loss', 'The book is worth nothing.');
    return;
  }
  if (!dead && sc.seat && w.day > sc.begun) {
    const f = firmBy(w, sc.seat);
    if (!f || f.closed || f.ceo !== st.who) {
      finish(w, sc, 'loss', `You lost the seat at ${f?.name ?? 'the firm'}.`);
      return;
    }
  }
  if (sc.twist && !sc.twisted && !dead) return;
  const month = w.day > sc.begun && w.day % 30 === 0;
  const due = sc.deadline > 0 && w.day >= sc.deadline;
  const shockDone = sc.goal.kind === 'crash' && sc.shockUntil !== undefined && w.day >= sc.shockUntil;
  if (!dead && !month && !due && !shockDone) return;
  if (dead && (sc.goal.kind === 'none' || sc.continueAfter)) return;
  const won = !dead && met(w, sc, st.who);
  if (won) { finish(w, sc, 'win', reasonOf(sc, 'win')); return; }
  const broke = sc.goal.kind === 'crash' && sc.fired && worthNow(w) <= 0;
  if (dead || due || broke) finish(w, sc, 'loss', dead && st.final ? st.final : reasonOf(sc, 'loss'));
}

export function liveCard(w: World): ScenarioLive | null {
  const sc = runOf(w);
  if (!sc) return null;
  const show = sc.beginner && sc.hintsOn && !sc.outcome && w.day < sc.begun + 90;
  const opening = sc.opening || sc.story.join(' ');
  const card: ScenarioLive = {
    id: sc.id,
    name: sc.name,
    story: sc.outcome && sc.closing ? sc.closing : opening,
    goal: goalText(sc.goal),
    outcome: sc.outcome,
    reason: sc.reason,
    hintsOn: sc.hintsOn,
    showHints: show,
    hints: show ? sc.hints : {},
    opening,
    closing: sc.closing ?? '',
  };
  if (sc.outcome) {
    const score = scoreOf(w, sc);
    const end = ending(w, score.worth);
    card.score = score;
    card.code = end.code;
    card.chronicle = end.text;
  }
  return card;
}

export function blurb(w: World): string[] {
  const sc = runOf(w);
  if (!sc) return [];
  return [sc.name, sc.opening || sc.story.join(' '), `goal: ${goalText(sc.goal)}`, `limit: ${limitText(sc.limit)}`, `difficulty: ${diffText(sc.loan, sc.regulator, sc.rivals)}`];
}

export function hintLine(w: World): string | undefined {
  const sc = runOf(w);
  if (!sc || !sc.beginner || !sc.hintsOn || sc.outcome || w.day >= sc.begun + 90) return;
  return sc.hints.desk || sc.hints['*'] || Object.values(sc.hints)[0];
}

function ending(w: World, worth: number): { code: string; text: string } {
  return { code: challengeOf(w, worth), text: playerChronicle(w, worth).text };
}

export function endScreen(w: World): string[] | null {
  const sc = runOf(w);
  if (!sc?.outcome) return null;
  const s = scoreOf(w, sc);
  const end = ending(w, s.worth);
  return [
    `${sc.name} — ${sc.outcome}`,
    sc.reason ?? '',
    sc.closing ?? '',
    '',
    'Score',
    `  net worth ${money(s.worth)} against the index ${s.indexX.toFixed(2)}× (you ${s.worthX.toFixed(2)}×)`,
    `  firms controlled ${s.firms}`,
    `  reputation ${repWord(s.reputation)}`,
    `  convictions ${s.convictions}`,
    '',
    'Challenge',
    `  ${end.code}`,
    '',
    end.text,
    'The game is over.',
  ];
}

onPlayerDay(reviewScenario);
