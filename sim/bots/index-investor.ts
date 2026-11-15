// Buy the opening capitalisation-weighted basket and hold it. Every firm is born with the same
// number of shares, so the same share count of each name is the market. New cash buys that book
// again, not whichever name has lagged.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { BUFFER, heldQty, live, spendable, stocks } from './lib.ts';

export const name = 'index';

const rounds = new WeakMap<World, number>();

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  const book = stocks(v);
  if (!book.length) return [];
  let sum = 0;
  for (const s of book) sum += s.px;
  if (!(sum > 0)) return [];
  const haveRounds = rounds.get(w) ?? 0;
  const affordable = Math.floor(Math.max(0, v.netWorth - BUFFER) / sum);
  const want = Math.max(haveRounds, affordable);
  if (want > haveRounds) rounds.set(w, want);
  const cmds: Command[] = [];
  const parked = v.deposits.reduce((a, d) => a + d.cents, 0);
  let left = spendable(v);
  let need = 0;
  for (const s of book) need += Math.max(0, want - heldQty(v, s.instr)) * s.px;
  const take = Math.min(parked, Math.max(0, need - left));
  if (take >= 50_000) {
    cmds.push({ kind: 'cash', op: 'withdraw', cents: take });
    left += take;
  }
  if (left < 2_000 || need < 2_000) return cmds;
  const ranked = book
    .map((s) => ({ ...s, gap: Math.max(0, want - heldQty(v, s.instr)) }))
    .filter((s) => s.gap >= 1)
    .sort((a, b) => b.gap * b.px - a.gap * a.px);
  for (const s of ranked) {
    const qty = Math.min(s.gap, Math.floor(left / s.px));
    if (qty < 1) continue;
    cmds.push({ kind: 'order', side: 'buy', instr: s.instr, qty });
    left -= qty * s.px;
    if (left < 2_000) break;
  }
  return cmds;
}
