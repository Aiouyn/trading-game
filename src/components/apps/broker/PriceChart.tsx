'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import { useGame } from '@/game/store';
import { barTimeLabel, candles, rangeSpec, type Bar, type RangeId } from '@/game/history';
import { bollinger, ema, rsi, sma, vwap, type IndicatorId } from '@/game/indicators';
import { price as fmtPrice } from '@/game/format';

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

type LineKey = 'sma20' | 'sma50' | 'ema12' | 'bbU' | 'bbL' | 'vwap' | 'rsi';

/** A thin extra line drawn over an explicit series (the net worth chart's benchmark ghosts). Colors are the token names of PROBE. */
export interface ChartOverlay {
  id: string;
  color: 'line' | 'steel' | 'info' | 'warn' | 'brass';
  dashed?: boolean;
  points: { time: number; value: number }[];
}

export function PriceChart({ assetId, range: rangeOverride, mode: modeOverride, testId = 'price-chart', series, studies = true, overlays, marks, onMarkOff, eventBand }: {
  assetId: string;
  range?: RangeId;
  mode?: 'candles' | 'line' | 'area';
  testId?: string;
  /** chart an explicit series instead of the history (net worth) */
  series?: { time: number; value: number }[];
  studies?: boolean;
  /** extra lines over an explicit series; only the ones listed are drawn */
  overlays?: ChartOverlay[];
  /** horizontal lines at a price (the liquidation line), drawn on every series so each chart style shows them */
  marks?: { price: number; title: string }[];
  /** reports the side the first mark sits off the visible price range (null when it is on the chart); the caller says so */
  onMarkOff?: (side: 'above' | 'below' | null) => void;
  /** a live world event: its window is shaded from the onset to now (velvet-world-events.md section 4); never its end */
  eventBand?: { sinceTick: number; kind: 'crash' | 'bubble' | 'crisis' | 'flash'; label: string };
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

  const storeRange = useGame((s) => s.range);
  const storeMode = useGame((s) => s.chartMode);
  const indicators = useGame((s) => s.indicators);
  const range = rangeOverride ?? storeRange;
  const mode = modeOverride ?? storeMode;
  const rev = useGame((s) => s.historyRev);
  const loaded = useGame((s) => !!s.loaded[assetId]);
  const [band, setBand] = useState<{ left: number; width: number } | null>(null);
  const bandFrom = eventBand?.sinceTick ?? null;

  // the event window: from the first bar at or after the onset to the right edge; it follows zoom and scroll
  useEffect(() => {
    const c = chart.current;
    const el = host.current;
    if (bandFrom === null || !c || !el) { setBand(null); return; }
    const place = () => {
      const first = candles(useGame.getState().history, assetId, range).find((b) => b.time >= bandFrom);
      const x = first ? c.timeScale().timeToCoordinate(toTime(first.time)) : null;
      setBand(x === null ? null : { left: Math.max(0, x), width: Math.max(0, el.clientWidth - Math.max(0, x)) });
    };
    place();
    c.timeScale().subscribeVisibleLogicalRangeChange(place);
    return () => c.timeScale().unsubscribeVisibleLogicalRangeChange(place);
  }, [bandFrom, rev, range, loaded, assetId, mode]);

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
      localization: { priceFormatter: (v: number) => fmtPrice(v) },
      handleScale: { axisPressedMouseMove: false },
    });
    candleS.current = c.addSeries(CandlestickSeries, {
      upColor: p.gain, downColor: p.loss, wickUpColor: p.gain, wickDownColor: p.loss, borderVisible: false,
      priceLineColor: p.brass, priceLineStyle: LineStyle.Dotted, priceLineWidth: 1,
    });
    lineS.current = c.addSeries(LineSeries, { color: p.line, lineWidth: 2, priceLineColor: p.brass, priceLineStyle: LineStyle.Dotted, priceLineWidth: 1, visible: false });
    areaS.current = c.addSeries(AreaSeries, {
      lineColor: p.brass, lineWidth: 2, topColor: withAlpha(p.brass, 0.16), bottomColor: withAlpha(p.brass, 0), priceLineColor: p.brass, priceLineStyle: LineStyle.Dotted, visible: false,
    });
    volColors.current = { up: withAlpha(p.gain, 0.32), down: withAlpha(p.loss, 0.32) };
    volS.current = c.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale('volume').applyOptions({ scaleMargins: VOLUME_MARGINS, visible: false });
    chart.current = c;
    // a zoom or scroll changes the visible price range, so the mark is checked again
    const onRange = () => probe.current();
    c.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    return () => {
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      c.remove();
      chart.current = null;
      candleS.current = null; lineS.current = null; areaS.current = null; volS.current = null;
      lines.current = {};
      overlayS.current = {};
      markLines.current = [];
      last.current = { key: '', len: 0 };
    };
  }, []);

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

  useEffect(() => {
    const daily = rangeSpec(range, 720).bucket === 'daily';
    const fmt = (t: Time) => barTimeLabel(Number(t), 720, daily);
    chart.current?.applyOptions({
      timeScale: { tickMarkFormatter: (t: Time) => (daily ? fmt(t) : barTimeLabel(Number(t), 720, false).split(' ')[1]!) },
      localization: { timeFormatter: fmt },
    });
  }, [range]);

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
    const bars: Bar[] = candles(h, assetId, range);
    if (bars.length === 0) return;
    const vs = volS.current;
    const hasVolume = bars[bars.length - 1]!.volume !== undefined;
    const volPoint = (b: Bar) => ({ time: toTime(b.time), value: b.volume ?? 0, color: b.close >= b.open ? volColors.current.up : volColors.current.down });
    const key = `${assetId}|${range}|${loaded}`;
    const studyData = (): Partial<Record<LineKey, number[]>> => {
      const d: Partial<Record<LineKey, number[]>> = {};
      if (lines.current.sma20) d.sma20 = sma(bars, 20);
      if (lines.current.sma50) d.sma50 = sma(bars, 50);
      if (lines.current.ema12) d.ema12 = ema(bars, 12);
      if (lines.current.bbU) { const b = bollinger(bars); d.bbU = b.upper; d.bbL = b.lower; }
      if (lines.current.vwap) d.vwap = vwap(bars, 720);
      if (lines.current.rsi) d.rsi = rsi(bars);
      return d;
    };
    if (key !== last.current.key || Math.abs(bars.length - last.current.len) > 1) {
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
      return;
    }
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
  }, [assetId, range, rev, loaded, series, testId, indicators]);

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
  useEffect(() => {
    probe.current = () => {
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

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" data-testid={testId} data-chart-id={assetId} />
      {band && eventBand && (
        <div className="os-event-band" data-testid="event-band" data-kind={eventBand.kind} style={{ left: band.left, width: band.width }} aria-hidden>
          <span className="os-event-band-label">{eventBand.label}</span>
        </div>
      )}
    </div>
  );
}

export type { IndicatorId };
