// Hold the listed names that rose the most over the last month. Sell the ones that fell out of that set.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { heldQty, live, spendable, stocks } from './lib.ts';

export const name = 'momentum';

const hist = new WeakMap<World, Map<string, number[]>>();

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  let book = hist.get(w);
  if (!book) { book = new Map(); hist.set(w, book); }
  const now = stocks(v);
  for (const s of now) {
    const row = book.get(s.instr) ?? [];
    row.push(s.px);
    if (row.length > 8) row.shift();
    book.set(s.instr, row);
  }
  const scored: { instr: string; px: number; ret: number }[] = [];
  for (const s of now) {
    const row = book.get(s.instr) ?? [];
    if (row.length < 2) continue;
    const then = row[Math.max(0, row.length - 4)];
    if (then > 0) scored.push({ instr: s.instr, px: s.px, ret: s.px / then - 1 });
  }
  scored.sort((a, b) => b.ret - a.ret);
  const picks = scored.filter((s) => s.ret > 0).slice(0, 5);
  const want = new Set(picks.map((s) => s.instr));
  const cmds: Command[] = [];
  const parked = v.deposits.reduce((a, d) => a + d.cents, 0);
  for (const s of v.shares) {
    if (want.has(s.instr)) continue;
    if (s.qty > 0) cmds.push({ kind: 'order', side: 'sell', instr: s.instr, qty: s.qty });
  }
  if (!picks.length) {
    const excess = v.cash - 800_000;
    if (excess >= 50_000) cmds.push({ kind: 'cash', op: 'deposit', cents: excess });
    return cmds;
  }
  if (parked > 0) cmds.push({ kind: 'cash', op: 'withdraw', cents: parked });
  let left = spendable(v) + parked;
  const slice = left / picks.length;
  for (const s of picks) {
    const have = heldQty(v, s.instr) * s.px;
    const gap = slice - have;
    const qty = Math.min(Math.floor(gap / s.px), Math.floor(left / s.px));
    if (qty < 1) continue;
    cmds.push({ kind: 'order', side: 'buy', instr: s.instr, qty });
    left -= qty * s.px;
  }
  return cmds;
}
