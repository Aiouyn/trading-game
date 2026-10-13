'use client';

// The money cards: debt and covenants (the loan with its personal guarantee shown consequence-first), dividends (four rules and the
// distress flag), the takeover stance (the tender floor and antitrust), and the failure record with the clawback box.
import { useState } from 'react';
import { t } from '@/i18n';
import { money, pct, qty, price, dec } from '@/game/format';
import { NumberField, Segmented, SpendReview } from '@/components/ui';
import type { CapitalView } from '@/world/company/capital';
import { HoldButton, Line, Note, Panel, RefusalBox, numOf, useAct, type Refusal } from './shared';

const ratio = (x: number | null) => (x === null ? '—' : `${dec(x, 2)}×`);

export function DebtPanel({ cap }: { cap: CapitalView }) {
  const d = cap.debt;
  const act = useAct();
  const repay = useAct();
  const [amount, setAmount] = useState('');
  const [option, setOption] = useState<'without' | 'with'>('without');
  const [ack, setAck] = useState(false);
  const n = numOf(amount);
  const guaranteed = option === 'with';
  const amountValid = Number.isFinite(n) && n > 0;
  const drawable = d.refusal === null && amountValid;
  return (
    <Panel testId="company-debt" title={t('company.capital.debt.title')} sub={t('company.capital.debt.sub')} chip="private">
      <Line k={t('company.capital.debt.covenant')} v={t(`company.capital.covenant.${d.covenant}`)} testId="company-covenant" />
      <Line k={t('company.capital.debt.leverage')} v={t('company.capital.debt.meter', { value: ratio(d.leverage), limit: ratio(d.maxLeverage) })} testId="company-covenant-leverage" />
      <Line k={t('company.capital.debt.cover')} v={t('company.capital.debt.meterMin', { value: ratio(d.cover), limit: ratio(d.minCover) })} testId="company-covenant-cover" />
      {d.covenant === 'cure' && d.cureUntilDay !== null && (
        <Note testId="company-covenant-cure">{t('company.capital.debt.cure', { day: d.cureUntilDay, days: d.cureDays })}</Note>
      )}
      <Line k={t('company.capital.debt.total')} v={money(d.total)} />
      {d.loans.map((l) => (
        <div key={l.id} className="flex flex-col gap-1 border-t border-ink-2 pt-2 text-small" data-testid="company-loan">
          <Line k={t('company.capital.debt.loan', { day: l.drawnDay })} v={money(l.principal)} />
          <Line k={t('company.capital.debt.rate')} v={t('company.capital.debt.perDay', { rate: dec(l.ratePerDay * 100, 4) })} />
          {l.guaranteed && <Note testId="company-loan-guaranteed">{t('company.capital.debt.guaranteedBy', { amount: money(l.guaranteedAmount) })}</Note>}
          <div>
            <SpendReview
              size="sm"
              testId="company-loan-repay"
              label={t('company.capital.debt.repay')}
              title={t('company.capital.debt.repay')}
              rows={[{ label: t('commit.amount'), value: money(l.principal) }]}
              disabled={repay.busy}
              onConfirm={() => repay.run({ type: 'company.repay', companyId: cap.companyId, debtId: l.id, amount: l.principal }, t('company.capital.debt.repaid'))}
            />
          </div>
        </div>
      ))}
      {repay.refusal && <RefusalBox refusal={repay.refusal} testId="company-loan-error" />}

      <div className="flex flex-col gap-3 border-t border-ink-2 pt-3" data-testid="company-borrow">
        <p className="text-small font-medium text-fg">{t('company.capital.debt.borrow')}</p>
        {d.refusal && <RefusalBox refusal={d.refusal as Refusal} testId="company-borrow-refusal" />}
        <NumberField value={amount} onChange={setAmount} label={t('company.capital.debt.amount')} suffix="$" min={0} step={1000} testId="company-loan-amount" />
        {guaranteed && amountValid && (
          <div className="flex flex-col gap-1 rounded-md border border-warn/50 px-3 py-2 text-small" data-testid="company-guarantee-amount">
            <p className="text-fg">{t('company.capital.debt.consequence', { company: cap.name, amount: money(n) })}</p>
            <p className="text-fg-muted">{t('company.capital.debt.consequenceMove')}</p>
          </div>
        )}
        {guaranteed && !amountValid && (
          <div className="rounded-md border border-ink-3 px-3 py-2 text-small" data-testid="company-guarantee-ask">
            <p className="text-fg-muted">{t('company.capital.debt.consequenceAsk', { company: cap.name })}</p>
          </div>
        )}
        {!guaranteed && (
          <div className="flex flex-col gap-1 rounded-md border border-ink-3 px-3 py-2 text-small" data-testid="company-no-guarantee">
            <p className="text-fg">{t('company.capital.debt.consequenceNone', { company: cap.name })}</p>
          </div>
        )}
        <Segmented<'without' | 'with'>
          label={t('company.capital.debt.option')}
          size="md"
          value={option}
          onChange={setOption}
          options={[
            { value: 'without', label: t('company.capital.debt.without'), testId: 'company-guarantee-without' },
            { value: 'with', label: t('company.capital.debt.with'), testId: 'company-guarantee-with' },
          ]}
        />
        <p className="text-caption text-fg-muted" data-testid="company-guarantee-rate">
          {guaranteed
            ? t('company.capital.debt.rateWith', { rate: dec(d.guaranteedRatePerDay * 100, 4) })
            : t('company.capital.debt.rateWithout', { rate: dec(d.ratePerDay * 100, 4) })}
        </p>
        <label className="flex items-start gap-2 text-small text-fg-muted">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            data-testid="company-guarantee-ack"
            className="mt-0.5 accent-brass"
          />
          <span>{guaranteed ? t('company.capital.debt.ackWith') : t('company.capital.debt.ack')}</span>
        </label>
        <HoldButton
          testId="company-guarantee-sign"
          label={t('company.capital.debt.sign')}
          hint={t('company.capital.debt.backFree')}
          disabled={!drawable || !ack || act.busy}
          onHold={() => { void act.run({ type: 'company.loan', companyId: cap.companyId, amount: n, guarantee: guaranteed, acknowledged: ack }, t('company.capital.debt.signed')); }}
        />
        {act.refusal && <RefusalBox refusal={act.refusal} testId="company-loan-refusal" />}
      </div>
    </Panel>
  );
}

export function DividendPanel({ cap }: { cap: CapitalView }) {
  const dv = cap.dividends;
  const act = useAct();
  const [perShare, setPerShare] = useState('');
  const v = numOf(perShare);
  const amountOk = Number.isFinite(v) && v > 0;
  // the world's ceiling: the amount may not pass it (the engine still refuses at the boundary)
  const overCeiling = amountOk && v > dv.maxPerShare;
  return (
    <Panel testId="company-dividends" title={t('company.capital.div.title')} sub={t('company.capital.div.sub')} chip="public">
      <ul className="flex flex-col gap-1 text-small" data-testid="company-div-rules">
        {dv.checks.map((c) => (
          <li key={c.rule} className="flex items-center justify-between gap-3" data-testid={`company-div-rule-${c.rule}`}>
            <span className="text-fg-muted">{t(`company.capital.div.rule.${c.rule}`)}</span>
            <span className={c.ok ? 'text-gain' : 'text-warn'}>
              {t(c.ok ? 'company.capital.div.ok' : 'company.capital.div.no')}
              {c.ok && c.maxPerShare !== null && (
                <span className="ml-2 text-fg-faint" data-testid={`company-div-max-${c.rule}`}>{t('company.capital.div.upTo', { max: price(c.maxPerShare) })}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Line k={t('company.capital.div.retained')} v={money(dv.retainedEarnings)} />
      <Line k={t('company.capital.div.cashNeeded')} v={money(dv.cashCoverNeeded)} />
      <Line k={t('company.capital.div.fcf')} v={money(dv.fcfTtm)} />
      <Line k={t('company.capital.div.maxLabel')} v={dv.maxPerShare > 0 ? price(dv.maxPerShare) : t('company.capital.div.closed')} testId="company-div-max" />
      {dv.distress && <Note testId="company-div-distress">{t('company.capital.div.distress')}</Note>}
      <NumberField value={perShare} onChange={setPerShare} label={t('company.capital.div.perShare')} suffix="$" min={0} step="any" testId="company-div-amount" />
      {overCeiling && <Note testId="company-div-over">{t('company.capital.div.over', { max: price(dv.maxPerShare) })}</Note>}
      <SpendReview
        variant="brass"
        testId="company-div-declare"
        label={t('company.capital.div.declare')}
        title={t('company.capital.div.declare')}
        rows={[{ label: t('company.capital.div.perShare'), value: price(amountOk ? v : 0) }]}
        disabled={!amountOk || overCeiling || dv.maxPerShare <= 0 || act.busy}
        onConfirm={() => act.run({ type: 'company.dividend', companyId: cap.companyId, perShare: v }, t('company.capital.div.declared'))}
      />
      {act.refusal && <RefusalBox refusal={act.refusal} testId="company-div-refusal" />}
    </Panel>
  );
}

export function TakeoverPanel({ cap }: { cap: CapitalView }) {
  const tk = cap.takeover;
  const act = useAct();
  return (
    <Panel testId="company-takeover" title={t('company.capital.take.title')} sub={t('company.capital.take.sub')} chip="private">
      {/* an unanswered stance is shown as neither option (no default is recorded as a refusal) */}
      <Segmented<'yes' | 'no' | 'unset'>
        label={t('company.capital.take.stance')}
        value={tk.stance ?? 'unset'}
        onChange={(v) => { if (v !== 'unset') void act.run({ type: 'company.act', companyId: cap.companyId, action: { kind: 'takeoverStance', stance: v } }, t('company.capital.take.saved')); }}
        options={[
          { value: 'no', label: t('company.capital.take.no'), testId: 'company-stance-no' },
          { value: 'yes', label: t('company.capital.take.yes'), testId: 'company-stance-yes' },
        ]}
      />
      {tk.stance === null && <Note testId="company-stance-unset">{t('company.capital.take.unset')}</Note>}
      <Line k={t('company.capital.take.floor')} v={tk.floor === null ? t('company.capital.take.noVolume') : price(tk.floor)} testId="company-take-floor" />
      <Line k={t('company.capital.take.share')} v={pct(tk.share)} testId="company-take-share" />
      <div className="flex flex-col gap-1 rounded-md border border-ink-3 px-3 py-2 text-small" data-testid="company-take-board">
        <p className="text-fg-muted">{t('company.capital.take.boardHead')}</p>
        {tk.board === null ? (
          <p className="text-fg-faint">{t('company.capital.take.boardNone')}</p>
        ) : (
          <>
            <Line k={t('company.capital.take.boardYes')} v={qty(tk.board.yes)} testId="company-take-yes" />
            <Line k={t('company.capital.take.boardNo')} v={qty(tk.board.no)} testId="company-take-no" />
            <p className={tk.board.passed ? 'text-gain' : 'text-warn'} data-testid="company-take-board-result">
              {t(tk.board.passed ? 'company.capital.take.boardPass' : 'company.capital.take.boardFail')}
            </p>
          </>
        )}
        {tk.fairPerShare !== null && <Note testId="company-take-npc">{t('company.capital.take.npcRule', { fair: price(tk.fairPerShare) })}</Note>}
        <Note>{t('company.capital.take.boardVotes', { founder: qty(cap.voting.founderShares) })}</Note>
      </div>
      <Note>{t('company.capital.take.antitrust', { limit: Math.round(tk.antitrustLimit * 100) })}</Note>
      <Note>{t('company.capital.take.rule')}</Note>
      {act.refusal && <RefusalBox refusal={act.refusal} testId="company-take-error" />}
    </Panel>
  );
}

/** The clawback box (Velvet 8.1, Quant 5.3): plain text, no icon, the exact terms behind a Details expander. */
export function ClawbackBox({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-3 px-3 py-2 text-small" data-testid="clawback-warning">
      <p className="text-fg-muted">{t('company.capital.claw.box', { company: name })}</p>
      <details data-testid="clawback-details">
        <summary className="cursor-pointer text-caption text-fg-muted">{t('company.capital.claw.details')}</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
          <li>{t('company.capital.claw.rule.lookback')}</li>
          <li>{t('company.capital.claw.rule.covered')}</li>
          <li>{t('company.capital.claw.rule.safe')}</li>
          <li>{t('company.capital.claw.rule.early')}</li>
          <li>{t('company.capital.claw.rule.insider')}</li>
          <li>{t('company.capital.claw.rule.locked')}</li>
        </ul>
      </details>
    </div>
  );
}

export function FailurePanel({ cap }: { cap: CapitalView }) {
  const f = cap.failure;
  const bk = f.bankrupt;
  return (
    <Panel testId="company-failure" title={t('company.capital.fail.title')} sub={t('company.capital.fail.sub')} chip="private">
      <ClawbackBox name={cap.name} />
      <Line k={t('company.capital.fail.insolvent')} v={t('company.capital.fail.days', { days: f.insolventDays })} testId="company-insolvent-days" />
      {f.distressPublic && <Note testId="company-distress-flag">{t('company.capital.fail.distressFlag')}</Note>}
      {bk && (
        <div className="flex flex-col gap-1 rounded-md border border-warn/50 px-3 py-2 text-small" data-testid="company-bankrupt">
          <p className="text-fg">{t('company.capital.fail.bankrupt', { day: bk.day })}</p>
          <Line k={t('company.capital.fail.recovery')} v={pct(bk.recovery)} />
          <Line k={t('company.capital.fail.paid')} v={money(bk.paid)} />
          <Line k={t('company.capital.fail.shortfall')} v={money(bk.shortfall)} />
          <Line k={t('company.capital.fail.clawed')} v={money(bk.clawed)} />
        </div>
      )}
      <div className="flex flex-col gap-1 text-small" data-testid="company-guarantee-outcome">
        {f.guaranteeExposure > 0 ? (
          <p className="text-fg-muted">{bk ? t('company.capital.fail.guaranteeCalled', { amount: money(f.guaranteeExposure) }) : t('company.capital.fail.guaranteeOn', { amount: money(f.guaranteeExposure) })}</p>
        ) : (
          <p className="text-fg-muted">{t('company.capital.fail.guaranteeNone')}</p>
        )}
        {f.personalDebt > 0 && <Line k={t('company.capital.fail.personalDebt')} v={money(f.personalDebt)} testId="company-personal-debt" />}
      </div>
      {f.payouts.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="company-payouts">
          <p className="text-caption text-fg-faint">{t('company.capital.fail.payouts', { days: qty(f.lookbackDays) })}</p>
          {f.payouts.map((p) => (
            <Line
              key={p.id}
              k={`${t('company.capital.day', { day: p.day })} · ${t(`company.capital.payout.${p.kind}`)}${p.insider ? ` · ${t('company.capital.fail.insider')}` : ''}`}
              v={money(p.amount)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
