// The player's cash book: every posting that touches the player's deposit, grouped by day and by what it was for.
// The kernel ledger is not touched. `watchCash` wraps the slot-level postings on this world's own ledger so that
// a posting to or from the player's deposit is counted under its reason. Nothing here moves money.
//
// Rows posted while the city closes a day (wages, benefits, rent, household spending) belong to the morning
// after, so they are booked under the new day: that is when the player sees them land.
import type { World } from '../../kernel/index.ts';

interface Book { days: Record<number, Record<string, number>>; counts: Record<number, Record<string, number>> }
interface Watch { slot: number; overnight: boolean; world: World | null }

const KEEP_DAYS = 21;
const watches = new WeakMap<object, Watch>();

const LABELS: Record<string, [string, string]> = {
  wages: ['Wages', 'Pay from your employer, after income tax'],
  'gov.benefits': ['Unemployment benefit', 'The weekly benefit the city pays to people without work who have worked here'],
  'gov.pensions': ['Pension', 'The weekly state pension'],
  consumption: ['Everyday spending', 'Food, fares, power and the other things a household buys'],
  'consumption.refund': ['Everyday spending', 'Food, fares, power and the other things a household buys'],
  'property.rent': ['Rent', 'Rent for the room or home you live in'],
  'property.buy': ['Home purchase', 'The price of a home'],
  'property.transfer': ['Home purchase', 'The price of a home'],
  'housing.buy': ['Home purchase', 'The price of a home'],
  'housing.sale': ['Home sale', 'What a home sold for'],
  'loan.grant': ['Loan paid out', 'Money a bank lent you'],
  'loan.repay': ['Loan repaid', 'Repayment of a loan'],
  'loan.interest': ['Loan interest', 'Interest on what you owe'],
  'deposit.interest': ['Deposit interest', 'Interest on your time deposits'],
  'deposit.place': ['Time deposit', 'Cash placed in a time deposit'],
  'deposit.withdraw': ['Time deposit', 'Cash taken out of a time deposit'],
  dividend: ['Dividends', 'A firm paid out profit to its shareholders'],
  dividends: ['Dividends', 'A firm paid out profit to its shareholders'],
  'tax.dividend': ['Dividend tax', 'Tax taken at source from dividends'],
  'tax.income': ['Income tax', 'Tax on income'],
  'tax.pay': ['Tax', 'Tax you paid'],
  'mkt.trade': ['Share trades', 'Shares bought or sold'],
  'crypto.trade': ['Coin trades', 'Coins bought or sold'],
  'crypto.buy': ['Coin trades', 'Coins bought or sold'],
  'crypto.sell': ['Coin trades', 'Coins bought or sold'],
  'venue.evening': ['A night out', 'The door and the first drinks at a venue'],
  'venue.round': ['A round of drinks', 'A round bought at a venue'],
  'venue.loan': ['A loan from a friend', 'Money a contact lent you'],
  'venue.repay': ['Repaying a friend', 'A loan paid back to a contact'],
  'course.fee': ['Course fee', 'The fee for an evening course'],
  'career.study': ['Study fee', 'The fee for training in a trade'],
  'circle.pay': ['Dinners, gifts and loans', 'Money between you and the people you know'],
  'society.pay': ['Society events', 'Tickets and tables at parties and galas'],
  'player.arrival': ['Savings brought from abroad', 'The savings you arrived with'],
  'player.endowment': ['Starting cash', 'The money you began with'],
  'migration.arrive': ['Arrival money', 'What a newcomer carries in'],
  'media.subscription': ['Newspaper', 'A subscription to the papers'],
  'health.claim': ['Health care', 'Clinic and hospital bills'],
  'player.draw': ['Owner draw', 'Money taken out of your own firm'],
  'player.school': ['School fees', 'Fees for your children'],
};

function nice(reason: string): [string, string] {
  const hit = LABELS[reason];
  if (hit) return hit;
  const head = reason.split('.')[0];
  const rest = reason.includes('.') ? reason.slice(head.length + 1).replace(/[._]/g, ' ') : '';
  const word = (rest || head).replace(/^./, (c) => c.toUpperCase());
  return [word, `Booked as ${reason}`];
}

function bookOf(w: World): Book {
  let b = w.state.cashbook as Book | undefined;
  if (!b || !b.days) { b = { days: {}, counts: {} }; w.state.cashbook = b; }
  return b;
}

/** Wrap the ledger's slot postings so deposit flows of the watched slot are counted. Safe to call again. */
export function watchCash(w: World, slot: number): void {
  const L = w.ledger as unknown as Record<string, unknown> & { day: number };
  let st = watches.get(L);
  if (st) { st.slot = slot; st.world = w; return; }
  st = { slot, overnight: false, world: w };
  watches.set(L, st);
  const watch = st;
  const book = (): Book => bookOf(watch.world as World);
  const note = (reason: string, cents: number): void => {
    const day = (watch.world as World).day + (watch.overnight ? 1 : 0);
    const b = book();
    const row = (b.days[day] ??= {});
    row[reason] = (row[reason] ?? 0) + cents;
    const cn = (b.counts[day] ??= {});
    cn[reason] = (cn[reason] ?? 0) + 1;
    const keys = Object.keys(b.days);
    if (keys.length > KEEP_DAYS) {
      for (const k of keys) if (Number(k) < day - KEEP_DAYS) { delete b.days[Number(k)]; delete b.counts[Number(k)]; }
    }
  };
  const proto = Object.getPrototypeOf(L) as Record<string, (...a: unknown[]) => unknown>;
  const moveS = proto.moveS, issueS = proto.issueS, redeemS = proto.redeemS;
  const hide = (name: string, fn: unknown): void => { Object.defineProperty(L, name, { value: fn, enumerable: false, writable: true, configurable: true }); };
  hide('moveS', function (this: unknown, instr: string, from: number, to: number, amount: number, reason: string, cause: number): boolean {
    const ok = moveS.call(this, instr, from, to, amount, reason, cause) as boolean;
    if (ok && instr === 'dep' && amount > 0 && (from === watch.slot || to === watch.slot) && from !== to) note(reason, to === watch.slot ? amount : -amount);
    return ok;
  });
  hide('issueS', function (this: unknown, instr: string, to: number, amount: number, reason: string, cause: number): void {
    issueS.call(this, instr, to, amount, reason, cause);
    if (instr === 'dep' && amount > 0 && to === watch.slot) note(reason, amount);
  });
  hide('redeemS', function (this: unknown, instr: string, from: number, amount: number, reason: string, cause: number): boolean {
    const ok = redeemS.call(this, instr, from, amount, reason, cause) as boolean;
    if (ok && instr === 'dep' && amount > 0 && from === watch.slot) note(reason, -amount);
    return ok;
  });
}

/** Start the book over with one opening line: what the player arrived with. */
export function openBook(w: World, reason: string, cents: number): void {
  w.state.cashbook = { days: { [w.day]: { [reason]: cents } }, counts: { [w.day]: { [reason]: 1 } } };
}

/** The wrapper treats postings as overnight while the city closes a day. */
export function setOvernight(w: World, on: boolean): void {
  const st = watches.get(w.ledger as unknown as object);
  if (st) st.overnight = on;
}
export function watching(w: World): boolean { return watches.has(w.ledger as unknown as object); }

export interface CashRow { label: string; why: string; cents: number; count: number; reasons: string[] }
export interface CashDay { day: number; in: number; out: number; net: number; rows: CashRow[] }

/** One day's money, by what it was for. Rows that share a label are one line. */
export function cashDay(w: World, day: number): CashDay {
  const b = bookOf(w);
  const raw = b.days[day] ?? {};
  const cnt = b.counts[day] ?? {};
  const by = new Map<string, CashRow>();
  for (const reason of Object.keys(raw)) {
    const [label, why] = nice(reason);
    const row = by.get(label) ?? { label, why, cents: 0, count: 0, reasons: [] };
    row.cents += raw[reason];
    row.count += cnt[reason] ?? 1;
    row.reasons.push(reason);
    by.set(label, row);
  }
  const rows = [...by.values()].filter((r) => r.cents !== 0).sort((a, c) => Math.abs(c.cents) - Math.abs(a.cents));
  let into = 0, out = 0;
  for (const r of rows) { if (r.cents > 0) into += r.cents; else out += -r.cents; }
  return { day, in: into, out, net: into - out, rows };
}

/** The last few days, newest first, for the Why-cash screen. */
export function cashDays(w: World, days: number): CashDay[] {
  const out: CashDay[] = [];
  for (let d = w.day; d > w.day - days && d >= 0; d--) out.push(cashDay(w, d));
  return out;
}
