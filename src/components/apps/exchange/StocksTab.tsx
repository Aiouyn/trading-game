'use client';

// Player stocks (the listed companies). Every row here is what a real company files or signals: CompanyPublic, nothing
// else. Trade opens the Broker on the ticker. The founder's private state never reaches this file.
import { compactMoney, money, sharePrice, qty } from '@/game/format';
import { t } from '@/i18n';
import { openFromShell } from '@/components/os/openApp';
import { Button, Card, Chip, EmptyNext } from '@/components/ui';
import type { ListedStock } from '@/world/exchange/view';
import type { CompanyPublic } from '@/world/company/views';
import { Fact, Section } from './Shared';
import { covenantKey, hiresKey, planEndKey, sectorKey, skipKey, sideKey, tierKey } from './copy';

export function StocksTab({ stocks }: { stocks: ListedStock[] }) {
  if (stocks.length === 0) {
    return (
      <EmptyNext testId="exchange-stocks-empty" title={t('exchange.empty.stocks')} body={t('exchange.empty.stocks.body')}
        cta={<Button variant="brass" onClick={() => openFromShell('broker')} testId="exchange-stocks-cta">{t('exchange.empty.stocks.cta')}</Button>} />
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="exchange-stocks">
      {stocks.map((s) => <StockCard key={s.companyId} s={s} />)}
    </div>
  );
}

function band(b: [number, number]): string {
  return `${compactMoney(b[0])} to ${compactMoney(b[1])}`;
}

/** The debt band as a figure: zero is money ($0.00), the other bands are the engine's words. */
function debtText(totalBand: string): string {
  return totalBand === '0' ? money(0) : totalBand;
}

/** The filed revenue: nothing filed yet is a line, a zero filing is $0, and a filed band is a band (never "$0 to $0"). */
function revenueText(b: [number, number] | null): string {
  if (b === null) return t('exchange.stock.revenueNone');
  if (b[0] === 0 && b[1] === 0) return compactMoney(0);
  return band(b);
}

function StockCard({ s }: { s: ListedStock }) {
  const v: CompanyPublic = s.view;
  const last = v.filings[v.filings.length - 1];
  const signals = v.signals.slice(-5).reverse();
  const trades = v.insiderTrades.slice(-5).reverse();
  const plans = v.plans.slice(-5).reverse();
  const skips = v.planSkips.slice(-5).reverse();
  const buybacks = v.buybackPrograms.slice(-3).reverse();
  const filings = v.filings.slice(-4).reverse();

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid={`exchange-stock-${s.ticker}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-title text-fg" data-testid={`exchange-stock-name-${s.ticker}`}>{s.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-fg-muted">
            <span className="num text-fg" data-testid={`exchange-stock-ticker-${s.ticker}`}>{s.ticker}</span>
            <Chip>{t(tierKey(v.tier, !!v.listed))}</Chip>
            <Chip>{t(sectorKey(v.sector))}</Chip>
            {s.halted && <Chip>{t('exchange.stock.halted')}</Chip>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="label">{t('exchange.stock.price')}</div>
            <div className="num text-title text-fg" data-testid={`exchange-stock-price-${s.ticker}`}>{sharePrice(s.price)}</div>
          </div>
          <Button variant="brass" size="sm" onClick={() => openFromShell('broker', { ticker: s.ticker })} testId={`exchange-trade-${s.ticker}`}>
            {t('exchange.stock.trade', { ticker: s.ticker })}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
        <Fact label={t('exchange.stock.headcount', { band: v.headcountBand })} value={v.headcountBand} testId={`exchange-headcount-${s.ticker}`} />
        <Fact label={t('exchange.stock.debt')} value={debtText(v.debt.totalBand)} testId={`exchange-debt-${s.ticker}`} />
        <Fact label={t('exchange.stock.covenant')} value={t(covenantKey(v.debt.covenant))} testId={`exchange-covenant-${s.ticker}`} />
        {(v.listed || v.revenueBand !== undefined) && <Fact label={t('exchange.stock.revenue')} value={revenueText(v.revenueBand ?? null)} testId={`exchange-revenue-${s.ticker}`} />}
        <Fact prose label={t('exchange.stock.tier')} value={t(tierKey(v.tier, !!v.listed))} />
      </div>

      <Section title={t('exchange.stock.windowTitle')} public testId={`exchange-window-${s.ticker}`}>
        {v.window
          ? (v.window.open
            ? <p className="text-small text-gain" data-testid="exchange-window-state">{t('exchange.stock.window.open', { day: v.window.closesDay ?? '' })}</p>
            : <p className="text-small text-fg-muted" data-testid="exchange-window-state">
              {v.window.opensDay !== undefined ? t('exchange.stock.window.closed', { day: v.window.opensDay }) : t('exchange.stock.window.closedNoDay')}
            </p>)
          : <p className="text-small text-fg-faint" data-testid="exchange-window-state">{t('exchange.stock.window.none')}</p>}
      </Section>

      <Section title={t('exchange.stock.plans')} public testId={`exchange-plans-${s.ticker}`}>
        {plans.length === 0 && skips.length === 0 && <p className="text-small text-fg-faint">{t('exchange.stock.planNone')}</p>}
        {plans.map((p, i) => (
          <p key={`p${i}`} className="num text-small text-fg" data-testid="exchange-plan-row">
            {t('exchange.stock.planRow', { from: p.fromDay, to: p.toDay })}
            {p.ended && <span className="text-fg-muted">{' · '}{t('exchange.stock.planEnded', { day: p.ended.day, reason: t(planEndKey(p.ended.reason)) })}</span>}
          </p>
        ))}
        {skips.map((k, i) => (
          <p key={`k${i}`} className="text-small text-fg-muted" data-testid="exchange-plan-skip">
            {t('exchange.stock.planSkip', { day: k.day, reason: t(skipKey(k.reason)) })}
          </p>
        ))}
      </Section>

      <Section title={t('exchange.stock.filings')} public testId={`exchange-filings-${s.ticker}`}>
        {filings.length === 0 && <p className="text-small text-fg-faint">{t('exchange.stock.filingsNone')}</p>}
        {filings.map((f) => (
          <div key={f.quarter} className="flex flex-col gap-0.5" data-testid="exchange-filing-row">
            <p className="num text-small text-fg">
              {t('exchange.stock.filing', { quarter: f.quarter, day: f.filedDay, rev: money(f.income.revUnrelated), ni: money(f.income.netIncome) })}
            </p>
            <p className="num text-caption text-fg-muted" data-testid="exchange-statement-income">
              {t('exchange.stock.statementIncome', {
                cogs: money(f.income.cogs), opex: money(f.income.opex), ebitda: money(f.income.ebitda), interest: money(f.income.interest),
              })}
            </p>
            <p className="num text-caption text-fg-muted" data-testid="exchange-statement-balance">
              {t('exchange.stock.statementBalance', {
                cash: money(f.balance.cash), receivables: money(f.balance.receivables), inventory: money(f.balance.inventory),
                ppe: money(f.balance.ppe), debt: money(f.balance.debt), equity: money(f.balance.equity),
              })}
            </p>
            <p className="num text-caption text-fg-muted" data-testid="exchange-statement-cashflow">
              {t('exchange.stock.statementCashFlow', {
                ocf: money(f.cashFlow.ocf), capex: money(f.cashFlow.capex), dividends: money(f.cashFlow.dividends), buybacks: money(f.cashFlow.buybacks),
              })}
            </p>
          </div>
        ))}
        {last && v.cashDebt && (
          <p className="text-small text-fg-muted">
            {t('exchange.stock.cashDebt', { cash: money(v.cashDebt.cash), debt: money(v.cashDebt.totalDebt), day: v.cashDebt.filedDay })}
          </p>
        )}
      </Section>

      <Section title={t('exchange.stock.insider')} public testId={`exchange-insider-${s.ticker}`}>
        {trades.length === 0 && <p className="text-small text-fg-faint">{t('exchange.stock.insiderNone')}</p>}
        {trades.map((r, i) => (
          <p key={`t${i}`} className="num text-small text-fg" data-testid="exchange-insider-row">
            {t('exchange.stock.insiderRow', { day: r.day, side: t(sideKey(r.side)), qty: qty(r.qty), instrument: t(`exchange.instrument.${r.instrument}`) })}
          </p>
        ))}
      </Section>

      <Section title={t('exchange.stock.buybacks')} public testId={`exchange-buybacks-${s.ticker}`}>
        {buybacks.length === 0 && <p className="text-small text-fg-faint">{t('exchange.stock.buybackNone')}</p>}
        {buybacks.map((b, i) => (
          <p key={`b${i}`} className="num text-small text-fg">
            {t('exchange.stock.buybackRow', { size: qty(b.size), from: b.fromDay, to: b.toDay })}
          </p>
        ))}
        <p className="text-small text-fg-muted" data-testid={`exchange-takeover-${s.ticker}`}>{t('exchange.stock.takeover')}</p>
      </Section>

      <Section title={t('exchange.stock.signals')} public testId={`exchange-signal-${s.ticker}`}>
        {signals.length > 0 ? (
          signals.map((signal) => (
            <p key={`sig-${signal.day}`} className="num text-small text-fg" data-testid="exchange-signal-row">
              {t('exchange.stock.signal', {
                day: signal.day,
                bookings: band(signal.bookingsBand),
                run: band(signal.runRateBand),
                hires: t(hiresKey(signal.netHires)),
                util: signal.utilizationBand,
              })}
            </p>
          ))
        ) : (
          <p className="text-small text-fg-faint">{t('exchange.stock.signalNone')}</p>
        )}
        {v.distressFlag && <p className="text-small text-warn">{t('exchange.stock.distress')}</p>}
      </Section>

      <p className="text-caption text-fg-faint">{t('exchange.stock.backstop')}</p>
    </Card>
  );
}
