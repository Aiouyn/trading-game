'use client';

import { useState } from 'react';
import { portfolio } from '@/engine';
import type { Order } from '@/engine';
import { clockLabel } from '@/game/clock';
import { RANGES, type RangeId } from '@/game/history';
import { money, pct, price, qty, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { allocation, orderLog, type Slice } from '@/game/portfolioView';
import { NW_ID, PLAYER, useGame } from '@/game/store';
import { Positions } from './Market';
import { PriceChart } from './PriceChart';
import { Card, Flash, Segmented } from './ui';

const SLICE_COLOR: Record<Slice['id'], string> = {
  stock: 'bg-brass',
  crypto: 'bg-steel',
  commodity: 'bg-brass-lo',
  forex: 'bg-info',
  bond: 'bg-gain',
  realestate: 'bg-warn',
  cash: 'bg-ink-3',
};

function NetWorthCard({ phone }: { phone: boolean }) {
  const world = useGame((s) => s.world)!;
  useGame((s) => s.historyRev);
  const [range, setRange] = useState<RangeId>('1W');
  const pf = portfolio(world, PLAYER);
  const ret = pf.startingCash > 0 ? pf.totalPnl / pf.startingCash : 0;
  const ranges = (phone ? RANGES.filter((r) => r !== '1Q') : RANGES).map((r) => ({ value: r, label: r, testId: `nw-range-${r}` }));

  return (
    <Card className="flex flex-col p-4" data-testid="networth-card">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        {/* the header already shows net worth and today's move, so this card leads with the all-time result */}
        <div className="min-w-0">
          <h2 className="font-serif text-title text-fg">Net worth history</h2>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <Flash value={pf.totalPnl} className={`num text-price ${toneText[tone(pf.totalPnl)]}`}>
              <span data-testid="networth-total">{signedMoney(pf.totalPnl)}</span>
            </Flash>
            <span className={`num text-small ${toneText[tone(pf.totalPnl)]}`} data-testid="networth-return">{signedPct(ret)}</span>
            <span className="text-caption text-fg-faint">since you started with {money(pf.startingCash)}</span>
          </div>
          <div className="num mt-1 text-caption text-fg-faint">
            Now <span className="text-fg-muted" data-testid="networth">{money(pf.equity)}</span>
            <span className="mx-2">&middot;</span>
            Peak <span className="text-fg-muted">{money(pf.peakEquity)}</span>
          </div>
        </div>
        <Segmented<RangeId> label="Net worth range" options={ranges} value={range} onChange={setRange} size="sm" />
      </div>
      <div className={`mt-3 ${phone ? 'h-[220px]' : 'h-[320px]'}`}>
        <PriceChart assetId={NW_ID} range={range} mode="line" testId="networth-chart" />
      </div>
    </Card>
  );
}

function Stat({ label, value, className = '', testId }: { label: string; value: string; className?: string; testId: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-ink-2/60 px-3 py-2">
      <span className="label">{label}</span>
      <span className={`num text-body ${className || 'text-fg'}`} data-testid={testId}>{value}</span>
    </div>
  );
}

function StatsCard() {
  const world = useGame((s) => s.world)!;
  const pf = portfolio(world, PLAYER);
  const invested = pf.positions.reduce((a, p) => a + p.marketValue, 0);
  return (
    <Card className="p-4" data-testid="portfolio-stats">
      <h2 className="mb-3 font-serif text-title text-fg">Performance</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Cash" value={money(pf.cash)} testId="stat-cash" />
        <Stat label="Invested" value={money(invested)} testId="stat-invested" />
        <Stat label="Realized" value={signedMoney(pf.realizedPnl)} className={toneText[tone(pf.realizedPnl)]} testId="stat-realized" />
        <Stat label="Unrealized" value={signedMoney(pf.unrealizedPnl)} className={toneText[tone(pf.unrealizedPnl)]} testId="stat-unrealized" />
        <Stat label="Fees paid" value={money(pf.feesPaid)} testId="stat-fees" />
        <Stat label="Peak" value={money(pf.peakEquity)} testId="stat-peak" />
        <Stat label="Drawdown" value={pct(Math.abs(pf.drawdown))} className={pf.drawdown < 0 ? 'text-loss' : ''} testId="stat-drawdown" />
        <Stat label="Max drawdown" value={pct(Math.abs(pf.maxDrawdown))} className={pf.maxDrawdown < 0 ? 'text-loss' : ''} testId="stat-maxdd" />
      </div>
    </Card>
  );
}

function AllocationCard() {
  const world = useGame((s) => s.world)!;
  const slices = allocation(world, PLAYER);
  return (
    <Card className="p-4" data-testid="allocation">
      <h2 className="mb-3 font-serif text-title text-fg">Allocation</h2>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-2" role="img" aria-label={slices.map((s) => `${s.label} ${pct(s.weight)}`).join(', ')}>
        {slices.map((s) => (
          <div key={s.id} className={SLICE_COLOR[s.id]} style={{ width: `${Math.max(0, s.weight) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {slices.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-small" data-testid={`alloc-${s.id}`}>
            <span className={`size-2.5 rounded-sm ${SLICE_COLOR[s.id]}`} aria-hidden />
            <span className="flex-1 text-fg-muted">{s.label}</span>
            <span className="num text-fg">{money(s.value)}</span>
            <span className="num w-14 text-right text-fg-faint">{pct(s.weight)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const STATUS_TONE: Record<Order['status'], string> = {
  filled: 'text-fg-muted',
  open: 'text-brass-hi',
  cancelled: 'text-fg-faint',
  expired: 'text-fg-faint',
  rejected: 'text-loss',
};

function OrderHistoryCard({ phone }: { phone: boolean }) {
  const world = useGame((s) => s.world)!;
  const tpd = world.config.ticksPerDay;
  const orders = orderLog(world, PLAYER);
  const when = (o: Order) => clockLabel(o.closedTick ?? o.placedTick, tpd);
  const sideText = (o: Order) => (o.side === 'buy' ? 'Buy' : 'Sell');
  const fillText = (o: Order) => (o.filledQty > 0 ? `${qty(o.filledQty)} @ ${price(o.avgFillPrice)}` : `${qty(o.qty)} ${o.type}`);

  return (
    <Card data-testid="order-history">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="font-serif text-title text-fg">Order history</h2>
        <span className="num text-caption text-fg-faint">{orders.length === 50 ? 'Latest 50' : `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`}</span>
      </div>
      {orders.length === 0 && <p className="px-4 pb-4 text-small text-fg-muted" data-testid="order-history-empty">No orders yet. Your trades will show up here.</p>}
      {orders.length > 0 && phone && (
        <ul>
          {orders.map((o) => (
            <li key={o.id} className="flex items-center gap-3 border-t border-ink-2 px-4 py-2" data-testid={`order-row-${o.id}`}>
              <div className="min-w-0 flex-1">
                <div className="num text-small text-fg"><span className={o.side === 'buy' ? 'text-gain' : 'text-loss'}>{sideText(o)}</span> {o.assetId}</div>
                <div className="num truncate text-caption text-fg-faint">{when(o)}</div>
              </div>
              <div className="text-right">
                <div className="num text-small text-fg">{fillText(o)}</div>
                <div className={`text-caption capitalize ${STATUS_TONE[o.status]}`}>{o.status}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {orders.length > 0 && !phone && (
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full text-small">
            <thead>
              <tr className="text-left">
                {['Time', 'Side', 'Asset', 'Type', 'Filled', 'Fees', 'Status'].map((h) => (
                  <th key={h} className={`label px-2 py-2 font-medium ${h === 'Filled' || h === 'Fees' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-ink-2" data-testid={`order-row-${o.id}`}>
                  <td className="num px-2 py-2 text-fg-faint">{when(o)}</td>
                  <td className={`px-2 py-2 ${o.side === 'buy' ? 'text-gain' : 'text-loss'}`}>{sideText(o)}</td>
                  <td className="num px-2 py-2 font-semibold text-fg">{o.assetId}</td>
                  <td className="px-2 py-2 capitalize text-fg-muted">{o.type}</td>
                  <td className="num px-2 py-2 text-right text-fg">{fillText(o)}</td>
                  <td className="num px-2 py-2 text-right text-fg-muted">{money(o.feesPaid)}</td>
                  <td className={`px-2 py-2 capitalize ${STATUS_TONE[o.status]}`} title={o.rejectReason}>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Portfolio tab: net worth history, performance, allocation, positions and order history. */
export function PortfolioView({ phone = false }: { phone?: boolean }) {
  if (phone) {
    return (
      <div className="flex flex-col gap-4" data-testid="portfolio-view">
        <NetWorthCard phone />
        <StatsCard />
        <AllocationCard />
        <Positions phone />
        <OrderHistoryCard phone />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="portfolio-view">
      <NetWorthCard phone={false} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <StatsCard />
        <AllocationCard />
      </div>
      <Positions />
      <OrderHistoryCard phone={false} />
    </div>
  );
}
