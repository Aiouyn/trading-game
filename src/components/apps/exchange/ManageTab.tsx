'use client';

// The manager's side: open a fund (the first time), then the console of your own fund: the notices (freeze, breaker,
// wind-down, a pending mandate, a front-running case, a verdict), the fund's numbers, a trade ticket that trades through the
// fund's own account, and the mandate change (24 real hours of notice). Every refusal shows inline with its three parts.
import { useState } from 'react';
import { money, pct, qty } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, Chip, NumberField, Select, SpendReview, TextField, spendRows, ticksLabel } from '@/components/ui';
import { FUND_RULES } from '@/content/funds';
import type { Side } from '@/engine';
import { feeFractionOf, type ExchangeView, type FundRules, type ManagedFund } from '@/world/exchange/view';
import type { FundMandate } from '@/world/funds/types';
import { Fact, RefusalBox, Section } from './Shared';
import { type RefusalCopy, aumBucketKey, classKey, refusalCopy, rejectVars, statusKey, unitNav } from './copy';

export function ManageTab({ x }: { x: ExchangeView }) {
  if (!x.managed) return <OpenFund x={x} />;
  return <Console m={x.managed} rules={x.rules} />;
}

/** The mandate's classes as toggles: pressed means the fund may trade the class. */
function ClassToggles({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('exchange.manage.open.classes')}>
      {FUND_RULES.classes.map((c) => {
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            data-testid={`exchange-class-${c}`}
            onClick={() => onChange(on ? value.filter((x) => x !== c) : [...value, c])}
            className={`rounded-md border px-3 py-1.5 text-small ${on ? 'border-brass/60 bg-brass/10 text-fg' : 'border-ink-3 text-fg-muted hover:text-fg'}`}
          >
            {t(classKey(c))}
          </button>
        );
      })}
    </div>
  );
}

const LEVERAGE = [1, 1.5];
const POSITION = [0.1, 0.2];

function OpenFund({ x }: { x: ExchangeView }) {
  const act = useGame((s) => s.act);
  const cash = useGame((s) => s.me?.account?.cash ?? 0);
  const [name, setName] = useState('');
  const [stake, setStake] = useState(String(x.rules.managerMinStake));
  const [classes, setClasses] = useState<string[]>([...FUND_RULES.classes]);
  const [lev, setLev] = useState('1');
  const [pos, setPos] = useState('0.2');
  const [mgmt, setMgmt] = useState('2');
  const [perf, setPerf] = useState('20');
  const [refusal, setRefusal] = useState<RefusalCopy | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const blocked = x.opening.refusal ? refusalCopy('funds.refusal', x.opening.refusal) : null;
  const n = Number(stake);
  const valid = name.trim().length >= 3 && classes.length > 0 && n >= x.rules.managerMinStake && !blocked
    && Number(mgmt) >= 0 && Number(mgmt) <= x.rules.mgmtFeeMaxPct && Number(perf) >= 0 && Number(perf) <= x.rules.perfFeeMaxPct;

  const submit = async () => {
    setRefusal(null);
    setSent(null);
    const mandate: FundMandate = { classes, maxLeverage: Number(lev), maxPositionPct: Number(pos) };
    const r = await act({
      type: 'fund.create', name: name.trim(), mandate, fees: { mgmt: feeFractionOf(Number(mgmt)), perf: feeFractionOf(Number(perf)) }, stake: n,
    }, { silent: true });
    if (r.ok) {
      setSent(t('exchange.manage.open.sent', { fund: name.trim() }));
      setName('');
    } else {
      setRefusal(refusalCopy('funds.refusal', r.error ?? '', rejectVars(r.data)));
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="exchange-open-fund">
      {(x.banRemainingTicks > 0 || x.convictedRemainingTicks > 0) && (
        <Card className="flex flex-col gap-1 p-4 text-small" data-testid="exchange-ban">
          {x.banRemainingTicks > 0 && <p className="text-warn">{t('exchange.manage.banned', { left: ticksLabel(x.banRemainingTicks, x.rules.ticksPerDay) })}</p>}
          {x.convictedRemainingTicks > 0 && <p className="text-warn">{t('exchange.manage.convicted', { left: ticksLabel(x.convictedRemainingTicks, x.rules.ticksPerDay) })}</p>}
        </Card>
      )}
      <Card className="flex flex-col gap-4 p-4">
        <div>
          <h2 className="font-serif text-title text-fg">{t('exchange.manage.open.title')}</h2>
          <p className="mt-1 text-caption text-fg-muted">{t('exchange.manage.open.sub')}</p>
        </div>
        <TextField value={name} onChange={setName} placeholder={t('exchange.manage.open.name')} maxLength={30} label={t('exchange.manage.open.name')} className="w-full" testId="exchange-open-name" />
        <div className="grid gap-3 @md:grid-cols-2">
          <NumberField label={t('exchange.manage.open.stake')} value={stake} onChange={setStake} min={x.rules.managerMinStake} suffix="$" testId="exchange-open-stake" />
          <Select value={lev} onChange={setLev} label={t('exchange.manage.open.leverage')} testId="exchange-open-leverage"
            options={LEVERAGE.map((v) => ({ value: String(v), label: `${v}×` }))} />
          <Select value={pos} onChange={setPos} label={t('exchange.manage.open.position')} testId="exchange-open-position"
            options={POSITION.map((v) => ({ value: String(v), label: pct(v) }))} />
          <NumberField label={t('exchange.manage.open.mgmt')} value={mgmt} onChange={setMgmt} min={0} suffix="%" testId="exchange-open-mgmt" />
          <NumberField label={t('exchange.manage.open.perf')} value={perf} onChange={setPerf} min={0} suffix="%" testId="exchange-open-perf" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="label">{t('exchange.manage.open.classes')}</span>
          <ClassToggles value={classes} onChange={setClasses} />
        </div>
        {blocked && <RefusalBox copy={blocked} testId="exchange-opening-refusal" />}
        {refusal && <RefusalBox copy={refusal} testId="exchange-open-refusal" />}
        {sent && <p className="text-small text-gain" data-testid="exchange-open-sent">{sent}</p>}
        <SpendReview variant="brass" testId="exchange-open-submit" label={t('exchange.manage.open.submit')} title={t('exchange.manage.open.submit')} rows={spendRows(valid ? n : 0, cash)} disabled={!valid} onConfirm={submit} />
      </Card>
    </div>
  );
}

function Console({ m, rules }: { m: ManagedFund; rules: FundRules }) {
  const bucket = aumBucketKey(m.aumBucket, FUND_RULES.aumBuckets);
  return (
    <div className="flex flex-col gap-4" data-testid="exchange-console">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-serif text-title text-fg" data-testid="exchange-console-name">{m.name}</h2>
            <p className="mt-1 text-caption text-fg-muted">{t('exchange.manage.console.title')}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip>{t(statusKey(m.status))}</Chip>
            <Chip>{t('exchange.fund.aum', { bucket: t(bucket.key, bucket.vars) })}</Chip>
          </div>
        </div>
        <Notices m={m} rules={rules} />
        <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
          <Fact label={t('exchange.manage.stat.nav')} value={money(m.nav)} testId="exchange-stat-nav" />
          <Fact label={t('exchange.manage.stat.navPerUnit')} value={unitNav(m.navPerUnit)} testId="exchange-stat-navperunit" />
          <Fact label={t('exchange.manage.stat.cash')} value={money(m.cash)} />
          <Fact label={t('exchange.manage.stat.stake')} value={money(m.stake)} testId="exchange-stat-stake" />
          <Fact label={t('exchange.manage.stat.floor')} value={money(m.stakeFloor)} />
          <Fact label={t('exchange.manage.stat.aumCap')} value={money(m.aumCap)} />
          <Fact label={t('exchange.manage.stat.feeAccrued')} value={money(m.feeAccrued)} testId="exchange-stat-fee-accrued" />
          <Fact label={t('exchange.manage.stat.feePayable')} value={money(m.feePayable)} testId="exchange-stat-fee-payable" />
          <Fact label={t('exchange.manage.stat.hwm')} value={unitNav(m.highWaterMark)} />
          <Fact label={t('exchange.manage.stat.pendingDeposits')} value={money(m.pendingDeposits)} />
          <Fact label={t('exchange.manage.stat.pendingRedeem')} value={qty(m.pendingRedeemUnits)} />
        </div>
        <Section title={t('exchange.manage.positions')} testId="exchange-positions">
          {m.positions.length === 0 && <p className="text-small text-fg-faint">{t('exchange.manage.noPositions')}</p>}
          {m.positions.map((p) => (
            <p key={p.assetId} className="num text-small text-fg" data-testid={`exchange-position-${p.assetId}`}>
              {p.assetId} · {qty(p.qty)} · {money(p.value)}
            </p>
          ))}
        </Section>
        <Section title={t('exchange.manage.filings')} testId="exchange-manage-filings">
          {m.filings.length === 0 && <p className="text-small text-fg-faint">{t('exchange.fund.filingNone')}</p>}
          {m.filings.map((f) => (
            <p key={`${f.assetId}-${f.tick}`} className="num text-small text-fg">
              {t('exchange.fund.filingRow', { asset: f.assetId, pct: pct(f.pct), day: f.day })}
            </p>
          ))}
        </Section>
      </Card>
      <TradeTicket m={m} />
      <MandateForm m={m} rules={rules} />
    </div>
  );
}

/** The fund's notices, from the fund's own state. Each one says what is true and when it changes. */
function Notices({ m, rules }: { m: ManagedFund; rules: FundRules }) {
  const none = !m.frozen && !m.winding && m.breakerRemainingTicks === 0 && !m.pendingMandate && !m.caseOpen && !m.convicted;
  return (
    <div className="flex flex-col gap-1.5 text-small" data-testid="exchange-notes">
      {m.frozen && m.windDownRemainingTicks !== null && (
        <p className="text-warn" data-testid="exchange-note-frozen">
          {t('exchange.fund.notice.frozen', { left: ticksLabel(m.windDownRemainingTicks, rules.ticksPerDay) })}
        </p>
      )}
      {m.winding && <p className="text-fg-muted" data-testid="exchange-note-winding">{t('exchange.fund.notice.winding')}</p>}
      {m.breakerRemainingTicks > 0 && (
        <p className="text-warn" data-testid="exchange-note-breaker">{t('exchange.fund.notice.breaker', { left: ticksLabel(m.breakerRemainingTicks, rules.ticksPerDay) })}</p>
      )}
      {m.pendingMandate && (
        <p className="text-fg-muted" data-testid="exchange-note-mandate">
          {t('exchange.fund.notice.mandate', { left: ticksLabel(m.pendingMandate.remainingTicks, rules.ticksPerDay) })}
        </p>
      )}
      {m.caseOpen && (
        <p className="text-warn" data-testid="exchange-note-case">{t('exchange.manage.notes.case', { evidence: m.evidence, harm: money(m.harm) })}</p>
      )}
      {m.convicted && <p className="text-warn" data-testid="exchange-note-verdict">{t('exchange.manage.notes.verdict')}</p>}
      {none && <p className="text-fg-faint">{t('exchange.manage.notes.none')}</p>}
    </div>
  );
}

/** A trade through the fund's own account: market or limit, inside the mandate. The fund's refusals show inline. */
function TradeTicket({ m }: { m: ManagedFund }) {
  const act = useGame((s) => s.act);
  const config = useGame((s) => s.config);
  const assets = config.assets.filter((a) => !a.delisted && a.listed !== false && m.mandate.classes.includes(a.assetClass));
  // The ticket's asset is kept only while the mandate still allows it: a mandate change never leaves a stale choice behind.
  const [picked, setAssetId] = useState<string>(assets[0]?.id ?? '');
  const assetId = assets.some((a) => a.id === picked) ? picked : (assets[0]?.id ?? '');
  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState('');
  const [refusal, setRefusal] = useState<RefusalCopy | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const n = Number(q);
  const lp = Number(limit);
  const valid = assetId !== '' && Number.isFinite(n) && n > 0 && (type === 'market' || (Number.isFinite(lp) && lp > 0));
  const submit = async () => {
    setRefusal(null);
    setSent(null);
    const r = await act({
      type: 'fund.trade', fundId: m.id, assetId, side, qty: n, orderType: type,
      ...(type === 'limit' ? { limitPrice: lp } : {}),
    }, { silent: true });
    if (r.ok) {
      setQ('');
      setLimit('');
      setSent(t('exchange.manage.trade.sent', { fund: m.name }));
    } else {
      setRefusal(refusalCopy('funds.refusal', r.error ?? '', rejectVars(r.data)));
    }
  };
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="exchange-trade">
      <div>
        <h3 className="font-serif text-title text-fg">{t('exchange.manage.trade.title')}</h3>
        <p className="mt-1 text-caption text-fg-muted">{t('exchange.manage.trade.sub')}</p>
      </div>
      {assets.length === 0 ? (
        <p className="text-small text-fg-faint" data-testid="exchange-trade-none">{t('exchange.manage.trade.noAssets')}</p>
      ) : (
        <div className="grid gap-3 @md:grid-cols-2">
          <Select value={assetId} onChange={setAssetId} label={t('exchange.manage.trade.asset')} testId="exchange-trade-asset"
            options={assets.map((a) => ({ value: a.id, label: `${a.id} · ${a.name}` }))} />
          <Select<Side> value={side} onChange={setSide} label={t('exchange.manage.trade.side')} testId="exchange-trade-side"
            options={[{ value: 'buy', label: t('exchange.side.buy') }, { value: 'sell', label: t('exchange.side.sell') }]} />
          <Select<'market' | 'limit'> value={type} onChange={setType} label={t('exchange.manage.trade.type')} testId="exchange-trade-type"
            options={[{ value: 'market', label: t('exchange.manage.trade.market') }, { value: 'limit', label: t('exchange.manage.trade.limit') }]} />
          <NumberField label={t('exchange.manage.trade.qty')} value={q} onChange={setQ} min={0} testId="exchange-trade-qty" />
          {type === 'limit' && (
            <NumberField label={t('exchange.manage.trade.limitPrice')} value={limit} onChange={setLimit} min={0} suffix="$" testId="exchange-trade-limit" />
          )}
        </div>
      )}
      {assets.length > 0 && (
        <SpendReview
          variant="brass"
          testId="exchange-trade-submit"
          label={t('exchange.manage.trade.submit')}
          title={t('exchange.manage.trade.submit')}
          rows={[{ label: t('exchange.manage.trade.side'), value: t(side === 'buy' ? 'exchange.side.buy' : 'exchange.side.sell') }, { label: t('exchange.manage.trade.qty'), value: qty(valid ? n : 0) }, { label: t('exchange.manage.trade.asset'), value: assetId }]}
          disabled={!valid}
          onConfirm={submit}
        />
      )}
      {refusal && <RefusalBox copy={refusal} testId="exchange-trade-refusal" />}
      {sent && <p className="text-small text-gain" data-testid="exchange-trade-sent">{sent}</p>}
    </Card>
  );
}

/** The mandate change. It takes effect after 24 real hours of notice (the world applies it by itself). */
function MandateForm({ m, rules }: { m: ManagedFund; rules: FundRules }) {
  const act = useGame((s) => s.act);
  const [classes, setClasses] = useState<string[]>([...m.mandate.classes]);
  const [lev, setLev] = useState(String(m.mandate.maxLeverage));
  const [pos, setPos] = useState(String(m.mandate.maxPositionPct));
  const [refusal, setRefusal] = useState<RefusalCopy | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const valid = classes.length > 0 && !m.winding && !m.pendingMandate;
  const submit = async () => {
    setRefusal(null);
    setSent(null);
    const r = await act({
      type: 'fund.mandate', fundId: m.id, mandate: { classes, maxLeverage: Number(lev), maxPositionPct: Number(pos) },
    }, { silent: true });
    if (r.ok) setSent(t('exchange.manage.mandate.sent'));
    else setRefusal(refusalCopy('funds.refusal', r.error ?? '', rejectVars(r.data)));
  };
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="exchange-mandate">
      <div>
        <h3 className="font-serif text-title text-fg">{t('exchange.manage.mandate.title')}</h3>
        <p className="mt-1 text-caption text-fg-muted">{t('exchange.manage.mandate.sub', { hours: rules.mandateNoticeRealHours })}</p>
      </div>
      <ClassToggles value={classes} onChange={setClasses} />
      <div className="grid gap-3 @md:grid-cols-2">
        <Select value={lev} onChange={setLev} label={t('exchange.manage.open.leverage')} testId="exchange-mandate-leverage"
          options={LEVERAGE.map((v) => ({ value: String(v), label: `${v}×` }))} />
        <Select value={pos} onChange={setPos} label={t('exchange.manage.open.position')} testId="exchange-mandate-position"
          options={POSITION.map((v) => ({ value: String(v), label: pct(v) }))} />
      </div>
      <Button variant="outline" disabled={!valid} onClick={submit} testId="exchange-mandate-submit">{t('exchange.manage.mandate.submit')}</Button>
      {refusal && <RefusalBox copy={refusal} testId="exchange-mandate-refusal" />}
      {sent && <p className="text-small text-gain" data-testid="exchange-mandate-sent">{sent}</p>}
    </Card>
  );
}
