import { describe, expect, it } from 'vitest';
import { newsBand, newsPricedIn } from './news';
import { universeConfig } from './universe';
import { defaultConfig } from './config';

const cfg = universeConfig();
const tpd = cfg.ticksPerDay;
const stock = cfg.assets.find((a) => a.assetClass === 'stock')!;

describe('news priced-in bands (ported from engine-staging)', () => {
  it('a fresh jump prints jumpImmediate (0.70) and reads Early', () => {
    expect(newsPricedIn(cfg, stock.id, 'jump', 0)).toBeCloseTo(0.7, 12);
    expect(newsBand(cfg, stock.id, 'jump', 0)).toBe('early');
  });

  it('a jump walks Early → Mid → Late → Done over its half-lives, never backwards', () => {
    const order = ['early', 'mid', 'late', 'done'];
    let last = 0;
    for (let d = 0; d <= 6 * stock.halfLifeDays; d++) {
      const b = order.indexOf(newsBand(cfg, stock.id, 'jump', d * tpd));
      expect(b).toBeGreaterThanOrEqual(last);
      last = b;
    }
    expect(last).toBe(3);
    expect(newsBand(cfg, stock.id, 'jump', stock.halfLifeDays * tpd)).toBe('mid'); // 0.85 after one half-life
  });

  it('earnings: the gap plus post-earnings drift, done once the drift window ends', () => {
    const c = cfg.catalysts!;
    expect(newsPricedIn(cfg, stock.id, 'earnings', 0)).toBeCloseTo(1 / (1 + c.peadShare), 12);
    expect(newsBand(cfg, stock.id, 'earnings', 0)).toBe('early');
    expect(newsBand(cfg, stock.id, 'earnings', c.peadDays * tpd)).toBe('done');
  });

  it('the legacy model (jumps print in full) has nothing left to drift', () => {
    expect(newsBand(defaultConfig(), 'LMNP', 'jump', 0)).toBe('done');
  });
});
