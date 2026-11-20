// What the player paid for what they hold. The books only know a balance, so the desk keeps a cost basis per position
// (an average entry price) and a list of fill marks for the chart. Both are rebuilt from the ledger balances: when a balance
// differs from what the desk last saw, the difference is a fill, priced by the order that made it (a hint from the command,
// or a resting order that shrank) and otherwise at the mark. Nothing here moves money.
import type { World } from '../../kernel/index.ts';
import { fxPairs } from '../abroad/index.ts';
import { coinPrice } from '../crypto/index.ts';
import { midPrice } from '../markets/index.ts';

/** q is signed (a short future is negative); c is the cost of the open quantity at its entry prices, always positive. */
export interface Lot { q: number; c: number }
export interface FillMark { abs: number; key: string; side: 'buy' | 'sell'; qty: number; px: number }
interface Resting { key: string; side: 'buy' | 'sell'; qty: number; limit: number }
export interface BasisBook {
  pos: Record<string, Lot>;
  marks: FillMark[];
  rest: Record<number, Resting>;
  /** Fills the commands just made: key, price. Consumed by the next sync. */
  said: { key: string; px: number }[];
  /** Realised profit and loss in cents, by key, for what has been closed. */
  gain: Record<string, number>;
}

export interface BasisSeat { basis?: BasisBook }

const MAX_MARKS = 400;

export function bookOf(seat: BasisSeat): BasisBook {
  return seat.basis ?? (seat.basis = { pos: {}, marks: [], rest: {}, said: [], gain: {} });
}

/** The key of a future position: one per good and delivery month. */
export const futKey = (good: string, month: number): string => `fut:${good}:${month}`;

/** Tell the desk that a command just filled `key` at `px` (cents a unit), so the next sync prices the change exactly. */
export function sayFill(seat: BasisSeat, key: string, px: number): void {
  if (!(px > 0)) return;
  const b = bookOf(seat);
  b.said.push({ key, px });
  if (b.said.length > 40) b.said.splice(0, b.said.length - 40);
}

interface Hold { q: number; px: number }

function holdings(w: World, id: string): Map<string, Hold> {
  const out = new Map<string, Hold>();
  const mk = w.state.markets as { stocks?: { instr: string }[] } | undefined;
  for (const st of mk?.stocks ?? []) {
    const q = Math.floor(w.ledger.balance(id, st.instr));
    if (q > 0) out.set(st.instr, { q, px: midPrice(w, st.instr) });
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

/** Add `delta` units at `px` to a lot, or take them off at its average. Returns the realised cents (positive is a gain). */
function applyLot(b: BasisBook, key: string, delta: number, px: number): void {
  const lot = b.pos[key] ?? { q: 0, c: 0 };
  if (lot.q === 0 || Math.sign(lot.q) === Math.sign(delta)) {
    lot.q += delta;
    lot.c += Math.abs(delta) * px;
  } else {
    const avg = lot.c / Math.abs(lot.q);
    const closed = Math.min(Math.abs(delta), Math.abs(lot.q));
    // a long sold above its average, or a short bought back below it, is a gain
    b.gain[key] = (b.gain[key] ?? 0) + Math.round(Math.sign(lot.q) * (px - avg) * closed);
    lot.c -= avg * closed;
    lot.q += Math.sign(delta) * closed;
    const rest = Math.abs(delta) - closed;
    if (rest > 0) { lot.q = Math.sign(delta) * rest; lot.c = rest * px; }
  }
  if (Math.abs(lot.q) < 1e-6 || lot.c <= 0) delete b.pos[key];
  else b.pos[key] = lot;
}

/**
 * Bring the cost basis in line with the balances. `id` is the player's ledger id. A first call only records what is held
 * (at the mark: that is the starting position), with no marks.
 */
export function syncBasis(w: World, seat: BasisSeat, id: string): void {
  const first = !seat.basis;
  const b = bookOf(seat);
  const now = holdings(w, id);
  const rests = restingNow(w, id);
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
    if (first) { if (q !== 0 && mark > 0) applyLot(b, key, q, mark); continue; }
    // priced by what the commands said, then by resting orders, then by the mark
    const hint = said.filter((s) => s.key === key).pop();
    // a share split gives every holder a whole multiple of what they held: the same cost over more shares
    if (!hint && key.startsWith('eq:') && was > 0 && q > was && q % was === 0 && q / was <= 10 && !explained.has(key)) {
      const r = q / was;
      b.pos[key]!.q = q;
      for (const m of b.marks) if (m.key === key) m.px /= r;
      continue;
    }
    if (hint) {
      applyLot(b, key, delta, hint.px);
      b.marks.push({ abs, key, side, qty: Math.abs(delta), px: hint.px });
      continue;
    }
    for (const ex of explained.get(key) ?? []) {
      if (ex.side !== side || delta === 0) continue;
      const take = Math.min(Math.abs(delta), ex.qty);
      applyLot(b, key, Math.sign(delta) * take, ex.px);
      b.marks.push({ abs, key, side, qty: take, px: ex.px });
      delta -= Math.sign(delta) * take;
    }
    if (delta !== 0 && mark > 0) applyLot(b, key, delta, mark);
  }
  if (b.marks.length > MAX_MARKS) b.marks.splice(0, b.marks.length - MAX_MARKS);
}

/** Average entry price of a position in cents a unit, or 0 when none is held. */
export function entryOf(seat: BasisSeat, key: string): number {
  const lot = seat.basis?.pos[key];
  return lot && lot.q !== 0 ? lot.c / Math.abs(lot.q) : 0;
}
