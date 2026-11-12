"use client";
// Broker chart trend lines over the plot (part of the lazy plot chunk). A port of the p10 drawing layer, trend line only:
// an SVG the size of the plot pane, in game time and price. The chart tells it when it has redrawn (a series primitive's
// updateAllViews: pan, zoom, resize, new bars, a price-scale change) and the layer re-maps its points through the chart's
// own scales in the same frame, so a line stays on its candles.
//  - Placing (the Trend line button): press, move and release, or tap twice; the plot does not pan meanwhile (the layer
//    takes the pointer). Esc or Cancel drops the first point. Otherwise the layer lets the pointer through to the chart
//    (normal pan and zoom) except on a line (select) and a selected line's end handles (drag to adjust).
//  - Keyboard: a line is a focusable button (focus selects it, Delete removes it, through PriceChart); a selected line's
//    ends are focusable too and the arrow keys move them by one bar or a few pixels of price.
//  - Time maps through the bars' logical index (a tick between two bars lies between their indexes; past either end it
//    extends at the average bar spacing), so a line keeps its tick on every range.
import { useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import type { BrStrings } from "@/apps/broker/strings-en";
import { pfNumberLocale } from "@/apps/portfolio/strings";
import { barTime } from "./ChartTable";
import { newLineId, type TrendDraw, type TrendPoint, type Trendline } from "./trendlines";

/** How the plot maps time and price to pane pixels, now. */
export interface Geo {
  /** Changes whenever any mapping below changes (the layer re-renders only then). */
  readonly key: string;
  readonly width: number;
  readonly height: number;
  tickToX(t: number): number | null;
  xToTick(x: number): number | null;
  priceToY(p: number): number | null;
  yToPrice(y: number): number | null;
  /** The tick one bar before (-1) or after (1) `t`. */
  stepTick(t: number, dir: -1 | 1): number;
}

/** Tick <-> logical index over the bars' ticks (oldest first, at least one). Exported for the unit tests. */
export function tickScale(ticks: readonly number[]) {
  const n = ticks.length;
  const first = ticks[0]!, last = ticks[n - 1]!;
  const step = n > 1 ? (last - first) / (n - 1) || 1 : 1;
  return {
    toLogical(t: number): number {
      if (t <= first) return (t - first) / step;
      if (t >= last) return n - 1 + (t - last) / step;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ticks[mid]! <= t) lo = mid; else hi = mid; }
      const a = ticks[lo]!, b = ticks[hi]!;
      return lo + (b > a ? (t - a) / (b - a) : 0);
    },
    toTick(l: number): number {
      if (l <= 0) return first + l * step;
      if (l >= n - 1) return last + (l - (n - 1)) * step;
      const i = Math.floor(l);
      const a = ticks[i]!, b = ticks[i + 1]!;
      return a + (l - i) * (b - a);
    },
  };
}

/** The plot's mapping from the chart's own scales (null before it has bars). */
export function chartGeo(chart: IChartApi, series: ISeriesApi<"Candlestick">, ticks: readonly number[]): Geo | null {
  if (ticks.length === 0) return null;
  const ts = chart.timeScale();
  const width = ts.width(), height = chart.paneSize().height;
  const vis = ts.getVisibleLogicalRange();
  const top = series.coordinateToPrice(0), bottom = series.coordinateToPrice(height);
  if (!vis || top === null || bottom === null || width <= 0 || height <= 0) return null;
  const sc = tickScale(ticks);
  const toTick = (l: number) => Math.max(0, Math.round(sc.toTick(l)));
  return {
    key: `${width}|${height}|${vis.from}|${vis.to}|${top}|${bottom}|${ticks.length}|${ticks[0]}|${ticks[ticks.length - 1]}`,
    width, height,
    tickToX: (t) => ts.logicalToCoordinate(sc.toLogical(t) as Logical),
    xToTick: (x) => { const l = ts.coordinateToLogical(x); return l === null ? null : toTick(l); },
    priceToY: (p) => series.priceToCoordinate(p),
    yToPrice: (y) => { const p = series.coordinateToPrice(y); return p !== null && p > 0 ? p : null; },
    stepTick: (t, dir) => toTick(Math.round(sc.toLogical(t)) + dir),
  };
}

interface Props {
  readonly draw: TrendDraw;
  readonly geoOf: () => Geo | null;
  /** The chart's redraw listeners (CandleChart's series primitive calls each one). */
  readonly redraw: Set<() => void>;
  readonly t: BrStrings;
  readonly locale: string;
  readonly precision: number;
}

interface Draft { readonly session: number; readonly a: TrendPoint; readonly cur: TrendPoint; readonly sx: number; readonly sy: number; readonly pressed: boolean }
interface Drag { readonly id: string; readonly end: "a" | "b"; readonly pt: TrendPoint; readonly sx: number; readonly sy: number }
/** A release this far from its press places the second point (press-drag-release); closer, it waits for a second tap. */
const DRAG_PX = 8;
/** An arrow key moves an end this many pixels of price. */
const NUDGE_PX = 4;

export function TrendLayer({ draw, geoOf, redraw, t, locale, precision }: Props) {
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => {
    let key: string | null = null;
    const onRedraw = () => {
      const g = geoOf();
      const k = g?.key ?? "";
      if (k === key) return;
      key = k;
      flushSync(() => setGeo(g)); // the same frame as the canvas
    };
    redraw.add(onRedraw);
    // Mounted after the chart's last paint (the lines' read settling late, a Retry): map now, not at the next tick.
    const first = requestAnimationFrame(onRedraw);
    return () => { cancelAnimationFrame(first); redraw.delete(onRedraw); };
  }, [geoOf, redraw]);

  // A release reads its own position (never a move state that may not have rendered yet).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const { lines, placing, selected } = draw;
  // A first point belongs to its placing session: Cancel, Esc or an asset change never leaves it behind.
  const liveDraft = (d: Draft | null) => (d !== null && placing !== null && d.session === placing ? d : null);

  /** The event's position in the layer (pane) pixels. */
  const local = (e: PointerEvent<SVGElement>) => {
    const el = e.currentTarget;
    const r = (el instanceof SVGSVGElement && !el.ownerSVGElement ? el : el.ownerSVGElement ?? el).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toPoint = (x: number, y: number): TrendPoint | null => {
    if (!geo || x < 0 || y < 0 || x > geo.width || y > geo.height) return null;
    const tk = geo.xToTick(x), p = geo.yToPrice(y);
    return tk === null || p === null ? null : { t: tk, p };
  };
  const finish = (a: TrendPoint, b: TrendPoint) => {
    if (a.t === b.t && a.p === b.p) return;
    const id = newLineId(lines);
    setDraft(null);
    draw.onChange([...lines, { id, a, b }]);
    draw.onSelect(id);
    draw.onPlaced();
  };

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (placing === null || e.button !== 0) return;
    const { x, y } = local(e);
    const pt = toPoint(x, y);
    if (!pt) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const d = liveDraft(draft);
    if (d) finish(d.a, pt);
    else setDraft({ session: placing, a: pt, cur: pt, sx: x, sy: y, pressed: true });
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const { x, y } = local(e);
    if (drag) { const pt = toPoint(x, y); if (pt) setDrag({ ...drag, pt }); return; }
    const d = liveDraft(draft);
    if (d) { const pt = toPoint(x, y); if (pt) setDraft({ ...d, cur: pt }); }
  };
  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    const { x, y } = local(e);
    const pt = toPoint(x, y);
    if (drag) {
      setDrag(null);
      if (pt && Math.hypot(x - drag.sx, y - drag.sy) > 0) draw.onChange(lines.map((l) => (l.id === drag.id ? { ...l, [drag.end]: pt } : l)));
      return;
    }
    const d = liveDraft(draft);
    if (!d?.pressed) return;
    if (pt && Math.hypot(x - d.sx, y - d.sy) > DRAG_PX) finish(d.a, pt);
    else setDraft({ ...d, pressed: false });
  };
  const onCancel = () => { setDrag(null); setDraft(null); };

  const grab = (e: PointerEvent<SVGElement>, l: Trendline, end: "a" | "b") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { x, y } = local(e);
    setDrag({ id: l.id, end, pt: l[end], sx: x, sy: y });
  };
  const nudge = (e: KeyboardEvent<SVGElement>, l: Trendline, end: "a" | "b") => {
    if (!geo) return;
    const pt = l[end];
    let next: TrendPoint | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") next = { t: geo.stepTick(pt.t, e.key === "ArrowLeft" ? -1 : 1), p: pt.p };
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const y = geo.priceToY(pt.p);
      const p = y === null ? null : geo.yToPrice(y + (e.key === "ArrowUp" ? -NUDGE_PX : NUDGE_PX));
      if (p !== null) next = { t: pt.t, p };
    } else return;
    e.preventDefault();
    e.stopPropagation();
    if (next) draw.onChange(lines.map((x) => (x.id === l.id ? { ...x, [end]: next } : x)));
  };

  if (!geo) return null;
  const fmt = new Intl.NumberFormat(pfNumberLocale(locale), { minimumFractionDigits: precision, maximumFractionDigits: precision });
  const at = (pt: TrendPoint) => [barTime(pt.t, locale, t), fmt.format(pt.p)] as const;
  const px = (pt: TrendPoint) => {
    const x = geo.tickToX(pt.t), y = geo.priceToY(pt.p);
    return x === null || y === null ? null : { x, y };
  };
  const shownDraft = liveDraft(draft);
  const draftA = shownDraft ? px(shownDraft.a) : null, draftB = shownDraft ? px(shownDraft.cur) : null;

  return (
    <svg className={placing !== null ? "cc-draw placing" : "cc-draw"} data-testid="br-trend-layer"
      data-placing={placing !== null ? "" : undefined} data-first={shownDraft ? "" : undefined}
      width={geo.width} height={geo.height} tabIndex={-1} aria-label={t.trendLayer}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}>
      {lines.map((l, i) => {
        const shown = drag?.id === l.id ? { ...l, [drag.end]: drag.pt } : l;
        const a = px(shown.a), b = px(shown.b);
        if (!a || !b) return null;
        const on = selected === l.id && placing === null;
        const [ta, pa] = at(shown.a), [tb, pb] = at(shown.b);
        return (
          <g key={l.id} className="cc-trend" data-testid={`br-trend-${l.id}`} data-id={l.id} role="button" tabIndex={0}
            data-a-t={shown.a.t} data-a-p={shown.a.p} data-b-t={shown.b.t} data-b-p={shown.b.p}
            aria-pressed={on} aria-label={t.trendAria(i + 1, ta, pa, tb, pb)}
            onPointerDown={(e) => { if (placing !== null || e.button !== 0) return; e.stopPropagation(); draw.onSelect(l.id); }}
            onFocus={() => { if (placing === null) draw.onSelect(l.id); }}>
            <line className="cc-trend-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <line className="cc-trend-line" data-testid="br-trend-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {on && (["a", "b"] as const).map((end) => {
              const p = end === "a" ? a : b;
              const [tt, pp] = end === "a" ? [ta, pa] : [tb, pb];
              return (
                <g key={end}>
                  <circle className="cc-trend-grab" cx={p.x} cy={p.y} r={16} onPointerDown={(e) => grab(e, l, end)} />
                  <circle className="cc-trend-handle" data-testid={`br-trend-handle-${end}`} cx={p.x} cy={p.y} r={5} role="button" tabIndex={0}
                    aria-label={t.trendEnd(end === "a", tt, pp)} onPointerDown={(e) => grab(e, l, end)} onKeyDown={(e) => nudge(e, l, end)} />
                </g>
              );
            })}
          </g>
        );
      })}
      {draftA && draftB && <line className="cc-trend-line cc-trend-draft" data-testid="br-trend-draft" x1={draftA.x} y1={draftA.y} x2={draftB.x} y2={draftB.y} />}
    </svg>
  );
}
