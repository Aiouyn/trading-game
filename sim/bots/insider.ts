// Talk to contacts, ask them about a firm, and trade every private fact that comes back.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { heldQty, live, spendable, stockForName, stocks } from './lib.ts';

export const name = 'insider';

const traded = new WeakMap<World, Set<number>>();

export function bot(v: PlayerView, w: World): Command[] {
  if (!live(v)) return [];
  let seen = traded.get(w);
  if (!seen) { seen = new Set(); traded.set(w, seen); }
  const cmds: Command[] = [];
  const parked = v.deposits.reduce((a, d) => a + d.cents, 0);
  const book = stocks(v);
  const ticker = book.length ? book[Math.floor(v.date.abs / 7) % book.length].instr : '';
  const extra = ticker.startsWith('eq:') ? ticker.slice(3) : ticker;
  for (const c of v.contacts) {
    cmds.push({ kind: 'talk', slot: c.slot });
    if (v.firm) cmds.push({ kind: 'ask', slot: c.slot, firm: v.firm });
    if (extra && extra !== v.firm) cmds.push({ kind: 'ask', slot: c.slot, firm: extra });
  }
  const shareVal = v.shares.reduce((a, s) => a + s.qty * s.px, 0);
  let armed = v.loans.some((l) => l.kind === 'margin') || v.stockLoans.length > 0;
  for (const p of v.private) {
    if (seen.has(p.eventId)) continue;
    seen.add(p.eventId);
    const instr = stockForName(v, p.text);
    if (!instr) continue;
    const down = /loss|-\$/i.test(p.text);
    const have = heldQty(v, instr);
    if (down) {
      if (have > 0) cmds.push({ kind: 'order', side: 'sell', instr, qty: have });
      else {
        if (!armed && shareVal > 20_000) {
          cmds.push({ kind: 'cash', op: 'borrow', cents: Math.max(1, Math.floor(shareVal * 0.1)) });
          armed = true;
        }
        if (armed) cmds.push({ kind: 'order', side: 'short', instr, qty: 6 });
      }
    } else {
      const px = book.find((s) => s.instr === instr)?.px ?? 0;
      const qty = px > 0 ? Math.max(1, Math.floor((spendable(v) + parked) * 0.25 / px)) : 0;
      if (qty >= 1) cmds.push({ kind: 'order', side: 'buy', instr, qty });
    }
  }
  const tradedNow = cmds.some((c) => c.kind === 'order');
  if (tradedNow && parked > 0) cmds.unshift({ kind: 'cash', op: 'withdraw', cents: parked });
  if (!tradedNow) {
    const excess = v.cash - 2_000_000;
    if (excess >= 50_000) cmds.push({ kind: 'cash', op: 'deposit', cents: excess });
  }
  return cmds;
}
