import { describe, expect, it } from 'vitest';
import { PHONE_HOME, PHONE_STACK_MAX, phoneClose, phoneCanOpen, phoneEntry, phoneHome, phonePath, phoneShow } from './phone';
import type { AppId } from './apps';

// Phone stack (P2-135..P2-137, P2-162, P2-163). One entry per app, most recent first, six at most.
describe('phone app stack', () => {
  it('opening an app puts it on top and shows it', () => {
    const s = phoneShow(PHONE_HOME, 'broker', { ticker: 'HLCN' }, 10);
    expect(s.current).toBe('broker');
    expect(s.stack.map((e) => e.app)).toEqual(['broker']);
  });

  it('opening a running app moves it to the top without a second entry', () => {
    let s = phoneShow(PHONE_HOME, 'broker', {}, 1);
    s = phoneShow(s, 'wire', {}, 2);
    s = phoneShow(s, 'broker', { ticker: 'GX' }, 3);
    expect(s.stack.map((e) => e.app)).toEqual(['broker', 'wire']);
    expect(phoneEntry(s, 'broker')?.props.ticker).toBe('GX');
    expect(phoneEntry(s, 'broker')?.tick).toBe(3);
  });

  it('the stack holds six apps and drops the oldest past that', () => {
    const apps: AppId[] = ['broker', 'portfolio', 'wire', 'messages', 'calendar', 'businesses', 'boutique'];
    let s = PHONE_HOME;
    for (const a of apps) s = phoneShow(s, a, {}, 0);
    expect(s.stack).toHaveLength(PHONE_STACK_MAX);
    expect(s.stack.some((e) => e.app === 'broker')).toBe(false);
    expect(s.stack[0]?.app).toBe('boutique');
  });

  it('home clears the visible app and keeps the stack (P2-136)', () => {
    const s = phoneHome(phoneShow(phoneShow(PHONE_HOME, 'broker', {}, 0), 'wire', {}, 0));
    expect(s.current).toBeNull();
    expect(s.stack.map((e) => e.app)).toEqual(['wire', 'broker']);
  });

  it('closing from Recent drops only that entry; closing the visible app shows home (P2-163)', () => {
    const s = phoneShow(phoneShow(PHONE_HOME, 'broker', {}, 0), 'wire', {}, 0);
    const kept = phoneClose(s, 'broker');
    expect(kept.current).toBe('wire');
    expect(kept.stack.map((e) => e.app)).toEqual(['wire']);
    expect(phoneClose(s, 'wire').current).toBeNull();
  });

  it('a locked or unavailable app never opens (P2-023)', () => {
    const unlocked = (a: AppId) => a !== 'security';
    expect(phoneCanOpen('security', unlocked)).toBe('locked');
    expect(phoneCanOpen('launchpad', () => true)).toBe('unavailable');
    expect(phoneCanOpen('wire', unlocked)).toBe('ok');
  });

  it('paths: an app is a single segment, a ticker rides in the query (P2-111, P2-112)', () => {
    expect(phonePath('wire', {})).toBe('/wire');
    expect(phonePath('broker', { ticker: 'HLCN' })).toBe('/broker?t=HLCN');
    expect(phonePath('portfolio', { view: 'journal' })).toBe('/portfolio/journal');
    expect(phonePath('research', { fileId: 'f1' })).toBe('/research?file=f1');
  });
});
