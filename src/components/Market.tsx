'use client';

import { portfolio, quote } from '@/engine';
import type { WorldState } from '@/engine';
import { dayOpen, RANGES, sparkline, type History, type RangeId } from '@/game/history';
import { money, pct, price, qty, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { INDEX_ID, PLAYER, useGame } from '@/game/store';
import { PriceChart } from './PriceChart';
import { Card, Chip, Flash, LockGlyph, Segmented, Sparkline } from './ui';
import { licenseCheck } from '@/game/license';

const locked = (w: WorldState, id: string) => !licenseCheck(w, PLAYER, id).ok;

export interface SeriesInfo {
  id: string;
  name: string;
  sector: string;
  tradable: boolean;
  price: number;
  change: number;
  changePct: number;
  halted: boolean;
}

export function seriesInfo(world: WorldState, history: History, id: string): SeriesInfo {
  const idx = world.config.indices.find((i) => i.id === id);
  const last = history.series[id]?.daily.at(-1);
  if (idx) {
    const p = last?.close ?? idx.base;
    const o = dayOpen(history, id) ?? p;
    return { id, name: idx.name, sector: 'index', tradable: false, price: p, change: p - o, changePct: o ? p / o - 1 : 0, halted: false };
  }
  const def = world.config.assets.find((a) => a.id === id)!;
  const q = quote(world, id);
  const o = dayOpen(history, id) ?? q.price;
  return { id, name: def.name, sector: def.sector, tradable: true, price: q.price, change: q.price - o, changePct: o ? q.price / o - 1 : 0, halted: q.halted };
}

export function watchIds(world: WorldState): string[] {
  return [INDEX_ID, ...world.config.assets.map((a) => a.id)];
}

const RANGE_OPTS = RANGES.map((r) => ({ value: r, label: r, testId: `range-${r}` }));

export function ChartCard({ phone = false }: { phone?: boolean }) {
  const world = useGame((s) => s.world)!;
  const history = useGame((s) => s.history)!;
  useGame((s) => s.historyRev);
  const selected = useGame((s) => s.selected);
  const range = useGame((s) => s.range);
  const setRange = useGame((s) => s.setRange);
  const mode = useGame((s) => s.chartMode);
  const setMode = useGame((s) => s.setChartMode);
  const info = seriesInfo(world, history, selected);
  const day = history.series[selected]?.daily.at(-1);
  const t = toneText[tone(info.change)];
  const ranges = phone ? RANGE_OPTS.filter((r) => r.value !== '1Q') : RANGE_OPTS;

  return (
    <Card className="flex flex-col p-4" data-testid="chart-card">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-body font-semibold text-fg" data-testid="chart-ticker">{info.id}</span>
            <span className="truncate text-small text-fg-muted">{info.name}</span>
            <Chip>{info.sector}</Chip>
            {info.halted && <Chip className="border-warn/60 text-warn">Halted</Chip>}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <Flash value={info.price} className="num text-price text-fg">
              <span data-testid="chart-price">{price(info.price)}</span>
            </Flash>
            <span className={`num text-small ${t}`}>
              {info.change >= 0 ? '+' : '\u2212'}{price(Math.abs(info.change))} ({signedPct(info.changePct)})
            </span>
            <span className="text-caption text-fg-faint">today</span>
          </div>
          {day && !phone && (
            <div className="num mt-1 flex gap-4 text-caption text-fg-faint">
              <span>O <span className="text-fg-muted">{price(day.open)}</span></span>
              <span>H <span className="text-fg-muted">{price(day.high)}</span></span>
              <span>L <span className="text-fg-muted">{price(day.low)}</span></span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<RangeId> label="Chart range" options={ranges} value={range} onChange={setRange} size="sm" />
          {!phone && (
            <Segmented
              label="Chart style"
              options={[{ value: 'candles', label: 'Candles' }, { value: 'line', label: 'Line' }]}
              value={mode}
              onChange={setMode}
              size="sm"
            />
          )}
        </div>
      </div>
      <div className={`mt-3 ${phone ? 'h-56' : 'h-[clamp(260px,38vh,380px)]'}`}>
        <PriceChart assetId={selected} />
      </div>
    </Card>
  );
}

export function Positions({ phone = false }: { phone?: boolean }) {
  const world = useGame((s) => s.world)!;
  const history = useGame((s) => s.history)!;
  const select = useGame((s) => s.select);
  const pf = portfolio(world, PLAYER);
  const rows = [...pf.positions].sort((a, b) => b.marketValue - a.marketValue);
  const cashWeight = pf.equity > 0 ? pf.cash / pf.equity : 1;
  const nameOf = (id: string) => world.config.assets.find((a) => a.id === id)?.name ?? id;

  const header = (
    <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
      <h2 className="font-serif text-title text-fg">Positions</h2>
      <span className="num text-caption text-fg-faint" data-testid="positions-pnl">
        Unrealized <span className={toneText[tone(pf.unrealizedPnl)]}>{signedMoney(pf.unrealizedPnl)}</span>
      </span>
    </div>
  );

  const empty = rows.length === 0 && (
    <p className="px-4 pb-4 text-small text-fg-muted" data-testid="positions-empty">
      No positions yet. Pick an asset and place your first trade; Simple mode caps it at 20% of your cash.
    </p>
  );

  const cashRow = (
    <div className="flex items-center justify-between border-t border-ink-2 px-4 py-3 text-small">
      <span className="text-fg-muted">Cash</span>
      <span className="num text-fg" data-testid="cash">
        {money(pf.cash)} <span className="text-fg-faint">&middot; {pct(cashWeight)}</span>
      </span>
    </div>
  );

  if (phone) {
    return (
      <Card data-testid="positions">
        {header}
        {empty}
        <ul>
          {rows.map((p) => (
            <li key={p.assetId}>
              <button type="button" onClick={() => select(p.assetId)} className="flex min-h-14 w-full items-center gap-3 border-t border-ink-2 px-4 py-2 text-left" data-testid={`position-${p.assetId}`}>
                <div className="min-w-0 flex-1">
                  <div className="num text-small font-semibold text-fg">{p.assetId}</div>
                  <div className="num truncate text-caption text-fg-faint">{qty(p.qty)} &times; {price(p.avgCost)}</div>
                </div>
                <Sparkline data={sparkline(history, p.assetId, 5)} width={56} height={22} />
                <div className="text-right">
                  <div className="num text-small text-fg">{money(p.marketValue)}</div>
                  <div className={`num text-caption ${toneText[tone(p.unrealizedPnl)]}`}>{signedMoney(p.unrealizedPnl)} &middot; {signedPct(p.unrealizedPct)}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
        {cashRow}
      </Card>
    );
  }

  return (
    <Card data-testid="positions">
      {header}
      {empty}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-small">
            <thead>
              <tr className="label text-right [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th className="!pl-4 text-left">Asset</th>
                <th>Qty</th>
                <th>Avg</th>
                <th>Last</th>
                <th>Value</th>
                <th>P&amp;L</th>
                <th>Weight</th>
                <th className="!pr-4">5D</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.assetId}
                  onClick={() => select(p.assetId)}
                  className="num cursor-pointer border-t border-ink-2 text-right text-fg hover:bg-ink-2 [&>td]:px-3 [&>td]:py-2.5"
                  data-testid={`position-${p.assetId}`}
                >
                  <td className="!pl-4 text-left">
                    <div className="font-semibold">{p.assetId}</div>
                    <div className="font-sans text-caption text-fg-faint">{nameOf(p.assetId)}</div>
                  </td>
                  <td>{qty(p.qty)}</td>
                  <td className="text-fg-muted">{price(p.avgCost)}</td>
                  <td>{price(p.price)}</td>
                  <td>{money(p.marketValue)}</td>
                  <td className={toneText[tone(p.unrealizedPnl)]}>
                    <div>{signedMoney(p.unrealizedPnl)}</div>
                    <div className="text-caption">{signedPct(p.unrealizedPct)}</div>
                  </td>
                  <td className="text-fg-muted">{pct(p.weight)}</td>
                  <td className="!pr-4">
                    <Sparkline data={sparkline(history, p.assetId, 5)} className="ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cashRow}
    </Card>
  );
}

export function Watchlist() {
  const world = useGame((s) => s.world)!;
  const history = useGame((s) => s.history)!;
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  return (
    <Card className="flex min-h-0 flex-col" data-testid="watchlist">
      <h2 className="px-4 pt-4 pb-2 font-serif text-title text-fg">Watchlist</h2>
      <ul className="min-h-0 overflow-y-auto pb-2">
        {watchIds(world).map((id) => {
          const s = seriesInfo(world, history, id);
          const on = id === selected;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => select(id)}
                aria-current={on ? 'true' : undefined}
                data-testid={`watch-${id}`}
                className={`grid min-h-11 w-full grid-cols-[1fr_auto_auto] items-center gap-3 border-l-2 px-4 py-1.5 text-left transition-colors duration-[var(--dur-fast)] ${
                  on ? 'border-brass bg-ink-2' : 'border-transparent hover:bg-ink-2'
                }`}
              >
                <span className="min-w-0">
                  <span className="num flex items-center gap-1 text-small font-semibold text-fg">
                    {id}
                    {locked(world, id) && <LockGlyph size={14} />}
                  </span>
                  <span className="block truncate text-caption text-fg-faint">{s.name}</span>
                </span>
                <Sparkline data={sparkline(history, id, 1, 32)} width={48} height={20} />
                <span className="text-right">
                  <span className="num block text-small text-fg">{price(s.price)}</span>
                  <span className={`num block text-caption ${s.halted ? 'text-warn' : toneText[tone(s.changePct)]}`}>
                    {s.halted ? 'Halted' : signedPct(s.changePct)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Phone: the watchlist as a horizontal strip of tickers above the chart. */
export function TickerStrip() {
  const world = useGame((s) => s.world)!;
  const history = useGame((s) => s.history)!;
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  return (
    <nav aria-label="Assets" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex w-max gap-2">
        {watchIds(world).map((id) => {
          const s = seriesInfo(world, history, id);
          const on = id === selected;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => select(id)}
                aria-current={on ? 'true' : undefined}
                data-testid={`watch-${id}`}
                className={`flex min-h-11 flex-col justify-center rounded-md border px-3 text-left ${on ? 'border-brass bg-ink-2' : 'border-ink-3 bg-ink-1'}`}
              >
                <span className="num flex items-center gap-1 text-caption font-semibold text-fg">{id}{locked(world, id) && <LockGlyph size={12} />}</span>
                <span className={`num text-micro tracking-normal ${s.halted ? 'text-warn' : toneText[tone(s.changePct)]}`}>{s.halted ? 'Halted' : signedPct(s.changePct)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
