// The first-paycheck lesson: seven small goals, one hint at a time, each finished by doing it.
// The world has to make a step possible (a wage, a price that moved, a contact who knows something)
// before the hint tells the player to act. `hints off` skips the rest.
import type { World } from '../../kernel/index.ts';
import { DEP, type EconState } from '../economy/index.ts';
import { pledgeValue, saleProceeds } from '../markets/index.ts';
import { contactsOf, knows } from '../social/index.ts';

export interface TutorialView {
  step: string;
  goal: string;
  hint: string;
  done: boolean;
}

export interface TutorialState {
  skipped: boolean;
  sheet: boolean;
  bank: boolean;
  share: boolean;
  why: boolean;
  ask: boolean;
  loan: boolean;
  repay: boolean;
  instr: string;
  px: number;
}

/** The slice of a command this file looks at. */
export interface ActNote {
  kind: string;
  op?: string;
  side?: string;
  instr?: string;
  thing?: string;
}

export interface TutorSeat {
  who: number;
  tutor?: TutorialState | null;
}

const STEPS = ['sheet', 'bank', 'share', 'why', 'ask', 'loan', 'repay'] as const;
type StepId = (typeof STEPS)[number];

const GOAL: Record<StepId, string> = {
  sheet: 'Check your sheet',
  bank: 'Open a bank account',
  share: 'Buy your first share',
  why: 'Read why it moved',
  ask: 'Ask a contact',
  loan: 'Take a loan',
  repay: 'Pay it back',
};

const econ = (w: World): EconState => w.state.economy as EconState;

function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const n = Math.abs(Math.round(cents));
  return sign + '$' + (n / 100).toLocaleString('en-US', { maximumFractionDigits: n % 100 === 0 ? 0 : 2 });
}

function scenarioId(w: World): string {
  const sc = w.state.scenario as { id?: string } | undefined;
  return sc?.id ?? '';
}

function fresh(): TutorialState {
  return {
    skipped: false, sheet: false, bank: false, share: false, why: false, ask: false, loan: false, repay: false,
    instr: '', px: 0,
  };
}

function stateOf(w: World, seat: TutorSeat): TutorialState | null {
  if (scenarioId(w) !== 'first-paycheck') return null;
  if (!seat.tutor) seat.tutor = fresh();
  return seat.tutor;
}

export function skipTutorial(w: World, seat: TutorSeat): void {
  const t = stateOf(w, seat);
  if (t) t.skipped = true;
}

interface Stock { instr: string; issuer: string; last: number; moveEv?: number }

function stocksOf(w: World): Stock[] {
  return (w.state.markets as { stocks?: Stock[] } | undefined)?.stocks ?? [];
}

function stockBy(w: World, key: string): Stock | undefined {
  const k = key.toLowerCase();
  const stocks = stocksOf(w);
  for (const s of stocks) {
    const bare = s.issuer.startsWith('frm_') ? s.issuer.slice(4) : s.issuer;
    if (s.instr.toLowerCase() === k || s.instr.toLowerCase() === 'eq:' + k || s.issuer.toLowerCase() === k || bare === k) return s;
  }
  const firm = econ(w).firms.find((f) => f.name.toLowerCase() === k || f.id.toLowerCase() === k);
  if (!firm) return;
  return stocks.find((s) => s.issuer === firm.id);
}

function cashOf(w: World, i: number): number {
  if (i < 0) return 0;
  return Math.floor(w.ledger.balance(econ(w).P.id(i), DEP));
}

function depositsOf(w: World, i: number): number {
  if (i < 0) return 0;
  const id = econ(w).P.id(i);
  const banks = (w.state.banking as { banks?: { depo: string }[] } | undefined)?.banks ?? [];
  let n = 0;
  for (const b of banks) n += Math.floor(w.ledger.balance(id, b.depo));
  return n;
}

function sharesOf(w: World, i: number): { instr: string; qty: number; px: number }[] {
  if (i < 0) return [];
  const id = econ(w).P.id(i);
  const out: { instr: string; qty: number; px: number }[] = [];
  for (const s of stocksOf(w)) {
    const qty = Math.floor(w.ledger.balance(id, s.instr));
    if (qty > 0) out.push({ instr: s.instr, qty, px: s.last });
  }
  return out;
}

function marginOf(w: World, i: number): { owed: number; rate: number } {
  const book = w.state.banking as { ln: number; lnOpen: Uint8Array; lnPerson: Int32Array; lnKind: Uint8Array; lnRate: Float64Array } | undefined;
  if (!book || i < 0) return { owed: 0, rate: 0 };
  let owed = 0, rate = 0;
  for (let k = 0; k < book.ln; k++) {
    if (!book.lnOpen[k] || book.lnPerson[k] !== i || book.lnKind[k] !== 3) continue;
    const n = Math.floor(w.ledger.issued.get('pl_' + k) ?? 0);
    if (n <= 0) continue;
    owed += n;
    rate = book.lnRate[k];
  }
  return { owed, rate };
}

/** A share the player can afford that someone is already bidding for, so a margin loan has collateral. */
function suggestShare(w: World, cash: number, actor: string): Stock | undefined {
  let best: Stock | undefined;
  let bestSale = 0;
  for (const s of stocksOf(w)) {
    if (s.last < 100 || s.last > cash || !actor) continue;
    const sale = saleProceeds(w, s.instr, 1, actor);
    if (sale < 1) continue;
    if (!best || sale > bestSale) { best = s; bestSale = sale; }
  }
  return best;
}

function firmLabel(w: World, instr: string): string {
  const st = stockBy(w, instr);
  if (!st) return instr;
  const f = econ(w).firms.find((x) => x.id === st.issuer);
  return f?.name ?? st.issuer;
}

function bare(instr: string): string {
  return instr.startsWith('eq:') ? instr.slice(3) : instr;
}

interface Ask {
  slot: number;
  who: string;
  firm: string;
  firmName: string;
}

function askTarget(w: World, i: number): Ask | null {
  const soc = w.state.social as {
    head?: Int32Array; cellFact?: Int32Array; cellNext?: Int32Array; trust?: Uint8Array;
    facts?: { pub?: boolean; drop?: boolean; firms?: number[]; id?: number }[];
  } | undefined;
  if (!soc?.head || !soc.cellFact || !soc.cellNext || !soc.trust || !soc.facts || i < 0) return null;
  const firms = econ(w).firms;
  const P = econ(w).P;
  const DEG = 16;
  for (const c of contactsOf(w, i)) {
    if (soc.trust[i * DEG + c.slot] < 40) continue;
    let cell = soc.head[c.who];
    while (cell >= 0) {
      const fact = soc.facts[soc.cellFact[cell]];
      cell = soc.cellNext[cell];
      if (!fact || fact.drop || fact.pub || fact.id === undefined || knows(w, i, fact.id)) continue;
      const fi = fact.firms?.[0];
      if (fi === undefined || !firms[fi]) continue;
      return { slot: c.slot, who: P.name(c.who), firm: firms[fi].id, firmName: firms[fi].name };
    }
  }
  return null;
}

function priceMoved(w: World, t: TutorialState): boolean {
  if (!t.instr || t.px <= 0) return false;
  const st = stockBy(w, t.instr);
  return !!st && st.last !== t.px;
}

function loanRoom(w: World, i: number): number {
  if (i < 0 || !w.state.markets) return 0;
  try { return pledgeValue(w, econ(w).P.id(i)); } catch { return 0; }
}

function loanDollars(w: World, room: number): number {
  const sc = w.state.scenario as { loan?: number } | undefined;
  const mult = sc?.loan && sc.loan > 0 ? sc.loan : 1;
  const dollars = Math.floor(room / 100 / mult);
  if (dollars < 1) return 0;
  return Math.min(100, dollars);
}

function hintFor(w: World, i: number, step: StepId, t: TutorialState): string {
  const P = econ(w).P;
  const cash = cashOf(w, i);
  const name = i >= 0 ? P.name(i) : 'You';
  const emp = i >= 0 && P.employer[i] >= 0 ? econ(w).firms[P.employer[i]]?.name ?? '' : '';
  if (step === 'sheet') return `Type sheet. ${name}${emp ? `, at ${emp},` : ''} has ${dollars(cash)} in cash.`;
  if (step === 'bank') {
    if (cash < 100) return `The wage has not cleared enough to bank. You have ${dollars(cash)}. Wait, then deposit.`;
    return `Type deposit 50. That opens a time deposit. You have ${dollars(cash)} in cash.`;
  }
  if (step === 'share') {
    const held = sharesOf(w, i);
    if (!held.length && t.instr) return `The order for ${firmLabel(w, t.instr)} is in. Wait a day for it to print.`;
    const pick = suggestShare(w, cash, i >= 0 ? P.id(i) : '');
    if (!pick) return `Wait. No share you can afford has a bid the bank will lend against. You have ${dollars(cash)}.`;
    const sym = bare(pick.issuer);
    return `Type buy ${sym} 1. ${firmLabel(w, pick.instr)} is ${dollars(pick.last)}, and you have ${dollars(cash)}.`;
  }
  if (step === 'why') {
    const label = firmLabel(w, t.instr);
    const now = stockBy(w, t.instr);
    if (!priceMoved(w, t)) return `You hold ${label} at ${dollars(now?.last ?? t.px)}. Wait for the price to move, then type why price ${bare(t.instr)}.`;
    return `Type why price ${bare(t.instr)}. ${label} was ${dollars(t.px)} and is now ${dollars(now?.last ?? t.px)}.`;
  }
  if (step === 'ask') {
    const hit = askTarget(w, i);
    if (!hit) return 'Wait. None of your contacts knows a private fact you have not already heard.';
    const first = hit.who.split(' ')[0];
    return `Type ask ${hit.slot} ${hit.firm}. ${first} knows something about ${hit.firmName}.`;
  }
  if (step === 'loan') {
    const room = loanRoom(w, i);
    const n = loanDollars(w, room);
    if (n < 1) return `The bank lends against shares. Yours would fetch ${dollars(room)}. Buy more, or wait.`;
    return `Type borrow ${n}. The bank lends against the shares, which would fetch ${dollars(room)}.`;
  }
  const owed = marginOf(w, i);
  return `Type repay ${Math.max(1, Math.ceil(owed.owed / 100))}. You owe ${dollars(owed.owed)} at ${(owed.rate * 100).toFixed(2)}%.`;
}

function current(t: TutorialState): StepId | 'done' {
  if (!t.sheet) return 'sheet';
  if (!t.bank) return 'bank';
  if (!t.share) return 'share';
  if (!t.why) return 'why';
  if (!t.ask) return 'ask';
  if (!t.loan) return 'loan';
  if (!t.repay) return 'repay';
  return 'done';
}

const IDLE: TutorialView = { step: '', goal: '', hint: '', done: true };

export function tutorialOf(w: World, seat: TutorSeat, i: number): TutorialView {
  const t = stateOf(w, seat);
  if (!t) return IDLE;
  if (t.skipped) return { step: 'skip', goal: 'The lesson is skipped.', hint: '', done: true };
  const step = current(t);
  if (step === 'done') return { step: 'done', goal: 'You have finished the first hour.', hint: '', done: true };
  return { step, goal: GOAL[step], hint: hintFor(w, i, step, t), done: false };
}

/** Mark steps the player just did. Later steps stay shut until the earlier ones are done, but a real act is remembered. */
export function noteAct(w: World, seat: TutorSeat, i: number, cmd: ActNote): void {
  const t = stateOf(w, seat);
  if (!t || t.skipped || i < 0) return;
  if (cmd.kind === 'sheet') t.sheet = true;
  if (depositsOf(w, i) > 0) t.bank = true;
  if (cmd.kind === 'order' && cmd.side === 'buy' && cmd.instr && !t.instr) {
    const st = stockBy(w, cmd.instr);
    if (st) { t.instr = st.instr; t.px = st.last; }
  }
  const held = sharesOf(w, i);
  if (held.length) {
    t.share = true;
    if (!t.instr) {
      const top = held.reduce((a, b) => a.px * a.qty >= b.px * b.qty ? a : b);
      t.instr = top.instr;
      t.px = top.px;
    }
  }
  if (cmd.kind === 'why' && t.share && priceMoved(w, t)) {
    const thing = (cmd.thing ?? '').toLowerCase();
    const key = bare(t.instr).toLowerCase();
    const label = firmLabel(w, t.instr).toLowerCase();
    if (!thing || thing.includes('price') || thing.includes(key) || thing.includes(label) || thing === 'share' || thing === 'shares') t.why = true;
  }
  if (cmd.kind === 'ask') t.ask = true;
  if (marginOf(w, i).owed > 0) t.loan = true;
  if (cmd.kind === 'cash' && cmd.op === 'repay' && t.loan && marginOf(w, i).owed <= 0) t.repay = true;
}
