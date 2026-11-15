// Maximum leverage: borrow against shares, buy more, hold a few futures, and short one name.
// Listed options have no player command, so this bot cannot buy a call or a put.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { live, spendable, stocks } from './lib.ts';

export const name = 'gambler';
export const missing = 'option: there is no command to buy or write a call or a put';

const NAMES = ['eq:frm_deepwell', 'eq:frm_quanta', 'eq:frm_silicrest', 'eq:frm_ampere'];

export function bot(v: PlayerView, _w: World): Command[] {
  if (!live(v)) return [];
  const book = stocks(v);
  const px = new Map(book.map((s) => [s.instr, s.px]));
  const cmds: Command[] = [];
  const shareVal = v.shares.reduce((a, s) => a + s.qty * s.px, 0);
  const owed = v.loans.reduce((a, l) => a + l.owed, 0);
  if (shareVal > 20_000 && owed < shareVal * 0.45) {
    cmds.push({ kind: 'cash', op: 'borrow', cents: Math.max(1, Math.floor(shareVal * 0.5)) });
  }
  let left = spendable(v) + (shareVal > 20_000 && owed < shareVal * 0.45 ? Math.floor(shareVal * 0.5) : 0);
  const picks = NAMES.filter((id) => px.has(id));
  const use = picks.length ? picks : book.slice(0, 3).map((s) => s.instr);
  if (use.length && left > 5_000) {
    const slice = left / use.length;
    for (const instr of use) {
      const p = px.get(instr);
      if (!p) continue;
      const qty = Math.floor(slice / p);
      if (qty < 1) continue;
      cmds.push({ kind: 'order', side: 'buy', instr, qty });
      left -= qty * p;
    }
  }
  const open = new Set(v.futures.filter((f) => f.net !== 0).map((f) => f.good));
  for (const good of ['OIL', 'COPPER', 'GRAIN']) {
    if (open.has(good) || open.has(good === 'OIL' ? 'CRUDE_OIL' : good)) continue;
    cmds.push({ kind: 'fut', side: 'long', good, qty: 2, months: 1 });
  }
  if ((v.loans.some((l) => l.kind === 'margin') || shareVal > 20_000) && v.stockLoans.length === 0) {
    const held = new Set(v.shares.map((s) => s.instr));
    const victim = book.find((s) => !held.has(s.instr) && !use.includes(s.instr));
    if (victim) cmds.push({ kind: 'order', side: 'short', instr: victim.instr, qty: 8 });
  }
  return cmds;
}
