'use client';

// The three feeds: New (fresh launches, with the curve progress bar), Trending (one game day of volume) and Graduated (with a
// Trade in Broker button, since a graduated token is a Broker asset). A row opens the token's page. Figures never truncate.
import { money, pct } from '@/game/format';
import { t } from '@/i18n';
import { Button, Empty, Progress } from '@/components/ui';
import { openFromShell } from '@/components/os/openApp';
import type { LpCard } from '@/world/launchpad/view';
import { lpPrice, taglineKey } from './copy';
import { FlagChip, SponsoredChip, StatusChip, TokenIcon } from './Shared';

export type FeedKind = 'new' | 'trending' | 'graduated';

export function FeedTab({ rows, kind, onOpen }: { rows: LpCard[]; kind: FeedKind; onOpen: (ticker: string) => void }) {
  if (rows.length === 0) {
    return <Empty title={t(`lp.feed.empty.${kind}`)} />;
  }
  return (
    <ul className="flex flex-col gap-2" data-testid={`lp-feed-${kind}`}>
      {rows.map((c) => (
        <li key={c.ticker} className="flex flex-wrap items-center gap-3 rounded-md border border-ink-2 bg-ink-0/40 p-3" data-testid={`lp-row-${c.ticker}`}>
          <button type="button" onClick={() => onOpen(c.ticker)} className="flex min-w-0 flex-1 basis-[14rem] items-center gap-3 text-left" data-testid={`lp-open-${c.ticker}`}>
            <TokenIcon svg={c.icon} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-words font-medium text-fg">{c.name}</span>
                <span className="num text-caption text-brass">{c.ticker}</span>
                <StatusChip status={c.status} />
                {c.flag && <FlagChip reason={c.flag.reason} />}
                {c.sponsored > 0 && <SponsoredChip />}
              </span>
              <span className="block truncate text-caption text-fg-muted">
                {t(taglineKey(c.tagline))}
                {' · '}
                {c.creatorHandle ? t('lp.page.creator', { handle: c.creatorHandle }) : t('lp.page.worldLaunch')}
              </span>
              {c.status === 'live' && (
                <span className="mt-2 flex items-center gap-2">
                  <Progress value={c.progress} className="flex-1" label={t('lp.row.progress', { pct: pct(c.progress) })} />
                  <span className="num whitespace-nowrap text-caption text-fg-muted" data-testid={`lp-progress-${c.ticker}`}>{t('lp.row.progress', { pct: pct(c.progress) })}</span>
                </span>
              )}
            </span>
          </button>
          <span className="grid grid-cols-3 gap-x-4 gap-y-1 text-right">
            <span className="min-w-0">
              <span className="label block">{t('lp.row.price')}</span>
              <span className="num block whitespace-nowrap text-small text-fg">{lpPrice(c.price)}</span>
            </span>
            <span className="min-w-0">
              <span className="label block">{t('lp.row.marketCap')}</span>
              <span className="num block whitespace-nowrap text-small text-fg">{money(c.marketCap)}</span>
            </span>
            <span className="min-w-0">
              <span className="label block">{t('lp.row.vol')}</span>
              <span className="num block whitespace-nowrap text-small text-fg">{money(c.vol)}</span>
            </span>
          </span>
          {kind === 'graduated' && (
            <Button size="sm" variant="brass" testId={`lp-broker-${c.ticker}`} onClick={() => openFromShell('broker', { ticker: c.ticker })}>
              {t('lp.trade.broker')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
