// A private monthly figure is only an edge against the same firm's figure from a quarter ago.
// Hold that name through the reprice, and keep the rest of the money in the market.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { BUFFER, heldQty, live, spendable, stockForName, stocks } from './lib.ts';

export const name = 'insider';

const LEAK = /(.+?) insiders see a monthly (profit|loss) of (\d+)/;
const seen = new WeakMap<World, Set<number>>();
const hist = new WeakMap<World, Map<string, { day: number; cents: number }[]>>();
const ride = new WeakMap<World, { instr: string; until: number }>();
const rounds = new WeakMap<World, number>();

function memory(w: World): Map<string, { day: number; cents: number }[]> {
  let m = hist.get(w);
  if (!m) { m = new Map(); hist.set(w, m); }
  return m;
}

function note(w: World, v: PlayerView, instr: string, day: number, cents: number): void {
  const row = memory(w).get(instr) ?? [];
  if (row.some((x) => x.day === day)) return;
  row.push({ day, cents });
  if (row.length > 8) row.shift();
  memory(w).set(instr, row);
}

/** Latest private reading against the reading from at least a quarter earlier. */
function edgeOf(w: World, instr: string, day: number, cents: number): number | undefined {
  const row = memory(w).get(instr);
  if (!row) return undefined;
  let base: { day: number; cents: number } | undefined;
  for (const x of row) if (x.day <= day - 70 && x.cents > 0 && (!base || x.day > base.day)) base = x;
  if (!base) return undefined;
  return cents / base.cents - 1;
}

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  let done = seen.get(w);
  if (!done) { done = new Set(); seen.set(w, done); }
  const book = stocks(v);
  const cmds: Command[] = [];
  const ticker = book.length ? book[Math.floor(v.date.abs / 7) % book.length].instr : '';
  const extra = ticker.startsWith('eq:') ? ticker.slice(3) : ticker;
  for (const c of v.contacts) {
    cmds.push({ kind: 'talk', slot: c.slot });
    if (v.firm) cmds.push({ kind: 'ask', slot: c.slot, firm: v.firm });
    if (extra && extra !== v.firm) cmds.push({ kind: 'ask', slot: c.slot, firm: extra });
  }
  let best: { instr: string; edge: number } | undefined;
  for (const p of v.private) {
    const m = LEAK.exec(p.text);
    if (!m) continue;
    const instr = stockForName(v, m[1]);
    if (!instr) continue;
    const cents = Number(m[3]) * 100 * (m[2] === 'loss' ? -1 : 1);
    if (!(cents > 0)) continue;
    const edge = edgeOf(w, instr, p.day, cents);
    note(w, v, instr, p.day, cents);
    if (done.has(p.eventId) || edge === undefined) continue;
    done.add(p.eventId);
    if (Math.abs(edge) < 0.18) continue;
    if (!best || edge > best.edge) best = { instr, edge };
  }
  let open = ride.get(w);
  if (open && v.date.abs >= open.until) { ride.delete(w); open = undefined; }
  if (best && best.edge >= 0.18 && !open) {
    open = { instr: best.instr, until: v.date.abs + 75 };
    ride.set(w, open);
  }
  if (best && open && best.instr === open.instr && best.edge <= -0.25) {
    ride.delete(w);
    open = undefined;
  }
  let sum = 0;
  for (const s of book) sum += s.px;
  if (!(sum > 0)) return cmds;
  const parked = v.deposits.reduce((a, d) => a + d.cents, 0);
  const room = Math.max(0, v.netWorth - BUFFER);
  const saved = rounds.get(w) ?? 0;
  const affordable = Math.floor(room / sum);
  const want = Math.max(saved, affordable);
  if (want > saved) rounds.set(w, want);
  const riding = open?.instr;
  const pxRide = riding ? book.find((s) => s.instr === riding)?.px ?? 0 : 0;
  // On top of the market book, not instead of it. A few hundred shares of a name the staff
  // already know about is the greedy trade the statute is written for.
  const overlay = open && pxRide > 0 ? Math.min(700, Math.floor(room * 0.18 / pxRide)) : 0;
  let need = 0;
  for (const s of book) {
    const tgt = s.instr === riding ? want + overlay : want;
    need += Math.max(0, tgt - heldQty(v, s.instr)) * s.px;
  }
  let left = spendable(v);
  const take = Math.min(parked, Math.max(0, need - left));
  if (take >= 50_000) {
    cmds.push({ kind: 'cash', op: 'withdraw', cents: take });
    left += take;
  }
  for (const s of v.shares) {
    if (!s.instr.startsWith('eq:')) continue;
    const tgt = s.instr === riding ? want + overlay : want;
    if (s.qty > tgt) cmds.push({ kind: 'order', side: 'sell', instr: s.instr, qty: Math.min(180, s.qty - tgt) });
  }
  if (left < 2_000) return cmds;
  const ranked = book
    .map((s) => {
      const tgt = s.instr === riding ? want + overlay : want;
      return { ...s, gap: Math.max(0, tgt - heldQty(v, s.instr)) };
    })
    .filter((s) => s.gap >= 1)
    .sort((a, b) => (b.instr === riding ? 1 : 0) - (a.instr === riding ? 1 : 0) || b.gap * b.px - a.gap * a.px);
  for (const s of ranked) {
    const qty = Math.min(s.gap, s.instr === riding ? 180 : s.gap, Math.floor(left / s.px));
    if (qty < 1) continue;
    cmds.push({ kind: 'order', side: 'buy', instr: s.instr, qty });
    left -= qty * s.px;
    if (left < 2_000) break;
  }
  return cmds;
}
