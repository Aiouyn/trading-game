import { describe, expect, it } from 'vitest';
import { createWorld, step, stepMany } from './sim';
import { defaultConfig } from './config';
import { isEarningsDay, newsBand, newsPricedIn, wire } from './news';
import type { WorldState } from './types';

const cfg = () => defaultConfig({ ticksPerDay: 24 });

describe('news', () => {
  it('is deterministic and never changes prices', () => {
    const run = () => {
      let s = createWorld('alpha', cfg());
      const px: number[] = [];
      const heads: string[] = [];
      for (let d = 0; d < 30; d++) {
        const r = stepMany(s, 24);
        s = r.state;
        px.push(...s.assets.map((a) => a.lnP));
        for (const e of r.events) if (e.type === 'news') heads.push(e.item.headline);
      }
      return { px, heads };
    };
    const a = run();
    const b = run();
    expect(a.heads).toEqual(b.heads);
    expect(a.heads.length).toBeGreaterThan(10);
    expect(a.px).toEqual(b.px);
  });

  it('gives every jump exactly one news item with the same log move', () => {
    const r = stepMany(createWorld('alpha', cfg()), 24 * 40);
    const jumps = r.events.filter((e) => e.type === 'jump');
    const news = r.events.filter((e) => e.type === 'news' && e.item.logImpact !== 0);
    expect(jumps.length).toBeGreaterThan(0);
    expect(news.map((e) => e.type === 'news' && e.item.logImpact)).toEqual(jumps.map((e) => e.type === 'jump' && e.logSize));
  });

  it('prints one earnings line per stock on its own day, and a macro line every 21 days', () => {
    const c = cfg();
    const every = c.news?.earningsEveryDays ?? 63;
    let s = createWorld('alpha', c);
    const earnings = new Map<string, number>();
    let macros = 0;
    for (let d = 0; d < 64; d++) {
      const r = stepMany(s, 24);
      s = r.state;
      for (const e of r.events) {
        if (e.type !== 'news') continue;
        if (e.item.kind === 'earnings' && e.item.assetId) earnings.set(e.item.assetId, (earnings.get(e.item.assetId) ?? 0) + 1);
        if (e.item.kind === 'macro') macros++;
      }
    }
    const stocks = c.assets.filter((a) => a.assetClass === 'stock');
    for (const a of stocks) {
      let days = 0;
      for (let d = 1; d <= 63; d++) if (isEarningsDay(a.id, d, every)) days++;
      expect(earnings.get(a.id)).toBe(days);
    }
    expect(macros).toBe(3); // days 21, 42, 63
  });

  it('pricedIn starts at the immediate share and rises toward 1', () => {
    const c = cfg();
    const item = { id: 'x', tick: 0, day: 0, kind: 'company' as const, assetId: 'HLCN', headline: 'x', logImpact: 0.05 };
    expect(newsPricedIn(item, 0, c)).toBeCloseTo(c.jumpImmediate!, 12);
    const later = newsPricedIn(item, 20 * c.ticksPerDay, c);
    expect(later).toBeGreaterThan(c.jumpImmediate!);
    expect(later).toBeLessThan(1);
    expect(newsPricedIn({ ...item, logImpact: 0 }, 0, c)).toBe(1);
    // the Wire gets a band, never the share: a fresh print is Early, a long-finished one is Done
    expect(newsBand(item, 0, c)).toBe('early');
    expect(newsBand(item, 200 * c.ticksPerDay, c)).toBe('done');
    expect(wire(createWorld('alpha', c), 5).every((n) => typeof n.band === 'string')).toBe(true);
  });

  it('keeps the cap and still steps a world saved before news existed', () => {
    let s = createWorld('alpha', cfg());
    s = stepMany(s, 24 * 200).state;
    expect(s.news!.length).toBeLessThanOrEqual(120);
    expect(wire(s, 5)).toHaveLength(5);
    expect(['early', 'mid', 'late', 'done']).toContain(wire(s, 5)[0]!.band);
    const old = stepMany(createWorld('alpha', cfg()), 24).state;
    const bare = { ...old } as WorldState;
    delete bare.news;
    expect(step(bare).state.news!.length).toBeGreaterThanOrEqual(0);
  });
});
