'use client';

// The daily streak (6D.3): one claim a real day, after a login and one action. Rewards are fixed; nothing here nags.
import { useState } from 'react';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t, hasKey } from '@/i18n';
import { Button, Card, CardHeader, Chip } from '@/components/ui';
import { refusalVars, sixdRefusal, type SixdRefusal } from './copy';

export function StreakCard() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [refusal, setRefusal] = useState<SixdRefusal | null>(null);
  const s = me.sixd?.streak;
  if (!s) return null;
  const claim = async () => {
    const r = await act({ type: 'streak.claim' }, { silent: true });
    if (r.ok) setRefusal(null);
    else setRefusal(sixdRefusal(r.error ?? 'unknown', refusalVars(r.data)));
  };
  const blockCopy = s.block && !s.canClaim ? sixdRefusal(s.block) : null;
  return (
    <Card data-testid="streak-card">
      <CardHeader
        title={t('sixd.streak.title')}
        right={<Chip><span data-testid="streak-count">{t('sixd.streak.days', { days: s.count })}</span></Chip>}
        sub={t('sixd.streak.intro')}
      />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="num grid grid-cols-2 gap-x-6 gap-y-1 text-caption text-fg-muted">
          <span>{t('sixd.streak.today')}</span><span className="text-right text-fg" data-testid="streak-today">{money(s.cashToday)}</span>
          <span>{t('sixd.streak.next')}</span><span className="text-right text-fg">{s.nextMilestone !== null ? t('sixd.streak.nextDays', { days: s.nextMilestone }) : t('sixd.streak.done')}</span>
          <span>{t('sixd.streak.rest')}</span><span className="text-right text-fg">{s.restAvailable ? t('sixd.streak.restYes') : t('sixd.streak.restNo')}</span>
        </div>
        {(s.badges.length > 0 || s.titles.length > 0 || s.accents.length > 0) && (
          <div className="flex flex-wrap gap-2 text-caption" data-testid="streak-rewards">
            {s.badges.map((b) => <Chip key={b}>{hasKey(`sixd.streak.badge.${b}`) ? t(`sixd.streak.badge.${b}`) : b}</Chip>)}
            {s.titles.map((x) => <Chip key={x} className="border-brass/50 text-brass-hi">{hasKey(`sixd.streak.title.${x}`) ? t(`sixd.streak.title.${x}`) : x}</Chip>)}
            {s.accents.map((a) => <Chip key={a}>{hasKey(`sixd.accent.${a}`) ? t(`sixd.accent.${a}`) : a}</Chip>)}
          </div>
        )}
        {blockCopy && !refusal && (
          <p className="text-caption text-fg-muted" data-testid="streak-block">{blockCopy.what} {blockCopy.do}</p>
        )}
        {refusal && (
          <div role="alert" className="rounded-chip border border-loss/40 p-3 text-caption" data-testid="streak-refusal">
            <p className="font-semibold text-fg">{refusal.what}</p>
            <p className="text-fg-muted">{refusal.why}</p>
            <p className="text-fg-muted">{refusal.do}</p>
          </div>
        )}
        <div>
          <Button variant="brass" disabled={!s.canClaim} onClick={claim} testId="streak-claim">{t('sixd.streak.claim')}</Button>
        </div>
      </div>
    </Card>
  );
}
