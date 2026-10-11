'use client';

// The viewer's own tokens: what they hold (live on the curve, or graduated into their Broker account), what is still locked
// under the creator's vesting, and the creator fees a launch has earned. Holders' balances of other players are never shown.
import { money } from '@/game/format';
import { t } from '@/i18n';
import { Button, EmptyNext } from '@/components/ui';
import { iconSvg } from '@/world/launchpad/icon';
import type { LaunchpadView } from '@/world/launchpad/view';
import { Fact, Section, StatusChip, TokenIcon } from './Shared';
import { tokens as fmtTokens } from './copy';

type Holding = LaunchpadView['holdings'][number];
type Console = LaunchpadView['console'][number];

export function HoldingsTab({ holdings, console: rows, onOpen, onTab }: {
  onTab: (tab: 'new') => void;
  holdings: Holding[];
  console: Console[];
  onOpen: (ticker: string) => void;
}) {
  const fees = rows;
  return (
    <div className="flex flex-col gap-4" data-testid="lp-holdings">
      <Section title={t('lp.hold.title')}>
        {holdings.length === 0 ? (
          <EmptyNext testId="lp-hold-empty" title={t('lp.hold.empty')} body={t('lp.hold.empty.body')}
            cta={<Button variant="brass" onClick={() => onTab('new')} testId="lp-hold-empty-cta">{t('lp.hold.empty.cta')}</Button>} />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="lp-hold-rows">
            {holdings.map((h) => {
              return (
                <li key={h.ticker} className="flex flex-wrap items-center gap-3 rounded-md border border-ink-2 bg-ink-0/40 p-3" data-testid={`lp-hold-${h.ticker}`}>
                  <button type="button" onClick={() => onOpen(h.ticker)} className="flex min-w-0 flex-1 basis-[12rem] items-center gap-3 text-left" data-testid={`lp-hold-open-${h.ticker}`}>
                    <TokenIcon svg={iconSvg(h.ticker)} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-medium text-fg">{h.name}</span>
                        <span className="num text-caption text-brass">{h.ticker}</span>
                        <StatusChip status={h.status} />
                      </span>
                      {h.vest && h.locked > 0 && (
                        <span className="block text-caption text-fg-muted" data-testid={`lp-hold-vest-${h.ticker}`}>
                          {t('lp.hold.vesting', { end: h.vest.endDay, unlocked: pct01(h.vest.unlocked) })}
                        </span>
                      )}
                    </span>
                  </button>
                  <span className="grid grid-cols-3 gap-x-4 text-right">
                    <Fact label={t('lp.hold.qty')} value={fmtTokens(h.qty)} testId={`lp-hold-qty-${h.ticker}`} />
                    <Fact label={t('lp.hold.value')} value={money(h.value)} testId={`lp-hold-value-${h.ticker}`} />
                    <Fact label={t('lp.hold.locked')} value={fmtTokens(h.locked)} testId={`lp-hold-locked-${h.ticker}`} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t('lp.hold.fees')} testId="lp-fees">
        {fees.length === 0 ? (
          <p className="text-small text-fg-faint" data-testid="lp-fees-none">{t('lp.hold.noFees')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-2" data-testid="lp-fee-rows">
            {fees.map((r) => (
              <li key={r.ticker} className="flex items-center justify-between gap-3 py-2 text-small" data-testid={`lp-fee-${r.ticker}`}>
                <span className="num text-brass">{r.ticker}</span>
                <span className="num whitespace-nowrap text-fg">{money(r.fees)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-caption text-fg-faint">{t('lp.hold.feeNote')}</p>
      </Section>
    </div>
  );
}

/** A fraction as a whole percent (the vesting share in the holding line). */
function pct01(f: number): string {
  return `${Math.round(f * 100)}%`;
}
