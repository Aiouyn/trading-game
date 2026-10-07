'use client';

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, LineSeries, LineStyle, createChart,
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

export function PriceChart({ assetId }: { assetId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeries = useRef<ISeriesApi<'Line'> | null>(null);
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
      layout: { background: { type: ColorType.Solid, color: p.bg }, textColor: p.text, fontFamily: p.font, fontSize: 11 },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      rightPriceScale: { borderVisible: false },
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
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      candleSeries.current = null;
      lineSeries.current = null;
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
    const key = `${useGame.getState().world?.seed}|${assetId}|${range}`;
    if (key !== lastKey.current) {
      candleSeries.current.setData(bars.map((b) => ({ ...b, time: toTime(b.time) })));
      lineSeries.current.setData(bars.map((b) => ({ time: toTime(b.time), value: b.close })));
      chart.current?.timeScale().fitContent();
      lastKey.current = key;
      return;
    }
    const last = bars[bars.length - 1]!;
    candleSeries.current.update({ ...last, time: toTime(last.time) });
    lineSeries.current.update({ time: toTime(last.time), value: last.close });
  }, [assetId, range, rev]);

  return <div ref={host} className="h-full w-full" data-testid="price-chart" />;
}
