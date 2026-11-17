// Borrow against listed shares, buy the names the book actually prices in dollars,
// hold a few futures, short one name, and from time to time buy a call or write a put.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { live, stocks } from './lib.ts';

export const name = 'gambler';

const RESERVE = 150_000;
const opened = new WeakMap<World, number>();
const ruined = new WeakMap<World, boolean>();

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  if (ruined.get(w)) return [];
  const start = opened.get(w) ?? v.netWorth;
  if (!opened.has(w)) opened.set(w, v.netWorth);
  // A wipe is the end of the strategy. Borrowing again on the discharge is how a ruined gambler looked solvent.
  if (start > 0 && v.netWorth < start * 0.15) {
    ruined.set(w, true);
    return [];
  }
  const cmds: Command[] = [];
  const shareVal = v.shares.reduce((a, s) => a + s.qty * s.px, 0);
  cmds.push({ kind: 'cash', op: 'borrow', cents: 100_000_000 });
  const book = stocks(v).slice().sort((a, b) => b.px - a.px);
  const priced = book.filter((s) => s.px >= 100);
  const use = (priced.length ? priced : book).slice(0, 3);
  let left = Math.max(0, v.cash - RESERVE) + (shareVal > 0 ? Math.floor(shareVal * 0.9) : 0);
  if (use.length && left > 5_000) {
    const slice = left / use.length;
    for (const s of use) {
      const qty = Math.min(20_000, Math.floor(slice / s.px));
      if (qty < 1) continue;
      cmds.push({ kind: 'order', side: 'buy', instr: s.instr, qty });
      left -= qty * s.px;
    }
  }
  const open = new Set(v.futures.filter((f) => f.net !== 0).map((f) => f.good));
  for (const good of ['OIL', 'COPPER', 'GRAIN']) {
    if (open.has(good) || open.has(good === 'OIL' ? 'CRUDE_OIL' : good)) continue;
    cmds.push({ kind: 'fut', side: 'long', good, qty: 2, months: 1 });
  }
  if ((v.loans.some((l) => l.kind === 'margin') || shareVal > 20_000) && v.stockLoans.length === 0) {
    const held = new Set(v.shares.map((s) => s.instr));
    const victim = book.find((s) => !held.has(s.instr) && s.px >= 100);
    if (victim) cmds.push({ kind: 'order', side: 'short', instr: victim.instr, qty: 8 });
  }
  const name = use[0]?.instr;
  if (name && v.date.month % 2 === 1 && v.date.day <= 7 && v.cash > 500_000) {
    cmds.push({ kind: 'optbuy', right: 'C', instr: name, qty: 1, months: 2, strike: 0 });
  }
  if (name && v.date.month % 3 === 0 && v.date.day <= 7 && v.cash > 2_000_000) {
    const qty = Math.max(1, Math.min(40, Math.floor(v.cash / (name ? (use[0].px * 15) : 1))));
    cmds.push({ kind: 'write', right: 'P', instr: name, qty, months: 2, strike: 0 });
  }
  return cmds;
}
