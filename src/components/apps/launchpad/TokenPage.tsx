'use client';

// A token's page (lead-launchpad.md L7): the icon, name, ticker, tagline and creator; the curve to graduation; the price over the
// ticks; the allocation and its vesting; the rug flag and the case; the public tape (no handles, the creator's trades flagged);
// the holder buckets; the buzz items; and the buy and sell ticket. Holders are never named: the buckets are the top-10 share of
// supply and the count of holders.
import { useState } from 'react';
import { money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, Progress, ticksLabel } from '@/components/ui';
import type { LpPage } from '@/world/launchpad/view';
import { GRAD_RAISE, gameDayOf, lpPrice, refusalOf, taglineKey, tokens as fmtTokens, type RefusalCopy } from './copy';
import { BuzzButtons } from './Buzz';
import { CurveChart } from './CurveChart';
import { FlagChip, Fact, RefusalBox, Section, SponsoredChip, StatusChip, TokenIcon } from './Shared';
import { Ticket } from './Ticket';

export function TokenPage({ page, held, locked, isCreator, tick, onBack }: {
  page: LpPage; held: number; locked: number; isCreator: boolean; tick: number; onBack: () => void;
}) {
  const act = useGame((s) => s.act);
  const [fileRefusal, setFileRefusal] = useState<RefusalCopy | null>(null);
  const [filed, setFiled] = useState<string | null>(null);
  const today = gameDayOf(tick);
  const cliffLeft = Math.max(0, page.vesting.cliffDay - today);
  const creatorLine = page.creatorHandle
    ? t('lp.page.creator', { handle: page.creatorHandle })
    : t('lp.page.worldLaunch');

  const fileCase = async () => {
    setFileRefusal(null);
    setFiled(null);
    const r = await act({ type: 'lp.file', ticker: page.ticker }, { silent: true });
    if (r.ok) setFiled(t('lp.file.sent', { ticker: page.ticker }));
    else setFileRefusal(refusalOf(r.data, r.error ? undefined : 'unknown'));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="lp-token-page">
      <Button variant="ghost" size="sm" className="self-start" onClick={onBack} testId="lp-back">{t('lp.back')}</Button>

      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-4">
          <TokenIcon svg={page.icon} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-serif text-hero text-fg" data-testid="lp-page-name">{page.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="num text-body text-brass" data-testid="lp-page-ticker">{page.ticker}</span>
              <StatusChip status={page.status} />
              {page.flag && <FlagChip reason={page.flag.reason} />}
              {page.sponsored > 0 && <SponsoredChip />}
            </div>
            <p className="text-small text-fg-muted">{t(taglineKey(page.tagline))}</p>
            <p className="text-caption text-fg-faint" data-testid="lp-page-creator">{creatorLine}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 @md:grid-cols-4">
          <Fact label={t('lp.page.price')} value={lpPrice(page.price)} testId="lp-page-price" />
          <Fact label={t('lp.page.marketCap')} value={money(page.marketCap)} testId="lp-page-mcap" />
          <Fact label={t('lp.page.raised')} value={money(page.raised)} testId="lp-page-raised" />
          <Fact label={t('lp.page.vol')} value={money(page.vol)} testId="lp-page-vol" />
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Section title={t('lp.page.curve')}>
          <div className="flex items-center gap-2">
            <Progress value={page.progress} className="flex-1" label={t('lp.page.curve')} />
            <span className="num text-small text-fg" data-testid="lp-page-progress">{pct(page.progress)}</span>
          </div>
          <p className="text-caption text-fg-muted">{t('lp.page.curveNote', { raise: money(GRAD_RAISE) })}</p>
          <CurveChart points={page.chart} />
        </Section>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Section title={t('lp.page.trade')}>
          <Ticket page={page} held={held} locked={locked} />
        </Section>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Section title={t('lp.page.allocation')} testId="lp-allocation">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 @md:grid-cols-3">
            <Fact label={t('lp.page.allocTokens')} value={fmtTokens(page.allocation)} testId="lp-page-alloc" />
            <Fact label={t('lp.page.allocShare')} value={pct(page.allocation / 1_000_000_000)} />
            {isCreator && <Fact label={t('lp.page.feesEarned')} value={money(page.creatorFees)} testId="lp-page-fees" />}
          </div>
          <div className="flex items-center gap-2">
            <Progress value={page.vesting.unlocked} className="flex-1" label={t('lp.page.vesting')} />
            <span className="num text-caption text-fg-muted">{pct(page.vesting.unlocked)}</span>
          </div>
          <p className="text-caption text-fg-muted" data-testid="lp-vesting">
            {cliffLeft > 0
              ? t('lp.page.vestingCliff', { cliff: page.vesting.cliffDay, end: page.vesting.endDay })
              : t('lp.page.vestingOpen', { end: page.vesting.endDay })}
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
              <div><Button size="sm" variant="danger" testId="lp-file" onClick={fileCase}>{t('lp.page.fileCase')}</Button></div>
            </div>
          )}
          {filed && <p role="status" className="text-small text-gain" data-testid="lp-filed">{filed}</p>}
          {fileRefusal && <RefusalBox copy={fileRefusal} testId="lp-file-refusal" />}
        </Section>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Section title={t('lp.page.tape')} public testId="lp-tape">
          {page.tape.length === 0 ? (
            <p className="text-small text-fg-muted" data-testid="lp-tape-empty">{t('lp.page.tapeEmpty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-2" data-testid="lp-tape-rows">
              {[...page.tape].reverse().map((r, i) => (
                <li key={`${r.tick}-${i}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-1.5 text-small" data-testid="lp-tape-row">
                  <span className="flex min-w-0 items-center gap-2 text-fg-muted">
                    <span className="num whitespace-nowrap">{tick - r.tick > 0 ? t('lp.tape.ago', { when: ticksLabel(tick - r.tick) }) : t('lp.tape.now')}</span>
                    {r.creator && (
                      <span className="rounded-chip border border-steel/50 px-1.5 py-px text-micro uppercase tracking-wide text-steel" data-testid="lp-tape-creator">
                        {t('lp.tape.creator')}
                      </span>
                    )}
                    {r.npc && !r.creator && <span className="text-caption text-fg-faint">{t('lp.tape.flow')}</span>}
                  </span>
                  <span className={`num whitespace-nowrap ${r.side === 'buy' ? 'text-gain' : 'text-loss'}`}>
                    {t(r.side === 'buy' ? 'lp.side.buy' : 'lp.side.sell')} {fmtTokens(r.qty)}
                  </span>
                  <span className="num whitespace-nowrap text-fg">{lpPrice(r.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Section title={t('lp.page.holders')} testId="lp-holders">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Fact label={t('lp.page.top10')} value={pct(page.buckets.top10Share)} testId="lp-top10" />
            <Fact label={t('lp.page.count')} value={String(page.buckets.holders)} testId="lp-holder-count" />
          </div>
          <p className="text-caption text-fg-faint">{t('lp.page.holdersNote')}</p>
        </Section>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Section title={t('lp.page.promote')}>
          <BuzzButtons ticker={page.ticker} promosToday={page.sponsored} testPrefix="lp-page-buzz" />
        </Section>
      </Card>
    </div>
  );
}
