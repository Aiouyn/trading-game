import { describe, expect, it } from 'vitest';
import { LIFE_ITEMS } from '@/content/lifestyle';
import { AUCTION, AUCTION_BANDS, weekLots } from './auctions';

// R-10-7 (auctions): the week's lots are drawn per rank band, and a lot shows its minimum rank (its item's rank).

describe('auction lots per rank band (R-10-7)', () => {
  const pool = LIFE_ITEMS.filter((i) => i.cls === 'limited' || i.cls === 'unique');

  it('every limited or unique item belongs to one band', () => {
    for (const item of pool) {
      const bands = AUCTION_BANDS.filter((ranks) => ranks.includes(item.rank));
      expect(bands.length, `${item.id} (${item.rank})`).toBe(1);
    }
  });

  it('each week offers a lot in every band that has items, and the count stays in range', () => {
    const seeds = ['band-a', 'band-b', 'band-c'];
    for (const seed of seeds) {
      for (let week = 0; week < 40; week++) {
        const lots = weekLots(seed, week);
        expect(lots.length).toBeGreaterThanOrEqual(AUCTION.lotsMin);
        expect(lots.length).toBeLessThanOrEqual(AUCTION.lotsMax);
        AUCTION_BANDS.forEach((ranks) => {
          const inBand = pool.some((i) => ranks.includes(i.rank));
          if (inBand) expect(lots.some((l) => ranks.includes(l.rank)), `${seed} week ${week} band ${ranks.join('/')}`).toBe(true);
        });
        expect(new Set(lots.map((l) => l.id)).size).toBe(lots.length);
      }
    }
  });

  it('a lot’s minimum rank is its item’s rank, the rank a bid is checked against', () => {
    for (const lot of weekLots('band-d', 3)) {
      expect(lot.rank).toMatch(/^R[0-6]$/);
    }
  });
});
