'use client';

// Player-run funds: the public face of every open fund (name, mandate, fees, NAV history, AUM bucket, filings) and, for the
// selected one, the viewer's own invest and redeem forms. The investor list and other holders' units are never shown.
import { useState } from 'react';
import { useGame } from '@/game/store';
import { money, pct, qty } from '@/game/format';
import { t } from '@/i18n';
import { ticksLabel, Button, Card, Chip, EmptyNext, NumberField, Sparkline } from '@/components/ui';
import { FUND_RULES } from '@/content/funds';
import type { ExchangeFund, ExchangeView, FundHolding, FundRules } from '@/world/exchange/view';
import { Fact, PublicChip, RefusalBox, Section } from './Shared';
import { type RefusalCopy, aumBucketKey, classKey, refusalCopy, rejectVars, statusKey, unitNav } from './copy';

export function FundsTab({ x, selected, onSelect, onOpenManage }: {
  x: ExchangeView;
  selected: string | null;
  onSelect: (id: string) => void;
  onOpenManage: () => void;
}) {
  if (x.funds.length === 0) {
    return (
      <EmptyNext testId="exchange-funds-empty" title={t('exchange.empty.funds')} body={t('exchange.empty.funds.body')}
        cta={<Button variant="outline" onClick={onOpenManage} testId="exchange-funds-open-manage">{t('exchange.tab.manage')}</Button>} />
    );
  }
  const current = x.funds.find((f) => f.id === selected) ?? x.funds[0]!;
  const holding = x.holdings.find((h) => h.fundId === current.id) ?? null;
  return (
    <div className="flex flex-col gap-4" data-testid="exchange-funds">
      <div className="grid gap-3 @2xl:grid-cols-2 [&>*]:min-w-0">
        {x.funds.map((f) => (
          <FundCard key={f.id} f={f} active={f.id === current.id} onSelect={() => onSelect(f.id)} />
        ))}
      </div>
      <FundDetail f={current} holding={holding} rules={x.rules} />
    </div>
  );
}

function FundCard({ f, active, onSelect }: { f: ExchangeFund; active: boolean; onSelect: () => void }) {
  const bucket = aumBucketKey(f.aumBucket, FUND_RULES.aumBuckets);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`exchange-fund-card-${f.id}`}
      className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${active ? 'border-brass/60 bg-ink-1' : 'border-ink-3 bg-ink-1 hover:border-fg-faint'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-title text-fg" data-testid={`exchange-fund-name-${f.id}`}>{f.name}</h2>
          <p className="text-caption text-fg-muted">{t('exchange.fund.manager', { handle: f.managerHandle })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>{t(statusKey(f.status))}</Chip>
          {f.convicted && <Chip>{t('exchange.fund.convicted')}</Chip>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Fact label={t('exchange.fund.nav')} value={unitNav(f.navPerUnit)} testId={`exchange-fund-nav-${f.id}`} />
        <Fact prose label={t('exchange.fund.aum', { bucket: t(bucket.key, bucket.vars) })} value={t(bucket.key, bucket.vars)} />
      </div>
      <Sparkline data={f.navHistory.map((h) => h.navPerUnit)} width={240} height={28} className="w-full" />
      <p className="text-caption text-fg-faint">{t('exchange.fund.fees', { mgmt: pct(f.fees.mgmt), perf: pct(f.fees.perf) })}</p>
      <p className="text-caption text-fg-faint">
        {t('exchange.fund.mandate', {
          classes: f.mandate.classes.map((c) => t(classKey(c))).join(', '),
          lev: f.mandate.maxLeverage,
          pos: pct(f.mandate.maxPositionPct),
        })}
      </p>
    </button>
  );
}

function FundDetail({ f, holding, rules }: { f: ExchangeFund; holding: FundHolding | null; rules: FundRules }) {
  return (
    <div className="grid gap-4 @3xl:grid-cols-2 [&>*]:min-w-0" data-testid="exchange-fund-detail">
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-serif text-title text-fg">{f.name}</h2>
        <FundNotices f={f} holding={holding} />
        <Section title={t('exchange.fund.history')} public testId="exchange-fund-history">
          <Sparkline data={f.navHistory.map((h) => h.navPerUnit)} width={320} height={48} className="w-full" />
        </Section>
        <Section title={t('exchange.fund.filings')} public testId="exchange-fund-filings">
          {f.filings.length === 0 && <p className="text-small text-fg-faint">{t('exchange.fund.filingNone')}</p>}
          {f.filings.map((x) => (
            <p key={`${x.assetId}-${x.tick}`} className="num text-small text-fg" data-testid="exchange-fund-filing-row">
              {t('exchange.fund.filingRow', { asset: x.assetId, pct: pct(x.pct), day: x.day })}
            </p>
          ))}
        </Section>
        <p className="text-caption text-fg-faint">{t('exchange.fund.youngCap', { days: rules.youngFundRealDays })}</p>
      </Card>
      <div className="flex flex-col gap-4">
        <InvestForm f={f} rules={rules} holding={holding} />
        <RedeemForm f={f} rules={rules} holding={holding} />
      </div>
    </div>
  );
}

/** The notices an investor needs before acting: the fund's state, a case, and their own position and limit. */
function FundNotices({ f, holding }: { f: ExchangeFund; holding: FundHolding | null }) {
  return (
    <div className="flex flex-col gap-1.5 text-small" data-testid="exchange-fund-notices">
      {f.status === 'frozen' && <p className="text-warn" data-testid="exchange-notice-frozen">{t('exchange.fund.notice.frozenInv')}</p>}
      {f.status === 'winding' && <p className="text-fg-muted" data-testid="exchange-notice-winding">{t('exchange.fund.notice.winding')}</p>}
      {f.pendingMandate && <p className="text-fg-muted" data-testid="exchange-notice-mandate">{t('exchange.fund.notice.mandateInv')}</p>}
      {holding?.underCase && <p className="text-warn" data-testid="exchange-notice-case">{t('exchange.holding.case')}</p>}
      {f.convicted && <p className="text-fg-muted" data-testid="exchange-notice-convicted">{t('exchange.fund.convicted')}</p>}
      {holding && (
        <p className="num text-fg" data-testid="exchange-fund-holding">
          {t('exchange.fund.yourUnits', { units: qty(holding.units), value: money(holding.value) })}
        </p>
      )}
      {holding && (
        <p className="num text-fg-muted" data-testid="exchange-fund-limit">{t('exchange.fund.limit', { limit: money(holding.investorLimit) })}</p>
      )}
    </div>
  );
}

/** Invest: a deposit settles at the next day-close NAV. A refusal (the rank, the account age, the stake, the caps) shows inline. */
function InvestForm({ f, rules, holding }: { f: ExchangeFund; rules: FundRules; holding: FundHolding | null }) {
  const act = useGame((s) => s.act);
  const [amount, setAmount] = useState('');
  const [refusal, setRefusal] = useState<RefusalCopy | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const n = Number(amount);
  const valid = Number.isFinite(n) && n >= rules.minDeposit;
  const submit = async () => {
    setRefusal(null);
    setSent(null);
    const r = await act({ type: 'fund.deposit', fundId: f.id, amount: n }, { silent: true });
    if (r.ok) {
      setAmount('');
      setSent(t('exchange.fund.invest.sent', { amount: money(n), fund: f.name }));
    } else {
      setRefusal(refusalCopy('funds.refusal', r.error ?? '', rejectVars(r.data)));
    }
  };
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="exchange-invest-card">
      <h3 className="font-serif text-title text-fg">{t('exchange.fund.invest.title')}</h3>
      <p className="text-caption text-fg-muted">{t('exchange.fund.invest.note')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <NumberField label={t('exchange.fund.invest.amount')} value={amount} onChange={setAmount} min={rules.minDeposit} suffix="$" className="w-56" testId="exchange-invest-amount" />
        <Button variant="brass" disabled={!valid} onClick={submit} testId="exchange-invest">{t('exchange.fund.invest.submit')}</Button>
      </div>
      {holding && holding.pendingDeposit > 0 && (
        <p className="num text-small text-fg-muted" data-testid="exchange-pending-deposit">
          {t('exchange.holding.pendingDeposit', { amount: money(holding.pendingDeposit) })}
        </p>
      )}
      {refusal && <RefusalBox copy={refusal} testId="exchange-invest-refusal" />}
      {sent && <p className="text-small text-gain" data-testid="exchange-invest-sent">{sent}</p>}
      <PublicChip />
    </Card>
  );
}

/** Redeem: units you hold, paid at the next day-close NAV, through the day's gate. The early-exit fee shows before you send. */
function RedeemForm({ f, rules, holding }: { f: ExchangeFund; rules: FundRules; holding: FundHolding | null }) {
  const act = useGame((s) => s.act);
  const [units, setUnits] = useState('');
  const [refusal, setRefusal] = useState<RefusalCopy | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const n = Number(units);
  const held = holding?.units ?? 0;
  const valid = Number.isFinite(n) && n > 0 && n <= held + 1e-9;
  const early = !!holding && holding.earlyExitRemainingTicks > 0;
  const submit = async () => {
    setRefusal(null);
    setSent(null);
    const r = await act({ type: 'fund.redeem', fundId: f.id, units: n }, { silent: true });
    if (r.ok) {
      setUnits('');
      setSent(t('exchange.fund.redeem.sent', { units: qty(n), fund: f.name }));
    } else {
      setRefusal(refusalCopy('funds.refusal', r.error ?? '', rejectVars(r.data)));
    }
  };
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="exchange-redeem-card">
      <h3 className="font-serif text-title text-fg">{t('exchange.fund.redeem.title')}</h3>
      <p className="text-caption text-fg-muted">
        {t('exchange.fund.redeem.note', { gate: pct(rules.redeemGatePct), days: rules.earlyExitRealDays, fee: pct(rules.earlyExitFeePct) })}
      </p>
      {early && holding && (
        <p className="text-small text-warn" data-testid="exchange-early-exit">
          {t('exchange.holding.earlyExit', { left: ticksLabel(holding.earlyExitRemainingTicks, rules.ticksPerDay) })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <NumberField label={t('exchange.fund.redeem.units')} value={units} onChange={setUnits} min={0} suffix={qty(held)} className="w-56" testId="exchange-redeem-units" />
        <Button variant="outline" disabled={!valid} onClick={submit} testId="exchange-redeem">{t('exchange.fund.redeem.submit')}</Button>
      </div>
      {refusal && <RefusalBox copy={refusal} testId="exchange-redeem-refusal" />}
      {sent && <p className="text-small text-gain" data-testid="exchange-redeem-sent">{sent}</p>}
    </Card>
  );
}
