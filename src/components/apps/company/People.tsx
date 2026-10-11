'use client';

// People (Velvet 5 and C4): headcount by role with the caps, the G&A span line, hiring and letting go, and the four
// executive seats with their trait, salary, term and severance. Hires take 3 game days to fill; the engine refuses a hire
// the cash cannot cover. A firing of an executive names its severance and asks for a second click.
import { useState } from 'react';
import { COMPANY } from '@/content/company';
import { money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, ConfirmButton, NumberField, Select, Td, Th } from '@/components/ui';
import type { CompanyFounderView } from '@/world/company/views';
import type { ExecutiveView } from '@/world/company/operations';
import type { CompanyRole } from '@/content/company';
import type { ExecRole, ExecTrait, Holder } from '@/world/company/types';
import { PrivateChip, RefusalNote, Section } from './Shared';
import { numberOrNull, refusalOf, type Refusal } from './model';
import { EXEC_IDS, ROLE_IDS, TRAIT_IDS, execLabel, roleLabel, traitLabel } from './labels';

export function People({ co }: { co: CompanyFounderView }) {
  return (
    <div className="flex flex-col gap-4" data-testid="company-people">
      <Staff co={co} />
      <Executives co={co} />
      <CeoChange co={co} />
    </div>
  );
}

function Staff({ co }: { co: CompanyFounderView }) {
  const act = useGame((s) => s.act);
  const [role, setRole] = useState<CompanyRole>('ops');
  const [count, setCount] = useState('1');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const n = numberOrNull(count);
  const submit = async (kind: 'hire' | 'fire') => {
    if (n === null || busy) return;
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId: co.id, action: { kind, role, n: Math.trunc(n) } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };
  const span = co.gaSpan;
  return (
    <Section
      title={t('company.ui.team.title')}
      chip={<PrivateChip />}
      testId="company-staff"
    >
      <p className="mb-2 text-caption text-fg-faint" data-testid="company-headcount-cap">
        {co.limits.headcountCap === null ? t('company.ui.team.noCap') : t('company.ui.team.cap', { cap: co.limits.headcountCap })}
        {' · '}
        {t('company.ui.team.count')} <span className="num">{co.heads}</span>
      </p>
      <p className="mb-3 text-caption text-fg-muted" data-testid="company-ga-span">
        {t('company.ui.ga.line', { span: span.span, gaHeads: span.gaHeads, others: span.others, needed: span.needed })}
        {' '}
        {span.factor < 1
          ? t('company.ui.ga.short', { factor: pct(span.factor) })
          : t('company.ui.ga.covered')}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left">
          <thead>
            <tr>
              <Th>{t('company.ui.team.title')}</Th>
              <Th right>{t('company.ui.team.heads')}</Th>
              <Th right>{t('company.ui.team.productive')}</Th>
              <Th right>{t('company.ui.team.wage')}</Th>
            </tr>
          </thead>
          <tbody>
            {ROLE_IDS.map((r) => (
              <tr key={r} className="border-t border-ink-2" data-testid={`company-staff-${r}`}>
                <Td>{roleLabel(r)}</Td>
                <Td right num>{co.staff[r].heads}</Td>
                <Td right num>{co.staff[r].productive}</Td>
                <Td right num>{money(co.staff[r].wagePerDay)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 @md:grid-cols-[1fr_auto_auto_auto] @md:items-end">
        <Select<CompanyRole>
          value={role}
          onChange={setRole}
          label={t('company.ui.team.title')}
          testId="company-staff-role"
          className="h-11 w-full"
          options={ROLE_IDS.map((id) => ({ value: id, label: roleLabel(id) }))}
        />
        <NumberField value={count} onChange={setCount} min={1} step={1} testId="company-staff-count" label={t('company.ui.team.count')} className="h-11" />
        <Button variant="brass" disabled={busy || n === null || n < 1} onClick={() => submit('hire')} testId="company-hire">{t('company.ui.team.hire')}</Button>
        <Button disabled={busy || n === null || n < 1} onClick={() => submit('fire')} testId="company-fire">{t('company.ui.team.fire')}</Button>
      </div>
      <div className="mt-3"><RefusalNote refusal={refusal} /></div>
    </Section>
  );
}

function Executives({ co }: { co: CompanyFounderView }) {
  return (
    <Section title={t('company.ui.exec.title')} testId="company-execs">
      <ul className="flex flex-col gap-3">
        {EXEC_IDS.map((role) => (
          <ExecSeat key={role} role={role} exec={co.execs[role]} companyId={co.id} />
        ))}
      </ul>
    </Section>
  );
}

function ExecSeat({ role, exec, companyId }: { role: ExecRole; exec: ExecutiveView | null; companyId: string }) {
  const act = useGame((s) => s.act);
  const playerId = useGame((s) => s.me?.player.id ?? '');
  const [trait, setTrait] = useState<ExecTrait>('Operator');
  const [who, setWho] = useState<'you' | 'npc'>('you');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const appoint = async () => {
    setBusy(true);
    const holder: Holder = who === 'you' ? { kind: 'player', playerId } : { kind: 'npc' };
    const ack = await act({ type: 'company.act', companyId, action: { kind: 'hireExec', role, trait, holder } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };
  const remove = async () => {
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId, action: { kind: 'fireExec', role } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };
  return (
    <li className="rounded-md border border-ink-3 p-3" data-testid={`company-exec-${role}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-small font-medium text-fg">{execLabel(role)}</span>
        {exec ? (
          <span className="text-caption text-fg-muted">
            {traitLabel(exec.trait)} · {t('company.ui.exec.salary', { amount: money(exec.salary) })} · {t('company.ui.exec.term', { day: exec.termEnd })}
          </span>
        ) : (
          <span className="text-caption text-fg-faint">{t('company.ui.exec.vacant')}</span>
        )}
      </div>
      {exec ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-caption text-fg-faint" data-testid={`company-exec-severance-${role}`}>
            {t('company.ui.exec.severance', { amount: money(exec.severance), day: exec.termEnd })}
          </p>
          <div>
            <ConfirmButton
              size="sm"
              disabled={busy}
              confirm={t('company.ui.exec.fireConfirm', { amount: money(exec.severance) })}
              onConfirm={remove}
              testId={`company-exec-fire-${role}`}
            >
              {t('company.ui.exec.fire')}
            </ConfirmButton>
          </div>
        </div>
      ) : (
        <div className="mt-2 grid gap-2 @md:grid-cols-[1fr_1fr_auto] @md:items-end">
          <Select<ExecTrait>
            value={trait}
            onChange={setTrait}
            label={t('company.ui.exec.trait')}
            testId={`company-exec-trait-${role}`}
            className="h-10 w-full"
            options={TRAIT_IDS.map((id) => ({ value: id, label: traitLabel(id) }))}
          />
          <Select<'you' | 'npc'>
            value={who}
            onChange={setWho}
            label={t('company.ui.exec.holder')}
            testId={`company-exec-holder-${role}`}
            className="h-10 w-full"
            options={[{ value: 'you', label: t('company.ui.exec.holderYou') }, { value: 'npc', label: t('company.ui.exec.holderNpc') }]}
          />
          <Button size="sm" disabled={busy} onClick={appoint} testId={`company-exec-hire-${role}`}>{t('company.ui.exec.hire')}</Button>
        </div>
      )}
      <p className="mt-2 text-caption text-fg-faint">{t('company.ui.exec.traitHint', { size: Math.round(Math.abs(COMPANY.governance.exec.traits[trait].size) * 100) })}</p>
      <div className="mt-2"><RefusalNote refusal={refusal} /></div>
    </li>
  );
}

/**
 * The CEO change (O-16, spec 9.1): the founder announces an outside successor. The days are shown before the founder
 * confirms: the notice (the change takes effect ten game days after the announcement), the freeze of the departing CEO's
 * accounts (to the end of the exit freeze), and the ex-CEO's cooling (252 game days from the effective day). A second change
 * while one is announced, and an ex-CEO still cooling, are refused inline.
 */
function CeoChange({ co }: { co: CompanyFounderView }) {
  const act = useGame((s) => s.act);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const plan = co.ceoPlan;
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId: co.id, action: { kind: 'changeCEO', successor: { kind: 'npc' } } }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };
  const holder = plan.ceoHolder === 'npc'
    ? t('company.ui.ceo.holder.npc')
    : plan.ceoHolder === 'player' ? t('company.ui.ceo.holder.player') : t('company.ui.ceo.holder.founder');
  const pending = co.ceoPending;
  if (pending) {
    // an announced change: its recorded days, the seat that stays filled until the effective day, and no second change
    const successor = pending.successor === 'player' ? t('company.ui.ceo.holder.player') : t('company.ui.ceo.holder.npc');
    return (
      <Section title={t('company.ui.ceo.title')} testId="company-ceo">
        <p className="text-small text-fg" data-testid="company-ceo-now">{t('company.ui.ceo.now', { holder })}</p>
        <p className="mt-3 text-small text-fg" data-testid="company-ceo-pending">{t('company.ui.ceo.pending', { effective: pending.effectiveDay })}</p>
        <ul className="mt-2 flex flex-col gap-2 text-caption text-fg-muted" data-testid="company-ceo-plan">
          <li data-testid="company-ceo-announce">{t('company.ui.ceo.announced', { day: pending.announcedDay, effective: pending.effectiveDay })}</li>
          <li data-testid="company-ceo-successor">{t('company.ui.ceo.successorIs', { successor })}</li>
          <li data-testid="company-ceo-freeze">{t('company.ui.ceo.freeze', { day: pending.announcedDay, until: pending.freezeUntil })}</li>
          <li data-testid="company-ceo-cooling">{t('company.ui.ceo.cooling', { days: plan.cooldownDays, until: pending.cooldownUntil })}</li>
        </ul>
        <p className="mt-3 text-caption text-fg-faint" data-testid="company-ceo-pending-note">{t('company.ui.ceo.pendingNote')}</p>
      </Section>
    );
  }
  return (
    <Section title={t('company.ui.ceo.title')} testId="company-ceo">
      <p className="text-small text-fg" data-testid="company-ceo-now">{t('company.ui.ceo.now', { holder })}</p>
      <ul className="mt-3 flex flex-col gap-2 text-caption text-fg-muted" data-testid="company-ceo-plan">
        <li data-testid="company-ceo-announce">{t('company.ui.ceo.announce', { day: plan.announcedDay, effective: plan.effectiveDay })}</li>
        <li data-testid="company-ceo-freeze">{t('company.ui.ceo.freeze', { day: plan.announcedDay, until: plan.freezeUntil })}</li>
        <li data-testid="company-ceo-cooling">{t('company.ui.ceo.cooling', { days: plan.cooldownDays, until: plan.cooldownUntil })}</li>
      </ul>
      <p className="mt-3 text-caption text-fg-faint">{t('company.ui.ceo.successor')}</p>
      <div className="mt-3 flex flex-col gap-2">
        <RefusalNote refusal={refusal} />
        <div className="flex justify-end">
          <ConfirmButton size="sm" disabled={busy} confirm={t('company.ui.ceo.confirm', { effective: plan.effectiveDay })} onConfirm={submit} testId="company-ceo-submit">
            {t('company.ui.ceo.submit')}
          </ConfirmButton>
        </div>
      </div>
    </Section>
  );
}
