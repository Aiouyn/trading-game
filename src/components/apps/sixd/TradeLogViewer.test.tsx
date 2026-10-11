// @vitest-environment node
// The published trade logs (N8), rendered on the server: a log is listed only when published, stays closed until it is
// opened, and its table draws at most TRADE_LOG_ROWS fills with a note of the rest.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TRADE_LOG_ROWS, TradeLogTable, TradeLogViewer, type PublishedLog } from './TradeLogViewer';
import type { TradeLogRecord } from '@/world/types';

const trade = (i: number): TradeLogRecord => ({ tick: i * 3, assetId: 'HLCN', side: 'buy', qty: 1 + (i % 4), price: 10 + i / 10 });
const published = (n: number): PublishedLog => ({ handle: 'tycoon', seed: 'a1b2c3d4e5f6', trades: Array.from({ length: n }, (_, i) => trade(i)) });
const rows = (html: string) => html.split('data-testid="trade-log-row"').length - 1;

describe('published trade logs (N8)', () => {
  it('lists nothing when no log was published', () => {
    const html = renderToStaticMarkup(<TradeLogViewer logs={[]} />);
    expect(html).toContain('data-testid="trade-logs-none"');
    expect(html).not.toContain('data-testid="trade-logs"');
  });

  it('lists each published log, closed until it is opened', () => {
    const html = renderToStaticMarkup(<TradeLogViewer logs={[published(3)]} />);
    expect(html).toContain('data-testid="trade-log-0"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="trade-log-table-0"');
  });

  it('draws the first TRADE_LOG_ROWS fills of a long log and says how many more it holds', () => {
    const html = renderToStaticMarkup(<TradeLogTable trades={published(TRADE_LOG_ROWS + 25).trades} index={0} />);
    expect(rows(html)).toBe(TRADE_LOG_ROWS);
    expect(html).toContain('data-testid="trade-log-more-0"');
  });

  it('draws every fill of a short log, with no note', () => {
    const html = renderToStaticMarkup(<TradeLogTable trades={published(5).trades} index={1} />);
    expect(rows(html)).toBe(5);
    expect(html).not.toContain('data-testid="trade-log-more-1"');
  });
});
