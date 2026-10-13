import { describe, expect, it } from 'vitest';
import type { DailyClose } from '../ledger-types';
import { textProvider } from './index';
import { renderMsg } from './template';

/** A card with a business bought for $1,500 that day: trading flat, the purchase out of valuation (the headline is the trading line). */
function card(over: Partial<DailyClose>): DailyClose {
  return {
    day: 4, offline: false, nwOpen: 10_000, nwClose: 10_100.18, nwChange: 100.18, nwChangePct: 0.01, trading: -1_500, valuation: 1_500,
    income: 0, tax: 0, external: 0, best: null, worst: null, gx: { pct: 0.0123 }, sectors: null, stories: [], event: null, biz: null,
    ghosts: { player: 100.18, basket: 50, random: -20.5, momentum: 0, beaten: 2, percentile: 66 },
    lines: [], ...over,
  } as DailyClose;
}

describe('the close text carries its money as number tokens: the viewer locale formats them (en and fr)', () => {
  it('the headline reads a loss in dollars in English and in French money form, never "$" in French', () => {
    const c = card({ trading: -1_500 });
    const head = textProvider.dailyClose(c).find((m) => m.key.startsWith('txt.narr.head.'))!;
    expect(renderMsg(head, 'en')).toMatch(/\$1,500\.00/);
    const fr = renderMsg(head, 'fr');
    expect(fr).not.toContain('$1,500.00');
    expect(fr).toMatch(/1\s500,00\s\$/);
  });

  it('the valuation, income and tax lines, the net change and the ghosts are French money too', () => {
    const c = card({ trading: 12.5, valuation: -1_234.5, income: 40, tax: -20, biz: { businesses: 1, net: 300, tax: 20, rate: 0.1 } });
    const lines = textProvider.dailyClose(c);
    const valuation = lines.find((m) => m.key === 'dayclose.valuation')!;
    expect(renderMsg(valuation, 'en')).toContain('-$1,234.50');
    expect(renderMsg(valuation, 'fr')).toMatch(/-1\s234,50\s\$/);
    const tax = lines.find((m) => m.key === 'dayclose.tax')!;
    expect(renderMsg(tax, 'fr')).toMatch(/-20,00\s\$/);
    const ghosts = lines.find((m) => m.key.startsWith('txt.narr.ghosts.'))!;
    expect(renderMsg(ghosts, 'fr')).toMatch(/50,00\s\$/);
    expect(renderMsg(ghosts, 'fr')).not.toMatch(/\$\d/);
  });

  it('a percent in the market line reads 1,23 % in French', () => {
    const c = card({});
    const gx = textProvider.dailyClose(c).find((m) => m.key.startsWith('txt.narr.gx.'))!;
    expect(renderMsg(gx, 'en')).toContain('+1.23%');
    expect(renderMsg(gx, 'fr')).toMatch(/\+1,23\s%/);
  });
});
