"use client";
// Broker price chart plot (UI card 7; M1-07 candles): the lazy chunk that carries lightweight-charts (G4). PriceChart owns
// the data, the states and the table; this file only draws the bars it is given and handles the plot's keyboard.
//  - Candles: gain / loss bodies and wicks; volume bars (22 % of the same token) on their own scale under the price
//    (DESIGN.md chart row). Pan / zoom: the library's drag, wheel and pinch, plus the keyboard below. The legend shows
//    the hovered (or newest) bar's server strings: O H L C and volume.
//  - G1: a server price becomes a JS number only in toPoints(), for the canvas. Nothing here adds, subtracts or
//    compares prices; the tag and the aria text are the server's strings.
//  - Time: the x axis is game time, not wall time. A tick is 2 game minutes, so t * 120 s puts the library's own day
//    boundaries on game days (720 ticks = 86,400 s) and every label is formatted back from the tick with the shell's
//    game clock (no Date, so no timezone).
//  - Colours are tokens read with getComputedStyle (chartTheme.ts) and re-read when the palette, hc, motion or text
//    scale changes. The last-price tag and the halt band are DOM overlays moved with transforms (no layout shift).
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineStyle, TickMarkType, createChart,
  type CandlestickData, type HistogramData, type IChartApi, type IPriceLine, type ISeriesApi, type MouseEventParams, type Time, type UTCTimestamp,
} from "lightweight-charts";
import type { BrStrings } from "@/apps/broker/strings";
import { decText } from "@/apps/portfolio/positions/format";
import { pfNumberLocale } from "@/apps/portfolio/strings";
import type { Bar } from "@/shell/contracts/history";
import { clockAt, clockLabel } from "@/shell/mockChannels";
import { clockStrings } from "@/shell/strings";
import { barTime } from "./ChartTable";
import { parseSrgb } from "./chartColor";
import { THEME_ATTRS, readChartTheme, type ChartTheme } from "./chartTheme";
import "./candleChart.css";

// Build-time gate, module-local (an imported const would ship the gated branch).
const MOCK_HOOKS = process.env.QUAY_HOOKS === "1";

/** Seconds of chart time per game tick (2 game minutes). */
export const SECONDS_PER_TICK = 120;
/** Fewest bars a zoom-in leaves on screen. */
export const MIN_VISIBLE = 10;
/** The price scale's fixed width, so a longer label never moves the plot or the tag. */
const SCALE_W = 72;
/** Width of the halted band at the live edge. */
const BAND_W = 24;

/** Volume bars' share of the plot height (bottom), and the price's margins above them. */
const VOLUME_TOP = 0.8;

export interface Points {
  readonly data: CandlestickData<UTCTimestamp>[];
  /** Volume per bar; `up` = close at or above open (the bar's colour). */
  readonly vol: { readonly time: UTCTimestamp; readonly value: number; readonly up: boolean }[];
  readonly last: number | null;
}

/** The only place a server price or volume becomes a number (G1): each bar's o/h/l/c and v, and the ticker's last. */
export function toPoints(bars: readonly Bar[], last: string | null): Points {
  const data: CandlestickData<UTCTimestamp>[] = [];
  const vol: Points["vol"][number][] = [];
  for (const b of bars) {
    const time = (b.t * SECONDS_PER_TICK) as UTCTimestamp;
    const o = Number(b.o), c = Number(b.c);
    data.push({ time, open: o, high: Number(b.h), low: Number(b.l), close: c });
    vol.push({ time, value: Number(b.v), up: c >= o });
  }
  return { data, vol, last: last === null ? null : Number(last) };
}

const volPoint = (v: Points["vol"][number], th: ChartTheme): HistogramData<UTCTimestamp> =>
  ({ time: v.time, value: v.value, color: v.up ? th.colours.upVol : th.colours.downVol });

/** Decimals of a server decimal string ("42.10" -> 2): the price axis precision. */
export const decimalsOf = (s: string): number => /\.(\d+)$/.exec(s)?.[1]?.length ?? 0;

/** The chart time back to a tick. */
export const tickOfTime = (time: Time): number => (typeof time === "number" ? Math.round(time / SECONDS_PER_TICK) : 0);

/** Axis tick marks: a day mark reads as the phone clock ("D39 · 00:00"), others as the game HH:mm. */
export function axisLabel(time: Time, type: TickMarkType, locale: string): string {
  const { day, hhmm } = clockLabel(clockAt(tickOfTime(time)));
  return type <= TickMarkType.DayOfMonth ? clockStrings(locale).phone(day, hhmm) : hhmm;
}

/** Keyboard state: the crosshair bar (null = none) and how many bars are on screen (null = all). */
export interface Cursor { readonly index: number | null; readonly visible: number | null }
export const NO_CURSOR: Cursor = { index: null, visible: null };

/** ←/→ one bar, Home/End first/last, +/− halve/double the visible bars, Esc clears. null = key not handled. */
export function chartKey(c: Cursor, key: string, n: number): Cursor | null {
  if (n === 0) return null;
  const vis = c.visible ?? n;
  switch (key) {
    case "ArrowLeft": return { ...c, index: c.index === null ? n - 1 : Math.max(0, c.index - 1) };
    case "ArrowRight": return { ...c, index: c.index === null ? n - 1 : Math.min(n - 1, c.index + 1) };
    case "Home": return { ...c, index: 0 };
    case "End": return { ...c, index: n - 1 };
    case "+": case "=": return { ...c, visible: Math.max(Math.min(MIN_VISIBLE, n), Math.ceil(vis / 2)) };
    case "-": case "_": case "\u2212": { const v = vis * 2; return { ...c, visible: v >= n ? null : v }; }
    case "Escape": return c.index === null ? null : { ...c, index: null };
    default: return null;
  }
}

/** The bars on screen for a zoom: anchored at the newest bar, shifted left only to keep the crosshair in view. */
export function visibleWindow(n: number, c: Cursor): { from: number; to: number } | null {
  if (c.visible === null || c.visible >= n) return null;
  let to = n - 1;
  if (c.index !== null && c.index < to - c.visible + 1) to = c.index + c.visible - 1;
  return { from: to - c.visible + 1, to };
}

export interface CandleChartProps {
  /** Oldest first, at least one bar. */
  readonly bars: readonly Bar[];
  /** ticker.last as sent, for the tag. */
  readonly last: string | null;
  readonly halted: boolean;
  readonly t: BrStrings;
  readonly locale: string;
  /** chartAria for this range. */
  readonly label: string;
  /** The library could not draw (e.g. a theme it cannot parse): the container shows its error state. */
  readonly onFail: () => void;
}

interface Api { chart: IChartApi; series: ISeriesApi<"Candlestick">; volume: ISeriesApi<"Histogram">; line: IPriceLine | null; theme: ChartTheme }

function chartOptions(th: ChartTheme, locale: string, precision: number, s: Pick<BrStrings, "tickLabel">) {
  const c = th.colours;
  const fmt = new Intl.NumberFormat(pfNumberLocale(locale), { minimumFractionDigits: precision, maximumFractionDigits: precision });
  return {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text, fontFamily: th.fontFamily, fontSize: th.fontSize, attributionLogo: false, colorParsers: [parseSrgb] },
    grid: { vertLines: { color: c.grid, visible: !th.hc }, horzLines: { color: c.grid, visible: !th.hc } },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: c.crosshair, labelBackgroundColor: c.label },
      horzLine: { color: c.crosshair, labelBackgroundColor: c.label },
    },
    rightPriceScale: { borderColor: c.crosshair, minimumWidth: SCALE_W, scaleMargins: { top: 0.08, bottom: 1 - VOLUME_TOP + 0.04 } },
    timeScale: {
      borderColor: c.crosshair, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true,
      // A short recorded history stays candle-sized at the right edge (the empty left is "not recorded yet").
      maxBarSpacing: MAX_BAR_SPACING,
      // Day marks read "D39 · 06:00" (11 characters); the library's default room is 8, so marks overlapped at 520.
      tickMarkMaxCharacterLength: 12,
      tickMarkFormatter: (time: Time, type: TickMarkType) => axisLabel(time, type, locale),
    },
    localization: { locale: pfNumberLocale(locale), timeFormatter: (time: Time) => barTime(tickOfTime(time), locale, s), priceFormatter: (p: number) => fmt.format(p) },
    kineticScroll: { touch: !th.reducedMotion, mouse: false },
    // A vertical drag on a phone scrolls the page, never the chart.
    handleScroll: { vertTouchDrag: false },
  };
}

function seriesOptions(th: ChartTheme, precision: number) {
  const { up, down } = th.colours;
  return {
    upColor: up, downColor: down, wickUpColor: up, wickDownColor: down,
    // hc: an outlined body in the same colour, so a thin candle still reads at 1 px.
    borderVisible: th.hc, borderUpColor: up, borderDownColor: down,
    priceLineVisible: false, lastValueVisible: false,
    priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
  } as const;
}

/** Widest a bar may draw, px: a handful of server bars must not stretch across the plot. */
const MAX_BAR_SPACING = 24;
const VOLUME_OPTIONS = { priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false } as const;

export function CandleChart({ bars, last, halted, t, locale, label, onFail }: CandleChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const shown = useRef<readonly Bar[]>([]);
  const points = useRef<Points>({ data: [], vol: [], last: null });
  const [cursor, setCursor] = useState<Cursor>(NO_CURSOR);
  const [announce, setAnnounce] = useState("");
  /** The bar the legend shows: the pointer's or keyboard's bar, else the newest. */
  const [hover, setHover] = useState<number | null>(null);
  const precision = decimalsOf(last ?? bars[bars.length - 1]?.c ?? "");

  /** Tag at the last price, band at the live edge: transforms only. */
  const place = useCallback(() => {
    const a = api.current;
    const tag = tagRef.current;
    if (!a) return;
    const pane = a.chart.paneSize();
    const y = points.current.last === null ? null : a.series.priceToCoordinate(points.current.last);
    if (tag) {
      tag.hidden = y === null;
      if (y !== null) tag.style.transform = `translate(${pane.width}px, ${Math.round(y - tag.offsetHeight / 2)}px)`;
    }
    const band = bandRef.current;
    if (band) { band.style.transform = `translateX(${Math.max(0, pane.width - BAND_W)}px)`; band.style.height = `${pane.height}px`; }
  }, []);

  // Create once; re-theme when the html theme attributes change.
  useEffect(() => {
    const host = hostRef.current;
    const plot = plotRef.current;
    if (!host || !plot) return;
    const first = readChartTheme(host);
    if (!first) { onFail(); return; }
    let th = first;
    let chart: IChartApi;
    let series: ISeriesApi<"Candlestick">;
    let volume: ISeriesApi<"Histogram">;
    try {
      chart = createChart(plot, chartOptions(th, locale, precision, t));
      series = chart.addSeries(CandlestickSeries, seriesOptions(th, precision));
      volume = chart.addSeries(HistogramSeries, VOLUME_OPTIONS);
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: VOLUME_TOP, bottom: 0 }, visible: false });
    } catch {
      onFail();
      return;
    }
    const a: Api = { chart, series, volume, line: null, theme: th };
    api.current = a;
    const onMove = () => place();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onMove);
    chart.timeScale().subscribeSizeChange(onMove);
    const onCross = (p: MouseEventParams<Time>) => {
      const i = p.logical === undefined || p.point === undefined ? null : Math.round(p.logical);
      setHover(i !== null && i >= 0 && i < points.current.data.length ? i : null);
    };
    chart.subscribeCrosshairMove(onCross);
    const mo = new MutationObserver(() => {
      const next = readChartTheme(host);
      if (!next) { onFail(); return; }
      th = next;
      a.theme = next;
      try {
        chart.applyOptions(chartOptions(th, locale, precision, t));
        series.applyOptions(seriesOptions(th, precision));
        volume.setData(points.current.vol.map((v) => volPoint(v, th)));
        a.line?.applyOptions({ color: th.colours.lastLine });
      } catch {
        onFail();
        return;
      }
      place();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: THEME_ATTRS });
    if (MOCK_HOOKS) {
      (window as Window & { __quayChart?: unknown }).__quayChart = {
        chart: () => chart.options(), series: () => series.options(), line: () => a.line?.options() ?? null,
        theme: () => th, visible: () => chart.timeScale().getVisibleLogicalRange(), data: () => series.data(),
        volume: () => volume.data(), volumeOptions: () => volume.options(),
      };
    }
    return () => {
      mo.disconnect();
      chart.unsubscribeCrosshairMove(onCross);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onMove);
      chart.timeScale().unsubscribeSizeChange(onMove);
      chart.remove();
      api.current = null;
      shown.current = [];
    };
    // Locale and precision re-create the formatters; the chart itself is created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.chart.applyOptions(chartOptions(a.theme, locale, precision, t));
    a.series.applyOptions(seriesOptions(a.theme, precision));
  }, [locale, precision, t]);

  // Bars: a frame that only moves the last bar (same t), adds one (new t) or replaces one older bar in place (a late
  // volume correction) is an update that keeps the view; anything else is new data.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const prev = shown.current;
    const p = toPoints(bars, last);
    points.current = p;
    const grew = bars.length - prev.length;
    const live = prev.length > 0 && (grew === 0 || grew === 1) && bars[0] === prev[0] && (prev.length < 2 || bars[prev.length - 2] === prev[prev.length - 2]);
    const newest = p.data[p.data.length - 1];
    const newestVol = p.vol[p.vol.length - 1];
    let fixed = -1; // the one replaced older bar, same length otherwise identical
    if (prev.length > 1 && grew === 0 && bars[bars.length - 1] === prev[prev.length - 1]) {
      for (let i = 0; i < bars.length - 1; i++) {
        if (bars[i] === prev[i]) continue;
        if (fixed >= 0 || bars[i]!.t !== prev[i]!.t) { fixed = -1; break; }
        fixed = i;
      }
    }
    if (fixed >= 0) {
      a.series.update(p.data[fixed]!, true);
      a.volume.update(volPoint(p.vol[fixed]!, a.theme), true);
    } else if (live && newest && newestVol) {
      if (grew === 1 && prev.length > 0) { a.series.update(p.data[prev.length - 1]!); a.volume.update(volPoint(p.vol[prev.length - 1]!, a.theme)); }
      a.series.update(newest);
      a.volume.update(volPoint(newestVol, a.theme));
    } else {
      a.series.setData(p.data);
      a.volume.setData(p.vol.map((v) => volPoint(v, a.theme)));
      a.chart.timeScale().fitContent();
      setCursor(NO_CURSOR);
    }
    shown.current = bars;
    if (p.last !== null) {
      if (a.line) a.line.applyOptions({ price: p.last });
      else {
        a.line = a.series.createPriceLine({ price: p.last, color: a.theme.colours.lastLine, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, lineVisible: true });
      }
    } else if (a.line) { a.series.removePriceLine(a.line); a.line = null; }
    place();
    const id = requestAnimationFrame(() => place());
    return () => cancelAnimationFrame(id);
  }, [bars, last, place]);

  useEffect(() => { place(); }, [halted, place]);

  // Keyboard crosshair and zoom.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const n = points.current.data.length;
    const w = visibleWindow(n, cursor);
    if (w) a.chart.timeScale().setVisibleLogicalRange({ from: w.from - 0.5, to: w.to + 0.5 });
    else if (cursor.visible === null) a.chart.timeScale().fitContent();
    const pt = cursor.index !== null ? points.current.data[cursor.index] : undefined;
    if (pt) a.chart.setCrosshairPosition(pt.close, pt.time, a.series);
    else a.chart.clearCrosshairPosition();
  }, [cursor]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const next = chartKey(cursor, e.key, bars.length);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    setCursor(next);
    const b = next.index !== null ? bars[next.index] : undefined;
    if (b && next.index !== cursor.index) setAnnounce(t.crosshairAria(barTime(b.t, locale, t), ...ohlcv(b, locale)));
  };

  const shownBar = bars[cursor.index ?? hover ?? bars.length - 1] ?? bars[bars.length - 1];
  return (
    <div className="cc" ref={hostRef} data-testid="br-chart-plot">
      {/* Always laid out (two lines reserved), so the plot below never resizes when the bars arrive. */}
      <p className="cc-legend num" data-testid="br-chart-legend" data-t={shownBar?.t} aria-hidden="true">
        {shownBar && <span className="cc-legend-time">{barTime(shownBar.t, locale, t)}</span>}
        {shownBar && (["o", "h", "l", "c", "v"] as const).map((k) => (
          <span key={k} data-k={k}><span className="cc-legend-k">{t.legend[k]}</span> {decText(shownBar[k], locale)}</span>
        ))}
      </p>
      <div className="cc-stage">
        <div className="cc-plot" ref={plotRef} role="img" aria-label={label} tabIndex={0} onKeyDown={onKey}
          onBlur={() => setCursor((c) => (c.index === null ? c : { ...c, index: null }))} data-testid="br-chart-canvas" />
        {halted && (
          <>
            <div className="cc-band" ref={bandRef} data-testid="br-chart-halt" aria-hidden="true" />
            <span className="cc-halted" data-testid="br-chart-halted">{t.halted}</span>
          </>
        )}
        {last !== null && <span className="cc-tag num" ref={tagRef} data-testid="br-chart-tag" aria-hidden="true">{decText(last, locale)}</span>}
      </div>
      <p className="sr-only" aria-live="polite" data-testid="br-chart-live">{announce}</p>
    </div>
  );
}

/** A bar's five server strings with locale grouping, for the legend and the crosshair announcement. */
function ohlcv(b: Bar, locale: string): [string, string, string, string, string] {
  return [decText(b.o, locale), decText(b.h, locale), decText(b.l, locale), decText(b.c, locale), decText(b.v, locale)];
}

export default CandleChart;
