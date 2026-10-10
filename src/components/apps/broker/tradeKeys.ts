import type { OrderType, Side } from '@/engine';
import { QUICK_ENTER } from '@/content/learning';

/**
 * Keyboard trading for the Broker ticket (M10, Phase 3 section 3). Pure: a key code and whether focus is in a text field
 * in, a ticket intent out. Keys bind on event.code, so AZERTY works the same. Nothing here sends an order: Enter asks for
 * the confirm line, and a second Enter (or a single Enter under the quick-Enter setting) sends it.
 */

export type TradeKey =
  | { kind: 'side'; side: Side }
  | { kind: 'type'; type: OrderType }
  | { kind: 'ticker' }
  | { kind: 'enter' }
  | { kind: 'cancel' };

/** Digits 1 to 4 pick the order type, in this order. */
export const KEY_ORDER_TYPES: readonly OrderType[] = ['market', 'limit', 'stop', 'stop_limit'];

/**
 * The intent for a key. `typing` is true when focus is in a text field: there only Enter and Escape mean anything, so a
 * typed B, S, digit or slash goes into the field and nothing else happens.
 */
export function tradeKeyIntent(code: string, typing: boolean): TradeKey | null {
  if (code === 'Enter' || code === 'NumpadEnter') return { kind: 'enter' };
  if (code === 'Escape') return { kind: 'cancel' };
  if (typing) return null;
  if (code === 'KeyB') return { kind: 'side', side: 'buy' };
  if (code === 'KeyS') return { kind: 'side', side: 'sell' };
  if (code === 'Slash') return { kind: 'ticker' };
  const digit = /^(?:Digit|Numpad)([1-4])$/.exec(code);
  if (digit) return { kind: 'type', type: KEY_ORDER_TYPES[Number(digit[1]) - 1]! };
  return null;
}

/** With the quick-Enter setting on, one Enter sends an order whose cost is under the share of cash in QUICK_ENTER. */
export function quickEnterAllowed(cost: number, cash: number): boolean {
  return cash > 0 && cost > 0 && cost < cash * QUICK_ENTER.maxCashFraction;
}
