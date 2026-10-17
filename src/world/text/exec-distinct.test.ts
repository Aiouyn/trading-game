import { describe, expect, it } from 'vitest';
import { VARIANTS, distinctVkey, executivesMsg, variantOf } from './roles';

// R-10-7 (wire): no CEO quote is reused across two firms in a week. A firm whose variant is taken moves to the next free one.

/** An id that picks the same variant as `base` (a hash collision, found by search). */
function collidingId(base: string): string {
  for (let i = 0; i < 10_000; i++) {
    const id = `x${i}:ceo`;
    if (id !== base && variantOf(id) === variantOf(base)) return id;
  }
  throw new Error('no colliding id');
}

describe('CEO quotes are not reused across firms in a week (R-10-7)', () => {
  it('two firms whose quotes collide get different quotes once the first is on the wire', () => {
    const a = executivesMsg({ id: 't1:A:ceo', name: 'Nordhaven Homes', surprise: 0.5 });
    const b = executivesMsg({ id: collidingId('t1:A:ceo'), name: 'Sundara Rural Bank', surprise: 0.5, avoid: [a.key] });
    expect(a.key).toMatch(/^txt\.exec\.good\.\d$/);
    expect(b.key).toMatch(/^txt\.exec\.good\.\d$/);
    expect(b.key).not.toBe(a.key);
  });

  it('with no earlier quote in the window, the firm keeps its own variant (stable and unchanged)', () => {
    const own = `txt.exec.bad.${variantOf('t2:C:ceo')}`;
    expect(executivesMsg({ id: 't2:C:ceo', name: 'C', surprise: -0.5 }).key).toBe(own);
    expect(distinctVkey('txt.exec.bad', 't2:C:ceo', [])).toBe(own);
  });

  it('a window with every variant taken falls back to the firm\u2019s own variant', () => {
    const all = Array.from({ length: VARIANTS }, (_, i) => `txt.exec.flat.${i}`);
    expect(distinctVkey('txt.exec.flat', 't3:D:ceo', all)).toBe(`txt.exec.flat.${variantOf('t3:D:ceo')}`);
  });
  it('when every quote of the tone is already out that week, the print carries the neutral line, not a repeat', () => {
    const all = Array.from({ length: VARIANTS }, (_, i) => `txt.exec.bad.${i}`);
    expect(executivesMsg({ id: 't4:E:ceo', name: 'E', surprise: -0.5, avoid: all })).toEqual({ key: 'txt.exec.none', vars: {} });
    expect(executivesMsg({ id: 't4:E:ceo', name: 'E', surprise: -0.5, avoid: all.slice(1) }).key).toBe('txt.exec.bad.0');
  });
});
