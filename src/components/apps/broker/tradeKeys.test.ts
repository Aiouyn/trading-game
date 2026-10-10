import { describe, expect, it } from 'vitest';
import { quickEnterAllowed, tradeKeyIntent } from './tradeKeys';

describe('keyboard trading keys (M10)', () => {
  it('binds B and S to the side, digits 1 to 4 to the order type, and slash to the ticker search', () => {
    expect(tradeKeyIntent('KeyB', false)).toEqual({ kind: 'side', side: 'buy' });
    expect(tradeKeyIntent('KeyS', false)).toEqual({ kind: 'side', side: 'sell' });
    expect(tradeKeyIntent('Digit1', false)).toEqual({ kind: 'type', type: 'market' });
    expect(tradeKeyIntent('Digit2', false)).toEqual({ kind: 'type', type: 'limit' });
    expect(tradeKeyIntent('Digit3', false)).toEqual({ kind: 'type', type: 'stop' });
    expect(tradeKeyIntent('Digit4', false)).toEqual({ kind: 'type', type: 'stop_limit' });
    expect(tradeKeyIntent('Numpad2', false)).toEqual({ kind: 'type', type: 'limit' });
    expect(tradeKeyIntent('Slash', false)).toEqual({ kind: 'ticker' });
  });

  it('leaves digits outside 1 to 4 unbound', () => {
    expect(tradeKeyIntent('Digit5', false)).toBeNull();
    expect(tradeKeyIntent('Digit0', false)).toBeNull();
    expect(tradeKeyIntent('Space', false)).toBeNull();
  });

  it('types into a text field: B, S, digits and slash do nothing there, Enter and Escape still work', () => {
    for (const code of ['KeyB', 'KeyS', 'Digit1', 'Digit4', 'Slash']) expect(tradeKeyIntent(code, true)).toBeNull();
    expect(tradeKeyIntent('Enter', true)).toEqual({ kind: 'enter' });
    expect(tradeKeyIntent('NumpadEnter', true)).toEqual({ kind: 'enter' });
    expect(tradeKeyIntent('Escape', true)).toEqual({ kind: 'cancel' });
  });

  it('quick Enter applies only under a tenth of cash, and never without cash', () => {
    expect(quickEnterAllowed(99, 1000)).toBe(true);
    expect(quickEnterAllowed(100, 1000)).toBe(false);
    expect(quickEnterAllowed(500, 1000)).toBe(false);
    expect(quickEnterAllowed(10, 0)).toBe(false);
    expect(quickEnterAllowed(0, 1000)).toBe(false);
  });
});
