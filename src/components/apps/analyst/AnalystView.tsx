'use client';

import { useState } from 'react';
import { ANALYST_TIERS, type AnalystTier } from '@/content/learning';
import { rankIndex } from '@/content/lifestyle';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card } from '@/components/ui';

/**
 * The hired analyst (velvet-research-desk.md section 2, D-19). One at a time. The first week is paid now from cash, and a week
 * ahead after that; there is no refund. Hiring and letting go each ask for one confirm, and the confirm says what happens to the
 * money. The journal carries the breakdowns; this view is the hire, the status and the let-go.
 */

const TIERS: AnalystTier[] = ['junior', 'senior'];

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
      <header className="flex flex-col gap-1">
        <span className="label">{t('analyst.title')}</span>
        <h2 className="font-serif text-title text-fg">{t('analyst.lede')}</h2>
        <p className="text-small text-fg-faint">{t('analyst.sub')}</p>
      </header>
      {locked && (
        <p className="text-small text-fg-muted" data-testid="analyst-locked">{t('analyst.locked', { rank: t(`rank.${ANALYST_TIERS.junior.minRank}`) })}</p>
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
