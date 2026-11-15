// Buy a few homes, let the vacant ones, and sell a spare once the book is full.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { live, spendable } from './lib.ts';

export const name = 'landlord';

export function bot(v: PlayerView, _w: World): Command[] {
  if (!live(v)) return [];
  const homes = v.homes ?? [];
  const mine = homes.filter((h) => h.mine);
  const cmds: Command[] = [];
  for (const h of mine) {
    if (!h.vacant || h.live) continue;
    const rent = Math.max(h.rent, Math.round(h.price * 0.004), 1);
    cmds.push({ kind: 'let', id: h.id, cents: rent });
  }
  const spare = mine.filter((h) => !h.live);
  if (mine.length > 4 && spare.length) cmds.push({ kind: 'homesell', id: spare[spare.length - 1].id });
  else if (mine.length < 3 && spendable(v) > 0) {
    let cheap = -1, price = Infinity;
    for (const h of homes) {
      if (h.mine || h.price < 1) continue;
      if (h.price < price) { price = h.price; cheap = h.id; }
    }
    if (cheap >= 0) cmds.push({ kind: 'homebid', id: cheap, cents: 0 });
  }
  return cmds;
}
