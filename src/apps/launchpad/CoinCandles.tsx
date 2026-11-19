"use client";
// A coin's chart: the first version's candles and volume, cut from the sim's live minute bars (1m, 5m, 15m, 1h), with the
// candle still forming at the right edge and the price axis on the coin's real price. Loaded only when a coin page opens.
// Bars are the sim's (/history, kept current by useBars as the game clock runs); nothing here prices anything.
import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useBars } from "@/components/market/useBars";
import { axisLabel, stampLabel, volText, type Bar, type Tf } from "@/components/market/terminalApi";
import { LPS } from "./strings";

export type CoinTf = "1m" | "5m" | "15m" | "1h";
const SHOWN = 90; // candles in view when a chart opens

/** A price in dollars with enough digits to see a move on a coin that trades at fractions of a cent. */
function pxText(d: number): string {
  if (!(d > 0)) return "0";
  if (d >= 1) return d.toFixed(2);
  if (d >= 0.01) return d.toFixed(4);
  return d.toFixed(6);
}

interface Legend { ts: number; o: number; h: number; l: number; c: number; v: number }

interface Props {
  instr: string;
  tf: CoinTf;
  /** Changes whenever the read of the pools changes; it drives the live refresh. */
  stamp: string;
  ended: boolean;
}

export default function CoinCandles({ instr, tf, stamp, ended }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const colours = useRef({ up: "#3fd1b0", down: "#ff6b5a" });
  const shown = useRef({ key: "", n: 0 });
  const barsRef = useRef<Bar[]>([]);
  const [legend, setLegend] = useState<Legend | null>(null);
  const { series, missing } = useBars(instr, tf as Tf, stamp);
  const bars = series?.bars ?? null;
  barsRef.current = bars ?? [];

  // The chart is built once per coin and size, and torn down with it.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    const up = v("--gain", "#3fd1b0"), down = v("--loss", "#ff6b5a");
    colours.current = { up, down };
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: v("--fg-faint", "#7e848e"), fontFamily: cs.fontFamily, fontSize: 12 },
      grid: { vertLines: { color: v("--grid", "rgba(120,120,120,.12)") }, horzLines: { color: v("--grid", "rgba(120,120,120,.12)") } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: {
        borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4,
        tickMarkFormatter: (t: unknown) => axisLabel(Number(t), tf as Tf, false),
      },
      localization: {
        timeFormatter: (t: unknown) => stampLabel(Number(t), true),
        priceFormatter: (p: number) => `$${pxText(p)}`,
      },
    });
    const cd = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false,
      priceFormat: { type: "custom", formatter: (p: number) => `$${pxText(p)}`, minMove: 0.0000001 },
      // A coin that has not moved still gets a readable axis: never tighter than two percent around the price.
      autoscaleInfoProvider: (orig: () => { priceRange: { minValue: number; maxValue: number } | null; margins?: { above: number; below: number } } | null) => {
        const r = orig();
        if (!r || !r.priceRange) return r;
        const mid = (r.priceRange.minValue + r.priceRange.maxValue) / 2;
        const half = Math.max((r.priceRange.maxValue - r.priceRange.minValue) / 2, mid * 0.02);
        return { priceRange: { minValue: mid - half, maxValue: mid + half }, margins: r.margins };
      },
    });
    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });
    chart.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(cd) as { open: number; high: number; low: number; close: number } | undefined;
      if (!p.time || !d) { setLegend(null); return; }
      const t = Number(p.time);
      const b = barsRef.current.find((x) => x.ts === t);
      setLegend({ ts: t, o: d.open, h: d.high, l: d.low, c: d.close, v: b?.v ?? 0 });
    });
    chartRef.current = chart;
    candles.current = cd;
    volume.current = vol;
    shown.current = { key: "", n: 0 };
    return () => { chart.remove(); chartRef.current = null; candles.current = null; volume.current = null; };
  }, [instr, tf]);

  // Every read of the bars: the whole series is set, and a view parked at the right edge follows the forming candle.
  useEffect(() => {
    const chart = chartRef.current, cd = candles.current, vol = volume.current;
    if (!chart || !cd || !vol || !bars || bars.length === 0) return;
    const { up, down } = colours.current;
    cd.setData(bars.map((b) => ({ time: b.ts as UTCTimestamp, open: b.o / 100, high: b.h / 100, low: b.l / 100, close: b.c / 100 })));
    vol.setData(bars.map((b) => ({ time: b.ts as UTCTimestamp, value: b.v, color: (b.c >= b.o ? up : down) + "88" })));
    const key = `${instr}|${tf}`;
    const ts = chart.timeScale();
    const n = bars.length;
    if (shown.current.key !== key) {
      ts.setVisibleLogicalRange({ from: Math.max(-2, n - SHOWN), to: n + 4 });
      shown.current = { key, n };
      return;
    }
    const r = ts.getVisibleLogicalRange();
    if (r && n !== shown.current.n && r.to >= shown.current.n - 1) {
      const d = n - shown.current.n;
      // A young coin keeps its whole life in view until there are more candles than the chart opens with.
      if (r.from <= 2 && n <= SHOWN) ts.setVisibleLogicalRange({ from: -2, to: n + 4 });
      else ts.setVisibleLogicalRange({ from: r.from + d, to: r.to + d });
    }
    shown.current.n = n;
  }, [bars, instr, tf]);

  const last = bars && bars.length ? bars[bars.length - 1]! : null;
  const l: Legend | null = legend ?? (last ? { ts: last.ts, o: last.o / 100, h: last.h / 100, l: last.l / 100, c: last.c / 100, v: last.v } : null);
  const dir = l ? (l.c >= l.o ? "up" : "down") : "flat";
  return (
    <div className="lpad-cc" data-testid="lp-candles" data-tf={tf} data-bars={bars?.length ?? 0}>
      <p className="lpad-ohlc num" data-testid="lp-ohlc" aria-live="off">
        {l ? (
          <>
            <span>{stampLabel(l.ts, true)}</span>
            <span data-dir={dir}>{`O ${pxText(l.o)}`}</span><span data-dir={dir}>{`H ${pxText(l.h)}`}</span>
            <span data-dir={dir}>{`L ${pxText(l.l)}`}</span><span data-dir={dir}>{`C ${pxText(l.c)}`}</span>
            <span>{`${LPS.chartVol} ${volText(l.v)}`}</span>
          </>
        ) : <span>{LPS.chartLoading}</span>}
      </p>
      {missing && <p className="lpad-sub" role="alert" data-testid="lp-chart-error">{LPS.chartCouldnt}</p>}
      {series && series.bars.length === 0 && <p className="lpad-sub" data-testid="lp-chart-empty">{LPS.chartEmpty}</p>}
      <div ref={host} className="lpad-cc-plot" />
      {ended && <p className="lpad-faint">{LPS.chartEnded}</p>}
    </div>
  );
}
