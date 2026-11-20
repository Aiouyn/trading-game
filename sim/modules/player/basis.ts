// What the player paid for what they hold. The books only know a balance, so the desk keeps a cost basis per position
// (an average entry price) and a list of fill marks for the chart. Both are rebuilt from the ledger balances: when a balance
// differs from what the desk last saw, the difference is a fill, priced by the order that made it (a hint from the command,
// or a resting order that shrank) and otherwise at the mark. A short is shares owed back, so it is a negative position.
// Each sync returns the fills it saw, so every one of them can be told to the player. Nothing here moves money.
import type { World } from '../../kernel/index.ts';
import { fxPairs } from '../abroad/index.ts';
import { coinPrice } from '../crypto/index.ts';
import { midPrice } from '../markets/index.ts';

/** q is signed (a short is negative); c is the cost of the open quantity at its entry prices, always positive. */
export interface Lot { q: number; c: number }
export interface FillMark { abs: number; key: string; side: 'buy' | 'sell'; qty: number; px: number }
interface Resting { key: string; side: 'buy' | 'sell'; qty: number; limit: number }
export type FillHow = 'market' | 'limit' | 'stop' | 'open' | 'margin' | 'buyin' | 'target';
interface Said { key: string; px: number; ref?: number; how?: FillHow; why?: string }
export interface BasisBook {
  pos: Record<string, Lot>;
  marks: FillMark[];
  rest: Record<number, Resting>;
  /** Fills the commands just made: key, price, the price it is measured against and how it was sent. Consumed by the next sync. */
  said: Said[];
  /** Realised profit and loss, by key, for what has been closed (cents, or the key's own unit for a currency). */
  gain: Record<string, number>;
  /** 2 once a short counts as a negative position. */
  v?: number;
}

/** One fill the desk saw: the position before and after, the price, what it is measured against, and what it realised. */
export interface FillNote { key: string; side: 'buy' | 'sell'; qty: number; px: number; was: number; now: number; gain: number; ref?: number; how?: FillHow; why?: string }

export interface BasisSeat { basis?: BasisBook; loans?: { instr: string; qty: number; entry?: number }[] }

const MAX_MARKS = 400;

export function bookOf(seat: BasisSeat): BasisBook {
  return seat.basis ?? (seat.basis = { pos: {}, marks: [], rest: {}, said: [], gain: {}, v: 2 });
}

/** The key of a future position: one per good and delivery month. */
export const futKey = (good: string, month: number): string => `fut:${good}:${month}`;

/** Tell the desk that a command just filled `key` at `px` (cents a unit), so the next sync prices the change exactly. */
export function sayFill(seat: BasisSeat, key: string, px: number, how?: { ref?: number; how?: FillHow; why?: string }): void {
  if (!(px > 0)) return;
  const b = bookOf(seat);
  b.said.push({ key, px, ...(how?.ref && how.ref > 0 ? { ref: how.ref } : {}), ...(how?.how ? { how: how.how } : {}), ...(how?.why ? { why: how.why } : {}) });
  if (b.said.length > 40) b.said.splice(0, b.said.length - 40);
}

interface Hold { q: number; px: number }

function holdings(w: World, id: string, seat: BasisSeat): Map<string, Hold> {
  const out = new Map<string, Hold>();
  const mk = w.state.markets as { stocks?: { instr: string }[] } | undefined;
  const owed = new Map<string, number>();
  for (const l of seat.loans ?? []) owed.set(l.instr, (owed.get(l.instr) ?? 0) + l.qty);
  for (const st of mk?.stocks ?? []) {
    const q = Math.floor(w.ledger.balance(id, st.instr)) - (owed.get(st.instr) ?? 0);
    if (q !== 0) out.set(st.instr, { q, px: midPrice(w, st.instr) });
  }
  const cx = w.state.crypto as { majors?: { id: string }[]; memes?: { id: string }[] } | undefined;
  for (const m of [...(cx?.majors ?? []), ...(cx?.memes ?? [])]) {
    const q = Math.floor(w.ledger.balance(id, m.id));
    if (q > 0) out.set(m.id, { q, px: coinPrice(w, m.id)?.px ?? 0 });
  }
  const cm = w.state.commodities as { books?: { good: string; tenors: { month: number; longId: string; shortId: string; px: number }[] }[] } | undefined;
  for (const b of cm?.books ?? []) for (const t of b.tenors) {
    const net = Math.round(w.ledger.balance(id, t.longId) - w.ledger.balance(id, t.shortId));
    if (net !== 0) out.set(futKey(b.good, t.month), { q: net, px: t.px });
  }
  // a currency: units held (the ledger keeps foreign cents), priced at the dealer's rate in dollars a unit, not cents
  for (const p of fxPairs(w)) {
    const units = Math.round(w.ledger.balance(id, p.fx)) / 100;
    if (units > 0) out.set(p.id, { q: units, px: p.q });
  }
  return out;
}

function restingNow(w: World, id: string): Map<number, Resting> {
  const out = new Map<number, Resting>();
  const mo = (w.state.markets as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number | null; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of mo) if (o.open && o.actor === id && o.limit) out.set(o.id, { key: o.instr, side: o.side === 'buy' ? 'buy' : 'sell', qty: o.qty, limit: o.limit });
  const co = (w.state.crypto as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of co) if (o.open && o.actor === id) out.set(o.id, { key: o.instr, side: o.side === 'buy' ? 'buy' : 'sell', qty: o.qty, limit: o.limit });
  return out;
}

function clockAbs(w: World): number {
  const min = (w.state.clock as { min?: number } | undefined)?.min ?? 0;
  return w.day * 1440 + (Number.isFinite(min) ? min : 0);
}

/** Add `delta` units at `px` to a lot, or take them off at its average. Returns what was realised (positive is a gain). */
function applyLot(b: BasisBook, key: string, delta: number, px: number): number {
  let made = 0;
  const lot = b.pos[key] ?? { q: 0, c: 0 };
  if (lot.q === 0 || Math.sign(lot.q) === Math.sign(delta)) {
    lot.q += delta;
    lot.c += Math.abs(delta) * px;
  } else {
    const avg = lot.c / Math.abs(lot.q);
    const closed = Math.min(Math.abs(delta), Math.abs(lot.q));
    // a long sold above its average, or a short bought back below it, is a gain
    made = Math.sign(lot.q) * (px - avg) * closed;
    b.gain[key] = (b.gain[key] ?? 0) + Math.round(made);
    lot.c -= avg * closed;
    lot.q += Math.sign(delta) * closed;
    const rest = Math.abs(delta) - closed;
    if (rest > 0) { lot.q = Math.sign(delta) * rest; lot.c = rest * px; }
  }
  if (Math.abs(lot.q) < 1e-6 || lot.c <= 0) delete b.pos[key];
  else b.pos[key] = lot;
  return made;
}

/** True when the bank called or sold out a margin loan of this actor today or yesterday. */
function marginToday(w: World, id: string): boolean {
  for (const kind of ['loan.margin', 'loan.sell', 'loan.shortfall']) {
    const e = w.events.last(kind);
    const ev = e !== undefined ? w.events.get(e) : undefined;
    if (ev && ev.actor === id && ev.day >= w.day - 1) return true;
  }
  return false;
}

/**
 * Bring the cost basis in line with the balances and return the fills that made the difference. `id` is the player's
 * ledger id. A first call only records what is held (at the mark, a short at its sale price): that is the starting position.
 */
export function syncBasis(w: World, seat: BasisSeat, id: string): FillNote[] {
  const first = !seat.basis || seat.basis.v !== 2;
  const b = bookOf(seat);
  if (first) { b.pos = {}; b.v = 2; }
  const now = holdings(w, id, seat);
  const rests = restingNow(w, id);
  const notes: FillNote[] = [];
  // fills explained by resting orders that shrank or filled since the last look
  const explained = new Map<string, { side: 'buy' | 'sell'; qty: number; px: number }[]>();
  for (const [oid, was] of Object.entries(b.rest)) {
    const cur = rests.get(Number(oid));
    const left = cur ? cur.qty : 0;
    if (was.qty - left < 1) continue;
    const list = explained.get(was.key) ?? [];
    list.push({ side: was.side, qty: was.qty - left, px: was.limit });
    explained.set(was.key, list);
  }
  b.rest = {};
  for (const [oid, o] of rests) b.rest[oid] = o;
  const said = b.said;
  b.said = [];
  const keys = new Set<string>([...Object.keys(b.pos), ...now.keys()]);
  const abs = clockAbs(w);
  for (const key of keys) {
    const was = b.pos[key]?.q ?? 0;
    const cur = now.get(key);
    const q = cur ? cur.q : 0;
    if (Math.abs(q - was) < 1e-6) continue;
    let delta = q - was;
    const side: 'buy' | 'sell' = delta > 0 ? 'buy' : 'sell';
    const mark = cur && cur.px > 0 ? cur.px : (b.pos[key] ? b.pos[key].c / Math.abs(b.pos[key].q) : 0);
    if (first) {
      const loan = q < 0 ? (seat.loans ?? []).find((l) => l.instr === key && l.entry) : undefined;
      const px = loan?.entry ?? mark;
      if (q !== 0 && px > 0) applyLot(b, key, q, px);
      continue;
    }
    // priced by what the commands said, then by resting orders, then by the mark
    const hint = said.filter((s) => s.key === key).pop();
    // a share split gives every holder a whole multiple of what they held: the same cost over more shares
    if (!hint && key.startsWith('eq:') && was > 0 && q > was && q % was === 0 && q / was <= 10 && !explained.has(key)) {
      const r = q / was;
      b.pos[key]!.q = q;
      for (const m of b.marks) if (m.key === key) m.px /= r;
      continue;
    }
    const note = (qty: number, px: number, gain: number, extra: { ref?: number; how?: FillHow; why?: string }): void => {
      const last = notes[notes.length - 1];
      if (last && last.key === key && last.side === side && last.how === extra.how) {
        last.px = (last.px * last.qty + px * qty) / (last.qty + qty);
        last.qty += qty; last.gain += gain; last.now = q;
        return;
      }
      notes.push({ key, side, qty, px, was, now: q, gain, ...extra });
    };
    if (hint) {
      const g = applyLot(b, key, delta, hint.px);
      b.marks.push({ abs, key, side, qty: Math.abs(delta), px: hint.px });
      note(Math.abs(delta), hint.px, g, { ref: hint.ref, how: hint.how ?? 'market', why: hint.why });
      continue;
    }
    for (const ex of explained.get(key) ?? []) {
      if (ex.side !== side || delta === 0) continue;
      const take = Math.min(Math.abs(delta), ex.qty);
      const g = applyLot(b, key, Math.sign(delta) * take, ex.px);
      b.marks.push({ abs, key, side, qty: take, px: ex.px });
      note(take, ex.px, g, { ref: ex.px, how: 'limit' });
      delta -= Math.sign(delta) * take;
    }
    if (delta !== 0 && mark > 0) {
      const g = applyLot(b, key, delta, mark);
      // A change no order explains. The bank selling collateral on a margin call is a fill and is told;
      // a gift, an estate or a takeover is not a trade.
      if (side === 'sell' && key.startsWith('eq:') && marginToday(w, id)) {
        b.marks.push({ abs, key, side, qty: Math.abs(delta), px: mark });
        note(Math.abs(delta), mark, g, { how: 'margin' });
      }
    }
  }
  if (b.marks.length > MAX_MARKS) b.marks.splice(0, b.marks.length - MAX_MARKS);
  return notes;
}

/** Average entry price of a position in cents a unit, or 0 when none is held. */
export function entryOf(seat: BasisSeat, key: string): number {
  const lot = seat.basis?.pos[key];
  return lot && lot.q !== 0 ? lot.c / Math.abs(lot.q) : 0;
}

/** The signed quantity the desk holds of a key: negative for a short. */
export function posOf(seat: BasisSeat, key: string): number {
  return seat.basis?.pos[key]?.q ?? 0;
}
