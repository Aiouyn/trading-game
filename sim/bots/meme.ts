// Launch a memecoin, buy more of it from the pool, and sell a slice when the holding is large.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { live, spendable } from './lib.ts';

export const name = 'meme';

const MAJORS = new Set(['coin:ledger', 'coin:north', 'coin:halo']);

export function bot(v: PlayerView, _w: World): Command[] {
  if (!live(v)) return [];
  const cmds: Command[] = [];
  const mine = v.coins.filter((c) => !MAJORS.has(c.id));
  // A launch needs spare cash in the current account. The rest goes to the bank so it is not spent down.
  const keep = 3_000_000;
  if (!mine.length && v.cash > keep) cmds.push({ kind: 'cash', op: 'deposit', cents: v.cash - keep });
  if (!mine.length && v.date.abs >= 90) cmds.push({ kind: 'launch' });
  const cash = Math.min(spendable(v), keep - 800_000);
  for (const c of mine) {
    if (c.px > 0 && cash > 5_000) cmds.push({ kind: 'coin', side: 'buy', coin: c.id, qty: Math.floor(cash * 0.2) });
    if (c.qty >= 40 && v.date.abs % 28 < 7) {
      cmds.push({ kind: 'coin', side: 'sell', coin: c.id, qty: Math.max(1, Math.floor(c.qty * 0.25)) });
    }
  }
  return cmds;
}
