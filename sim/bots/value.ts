// Cheap stocks: price against the earnings per share printed in the news. Remember a figure after it scrolls off the screen.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { heldQty, live, spendable, stockForName, stocks } from './lib.ts';

export const name = 'value';

const EPS = /^(.+?) Q\d:.*EPS \$([0-9]+(?:\.[0-9]+)?)/;
const learned = new WeakMap<World, Map<string, number>>();

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  let eps = learned.get(w);
  if (!eps) { eps = new Map(); learned.set(w, eps); }
  for (const n of v.news) {
    const m = EPS.exec(n.text);
    if (!m) continue;
    const cents = Math.round(Number(m[2]) * 100);
    if (!(cents > 0)) continue;
    const instr = stockForName(v, m[1]);
    if (instr) eps.set(instr, cents);
  }
  const px = new Map(stocks(v).map((s) => [s.instr, s.px]));
  const rows: { instr: string; px: number; pe: number }[] = [];
  for (const [instr, e] of eps) {
    const p = px.get(instr);
    if (!p || e <= 0) continue;
    rows.push({ instr, px: p, pe: p / e });
  }
  rows.sort((a, b) => a.pe - b.pe);
  if (!rows.length) {
    const excess = v.cash - 800_000;
    if (excess >= 50_000) return [{ kind: 'cash', op: 'deposit', cents: excess }];
    return [];
  }
  const cheap = rows.slice(0, 6);
  const rich = new Set(rows.slice(Math.max(cheap.length, Math.floor(rows.length * 0.7))).map((r) => r.instr));
  const want = new Set(cheap.map((r) => r.instr));
  const cmds: Command[] = [];
  for (const s of v.shares) {
    if (want.has(s.instr) && !rich.has(s.instr)) continue;
    if (s.qty > 0) cmds.push({ kind: 'order', side: 'sell', instr: s.instr, qty: s.qty });
  }
  const parked = v.deposits.reduce((a, d) => a + d.cents, 0);
  if (parked > 0) cmds.push({ kind: 'cash', op: 'withdraw', cents: parked });
  let left = spendable(v) + parked;
  const slice = left / cheap.length;
  for (const s of cheap) {
    const gap = slice - heldQty(v, s.instr) * s.px;
    const qty = Math.min(Math.floor(gap / s.px), Math.floor(left / s.px));
    if (qty < 1) continue;
    cmds.push({ kind: 'order', side: 'buy', instr: s.instr, qty });
    left -= qty * s.px;
  }
  return cmds;
}
