'use client';

// The board (R-10-6, Phase 10, the pump.fun shape): the feed as a grid of cards, each with its image, its market cap in dollars, its
// bonding curve, its replies and its last trade. Most recent is the default; a selected sort is retained across feed/page visits.
// Sorts also include last trade, market cap, replies, volume and curve progress. A card opens the token's page; a graduated card opens the
// Broker. The king of the hill and the trades bar sit above the board in the app.
import { useEffect, useMemo, useState } from 'react';
import { money } from '@/game/format';
import { t } from '@/i18n';
import { Button, Card, EmptyNext, Select, TextField } from '@/components/ui';
import { openFromShell } from '@/components/os/openApp';
import type { LpCard } from '@/world/launchpad/view';
import { BoardCard, QUICK_BUY_AMOUNTS } from './Board';
import { useBoardPrefs, type BoardSort } from './boardPrefs';

export type FeedKind = 'new' | 'trending' | 'graduated';
export type { BoardSort } from './boardPrefs';

/** The sort key of a card, largest first (created is the launch tick, so the newest launch is first). */
function keyOf(sort: BoardSort, c: LpCard): number {
  switch (sort) {
    case 'bump': return c.lastTrade;
    case 'cap': return c.marketCap;
    case 'created': return c.createdTick;
    case 'replies': return c.replies;
    case 'vol': return c.vol;
    case 'curve': return c.progress;
  }
}

export function FeedTab({ rows, kind, tick, onOpen, onTab, quickBuy, onQuickBuy }: {
  rows: LpCard[];
  kind: FeedKind;
  tick: number;
  onOpen: (ticker: string) => void;
  onTab: (tab: 'new' | 'create') => void;
  /** the dollars a live card buys in one click; only the new and trending feeds pass it */
  quickBuy?: number;
  onQuickBuy?: (dollars: number) => void;
}) {
  const [q, setQ] = useState('');
  const sort = useBoardPrefs((s) => s.sort);
  const setSort = useBoardPrefs((s) => s.setSort);
  const load = useBoardPrefs((s) => s.load);
  useEffect(() => { load(); }, [load]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.ticker.toLowerCase().includes(needle));
    return [...list].sort((a, b) => keyOf(sort, b) - keyOf(sort, a) || (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  }, [rows, q, sort]);
  if (rows.length === 0) {
    return (
      <EmptyNext
        testId={`lp-feed-empty-${kind}`}
        title={t(`lp.feed.empty.${kind}`)}
        body={t(`lp.feed.empty.body.${kind}`)}
        cta={(
          <Button variant="brass" onClick={() => onTab(kind === 'new' ? 'create' : 'new')} testId={`lp-feed-empty-cta-${kind}`}>
            {t(`lp.feed.empty.cta.${kind}`)}
          </Button>
        )}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid={`lp-feed-${kind}`}>
      <div className="flex flex-wrap items-center gap-2">
        <TextField value={q} onChange={setQ} placeholder={t('lp.feed.search')} className="w-56" testId={`lp-search-${kind}`} />
        <Select<BoardSort> label={t('lp.feed.sort.label')} value={sort} onChange={setSort} testId={`lp-sort-${kind}`} options={[
          { value: 'bump', label: t('lp.feed.sort.bump') },
          { value: 'cap', label: t('lp.feed.sort.cap') },
          { value: 'created', label: t('lp.feed.sort.created') },
          { value: 'replies', label: t('lp.feed.sort.replies') },
          { value: 'vol', label: t('lp.feed.sort.vol') },
          { value: 'curve', label: t('lp.feed.sort.curve') },
        ]} />
        <span className="text-caption text-fg-faint">{t('lp.feed.count', { n: shown.length })}</span>
        {onQuickBuy && (
          <div role="group" aria-label={t('lp.quickBuy.title')} className="flex flex-wrap items-center gap-1" data-testid="lp-quickbuy-preset">
            <span className="text-caption text-fg-muted">{t('lp.quickBuy.title')}</span>
            {QUICK_BUY_AMOUNTS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={quickBuy === d}
                data-testid={`lp-quickbuy-amt-${d}`}
                onClick={() => onQuickBuy(d)}
                className={`rounded-chip border px-2 py-0.5 text-caption ${quickBuy === d ? 'border-gain/60 bg-gain/10 text-fg' : 'border-ink-3 text-fg-muted hover:text-fg'}`}
              >
                {money(d)}
              </button>
            ))}
          </div>
        )}
      </div>
      {shown.length === 0 ? (
        <Card className="p-6 text-center text-small text-fg-faint" data-testid="lp-feed-none">{t('lp.feed.noMatch')}</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3" data-testid="lp-table">
          {shown.map((c) => (
            <BoardCard key={c.ticker} c={c} tick={tick} onOpen={onOpen} onBroker={(ticker) => openFromShell('broker', { ticker })} quickBuy={kind === 'graduated' ? undefined : quickBuy} />
          ))}
        </div>
      )}
    </div>
  );
}
