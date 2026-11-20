// Every fill speaks. The desk sees each change of a position (basis.ts) and tells the player what filled: the side, the
// quantity, the price, how far it came from the price it was measured against, and, when a position closed, the profit
// or loss it realised. Orders that came off with their position, or that fired and could not fill, are told the same way.
import type { World } from '../../kernel/index.ts';
import { notify } from '../circle/notices.ts';
import type { EconState } from '../economy/index.ts';
import type { FillNote } from './basis.ts';
import type { DeskNote } from './trading.ts';

const econ = (w: World): EconState => w.state.economy as EconState;

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return sign + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Kind { name: string; unit: 'share' | 'coin' | 'contract' | 'unit'; price: (v: number) => string; scale: number }

/** What a position key is, in words, and how its price and its profit read. */
function kindOf(w: World, key: string): Kind {
  if (key.startsWith('eq:')) {
    const id = key.slice(3);
    const f = econ(w).firms.find((x) => x.id === id);
    return { name: f?.name ?? (id === 'bank_1' ? 'the bank' : id.replace(/^frm_/, '')), unit: 'share', price: money, scale: 1 };
  }
  if (key.startsWith('fut:')) {
    const [, good, month] = key.split(':');
    const book = (w.state.commodities as { books?: { good: string; lot: number }[] } | undefined)?.books?.find((b) => b.good === good);
    const ahead = Number(month) - w.month;
    return { name: `${good} ${ahead > 0 ? `+${ahead}m` : 'front month'}`, unit: 'contract', price: money, scale: book?.lot ?? 1 };
  }
  if (key.startsWith('fx:')) return { name: key.slice(3), unit: 'unit', price: (v) => v.toFixed(4), scale: 100 };
  const cx = w.state.crypto as { majors?: { id: string; name: string }[]; memes?: { id: string; name: string }[] } | undefined;
  const c = [...(cx?.majors ?? []), ...(cx?.memes ?? [])].find((m) => m.id === key);
  return { name: c?.name ?? key.replace(/^coin:(me:)?/, ''), unit: 'coin', price: (v) => (v < 100 ? '$' + (v / 100).toFixed(6) : money(v)), scale: 1 };
}

const plural = (n: number, unit: string): string => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}${Math.abs(n) === 1 ? '' : 's'}`;

/** One fill in words: a title that says what happened at what price, and a line that says how and where it leaves you. */
export function fillWords(w: World, n: FillNote): { title: string; text: string } {
  const k = kindOf(w, n.key);
  const closing = (n.side === 'buy' && n.was < 0) || (n.side === 'sell' && n.was > 0);
  const opening = (n.side === 'buy' && n.now > 0) || (n.side === 'sell' && n.now < 0);
  const short = k.unit === 'share' || k.unit === 'contract';
  const verb = n.side === 'buy'
    ? (closing ? (n.now > 0 ? 'Covered and bought' : 'Covered') : 'Bought')
    : (closing ? (n.now < 0 ? 'Sold and shorted' : 'Sold') : short ? 'Shorted' : 'Sold');
  const pnl = Math.round(n.gain * k.scale);
  const realised = closing && Math.abs(pnl) >= 1 ? `: ${pnl >= 0 ? '+' : '-'}${money(Math.abs(pnl))} realised` : closing ? ': flat on the trade' : '';
  const title = `${verb} ${plural(n.qty, k.unit)} of ${k.name} at ${k.price(n.px)}${realised}`;
  const bits: string[] = [];
  if (n.why) bits.push(n.why);
  else if (n.how === 'margin') bits.push('The bank sold these to meet your margin call.');
  else if (n.how === 'limit') bits.push(`Your limit order at ${k.price(n.ref ?? n.px)} filled.`);
  else if (n.how === 'market') bits.push('A market order.');
  if (n.ref && n.ref > 0 && k.unit !== 'unit') {
    const diff = n.px - n.ref;
    const per = Math.abs(diff);
    const against = n.how === 'stop' ? 'stop' : n.how === 'limit' || n.how === 'target' ? 'limit' : n.how === 'open' ? 'last price before the open' : 'mid';
    if (per >= 0.5) {
      const worse = n.side === 'buy' ? diff > 0 : diff < 0;
      bits.push(`Slippage: ${k.price(per)} a ${k.unit} ${worse ? 'worse' : 'better'} than the ${k.price(n.ref)} ${against}.`);
    } else bits.push(`Filled at the ${against}, no slippage.`);
  }
  const left = Math.abs(n.now);
  bits.push(n.now === 0 ? 'You are now flat.' : n.now < 0 ? `You are now short ${plural(left, k.unit)}.` : `You now hold ${plural(left, k.unit)}.`);
  if (opening && !closing && short && n.now < 0) bits.push('Buy it back to cover.');
  return { title, text: bits.join(' ') };
}

/** Tell the player every fill and every desk note. Each becomes a notice in the bell, with its own event. */
export function speak(w: World, cause: number, fills: FillNote[], desk: DeskNote[] = []): void {
  for (const n of fills) {
    const { title, text } = fillWords(w, n);
    if (!notify(w, { kind: 'fill', title, text, cause })) w.events.emit('player.fill', `${title}. ${text}`, [cause]);
  }
  for (const d of desk) if (!notify(w, { kind: 'order', title: d.title, text: d.text, cause: d.cause })) w.events.emit('player.order', `${d.title}. ${d.text}`, [d.cause]);
}
