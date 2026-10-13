'use client';

import { type MouseEvent, useEffect, useRef, useState } from 'react';
import {
  AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, PriceScaleMode, createChart,
  type AutoscaleInfoProvider, type CandlestickData, type HandleScaleOptions, type IChartApi, type IPriceLine, type ISeriesApi, type LineData,
  type MouseEventParams, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import { assetDefOf, useGame } from '@/game/store';
import { axisTimeLabel, barTimeLabel, barsFor, rangeIsIntraday, type Bar, type ChartRange, type Interval } from '@/game/history';
import { INDICATORS, bollinger, ema, latestValues, rsi, sma, vwap, type IndicatorId } from '@/game/indicators';
import { assetPrice, dec, signedPct } from '@/game/format';
import { priceRule, type AssetClass } from '@/engine';
import { t } from '@/i18n';
import { type ChartLevel, type PriceScale, priceOfY, roundPrice, wheelZoomRange, yOfPrice } from './chartLevels';
import { LevelLayer } from './LevelLayer';

/**
 * Colors come from the design tokens at runtime: a hidden probe uses the token classes and we
 * read the computed colors, so no hex lives in this component.
 */
const PROBE = {
  bg: 'text-ink-1', grid: 'text-ink-2', text: 'text-fg-faint', gain: 'text-gain', loss: 'text-loss', brass: 'text-brass',
  line: 'text-fg', cross: 'text-fg-disabled', info: 'text-info', steel: 'text-steel', warn: 'text-warn',
} as const;

type Palette = Record<keyof typeof PROBE, string> & { font: string };

function readPalette(host: HTMLElement): Palette {
  const out = {} as Palette;
  for (const [k, cls] of Object.entries(PROBE) as [keyof typeof PROBE, string][]) {
    const s = document.createElement('span');
    s.className = cls;
    host.appendChild(s);
    out[k] = getComputedStyle(s).color;
    s.remove();
  }
  const f = document.createElement('span');
  f.className = 'num';
  host.appendChild(f);
  out.font = getComputedStyle(f).fontFamily;
  f.remove();
  return out;
}

const toTime = (t: number) => t as UTCTimestamp;

/** Any CSS color as rgba with the given alpha, via a 1×1 canvas. */
function withAlpha(color: string, alpha: number): string {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const g = c.getContext('2d');
  if (!g) return color;
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${gg}, ${b}, ${alpha})`;
}

const PRICE_MARGINS = { top: 0.08, bottom: 0.26 };
const VOLUME_MARGINS = { top: 0.8, bottom: 0.02 };

/**
 * The narrowest price range the plot shows, as a share of the price (spec 1.2): a 0.1% wiggle never fills the plot, so the
 * axis spans at least half a percent either side of the middle. The percent axis keeps the same floor: lightweight-charts hands
 * the autoscale rule its range in price, and the percent view is drawn from that range, so a 0.1% wiggle fills no more of the
 * plot in % mode than in price mode.
 */
export const MIN_SPAN_SHARE = 0.005;

/**
 * The mouse gestures on the scales, as TradingView has them: a press and drag on either axis scales it (the price axis
 * stretches or squeezes the candles, the time axis the bars), and a double-click on an axis resets it to auto. The plot's own
 * drag still scrolls and its wheel still zooms the time scale (handleScroll and handleScale.mouseWheel keep their defaults).
 */
export const SCALE_GESTURES: Pick<HandleScaleOptions, 'axisPressedMouseMove' | 'axisDoubleClickReset'> = {
  axisPressedMouseMove: { time: true, price: true },
  axisDoubleClickReset: { time: true, price: true },
};

/** The autoscale rule for a price series: widen a too-narrow visible range about its middle. */
export function spanFloor(): AutoscaleInfoProvider {
  return (base) => {
    const res = base();
    if (!res || !res.priceRange) return res;
    const { minValue, maxValue } = res.priceRange;
    const mid = (minValue + maxValue) / 2;
    const floor = Math.abs(mid) * MIN_SPAN_SHARE;
    if (maxValue - minValue >= floor) return res;
    return { ...res, priceRange: { minValue: mid - floor / 2, maxValue: mid + floor / 2 } };
  };
}

type LineKey = 'sma20' | 'sma50' | 'ema12' | 'bbU' | 'bbL' | 'vwap' | 'rsi';

/** A thin extra line drawn over an explicit series (the net worth chart's benchmark ghosts). Colors are the token names of PROBE. */
export interface ChartOverlay {
  id: string;
  color: 'line' | 'steel' | 'info' | 'warn' | 'brass';
  dashed?: boolean;
  points: { time: number; value: number }[];
}

/** One line of the chart legend: an active indicator and its latest value. */
interface LegendRow { id: IndicatorId; label: string; value: string }

/** The crosshair readout: the candle (or line value) under the pointer and its change against the range's first open. */
interface Readout { time: number; o?: number; h?: number; l?: number; c: number; change: number }

/** Two placements are the same when every line sits on the same row (a re-render that moves nothing does not re-render the lines). */
function sameRows(a: Record<string, number | null>, b: Record<string, number | null>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

/** The menu's three picks, in the order they are listed (the labels are the copy's keys, so the i18n check finds them). */
const MENU_PICKS: { kind: 'buyLimit' | 'sellStop' | 'alert'; key: string }[] = [
  { kind: 'buyLimit', key: 'broker.menu.buyLimit' },
  { kind: 'sellStop', key: 'broker.menu.sellStop' },
  { kind: 'alert', key: 'broker.menu.alert' },
];

export function PriceChart({ assetId, range: rangeOverride, interval: intervalOverride, mode: modeOverride, testId = 'price-chart', series, studies = true, overlays, marks, onMarkOff, eventBand, percent = false, levels, onLevelCommit, onLevelCancel, onLevelAction, onMenuPick }: {
  assetId: string;
  range?: ChartRange;
  interval?: Interval;
  mode?: 'candles' | 'line' | 'area';
  testId?: string;
  /** chart an explicit series instead of the history (net worth) */
  series?: { time: number; value: number }[];
  /** the studies and their legend: on for the Broker chart, off for an explicit series */
  studies?: boolean;
  /** extra lines over an explicit series; only the ones listed are drawn */
  overlays?: ChartOverlay[];
  /** horizontal lines at a price (the liquidation line), drawn on every series so each chart style shows them */
  marks?: { price: number; title: string }[];
  /** reports the side the first mark sits off the visible price range (null when it is on the chart); the caller says so */
  onMarkOff?: (side: 'above' | 'below' | null) => void;
  /** a live world event: its window is shaded from the onset to now (velvet-world-events.md section 4); never its end */
  eventBand?: { sinceTick: number; kind: 'crash' | 'bubble' | 'crisis' | 'flash'; label: string };
  /** the price axis shows percent from the first visible value (spec 1.2, the optional % axis) */
  percent?: boolean;
  /** the position and order lines (spec 1.3): drawn over the chart, dragged and cancelled from their pills */
  levels?: ChartLevel[];
  onLevelCommit?: (level: ChartLevel, price: number) => void;
  onLevelCancel?: (level: ChartLevel) => void;
  onLevelAction?: (level: ChartLevel, key: 'addTp' | 'addSl') => void;
  /** the chart menu (right-click or Alt+click at a price): the pick and the price it was made at */
  onMenuPick?: (kind: 'buyLimit' | 'sellStop' | 'alert', price: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleS = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineS = useRef<ISeriesApi<'Line'> | null>(null);
  const areaS = useRef<ISeriesApi<'Area'> | null>(null);
  const volS = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lines = useRef<Partial<Record<LineKey, ISeriesApi<'Line'>>>>({});
  const overlayS = useRef<Record<string, ISeriesApi<'Line'>>>({});
  const markLines = useRef<{ s: ISeriesApi<'Candlestick' | 'Line' | 'Area'>; l: IPriceLine }[]>([]);
  const pal = useRef<Palette | null>(null);
  const volColors = useRef({ up: '', down: '' });
  const last = useRef({ key: '', len: 0 });
  const probe = useRef<() => void>(() => {});
  // the first open of the loaded bars: the crosshair's change is measured from it
  const baseOpen = useRef(0);

  const storeRange = useGame((s) => s.range);
  const storeInterval = useGame((s) => s.interval);
  const storeMode = useGame((s) => s.chartMode);
  const indicators = useGame((s) => s.indicators);
  const toggle = useGame((s) => s.toggleIndicator);
  const range = rangeOverride ?? storeRange;
  const interval = intervalOverride ?? storeInterval;
  const mode = modeOverride ?? storeMode;
  const rev = useGame((s) => s.historyRev);
  const loaded = useGame((s) => !!s.loaded[assetId]);
  const [band, setBand] = useState<{ left: number; width: number } | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [legend, setLegend] = useState<LegendRow[]>([]);
  // the level lines' pixel rows, the price axis's width and the plot height: re-read after every render and on zoom or resize
  const [placed, setPlaced] = useState<{ y: Record<string, number | null>; axisW: number; h: number }>({ y: {}, axisW: 0, h: 0 });
  // the chart menu, opened at a price by a right-click or an Alt+click; its position is inside the chart
  const [menu, setMenu] = useState<{ x: number; y: number; price: number } | null>(null);
  const levelsRef = useRef<ChartLevel[]>([]);
  const bandFrom = eventBand?.sinceTick ?? null;
  const daily = interval === '1D' || !rangeIsIntraday(range);
  const tpd = useGame((s) => s.history.ticksPerDay);
  // the asset's class sets its price precision and tick (R-10-3); an index or the net-worth series is priced as a stock
  const assetCls: AssetClass = assetDefOf(assetId)?.assetClass ?? 'stock';
  const fmtAsset = (v: number) => assetPrice({ assetClass: assetCls }, v);
  // the axis's format inputs: the class, the percent toggle and the last price (its tick is the price's own)
  const axis = useRef({ cls: assetCls, percent: false, px: 0 });

  // the event window: from the first bar at or after the onset to the right edge; it follows zoom and scroll
  useEffect(() => {
    const c = chart.current;
    const el = host.current;
    if (bandFrom === null || !c || !el) { setBand(null); return; }
    const place = () => {
      const first = barsFor(useGame.getState().history, assetId, interval, range).find((b) => b.time >= bandFrom);
      const x = first ? c.timeScale().timeToCoordinate(toTime(first.time)) : null;
      setBand(x === null ? null : { left: Math.max(0, x), width: Math.max(0, el.clientWidth - Math.max(0, x)) });
    };
    place();
    c.timeScale().subscribeVisibleLogicalRangeChange(place);
    return () => c.timeScale().unsubscribeVisibleLogicalRangeChange(place);
  }, [bandFrom, rev, range, interval, loaded, assetId, mode]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const p = readPalette(el);
    pal.current = p;
    const c = createChart(el, {
      autoSize: true,
      // attribution moved to the Credits screen, as the Lightweight Charts license allows
      layout: { background: { type: ColorType.Solid, color: p.bg }, textColor: p.text, fontFamily: p.font, fontSize: 11, attributionLogo: false, panes: { separatorColor: p.grid } },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: PRICE_MARGINS },
      timeScale: { borderVisible: false, rightOffset: 4, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: p.cross, labelBackgroundColor: p.grid }, horzLine: { color: p.cross, labelBackgroundColor: p.grid } },
      handleScale: { ...SCALE_GESTURES },
    });
    const floor = spanFloor();
    candleS.current = c.addSeries(CandlestickSeries, {
      upColor: p.gain, downColor: p.loss, wickUpColor: p.gain, wickDownColor: p.loss, borderVisible: false,
      priceLineColor: p.brass, priceLineStyle: LineStyle.Dotted, priceLineWidth: 1, autoscaleInfoProvider: floor,
    });
    lineS.current = c.addSeries(LineSeries, { color: p.line, lineWidth: 2, priceLineColor: p.brass, priceLineStyle: LineStyle.Dotted, priceLineWidth: 1, visible: false, autoscaleInfoProvider: floor });
    areaS.current = c.addSeries(AreaSeries, {
      lineColor: p.brass, lineWidth: 2, topColor: withAlpha(p.brass, 0.16), bottomColor: withAlpha(p.brass, 0), priceLineColor: p.brass, priceLineStyle: LineStyle.Dotted, visible: false, autoscaleInfoProvider: floor,
    });
    volColors.current = { up: withAlpha(p.gain, 0.32), down: withAlpha(p.loss, 0.32) };
    volS.current = c.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale('volume').applyOptions({ scaleMargins: VOLUME_MARGINS, visible: false });
    chart.current = c;
    // a zoom or scroll changes the visible price range, so the mark is checked again
    const onRange = () => probe.current();
    c.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    // a resize moves every row, so the lines are placed again
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => probe.current());
    ro?.observe(el);

    // The price scale moves without a visible-range change (an axis drag, a wheel step on the axis, a double-click reset), so
    // the lines are placed again on those gestures too, once per frame. A wheel step over the price axis zooms the price
    // scale, as TradingView's does; the library would zoom the time scale for it.
    let frame = 0;
    const kick = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; probe.current(); }); };
    const right = () => c.priceScale('right');
    const onAxis = (e: { clientX: number }) => e.clientX - el.getBoundingClientRect().left >= el.clientWidth - right().width();
    const onWheel = (e: WheelEvent) => {
      if (!onAxis(e)) { kick(); return; }
      e.preventDefault();
      e.stopPropagation();
      const range = right().getVisibleRange();
      if (range && e.deltaY !== 0 && right().options().mode !== PriceScaleMode.Percentage) right().setVisibleRange(wheelZoomRange(range, e.deltaY));
      kick();
    };
    // a press starts the watch of the pointer until release; a drag that began on the axis leaves the scale as the player set it
    let pressedOnAxis: boolean | null = null;
    const onMove = () => kick();
    const onRelease = () => {
      if (pressedOnAxis === null) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onRelease);
      if (pressedOnAxis && !right().options().autoScale) {
        // the range is set through the API, so the next data does not refit a scale the player set
        const range = right().getVisibleRange();
        if (range) right().setVisibleRange(range);
      }
      pressedOnAxis = null;
      kick();
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pressedOnAxis = onAxis(e);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onRelease);
      kick();
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('dblclick', kick);

    return () => {
      ro?.disconnect();
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      el.removeEventListener('wheel', onWheel, { capture: true });
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('dblclick', kick);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onRelease);
      if (frame) cancelAnimationFrame(frame);
      c.remove();
      chart.current = null;
      candleS.current = null; lineS.current = null; areaS.current = null; volS.current = null;
      lines.current = {};
      overlayS.current = {};
      markLines.current = [];
      last.current = { key: '', len: 0 };
    };
  }, []);

  // the percent axis: the scale shows change from the first visible value, and the labels carry a %
  // The axis labels, the crosshair label and the series' price format follow the asset's own precision and tick (R-10-3), and
  // a percent axis reads 2 decimals. Called after the data (the tick is the price's own) and on a change of asset or percent.
  const applyAxis = () => {
    const c = chart.current;
    if (!c) return;
    const a = axis.current;
    const formatter = (v: number) => (a.percent ? `${dec(v, 2)}%` : assetPrice({ assetClass: a.cls }, v));
    const priceFormat = { type: 'custom' as const, formatter, minMove: a.percent ? 0.01 : priceRule(a.cls, a.px).tick };
    c.applyOptions({ localization: { priceFormatter: formatter } });
    for (const s of [candleS.current, lineS.current, areaS.current]) s?.applyOptions({ priceFormat });
  };
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    axis.current = { ...axis.current, cls: assetCls, percent };
    c.priceScale('right').applyOptions({ mode: percent ? PriceScaleMode.Percentage : PriceScaleMode.Normal });
    applyAxis();
    probe.current();
  }, [percent, assetCls]);

  // the crosshair readout: the candle under the pointer, and its change against the range's first open
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const onMove = (p: MouseEventParams<Time>) => {
      const s = mode === 'candles' ? candleS.current : mode === 'line' ? lineS.current : areaS.current;
      const d = p.time !== undefined && p.point && s ? p.seriesData.get(s as ISeriesApi<'Candlestick'>) : undefined;
      if (!d || baseOpen.current <= 0) { setReadout(null); return; }
      const bar = d as Partial<CandlestickData<Time>> & Partial<LineData<Time>>;
      const cl = bar.close ?? bar.value ?? 0;
      setReadout({ time: Number(p.time), o: bar.open, h: bar.high, l: bar.low, c: cl, change: cl / baseOpen.current - 1 });
    };
    c.subscribeCrosshairMove(onMove);
    return () => c.unsubscribeCrosshairMove(onMove);
  }, [mode]);

  // the overlay lines come and go with the list they are given; each one's points replace its last set
  useEffect(() => {
    const c = chart.current;
    const p = pal.current;
    if (!c || !p) return;
    const want = new Map((overlays ?? []).map((o) => [o.id, o] as const));
    for (const id of Object.keys(overlayS.current)) {
      if (!want.has(id)) { c.removeSeries(overlayS.current[id]!); delete overlayS.current[id]; }
    }
    for (const o of want.values()) {
      let s = overlayS.current[o.id];
      if (!s) {
        s = c.addSeries(LineSeries, {
          color: p[o.color], lineWidth: 1, lineStyle: o.dashed ? LineStyle.Dashed : LineStyle.Solid,
          lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        });
        overlayS.current[o.id] = s;
      }
      s.setData(o.points.map((x) => ({ time: toTime(x.time), value: x.value })));
    }
  }, [overlays]);

  // the axis labels follow the range: the clock on a day, the game day and clock on a week, the game day on the longer ranges
  useEffect(() => {
    chart.current?.applyOptions({
      timeScale: { tickMarkFormatter: (t: Time) => axisTimeLabel(Number(t), tpd, range, daily) },
      localization: { timeFormatter: (t: Time) => barTimeLabel(Number(t), tpd, daily) },
    });
  }, [range, interval, daily, tpd]);

  useEffect(() => {
    candleS.current?.applyOptions({ visible: mode === 'candles' });
    lineS.current?.applyOptions({ visible: mode === 'line' });
    areaS.current?.applyOptions({ visible: mode === 'area' });
  }, [mode]);

  // indicator line series come and go with the toggles
  useEffect(() => {
    const c = chart.current;
    const p = pal.current;
    if (!c || !p || !studies) return;
    const want: Partial<Record<LineKey, { color: string; pane: number; style?: LineStyle }>> = {};
    if (indicators.sma20) want.sma20 = { color: p.info, pane: 0 };
    if (indicators.sma50) want.sma50 = { color: p.warn, pane: 0 };
    if (indicators.ema12) want.ema12 = { color: p.brass, pane: 0 };
    if (indicators.bb) { want.bbU = { color: p.steel, pane: 0, style: LineStyle.Dashed }; want.bbL = { color: p.steel, pane: 0, style: LineStyle.Dashed }; }
    if (indicators.vwap) want.vwap = { color: p.line, pane: 0, style: LineStyle.Dotted };
    if (indicators.rsi) want.rsi = { color: p.brass, pane: 1 };
    for (const k of Object.keys(lines.current) as LineKey[]) {
      if (!want[k]) { c.removeSeries(lines.current[k]!); delete lines.current[k]; }
    }
    for (const [k, spec] of Object.entries(want) as [LineKey, { color: string; pane: number; style?: LineStyle }][]) {
      if (lines.current[k]) continue;
      lines.current[k] = c.addSeries(LineSeries, {
        color: spec.color, lineWidth: 1, lineStyle: spec.style ?? LineStyle.Solid, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      }, spec.pane);
    }
    if (want.rsi) c.panes()[1]?.setHeight(90);
    last.current.key = '';
  }, [indicators, studies]);

  useEffect(() => {
    const cs = candleS.current;
    const ls = lineS.current;
    const as = areaS.current;
    if (!cs || !ls || !as) return;
    if (series) {
      const key = `series|${testId}|${series.length > 0 ? series[0]!.time : 0}`;
      const pts = series.map((x) => ({ time: toTime(x.time), value: x.value }));
      if (pts.length) { axis.current = { ...axis.current, cls: assetCls, px: pts[pts.length - 1]!.value }; applyAxis(); }
      if (key !== last.current.key || Math.abs(series.length - last.current.len) > 1) {
        as.setData(pts);
        ls.setData(pts);
        chart.current?.timeScale().fitContent();
        last.current = { key, len: series.length };
      } else if (pts.length) {
        as.update(pts[pts.length - 1]!);
        ls.update(pts[pts.length - 1]!);
        last.current.len = series.length;
      }
      return;
    }
    const h = useGame.getState().history;
    const bars: Bar[] = barsFor(h, assetId, interval, range);
    if (bars.length === 0) return;
    baseOpen.current = bars[0]!.open;
    axis.current = { ...axis.current, cls: assetCls, px: bars[bars.length - 1]!.close };
    applyAxis();
    const vs = volS.current;
    const hasVolume = bars[bars.length - 1]!.volume !== undefined;
    const volPoint = (b: Bar) => ({ time: toTime(b.time), value: b.volume ?? 0, color: b.close >= b.open ? volColors.current.up : volColors.current.down });
    const key = `${assetId}|${interval}|${range}|${loaded}`;
    const studyData = (): Partial<Record<LineKey, number[]>> => {
      const d: Partial<Record<LineKey, number[]>> = {};
      if (lines.current.sma20) d.sma20 = sma(bars, 20);
      if (lines.current.sma50) d.sma50 = sma(bars, 50);
      if (lines.current.ema12) d.ema12 = ema(bars, 12);
      if (lines.current.bbU) { const b = bollinger(bars); d.bbU = b.upper; d.bbL = b.lower; }
      if (lines.current.vwap) d.vwap = vwap(bars, h.ticksPerDay);
      if (lines.current.rsi) d.rsi = rsi(bars);
      return d;
    };
    if (key !== last.current.key || Math.abs(bars.length - last.current.len) > 1) {
      // a new asset, interval or range opens on the auto scale: a zoom the player made on the last view does not carry over
      if (key !== last.current.key) chart.current?.priceScale('right').applyOptions({ autoScale: true });
      cs.setData(bars.map((b) => ({ ...b, time: toTime(b.time) })));
      ls.setData(bars.map((b) => ({ time: toTime(b.time), value: b.close })));
      as.setData(bars.map((b) => ({ time: toTime(b.time), value: b.close })));
      vs?.applyOptions({ visible: hasVolume });
      vs?.setData(hasVolume ? bars.map(volPoint) : []);
      for (const [k, vals] of Object.entries(studyData()) as [LineKey, number[]][]) {
        lines.current[k]?.setData(bars.map((b, i) => (Number.isFinite(vals[i]) ? { time: toTime(b.time), value: vals[i]! } : { time: toTime(b.time) })));
      }
      chart.current?.timeScale().fitContent();
      last.current = { key, len: bars.length };
    } else {
      const lb = bars[bars.length - 1]!;
      cs.update({ ...lb, time: toTime(lb.time) });
      ls.update({ time: toTime(lb.time), value: lb.close });
      as.update({ time: toTime(lb.time), value: lb.close });
      if (hasVolume) vs?.update(volPoint(lb));
      for (const [k, vals] of Object.entries(studyData()) as [LineKey, number[]][]) {
        const v = vals[vals.length - 1];
        if (Number.isFinite(v)) lines.current[k]?.update({ time: toTime(lb.time), value: v! });
      }
      last.current.len = bars.length;
    }
    // the legend shows the latest value of each active indicator
    const ids = (Object.keys(indicators) as IndicatorId[]).filter((id) => indicators[id] && studies);
    const vals = latestValues(bars, ids, h.ticksPerDay);
    setLegend(ids.map((id) => ({ id, label: INDICATORS.find((i) => i.id === id)?.label ?? id, value: legendText(id, vals[id], assetCls) })));
  }, [assetId, assetCls, interval, range, rev, loaded, series, testId, indicators, studies]);

  // The marks are redrawn when their text or prices change (keyed by value, so a caller need not memoize them). The palette
  // loss colour reads the chart host.
  const markKey = (marks ?? []).map((m) => `${m.price}|${m.title}`).join(';');
  useEffect(() => {
    for (const { s, l } of markLines.current) s.removePriceLine(l);
    markLines.current = [];
    const color = pal.current?.loss ?? '#c44';
    for (const m of marks ?? []) {
      for (const s of [candleS.current, lineS.current, areaS.current]) {
        if (!s) continue;
        markLines.current.push({ s, l: s.createPriceLine({ price: m.price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: m.title }) });
      }
    }
  }, [markKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the key stands for `marks`, which the caller may rebuild each render

  // The mark is checked after every render (the data effects above run first): where it sits on the visible series, above or
  // below the pane, or on the chart. A mark with no series yet is on no side.
  // the series the chart draws now (the price scale of the level lines and the menu follows it)
  const activeSeries = () => (mode === 'candles' ? candleS.current : mode === 'line' ? lineS.current : areaS.current);
  const scaleOf = (s: { priceToCoordinate: (p: number) => number | null; coordinateToPrice: (y: number) => number | null }): PriceScale => ({
    priceToY: (p) => s.priceToCoordinate(p),
    yToPrice: (y) => s.coordinateToPrice(y),
  });
  /** the price under a pixel row of the chart, rounded to the tick; null off the scale */
  const toPrice = (y: number): number | null => {
    const s = activeSeries();
    return s ? priceOfY(scaleOf(s), y, assetCls) : null;
  };
  // each line's row, the axis width and the plot height: set only when one of them moved
  const placeOverlay = () => {
    const c = chart.current;
    const s = activeSeries();
    if (!c || !s) return;
    // the right scale's state for the page (the e2e reads it): whether it follows the data, and the range it shows now
    const right = c.priceScale('right');
    const shown = right.getVisibleRange();
    if (host.current) {
      host.current.dataset.priceAuto = String(right.options().autoScale);
      host.current.dataset.priceFrom = shown ? String(shown.from) : '';
      host.current.dataset.priceTo = shown ? String(shown.to) : '';
    }
    const scale = scaleOf(s);
    const y: Record<string, number | null> = {};
    for (const l of levelsRef.current) y[l.id] = yOfPrice(scale, l.price);
    const axisW = Math.round(right.width());
    const h = c.paneSize().height;
    setPlaced((prev) => (sameRows(prev.y, y) && prev.axisW === axisW && prev.h === h ? prev : { y, axisW, h }));
  };

  // The mark is checked after every render (the data effects above run first): where it sits on the visible series, above or
  // below the pane, or on the chart. A mark with no series yet is on no side. The level lines are placed at the same time.
  useEffect(() => {
    levelsRef.current = levels ?? [];
    probe.current = () => {
      placeOverlay();
      if (!onMarkOff) return;
      const c = chart.current;
      const price = marks?.[0]?.price;
      const s = mode === 'candles' ? candleS.current : mode === 'line' ? lineS.current : areaS.current;
      if (price === undefined || !c || !s) { onMarkOff(null); return; }
      const y = s.priceToCoordinate(price);
      const h = c.paneSize().height;
      onMarkOff(y === null ? null : y < 0 ? 'above' : y > h ? 'below' : null);
    };
    probe.current();
  });

  // the chart menu: a right-click or an Alt+click on the chart opens it at the price under the pointer
  const openMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!onMenuPick || !host.current) return;
    const r = host.current.getBoundingClientRect();
    const yy = e.clientY - r.top;
    const p = toPrice(yy);
    if (p === null) return;
    // the menu (about 224 by 140 px) opens inside the chart: it is moved left or up when the pointer is near the edge
    const x = Math.max(0, Math.min(e.clientX - r.left, r.width - 232));
    const y = Math.max(0, Math.min(yy, r.height - 140));
    setMenu({ x, y, price: p });
  };
  // Escape closes the menu
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const showOverlay = studies && series === undefined;
  return (
    <div className="relative h-full w-full">
      <div
        ref={host} className="h-full w-full" data-testid={testId} data-chart-id={assetId}
        onContextMenu={onMenuPick ? openMenu : undefined}
        onClick={onMenuPick ? (e) => { if (e.altKey) openMenu(e); } : undefined}
      />
      {showOverlay && (
        <div className="pointer-events-none absolute left-2 top-2 z-[3] flex max-w-[calc(100%-5rem)] flex-col gap-1">
          {readout && (
            <div className="num text-micro text-fg-muted" data-testid="chart-readout">
              <span className="text-fg-faint">{barTimeLabel(readout.time, tpd, daily)}</span>
              {readout.o !== undefined && readout.h !== undefined && readout.l !== undefined && (
                <span className="ml-2">{t('broker.ohlc.open')} {fmtAsset(readout.o)} {t('broker.ohlc.high')} {fmtAsset(readout.h)} {t('broker.ohlc.low')} {fmtAsset(readout.l)}</span>
              )}
              <span className="ml-2 text-fg">{t('broker.ohlc.close')} {fmtAsset(readout.c)}</span>
              <span className={`ml-2 ${readout.change >= 0 ? 'text-gain' : 'text-loss'}`} data-testid="chart-readout-change">{signedPct(readout.change)}</span>
            </div>
          )}
          {legend.length > 0 && (
            <ul className="flex flex-wrap gap-1" data-testid="chart-legend" aria-label={t('broker.legend')}>
              {legend.map((row) => (
                <li key={row.id} className="pointer-events-auto flex items-center gap-1 rounded-chip border border-ink-3 bg-ink-1/80 py-0.5 pl-2 pr-0.5 text-micro text-fg-muted" data-testid={`legend-${row.id}`}>
                  <span>{row.label}</span>
                  <span className="num text-fg">{row.value}</span>
                  <button
                    type="button" aria-label={t('broker.legend.remove', { name: row.label })} title={t('broker.legend.remove', { name: row.label })}
                    onClick={() => toggle(row.id)} className="px-1 text-fg-faint hover:text-fg" data-testid={`legend-remove-${row.id}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {band && eventBand && (
        <div className="os-event-band" data-testid="event-band" data-kind={eventBand.kind} style={{ left: band.left, width: band.width }} aria-hidden>
          <span className="os-event-band-label">{eventBand.label}</span>
        </div>
      )}
      {showOverlay && levels && levels.length > 0 && (
        <LevelLayer
          placed={levels.map((l) => ({ level: l, y: placed.y[l.id] ?? null }))}
          axisW={placed.axisW}
          height={placed.h}
          toPrice={toPrice}
          assetClass={assetCls}
          toY={(p) => { const s = activeSeries(); return s ? yOfPrice(scaleOf(s), p) : null; }}
          onCommit={(l, p) => onLevelCommit?.(l, p)}
          onCancel={(l) => onLevelCancel?.(l)}
          onAction={(l, k) => onLevelAction?.(l, k)}
        />
      )}
      {menu && onMenuPick && (
        <>
          <div className="fixed inset-0 z-[5]" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} aria-hidden />
          <ul
            role="menu" aria-label={t('broker.menu.label')} data-testid="chart-menu"
            className="absolute z-[6] w-56 rounded-md border border-ink-3 bg-ink-1 p-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            {MENU_PICKS.map((p) => (
              <li key={p.kind} role="none">
                <button
                  type="button" role="menuitem" data-testid={`menu-${p.kind}`}
                  onClick={() => { const at = roundPrice(menu.price, assetCls); setMenu(null); onMenuPick(p.kind, at); }}
                  className="w-full rounded-sm px-2 py-1.5 text-left text-small text-fg-muted hover:bg-ink-2 hover:text-fg"
                >
                  {t(p.key, { price: fmtAsset(roundPrice(menu.price, assetCls)) })}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The text a legend row shows for an indicator's latest value. */
function legendText(id: IndicatorId, v: number[] | undefined, assetClass: AssetClass): string {
  if (!v || v.length === 0) return '–';
  const fmt = (x: number) => assetPrice({ assetClass }, x);
  if (id === 'bb') return `${fmt(v[0]!)} / ${fmt(v[1] ?? v[0]!)}`;
  if (id === 'rsi') return dec(v[0]!, 1);
  return fmt(v[0]!);
}

export type { IndicatorId };
