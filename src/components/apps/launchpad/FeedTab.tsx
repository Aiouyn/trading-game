'use client';

// The three feeds as one dense table (Stage 4, the pump.fun / Dexscreener shape): token, status, price, market cap,
// one day of volume, a curve progress bar, and the inline action (Trade in Broker on Graduated). Search and sort sit above.
// A row (or its token name) opens the token's page. Figures never truncate; the table scrolls sideways on a phone.
import { useMemo, useState } from 'react';
import { money, pct } from '@/game/format';
import { t } from '@/i18n';
import { Button, Card, EmptyNext, Progress, Select, TextField, Td, Th } from '@/components/ui';
import { openFromShell } from '@/components/os/openApp';
import type { LpCard } from '@/world/launchpad/view';
import { lpPrice, taglineKey } from './copy';
import { FlagChip, SponsoredChip, StatusChip, TokenIcon } from './Shared';

export type FeedKind = 'new' | 'trending' | 'graduated';
type Sort = 'feed' | 'vol' | 'cap' | 'curve';

export function FeedTab({ rows, kind, onOpen, onTab }: { rows: LpCard[]; kind: FeedKind; onOpen: (ticker: string) => void; onTab: (tab: 'new' | 'create') => void }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('feed');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.ticker.toLowerCase().includes(needle));
    if (sort === 'feed') return list;
    const key = (c: LpCard) => (sort === 'vol' ? c.vol : sort === 'cap' ? c.marketCap : c.progress);
    return [...list].sort((a, b) => key(b) - key(a));
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
        <Select<Sort> label={t('lp.feed.sort.label')} value={sort} onChange={setSort} testId={`lp-sort-${kind}`} options={[
          { value: 'feed', label: t('lp.feed.sort.feed') },
          { value: 'vol', label: t('lp.feed.sort.vol') },
          { value: 'cap', label: t('lp.feed.sort.cap') },
          { value: 'curve', label: t('lp.feed.sort.curve') },
        ]} />
        <span className="text-caption text-fg-faint">{t('lp.feed.count', { n: shown.length })}</span>
      </div>
      {shown.length === 0 ? (
        <Card className="p-6 text-center text-small text-fg-faint" data-testid="lp-feed-none">{t('lp.feed.noMatch')}</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-small" data-testid="lp-table">
            <thead>
              <tr className="border-b border-ink-2 text-left">
                <Th>{t('lp.col.token')}</Th>
                <Th right>{t('lp.row.price')}</Th>
                <Th right className="hidden @md:table-cell">{t('lp.row.marketCap')}</Th>
                <Th right className="hidden @xl:table-cell">{t('lp.row.vol')}</Th>
                <Th className="w-40 @md:w-56">{t('lp.col.curve')}</Th>
                <Th right>{t('lp.col.action')}</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.ticker} className="border-b border-ink-2 last:border-0" data-testid={`lp-row-${c.ticker}`}>
                  <Td className="min-w-[10rem]">
                    <button type="button" onClick={() => onOpen(c.ticker)} className="flex min-w-0 items-center gap-2 text-left" data-testid={`lp-open-${c.ticker}`}>
                      <TokenIcon svg={c.icon} size={28} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="break-words font-medium text-fg">{c.name}</span>
                          <span className="num text-caption text-brass">{c.ticker}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <StatusChip status={c.status} />
                          {c.flag && <FlagChip reason={c.flag.reason} />}
                          {c.sponsored > 0 && <SponsoredChip />}
                          <span className="block truncate text-caption text-fg-faint">{t(taglineKey(c.tagline))}</span>
                        </span>
                      </span>
                    </button>
                  </Td>
                  <Td right num className="whitespace-nowrap text-fg">{lpPrice(c.price)}</Td>
                  <Td right num className="hidden whitespace-nowrap @md:table-cell">{money(c.marketCap)}</Td>
                  <Td right num className="hidden whitespace-nowrap @xl:table-cell">{money(c.vol)}</Td>
                  <Td>
                    {c.status === 'live' ? (
                      <span className="flex items-center gap-2">
                        <Progress value={c.progress} className="min-w-[4rem] flex-1" label={t('lp.row.progress', { pct: pct(c.progress) })} />
                        <span className="num whitespace-nowrap text-caption text-fg-muted" data-testid={`lp-progress-${c.ticker}`}>{t('lp.row.progress', { pct: pct(c.progress) })}</span>
                      </span>
                    ) : <span className="text-caption text-fg-faint">{t('lp.row.noCurve')}</span>}
                  </Td>
                  <Td right>
                    {kind === 'graduated' ? (
                      <Button size="sm" variant="brass" testId={`lp-broker-${c.ticker}`} onClick={() => openFromShell('broker', { ticker: c.ticker })}>
                        {t('lp.trade.broker')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onOpen(c.ticker)} testId={`lp-trade-${c.ticker}`}>{t('lp.row.open')}</Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
