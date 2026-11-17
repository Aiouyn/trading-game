// Buy homes cash can cover, let them at the market rent, and park rent that cannot buy another home.
// One seed borrows against a single home and leaves the cash: that is the wipe.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { bondQuotes, live, spendable, unit } from './lib.ts';

export const name = 'landlord';

const drew = new WeakMap<World, boolean>();

function bold(w: World): boolean {
  return unit(w.seed, 0, 86) >= 0.84;
}

function cheapest(v: PlayerView): { id: number; price: number } | undefined {
  let id = -1, price = Infinity;
  for (const h of v.homes ?? []) {
    if (h.mine || h.price < 1) continue;
    if (h.price < price) { price = h.price; id = h.id; }
  }
  return id >= 0 ? { id, price } : undefined;
}

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  const mine = (v.homes ?? []).filter((h) => h.mine);
  const cmds: Command[] = [];
  for (const h of mine) {
    if (!h.vacant || h.live) continue;
    const rent = h.rent > 0 ? h.rent : Math.max(1, Math.round(h.price * 0.003));
    cmds.push({ kind: 'let', id: h.id, cents: rent });
  }
  const cash = spendable(v);
  if (bold(w)) {
    const home = cheapest(v);
    if (mine.length < 1 && home && cash >= home.price) cmds.push({ kind: 'homebid', id: home.id, cents: home.price });
    if (!drew.get(w) && mine.length && v.date.day <= 21) {
      drew.set(w, true);
      const h = mine[0];
      cmds.push({ kind: 'mortgage', id: h.id, cents: Math.max(1000, Math.round(h.price * 0.9)) });
    }
    return cmds;
  }
  const home = cheapest(v);
  if (home && cash >= home.price) {
    cmds.push({ kind: 'homebid', id: home.id, cents: home.price });
    return cmds;
  }
  for (const o of v.orders) if (o.book === 'bonds') cmds.push({ kind: 'cancel', orderId: o.id });
  const quotes = bondQuotes(v);
  const q = quotes.find((x) => x.tenor === '2y') ?? quotes[0];
  if (q && cash >= q.px) {
    const n = Math.floor(cash / q.px);
    if (n >= 1) cmds.push({ kind: 'bond', side: 'buy', tenor: q.tenor, bonds: n, limit: Math.ceil(q.px * 1.02) });
  }
  return cmds;
}
