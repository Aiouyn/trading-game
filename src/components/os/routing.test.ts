import { describe, expect, it } from 'vitest';
import { makeWmCtx } from '@/shell/ctx';
import { type ShellState, initialShell, reduce } from '@/shell/wm';
import { parseLocation, routeUrl } from './routing';

const vp = { w: 1440, h: 900 };
const ctx = makeWmCtx('R3');

function empty(): ShellState {
  return { ...initialShell(vp, ctx, 'HLCN'), wins: [] };
}

function opened(app: 'broker' | 'portfolio' | 'settings', props: Record<string, unknown>, base: ShellState = empty()): ShellState {
  const r = reduce(base, { type: 'open', app, props }, ctx);
  if (!r.ok) throw new Error(`open refused: ${r.reason}`);
  return r.state;
}

describe('desktop URL sync', () => {
  it('shows the bare desktop with the query flags kept', () => {
    const { base } = parseLocation('/', '?e2e&seed=7');
    expect(routeUrl(empty(), base)).toBe('/?e2e&seed=7');
  });

  it('names the focused Broker by its ticker', () => {
    const { base } = parseLocation('/', '?e2e&seed=7');
    expect(routeUrl(opened('broker', { ticker: 'HLCN' }), base)).toBe('/broker/HLCN?e2e&seed=7');
  });

  it('keeps a view on the path', () => {
    const { base } = parseLocation('/', '');
    expect(routeUrl(opened('portfolio', { view: 'journal' }), base)).toBe('/portfolio/journal');
  });

  it('keeps the ?t alias only while it agrees with the window ticker', () => {
    const agree = parseLocation('/broker/HLCN', '?t=HLCN');
    expect(routeUrl(opened('broker', { ticker: 'HLCN' }), agree.base)).toBe('/broker/HLCN?t=HLCN');
    const clash = parseLocation('/broker/HLCN', '?t=ABC');
    expect(routeUrl(opened('broker', { ticker: 'HLCN' }), clash.base)).toBe('/broker/HLCN');
  });
});

describe('deep link parsing', () => {
  it('reports an unknown path as not found and still keeps the flags', () => {
    const { route, base } = parseLocation('/nope', '?e2e');
    expect('notFound' in route).toBe(true);
    expect(base.flags.e2e).toBe(true);
  });

  it('redirects the old credits path to the About view', () => {
    const { route } = parseLocation('/credits', '');
    expect(route).toEqual({ redirect: '/settings/about' });
  });

  it('reads a settings view from the path', () => {
    const { route } = parseLocation('/settings/about', '');
    expect('app' in route && route.app === 'settings' && route.view === 'about').toBe(true);
  });
});
