'use client';

// The Launchpad board's pieces (R-10-6, Phase 10, the pump.fun shape): the king of the hill banner (the live token with the highest
// curve progress), the live trades bar ("who bought $X of TICKER", anonymous ids and fictional NPC handles, never a real handle), and
// a board card (the generated image, the name and ticker, the creator, the market cap in dollars, the curve, the replies and the time
// since the last trade). A card opens the token's page. Every figure is in full; the card grid wraps on a phone.
import { money, pct } from '@/game/format';
import { t } from '@/i18n';
import { Progress, ticksLabel } from '@/components/ui';
import { iconSvg } from '@/world/launchpad/icon';
import type { LpBarRow, LpCard } from '@/world/launchpad/view';
import { lpPrice, taglineKey } from './copy';
import { FlagChip, SponsoredChip, StatusChip, TokenIcon } from './Shared';

/** The king of the hill: the live token closest to graduation, as a banner over the board. Null when no token has sold yet. */
export function KingBanner({ king, tick, onOpen }: { king: LpCard | null; tick: number; onOpen: (ticker: string) => void }) {
  if (!king) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(king.ticker)}
      className="flex w-full flex-wrap items-center gap-3 rounded-md border border-brass/50 bg-brass/10 p-3 text-left hover:bg-brass/15"
      data-testid="lp-king"
    >
      <TokenIcon svg={king.icon} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block text-micro uppercase tracking-wide text-brass">{t('lp.king.title')}</span>
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="break-words font-medium text-fg" data-testid="lp-king-name">{king.name}</span>
          <span className="num text-caption text-brass">{king.ticker}</span>
        </span>
        <span className="flex flex-wrap gap-x-2 text-caption text-fg-muted" data-testid="lp-king-cap">
          <span className="num whitespace-nowrap">{t('lp.king.capOnly', { cap: money(king.marketCap) })}</span>
          <span className="num whitespace-nowrap">{t('lp.king.soldOnly', { pct: pct(king.progress) })}</span>
        </span>
      </span>
      <span className="text-caption text-fg-faint">{t('lp.king.age', { when: ticksLabel(Math.max(0, tick - king.createdTick)) })}</span>
    </button>
  );
}

/** The live trades bar: the newest trades across the tokens, one line each (a line wraps as a whole, never sideways). */
export function TradesBar({ rows, tick, onOpen }: { rows: LpBarRow[]; tick: number; onOpen: (ticker: string) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-2 bg-ink-1 px-3 py-2" data-testid="lp-bar" aria-label={t('lp.bar.label')}>
      <span className="text-micro uppercase tracking-wide text-fg-faint">{t('lp.bar.title')}</span>
      <ul className="flex flex-col gap-1 text-caption" data-testid="lp-bar-rows">
        {rows.slice(0, 5).map((r, i) => (
          <li key={`${r.ticker}-${r.tick}-${r.who}-${i}`}>
            <button type="button" onClick={() => onOpen(r.ticker)} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left" data-testid="lp-bar-row">
              <span className={r.creator ? 'text-brass' : 'text-fg-muted'}>{r.who}</span>
              <span className={r.side === 'buy' ? 'text-gain' : 'text-loss'}>{t(r.side === 'buy' ? 'lp.bar.bought' : 'lp.bar.sold')}</span>
              <span className="num whitespace-nowrap text-fg">{money(r.usd)}</span>
              <span className="num whitespace-nowrap text-brass">{r.ticker}</span>
              <span className="text-fg-faint">{tick - r.tick > 0 ? t('lp.bar.ago', { when: ticksLabel(tick - r.tick) }) : t('time.now')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One board card: the image, the identity, the market cap, the curve, and the thread and the last trade underneath. */
export function BoardCard({ c, tick, onOpen, onBroker }: { c: LpCard; tick: number; onOpen: (ticker: string) => void; onBroker: (ticker: string) => void }) {
  const graduated = c.status === 'graduated';
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-md border border-ink-2 bg-ink-1 p-3" data-testid={`lp-row-${c.ticker}`}>
      <button type="button" onClick={() => onOpen(c.ticker)} className="flex min-w-0 items-start gap-3 text-left" data-testid={`lp-open-${c.ticker}`}>
        <TokenIcon svg={iconSvg(c.ticker, c.art)} size={80} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="break-words font-medium text-fg">{c.name}</span>
            <span className="num text-caption text-brass">{c.ticker}</span>
          </span>
          <span className="truncate text-caption text-fg-muted" data-testid={`lp-card-creator-${c.ticker}`}>
            {c.creatorHandle ? t('lp.card.by', { handle: c.creatorHandle }) : t('lp.card.worldLaunch')}
          </span>
          <span className="line-clamp-2 text-caption text-fg-faint">{t(taglineKey(c.tagline))}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusChip status={c.status} />
            {c.flag && <FlagChip reason={c.flag.reason} />}
            {c.sponsored > 0 && <SponsoredChip />}
          </span>
        </span>
      </button>

      <div className="flex items-end justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="label">{t('lp.card.marketCap')}</span>
          <span className="num whitespace-nowrap text-body text-fg" data-testid={`lp-cap-${c.ticker}`}>{money(c.marketCap)}</span>
        </span>
        <span className="num whitespace-nowrap text-caption text-fg-faint">{t('lp.card.price', { price: lpPrice(c.price) })}</span>
      </div>

      {graduated ? (
        <span className="text-caption text-gain" data-testid={`lp-grad-${c.ticker}`}>{t('lp.card.graduated', { when: ticksLabel(Math.max(0, tick - (c.gradTick ?? tick))) })}</span>
      ) : c.status === 'live' ? (
        <span className="flex items-center gap-2">
          <Progress value={c.progress} className="min-w-[3rem] flex-1" label={t('lp.row.progress', { pct: pct(c.progress) })} />
          <span className="num whitespace-nowrap text-caption text-fg-muted" data-testid={`lp-progress-${c.ticker}`}>{t('lp.row.progress', { pct: pct(c.progress) })}</span>
        </span>
      ) : (
        <span className="text-caption text-fg-faint">{t('lp.row.noCurve')}</span>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-fg-muted">
        <span className="flex items-center gap-3">
          <span data-testid={`lp-card-replies-${c.ticker}`}>{t('lp.card.replies', { n: c.replies })}</span>
          <span>{tick - c.lastTrade > 0 ? t('lp.card.lastTrade', { when: ticksLabel(tick - c.lastTrade) }) : t('lp.card.justNow')}</span>
        </span>
        {graduated ? (
          <button type="button" className="rounded-chip border border-brass/50 px-2 py-0.5 text-brass" data-testid={`lp-broker-${c.ticker}`} onClick={() => onBroker(c.ticker)}>
            {t('lp.trade.broker')}
          </button>
        ) : (
          <button type="button" className="rounded-chip border border-ink-3 px-2 py-0.5 text-fg-muted hover:text-fg" data-testid={`lp-trade-${c.ticker}`} onClick={() => onOpen(c.ticker)}>
            {t('lp.row.open')}
          </button>
        )}
      </div>
    </article>
  );
}
