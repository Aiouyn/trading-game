'use client';

// A token's page (lead-launchpad.md L7; R-10-6, Phase 10, the pump.fun shape): the header (the image, the name, the ticker, the market cap
// in dollars, the creator, the age and the description); the candle chart on the game clock; the curve to graduation ("$X in the curve,
// graduates at $Y market cap"); the trades table; the replies thread; the holder distribution; the allocation and vesting; the rug flag;
// the promotions; and the trade panel with the quick buys. Holders are anonymous; the creator's name is public, as a founder's is.
import { useState } from 'react';
import { money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, Progress, SpendReview, spendRows, ticksLabel } from '@/components/ui';
import { openFromShell } from '@/components/os/openApp';
import { LP } from '@/world/launchpad/constants';
import { spotAt } from '@/world/launchpad/curve';
import type { LpPage } from '@/world/launchpad/view';
import { FILING_FEE } from '@/world/launchpad/rug';
import { GRAD_RAISE, deadReasonKey, gameDayOf, lpPrice, refusalOf, taglineKey, tokens as fmtTokens, type RefusalCopy } from './copy';
import { BuzzButtons } from './Buzz';
import { CandleChart } from './CandleChart';
import { FlagChip, Fact, RefusalBox, Section, SponsoredChip, StatusChip, TokenIcon } from './Shared';
import { HolderList, Replies, TradesTable } from './TokenSections';
import { Ticket } from './Ticket';

/** The market cap the curve graduates at, in dollars (the spot at the graduation reserve, times the supply: about $216k). */
export const GRAD_MARKET_CAP = spotAt(LP.GRAD_Y) * LP.SUPPLY;

export function TokenPage({ page, held, locked, isCreator, tick, onBack, onChanged }: {
  page: LpPage; held: number; locked: number; isCreator: boolean; tick: number; onBack: () => void;
  /** after the viewer's own action on this page (a trade, a reply, a promotion, a case): the page is read again */
  onChanged: () => void;
}) {
  const act = useGame((s) => s.act);
  const cash = useGame((s) => s.me?.account?.cash ?? 0);
  const [fileRefusal, setFileRefusal] = useState<RefusalCopy | null>(null);
  const [filed, setFiled] = useState<string | null>(null);
  const today = gameDayOf(tick);
  // v1.4: the schedule starts at graduation, so before it there is no cliff or end day (null)
  const vestDays = page.vesting.cliffDay === null || page.vesting.endDay === null ? null : { cliff: page.vesting.cliffDay, end: page.vesting.endDay };
  const cliffLeft = vestDays ? Math.max(0, vestDays.cliff - today) : 0;
  const creatorLine = page.creatorHandle
    ? t('lp.page.creator', { handle: page.creatorHandle })
    : t('lp.page.worldLaunch');

  const fileCase = async () => {
    setFileRefusal(null);
    setFiled(null);
    const r = await act({ type: 'lp.file', ticker: page.ticker }, { silent: true });
    if (r.ok) {
      setFiled(t('lp.file.sent', { ticker: page.ticker }));
      onChanged();
    } else setFileRefusal(refusalOf(r.data, r.error ? undefined : 'unknown'));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="lp-token-page">
      <Button variant="ghost" size="sm" className="self-start" onClick={onBack} testId="lp-back">{t('lp.back')}</Button>

      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-4">
          <TokenIcon svg={page.icon} size={96} />
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-title font-semibold text-fg" data-testid="lp-page-name">{page.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="num text-body text-brass" data-testid="lp-page-ticker">{page.ticker}</span>
              <StatusChip status={page.status} />
              {page.flag && <FlagChip reason={page.flag.reason} />}
              {page.sponsored > 0 && <SponsoredChip />}
            </div>
            <p className="text-small text-fg-muted">{t(taglineKey(page.tagline))}</p>
            <p className="text-caption text-fg-faint" data-testid="lp-page-creator">
              {creatorLine} · {t('lp.page.created', { when: ticksLabel(Math.max(0, tick - page.createdTick)) })}
            </p>
            {page.description && <p className="mt-2 break-words text-small text-fg" data-testid="lp-page-desc">{page.description}</p>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 @md:grid-cols-4">
          <Fact label={t('lp.page.marketCap')} value={money(page.marketCap)} testId="lp-page-mcap" />
          <Fact label={t('lp.page.price')} value={lpPrice(page.price)} testId="lp-page-price" />
          <Fact label={t('lp.page.raised')} value={money(page.raised)} testId="lp-page-raised" />
          <Fact label={t('lp.page.vol')} value={money(page.vol)} testId="lp-page-vol" />
        </div>
      </Card>

      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-4">
            <CandleChart points={page.chart} />
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <Section title={t('lp.page.curve')} testId="lp-curve">
              <div className="flex items-center gap-2">
                <Progress value={page.progress} className="flex-1" label={t('lp.page.curve')} />
                <span className="num text-small text-fg" data-testid="lp-page-progress">{pct(page.progress)}</span>
              </div>
              <p className="text-caption text-fg-muted" data-testid="lp-curve-note">{page.status === 'graduated'
                ? t('lp.page.curveNote.graduated', { raise: money(page.raised) })
                : page.status === 'dead' ? t('lp.page.curveNote.dead')
                  : t('lp.page.curveNote.cap', { raised: money(page.raised), grad: money(GRAD_MARKET_CAP) })}</p>
              <p className="text-caption text-fg-faint">{t('lp.page.gradRaise', { raise: money(GRAD_RAISE) })}</p>
            </Section>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <Section title={t('lp.page.tape')} public testId="lp-tape-section">
              <TradesTable tape={page.tape} tick={tick} />
            </Section>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <Replies page={page} tick={tick} onPosted={onChanged} />
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <Section title={t('lp.page.holders')} testId="lp-holders">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Fact label={t('lp.page.top10')} value={pct(page.buckets.top10Share)} testId="lp-top10" />
                <Fact label={t('lp.page.count')} value={String(page.buckets.holders)} testId="lp-holder-count" />
              </div>
              <HolderList holders={page.holders} />
              <p className="text-caption text-fg-faint">{t('lp.page.holdersNote')}</p>
            </Section>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <Section title={t('lp.page.allocation')} testId="lp-allocation">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 @md:grid-cols-3">
                <Fact label={t('lp.page.allocTokens')} value={fmtTokens(page.allocation)} testId="lp-page-alloc" />
                <Fact label={t('lp.page.allocShare')} value={pct(page.allocation / LP.SUPPLY)} />
                {isCreator && page.creatorFees !== undefined && <Fact label={t('lp.page.feesEarned')} value={money(page.creatorFees)} testId="lp-page-fees" />}
              </div>
              <div className="flex items-center gap-2">
                <Progress value={page.vesting.unlocked} className="flex-1" label={t('lp.page.vesting')} />
                <span className="num text-caption text-fg-muted">{pct(page.vesting.unlocked)}</span>
              </div>
              <p className="text-caption text-fg-muted" data-testid="lp-vesting">
                {!vestDays
                  ? t('lp.page.vestingAfter')
                  : cliffLeft > 0
                    ? t('lp.page.vestingCliff', { cliff: vestDays.cliff, end: vestDays.end })
                    : t('lp.page.vestingOpen', { end: vestDays.end })}
              </p>
            </Section>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <Section title={t('lp.page.rug')} testId="lp-rug">
              {page.flag ? (
                <p className="text-small text-loss" data-testid="lp-rug-flag">
                  {t('lp.page.flagged', { reason: t(`lp.reason.${page.flag.reason}`), when: ticksLabel(Math.max(0, tick - page.flag.tick)) })}
                </p>
              ) : (
                <p className="text-small text-fg-muted" data-testid="lp-rug-clear">{t('lp.page.noFlag')}</p>
              )}
              {page.canFile && (
                <div className="flex flex-col gap-2">
                  <p className="text-caption text-fg-muted">{t('lp.page.fileNote')}</p>
                  <div><SpendReview variant="danger" testId="lp-file" label={t('lp.page.fileCase')} title={t('commit.fileTitle', { name: page.ticker })} confirmLabel={t('commit.confirmFile')} rows={spendRows(FILING_FEE, cash)} onConfirm={fileCase} /></div>
                </div>
              )}
              {filed && <p role="status" className="text-small text-gain" data-testid="lp-filed">{filed}</p>}
              {fileRefusal && <RefusalBox copy={fileRefusal} testId="lp-file-refusal" />}
            </Section>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <Section title={t('lp.page.promote')}>
              {page.status === 'live' ? (
                <BuzzButtons ticker={page.ticker} promosToday={page.sponsored} testPrefix="lp-page-buzz" />
              ) : (
                <p className="text-small text-fg-muted" data-testid="lp-buzz-closed">{t('lp.page.buzzClosed')}</p>
              )}
            </Section>
          </Card>
        </div>

        <aside id="lp-ticket-aside" className="flex flex-col gap-4 @3xl:sticky @3xl:top-2 @3xl:self-start" data-testid="lp-ticket-aside">
          <Card className="flex flex-col gap-3 p-4">
            {page.status === 'graduated' ? (
              <Section title={t('lp.page.trade')} testId="lp-grad-trade">
                <p className="text-small text-fg-muted" data-testid="lp-grad-note">{t('lp.page.gradNote')}</p>
                <div><Button variant="brass" testId="lp-trade-broker" onClick={() => openFromShell('broker', { ticker: page.ticker })}>{t('lp.trade.broker')}</Button></div>
              </Section>
            ) : (
              <Section title={t('lp.page.trade')}>
                {page.status === 'dead' && <p className="text-small text-fg-muted" data-testid="lp-dead-note">{t('lp.page.deadNote')}</p>}
                {page.status === 'dead' && page.deadReason && <p className="text-small text-fg-muted" data-testid="lp-dead-reason">{t(deadReasonKey(page.deadReason))}</p>}
                <Ticket page={page} held={held} locked={locked} dead={page.status === 'dead'} onDone={onChanged} />
              </Section>
            )}
          </Card>
        </aside>
      </div>
      {/* Below the wide layout the ticket stacks under the chart and tape; this bar keeps the price and the trade in reach. */}
      <div className="sticky bottom-2 z-20 flex items-center justify-between gap-3 rounded-md border border-brass/50 bg-ink-1 p-3 shadow-lg @3xl:hidden" data-testid="lp-mobile-ticket">
        <div className="min-w-0">
          <span className="num text-body text-fg" data-testid="lp-mobile-price">{money(page.marketCap)}</span>
          <span className="num ml-2 text-caption text-brass">{page.ticker}</span>
        </div>
        <Button variant="brass" size="sm" testId="lp-mobile-trade" onClick={() => document.getElementById('lp-ticket-aside')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          {t('lp.page.trade')}
        </Button>
      </div>
    </div>
  );
}
