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
//  - Trend lines (TrendLayer) are drawn over the plot when PriceChart passes `draw`; a series primitive tells the layer
//    each time the chart redraws, so the lines follow pan, zoom, resize and new bars in the same frame.
//  - Overlays (PriceChart passes the ones on): SMA, EMA, Bollinger (two lines) and VWAP on the price scale, RSI in a
//    pane of its own under the plot (fixed 0..100 scale, 30 / 70 guides; never a price). All from the shown bars
//    (movingAverages.ts), recomputed on every change (a live bar replaced, a corrected close or volume, a new range or
//    history); an overlay turned off is removed (the RSI pane with it). Their values for the legend's bar sit on a
//    line of their own under it; VWAP's name says where its sum starts.
//  - Colours are tokens read with getComputedStyle (chartTheme.ts) and re-read when the palette, hc, motion or text
//    scale changes. The last-price tag and the halt band are DOM overlays moved with transforms (no layout shift).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, TickMarkType, createChart,
  type CandlestickData, type HistogramData, type IChartApi, type IPriceLine, type ISeriesApi, type LineData, type MouseEventParams, type Time, type UTCTimestamp,
} from "lightweight-charts";
import type { BrStrings } from "@/apps/broker/strings-en";
import { decText } from "@/apps/portfolio/positions/format";
import { pfNumberLocale } from "@/apps/portfolio/strings";
import type { Bar } from "@/shell/contracts/history";
import { clockAt, clockLabel } from "@/shell/mockChannels";
import { clockStrings } from "@/shell/strings";
import { barTime } from "./ChartTable";
import { parseSrgb } from "./chartColor";
import { THEME_ATTRS, readChartTheme, type ChartTheme } from "./chartTheme";
import type { StudyKind } from "./chartStudies";
import { bollinger, ema, rsi, sma, vwap } from "./movingAverages";
import { TrendLayer, chartGeo } from "./TrendLayer";
import type { TrendDraw } from "./trendlines";
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

/** The indexes to update when `next` only replaces bars of `prev` in place (same t) and/or appends newer bars, in order;
 *  null when it is new data (a new range, a shift, more than MAX_EDITS changes). */
const MAX_EDITS = 64;
export function inPlaceEdits(prev: readonly Bar[], next: readonly Bar[]): number[] | null {
  if (next.length < prev.length || next.length - prev.length > MAX_EDITS) return null;
  const out: number[] = [];
  for (let i = 0; i < prev.length; i++) {
    if (next[i] === prev[i]) continue;
    if (next[i]!.t !== prev[i]!.t || out.length >= MAX_EDITS) return null;
    out.push(i);
  }
  for (let i = prev.length; i < next.length; i++) {
    if (next[i]!.t <= next[i - 1]!.t) return null;
    out.push(i);
  }
  return out;
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
  /** Trend lines (signed in or guest, once this device's copy is read); absent: no drawing layer. */
  readonly draw?: TrendDraw;
  /** The overlays that are on, in order, with their periods (bars; VWAP: its session in ticks). */
  readonly studies?: readonly StudyOn[];
  /** VWAP is on and the newest bar's day has no traded volume yet: since when (clock), else null. */
  readonly onVwapIdle?: (since: string | null) => void;
}
export interface StudyOn { readonly kind: StudyKind; readonly n: number }
const NO_STUDIES: readonly StudyOn[] = [];

interface Api { chart: IChartApi; series: ISeriesApi<"Candlestick">; volume: ISeriesApi<"Histogram">; line: IPriceLine | null; theme: ChartTheme }

function chartOptions(th: ChartTheme, locale: string, precision: number, s: Pick<BrStrings, "tickLabel">, lockView = false) {
  const c = th.colours;
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: c.bg }, textColor: c.text, fontFamily: th.fontFamily, fontSize: th.fontSize, attributionLogo: false, colorParsers: [parseSrgb],
      // The RSI pane's top edge: the axis border colour, not the library's default.
      panes: { separatorColor: c.crosshair, separatorHoverColor: c.grid },
    },
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
    // Prices are formatted per series (priceFormat below): a chart-wide price formatter would print the RSI pane's 0..100
    // scale with the asset's decimals too.
    localization: { locale: pfNumberLocale(locale), timeFormatter: (time: Time) => barTime(tickOfTime(time), locale, s) },
    kineticScroll: { touch: !th.reducedMotion && !lockView, mouse: false },
    // A vertical drag on a phone scrolls the page, never the chart. While a trend
    // line is being placed, lock the view: the layer takes the pointer, and this
    // also stops a kinetic fling from the pan just before the tool was tapped.
    handleScroll: { vertTouchDrag: false, horzTouchDrag: !lockView, pressedMouseMove: !lockView, mouseWheel: !lockView },
  };
}

/** A price in the asset's decimals and the locale's digits (candles, price-scale overlays, their axis and crosshair). */
function priceFormat(locale: string, precision: number) {
  const f = new Intl.NumberFormat(pfNumberLocale(locale), { minimumFractionDigits: precision, maximumFractionDigits: precision });
  return { type: "custom" as const, minMove: 1 / 10 ** precision, formatter: (p: number) => f.format(p) };
}
function seriesOptions(th: ChartTheme, precision: number, locale: string) {
  const { up, down } = th.colours;
  return {
    upColor: up, downColor: down, wickUpColor: up, wickDownColor: down,
    // hc: an outlined body in the same colour, so a thin candle still reads at 1 px.
    borderVisible: th.hc, borderUpColor: up, borderDownColor: down,
    priceLineVisible: false, lastValueVisible: false,
    priceFormat: priceFormat(locale, precision),
  } as const;
}

/** Widest a bar may draw, px: a handful of server bars must not stretch across the plot. */
const MAX_BAR_SPACING = 24;
/** Each overlay's line look: SMA solid, EMA dashed, Bollinger long dashes, VWAP dotted, RSI solid in its own pane. */
const STUDY_STYLE: Readonly<Record<StudyKind, LineStyle>> = { sma: LineStyle.Solid, ema: LineStyle.Dashed, bb: LineStyle.LargeDashed, vwap: LineStyle.Dotted, rsi: LineStyle.Solid };
const RSI_RANGE = { priceRange: { minValue: 0, maxValue: 100 } };
/** RSI's pane, px. candleChart.css (.cc-rsi) adds it, the pane separator and the time axis under the plot, so the
 *  price pane keeps the whole 200 / 240 px plot (more than without RSI, whose plot also holds the time axis). */
const RSI_PANE_H = 80;
function studyOptions(th: ChartTheme, kind: StudyKind, precision: number, locale: string) {
  const rsiLine = kind === "rsi";
  const one = new Intl.NumberFormat(pfNumberLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    color: th.colours[kind], lineWidth: th.hc ? 3 : 2, lineStyle: STUDY_STYLE[kind],
    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    // RSI is 0..100 on its own scale, one decimal: never a price.
    // (its own formatter: the chart's price formatter would print it with the asset's decimals)
    priceFormat: rsiLine ? { type: "custom" as const, minMove: 0.1, formatter: (v: number) => one.format(v) } : priceFormat(locale, precision),
    autoscaleInfoProvider: rsiLine ? () => RSI_RANGE : undefined,
  } as const;
}
/** An overlay's values per shown bar: one line, or Bollinger's upper and lower; VWAP's start tick per bar. */
interface StudyOut extends StudyOn { readonly lines: readonly (readonly (number | null)[])[]; readonly from?: readonly (number | null)[] }
function computeStudy(s: StudyOn, p: Points): StudyOut {
  const c = p.data.map((d) => d.close);
  if (s.kind === "sma") return { ...s, lines: [sma(c, s.n)] };
  if (s.kind === "ema") return { ...s, lines: [ema(c, s.n)] };
  if (s.kind === "bb") return { ...s, lines: bollinger(c, s.n) };
  if (s.kind === "rsi") return { ...s, lines: [rsi(c, s.n)] };
  const w = vwap(p.data.map((d, i) => ({ t: d.time / SECONDS_PER_TICK, h: d.high, l: d.low, c: d.close, v: p.vol[i]!.value })), s.n);
  return { ...s, lines: [w.values], from: w.from };
}
/** An overlay's values on the bars' times; a bar without a value (before n closes) has no point. */
export function studyPoints(data: readonly { time: UTCTimestamp }[], values: readonly (number | null)[]): LineData<UTCTimestamp>[] {
  const out: LineData<UTCTimestamp>[] = [];
  values.forEach((v, i) => { if (v !== null) out.push({ time: data[i]!.time, value: v }); });
  return out;
}
const VOLUME_OPTIONS = { priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false } as const;

export function CandleChart({ bars, last, halted, t, locale, label, onFail, draw, studies = NO_STUDIES, onVwapIdle }: CandleChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const lockRef = useRef(false);
  const shown = useRef<readonly Bar[]>([]);
  const points = useRef<Points>({ data: [], vol: [], last: null });
  const [cursor, setCursor] = useState<Cursor>(NO_CURSOR);
  const [announce, setAnnounce] = useState("");
  /** The bar the legend shows: the pointer's or keyboard's bar, else the newest. */
  const [hover, setHover] = useState<number | null>(null);
  const precision = decimalsOf(last ?? bars[bars.length - 1]?.c ?? "");
  const precisionRef = useRef(precision);
  /** The overlays' values per bar (from the same numbers the canvas gets), and their line series. */
  const numbers = useMemo(() => toPoints(bars, null), [bars]);
  const studyKey = studies.map((s) => `${s.kind}${s.n}`).join(",");
  const studyValues = useMemo(() => studies.map((s) => computeStudy(s, numbers)),
    // studyKey stands for `studies` (a new array per render with the same overlays)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numbers, studyKey]);
  /** Line series by overlay and line ("bb0", "bb1"), and RSI's 30 / 70 guides. */
  const studyLines = useRef(new Map<string, { kind: StudyKind; s: ISeriesApi<"Line"> }>());
  const guides = useRef<IPriceLine[]>([]);
  /** Called on every chart redraw (the trend layer re-maps its points). */
  const [redraw] = useState(() => new Set<() => void>());
  const geoOf = useCallback(() => {
    const a = api.current;
    return a ? chartGeo(a.chart, a.series, shown.current.map((b) => b.t)) : null;
  }, []);

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
      chart = createChart(plot, chartOptions(th, locale, precision, t, lockRef.current));
      series = chart.addSeries(CandlestickSeries, seriesOptions(th, precision, locale));
      volume = chart.addSeries(HistogramSeries, VOLUME_OPTIONS);
      series.attachPrimitive({ updateAllViews: () => redraw.forEach((f) => f()) });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: VOLUME_TOP, bottom: 0 }, visible: false });
    } catch {
      onFail();
      return;
    }
    const a: Api = { chart, series, volume, line: null, theme: th };
    api.current = a;
    const lines = studyLines.current;
    const onMove = () => place();
    // The tag follows every chart redraw: the library rescales the price axis on its own frame, after setData, so a
    // tag placed only on data / range / size events could sit off the last price until the next one (S1-03).
    redraw.add(place);
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
        chart.applyOptions(chartOptions(th, locale, precision, t, lockRef.current));
        series.applyOptions(seriesOptions(th, precision, locale));
        volume.setData(points.current.vol.map((v) => volPoint(v, th)));
        a.line?.applyOptions({ color: th.colours.lastLine });
        for (const l of lines.values()) l.s.applyOptions(studyOptions(th, l.kind, precisionRef.current, locale));
        for (const g of guides.current) g.applyOptions({ color: th.colours.crosshair });
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
        // The overlays' line series as drawn (kind, options, points).
        studies: () => [...lines].map(([key, l]) => ({ key, kind: l.kind, pane: l.s.getPane().paneIndex(), options: l.s.options(), data: l.s.data() })),
        panes: () => chart.panes().map((p) => p.getHeight()),
        guides: () => guides.current.map((g) => g.options()),
        // The RSI scale's own labels for 70 and 30 (the series formatter its axis uses).
        rsiScale: () => { const r = lines.get("rsi0")?.s.priceFormatter(); return r ? [r.format(70), r.format(30)] : []; },
        // A tick and price in pane pixels by the library's own scales (the e2e checks a trend line against them).
        coord: (tick: number, price: number) => ({ x: chart.timeScale().timeToCoordinate((tick * SECONDS_PER_TICK) as UTCTimestamp), y: series.priceToCoordinate(price) }),
      };
    }
    return () => {
      mo.disconnect();
      redraw.delete(place);
      chart.unsubscribeCrosshairMove(onCross);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onMove);
      chart.timeScale().unsubscribeSizeChange(onMove);
      chart.remove();
      api.current = null;
      shown.current = [];
      lines.clear();
    };
    // Locale and precision re-create the formatters; the chart itself is created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    lockRef.current = draw?.placing != null;
    const a = api.current;
    if (!a) return;
    a.chart.applyOptions(chartOptions(a.theme, locale, precision, t, lockRef.current));
    a.series.applyOptions(seriesOptions(a.theme, precision, locale));
    // Pin the range so a kinetic fling from a pan just before placing cannot keep sliding.
    if (lockRef.current) {
      const range = a.chart.timeScale().getVisibleLogicalRange();
      if (range) a.chart.timeScale().setVisibleLogicalRange(range);
    }
  }, [locale, precision, t, draw?.placing]);

  // Bars: a frame that only replaces bars in place (same t: the live bar, a closed bar's final values, late volume) and/or
  // appends newer ones is an update that keeps the view; anything else (a new range) is new data.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const prev = shown.current;
    const p = toPoints(bars, last);
    points.current = p;
    const edits = prev.length > 0 ? inPlaceEdits(prev, bars) : null;
    if (edits) {
      const lastOld = prev.length - 1;
      for (const i of edits) {
        a.series.update(p.data[i]!, i < lastOld);
        a.volume.update(volPoint(p.vol[i]!, a.theme), i < lastOld);
      }
    } else {
      a.series.setData(p.data);
      a.volume.setData(p.vol.map((v) => volPoint(v, a.theme)));
      // A bar inserted inside the same range (a skipped tick caught up) keeps the view; a new range fits.
      if (prev[0]?.t !== bars[0]?.t || bars.length < prev.length) {
        a.chart.timeScale().fitContent();
        setCursor(NO_CURSOR);
      }
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

  // Overlays: one line series per overlay that is on, its points replaced whenever the bars or the period change (the
  // whole series is recomputed, so a replaced live bar or a corrected close never leaves a stale point behind).
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const lines = studyLines.current;
    const on = new Set(studyValues.flatMap((s) => s.lines.map((_, i) => `${s.kind}${i}`)));
    for (const [k, l] of lines) {
      if (on.has(k)) continue;
      if (l.kind === "rsi") guides.current = []; // removed with their series (and the pane, now empty)
      a.chart.removeSeries(l.s);
      lines.delete(k);
    }
    const data = points.current.data;
    for (const s of studyValues) {
      s.lines.forEach((values, i) => {
        const key = `${s.kind}${i}`;
        let l = lines.get(key)?.s;
        if (!l) {
          l = a.chart.addSeries(LineSeries, studyOptions(a.theme, s.kind, precision, locale), s.kind === "rsi" ? 1 : 0);
          lines.set(key, { kind: s.kind, s: l });
          if (s.kind === "rsi") {
            // Its own pane under the price pane (RSI_PANE_H), with the 70 / 30 guides.
            a.chart.panes()[1]?.setHeight(RSI_PANE_H);
            l.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.12 } }); // 0 and 100 inside the pane
            guides.current = [70, 30].map((price) => l!.createPriceLine({ price, color: a.theme.colours.crosshair, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "" }));
          }
        } else l.applyOptions(studyOptions(a.theme, s.kind, precision, locale));
        l.setData(studyPoints(data, values));
      });
    }
    precisionRef.current = precision; // for a re-theme between renders
  }, [studyValues, precision, locale]);

  // While RSI shows: the pane split keeps proportions on a resize, RSI keeps its pixels instead (after the chart's own
  // resize, whose observer is older). No observer without RSI.
  const rsiOn = studies.some((s) => s.kind === "rsi");
  useEffect(() => {
    const a = api.current, plot = plotRef.current;
    if (!a || !plot || !rsiOn) return;
    const fit = new ResizeObserver(() => a.chart.panes()[1]?.setHeight(RSI_PANE_H));
    fit.observe(plot);
    return () => fit.disconnect();
  }, [rsiOn]);

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
    if (b && next.index !== cursor.index) setAnnounce([t.crosshairAria(barTime(b.t, locale, t), ...ohlcv(b, locale)), ...studyText(next.index!)].join(" · "));
  };

  const shownAt = Math.min(cursor.index ?? hover ?? bars.length - 1, bars.length - 1);
  const shownBar = bars[shownAt];
  const fmt = new Intl.NumberFormat(pfNumberLocale(locale), { minimumFractionDigits: precision, maximumFractionDigits: precision });
  const fmtRsi = new Intl.NumberFormat(pfNumberLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  /** An overlay's name and value(s) on bar i, as the legend reads them ("–" where it has no value). */
  function studyAt(s: StudyOut, i: number): { name: string; vals: (number | null)[]; text: string } {
    const vals = s.lines.map((l) => l[i] ?? null);
    const from = s.from?.[i] ?? null;
    const name = s.kind === "vwap" ? t.studyVwap(from === null || from % s.n === 0 ? null : clockLabel(clockAt(from)).hhmm) : t.studyName[s.kind](s.n);
    const f = s.kind === "rsi" ? fmtRsi : fmt;
    return { name, vals, text: vals.every((v) => v === null) ? "–" : vals.map((v) => (v === null ? "–" : f.format(v))).join(" / ") };
  }
  function studyText(i: number): string[] {
    return studyValues.map((s) => { const r = studyAt(s, i); return `${r.name} ${r.text}`; });
  }
  // VWAP with nothing traded yet on the newest bar's day: PriceChart says so (it reads no volumes itself).
  const vwapOut = studyValues.find((s) => s.kind === "vwap");
  const lastAt = bars.length - 1;
  const vwapFrom = vwapOut?.from?.[lastAt] ?? null;
  const idle = vwapOut && vwapFrom !== null && vwapOut.lines[0]![lastAt] === null ? clockLabel(clockAt(vwapFrom)).hhmm : null;
  useEffect(() => { onVwapIdle?.(idle); }, [idle, onVwapIdle]);
  return (
    <div className={rsiOn ? "cc cc-rsi" : "cc"} ref={hostRef} data-testid="br-chart-plot">
      {/* Always laid out (two lines reserved), so the plot below never resizes when the bars arrive. */}
      <p className="cc-legend num" data-testid="br-chart-legend" data-t={shownBar?.t} aria-hidden="true">
        {shownBar && <span className="cc-legend-time">{barTime(shownBar.t, locale, t)}</span>}
        {shownBar && (["o", "h", "l", "c", "v"] as const).map((k) => (
          <span key={k} data-k={k}><span className="cc-legend-k">{t.legend[k]}</span> {decText(shownBar[k], locale)}</span>
        ))}
        {/* The overlays on their own line (the legend's second reserved line on a wide plot). */}
        {studyValues.length > 0 && <span className="cc-legend-br" />}
        {studyValues.map((s) => {
          const r = studyAt(s, shownAt);
          return (
            <span key={s.kind} className={`cc-study cc-study-${s.kind}`} data-testid={`br-chart-study-${s.kind}`} data-n={s.n}
              data-v={r.vals[0] ?? ""} data-v2={r.vals[1] ?? undefined} data-from={s.from?.[shownAt] ?? undefined}>
              <span className="cc-legend-k">{r.name}</span> {r.text}
            </span>
          );
        })}
      </p>
      <div className="cc-stage" onPointerDown={(e) => {
        // A press anywhere on the plot but a line lets go of the selection (the press still pans the chart).
        if (draw?.selected && !(e.target instanceof Element && e.target.closest(".cc-trend"))) draw.onSelect(null);
      }}>
        <div className="cc-plot" ref={plotRef} role="img" aria-label={label} tabIndex={0} onKeyDown={onKey}
          onBlur={() => setCursor((c) => (c.index === null ? c : { ...c, index: null }))} data-testid="br-chart-canvas" />
        {halted && (
          <>
            <div className="cc-band" ref={bandRef} data-testid="br-chart-halt" aria-hidden="true" />
            <span className="cc-halted" data-testid="br-chart-halted">{t.halted}</span>
          </>
        )}
        {draw && <TrendLayer draw={draw} geoOf={geoOf} redraw={redraw} t={t} locale={locale} precision={precision} />}
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
