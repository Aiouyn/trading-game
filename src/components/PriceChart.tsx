'use client';

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type ISeriesApi, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import { useGame } from '@/game/store';
import { barTimeLabel, candles, rangeSpec, type Bar } from '@/game/history';
import { price as fmtPrice } from '@/game/format';

/**
 * Colors come from the design tokens at runtime: a hidden probe uses the token classes and we
 * read the computed colors, so no hex lives in this component.
 */
const PROBE = {
  bg: 'text-ink-1',
  grid: 'text-ink-2',
  text: 'text-fg-faint',
  gain: 'text-gain',
  loss: 'text-loss',
  brass: 'text-brass',
  line: 'text-fg',
  cross: 'text-fg-disabled',
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

/** Any CSS color (oklch included) as rgba with the given alpha, via a 1×1 canvas. */
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

/** Price pane leaves the bottom quarter to volume; volume bars sit in that strip. */
const PRICE_MARGINS = { top: 0.08, bottom: 0.26 };
const VOLUME_MARGINS = { top: 0.8, bottom: 0.02 };

export function PriceChart({ assetId }: { assetId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const volColors = useRef({ up: '', down: '' });
  const lastKey = useRef('');

  const range = useGame((s) => s.range);
  const mode = useGame((s) => s.chartMode);
  const rev = useGame((s) => s.historyRev);
  const tpd = useGame((s) => s.world?.config.ticksPerDay ?? 720);

  // create once
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const p = readPalette(el);
    const c = createChart(el, {
      autoSize: true,
      // attribution moved to the Credits screen, as the Lightweight Charts license allows
      layout: { background: { type: ColorType.Solid, color: p.bg }, textColor: p.text, fontFamily: p.font, fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: PRICE_MARGINS },
      timeScale: { borderVisible: false, rightOffset: 4, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: p.cross, labelBackgroundColor: p.grid }, horzLine: { color: p.cross, labelBackgroundColor: p.grid } },
      localization: { priceFormatter: (v: number) => fmtPrice(v) },
      handleScale: { axisPressedMouseMove: false },
    });
    candleSeries.current = c.addSeries(CandlestickSeries, {
      upColor: p.gain, downColor: p.loss, wickUpColor: p.gain, wickDownColor: p.loss, borderVisible: false,
      priceLineColor: p.brass, priceLineStyle: LineStyle.Dotted, priceLineWidth: 1,
    });
    lineSeries.current = c.addSeries(LineSeries, {
      color: p.line, lineWidth: 2, priceLineColor: p.brass, priceLineStyle: LineStyle.Dotted, priceLineWidth: 1, visible: false,
    });
    volColors.current = { up: withAlpha(p.gain, 0.32), down: withAlpha(p.loss, 0.32) };
    volumeSeries.current = c.addSeries(HistogramSeries, {
      priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false,
    });
    c.priceScale('volume').applyOptions({ scaleMargins: VOLUME_MARGINS, visible: false });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      candleSeries.current = null;
      lineSeries.current = null;
      volumeSeries.current = null;
      lastKey.current = '';
    };
  }, []);

  // axis labels follow the range (game days vs. session times)
  useEffect(() => {
    const daily = rangeSpec(range, tpd).bucket === 'daily';
    const fmt = (t: Time) => barTimeLabel(Number(t), tpd, daily);
    chart.current?.applyOptions({
      timeScale: { tickMarkFormatter: (t: Time) => (daily ? fmt(t) : barTimeLabel(Number(t), tpd, false).split(' ')[1]!) },
      localization: { timeFormatter: fmt },
    });
  }, [range, tpd]);

  useEffect(() => {
    candleSeries.current?.applyOptions({ visible: mode === 'candles' });
    lineSeries.current?.applyOptions({ visible: mode === 'line' });
  }, [mode]);

  // data: full reset when the asset or range changes, otherwise update the last bar
  useEffect(() => {
    const h = useGame.getState().history;
    if (!h || !candleSeries.current || !lineSeries.current) return;
    const bars: Bar[] = candles(h, assetId, range);
    if (bars.length === 0) return;
    const vs = volumeSeries.current;
    const hasVolume = bars[bars.length - 1]!.volume !== undefined;
    const volPoint = (b: Bar) => ({
      time: toTime(b.time),
      value: b.volume ?? 0,
      color: b.close >= b.open ? volColors.current.up : volColors.current.down,
    });
    const key = `${useGame.getState().world?.seed}|${assetId}|${range}`;
    if (key !== lastKey.current) {
      candleSeries.current.setData(bars.map((b) => ({ ...b, time: toTime(b.time) })));
      lineSeries.current.setData(bars.map((b) => ({ time: toTime(b.time), value: b.close })));
      vs?.applyOptions({ visible: hasVolume });
      vs?.setData(hasVolume ? bars.map(volPoint) : []);
      chart.current?.timeScale().fitContent();
      lastKey.current = key;
      return;
    }
    const last = bars[bars.length - 1]!;
    candleSeries.current.update({ ...last, time: toTime(last.time) });
    lineSeries.current.update({ time: toTime(last.time), value: last.close });
    if (hasVolume) vs?.update(volPoint(last));
  }, [assetId, range, rev]);

  return <div ref={host} className="h-full w-full" data-testid="price-chart" />;
}
