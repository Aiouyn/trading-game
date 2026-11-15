// Buy and hold an equal spread of every listed stock. New cash, including dividends, buys whatever is underweight.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { BUFFER, live, spendable, stocks } from './lib.ts';

export const name = 'index';

export function bot(v: PlayerView, _w: World): Command[] {
  if (!live(v)) return [];
  const book = stocks(v);
  if (!book.length) return [];
  const cash = spendable(v);
  if (cash < 2_000) return [];
  const held = new Map<string, number>();
  for (const s of v.shares) held.set(s.instr, s.qty * s.px);
  const target = Math.max(0, v.netWorth - BUFFER) / book.length;
  const ranked = book
    .map((s) => ({ ...s, gap: target - (held.get(s.instr) ?? 0) }))
    .filter((s) => s.gap > s.px)
    .sort((a, b) => b.gap - a.gap);
  const cmds: Command[] = [];
  let left = cash;
  for (const s of ranked) {
    const qty = Math.min(Math.floor(s.gap / s.px), Math.floor(left / s.px));
    if (qty < 1) continue;
    cmds.push({ kind: 'order', side: 'buy', instr: s.instr, qty });
    left -= qty * s.px;
    if (left < 2_000) break;
  }
  return cmds;
}
