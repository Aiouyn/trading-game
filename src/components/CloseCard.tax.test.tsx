// @vitest-environment node
// The business tax row in the close card (R-9-10): the split shows it when the owner had a business that day, at its bracket,
// and the row is absent for a day with no business. Rendered on the server, in English and in French.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLocale } from '@/i18n';
import { textProvider } from '@/world/text';
import type { DailyClose } from '@/world/ledger-types';
import { CloseBrief } from './CloseCard';

const holder = vi.hoisted(() => ({ closes: [] as unknown[] }));
vi.mock('@/game/store', () => ({
  useGame: (sel: (s: unknown) => unknown) => sel({
    me: { player: { handle: 'tycoon' }, trading: { closes: holder.closes } },
    closeOpen: null,
    toast: () => {},
  }),
}));

/** A closed day as the close module builds it: the base facts, then the lines from the text provider. */
function closeCard(biz: DailyClose['biz']): DailyClose {
  const base: Omit<DailyClose, 'lines'> = {
    day: 4, offline: false, nwOpen: 1000, nwClose: 1286.49, nwChange: 286.49, nwChangePct: 0.28649,
    trading: -3.51, valuation: 300, income: 10, tax: biz ? -20 : 0, external: 0,
    best: null, worst: null, gx: { pct: 0.01 }, sectors: null, stories: [], event: null,
    ghosts: { player: 1286.49, basket: 1000, random: 1000, momentum: 1000, beaten: 3, percentile: 100 },
    biz,
  };
  return { ...base, lines: textProvider.dailyClose(base) };
}

function render(biz: DailyClose['biz']): string {
  holder.closes = [closeCard(biz)];
  return renderToStaticMarkup(<CloseBrief />);
}

function inFrench<T>(fn: () => T): T {
  useLocale.getState().setLocale('fr');
  try {
    return fn();
  } finally {
    useLocale.getState().setLocale('en');
  }
}

afterEach(() => {
  useLocale.getState().setLocale('en');
});

describe('the close card shows the business tax row', () => {
  const biz = { businesses: 1, net: 200, tax: 20, rate: 0.1 };

  it('in English: a row at the bracket, the tax as money out, between income and the net change', () => {
    const html = render(biz);
    expect(html).toContain('data-testid="close-split-tax"');
    expect(html).toContain('Business tax (bracket 10%)');
    expect(html).toContain('−$20.00');
    expect(html).not.toContain('data-testid="close-tax"');
    expect(html.indexOf('close-split-income')).toBeLessThan(html.indexOf('close-split-tax'));
    expect(html.indexOf('close-split-tax')).toBeLessThan(html.indexOf('close-split-net'));
  });

  it('in French: the row names the bracket with a French percent and prints the money the French way', () => {
    const html = inFrench(() => render(biz));
    expect(html).toContain('Impôt sur les entreprises (tranche 10\u00a0%)');
    expect(html).toContain('−20,00\u00a0$');
  });

  it('is absent for a day the player owned no business', () => {
    const html = render(null);
    expect(html).not.toContain('close-split-tax');
    expect(html).not.toContain('Business tax');
    expect(html).toContain('data-testid="close-split-net"');
  });
});
