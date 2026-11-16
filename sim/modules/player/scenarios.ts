// A scenario is a start, a goal and a clock on top of a world from worldgen.
// Money still moves only through the ledger. Shares move; they are not minted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRaws, RawReader } from '../../kernel/content.ts';
import { DAYS_PER_YEAR, type World } from '../../kernel/index.ts';
import { SECTOR_NAMES, SHOCKS } from '../economy/content.ts';
import { BANK, DEP, pay, type EconState, type Firm } from '../economy/index.ts';
import { joinFirm, leaveJob } from '../economy/people.ts';
import { simulate } from '../history/boot.ts';
import { applySnapshot, snapshotSeed } from '../history/save.ts';
import { contactsOf, seatPerson } from '../social/index.ts';
import { challengeOf } from '../history/commands.ts';
import { playerChronicle } from '../history/story.ts';
import { openWorld } from '../../run.ts';
import { repWord } from './life.ts';
import { PLAYER, ensurePlayer, noteScript, onPlayerDay, playerIndex, soleSeat, view, type ScriptNote } from './index.ts';

type Goal =
  | { kind: 'worth'; cents: number }
  | { kind: 'firm'; firm: string }
  | { kind: 'sector'; sector: string }
  | { kind: 'office' }
  | { kind: 'dynasty'; generations: number }
  | { kind: 'crash' }
  | { kind: 'none' };

interface ScenarioDef {
  id: string;
  name: string;
  story: string[];
  age: number;
  cash: number;
  job: string;
  family: 'none' | 'spouse' | 'child';
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
  /** Written from the world at the start: names, firms and numbers, not the catalog line. */
  opening: string;
  /** Written when the outcome is set, from the world at that moment. */
  closing?: string;
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
    case 'NONE': return { kind: 'none' };
    default: throw new Error(`${r.where()}: unknown goal ${kind || '(missing)'}`);
  }
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
  };
}

const catalog: ScenarioDef[] = loadRaws(process.env.SIM_CONTENT ?? contentDir).filter((raw) => raw.type === 'SCENARIO').map((raw) => loadOne(new RawReader(raw)));

function goalText(g: Goal): string {
  switch (g.kind) {
    case 'worth': return `net worth ${money(g.cents)}`;
    case 'firm': return `control ${g.firm}`;
    case 'sector': return `control a ${g.sector} firm`;
    case 'office': return 'hold a political office';
    case 'dynasty': return `a dynasty of ${g.generations} generations`;
    case 'crash': return 'survive the crash';
    case 'none': return 'no goal';
    default: {
      const never: never = g;
      return never;
    }
  }
}

function limitText(days: number): string {
  if (days <= 0) return 'open-ended';
  if (days % 360 === 0) return `${days / 360} years`;
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
function openingOf(w: World, def: ScenarioDef, person: number, worthCents: number, difficulty: number): string {
  const P = econ(w).P;
  const name = P.name(person);
  const age = P.age(w, person);
  const cash = money(Math.floor(w.ledger.balance(P.id(person), DEP)));
  const worth = money(worthCents);
  const job = jobLine(w, person);
  const kin = kinLine(w, person);
  const goal = goalText(def.goal);
  const clock = def.limit > 0 ? `The clock is ${limitText(def.limit)}.` : 'There is no clock.';
  switch (def.id) {
    case 'first-paycheck':
      return `${name} is ${age} and ${job}, with ${cash} just cleared and nobody in the city who owes a favour. ${clock} The goal is ${goal}.`;
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
        ? `${name} made the ninety days count and the book reached ${goal}. ${book}`
        : `${name} did not get the book to ${goal} before the ninety days ran out. ${book}`;
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
        ? `${name} controls a ${sector} firm. ${book}`
        : `${name} never controlled a ${sector} firm. ${book}`;
    }
    case 'sandbox':
      return `${name} set the book down at ${worth}, from ${start}, with no goal to miss. ${where}.`;
    default:
      return result === 'win'
        ? `${name} met the goal, ${goal}. ${book}`
        : `${name} did not meet the goal, ${goal}. ${book}`;
  }
}

function applyStart(w: World, def: ScenarioDef, opts?: { cash?: number; difficulty?: number }): void {
  const s = econ(w), P = s.P;
  let i = ensurePlayer(w);
  const st = soleSeat(w);
  if (!st) throw new Error('the player was not seated');
  if (!P.alive(i)) {
    P.flags[i] &= ~PLAYER;
    st.who = -1;
    i = ensurePlayer(w);
  }
  P.born[i] = w.day - def.age * DAYS_PER_YEAR;
  const cause = st.arrived >= 0 ? st.arrived : w.genesis;
  const inherited = def.inherit ? inheritFirm(w, i, cause) : undefined;
  if (def.job === 'none') leaveJob(s, i);
  else if (def.job === 'inherit' && inherited) joinFirm(s, i, inherited);
  else if (def.job !== 'any') {
    const f = firmBy(w, def.job);
    if (f) joinFirm(s, i, f);
  }
  if (def.family === 'spouse' || def.family === 'child') {
    const spouse = marry(w, i);
    if (def.family === 'child' && spouse >= 0) P.add(w, w.day, i, spouse);
  }
  seatPerson(w, i, Math.max(0, Math.min(16, def.contacts)));
  const pid = P.id(i);
  for (const [key, qty] of Object.entries(def.holdings)) {
    const f = firmBy(w, key);
    if (f && qty > 0) giveShares(w, pid, 'eq:' + f.id, Math.round(qty), cause);
  }
  const d = opts?.difficulty && opts.difficulty > 0 ? opts.difficulty : 1;
  const dollars = opts?.cash !== undefined && Number.isFinite(opts.cash) && opts.cash >= 0 ? opts.cash : def.cash;
  setCash(w, pid, Math.round(dollars * 100), cause);
  const arrived = w.events.get(st.arrived);
  if (arrived) arrived.msg = arrived.msg.replace('aged 30', `aged ${def.age}`);
  const opened = Math.round(view(w).netWorth);
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
    goal: def.goal,
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
    opening: openingOf(w, def, i, opened, d),
  };
  w.state.scenario = run;
}

export function openScenario(id: string, opts?: { cash?: number; difficulty?: number; seed?: string }): World {
  const def = catalog.find((s) => s.id === id);
  if (!def) throw new Error(`no scenario ${id}. ${catalog.map((s) => s.id).join(', ')}`);
  const saved = worldDir(def.world);
  const seed = opts?.seed || (saved ? snapshotSeed(saved) : def.seed);
  const w = openWorld(seed, new Set(), true);
  if (saved) applySnapshot(w, saved);
  else if (def.years > 0) simulate(w, def.years, 1, false);
  applyStart(w, def, opts);
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
    case 'sector': return result === 'win' ? `You control a ${g.sector} firm.` : `You never controlled a ${g.sector} firm.`;
    case 'office': return result === 'win' ? 'You hold office.' : 'You never held office.';
    case 'dynasty': return result === 'win' ? `The house reached generation ${g.generations}.` : `The house ended before generation ${g.generations}.`;
    case 'crash': return result === 'win' ? 'You came through the crisis solvent.' : 'You did not come through the crisis.';
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
  const st = soleSeat(w);
  if (!st) return;
  st.over = true;
  if (!st.final) st.final = `${sc.name}: ${reason}`;
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

/** Called once a day from play and from the server. Idle runs never set a scenario, so this returns. */
export function reviewScenario(w: World): void {
  const sc = runOf(w);
  if (!sc || sc.outcome) return;
  armShock(w, sc);
  const st = soleSeat(w);
  if (!st || st.who < 0) return;
  sc.who = st.who;
  const P = econ(w).P;
  const dead = st.over || st.who >= P.n || !P.alive(st.who);
  const month = w.day > sc.begun && w.day % 30 === 0;
  const due = sc.deadline > 0 && w.day >= sc.deadline;
  const shockDone = sc.goal.kind === 'crash' && sc.shockUntil !== undefined && w.day >= sc.shockUntil;
  if (!dead && !month && !due && !shockDone) return;
  if (dead && sc.goal.kind === 'none') return;
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
