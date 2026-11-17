"use client";
// One chart for a price, a net worth, or a macro series. Hover (and the caption) names the value and the date.
import { useState, type PointerEvent } from "react";
import { gameDate } from "./format";
import "./seriesChart.css";

export interface SeriesPoint {
  v: number;
  day?: number;
  /** Shown instead of the date (a bond tenor, for instance). */
  label?: string;
}

export function SeriesChart({
  points,
  up,
  label,
  format,
  height = 160,
  neutral = false,
}: {
  points: SeriesPoint[];
  /** True paints a rise, false a fall. Omitted, the line decides from the first point to the last. */
  up?: boolean;
  label: string;
  format?: (v: number) => string;
  height?: number;
  /** A curve that is not a rise or a fall (the yield curve) stays in the muted ink. */
  neutral?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="quay-empty">No history yet.</p>;

  const w = 640;
  const h = height;
  const padX = 8;
  const padY = 12;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const flat = max === min;
  const xOf = (i: number) => (points.length === 1 ? w / 2 : padX + (i / (points.length - 1)) * (w - padX * 2));
  const yOf = (v: number) => (flat ? h / 2 : padY + (1 - (v - min) / span) * (h - padY * 2));
  const d = points.map((p, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!.v;
  const first = points[0]!.v;
  const rose = points.length > 1 && last > first;
  const fell = points.length > 1 && last < first;
  const dir = neutral ? "flat" : up === true || (up === undefined && rose) ? "up" : up === false || fell ? "down" : "flat";
  const i = hover == null || hover >= points.length ? points.length - 1 : hover;
  const pt = points[i]!;
  const when = pt.label ?? (pt.day !== undefined ? gameDate(pt.day) : "Latest");
  const shown = format ? format(pt.v) : pt.v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const caption = `${when} · ${shown}`;

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || points.length < 2) return;
    const x = ((e.clientX - rect.left) / rect.width) * w;
    let best = 0;
    let dist = Infinity;
    for (let k = 0; k < points.length; k++) {
      const gap = Math.abs(xOf(k) - x);
      if (gap < dist) { dist = gap; best = k; }
    }
    setHover(best);
  };

  return (
    <figure className="series" data-dir={dir}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}. ${caption}`}
        className="series-svg"
        style={{ height }}
        onPointerMove={move}
        onPointerLeave={() => setHover(null)}
      >
        <line className="series-grid" x1={padX} x2={w - padX} y1={yOf(max)} y2={yOf(max)} />
        <line className="series-grid" x1={padX} x2={w - padX} y1={yOf((max + min) / 2)} y2={yOf((max + min) / 2)} />
        <line className="series-grid" x1={padX} x2={w - padX} y1={yOf(min)} y2={yOf(min)} />
        {points.length > 1 ? <path d={d} fill="none" className="series-line" /> : null}
        {hover != null ? <line className="series-cross" x1={xOf(i)} x2={xOf(i)} y1={padY} y2={h - padY} /> : null}
        <circle className="series-dot" cx={xOf(i)} cy={yOf(pt.v)} r={points.length === 1 ? 4 : 3.5} />
      </svg>
      <figcaption className="series-read num">{caption}</figcaption>
    </figure>
  );
}
