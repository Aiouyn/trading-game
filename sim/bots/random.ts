// Noise baseline. A tagged stream of its own, not the world's, picks a small trade or none.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { bondQuotes, heldQty, live, spendable, stocks, unit } from './lib.ts';

export const name = 'random';

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  const roll = unit(w.seed, v.date.abs, 1);
  const book = stocks(v);
  if (roll < 0.45 && book.length) {
    const s = book[Math.floor(unit(w.seed, v.date.abs, 2) * book.length)];
    const qty = Math.max(1, Math.floor(spendable(v) * (0.02 + 0.06 * unit(w.seed, v.date.abs, 3)) / s.px));
    if (qty >= 1 && spendable(v) >= s.px) return [{ kind: 'order', side: 'buy', instr: s.instr, qty }];
  }
  if (roll < 0.7 && v.shares.length) {
    const s = v.shares[Math.floor(unit(w.seed, v.date.abs, 4) * v.shares.length)];
    const qty = Math.max(1, Math.floor(s.qty * (0.1 + 0.4 * unit(w.seed, v.date.abs, 5))));
    return [{ kind: 'order', side: 'sell', instr: s.instr, qty: Math.min(s.qty, qty) }];
  }
  if (roll < 0.85) {
    const bonds = bondQuotes(v);
    if (bonds.length && spendable(v) > bonds[0].px) {
      const b = bonds[Math.floor(unit(w.seed, v.date.abs, 6) * bonds.length)];
      return [{ kind: 'bond', side: 'buy', tenor: b.tenor, bonds: 1, limit: Math.ceil(b.px * 1.01) }];
    }
  }
  if (roll < 0.93) {
    const coin = v.prices.find((p) => p.instr === 'coin:ledger');
    const qty = coin ? Math.max(1, Math.floor(spendable(v) * 0.02 / coin.px)) : 0;
    if (coin && qty >= 1) return [{ kind: 'coin', side: 'buy', coin: coin.instr, qty }];
    const held = heldQty(v, 'coin:ledger');
    if (held > 1) return [{ kind: 'coin', side: 'sell', coin: 'coin:ledger', qty: Math.ceil(held / 2) }];
  }
  return [];
}
