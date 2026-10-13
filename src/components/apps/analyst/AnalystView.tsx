'use client';

import { useEffect, useState } from 'react';
import { ANALYST_TIERS, type AnalystTier } from '@/content/learning';
import { RANKS, rankIndex } from '@/content/lifestyle';
import { money, signedMoney, tone, toneText } from '@/game/format';
import { useGame } from '@/game/store';
import { t, tm } from '@/i18n';
import { Button, Card } from '@/components/ui';
import type { JournalDetail } from '@/world/journal';
import { Waterfall, type WaterfallRow } from './Waterfall';

/**
 * The hired analyst (velvet-research-desk.md section 2, D-19). One at a time. The first week is paid now from cash, and a week
 * ahead after that; there is no refund. Hiring and letting go each ask for one confirm, and the confirm says what happens to the
 * money. The journal carries the breakdowns; this view is the hire, the status and the let-go.
 */

const TIERS: AnalystTier[] = ['junior', 'senior'];

/**
 * The free sample (UX stage 6, item 9): the newest closed trade's breakdown, above the tiers, for a player with no analyst. The
 * journal.detail action returns its parts with the sentence; the screen only places them (the total is the server's).
 */
function LastTradeSample() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const trip = me.trading.trips.at(-1) ?? null;
  const tripId = trip?.id ?? '';
  const key = `${tripId}|${me.trading.desk.lastClosed ?? 'none'}`;
  const [got, setGot] = useState<{ key: string; d: JournalDetail } | null>(null);
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // a detail asked for before the world answers is asked again (up to five times), as the journal does
    const ask = (n: number) => {
      void act({ type: 'journal.detail', tripId }, { silent: true }).then((r) => {
        if (!live) return;
        if (r.ok && r.data) setGot({ key, d: r.data as JournalDetail });
        else if (n < 5) timer = setTimeout(() => ask(n + 1), 1000);
      });
    };
    ask(0);
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [act, tripId, key]);
  if (!trip) {
    return <p className="rounded-md border border-dashed border-ink-3 p-3 text-small text-fg-muted" data-testid="analyst-sample-none">{t('analyst.sample.none')}</p>;
  }
  const d = got?.key === key ? got.d : null;
  const rows: WaterfallRow[] = d?.sample ? d.sample.rows.map((r) => ({ key: r.row, label: t(`why.${r.row}`), value: r.value })) : [];
  const side = trip.side === 'long' ? t('journal.side.long') : t('journal.side.short');
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="analyst-sample">
      <div className="flex flex-col gap-0.5">
        <span className="label">{t('analyst.sample.title')}</span>
        <span className="text-small text-fg-muted">{trip.assetId} · {side} · <span className={toneText[tone(trip.realizedPnl)]}>{signedMoney(trip.realizedPnl)}</span></span>
      </div>
      {d && <p className="font-serif text-body text-fg" data-testid="analyst-sample-line">{tm(d.line)}</p>}
      {d?.sample ? (
        <Waterfall
          rows={rows}
          total={d.sample.total}
          totalLabel={t('why.total')}
          format={signedMoney}
          testId="analyst-sample-waterfall"
          note={rows.some((r) => r.key === 'market') ? t('why.market.note') : undefined}
        />
      ) : null}
      <p className="text-caption text-fg-faint">{t('analyst.sample.note')}</p>
    </Card>
  );
}

export function AnalystView() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [pick, setPick] = useState<AnalystTier>('junior');
  const [confirm, setConfirm] = useState<'hire' | 'let' | null>(null);
  const hired = me.player.analyst ?? null;
  const locked = rankIndex(me.player.rankId) < rankIndex(ANALYST_TIERS.junior.minRank);
  const tierName = (tier: AnalystTier) => t(`analyst.tier.${tier}.name`);

  if (hired) {
    return (
      <section className="flex flex-col gap-4" data-testid="analyst">
        <h2 className="font-serif text-title text-fg">{t('analyst.title')}</h2>
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-small text-fg" data-testid="analyst-status">
            {t('analyst.status', { tier: tierName(hired.tier), day: hired.paidThroughDay })}
          </p>
          <p className="text-small text-fg-muted">{t(`analyst.tier.${hired.tier}.blurb`)}</p>
          {confirm !== 'let' ? (
            <Button variant="outline" size="md" onClick={() => setConfirm('let')} testId="analyst-fire">{t('analyst.let')}</Button>
          ) : (
            <div className="flex flex-col gap-2 border-t border-ink-2 pt-3">
              <p className="text-small text-fg-muted">{t('analyst.let.note')}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" size="md" onClick={async () => { await act({ type: 'analyst.fire' }); setConfirm(null); }} testId="analyst-fire-confirm">
                  {t('analyst.let.confirm')}
                </Button>
                <Button variant="ghost" size="md" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
              </div>
            </div>
          )}
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" data-testid="analyst">
      <header className="flex flex-col gap-0.5">
        <p className="label">{t('analyst.title')}</p>
        <p className="text-small text-fg-muted">{t('analyst.sub')}</p>
      </header>
      <LastTradeSample />
      {locked && (
        <p className="rounded-md border border-ink-3 bg-ink-1 p-3 text-small text-fg-muted" data-testid="analyst-locked">
          {t('analyst.locked', {
            rank: t(`rank.${ANALYST_TIERS.junior.minRank}`),
            threshold: money(RANKS.find((r) => r.id === ANALYST_TIERS.junior.minRank)?.threshold ?? 0),
            now: money(me.netWorth.total),
          })}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('analyst.title')}>
        {TIERS.map((tier) => {
          const spec = ANALYST_TIERS[tier];
          const on = pick === tier;
          return (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`analyst-tier-${tier}`}
              onClick={() => { setPick(tier); setConfirm(null); }}
              className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${on ? 'border-brass bg-ink-2' : 'border-ink-3 bg-ink-1 hover:border-fg-faint'}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-title text-fg">{tierName(tier)}</span>
                <span className="num text-small text-fg-muted">{t('analyst.weekly', { cost: money(spec.weeklyCost) })}</span>
              </span>
              <span className="text-small text-fg-muted">{t(`analyst.tier.${tier}.blurb`)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        {confirm !== 'hire' ? (
          <Button variant="brass" size="lg" className="w-full" disabled={locked} onClick={() => setConfirm('hire')} testId="analyst-hire">
            {t('analyst.hire', { tier: tierName(pick), cost: money(ANALYST_TIERS[pick].weeklyCost) })}
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-ink-3 bg-ink-1 p-4">
            <p className="text-small text-fg-muted">{t('analyst.hire.note', { cost: money(ANALYST_TIERS[pick].weeklyCost) })}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="brass" size="md"
                onClick={async () => { await act({ type: 'analyst.hire', tier: pick }); setConfirm(null); }}
                testId="analyst-hire-confirm"
              >
                {t('analyst.hire.confirm', { tier: tierName(pick), cost: money(ANALYST_TIERS[pick].weeklyCost) })}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
