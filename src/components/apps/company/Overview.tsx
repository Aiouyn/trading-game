'use client';

// Overview (Velvet 2): four numbers (cash, payroll runway, revenue this quarter, next close), the decision card (one
// quality project at three spend levels, with the odds, the gain, the runway before and after), the runway chart (as now
// against with the decision), the first-steps checklist (a guide, not a gate), the notices and the team by role. Every
// number comes from the founder view; the screen only formats it and draws the lines.
import { useState } from 'react';
import { COMPANY } from '@/content/company';
import { compactMoney, money, dec, signedMoney } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Segmented, Stat } from '@/components/ui';
import type { CompanyFounderView } from '@/world/company/views';
import type { DecisionLevel, PreviewLevel } from '@/world/company/preview';
import { PrivateChip, RefusalNote, Section } from './Shared';
import { GOAL_IDS, ROLE_IDS, ledgerLabel, roleLabel, tierLabel } from './labels';
import { refusalOf, type Refusal } from './model';

/**
 * The company's ledger for yesterday and today (R-10-7): each line with its named reason, so a first sale reads as sales and
 * the receivables it leaves behind read as their own line.
 */
function LedgerToday({ co }: { co: CompanyFounderView }) {
  return (
    <Section title={t('company.ui.ledger.title')} testId="company-ledger">
      {co.ledgerToday.length === 0 ? (
        <p className="text-caption text-fg-faint">{t('company.ui.ledger.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {co.ledgerToday.map((r, i) => (
            <li key={`${r.day}-${r.reason}-${i}`} className="flex items-baseline justify-between gap-3 text-small" data-testid="company-ledger-row">
              <span className="text-fg-muted">
                {ledgerLabel(r.reason)} <span className="text-caption text-fg-faint">{t('company.ui.ledger.day', { day: r.day })}</span>
              </span>
              <span className={`num ${r.amount < 0 ? 'text-loss' : 'text-fg'}`}>{signedMoney(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function Overview({ co }: { co: CompanyFounderView }) {
  return (
    <div className="flex flex-col gap-4" data-testid="company-overview">
      <div className="flex flex-wrap items-center gap-2 text-caption text-fg-faint">
        <span className="font-serif text-title text-fg" data-testid="company-hero-name">{co.name}</span>
        <span className="rounded-chip border border-ink-3 px-2 py-0.5">{t('company.ui.tier', { tier: tierLabel(co.tier) })}</span>
        {co.bankrupt ? <span className="text-loss">{t('company.ui.notice.bankrupt')}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 @md:grid-cols-4" data-testid="company-kpis">
        <Stat label={t('company.ui.kpi.cash')} value={money(co.cash)} testId="company-kpi-cash" />
        <Stat label={t('company.ui.kpi.runway')} value={runwayText(co.runwayDays)} testId="company-kpi-runway" />
        <Stat label={t('company.ui.kpi.revenue')} value={compactMoney(co.quarterToDate.revenue)} testId="company-kpi-revenue" />
        <Stat label={t('company.ui.kpi.close')} value={t('company.ui.kpi.closeDay', { day: co.nextCloseDay })} testId="company-kpi-close" />
      </div>
      <DecisionCard co={co} />
      <LedgerToday co={co} />
      <div className="grid gap-4 @2xl:grid-cols-2">
        <RunwayChart co={co} />
        <Checklist co={co} />
      </div>
      <Section title={t('company.ui.notice.title')} testId="company-notices">
        <Notices co={co} />
      </Section>
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

/** Payroll runway in days, or the no-payroll line when nothing is paid. */
function runwayText(days: number | null): string {
  return days === null ? t('company.ui.kpi.noPayroll') : t('company.ui.kpi.runwayDays', { days: Math.floor(days) });
}

/** The runway before and after the decision: "104 → 76 days", or the plain pair when a side has no payroll to count. */
function runwayChange(before: number | null, after: number | null): string {
  if (before === null || after === null) return t('company.ui.decision.runwayPlain', { before: runwayText(before), after: runwayText(after) });
  return t('company.ui.decision.runwayChange', { before: Math.floor(before), after: Math.floor(after) });
}

/** An odds bound as a whole percent ("64%"): the engine's band is wider than two decimals, so the screen rounds it. */
function wholePct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

const LEVEL_IDS: PreviewLevel[] = ['low', 'mid', 'high'];

/**
 * The decision card (Velvet 4 and 2, O-17): how much goes into the first product's quality project. The three levels are the
 * engine's own preview (S_ref multiples). Confirming stages the decision: it starts at the close of the day it is confirmed,
 * and it can be replaced or cancelled until then. The "was" tick marks the level whose spend is in force now.
 */
function DecisionCard({ co }: { co: CompanyFounderView }) {
  const act = useGame((s) => s.act);
  const [level, setLevel] = useState<PreviewLevel>('mid');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const card = co.decision;
  if (!card) {
    return (
      <Section title={t('company.ui.decision.title', { product: co.productsPrivate[0]?.name ?? '' })} chip={<PrivateChip />} testId="company-decision">
        <p className="text-small text-fg-muted">{t('company.ui.decision.none')}</p>
      </Section>
    );
  }
  const chosen: DecisionLevel = card.levels.find((l) => l.key === level) ?? card.levels[1]!;
  const product = co.productsPrivate.find((p) => p.id === card.productId);
  const inForce = card.spendInForce;
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId: co.id, action: { kind: 'stageProject', projectKind: 'quality', productId: card.productId, spend: chosen.spend } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };
  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId: co.id, action: { kind: 'cancelStaged' } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };
  const levelLabel = (id: PreviewLevel): string => {
    const base = t(`company.ui.decision.level.${id}`);
    const spend = card.levels.find((l) => l.key === id)?.spend;
    return inForce !== null && spend === inForce ? `${base} · ${t('company.ui.decision.wasTick')}` : base;
  };
  return (
    <Section title={t('company.ui.decision.title', { product: card.productName })} chip={<PrivateChip />} testId="company-decision">
      <div className="grid gap-4 @2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Segmented<PreviewLevel>
            label={t('company.ui.decision.level')}
            value={level}
            onChange={setLevel}
            options={LEVEL_IDS.map((id) => ({ value: id, label: levelLabel(id), testId: `company-decision-level-${id}` }))}
          />
          <p className="text-caption text-fg-muted" data-testid="company-decision-was">
            {inForce !== null ? t('company.ui.decision.was', { amount: money(inForce) }) : t('company.ui.decision.noneInForce')}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2" data-testid="company-decision-figures">
            <Figure label={t('company.ui.decision.spend')} value={money(chosen.spend)} testId="company-decision-spend" />
            <Figure label={t('company.ui.decision.odds')} value={t('company.ui.decision.oddsRange', { low: wholePct(chosen.pLow), high: wholePct(chosen.pHigh) })} testId="company-decision-odds" />
            <Figure
              label={t('company.ui.rd.gainLabel')}
              value={t('company.ui.decision.gainValues', { bear: dec(chosen.gainPoints[0], 1), base: dec(chosen.gainPoints[1], 1), bull: dec(chosen.gainPoints[2], 1) })}
              note={t('company.ui.decision.gainCaption')}
              testId="company-decision-gain"
            />
            <Figure label={t('company.ui.decision.runway')} value={runwayChange(co.runwayDays, chosen.runwayAfter)} testId="company-decision-runway" />
          </dl>
          <p className="text-caption text-fg-muted" data-testid="company-decision-clock">
            {t('company.ui.decision.clock', { days: card.days, day: card.endDay, mark: co.limits.qualityReady, score: Math.round(product?.qualityScore ?? 0) })}
          </p>
        </div>
        <div className="flex flex-col justify-between gap-3">
          <div className="flex flex-col gap-3">
            <p className="text-caption text-fg-faint">{t('company.ui.decision.note')}</p>
            <p className="text-small text-fg" data-testid="company-decision-applies">{t('company.ui.decision.appliesAtClose', { day: co.day })}</p>
            {co.staged ? (
              <div className="flex flex-col gap-2 rounded-md border border-info/40 px-3 py-2" data-testid="company-decision-staged">
                <p className="num text-small text-fg">{t('company.ui.decision.staged', { amount: money(co.staged.spend) })}</p>
                <div>
                  <Button size="sm" disabled={busy} onClick={cancel} testId="company-decision-cancel">{t('company.ui.decision.cancel')}</Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <RefusalNote refusal={refusal} />
            <div className="flex justify-end">
              <Button variant="brass" disabled={busy} onClick={confirm} testId="company-decision-confirm">{t('company.ui.decision.confirm', { day: co.day })}</Button>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Figure({ label, value, note, testId }: { label: string; value: string; note?: string; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col" data-testid={testId}>
      <dt className="text-caption text-fg-faint">{label}</dt>
      {/* a figure stays on one line (the gain is three numbers, the runway a range): the column is made wide enough for it */}
      <dd className="num whitespace-nowrap text-small text-fg">{value}</dd>
      {note ? <dd className="text-caption text-fg-faint">{note}</dd> : null}
    </div>
  );
}

/**
 * The runway chart (Velvet 2): cash over the next days with payroll only ("as now") against the same cash with the
 * chosen decision's spend. Both lines are the engine's; this only draws them to the same scale.
 */
function RunwayChart({ co }: { co: CompanyFounderView }) {
  const card = co.decision;
  const [level, setLevel] = useState<PreviewLevel>('mid');
  if (!card) {
    return (
      <Section title={t('company.ui.runway.title')} testId="company-runway-chart">
        <p className="text-small text-fg-muted">{t('company.ui.runway.none')}</p>
      </Section>
    );
  }
  const chosen = card.levels.find((l) => l.key === level) ?? card.levels[1]!;
  const now = card.cashNow;
  const withDecision = chosen.cashPath;
  const all = [...now, ...withDecision];
  const lo = Math.min(0, ...all);
  const hi = Math.max(1, ...all);
  const span = hi - lo;
  const last = now.length - 1;
  const width = 320;
  const height = 130;
  const x = (d: number): number => (d / last) * width;
  const y = (v: number): number => height - ((v - lo) / span) * height;
  const line = (xs: number[]): string => xs.map((v, d) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <Section title={t('company.ui.runway.title')} testId="company-runway-chart">
      <p className="text-caption text-fg-faint">{t('company.ui.runway.note', { days: last })}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-auto w-full" role="img" aria-label={t('company.ui.runway.aria')} data-testid="company-runway-svg">
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} className="stroke-ink-3" strokeWidth={1} />
        <polyline points={line(now)} fill="none" className="stroke-fg-faint" strokeWidth={2} strokeDasharray="4 3" data-testid="company-runway-now" />
        <polyline points={line(withDecision)} fill="none" className="stroke-info" strokeWidth={2} data-testid="company-runway-decision" />
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-fg-muted">{t('company.ui.runway.legend', { now: money(now[last] ?? 0), decision: money(withDecision[last] ?? 0) })}</span>
        <Segmented<PreviewLevel>
          label={t('company.ui.decision.level')}
          value={level}
          onChange={setLevel}
          options={LEVEL_IDS.map((id) => ({ value: id, label: t(`company.ui.decision.level.${id}`), testId: `company-runway-level-${id}` }))}
        />
      </div>
    </Section>
  );
}

/** The first-steps checklist (Velvet 2): five steps, a guide and not a gate. It folds to one line once all are done. */
function Checklist({ co }: { co: CompanyFounderView }) {
  const steps = [
    { id: 'found', title: t('company.ui.step.found'), done: true, day: undefined as number | undefined },
    ...GOAL_IDS.map((id) => {
      const day = co.goalsDone[id];
      const title = id === 'firstRevenue'
        ? t('company.ui.goal.firstRevenue', { amount: money(COMPANY.goals.firstRevenue) })
        : id === 'firstRound'
          ? t('company.ui.goal.firstRound', { amount: money(COMPANY.goals.firstRoundAmount) })
          : t(`company.ui.goal.${id}`);
      return { id, title, done: day !== undefined, day };
    }),
  ];
  const allDone = steps.every((s) => s.done);
  return (
    <Section title={t('company.ui.goals.title')} testId="company-checklist">
      {allDone ? (
        <p className="text-small text-fg-muted" data-testid="company-goals-done">{t('company.ui.goals.allDone')}</p>
      ) : (
        <>
          <p className="mb-2 text-caption text-fg-faint">{t('company.ui.goals.note')}</p>
          <ol className="flex flex-col gap-2" data-testid="company-goals">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-ink-2 pb-2 last:border-0" data-testid={`company-goal-${s.id}`}>
                <span className="text-small text-fg">{t('company.ui.goals.step', { n: i + 1 })} · {s.title}</span>
                <span className={`num text-caption ${s.done ? 'text-gain' : 'text-fg-faint'}`}>
                  {s.day !== undefined ? t('company.ui.goals.done', { day: s.day }) : s.done ? t('company.ui.goals.doneNow') : t('company.ui.goals.open')}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Section>
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
