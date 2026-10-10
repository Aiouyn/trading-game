'use client';

import { useEffect, useRef } from 'react';
import {
  AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type ISeriesApi, type Time, type UTCTimestamp,
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

export function PriceChart({ assetId, range: rangeOverride, mode: modeOverride, testId = 'price-chart', series, studies = true }: {
  assetId: string;
  range?: RangeId;
  mode?: 'candles' | 'line' | 'area';
  testId?: string;
  /** chart an explicit series instead of the history (net worth) */
  series?: { time: number; value: number }[];
  studies?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleS = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineS = useRef<ISeriesApi<'Line'> | null>(null);
  const areaS = useRef<ISeriesApi<'Area'> | null>(null);
  const volS = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lines = useRef<Partial<Record<LineKey, ISeriesApi<'Line'>>>>({});
  const pal = useRef<Palette | null>(null);
  const volColors = useRef({ up: '', down: '' });
  const last = useRef({ key: '', len: 0 });

  const storeRange = useGame((s) => s.range);
  const storeMode = useGame((s) => s.chartMode);
  const indicators = useGame((s) => s.indicators);
  const range = rangeOverride ?? storeRange;
  const mode = modeOverride ?? storeMode;
  const rev = useGame((s) => s.historyRev);
  const loaded = useGame((s) => !!s.loaded[assetId]);

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
    return () => {
      c.remove();
      chart.current = null;
      candleS.current = null; lineS.current = null; areaS.current = null; volS.current = null;
      lines.current = {};
      last.current = { key: '', len: 0 };
    };
  }, []);

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

  return <div ref={host} className="h-full w-full" data-testid={testId} data-chart-id={assetId} />;
}

export type { IndicatorId };
