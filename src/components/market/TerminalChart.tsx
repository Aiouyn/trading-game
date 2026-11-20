"use client";
// The terminal's chart: candles from the sim's own trades, volume, indicators in their own panes, a crosshair legend,
// and one overlay canvas that carries everything the player can touch (drawings, order lines, the margin-call line).
// Prices are display units here (dollars); the caller converts cents. Nothing is priced in this file.
import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, PriceScaleMode, createChart,
  type AutoscaleInfoProvider, type IChartApi, type ISeriesApi, type LogicalRange, type UTCTimestamp,
} from "lightweight-charts";
import { bollinger, ema, rsi, sma } from "./movingAverages";
import {
  DAY_S, FIB, MIN_VIEW_CANDLES, RANGES, axisLabel, axisText, isIntraday, macd, minMoveFor, priceText, shown, sigText, stampLabel, volText, vwapOf,
  type Bar, type Drawing, type Pt, type RangeId, type Series, type Tool,
} from "./terminalApi";

export interface ChartLine { id: string; kind: "order" | "stop" | "pos" | "short" | "margin"; side?: "buy" | "sell"; price: number; label: string; drag?: boolean; /** pos and short: the line is drawn green or red by the open profit or loss */ gain?: boolean }
/** One of your fills: t is game days (a fraction inside a day), price is in the chart's units. */
export interface ChartMark { t: number; price: number; side: "buy" | "sell"; qty: number }
export interface Studies { sma: boolean; ema: boolean; bb: boolean; vwap: boolean; vol: boolean; rsi: boolean; macd: boolean; cmp: boolean }

interface Props {
  series: Series;
  compare: Series | null;
  studies: Studies;
  log: boolean;
  /** the percent axis wins over log */
  pct: boolean;
  /** candles or a close line */
  look: "candles" | "line";
  /** the range preset moves the visible window only; rangeKey changes each time one is pressed */
  range: RangeId;
  rangeKey: number;
  onScale: (m: "log" | "pct") => void;
  onStudy: (k: keyof Studies) => void;
  tool: Tool;
  onTool: (t: Tool) => void;
  drawings: Drawing[];
  onDrawings: (next: Drawing[]) => void;
  lines: ChartLine[];
  marks?: ChartMark[];
  onMoveLine: (id: string, price: number) => void;
  onPickPrice: (price: number) => void;
}

interface Tokens { bg: string; text: string; grid: string; line: string; fg: string; muted: string; up: string; down: string; acc: string; warn: string; info: string; steel: string; signal: string }

function readTokens(el: HTMLElement): Tokens {
  const cs = getComputedStyle(el);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    bg: v("--win", "#12151A"), text: v("--fg-faint", "#7E848E"), grid: v("--grid", "#1A1E25"), line: v("--line", "#262B33"),
    fg: v("--fg", "#ECE9E2"), muted: v("--fg-muted", "#9AA0A8"), up: v("--gain", "#3FD1B0"), down: v("--loss", "#FF6B5A"),
    acc: v("--acc", "#C9A45C"), warn: v("--warn", "#F2B33D"), info: v("--info", "#6EA8FE"), steel: v("--steel", "#7C8A99"), signal: v("--signal", "#E5484D"),
  };
}

function alpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function dedupe<T extends { time: UTCTimestamp }>(rows: T[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    if (out.length && out[out.length - 1]!.time === r.time) out[out.length - 1] = r;
    else if (!out.length || r.time > out[out.length - 1]!.time) out.push(r);
  }
  return out;
}

/** The empty candles kept to the right of the newest one (room to draw past the live candle). */
const RIGHT_OFFSET = 18;
/** Pixels a candle gets at the least when an intraday window opens: room for a body and a wick. */
const MIN_CANDLE_PX = 5;
/** The narrowest price range the plot shows, as a share of the price: a 0.1% wiggle never fills the plot. */
const MIN_SPAN_SHARE = 0.005;
const spanFloor: AutoscaleInfoProvider = (base) => {
  const res = base();
  if (!res || !res.priceRange) return res;
  const { minValue, maxValue } = res.priceRange;
  const mid = (minValue + maxValue) / 2;
  const floor = Math.abs(mid) * MIN_SPAN_SHARE;
  if (maxValue - minValue >= floor) return res;
  return { ...res, priceRange: { minValue: mid - floor / 2, maxValue: mid + floor / 2 } };
};

let seq = 0;
const newId = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function TerminalChart(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const api = useRef<{ chart: IChartApi; candle: ISeriesApi<"Candlestick">; closeLine: ISeriesApi<"Line">; layers: Map<string, ISeriesApi<"Line" | "Histogram">>; tk: Tokens; rsiPane: number; macdPane: number } | null>(null);
  const times = useRef<number[]>([]);
  const prevShape = useRef<{ id: string; tf: string; n: number; first: number }>({ id: "", tf: "", n: 0, first: 0 });
  const [auto, setAuto] = useState(true);
  const [axisW, setAxisW] = useState(64);
  const ix = useRef<{ sel: string; draft: Pt | null; first: Pt | null; hover: { x: number; y: number } | null; drag: null | { kind: "line"; id: string; price: number } | { kind: "pt"; id: string; which: "a" | "b" } | { kind: "body"; id: string; from: Pt; orig: Drawing } }>({ sel: "", draft: null, first: null, hover: null, drag: null });
  const dirty = useRef(true);
  const [legend, setLegend] = useState<{ ts: number; bar: Bar | null; prev: number | null } | null>(null);
  const [chips, setChips] = useState<{ k: keyof Studies; label: string; value: string }[]>([]);
  const [theme, setTheme] = useState(0);
  const [editing, setEditing] = useState<{ id: string; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(0);

  const { series, studies } = props;
  const layoutKey = `${studies.rsi ? 1 : 0}${studies.macd ? 1 : 0}`;

  // The palette can change under us: rebuild with the new tokens.
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-palette", "data-hc"] });
    return () => mo.disconnect();
  }, []);

  // ---- chart lifetime: one chart per pane layout and palette ----
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const tk = readTokens(el);
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: tk.bg }, textColor: tk.text, fontSize: 11, panes: { separatorColor: tk.line, separatorHoverColor: tk.grid } },
      grid: { vertLines: { color: tk.grid }, horzLines: { color: tk.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: tk.steel, labelBackgroundColor: tk.line }, horzLine: { color: tk.steel, labelBackgroundColor: tk.line } },
      rightPriceScale: { borderColor: tk.line, scaleMargins: { top: 0.08, bottom: 0.08 }, minimumWidth: 64 },
      timeScale: {
        borderColor: tk.line, rightOffset: RIGHT_OFFSET, barSpacing: 9, minBarSpacing: 1.5, timeVisible: true, secondsVisible: false,
        tickMarkFormatter: (time: unknown) => axisLabel(Number(time), live.current.series.tf, live.current.series.session),
      },
      localization: { timeFormatter: (time: unknown) => stampLabel(Number(time), isIntraday(live.current.series.tf)) },
      // the mouse on the axes as TradingView has it: drag an axis to scale it, double-click it to reset
      handleScale: { mouseWheel: false, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: tk.up, downColor: tk.down, borderVisible: false, wickUpColor: tk.up, wickDownColor: tk.down,
      priceLineColor: tk.acc, priceLineStyle: LineStyle.Dotted, lastValueVisible: true, autoscaleInfoProvider: spanFloor,
      priceFormat: { type: "custom", formatter: (p: number) => priceText("pts", p), minMove: 0.0001 },
    }, 0);
    const closeLine = chart.addSeries(LineSeries, {
      color: tk.fg, lineWidth: 2, priceLineColor: tk.acc, priceLineStyle: LineStyle.Dotted, lastValueVisible: true, visible: false, autoscaleInfoProvider: spanFloor,
      priceFormat: { type: "custom", formatter: (p: number) => priceText("pts", p), minMove: 0.0001 },
    }, 0);
    const rsiPane = studies.rsi ? 1 : -1;
    const macdPane = studies.macd ? (studies.rsi ? 2 : 1) : -1;
    api.current = { chart, candle, closeLine, layers: new Map(), tk, rsiPane, macdPane };
    prevShape.current = { id: "", tf: "", n: 0, first: 0 };
    chart.subscribeCrosshairMove((p) => {
      const t = p.time as number | undefined;
      const bars = live.current.series.bars;
      if (t === undefined || !p.point) { setLegend(null); return; }
      let lo = 0, hi = bars.length - 1, at = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const bt = bars[mid]!.ts;
        if (bt === t) { at = mid; break; }
        if (bt < t) lo = mid + 1; else hi = mid - 1;
      }
      setLegend({ ts: t, bar: at >= 0 ? bars[at]! : null, prev: at > 0 ? bars[at - 1]!.c : null });
      ix.current.hover = { x: p.point.x, y: p.point.y };
      dirty.current = true;
    });
    setReady((n) => n + 1);
    return () => { api.current = null; chart.remove(); };
    // layoutKey and theme are the only reasons to rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, theme]);

  // ---- data ----
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const { chart, candle, closeLine, layers, tk } = a;
    const u = series.unit;
    const bars = series.bars;
    const tv = (b: Bar) => b.ts as UTCTimestamp;
    // Axis labels: the decimals follow what the axis shows now (a coin at a fraction of a cent, an index in points, a share in dollars),
    // and a pane with its own scale (RSI, MACD) reads its own range. Never "0.000000", never "-0.000000".
    const spanOf = (s: ISeriesApi<"Candlestick" | "Line" | "Histogram">): number => { const r = s.priceScale().getVisibleRange(); return r ? Math.abs(r.to - r.from) : 0; };
    const floorOf = u === "rate" ? 4 : 2;
    let lowest = Infinity;
    for (const b of bars) { const l = shown(u, b.l); if (l > 0 && l < lowest) lowest = l; }
    // a price is never negative: the empty margin the scale keeps under a low-priced coin carries no label
    const fmt = (p: number) => (props.pct ? `${axisText(p, spanOf(candle), 2)}%` : p < 0 && lowest > 0 && Number.isFinite(lowest) ? "" : axisText(p, spanOf(candle), floorOf));
    const pf = { priceFormat: { type: "custom" as const, formatter: fmt, minMove: u === "rate" ? 0.0001 : minMoveFor(lowest) } };
    candle.applyOptions({ ...pf, visible: props.look === "candles" });
    closeLine.applyOptions({ ...pf, visible: props.look === "line" });
    chart.priceScale("right", 0).applyOptions({ mode: props.pct ? PriceScaleMode.Percentage : props.log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal, scaleMargins: { top: 0.08, bottom: studies.vol ? 0.24 : 0.08 } });

    const range = chart.timeScale().getVisibleLogicalRange();
    const same = prevShape.current.id === series.id && prevShape.current.tf === series.tf;
    const prevN = prevShape.current.n;

    const ohlc = dedupe(bars.map((b) => ({ time: tv(b), open: shown(u, b.o), high: shown(u, b.h), low: shown(u, b.l), close: shown(u, b.c) })));
    // The clock running only moves the newest candle or adds one: update those and leave the rest of the chart alone.
    const lined = studies.sma || studies.ema || studies.bb || studies.vwap || studies.cmp || studies.rsi || studies.macd;
    const vs = layers.get("vol") as ISeriesApi<"Histogram"> | undefined;
    if (same && !lined && prevN > 0 && ohlc.length >= prevN && ohlc.length - prevN <= 2 && prevShape.current.first === (ohlc[0]?.time ?? -1) && (studies.vol ? !!vs : !vs)) {
      for (let i = prevN - 1; i < ohlc.length; i++) {
        const r = ohlc[i]!, b = bars[i];
        candle.update(r);
        closeLine.update({ time: r.time, value: r.close });
        if (vs && b && b.v > 0) vs.update({ time: r.time, value: b.v, color: alpha(b.c >= b.o ? tk.up : tk.down, 0.55) });
      }
      times.current = ohlc.map((r) => r.time as number);
      prevShape.current = { id: series.id, tf: series.tf, n: ohlc.length, first: times.current[0] ?? 0 };
      dirty.current = true;
      return;
    }
    candle.setData(ohlc);
    closeLine.setData(ohlc.map((r) => ({ time: r.time, value: r.close })));
    times.current = ohlc.map((r) => r.time as number);
    const closes = ohlc.map((r) => r.close);

    const setLayer = (name: string, make: () => ISeriesApi<"Line" | "Histogram">, data: { time: UTCTimestamp; value: number; color?: string }[] | null) => {
      let s = layers.get(name);
      if (!data) { if (s) { chart.removeSeries(s); layers.delete(name); } return; }
      if (!s) { s = make(); layers.set(name, s); }
      s.setData(data);
    };
    const line = (name: string, vals: (number | null)[], color: string, pane: number, style: LineStyle = LineStyle.Solid, width: 1 | 2 = 1, opts: Record<string, unknown> = {}) => {
      const data = vals.flatMap((v, i) => (v === null || !Number.isFinite(v) ? [] : [{ time: ohlc[i]!.time, value: v }]));
      setLayer(name, () => chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, ...opts }, pane), data);
    };
    const off = (name: string) => setLayer(name, () => { throw new Error("unreachable"); }, null);

    // volume bars under the price
    if (studies.vol && bars.some((b) => b.v > 0)) {
      // a short band at the foot of the chart, scaled to the bars in view, each bar coloured by its candle's direction
      const vol = dedupe(bars.filter((b) => b.v > 0).map((b) => ({ time: tv(b), value: b.v, color: alpha(b.c >= b.o ? tk.up : tk.down, 0.55) })));
      setLayer("vol", () => {
        const s = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false }, 0);
        chart.priceScale("vol", 0).applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
        return s;
      }, vol);
    } else off("vol");

    if (studies.sma) { line("sma20", sma(closes, 20), tk.info, 0); line("sma50", sma(closes, 50), tk.acc, 0); } else { off("sma20"); off("sma50"); }
    if (studies.ema) line("ema", ema(closes, 21), tk.warn, 0, LineStyle.Dashed); else off("ema");
    if (studies.bb) {
      const [up, lo] = bollinger(closes, 20);
      line("bbu", up, tk.steel, 0, LineStyle.Dashed); line("bbl", lo, tk.steel, 0, LineStyle.Dashed);
    } else { off("bbu"); off("bbl"); }
    if (studies.vwap) line("vwap", vwapOf(dedupeBars(bars), isIntraday(series.tf)).map((v) => (v === null ? null : shown(u, v))), tk.muted, 0, LineStyle.Dotted); else off("vwap");

    if (studies.cmp && props.compare && props.compare.bars.length) {
      const by = new Map(props.compare.bars.map((b) => [b.ts, b.c]));
      let k = 0, found = false;
      for (const r of ohlc) { const c = by.get(r.time as number); if (c) { k = r.close / c; found = true; break; } }
      line("cmp", ohlc.map((r) => { const c = by.get(r.time as number); return found && c ? c * k : null; }), tk.info, 0, LineStyle.Dashed, 2);
    } else off("cmp");

    if (a.rsiPane > 0) {
      const r = rsi(closes, 14);
      line("rsi", r, tk.steel, a.rsiPane, LineStyle.Solid, 1, { priceFormat: { type: "custom", formatter: (v: number) => axisText(v, 0, 0), minMove: 0.1 } });
      const s = layers.get("rsi") as ISeriesApi<"Line"> | undefined;
      if (s && !layers.has("rsi70")) {
        layers.set("rsi70", s);
        s.createPriceLine({ price: 70, color: tk.line, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
        s.createPriceLine({ price: 30, color: tk.line, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      }
    } else { off("rsi"); layers.delete("rsi70"); }
    if (a.macdPane > 0) {
      const m = macd(closes);
      // the MACD pane reads its own range: a hundredth of a cent on a coin, a few cents on a share
      const macdFmt = (v: number) => { const ms = layers.get("macd"); const r = ms ? ms.priceScale().getVisibleRange() : null; return axisText(v, r ? Math.abs(r.to - r.from) : 0, 0); };
      const macdOpts = { priceFormat: { type: "custom" as const, formatter: macdFmt, minMove: 1e-8 } };
      line("macd", m.line, tk.info, a.macdPane, LineStyle.Solid, 1, macdOpts);
      line("macds", m.signal, tk.warn, a.macdPane, LineStyle.Solid, 1, macdOpts);
      const hd = m.hist.flatMap((v, i) => (v === null ? [] : [{ time: ohlc[i]!.time, value: v, color: alpha(v >= 0 ? tk.up : tk.down, 0.5) }]));
      setLayer("macdh", () => chart.addSeries(HistogramSeries, { lastValueVisible: false, priceLineVisible: false, ...macdOpts }, a.macdPane), hd);
    } else { off("macd"); off("macds"); off("macdh"); }

    const panes = chart.panes();
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 4 : 1));
    // the legend rows: each active indicator and its newest value
    const last = (v: (number | null)[]) => { for (let i = v.length - 1; i >= 0; i--) if (v[i] !== null && Number.isFinite(v[i]!)) return v[i]!; return null; };
    const num = (v: number | null) => (v === null ? "–" : sigText(v));
    const rows: { k: keyof Studies; label: string; value: string }[] = [];
    if (studies.sma) rows.push({ k: "sma", label: "SMA 20 / 50", value: `${num(last(sma(closes, 20)))} / ${num(last(sma(closes, 50)))}` });
    if (studies.ema) rows.push({ k: "ema", label: "EMA 21", value: num(last(ema(closes, 21))) });
    if (studies.bb) { const [bu, bl] = bollinger(closes, 20); rows.push({ k: "bb", label: "Bollinger", value: `${num(last(bu))} / ${num(last(bl))}` }); }
    if (studies.vwap) rows.push({ k: "vwap", label: "VWAP", value: num(last(vwapOf(dedupeBars(bars), isIntraday(series.tf)).map((v) => (v === null ? null : shown(u, v))))) });
    if (studies.rsi) { const r = last(rsi(closes, 14)); rows.push({ k: "rsi", label: "RSI 14", value: r === null ? "–" : r.toFixed(1) }); }
    if (studies.macd) { const m = last(macd(closes).line); rows.push({ k: "macd", label: "MACD", value: m === null ? "–" : sigText(m) }); }
    setChips((old) => (old.length === rows.length && old.every((o, i) => o.k === rows[i]!.k && o.value === rows[i]!.value) ? old : rows));
    // a new instrument or size opens on the auto scale, with the range preset's window; the same one keeps the player's view
    const n = ohlc.length;
    if (!same || !range) {
      if (!same) chart.priceScale("right", 0).applyOptions({ autoScale: true });
      applyRange(chart, ohlc.map((r) => r.time as number), props.range, isIntraday(series.tf));
    } else {
      const atEdge = range.to >= prevN - 1 + 2;
      const shift = atEdge ? n - prevN : 0;
      chart.timeScale().setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift } as LogicalRange);
    }
    prevShape.current = { id: series.id, tf: series.tf, n, first: times.current[0] ?? 0 };
    dirty.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, props.compare, props.log, props.pct, props.look, studies.sma, studies.ema, studies.bb, studies.vwap, studies.vol, studies.cmp, studies.rsi, studies.macd, ready]);

  // a range preset moves the visible window over the candles; the candles themselves do not change
  useEffect(() => {
    const a = api.current;
    if (!a || !times.current.length) return;
    applyRange(a.chart, times.current, props.range, isIntraday(live.current.series.tf));
    dirty.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.rangeKey]);

  // the bottom-right "auto" switch follows the price scale: a drag on the axis turns it off
  useEffect(() => {
    const id = window.setInterval(() => {
      const a = api.current;
      if (!a) return;
      const sc = a.chart.priceScale("right", 0);
      setAuto(sc.options().autoScale);
      setAxisW(Math.round(sc.width()));
      // what the chart shows now, for a check from the page: the candle count and the visible window (logical indexes)
      const vr = a.chart.timeScale().getVisibleLogicalRange(), pr = sc.getVisibleRange();
      if (host.current) {
        host.current.dataset.candles = String(times.current.length);
        host.current.dataset.view = vr ? `${Math.round(vr.from)},${Math.round(vr.to)}` : "";
        host.current.dataset.prices = pr ? `${pr.from.toFixed(2)},${pr.to.toFixed(2)}` : "";
      }
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  // ---- overlay canvas ----
  useEffect(() => {
    const canvas = cvs.current, box = wrap.current;
    if (!canvas || !box) return;
    let raf = 0, sig = "";
    const stepOf = () => (isIntraday(live.current.series.tf) ? 60 : DAY_S);
    const toLogical = (t: number): number | null => {
      const arr = times.current;
      const n = arr.length;
      if (!n) return null;
      if (n === 1) return (t - arr[0]!) / stepOf();
      if (t <= arr[0]!) return (t - arr[0]!) / Math.max(1, arr[1]! - arr[0]!);
      if (t >= arr[n - 1]!) return n - 1 + (t - arr[n - 1]!) / Math.max(1, arr[n - 1]! - arr[n - 2]!);
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m]! <= t) lo = m; else hi = m; }
      return lo + (t - arr[lo]!) / (arr[hi]! - arr[lo]!);
    };
    const fromLogical = (l: number): number => {
      const arr = times.current;
      const n = arr.length;
      if (!n) return 0;
      if (n === 1) return arr[0]! + l * stepOf();
      if (l <= 0) return arr[0]! + l * (arr[1]! - arr[0]!);
      if (l >= n - 1) return arr[n - 1]! + (l - (n - 1)) * (arr[n - 1]! - arr[n - 2]!);
      const i = Math.floor(l);
      return arr[i]! + (l - i) * (arr[i + 1]! - arr[i]!);
    };
    const X = (gt: number): number | null => {
      const a = api.current;
      const l = toLogical(gt * DAY_S);
      if (!a || l === null) return null;
      // the library places whole logical indexes only (a fraction comes back as 0): place the two around it and go between
      const ts = a.chart.timeScale();
      const f = Math.floor(l);
      const x0 = ts.logicalToCoordinate(f as never);
      if (x0 === null || l === f) return x0;
      const x1 = ts.logicalToCoordinate((f + 1) as never);
      return x1 === null ? x0 : x0 + (l - f) * (x1 - x0);
    };
    const Y = (p: number): number | null => api.current?.candle.priceToCoordinate(p) ?? null;
    const gtAt = (x: number): number | null => {
      const l = api.current?.chart.timeScale().coordinateToLogical(x);
      return l === null || l === undefined ? null : fromLogical(l as number) / DAY_S;
    };
    const priceAt = (y: number): number | null => api.current?.candle.coordinateToPrice(y) ?? null;
    const plot = () => {
      const a = api.current;
      if (!a || !box) return { w: 0, h: 0 };
      const scaleW = a.chart.priceScale("right", 0).width();
      return { w: Math.max(0, box.clientWidth - scaleW), h: a.chart.paneSize(0).height };
    };

    const fmtP = (p: number) => priceText("pts", p);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const a = api.current;
      if (!a) return;
      const W = box.clientWidth, H = box.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const ref = live.current.series.bars.length ? shown(live.current.series.unit, live.current.series.bars[live.current.series.bars.length - 1]!.c) : 1;
      const r = a.chart.timeScale().getVisibleLogicalRange();
      const s = `${W}x${H}x${dpr}|${r ? r.from.toFixed(2) + "," + r.to.toFixed(2) : ""}|${Y(ref)}|${Y(ref * 1.1)}|${plot().h}`;
      if (s === sig && !dirty.current) return;
      sig = s; dirty.current = false;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      const g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const { w: pw, h: ph } = plot();
      g.save();
      g.beginPath(); g.rect(0, 0, pw, ph); g.clip();
      g.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tk = a.tk;
      const sel = ix.current.sel;
      const all = [...live.current.drawings];
      const draft = ix.current.draft, first = ix.current.first, tool = live.current.tool;
      if (first && draft && (tool === "trend" || tool === "ray" || tool === "rect" || tool === "fib")) all.push({ id: "_draft", kind: tool, a: first, b: draft });
      for (const d of all) paintDrawing(g, d, d.id === sel, pw, ph, tk, X, Y);
      g.restore();
      // order, stop, position and margin lines run into the price scale with a tag
      for (const l of live.current.lines) {
        const dragging = ix.current.drag?.kind === "line" && ix.current.drag.id === l.id;
        const price = dragging ? (ix.current.drag as { price: number }).price : l.price;
        const y = Y(price);
        if (y === null || y < 0 || y > ph) continue;
        const color = l.kind === "margin" ? tk.signal : l.kind === "pos" || l.kind === "short" ? (l.gain === undefined ? tk.acc : l.gain ? tk.up : tk.down) : l.kind === "stop" ? tk.warn : l.side === "sell" ? tk.down : tk.up;
        g.strokeStyle = color; g.lineWidth = l.kind === "pos" || l.kind === "short" ? 1.5 : 1;
        g.setLineDash(l.kind === "pos" || l.kind === "short" ? [] : l.kind === "margin" ? [2, 3] : [6, 4]);
        g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(pw, Math.round(y) + 0.5); g.stroke();
        g.setLineDash([]);
        const text = `${l.label}${dragging ? " " + fmtP(price) : ""}`;
        const tw = g.measureText(text).width + 12;
        g.fillStyle = color;
        g.fillRect(pw - tw - 6, y - 9, tw, 18);
        g.fillStyle = tk.bg;
        g.fillText(text, pw - tw, y + 4);
      }
      // your fills: a triangle at the price of each, pointing the way you traded
      const ms = live.current.marks ?? [];
      if (ms.length) {
        g.save();
        g.beginPath(); g.rect(0, 0, pw, ph); g.clip();
        const seen: { x: number; y: number }[] = [];
        for (const m of ms) {
          const x = X(m.t), y = Y(m.price);
          if (x === null || y === null || x < -10 || x > pw + 10 || y < -10 || y > ph + 10) continue;
          const buy = m.side === "buy";
          const col = buy ? tk.up : tk.down;
          g.fillStyle = col; g.strokeStyle = tk.bg; g.lineWidth = 1.5;
          g.beginPath();
          if (buy) { g.moveTo(x, y + 1); g.lineTo(x - 6, y + 12); g.lineTo(x + 6, y + 12); }
          else { g.moveTo(x, y - 1); g.lineTo(x - 6, y - 12); g.lineTo(x + 6, y - 12); }
          g.closePath(); g.stroke(); g.fill();
          seen.push({ x, y });
          if (ms.length <= 14) {
            g.fillStyle = tk.fg;
            g.fillText(`${buy ? "B" : "S"} ${m.qty.toLocaleString("en-US")}`, x + 8, buy ? y + 11 : y - 5);
          }
        }
        g.restore();
      }
      // the draft's first click, so the player sees it landed
      if (first && tool !== "cursor") {
        const x = X(first.t), y = Y(first.p);
        if (x !== null && y !== null) { g.fillStyle = tk.acc; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); }
      }
    };
    raf = requestAnimationFrame(draw);

    // ---- pointer ----
    const local = (e: MouseEvent) => { const r = box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const inPlot = (x: number, y: number) => { const p = plot(); return x >= 0 && y >= 0 && x <= p.w && y <= p.h; };
    const hitLine = (x: number, y: number): ChartLine | null => {
      for (const l of live.current.lines) {
        if (!l.drag) continue;
        const ly = Y(l.price);
        if (ly !== null && Math.abs(ly - y) <= 5) return l;
      }
      return null;
    };
    const ptXY = (p: Pt) => { const x = X(p.t), y = Y(p.p); return x === null || y === null ? null : { x, y }; };
    const hitDrawing = (x: number, y: number): { d: Drawing; part: "a" | "b" | "body" } | null => {
      const list = live.current.drawings;
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i]!;
        const A = ptXY(d.a), B = d.b ? ptXY(d.b) : null;
        if (!A) continue;
        if (Math.hypot(A.x - x, A.y - y) <= 8) return { d, part: "a" };
        if (B && Math.hypot(B.x - x, B.y - y) <= 8) return { d, part: "b" };
        const pw = plot().w;
        if (d.kind === "hline" && Math.abs(A.y - y) <= 5) return { d, part: "body" };
        if (d.kind === "note" && x >= A.x && x <= A.x + 120 && y >= A.y - 16 && y <= A.y + 4) return { d, part: "body" };
        if (!B) continue;
        if (d.kind === "trend" && segDist(x, y, A.x, A.y, B.x, B.y) <= 5) return { d, part: "body" };
        if (d.kind === "ray") {
          const dx = B.x - A.x, dy = B.y - A.y;
          const k = dx === 0 ? 1 : Math.max(1, (pw + 50 - A.x) / Math.abs(dx));
          if (segDist(x, y, A.x, A.y, A.x + dx * k, A.y + dy * k) <= 5) return { d, part: "body" };
        }
        if (d.kind === "rect") {
          const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
          const near = (Math.abs(x - x0) <= 5 || Math.abs(x - x1) <= 5) && y >= y0 - 5 && y <= y1 + 5 || (Math.abs(y - y0) <= 5 || Math.abs(y - y1) <= 5) && x >= x0 - 5 && x <= x1 + 5;
          if (near) return { d, part: "body" };
        }
        if (d.kind === "fib") {
          const x0 = Math.min(A.x, B.x);
          for (const f of FIB) {
            const fy = Y(d.b!.p + (d.a.p - d.b!.p) * f);
            if (fy !== null && Math.abs(fy - y) <= 4 && x >= x0 - 5) return { d, part: "body" };
          }
        }
      }
      return null;
    };

    const down = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const { x, y } = local(e);
      if (!inPlot(x, y)) return;
      const cur = live.current;
      const gt = gtAt(x), pr = priceAt(y);
      const stop = () => { e.stopPropagation(); e.preventDefault(); box.focus({ preventScroll: true }); };
      if (cur.tool === "cursor") {
        const lh = hitLine(x, y);
        if (lh) { stop(); ix.current.drag = { kind: "line", id: lh.id, price: lh.price }; return; }
        const hd = hitDrawing(x, y);
        if (hd) {
          stop();
          ix.current.sel = hd.d.id;
          ix.current.drag = hd.part === "body" && gt !== null && pr !== null
            ? { kind: "body", id: hd.d.id, from: { t: gt, p: pr }, orig: hd.d }
            : { kind: "pt", id: hd.d.id, which: hd.part === "b" ? "b" : "a" };
          dirty.current = true;
          return;
        }
        if (ix.current.sel) { ix.current.sel = ""; dirty.current = true; }
        return;
      }
      if (gt === null || pr === null) return;
      stop();
      const pt: Pt = { t: gt, p: pr };
      if (cur.tool === "hline") { commit({ id: newId(), kind: "hline", a: pt }); return; }
      if (cur.tool === "note") {
        const id = newId();
        commit({ id, kind: "note", a: pt, text: "" });
        setEditing({ id, x, y });
        return;
      }
      if (!ix.current.first) { ix.current.first = pt; ix.current.draft = pt; dirty.current = true; return; }
      commit({ id: newId(), kind: cur.tool, a: ix.current.first, b: pt });
    };
    const commit = (d: Drawing) => {
      ix.current.first = null; ix.current.draft = null; ix.current.sel = d.id;
      live.current.onDrawings([...live.current.drawings, d]);
      live.current.onTool("cursor");
      dirty.current = true;
    };
    const move = (e: MouseEvent) => {
      const { x, y } = local(e);
      const cur = live.current;
      const d = ix.current.drag;
      const gt = gtAt(x), pr = priceAt(y);
      if (d && gt !== null && pr !== null) {
        if (d.kind === "line") d.price = pr;
        else if (d.kind === "pt") cur.onDrawings(cur.drawings.map((q) => (q.id === d.id ? (d.which === "a" ? { ...q, a: { t: gt, p: pr } } : { ...q, b: { t: gt, p: pr } }) : q)));
        else {
          const dt = gt - d.from.t, dp = pr - d.from.p;
          cur.onDrawings(cur.drawings.map((q) => (q.id === d.id ? { ...q, a: { t: d.orig.a.t + dt, p: d.orig.a.p + dp }, b: d.orig.b ? { t: d.orig.b.t + dt, p: d.orig.b.p + dp } : undefined } : q)));
        }
        dirty.current = true;
        return;
      }
      if (ix.current.first && gt !== null && pr !== null) { ix.current.draft = { t: gt, p: pr }; dirty.current = true; }
      if (inPlot(x, y)) {
        const over = cur.tool === "cursor" ? (hitLine(x, y) ?? hitDrawing(x, y)) : null;
        box.style.cursor = cur.tool !== "cursor" ? "crosshair" : over ? "pointer" : "";
      }
    };
    const up = () => {
      const d = ix.current.drag;
      if (!d) return;
      ix.current.drag = null;
      if (d.kind === "line") live.current.onMoveLine(d.id, d.price);
      dirty.current = true;
    };
    const dbl = (e: MouseEvent) => {
      const { x, y } = local(e);
      const a = api.current;
      if (a && x < plot().w && y > box.clientHeight - 30 && times.current.length) {
        // the time axis: back to the window the range button opened, on the auto price scale
        applyRange(a.chart, times.current, live.current.range, isIntraday(live.current.series.tf));
        a.chart.priceScale("right", 0).applyOptions({ autoScale: true });
        dirty.current = true;
        return;
      }
      if (live.current.tool !== "cursor" || !inPlot(x, y) || hitLine(x, y) || hitDrawing(x, y)) return;
      const p = priceAt(y);
      if (p !== null) live.current.onPickPrice(p);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { ix.current.first = null; ix.current.draft = null; ix.current.sel = ""; live.current.onTool("cursor"); dirty.current = true; }
      if ((e.key === "Delete" || e.key === "Backspace") && ix.current.sel) {
        const id = ix.current.sel; ix.current.sel = "";
        live.current.onDrawings(live.current.drawings.filter((d) => d.id !== id));
        e.preventDefault();
      }
    };
    // a wheel step over the price axis zooms the price scale, as TradingView's does (the library would zoom time)
    const wheel = (e: WheelEvent) => {
      const a = api.current;
      if (!a) return;
      const rect = box.getBoundingClientRect();
      const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
      if (lx < plot().w) {
        // over the plot or the time axis: the wheel zooms the time scale about the pointer (a notch is about a sixth), and
        // a sideways wheel or shift-wheel pans. The library's own wheel is off so the two never fight.
        e.preventDefault(); e.stopPropagation();
        const ts = a.chart.timeScale();
        const vr = ts.getVisibleLogicalRange();
        if (!vr) return;
        const span = vr.to - vr.from;
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          const d = (e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX) / Math.max(1, plot().w) * span;
          ts.setVisibleLogicalRange({ from: vr.from + d, to: vr.to + d } as LogicalRange);
          return;
        }
        if (e.deltaY === 0) return;
        const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
        const f = Math.exp(Math.max(-400, Math.min(400, e.deltaY * unit)) * 0.0016);
        const at = ts.coordinateToLogical(Math.max(0, Math.min(plot().w, lx)));
        const c = at === null ? (vr.from + vr.to) / 2 : (at as number);
        const total = times.current.length + RIGHT_OFFSET;
        const width = Math.min(Math.max(span * f, 8), Math.max(total * 1.2, 40));
        const k = (c - vr.from) / span;
        const from = c - width * k;
        ts.setVisibleLogicalRange({ from, to: from + width } as LogicalRange);
        void ly;
        return;
      }
      e.preventDefault(); e.stopPropagation();
      const sc = a.chart.priceScale("right", 0);
      const vr = sc.getVisibleRange();
      if (!vr || sc.options().mode === PriceScaleMode.Percentage || e.deltaY === 0) return;
      const mid = (vr.from + vr.to) / 2, half = (vr.to - vr.from) / 2 * (e.deltaY > 0 ? 1.1 : 1 / 1.1);
      sc.setVisibleRange({ from: mid - half, to: mid + half });
    };
    box.addEventListener("wheel", wheel, { capture: true, passive: false });
    box.addEventListener("mousedown", down, true);
    box.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    const winMove = (e: MouseEvent) => { if (ix.current.drag) move(e); };
    window.addEventListener("mousemove", winMove);
    box.addEventListener("dblclick", dbl);
    box.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener("wheel", wheel, { capture: true });
      box.removeEventListener("mousedown", down, true);
      box.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("mousemove", winMove);
      box.removeEventListener("dblclick", dbl);
      box.removeEventListener("keydown", key);
    };
  }, []);

  useEffect(() => { dirty.current = true; }, [props.drawings, props.lines, props.marks, props.tool]);
  useEffect(() => { ix.current.first = null; ix.current.draft = null; if (props.tool !== "cursor") ix.current.sel = ""; }, [props.tool]);
  useEffect(() => { ix.current.sel = ""; setEditing(null); }, [series.id]);

  const note = editing ? props.drawings.find((d) => d.id === editing.id) : undefined;
  const bar = legend?.bar ?? series.bars[series.bars.length - 1] ?? null;
  const u = series.unit;
  const up = bar ? bar.c >= bar.o : true;
  const t = legend ? legend.ts : bar ? bar.ts : 0;
  const before = legend ? legend.prev : series.bars.length > 1 ? series.bars[series.bars.length - 2]!.c : null;
  const move = bar && before && before > 0 ? bar.c / before - 1 : null;

  return (
    <div className="tm-chart" ref={wrap} tabIndex={0} aria-label={`${series.name} chart`} data-testid="tm-chart">
      <p className="tm-legend" data-testid="tm-legend">
        <span className="tm-legend-t">{stampLabel(t, isIntraday(series.tf))}</span>
        {bar ? (
          <>
            <span>O <b>{priceText(u, bar.o)}</b></span>
            <span>H <b>{priceText(u, bar.h)}</b></span>
            <span>L <b>{priceText(u, bar.l)}</b></span>
            <span className={up ? "gain" : "loss"}>C <b>{priceText(u, bar.c)}</b></span>
            {move !== null ? <span className={move >= 0 ? "gain" : "loss"} data-testid="tm-legend-chg">{move >= 0 ? "+" : ""}{(move * 100).toFixed(2)}%</span> : null}
            {bar.v > 0 ? <span>Vol <b>{volText(bar.v)}</b></span> : null}
          </>
        ) : null}
      </p>
      {chips.length ? (
        <ul className="tm-chips" data-testid="tm-chips" aria-label="Indicators">
          {chips.map((c) => (
            <li key={c.k}><span>{c.label}</span><b>{c.value}</b>
              <button type="button" aria-label={`Remove ${c.label}`} onClick={() => props.onStudy(c.k)} data-testid={`tm-chip-${c.k}`}>×</button></li>
          ))}
        </ul>
      ) : null}
      <div className="tm-scales" style={{ right: axisW + 4 }} data-testid="tm-scales">
        <button type="button" aria-pressed={auto} title="Fit the price scale to the candles" data-testid="tm-auto"
          onClick={() => { api.current?.chart.priceScale("right", 0).applyOptions({ autoScale: true }); setAuto(true); }}>auto</button>
        <button type="button" aria-pressed={props.log && !props.pct} title="Logarithmic price scale" data-testid="tm-logsw" onClick={() => props.onScale("log")}>log</button>
        <button type="button" aria-pressed={props.pct} title="Percent change from the first visible candle" data-testid="tm-pct" onClick={() => props.onScale("pct")}>%</button>
      </div>
      <div className="tm-plot" ref={host} />
      <canvas className="tm-over" ref={cvs} />
      {editing && note ? (
        <input
          className="tm-note-input" autoFocus placeholder="Note, then Enter" style={{ left: editing.x, top: editing.y - 12 }} maxLength={80}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { const v = e.currentTarget.value.trim(); props.onDrawings(v ? props.drawings.map((d) => (d.id === editing.id ? { ...d, text: v } : d)) : props.drawings.filter((d) => d.id !== editing.id)); setEditing(null); }
            if (e.key === "Escape") { props.onDrawings(props.drawings.filter((d) => d.id !== editing.id)); setEditing(null); }
          }}
          onBlur={(e) => { const v = e.currentTarget.value.trim(); props.onDrawings(v ? props.drawings.map((d) => (d.id === editing.id ? { ...d, text: v } : d)) : props.drawings.filter((d) => d.id !== editing.id)); setEditing(null); }}
        />
      ) : null}
    </div>
  );
}

function dedupeBars(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const last = out[out.length - 1];
    if (last && last.ts === b.ts) out[out.length - 1] = b; else out.push(b);
  }
  return out;
}

/** The window a range preset shows: from the first candle within its game days of the newest one (all of them for ALL), and
 *  never fewer than MIN_VIEW_CANDLES when the data has that many. */
function applyRange(chart: IChartApi, times: number[], range: RangeId, intraday = false): void {
  const n = times.length;
  if (!n) return;
  const days = RANGES.find((r) => r.id === range)?.days ?? 0;
  let start = 0;
  if (days > 0) {
    const from = times[n - 1]! - days * DAY_S;
    start = times.findIndex((t) => t >= from);
    if (start < 0) start = n - 1;
  }
  start = Math.min(start, Math.max(0, n - MIN_VIEW_CANDLES));
  // An intraday window that would squeeze its candles under a few pixels each (a month of 15-minute candles in one screen)
  // shows the newest ones at a width where each has a body and a colour. The scroll wheel and the range buttons reach the rest.
  if (intraday) {
    const width = chart.timeScale().width();
    const room = Math.max(MIN_VIEW_CANDLES, Math.floor((width > 0 ? width : 900) / MIN_CANDLE_PX));
    start = Math.max(start, n - room);
  }
  chart.timeScale().setVisibleLogicalRange({ from: start - 0.5, to: n - 1 + RIGHT_OFFSET } as LogicalRange);
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function paintDrawing(
  g: CanvasRenderingContext2D, d: Drawing, selected: boolean, pw: number, ph: number, tk: Tokens,
  X: (gt: number) => number | null, Y: (p: number) => number | null,
): void {
  const ax = X(d.a.t), ay = Y(d.a.p);
  if (ax === null || ay === null) return;
  const bx = d.b ? X(d.b.t) : null, by = d.b ? Y(d.b.p) : null;
  const col = d.id === "_draft" ? tk.muted : tk.acc;
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = selected ? 2 : 1.25; g.setLineDash([]);
  const handle = (x: number, y: number) => { g.fillStyle = tk.bg; g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.stroke(); };
  const tag = (text: string, x: number, y: number) => { g.fillStyle = col; g.fillText(text, x, y); };
  if (d.kind === "hline") {
    g.beginPath(); g.moveTo(0, ay); g.lineTo(pw, ay); g.stroke();
    tag(priceText("pts", d.a.p), 6, ay - 4);
    if (selected) handle(ax, ay);
    return;
  }
  if (d.kind === "note") {
    const text = d.text || "…";
    const w = g.measureText(text).width + 10;
    g.fillStyle = tk.bg; g.strokeStyle = col; g.lineWidth = 1;
    g.fillRect(ax, ay - 16, w, 18); g.strokeRect(ax + 0.5, ay - 15.5, w, 17);
    g.fillStyle = tk.fg; g.fillText(text, ax + 5, ay - 3);
    g.fillStyle = col; g.beginPath(); g.arc(ax, ay, 3, 0, Math.PI * 2); g.fill();
    return;
  }
  if (bx === null || by === null || !d.b) return;
  if (d.kind === "trend") { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
  if (d.kind === "ray") {
    const dx = bx - ax, dy = by - ay;
    const k = dx === 0 ? 1 : Math.max(1, (pw + 50 - ax) / Math.abs(dx));
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + dx * k, ay + dy * k); g.stroke();
  }
  if (d.kind === "rect") {
    g.fillStyle = alpha(col, 0.12);
    g.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    g.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
  }
  if (d.kind === "fib") {
    const x0 = Math.min(ax, bx);
    g.setLineDash([3, 3]); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
    for (const f of FIB) {
      const p = d.b.p + (d.a.p - d.b.p) * f;
      const y = Y(p);
      if (y === null) continue;
      g.strokeStyle = alpha(col, f === 0 || f === 1 ? 0.9 : 0.55); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(pw, y); g.stroke();
      g.fillStyle = col;
      g.fillText(`${f} (${priceText("pts", p)})`, Math.max(x0, 0) + 6, y - 3);
    }
  }
  if (selected || d.id === "_draft") { handle(ax, ay); handle(bx, by); }
  void ph;
}
