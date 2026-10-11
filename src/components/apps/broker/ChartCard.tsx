'use client';

import { earningsInfo, estimateFill, liquidationPrice, REGIONS, sectorName, type OrderType, type Side } from '@/engine';
import { CHART_RANGES, INTERVALS, candleRealSeconds, intervalsFor, type ChartRange, type Interval } from '@/game/history';
import { INDICATORS } from '@/game/indicators';
import { money, price, qty as fmtQty, signedChange, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { isIndex, useGame } from '@/game/store';
import { t } from '@/i18n';
import { type MouseEvent, useEffect, useState } from 'react';
import { Chip, Flash, LockGlyph, Segmented } from '@/components/ui';
import { PriceChart } from './PriceChart';
import { kindLabel } from '@/components/os/eventText';
import { seriesInfo } from './seriesInfo';
import { alertDir, alertFired, buildLevels, defaultExitPrice, type ChartLevel, type LevelFormat } from './chartLevels';
import { useAlerts } from './alerts';

/** The order type's copy key (the chart's working-order lines name their type). */
const ORDER_LABEL: Record<OrderType, string> = {
  market: 'order.market', limit: 'order.limit', stop: 'order.stop', stop_limit: 'order.stop_limit', trailing: 'order.trailing',
};

/** The text of the chart's lines (spec 1.3): the pills of the average line, the take-profit and stop-loss, orders and alerts. */
function levelFormat(): LevelFormat {
  return {
    avg: (p, usd, pct) => t('broker.level.avg', { price: price(p), usd: signedMoney(usd), pct: signedPct(pct) }),
    exit: (k, p, usd, pct) => t(k === 'tp' ? 'broker.level.tp' : 'broker.level.sl', { price: price(p), usd: signedMoney(usd), pct: signedPct(pct) }),
    order: (side, type, p, q) => t('broker.level.order', {
      side: t(side === 'buy' ? 'common.buy' : 'common.sell'), type: t(ORDER_LABEL[type]), price: price(p), qty: fmtQty(q),
    }),
    alert: (p) => t('broker.level.alert', { price: price(p) }),
    addTp: t('broker.level.addTp'),
    addSl: t('broker.level.addSl'),
  };
}

/** The real time a candle takes, as the caption and the tooltip say it: seconds under a minute, minutes after. */
export function realTimeText(seconds: number): string {
  if (seconds < 60) return t('broker.real.seconds', { n: Math.round(seconds) });
  return t('broker.real.minutes', { n: (seconds / 60).toFixed(1) });
}

/**
 * The Broker's chart: the ticker, price and day move, the interval and range controls with the real time a candle takes,
 * the percent-axis switch, the style switch and the indicators menu. A window passes its own ticker. `narrow` (a phone or
 * a narrow window) drops the OHLC line. The card fills its slot: the terminal (or the phone layout) gives it the height.
 */
export function ChartCard({ ticker, narrow = false }: { ticker: string; narrow?: boolean }) {
  const world = useGame((s) => s.world)!;
  // the live world event's window, shaded on the chart from its onset (never its end)
  const ev = useGame((s) => s.frame?.worldEvent ?? null);
  const eventBand = ev && ev.phase === 'live' && ev.kind && ev.sinceTick !== undefined
    ? { sinceTick: ev.sinceTick, kind: ev.kind, label: t('event.label', { kind: kindLabel(ev.kind), day: ev.elapsedDays + 1 }) }
    : undefined;
  useGame((s) => s.historyRev);
  useGame((s) => s.config);
  const rankId = useGame((s) => s.me?.player.rankId ?? 'R0');
  const range = useGame((s) => s.range);
  const setRange = useGame((s) => s.setRange);
  const interval = useGame((s) => s.interval);
  const setInterval = useGame((s) => s.setInterval);
  const mode = useGame((s) => s.chartMode);
  const setMode = useGame((s) => s.setChartMode);
  const playerId = useGame((s) => s.playerId);
  const info = seriesInfo(world, ticker, rankId);
  // the engine's own margin trigger for a held margin or short position (null when none applies): the chart draws it
  const liq = !isIndex(info.id) && world && playerId ? liquidationPrice(world, playerId, info.id) : null;
  const marks = liq === null ? [] : [{ price: liq, title: t('broker.liquidation') }];
  // The position and orders on this ticker (spec 1.3): the average line, the legs, the working orders and the alerts. The
  // selectors read stored arrays and objects as they are, so the lines rebuild only when the account changes.
  const orders = useGame((s) => s.me?.orders);
  const pos = useGame((s) => s.me?.account?.positions[info.id]);
  const alerts = useAlerts((s) => s.alerts);
  const act = useGame((s) => s.act);
  const heldQty = pos?.qty ?? 0;
  // the cash the closing order would move now (a sell's proceeds, or a cover's cost), so the average line's P&L is what closing books
  const closeTotal = world && heldQty !== 0 && !isIndex(info.id) ? estimateFill(world, { assetId: info.id, side: heldQty > 0 ? 'sell' : 'buy', qty: Math.abs(heldQty) }).total : 0;
  const levels = buildLevels({
    qty: heldQty, avgCost: pos?.avgCost ?? 0, closeTotal,
    orders: (orders ?? []).filter((o) => o.assetId === info.id && o.status === 'open'),
    alerts: alerts.filter((a) => a.assetId === info.id).map((a) => ({ id: a.id, price: a.price, dir: a.dir })),
    fmt: levelFormat(),
  });
  // Dragging a working order's line modifies that order: a stop moves its stop price, any other order its limit (spec 1.3).
  const commitLevel = async (l: ChartLevel, p: number) => {
    if (!l.orderId) return;
    const o = (orders ?? []).find((x) => x.id === l.orderId);
    if (!o) return;
    const patch = o.type === 'stop' || o.type === 'stop_limit' ? { stopPrice: p } : { limitPrice: p };
    const r = await act({ type: 'order.modify', orderId: o.id, ...patch });
    if (r.ok) useGame.getState().toast({ tone: 'info', text: t('broker.toast.moved', { price: price(p) }) });
  };
  const cancelLevel = async (l: ChartLevel) => {
    if (l.alertId) { useAlerts.getState().remove(l.alertId); return; }
    if (!l.orderId) return;
    const r = await act({ type: 'order.cancel', orderId: l.orderId });
    if (r.ok) useGame.getState().toast({ tone: 'info', text: t('broker.toast.cancelled') });
  };
  // +TP and +SL place the leg the position lacks, reduce-only, at the default distance; the line then drags like any other
  const addLeg = async (_l: ChartLevel, key: 'addTp' | 'addSl') => {
    if (!pos || pos.qty === 0) return;
    const kind = key === 'addTp' ? 'tp' : 'sl';
    const p = defaultExitPrice(kind, pos.qty, pos.avgCost);
    const type: OrderType = kind === 'tp' ? 'limit' : 'stop';
    const side: Side = pos.qty > 0 ? 'sell' : 'buy';
    const r = await act({
      type: 'order.place',
      order: { assetId: info.id, side, type, qty: Math.abs(pos.qty), reduceOnly: true, tif: 'gtc', ...(kind === 'tp' ? { limitPrice: p } : { stopPrice: p }) },
    });
    if (r.ok) useGame.getState().toast({ tone: 'info', text: t('broker.toast.placed', { price: price(p) }) });
  };
  // The chart menu: a buy limit or sell stop fills the ticket at that price for the player to send (it never sends itself);
  // an alert is a price the viewer is told about (alerts.ts).
  const menuPick = (kind: 'buyLimit' | 'sellStop' | 'alert', p: number) => {
    if (kind === 'alert') {
      useAlerts.getState().add({ assetId: info.id, price: p, dir: alertDir(p, info.price) });
      useGame.getState().toast({ tone: 'info', text: t('broker.alert.set', { ticker: info.id, price: price(p) }) });
      return;
    }
    const g = useGame.getState();
    if (g.selected !== info.id) g.select(info.id);
    useGame.getState().presetTicket(kind === 'buyLimit'
      ? { side: 'buy', type: 'limit', limitPrice: p }
      : { side: 'sell', type: 'stop', stopPrice: p });
  };
  // an alert that the mid crossed fires once: it is removed here, so a second Broker on the ticker does not repeat it
  useEffect(() => {
    const st = useAlerts.getState();
    for (const a of st.alerts) {
      if (a.assetId !== info.id || !alertFired(a, info.price)) continue;
      st.remove(a.id);
      useGame.getState().toast({ tone: 'info', text: t('broker.alert.fired', { ticker: a.assetId, price: price(a.price) }) });
    }
  }, [info.price, info.id]);
  // the side the line sits off the visible range, or null when it is drawn on the chart
  const [offSide, setOffSide] = useState<'above' | 'below' | null>(null);
  const [percent, setPercent] = useState(false);
  const day = useGame.getState().history.series[ticker]?.daily.at(-1);
  const toneCls = toneText[tone(info.change)];
  const region = REGIONS.find((r) => r.id === info.region);
  const tpd = world.config.ticksPerDay;
  const allowed = intervalsFor(range);
  const candleName = interval;
  const realText = realTimeText(candleRealSeconds(interval, tpd));
  const candleTip = t('broker.chart.realTip', { candle: candleName, real: realText, day: realTimeText(candleRealSeconds('1D', tpd)) });
  const intervalGroup = (
    <div title={candleTip} data-testid="interval-group" className="flex shrink-0 items-center gap-2">
      <Segmented
        label={t('broker.chart.interval')} size="sm"
        options={INTERVALS.map((i) => ({ value: i, label: i, testId: `interval-${i}`, disabled: !allowed.includes(i) }))}
        value={interval} onChange={(v) => setInterval(v as Interval)}
      />
      <span className="num text-caption text-fg-faint" data-testid="candle-real">{t('broker.chart.candleReal', { candle: candleName, real: realText })}</span>
    </div>
  );
  const rangeSeg = (
    <Segmented
      label={t('broker.chart.range')} size="sm" className="shrink-0"
      options={CHART_RANGES.map((r) => ({ value: r, label: r === 'ALL' ? t('broker.range.all') : r, testId: `range-${r}` }))}
      value={range} onChange={(v) => setRange(v as ChartRange)}
    />
  );
  const styleSeg = (
    <Segmented
      label={t('broker.chart.style')} size="sm" className="shrink-0"
      options={[{ value: 'candles', label: t('broker.chart.candles') }, { value: 'line', label: t('broker.chart.line') }]}
      value={mode} onChange={(v) => setMode(v as 'candles' | 'line')}
    />
  );
  const pctBtn = (
    <button
      type="button" aria-pressed={percent} onClick={() => setPercent((p) => !p)} data-testid="pct-axis" title={t('broker.chart.pctTip')}
      className={`h-7 shrink-0 rounded-md border px-2.5 text-caption ${percent ? 'border-brass/60 bg-brass/10 text-brass-hi' : 'border-ink-3 text-fg-faint hover:text-fg-muted'}`}
    >
      {t('broker.chart.pct')}
    </button>
  );
  return (
    <section className="flex h-full min-h-0 flex-col" data-testid="chart-card">
      {/* The header: the ticker and price, then the controls. Phone widths keep one line of price and one scrolling toolbar,
          so the chart keeps its share of the height. */}
      <div className={narrow ? "px-3 pt-2" : "flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-3 pt-2.5"}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-body font-semibold text-fg" data-testid="chart-ticker">{info.id}</span>
            <span className="truncate text-small text-fg-muted">{info.name}</span>
            <Chip>{info.cls === 'index' ? t('broker.index') : sectorName(info.sector)}</Chip>
            {region && <Chip title={region.name}>{region.flag}</Chip>}
            {info.halted && <Chip className="border-warn/60 text-warn">{t('broker.halted')}</Chip>}
            {info.delisted && <Chip className="border-loss/60 text-loss">{t('broker.delisted')}</Chip>}
            {info.cls !== 'index' && !info.tradable && !info.delisted && <Chip title={t('broker.notTradable.note')}>{t('broker.notTradable')}</Chip>}
            {info.locked && <Chip className="border-steel/60 text-steel"><LockGlyph size={12} /> {t('broker.proLicense')}</Chip>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
            <Flash value={info.price} className="num text-price text-fg"><span data-testid="chart-price">{price(info.price)}</span></Flash>
            <span className={`num text-small ${toneCls}`}>{signedChange(info.change, info.price)} ({signedPct(info.changePct)})</span>
            <span className="text-caption text-fg-faint">{t('broker.todayPct')}</span>
          </div>
          {day && !narrow && (
            <div className="num mt-0.5 flex flex-wrap gap-4 text-caption text-fg-faint">
              <span>{t('broker.ohlc.open')} <span className="text-fg-muted">{price(day.open)}</span></span>
              <span>{t('broker.ohlc.high')} <span className="text-fg-muted">{price(day.high)}</span></span>
              <span>{t('broker.ohlc.low')} <span className="text-fg-muted">{price(day.low)}</span></span>
              {day.volume !== undefined && <span>{t('broker.ohlc.volume')} <span className="text-fg-muted">{compactNum(day.volume)}</span></span>}
              <EarningsBadge assetId={info.id} />
            </div>
          )}
        </div>
        {!narrow && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {intervalGroup}
            {rangeSeg}
          </div>
        )}
      </div>
      {narrow ? (
        <div className="flex items-center gap-2 overflow-x-auto px-3 pb-1.5 pt-1.5 [&>*]:shrink-0" data-testid="chart-toolbar">
          {intervalGroup}
          {rangeSeg}
          {styleSeg}
          {pctBtn}
          <IndicatorMenu />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
          <div className="flex items-center gap-2">
            {styleSeg}
            {pctBtn}
          </div>
          <IndicatorMenu />
        </div>
      )}
      <div className="relative min-h-0 flex-1 px-1 pb-1">
        <PriceChart
          assetId={info.id} marks={marks} onMarkOff={setOffSide} eventBand={eventBand} percent={percent}
          levels={levels} onLevelCommit={commitLevel} onLevelCancel={cancelLevel} onLevelAction={addLeg}
          onMenuPick={isIndex(info.id) ? undefined : menuPick}
        />
      </div>
      {liq !== null && offSide !== null && (
        <p className="px-3 pb-1 text-caption text-fg-faint" data-testid="liquidation-off">
          {t(offSide === 'above' ? 'broker.liquidationOff.above' : 'broker.liquidationOff.below', { price: money(liq), pct: distancePct(liq, info.price) })}
        </p>
      )}
      {liq !== null && offSide === null && <p className="px-3 pb-1 text-caption text-fg-faint" data-testid="liquidation-note">{t('broker.liquidationNote', { price: price(liq) })}</p>}
    </section>
  );
}

/**
 * The indicators menu: the studies with a switch each. A click on the button opens it; a click anywhere else closes it.
 * The active ones show in the chart legend with their values (PriceChart).
 */
export function IndicatorMenu() {
  const [open, setOpen] = useState(false);
  // the menu is placed under its button in the viewport: a toolbar that scrolls (the phone) would clip an absolute one
  const [at, setAt] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const indicators = useGame((s) => s.indicators);
  const toggle = useGame((s) => s.toggleIndicator);
  const on = INDICATORS.filter((i) => indicators[i.id]).length;
  const flip = (e: MouseEvent<HTMLButtonElement>) => {
    if (!open) {
      const r = e.currentTarget.getBoundingClientRect();
      setAt({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  };
  return (
    <div className="relative shrink-0">
      <button
        type="button" aria-expanded={open} aria-haspopup="menu" onClick={flip} data-testid="indicators-menu"
        className={`h-7 rounded-md border px-2.5 text-caption ${on > 0 ? 'border-brass/60 bg-brass/10 text-brass-hi' : 'border-ink-3 text-fg-faint hover:text-fg-muted'}`}
      >
        {t('broker.indicators')}{on > 0 ? ` (${on})` : ''}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[5]" onClick={() => setOpen(false)} aria-hidden />
          <ul role="menu" aria-label={t('broker.indicators')} style={{ top: at.top, right: at.right }} className="fixed z-[6] w-64 rounded-md border border-ink-3 bg-ink-1 p-1 shadow-lg">
            {INDICATORS.map((ind) => (
              <li key={ind.id} role="none">
                <label role="menuitemcheckbox" aria-checked={!!indicators[ind.id]} title={t(`broker.ind.${ind.id}`)} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-small text-fg-muted hover:bg-ink-2 hover:text-fg">
                  <input type="checkbox" checked={!!indicators[ind.id]} onChange={() => toggle(ind.id)} data-testid={`ind-${ind.id}`} />
                  <span>{ind.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** How far a price sits from the current price, as a whole percent of the current price (27900 for 280 times it). */
export function distancePct(level: number, now: number): string {
  if (!(now > 0)) return '';
  return `${Math.round(Math.abs(level / now - 1) * 100).toLocaleString('en-US')}%`;
}

export function compactNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(n < 10 ? 2 : 0);
}

/** A report inside the next ten game days, shown on the chart header (never for an index). */
export function EarningsBadge({ assetId }: { assetId: string }) {
  const world = useGame((s) => s.world);
  if (!world || isIndex(assetId)) return null;
  const e = earningsInfo(world, assetId);
  if (!e || e.daysAway < 0 || e.daysAway > 10) return null;
  const when = e.daysAway === 0 ? t('broker.when.today') : e.daysAway === 1 ? t('broker.when.tomorrow') : t('broker.when.inDays', { n: e.daysAway });
  return <span className="text-brass">{t('broker.earningsBadge', { when })}</span>;
}
