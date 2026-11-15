// Equal face across the bills and bonds on the run. Matured cash is rolled into whichever tenor is lightest.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { bondQuotes, live, spendable } from './lib.ts';

export const name = 'bond';

const TENORS = ['3m', '2y', '10y', '30y'];

export function bot(v: PlayerView, _w: World): Command[] {
  if (!live(v)) return [];
  const quotes = bondQuotes(v);
  if (!quotes.length) return [];
  const cmds: Command[] = [];
  for (const o of v.orders) if (o.book === 'bonds') cmds.push({ kind: 'cancel', orderId: o.id });
  const face = new Map<string, number>();
  for (const t of TENORS) face.set(t, 0);
  for (const b of v.bonds) {
    const m = /^bond:([^:]+):/.exec(b.instr);
    if (!m) continue;
    face.set(m[1], (face.get(m[1]) ?? 0) + b.face);
  }
  const budget = spendable(v);
  const invested = TENORS.reduce((a, t) => a + (face.get(t) ?? 0), 0);
  const target = (budget + invested) / TENORS.length;
  for (const t of TENORS) {
    const q = quotes.find((x) => x.tenor === t);
    if (!q) continue;
    const n = Math.floor((target - (face.get(t) ?? 0)) / q.px);
    if (n < 1) continue;
    cmds.push({ kind: 'bond', side: 'buy', tenor: t, bonds: n, limit: Math.ceil(q.px * 1.02) });
  }
  return cmds;
}
