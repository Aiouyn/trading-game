"use client";
// A coin's candles, drawn with the same library as the Broker's chart (lightweight-charts). Loaded only when a coin page
// opens. Bars are the sim's (/history): one candle per game day, or per tick. Colours are the shell's chart tokens.
import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { readChartTheme } from "@/components/market/chartTheme";
import { dayLabel, type Bar } from "./model";

const DAY_S = 86_400;

export default function CoinCandles({ bars, ticks }: { bars: Bar[]; ticks: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const theme = readChartTheme(el);
    const up = theme?.colours.up ?? "rgb(60, 160, 90)";
    const down = theme?.colours.down ?? "rgb(200, 70, 60)";
    const text = theme?.colours.text ?? "rgb(120, 120, 120)";
    const grid = theme?.colours.grid ?? "rgba(120, 120, 120, 0.15)";
    const chart: IChartApi = createChart(el, {
      autoSize: true,
      height: 240,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, fontFamily: theme?.fontFamily, fontSize: theme?.fontSize ?? 12 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, tickMarkFormatter: (t: unknown) => dayLabel(Math.floor(Number(t) / DAY_S)) },
      localization: { timeFormatter: (t: unknown) => dayLabel(Math.floor(Number(t) / DAY_S)) },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    const data = bars.map((b) => ({
      time: Math.round((b.t + b.k / Math.max(1, ticks)) * DAY_S) as UTCTimestamp,
      open: b.o / 100, high: b.h / 100, low: b.l / 100, close: b.c / 100,
    }));
    series.setData(data);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars, ticks]);

  return <div ref={host} className="lpad-cc" data-testid="lp-candles" />;
}
