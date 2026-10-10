import { describe, expect, it } from 'vitest';
import { APP_IDS } from './apps';
import { formatRoute, parseRoute, type ShellRoute } from './route';

const canonical = [
  '/',
  '/broker',
  '/broker/HLCN',
  '/broker/BRNT',
  '/portfolio',
  '/portfolio/journal',
  '/portfolio/analyst',
  '/wire',
  '/messages',
  '/calendar',
  '/businesses',
  '/company',
  '/boutique',
  '/lab',
  '/security',
  '/legal',
  '/bank',
  '/research/abc-123_x',
  '/exchange',
  '/launchpad',
  '/learn',
  '/settings',
  '/settings/about',
];

describe('route round trip', () => {
  it('formats every canonical path back to itself', () => {
    for (const path of canonical) {
      const r = parseRoute(path);
      expect(r, path).not.toHaveProperty('notFound');
      expect(r, path).not.toHaveProperty('redirect');
      expect(formatRoute(r as ShellRoute), path).toBe(path);
    }
  });

  it('round-trips every app id as its own path (research needs its file, see below)', () => {
    for (const id of APP_IDS) {
      if (id === 'research') continue;
      const r = parseRoute(`/${id}`);
      expect(r, id).toMatchObject({ app: id });
      expect(formatRoute(r as ShellRoute)).toBe(`/${id}`);
    }
  });

  it('round-trips the flags in their fixed order', () => {
    const path = '/wire?world=alpha&e2e&seed=42&fresh&intro=off';
    const r = parseRoute(path);
    expect(formatRoute(r as ShellRoute)).toBe(path);
    expect(parseRoute('/?e2e&seed=7&intro=off')).toMatchObject({
      app: null,
      flags: { e2e: true, seed: '7', intro: 'off' },
    });
  });

  it('keeps the flags on the desktop and on every app', () => {
    for (const path of ['/', '/broker/HLCN', '/research/f1', '/settings/about']) {
      const r = parseRoute(`${path}?e2e&seed=1&intro=off`);
      expect(formatRoute(r as ShellRoute), path).toBe(`${path}?e2e&seed=1&intro=off`);
    }
  });
});

describe('route parsing', () => {
  it('reads a ticker and a file id from the path and upper-cases the ticker', () => {
    expect(parseRoute('/broker/hlcn')).toMatchObject({ app: 'broker', props: { ticker: 'HLCN' } });
    expect(parseRoute('/research/f-9')).toMatchObject({ app: 'research', props: { fileId: 'f-9' } });
    expect(formatRoute(parseRoute('/broker/hlcn') as ShellRoute)).toBe('/broker/HLCN');
  });

  it('reads the portfolio and settings views', () => {
    expect(parseRoute('/portfolio/journal')).toMatchObject({ app: 'portfolio', view: 'journal' });
    expect(parseRoute('/settings/about')).toMatchObject({ app: 'settings', view: 'about' });
  });

  it('returns notFound for an unknown app, a bad view, a bad ticker or extra segments', () => {
    for (const bad of ['/nope', '/portfolio/bogus', '/settings/nope', '/broker/bad%20x', '/broker/HLCN/extra', '/wire/x', '/ailab']) {
      expect(parseRoute(bad), bad).toEqual({ notFound: true });
    }
  });

  it('returns notFound for a malformed percent-encoding', () => {
    expect(parseRoute('/research/%E0%A4%A')).toEqual({ notFound: true });
  });

  it('redirects the legacy /credits to /settings/about', () => {
    expect(parseRoute('/credits')).toEqual({ redirect: '/settings/about' });
  });

  it('reads the legacy ?t and ?file aliases and writes the path, keeping the alias while it agrees', () => {
    const b = parseRoute('/broker?t=hlcn');
    expect(b).toMatchObject({ app: 'broker', props: { ticker: 'HLCN' } });
    expect(formatRoute(b as ShellRoute)).toBe('/broker/HLCN?t=HLCN');
    const r = parseRoute('/research?file=abc');
    expect(r).toMatchObject({ app: 'research', props: { fileId: 'abc' } });
    expect(formatRoute(r as ShellRoute)).toBe('/research/abc?file=abc');
  });

  it('prefers the path over a disagreeing alias, and drops the stale alias on output', () => {
    const r = parseRoute('/broker/BRNT?t=HLCN');
    expect(r).toMatchObject({ props: { ticker: 'BRNT' } });
    expect(formatRoute(r as ShellRoute)).toBe('/broker/BRNT');
    const moved = { ...(parseRoute('/broker/HLCN?t=HLCN') as ShellRoute), props: { ticker: 'AAA' } };
    expect(formatRoute(moved)).toBe('/broker/AAA');
  });

  it('keeps ?t and ?file alongside the flags, flags first', () => {
    const r = parseRoute('/broker/HLCN?t=HLCN&e2e&seed=3');
    expect(formatRoute(r as ShellRoute)).toBe('/broker/HLCN?e2e&seed=3&t=HLCN');
  });

  it('treats a research route without a file as notFound, the same for every unknown file (P2-116)', () => {
    expect(parseRoute('/research')).toEqual({ notFound: true });
    expect(parseRoute('/research?e2e')).toEqual({ notFound: true });
    expect(parseRoute('/research?file=bad%20id')).toEqual({ notFound: true });
  });

  it('ignores extra params, so a link cannot carry quantity, price or side', () => {
    const r = parseRoute('/broker/HLCN?qty=5&price=99&side=buy&player=p1&e2e');
    expect(r).toMatchObject({ app: 'broker', props: { ticker: 'HLCN' }, flags: { e2e: true } });
    expect(formatRoute(r as ShellRoute)).toBe('/broker/HLCN?e2e');
  });

  it('parses a path with no leading slash and a trailing slash the same way', () => {
    expect(parseRoute('wire/')).toMatchObject({ app: 'wire' });
    expect(formatRoute(parseRoute('/broker/') as ShellRoute)).toBe('/broker');
  });

  it('drops oversized flag values', () => {
    const r = parseRoute(`/?seed=${'x'.repeat(200)}`);
    expect(r).toMatchObject({ flags: {} });
  });
});
