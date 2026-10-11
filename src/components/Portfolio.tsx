'use client';

import { useEffect, useMemo, useState } from 'react';
import { portfolio, type AssetClass } from '@/engine';
import { PROPERTY_TYPE_BY_ID } from '@/content/lifestyle';
import { compactMoney, money, pct, price, qty, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { clockLabel } from '@/game/clock';
import { assetDefOf, useGame } from '@/game/store';
import { t } from '@/i18n';
import type { FillReason } from '@/engine/ledger-types';
import { NetWorth } from './Header';
import { Positions, reasonLabel } from './Holdings';
import { type ChartOverlay, PriceChart } from './apps/broker/PriceChart';
import { GoalsCard } from './GoalsCard';
import { ClosesCard, LuckCard } from './PortfolioLuck';
import { Card, CardHeader, KV, Segmented, Stat, Td, Th } from './ui';
import { JournalView } from './apps/journal/JournalView';
import { AnalystView } from './apps/analyst/AnalystView';

const CLASS_COLOR: Record<string, string> = {
  cash: 'bg-ink-3', stock: 'bg-brass', crypto: 'bg-steel', commodity: 'bg-brass-lo', forex: 'bg-info', bond: 'bg-gain', options: 'bg-warn',
  businesses: 'bg-brass-hi', property: 'bg-fg-muted', lifestyle: 'bg-loss', lab: 'bg-info',
};
const CLASS_LABEL_KEY: Record<string, string> = {
  cash: 'common.cash', stock: 'portfolio.class.stock', crypto: 'portfolio.class.crypto', commodity: 'portfolio.class.commodity',
  forex: 'portfolio.class.forex', bond: 'portfolio.class.bond', options: 'portfolio.class.options', businesses: 'portfolio.businesses',
  property: 'portfolio.class.property', lifestyle: 'portfolio.class.lifestyle', lab: 'portfolio.aiHardware',
};

/** A game day in ticks (the chart's daily points sit at day * TPD + 1, as the daily net worth series does). */
const TPD = 720;

type NwRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';

export type PortfolioTab = 'portfolio' | 'journal' | 'analyst';

const tabOf = (view?: string): PortfolioTab => (view === 'journal' || view === 'analyst' ? view : 'portfolio');

/**
 * The Portfolio window (Phase 3): the positions and net worth, the trade journal and the analyst. The window's view names the
 * tab it opens on (the Review layout's second Portfolio is the journal); the segmented control switches within it.
 */
export function PortfolioView({ phone = false, view }: { phone?: boolean; view?: string }) {
  const [tab, setTab] = useState<PortfolioTab>(tabOf(view));
  // a new view for the open window switches its tab (the previous view is kept in state, so this runs during render)
  const [seenView, setSeenView] = useState(view);
  if (view !== seenView) {
    setSeenView(view);
    if (view !== undefined) setTab(tabOf(view));
  }
  return (
    <div className="flex flex-col gap-4" data-testid="portfolio-window">
      <Segmented<PortfolioTab>
        label={t('app.portfolio')}
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'portfolio', label: t('portfolio.tab.portfolio'), testId: 'portfolio-tab-portfolio' },
          { value: 'journal', label: t('portfolio.tab.journal'), testId: 'portfolio-tab-journal' },
          { value: 'analyst', label: t('portfolio.tab.analyst'), testId: 'portfolio-tab-analyst' },
        ]}
      />
      {tab === 'journal' ? <JournalView onHire={() => setTab('analyst')} /> : tab === 'analyst' ? <AnalystView /> : <PortfolioPositions phone={phone} />}
    </div>
  );
}

/** One figure of the since-arrival split: a label and a signed amount, tinted by its sign. */
function SplitItem({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={toneText[tone(value)]} data-testid={testId}>{signedMoney(value)}</dd>
    </div>
  );
}

function PortfolioPositions({ phone = false }: { phone?: boolean }) {
  const me = useGame((s) => s.me)!;
  const world = useGame((s) => s.world)!;
  const playerId = useGame((s) => s.playerId)!;
  const nw = useGame((s) => s.nw);
  const frame = useGame((s) => s.frame);
  const config = useGame((s) => s.config);
  const loadNw = useGame((s) => s.loadNw);
  useGame((s) => s.historyRev);
  const [range, setRange] = useState<NwRange>('1W');
  const [ghostsOn, setGhostsOn] = useState(true);
  // the history (and the ghost lines in it) is reread each time a new close lands while the window is open
  const latestClose = me.trading.closes[0]?.day ?? -1;
  useEffect(() => { void loadNw(); }, [loadNw, latestClose]);

  const pf = portfolio(world, playerId);
  const b = me.netWorth;
  const series = useMemo(() => {
    if (!nw) return [];
    // the daily ranges read the closes: a month is the last 30 game days, a year the last 365 (or all that are kept)
    const daysBack = range === '1M' ? 30 : range === '1Y' ? 365 : null;
    if (range === 'ALL' || daysBack !== null) return nw.daily.slice(daysBack === null ? 0 : -daysBack).map((d) => ({ time: d.day * TPD + 1, value: d.value }));
    const n = range === '1D' ? 60 : nw.samples.length;
    const s = nw.samples.slice(-n);
    return s.map((v, k) => ({ time: nw.lastTick - (s.length - 1 - k) * nw.every, value: v }));
  }, [nw, range, nw?.samples.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // the chart ends at the header's figure: the samples are every few ticks, so the live net worth is the last point
  const liveTick = frame?.tick;
  const chartSeries = useMemo(() => {
    if (liveTick === undefined) return series;
    const last = series[series.length - 1];
    const live = { time: liveTick, value: b.total };
    if (!last) return [live];
    if (last.time === liveTick) return [...series.slice(0, -1), live];
    return last.time < liveTick ? [...series, live] : series;
  }, [series, liveTick, b.total]);

  // The ghosts and the player's own trading equity, drawn over the net worth line (private: the owner's ledger, every kept
  // closed day). They are priced on the same daily closes, so the lines compare with each other, not with the net worth above.
  const fromTime = series[0]?.time ?? 0;
  const overlays = useMemo<ChartOverlay[]>(() => {
    if (!ghostsOn) return [];
    const ghostDays = nw?.ghosts ?? [];
    const pts = (pick: (s: (typeof ghostDays)[number]) => number) =>
      ghostDays.map((s) => ({ time: s.day * TPD + 1, value: pick(s) })).filter((x) => x.time >= fromTime);
    return [
      { id: 'player', color: 'line', points: pts((s) => s.player) },
      { id: 'basket', color: 'steel', dashed: true, points: pts((s) => s.basket) },
      { id: 'random', color: 'info', dashed: true, points: pts((s) => s.random) },
      { id: 'momentum', color: 'warn', dashed: true, points: pts((s) => s.momentum) },
    ];
  }, [ghostsOn, nw, fromTime]);

  // allocation by bucket
  const byClass = new Map<string, number>();
  for (const p of pf.positions) {
    const c = assetDefOf(p.assetId)?.assetClass as AssetClass;
    byClass.set(c, (byClass.get(c) ?? 0) + p.marketValue);
  }
  const optVal = pf.equity - pf.cash - pf.positions.reduce((s, p) => s + p.marketValue, 0);
  const slices = [
    ['cash', Math.max(0, b.cash)], ...[...byClass.entries()], ['options', optVal],
    ['businesses', b.businesses], ['property', Math.max(0, b.property - b.mortgages)], ['lifestyle', b.lifestyle], ['lab', b.lab],
  ].filter(([, v]) => (v as number) > 0.5) as [string, number][];
  const total = slices.reduce((s, [, v]) => s + v, 0) || 1;

  const incomeDay = me.businesses.reduce((s, x) => s + x.incomePerDay, 0);
  const rentDay = me.properties.filter((p) => p.id !== me.player.homePropId).reduce((s, p) => s + (p.value * (PROPERTY_TYPE_BY_ID.get(p.typeId)?.rentYield ?? 0)) / 252, 0);
  const mortgageDay = me.properties.reduce((s, p) => s + (p.mortgage * p.mortgageRate) / 252, 0);
  const closed = me.orders.filter((o) => o.status !== 'open').slice(-50).reverse();
  // the reason each order's first fill carried (M13): settlements and expiries have no order id, so they are not listed here
  const reasonByOrder = new Map<string, FillReason>();
  for (const f of me.trading?.fills ?? []) if (f.orderId !== null && !reasonByOrder.has(f.orderId)) reasonByOrder.set(f.orderId, f.reason);

  return (
    <div className="flex flex-col gap-4" data-testid="portfolio-view">
      {!phone && <GoalsCard />}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="label">{t('common.netWorth')}</div>
            <NetWorth value={b.total} />
            <div className={`num mt-1 text-small ${toneText[tone(me.arrival.change)]}`} data-testid="networth-total">
              {t('portfolio.sinceArrival', { delta: signedMoney(me.arrival.change), pct: signedPct(me.arrival.changePct), start: money(me.arrival.cash) })}
            </div>
            <dl className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption" data-testid="arrival-split">
              <SplitItem label={t('portfolio.split.trading')} value={me.arrival.split.trading} testId="arrival-trading" />
              <SplitItem label={t('portfolio.split.valuation')} value={me.arrival.split.valuation} testId="arrival-valuation" />
              <SplitItem label={t('portfolio.split.income')} value={me.arrival.split.income} testId="arrival-income" />
              <div className="flex items-baseline gap-1">
                <dt className="text-fg-muted">{t('portfolio.split.grants')}</dt>
                <dd className="text-fg" data-testid="arrival-grants">{signedMoney(me.arrival.external)}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              aria-pressed={ghostsOn}
              data-testid="ghost-toggle"
              title={t('ghost.toggle.hint')}
              onClick={() => setGhostsOn(!ghostsOn)}
              className={`shrink-0 rounded-chip border px-3 py-1 text-caption ${ghostsOn ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted'}`}
            >
              {t('ghost.toggle')}
            </button>
            <Segmented label={t('portfolio.nwRange')} size="sm" value={range} onChange={(v) => setRange(v as NwRange)}
              options={[{ value: '1D', label: '1D', testId: 'nw-range-1D' }, { value: '1W', label: '1W', testId: 'nw-range-1W' }, { value: '1M', label: '1M', testId: 'nw-range-1M' }, { value: '1Y', label: '1Y', testId: 'nw-range-1Y' }, { value: 'ALL', label: 'All', testId: 'nw-range-ALL' }]} />
          </div>
        </div>
        {/* the last point of the line, as the header shows it (the spec compares the two) */}
        <div className={phone ? 'mt-3 h-48' : 'mt-3 h-64'} data-testid="networth-series" data-last-value={chartSeries.at(-1)?.value.toFixed(2) ?? ''}>
          {chartSeries.length > 1
            ? <PriceChart assetId="NW" series={chartSeries} mode="area" testId="networth-chart" studies={false} overlays={overlays} />
            : <div className="flex h-full items-center justify-center text-small text-fg-faint" data-testid="networth-chart">{t('portfolio.building')}</div>}
        </div>
        <p className="mt-2 text-caption text-fg-faint" data-testid="networth-chart-note">{t('portfolio.nwChartNote')}</p>
      </Card>

      <div className={`grid gap-4 ${phone ? '' : 'lg:grid-cols-2'}`}>
        <Card className="p-4">
          <h3 className="font-serif text-title">{t('portfolio.balance')}</h3>
          <div className="mt-2">
            <KV k={t('common.cash')} v={money(b.cash)} />
            <KV k={t('portfolio.markets')} v={money(b.markets)} />
            <KV k={t('portfolio.businesses')} v={money(b.businesses)} />
            <KV k={t('portfolio.property')} v={money(b.property)} />
            <KV k={t('portfolio.mortgages')} v={<span className="text-loss">{money(-b.mortgages)}</span>} />
            <KV k={t('portfolio.lifestyle')} v={money(b.lifestyle)} />
            <KV k={t('portfolio.aiHardware')} v={money(b.lab)} />
            {b.companies !== 0 && <KV k={t('portfolio.companies')} v={money(b.companies)} />}
            <KV k={<span className="font-semibold text-fg">{t('common.netWorth')}</span>} v={<span className="font-semibold">{money(b.total)}</span>} className="border-t border-ink-2 pt-2" />
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-chip" aria-label={t('portfolio.allocation')}>
            {slices.map(([k, v]) => <span key={k} className={CLASS_COLOR[k] ?? 'bg-ink-3'} style={{ width: `${(v / total) * 100}%` }} title={`${t(CLASS_LABEL_KEY[k] ?? k)} ${pct(v / total)}`} />)}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-caption">
            {slices.map(([k, v]) => (
              <li key={k} className="flex items-center gap-2" data-testid={`alloc-${k}`}>
                <span className={`h-2 w-2 rounded-full ${CLASS_COLOR[k]}`} aria-hidden />
                <span className="text-fg-muted">{t(CLASS_LABEL_KEY[k] ?? k)}</span>
                <span className="num ml-auto text-fg">{pct(v / total)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="font-serif text-title">{t('portfolio.income')}</h3>
          <div className="mt-2">
            <KV k={t('portfolio.businesses')} v={<span className="text-gain">{signedMoney(incomeDay)}</span>} />
            <KV k={t('portfolio.rent')} v={<span className="text-gain">{signedMoney(rentDay)}</span>} />
            <KV k={t('portfolio.mortgageInterest')} v={<span className="text-loss">{signedMoney(-mortgageDay)}</span>} />
            <KV k={<span className="font-semibold text-fg">{t('portfolio.passive')}</span>} v={<span className="font-semibold">{signedMoney(incomeDay + rentDay - mortgageDay)}</span>} className="border-t border-ink-2 pt-2" />
          </div>
          <h3 className="mt-5 font-serif text-title">{t('portfolio.trading')}</h3>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Stat label={t('portfolio.realized')} value={<span className={toneText[tone(pf.realizedPnl)]}>{signedMoney(pf.realizedPnl)}</span>} testId="stat-realized" />
            <Stat label={t('portfolio.unrealized')} value={<span className={toneText[tone(pf.unrealizedPnl)]}>{signedMoney(pf.unrealizedPnl)}</span>} testId="stat-unrealized" />
            <Stat label={t('portfolio.fees')} value={money(pf.feesPaid)} testId="stat-fees" />
            <Stat label={t('portfolio.dividends')} value={money(me.account?.dividends ?? 0)} />
            <Stat label={t('portfolio.interest')} value={signedMoney((me.account?.interestEarned ?? 0) - (me.account?.interestPaid ?? 0))} />
            <Stat label={t('portfolio.maxDrawdown')} value={<span className={pf.maxDrawdown < 0 ? 'text-loss' : 'text-fg-muted'}>{signedPct(pf.maxDrawdown)}</span>} testId="stat-maxdd" />
            <Stat label={t('portfolio.winRate')} value={me.player.stats.trades ? pct(me.player.stats.winningTrades / Math.max(1, me.player.stats.trades)) : '—'} />
            <Stat label={t('portfolio.bestTrade')} value={signedMoney(me.player.stats.bestTrade)} />
            <Stat label={t('portfolio.worstTrade')} value={<span className="text-loss">{signedMoney(me.player.stats.worstTrade)}</span>} />
          </div>
        </Card>
      </div>

      <LuckCard />

      <Positions phone={phone} />

      <ClosesCard />

      <Card data-testid="order-history">
        <CardHeader title={t('portfolio.orders')} sub={t('portfolio.ordersSub', { n: closed.length })} />
        {closed.length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">{t('portfolio.nothing')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead><tr><Th>{t('portfolio.col.time')}</Th><Th>{t('portfolio.col.order')}</Th><Th right>{t('portfolio.col.filled')}</Th><Th right>{t('portfolio.col.avgPrice')}</Th><Th right>{t('portfolio.col.fees')}</Th><Th>{t('portfolio.col.reason')}</Th><Th>{t('portfolio.col.status')}</Th></tr></thead>
              <tbody>
                {closed.map((o) => {
                  const reason = reasonByOrder.get(o.id);
                  return (
                    <tr key={o.id} className="border-t border-ink-2" data-testid={`order-row-${o.id}`}>
                      <Td num className="text-fg-faint">{clockLabel(o.closedTick ?? o.placedTick, 720)}</Td>
                      <Td>
                        <span className={o.side === 'buy' ? 'text-gain' : 'text-loss'}>{o.side === 'buy' ? t('common.buy') : t('common.sell')}</span> {qty(o.qty)} {o.assetId}{' '}
                        <span className="text-fg-faint">{t(`order.${o.type}`)}{o.forced ? ` · ${t('portfolio.liquidation')}` : ''}</span>
                      </Td>
                      <Td right num>{qty(o.filledQty)}</Td>
                      <Td right num>{o.filledQty ? price(o.avgFillPrice) : '—'}</Td>
                      <Td right num>{money(o.feesPaid)}</Td>
                      <Td className="text-fg-muted"><span data-testid={`order-reason-${o.id}`}>{reason ? reasonLabel(reason) : '—'}</span></Td>
                      <Td className="text-fg-muted">{o.status}{o.rejectReason ? ` · ${o.rejectReason}` : ''}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-center text-caption text-fg-faint">{t('portfolio.universe', { count: config.assets.filter((a) => a.listed !== false).length, worth: compactMoney(b.total) })}</p>
    </div>
  );
}
