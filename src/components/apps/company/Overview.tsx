'use client';

// Overview (Velvet 2): four numbers (cash, payroll runway, revenue this quarter, next close), the first goals card, the
// notices that need the founder and a team summary by role. Every number comes from the founder view; the screen only
// formats it.
import { COMPANY } from '@/content/company';
import { compactMoney, money } from '@/game/format';
import { t } from '@/i18n';
import { Stat } from '@/components/ui';
import type { CompanyFounderView } from '@/world/company/views';
import { PrivateChip, Section } from './Shared';
import { GOAL_IDS, ROLE_IDS, roleLabel, tierLabel } from './labels';

export function Overview({ co }: { co: CompanyFounderView }) {
  const runway = co.runwayDays === null ? t('company.ui.kpi.noPayroll') : t('company.ui.kpi.runwayDays', { days: Math.floor(co.runwayDays) });
  return (
    <div className="flex flex-col gap-4" data-testid="company-overview">
      <div className="flex flex-wrap items-center gap-2 text-caption text-fg-faint">
        <span className="font-serif text-hero text-fg" data-testid="company-hero-name">{co.name}</span>
        <span className="rounded-chip border border-ink-3 px-2 py-0.5">{t('company.ui.tier', { tier: tierLabel(co.tier) })}</span>
        {co.bankrupt ? <span className="text-loss">{t('company.ui.notice.bankrupt')}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 @md:grid-cols-4" data-testid="company-kpis">
        <Stat label={t('company.ui.kpi.cash')} value={money(co.cash)} testId="company-kpi-cash" />
        <Stat label={t('company.ui.kpi.runway')} value={runway} testId="company-kpi-runway" />
        <Stat label={t('company.ui.kpi.revenue')} value={compactMoney(co.quarterToDate.revenue)} testId="company-kpi-revenue" />
        <Stat label={t('company.ui.kpi.close')} value={t('company.ui.kpi.closeDay', { day: co.nextCloseDay })} testId="company-kpi-close" />
      </div>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <Section title={t('company.ui.goals.title')} testId="company-goals">
          <ul className="flex flex-col gap-2">
            {GOAL_IDS.map((id) => {
              const day = co.goalsDone[id];
              const title = id === 'firstRevenue'
                ? t('company.ui.goal.firstRevenue', { amount: money(COMPANY.goals.firstRevenue) })
                : id === 'firstRound'
                  ? t('company.ui.goal.firstRound', { amount: money(COMPANY.goals.firstRoundAmount) })
                  : t(`company.ui.goal.${id}`);
              return (
                <li key={id} className="flex items-center justify-between gap-3 border-b border-ink-2 pb-2 last:border-0" data-testid={`company-goal-${id}`}>
                  <span className="text-small text-fg">{title}</span>
                  <span className={`num text-caption ${day !== undefined ? 'text-gain' : 'text-fg-faint'}`}>
                    {day !== undefined ? t('company.ui.goals.done', { day }) : t('company.ui.goals.open')}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
        <Section title={t('company.ui.notice.title')} testId="company-notices">
          <Notices co={co} />
        </Section>
      </div>
      <Section title={t('company.ui.team.title')} chip={<PrivateChip />} testId="company-team-summary">
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-4">
          {ROLE_IDS.map((r) => (
            <div key={r} className="flex flex-col">
              <span className="text-caption text-fg-faint">{roleLabel(r)}</span>
              <span className="num text-body text-fg">{co.staff[r].heads}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );

}

function Notices({ co }: { co: CompanyFounderView }) {
  const lines: string[] = [];
  if (co.ceoChange) lines.push(t('company.ui.notice.ceo', { day: co.ceoChange.announcedDay, effective: co.ceoChange.effectiveDay }));
  if (co.ceoFreeze) lines.push(t('company.ui.notice.freeze', { day: co.ceoFreeze.untilDay }));
  if (co.exCeo) lines.push(t('company.ui.notice.exCeo', { day: co.exCeo.untilDay }));
  if (co.distress) lines.push(t('company.ui.notice.distress'));
  if (co.guarantee) lines.push(t('company.ui.notice.guarantee', { amount: money(co.guarantee.amount) }));
  if (lines.length === 0) return <p className="text-small text-fg-muted">{t('company.ui.notice.none')}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((l, i) => <li key={i} className="text-small text-fg">{l}</li>)}
    </ul>
  );
}
