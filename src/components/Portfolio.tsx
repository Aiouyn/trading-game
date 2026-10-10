'use client';

import { useEffect, useMemo, useState } from 'react';
import { portfolio, type AssetClass } from '@/engine';
import { PROPERTY_TYPE_BY_ID } from '@/content/lifestyle';
import { compactMoney, money, pct, price, qty, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { clockLabel } from '@/game/clock';
import { assetDefOf, useGame } from '@/game/store';
import { NetWorth } from './Header';
import { Positions } from './Holdings';
import { PriceChart } from './apps/broker/PriceChart';
import { Card, CardHeader, KV, Segmented, Stat, Td, Th } from './ui';
import { t } from '@/i18n';
import { JournalView } from './apps/journal/JournalView';
import { AnalystView } from './apps/analyst/AnalystView';

const CLASS_COLOR: Record<string, string> = {
  cash: 'bg-ink-3', stock: 'bg-brass', crypto: 'bg-steel', commodity: 'bg-brass-lo', forex: 'bg-info', bond: 'bg-gain', options: 'bg-warn',
  businesses: 'bg-brass-hi', property: 'bg-fg-muted', lifestyle: 'bg-loss', lab: 'bg-info',
};
const CLASS_LABEL: Record<string, string> = {
  cash: 'Cash', stock: 'Stocks', crypto: 'Crypto', commodity: 'Commodities', forex: 'Currencies', bond: 'Bonds', options: 'Options',
  businesses: 'Businesses', property: 'Property (equity)', lifestyle: 'Lifestyle', lab: 'AI hardware',
};

type NwRange = '1D' | '1W' | 'ALL';

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

function PortfolioPositions({ phone = false }: { phone?: boolean }) {
  const me = useGame((s) => s.me)!;
  const world = useGame((s) => s.world)!;
  const playerId = useGame((s) => s.playerId)!;
  const nw = useGame((s) => s.nw);
  const config = useGame((s) => s.config);
  const loadNw = useGame((s) => s.loadNw);
  useGame((s) => s.historyRev);
  const [range, setRange] = useState<NwRange>('1W');
  useEffect(() => { void loadNw(); }, [loadNw]);

  const pf = portfolio(world, playerId);
  const b = me.netWorth;
  const series = useMemo(() => {
    if (!nw) return [];
    if (range === 'ALL') return nw.daily.map((d) => ({ time: d.day * 720 + 1, value: d.value }));
    const n = range === '1D' ? 60 : nw.samples.length;
    const s = nw.samples.slice(-n);
    return s.map((v, k) => ({ time: nw.lastTick - (s.length - 1 - k) * nw.every, value: v }));
  }, [nw, range, nw?.samples.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="flex flex-col gap-4" data-testid="portfolio-view">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="label">{t('portfolio.networth')}</div>
            <NetWorth value={b.total} />
            <div className={`num mt-1 text-small ${toneText[tone(b.total - 5000)]}`} data-testid="networth-total">{t('portfolio.since', { money: signedMoney(b.total - 5000), pct: signedPct(b.total / 5000 - 1) })}</div>
          </div>
          <Segmented label="Net worth range" size="sm" value={range} onChange={(v) => setRange(v as NwRange)}
            options={[{ value: '1D', label: '1D', testId: 'nw-range-1D' }, { value: '1W', label: '1W', testId: 'nw-range-1W' }, { value: 'ALL', label: 'All', testId: 'nw-range-ALL' }]} />
        </div>
        <div className={phone ? 'mt-3 h-48' : 'mt-3 h-64'}>
          {series.length > 1 ? <PriceChart assetId="NW" series={series} mode="area" testId="networth-chart" studies={false} /> : <div className="flex h-full items-center justify-center text-small text-fg-faint" data-testid="networth-chart">{t('portfolio.nwBuilding')}</div>}
        </div>
      </Card>

      <div className={`grid gap-4 ${phone ? '' : 'lg:grid-cols-2'}`}>
        <Card className="p-4">
          <h3 className="font-serif text-title">{t('portfolio.balance')}</h3>
          <div className="mt-2">
            <KV k="Cash" v={money(b.cash)} />
            <KV k="Markets (positions + options)" v={money(b.markets)} />
            <KV k="Businesses" v={money(b.businesses)} />
            <KV k="Property" v={money(b.property)} />
            <KV k="Mortgages" v={<span className="text-loss">{money(-b.mortgages)}</span>} />
            <KV k="Lifestyle (resale)" v={money(b.lifestyle)} />
            <KV k="AI hardware" v={money(b.lab)} />
            <KV k={<span className="font-semibold text-fg">{t('portfolio.networth')}</span>} v={<span className="font-semibold">{money(b.total)}</span>} className="border-t border-ink-2 pt-2" />
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-chip" aria-label="Allocation">
            {slices.map(([k, v]) => <span key={k} className={CLASS_COLOR[k] ?? 'bg-ink-3'} style={{ width: `${(v / total) * 100}%` }} title={`${CLASS_LABEL[k]} ${pct(v / total)}`} />)}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-caption">
            {slices.map(([k, v]) => (
              <li key={k} className="flex items-center gap-2" data-testid={`alloc-${k}`}>
                <span className={`h-2 w-2 rounded-full ${CLASS_COLOR[k]}`} aria-hidden />
                <span className="text-fg-muted">{CLASS_LABEL[k]}</span>
                <span className="num ml-auto text-fg">{pct(v / total)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="font-serif text-title">{t('portfolio.income')}</h3>
          <div className="mt-2">
            <KV k="Businesses" v={<span className="text-gain">{signedMoney(incomeDay)}</span>} />
            <KV k="Rent" v={<span className="text-gain">{signedMoney(rentDay)}</span>} />
            <KV k="Mortgage interest" v={<span className="text-loss">{signedMoney(-mortgageDay)}</span>} />
            <KV k={<span className="font-semibold text-fg">{t('portfolio.passive')}</span>} v={<span className="font-semibold">{signedMoney(incomeDay + rentDay - mortgageDay)}</span>} className="border-t border-ink-2 pt-2" />
          </div>
          <h3 className="mt-5 font-serif text-title">{t('portfolio.trading')}</h3>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Stat label="Realized" value={<span className={toneText[tone(pf.realizedPnl)]}>{signedMoney(pf.realizedPnl)}</span>} testId="stat-realized" />
            <Stat label="Unrealized" value={<span className={toneText[tone(pf.unrealizedPnl)]}>{signedMoney(pf.unrealizedPnl)}</span>} testId="stat-unrealized" />
            <Stat label="Fees paid" value={money(pf.feesPaid)} testId="stat-fees" />
            <Stat label="Dividends" value={money(me.account?.dividends ?? 0)} />
            <Stat label="Interest" value={signedMoney((me.account?.interestEarned ?? 0) - (me.account?.interestPaid ?? 0))} />
            <Stat label="Max drawdown" value={<span className={pf.maxDrawdown < 0 ? 'text-loss' : 'text-fg-muted'}>{signedPct(pf.maxDrawdown)}</span>} testId="stat-maxdd" />
            <Stat label="Win rate" value={me.player.stats.trades ? pct(me.player.stats.winningTrades / Math.max(1, me.player.stats.trades)) : '—'} />
            <Stat label="Best trade" value={signedMoney(me.player.stats.bestTrade)} />
            <Stat label="Worst trade" value={<span className="text-loss">{signedMoney(me.player.stats.worstTrade)}</span>} />
          </div>
        </Card>
      </div>

      <Positions phone={phone} />

      <Card data-testid="order-history">
        <CardHeader title="Order history" sub={`Last ${closed.length} closed orders`} />
        {closed.length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">{t('portfolio.nothing')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead><tr><Th>{t('portfolio.col.time')}</Th><Th>{t('portfolio.col.order')}</Th><Th right>{t('portfolio.col.filled')}</Th><Th right>{t('portfolio.col.avgPrice')}</Th><Th right>{t('portfolio.col.fees')}</Th><Th>{t('portfolio.col.status')}</Th></tr></thead>
              <tbody>
                {closed.map((o) => (
                  <tr key={o.id} className="border-t border-ink-2" data-testid={`order-row-${o.id}`}>
                    <Td num className="text-fg-faint">{clockLabel(o.closedTick ?? o.placedTick, 720)}</Td>
                    <Td><span className={o.side === 'buy' ? 'text-gain' : 'text-loss'}>{o.side === 'buy' ? 'Buy' : 'Sell'}</span> {qty(o.qty)} {o.assetId} <span className="text-fg-faint">{o.type}{o.forced ? ' · liquidation' : ''}</span></Td>
                    <Td right num>{qty(o.filledQty)}</Td>
                    <Td right num>{o.filledQty ? price(o.avgFillPrice) : '—'}</Td>
                    <Td right num>{money(o.feesPaid)}</Td>
                    <Td className="text-fg-muted">{o.status}{o.rejectReason ? ` · ${o.rejectReason}` : ''}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-center text-caption text-fg-faint">{t('portfolio.universe', { count: config.assets.filter((a) => a.listed !== false).length, money: compactMoney(b.total) })}</p>
    </div>
  );
}
