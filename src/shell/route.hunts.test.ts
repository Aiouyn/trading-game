/**
 * Tape desktop-shell hunt link_carries_no_state (tape-desktop-shell.md section 9b): a link carries the app, the view, the
 * ticker or file alias and the test flags, and nothing else. No quantity, price, side, position, P&L or player id is
 * written by formatRoute, and parseRoute ignores any such field a hand-made link adds (fuzzed, seeded).
 */
import { describe, expect, it } from 'vitest';
import { APP_IDS, type AppId } from './apps';
import { formatRoute, parseRoute, type ShellRoute } from './route';

const ALLOWED_KEYS = new Set(['t', 'file', 'world', 'e2e', 'seed', 'fresh', 'intro']);
const FORBIDDEN = /qty|quantity|price|side|position|pnl|p&l|player|order|cash|equity|networth|nw|holding|trade|style|ghost/i;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function queryKeys(url: string): string[] {
  const q = url.indexOf('?');
  if (q < 0) return [];
  return url
    .slice(q + 1)
    .split('&')
    .filter((x) => x !== '')
    .map((x) => decodeURIComponent(x.split('=')[0] ?? ''));
}

describe('link_carries_no_state (route links hold no holdings, orders or player data)', () => {
  it('every app and view formats to a link whose query keys are only the allowed alias and flags', () => {
    const routes: ShellRoute[] = [];
    for (const app of APP_IDS as readonly AppId[]) {
      routes.push({ app, props: {}, flags: {} });
      routes.push({ app, view: 'journal', props: {}, flags: { seed: 'tape-x', fresh: true, intro: 'off' } });
    }
    routes.push({ app: 'broker', props: { ticker: 'HLCN' }, flags: { e2e: true } }, { app: 'research', props: { fileId: 'f1' }, flags: {} });
    routes.push({ app: null, props: {}, flags: { world: 'ws://localhost:1' } });
    for (const r of routes) {
      const url = formatRoute(r);
      for (const key of queryKeys(url)) {
        expect(ALLOWED_KEYS.has(key), `${url}: key ${key}`).toBe(true);
        expect(FORBIDDEN.test(key), `${url}: key ${key}`).toBe(false);
      }
      expect(FORBIDDEN.test(url.split('?')[0]!), url).toBe(false);
    }
  });

  it('a hand-made link with holdings fields parses to the same screen, with those fields dropped', () => {
    const plain = parseRoute('/broker?t=HLCN');
    const dirty = parseRoute('/broker?t=HLCN&qty=500&price=12.34&side=buy&position=9&pnl=-4&player=p-77');
    expect(dirty).toEqual(plain);
    expect(JSON.stringify(dirty)).not.toMatch(/500|12\.34|"buy"|position|pnl|p-77/);
    expect('props' in (dirty as object)).toBe(true);
    expect((dirty as ShellRoute).props).toEqual({ ticker: 'HLCN' });
  });

  it('seeded fuzz: 500 links with random extra fields never throw, and the output carries none of them', () => {
    const rnd = rng(0x51e11);
    const names = ['qty', 'price', 'side', 'position', 'pnl', 'player', 'order', 'cash', 'nw', 'style', 'ghost', 'holding'];
    const apps = APP_IDS as readonly string[];
    for (let n = 0; n < 500; n++) {
      const app = apps[Math.floor(rnd() * apps.length)]!;
      let url = `/${app}`;
      const extras: string[] = [];
      const count = 1 + Math.floor(rnd() * 4);
      for (let j = 0; j < count; j++) {
        const name = names[Math.floor(rnd() * names.length)]!;
        const value = String(Math.floor(rnd() * 100000));
        extras.push(`${name}=${value}`);
      }
      url += `?${extras.join('&')}`;
      const parsed = parseRoute(url);
      expect(() => formatRoute(parsed as ShellRoute), url).not.toThrow();
      if ('notFound' in parsed || 'redirect' in parsed) continue;
      const out = formatRoute(parsed);
      for (const key of queryKeys(out)) expect(ALLOWED_KEYS.has(key), `${url} -> ${out}`).toBe(true);
      expect(out, url).not.toMatch(/qty|price|side|position|pnl|player|order|cash|nw=|style|ghost|holding/);
    }
  });
});
