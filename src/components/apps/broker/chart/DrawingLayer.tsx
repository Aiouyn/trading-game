'use client';

/**
 * The drawings on the Broker chart (R-10-5): an SVG laid over the plot, in time and price coordinates. A drawing tool places its
 * shape with clicks (or a drag for the brush); with the cursor, a shape is selected by a press on it, moved by a drag, and its
 * handles reshape it. The layer maps time and price through the chart's own scale (the geometry the chart hands it), so a
 * drawing stays on its candle when the view moves, and the magnet snaps a point to the candle's OHLC.
 */
import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { placeSelectedPosition } from './useDrawingKeys';
import type { Bar } from '@/game/history';
import type { ChartDrawing, DrawingColor, DrawingPoint } from '@/world/drawings';
import { t } from '@/i18n';
import { price as fmtPrice, signedPct } from '@/game/format';
import { barAt, changePct, extendLine, fibPrices, handlesOf, magnetPrice, movePoint, pointsToPlace, positionExtentIndices, positionLevels, positionPoints, positionSpanTicks, shiftDrawing } from './geometry';
import { newDrawingId, useDrawings, type Tool } from './drawingStore';

/** How the chart maps time and price to pixels (PriceChart builds it from the chart's own scales on each render). */
export interface ChartGeo {
  /** the plot's size in pixels (the price axis and the time axis are outside it) */
  width: number;
  height: number;
  tickToX(t: number): number;
  xToTick(x: number): number;
  priceToY(p: number): number | null;
  yToPrice(y: number): number | null;
}

/** The text colour that each drawing colour's strokes and fills take (design tokens, never a raw hex). */
const TONE: Record<DrawingColor, string> = {
  brass: 'text-brass', info: 'text-info', gain: 'text-gain', loss: 'text-loss', warn: 'text-warn', steel: 'text-steel', line: 'text-fg',
};

interface Px { x: number; y: number }

/** A drag in progress: a whole drawing moves, or one of its points does. `start` is the list before the drag (its undo step). */
interface Drag {
  id: string;
  mode: 'move' | 'handle';
  index: number;
  axis: 'both' | 'price' | 'tick';
  x0: number;
  y0: number;
  orig: DrawingPoint[];
  start: ChartDrawing[];
  /** the points the drag is showing now */
  points: DrawingPoint[];
  moved: boolean;
}

/** A placement in progress: the points clicked so far, the pointer's point, and the brush's stroke. */
interface Draft {
  kind: Tool;
  points: DrawingPoint[];
  cursor: DrawingPoint | null;
  stroke: boolean;
}

const STROKE = (w: number | undefined) => (w ?? 2);
const DASH = (s: string | undefined) => (s === 'dashed' ? '6 4' : s === 'dotted' ? '1.5 3' : undefined);

export function DrawingLayer({ assetId, geo, bars, onWheel }: {
  assetId: string; geo: ChartGeo | null; bars: Bar[];
  /** a wheel step while a drawing tool is in hand is passed to the chart, so the time scale still zooms */
  onWheel?: (e: WheelEvent) => void;
}) {
  const root = useRef<SVGSVGElement>(null);
  const tool = useDrawings((s) => s.tool);
  const magnet = useDrawings((s) => s.magnet);
  const locked = useDrawings((s) => s.locked);
  const hidden = useDrawings((s) => s.hidden);
  const selected = useDrawings((s) => s.selected);
  const list = useDrawings((s) => s.byAsset[assetId]) ?? EMPTY;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // the live drag and draft, read by the pointer handlers (a release right after a move reads that move)
  const liveDrag = useRef<Drag | null>(null);
  const liveDraft = useRef<Draft | null>(null);
  const drawing = tool !== 'cursor' && tool !== 'cross';

  const local = (e: { clientX: number; clientY: number }): Px => {
    const r = root.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };
  /** a pixel point as a chart point: the tick and the price (the magnet snaps the price to the candle's OHLC) */
  const toPoint = (x: number, y: number): DrawingPoint | null => {
    if (!geo) return null;
    const tick = Math.max(0, Math.round(geo.xToTick(x)));
    const raw = geo.yToPrice(y);
    if (raw === null || !(raw > 0)) return null;
    const p = magnet ? magnetPrice(barAt(bars, tick), raw) : raw;
    return { t: tick, p };
  };

  const finish = (kind: Tool, points: DrawingPoint[]) => {
    const cur = useDrawings.getState().byAsset[assetId] ?? [];
    const id = newDrawingId(cur);
    const isPos = kind === 'long' || kind === 'short';
    const pts = isPos ? positionPoints(kind, points[0]!.t, points[0]!.p, positionSpanTicks(bars)) : points;
    const d: ChartDrawing = { id, kind: kind as ChartDrawing['kind'], points: pts, color: 'brass', width: 2, style: 'solid' };
    liveDraft.current = null;
    setDraft(null);
    useDrawings.getState().commit(assetId, [...cur, d]);
    useDrawings.setState({ selected: id, tool: 'cursor' });
  };

  const onRootDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button === 2 && liveDraft.current) { liveDraft.current = null; setDraft(null); return; }
    if (e.button !== 0) return;
    // a shape in progress belongs to the tool that began it: a tool change (Esc, or another tool) ends it
    if (liveDraft.current && liveDraft.current.kind !== tool) { liveDraft.current = null; setDraft(null); }
    if (drawing && !liveDrag.current) {
      const pt = toPoint(local(e).x, local(e).y);
      if (!pt) return;
      const kind = tool as ChartDrawing['kind'];
      const n = pointsToPlace(kind);
      if (n === 'stroke') {
        const d: Draft = { kind, points: [pt], cursor: pt, stroke: true };
        liveDraft.current = d;
        setDraft(d);
        root.current?.setPointerCapture(e.pointerId);
        return;
      }
      const cur = liveDraft.current;
      const points = cur ? [...cur.points, pt] : [pt];
      if (points.length >= n) { finish(kind, points); return; }
      const d: Draft = { kind, points, cursor: pt, stroke: false };
      liveDraft.current = d;
      setDraft(d);
    }
  };

  const onRootMove = (e: RPointerEvent<SVGSVGElement>) => {
    const { x, y } = local(e);
    const dr = liveDrag.current;
    if (dr) {
      const dragged = applyDrag(dr, x, y);
      liveDrag.current = dragged;
      setDrag(dragged);
      return;
    }
    const cur = liveDraft.current;
    if (cur) {
      const pt = toPoint(x, y);
      if (!pt) return;
      if (cur.stroke) {
        const last = cur.points[cur.points.length - 1];
        // a stroke keeps a point when the pointer has moved a few pixels (a point per pixel is far too many to save)
        if (last && geo && Math.abs(geo.tickToX(pt.t) - geo.tickToX(last.t)) < 3 && Math.abs((geo.priceToY(pt.p) ?? 0) - (geo.priceToY(last.p) ?? 0)) < 3) return;
        const next: Draft = { ...cur, points: [...cur.points, pt], cursor: pt };
        liveDraft.current = next;
        setDraft(next);
        return;
      }
      const next: Draft = { ...cur, cursor: pt };
      liveDraft.current = next;
      setDraft(next);
    }
  };

  const onRootUp = () => {
    const dr = liveDrag.current;
    if (dr) {
      liveDrag.current = null;
      setDrag(null);
      const st = useDrawings.getState();
      if (dr.moved) st.commit(assetId, st.byAsset[assetId] ?? [], dr.start);
      else st.preview(assetId, dr.start);
      return;
    }
    const cur = liveDraft.current;
    if (cur?.stroke) {
      if (cur.points.length >= 2) finish(cur.kind, cur.points);
      else { liveDraft.current = null; setDraft(null); }
    }
  };

  /** A drag's new points: a whole drawing shifts by the pointer's change in time and price; a handle moves its own point. */
  const applyDrag = (dr: Drag, x: number, y: number): Drag => {
    if (!geo) return dr;
    const cur = useDrawings.getState().byAsset[assetId] ?? [];
    const d = cur.find((c) => c.id === dr.id);
    if (!d) return dr;
    let points: DrawingPoint[];
    if (dr.mode === 'move') {
      const dt = geo.xToTick(x) - geo.xToTick(dr.x0);
      const dp = (geo.yToPrice(y) ?? 0) - (geo.yToPrice(dr.y0) ?? 0);
      points = shiftDrawing(dr.orig, Math.round(dt), dp);
    } else {
      const target = toPoint(x, y);
      if (!target) return dr;
      const orig = dr.orig[dr.index]!;
      const tickDelta = dr.axis === 'price' ? 0 : target.t - orig.t;
      const priceDelta = dr.axis === 'tick' ? 0 : target.p - orig.p;
      points = movePoint({ ...d, points: dr.orig }, dr.index, dr.axis, tickDelta, priceDelta);
    }
    const moved = dr.moved || points.some((p, i) => p.t !== dr.orig[i]!.t || Math.abs(p.p - dr.orig[i]!.p) > 1e-9);
    useDrawings.getState().preview(assetId, cur.map((c) => (c.id === dr.id ? { ...c, points } : c)));
    return { ...dr, points, moved };
  };

  const pressShape = (e: RPointerEvent<SVGElement>, d: ChartDrawing) => {
    if (drawing || e.button !== 0) return;
    e.stopPropagation();
    useDrawings.getState().select(d.id);
    if (locked || d.locked) return;
    const { x, y } = local(e);
    const dr: Drag = { id: d.id, mode: 'move', index: 0, axis: 'both', x0: x, y0: y, orig: d.points, start: list, points: d.points, moved: false };
    liveDrag.current = dr;
    setDrag(dr);
    root.current?.setPointerCapture(e.pointerId);
  };

  const pressHandle = (e: RPointerEvent<SVGElement>, d: ChartDrawing, index: number, axis: 'both' | 'price' | 'tick') => {
    if (e.button !== 0 || locked || d.locked) return;
    e.stopPropagation();
    const { x, y } = local(e);
    const dr: Drag = { id: d.id, mode: 'handle', index, axis, x0: x, y0: y, orig: d.points, start: list, points: d.points, moved: false };
    liveDrag.current = dr;
    setDrag(dr);
    root.current?.setPointerCapture(e.pointerId);
  };

  // the drawings as they show now: a drag shows its own points (the store already holds the same ones)
  const shown = list.map((d) => (drag && drag.id === d.id ? { ...d, points: drag.points } : d));
  const onScreen = hidden ? [] : shown;
  const draftShape = draft && geo && draft.kind === tool ? { id: '~draft', kind: draft.kind as ChartDrawing['kind'], points: draft.stroke ? draft.points : [...draft.points, ...(draft.cursor ? [draft.cursor] : [])], color: 'brass' as const, width: 2 as const, style: 'solid' as const } : null;

  return (
    <svg
      ref={root} data-testid="drawing-layer" data-tool={tool} className="absolute inset-0 z-[3] h-full w-full overflow-visible"
      width={geo?.width ?? 0} height={geo?.height ?? 0}
      style={{ pointerEvents: drawing ? 'auto' : 'none', cursor: drawing ? 'crosshair' : undefined, touchAction: 'none' }}
      onPointerDown={onRootDown} onPointerMove={onRootMove} onPointerUp={onRootUp}
      onPointerCancel={() => {
        const dr = liveDrag.current;
        if (dr) useDrawings.getState().preview(assetId, dr.start);
        liveDrag.current = null; setDrag(null); liveDraft.current = null; setDraft(null);
      }}
      onContextMenu={(e) => { if (drawing) e.preventDefault(); }}
      onWheel={(e) => { if (drawing) onWheel?.(e.nativeEvent); }}
    >
      {geo && onScreen.map((d) => (
        <DrawingNode
          key={d.id} d={d} assetId={assetId} geo={geo} selected={selected === d.id && !drawing}
          onPress={pressShape} onHandle={pressHandle}
        />
      ))}
      {geo && draftShape && <DraftNode shape={draftShape} geo={geo} />}
    </svg>
  );
}

const EMPTY: ChartDrawing[] = [];

type Press = (e: RPointerEvent<SVGElement>, d: ChartDrawing) => void;
type HandlePress = (e: RPointerEvent<SVGElement>, d: ChartDrawing, index: number, axis: 'both' | 'price' | 'tick') => void;

/** One drawing on the plot: its shape, and its handles while it is selected. */
function DrawingNode({ d, assetId, geo, selected, onPress, onHandle }: { d: ChartDrawing; assetId: string; geo: ChartGeo; selected: boolean; onPress: Press; onHandle: HandlePress }) {
  const px = d.points.map((p) => ({ x: geo.tickToX(p.t), y: geo.priceToY(p.p) }));
  if (px.some((p) => p.y === null)) return null;
  const pts = px as Px[];
  return (
    <g data-testid={`drawing-${d.id}`} data-kind={d.kind} data-selected={selected || undefined} className={TONE[d.color ?? 'brass']} onPointerDown={(e) => onPress(e, d)}
      onContextMenu={(e) => {
        if (!selected || (d.kind !== 'long' && d.kind !== 'short')) return;
        e.preventDefault();
        e.stopPropagation();
        placeSelectedPosition(e.currentTarget.closest('[data-testid="chart-card"]'), assetId, d.id);
      }}
    >
      {shape(d, pts, geo)}
      {selected && handles(d, pts, (e, index, axis) => onHandle(e, d, index, axis))}
    </g>
  );
}

/** The shape a tool is placing: drawn in the brass tone, with no pointer of its own. */
function DraftNode({ shape: draftShape, geo }: { shape: ChartDrawing; geo: ChartGeo }) {
  const pts = draftShape.points.map((p) => ({ x: geo.tickToX(p.t), y: geo.priceToY(p.p) ?? 0 }));
  return (
    <g data-testid="drawing-draft" className={TONE.brass} style={{ pointerEvents: 'none' }}>
      {shape(draftShape, pts, geo)}
    </g>
  );
}

/** The handle circles of a selected drawing (and the position tool's extent handle at the middle of its far end). */
function handles(d: ChartDrawing, px: Px[], press: (e: RPointerEvent<SVGElement>, index: number, axis: 'both' | 'price' | 'tick') => void): ReactNode {
  const hs = handlesOf(d);
  const out: ReactNode[] = hs.map((h) => (
    <circle
      key={`h${h.index}`} data-testid={`drawing-handle-${d.id}-${h.index}`} cx={px[h.index]!.x} cy={px[h.index]!.y} r={4.5}
      className="fill-ink-1 stroke-current" strokeWidth={1.5} style={{ cursor: h.axis === 'tick' ? 'ew-resize' : h.axis === 'price' ? 'ns-resize' : 'move', pointerEvents: 'auto' }}
      onPointerDown={(e) => press(e, h.index, h.axis)}
    />
  ));
  const ext = positionExtentIndices(d.kind);
  if (ext.length === 2 && px[1] && px[2]) {
    const x = px[1].x;
    const y = (px[1].y + px[2].y) / 2;
    out.push(
      <rect
        key="ext" data-testid={`drawing-extent-${d.id}`} x={x - 3} y={y - 8} width={6} height={16} rx={2}
        className="fill-ink-1 stroke-current" strokeWidth={1.5} style={{ cursor: 'ew-resize', pointerEvents: 'auto' }}
        onPointerDown={(e) => press(e, 1, 'tick')}
      />,
    );
  }
  return <>{out}</>;
}

/** The shape of one drawing in pixels: its lines, areas and labels (its handles are drawn apart, when it is selected). */
function shape(d: ChartDrawing, px: Px[], geo: ChartGeo): ReactNode {
  // a line is hit within a few pixels of its path (a transparent stroke twelve pixels wide), so a press on it selects it
  const seg = hitSegment(d, px, geo);
  return (
    <>
      {seg && <line x1={seg[0].x} y1={seg[0].y} x2={seg[1].x} y2={seg[1].y} stroke="transparent" strokeWidth={12} style={{ pointerEvents: 'stroke' }} />}
      {shapeBody(d, px, geo)}
    </>
  );
}

/** The segment a line-like drawing is pressed on (its own path, across the plot for the horizontal and vertical lines). */
function hitSegment(d: ChartDrawing, px: Px[], geo: ChartGeo): [Px, Px] | null {
  const a = px[0];
  const b = px[1];
  switch (d.kind) {
    case 'hline': return a ? [{ x: 0, y: a.y }, { x: geo.width, y: a.y }] : null;
    case 'hray': return a ? [{ x: a.x, y: a.y }, { x: geo.width, y: a.y }] : null;
    case 'vline': return a ? [{ x: a.x, y: 0 }, { x: a.x, y: geo.height }] : null;
    case 'trend': case 'ray': case 'extended': case 'arrow': return a && b ? [a, b] : null;
    default: return null;
  }
}

function shapeBody(d: ChartDrawing, px: Px[], geo: ChartGeo): ReactNode {
  const w = STROKE(d.width);
  const dash = DASH(d.style);
  const common = { stroke: 'currentColor', strokeWidth: w, strokeDasharray: dash, fill: 'none' } as const;
  const a = px[0];
  const b = px[1];
  const label = (x: number, y: number, text: string, anchor: 'start' | 'end' = 'start') => (
    <text x={x} y={y} fill="currentColor" className="num" fontSize={11} textAnchor={anchor} style={{ pointerEvents: 'none' }}>{text}</text>
  );
  switch (d.kind) {
    case 'hline':
      return <line x1={0} x2={geo.width} y1={a!.y} y2={a!.y} {...common} />;
    case 'hray':
      return <line x1={a!.x} x2={geo.width} y1={a!.y} y2={a!.y} {...common} />;
    case 'vline':
      return <line x1={a!.x} x2={a!.x} y1={0} y2={geo.height} {...common} />;
    case 'trend':
      return b ? <line x1={a!.x} y1={a!.y} x2={b.x} y2={b.y} {...common} /> : null;
    case 'arrow': {
      if (!b) return null;
      const ang = Math.atan2(b.y - a!.y, b.x - a!.x);
      const hx = b.x - 9 * Math.cos(ang - 0.4);
      const hy = b.y - 9 * Math.sin(ang - 0.4);
      const gx = b.x - 9 * Math.cos(ang + 0.4);
      const gy = b.y - 9 * Math.sin(ang + 0.4);
      return (
        <g>
          <line x1={a!.x} y1={a!.y} x2={b.x} y2={b.y} {...common} />
          <polygon points={`${b.x},${b.y} ${hx},${hy} ${gx},${gy}`} fill="currentColor" />
        </g>
      );
    }
    case 'ray': case 'extended': {
      if (!b) return null;
      const seg = extendLine(a!, b, geo.width, geo.height, d.kind === 'extended');
      return seg ? <line x1={seg[0].x} y1={seg[0].y} x2={seg[1].x} y2={seg[1].y} {...common} /> : null;
    }
    case 'channel': {
      if (!b || !px[2]) return null;
      // the parallel line runs through the third point, at the same slope as the base line
      const slope = b.x === a!.x ? 0 : (b.y - a!.y) / (b.x - a!.x);
      const lineY = (x: number) => a!.y + slope * (x - a!.x);
      const off = px[2].y - lineY(px[2].x);
      const base = [a!, b];
      const other = base.map((p) => ({ x: p.x, y: p.y + off }));
      return (
        <g>
          <polygon points={`${base[0]!.x},${base[0]!.y} ${base[1]!.x},${base[1]!.y} ${other[1]!.x},${other[1]!.y} ${other[0]!.x},${other[0]!.y}`} fill="currentColor" fillOpacity={0.08} />
          <line x1={base[0]!.x} y1={base[0]!.y} x2={base[1]!.x} y2={base[1]!.y} {...common} />
          <line x1={other[0]!.x} y1={other[0]!.y} x2={other[1]!.x} y2={other[1]!.y} {...common} />
        </g>
      );
    }
    case 'rect': case 'pricerange': case 'daterange': case 'datepricerange': {
      if (!b) return null;
      const x = Math.min(a!.x, b.x);
      const y = Math.min(a!.y, b.y);
      const width = Math.abs(b.x - a!.x);
      const height = Math.abs(b.y - a!.y);
      const area = d.kind === 'daterange' ? { x, y: 0, width, height: geo.height } : d.kind === 'pricerange' ? { x: 0, y, width: geo.width, height } : { x, y, width, height };
      const labels: ReactNode[] = [];
      if (d.kind === 'pricerange' || d.kind === 'datepricerange') {
        const pa = d.points[0]!.p;
        const pb = d.points[1]!.p;
        labels.push(label(x + 6, y + 14, `${fmtPrice(pb - pa)} (${signedPct(changePct(pa, pb) / 100)})`));
      }
      if (d.kind === 'daterange' || d.kind === 'datepricerange') {
        const bars = Math.abs(d.points[1]!.t - d.points[0]!.t);
        labels.push(label(x + 6, geo.height - 8, t('broker.drawings.bars', { n: bars })));
      }
      return (
        <g>
          <rect x={area.x} y={area.y} width={area.width} height={area.height} {...common} fill="currentColor" fillOpacity={0.08} style={{ pointerEvents: 'all' }} />
          {labels}
        </g>
      );
    }
    case 'ellipse': {
      if (!b) return null;
      const cx = (a!.x + b.x) / 2;
      const cy = (a!.y + b.y) / 2;
      return <ellipse cx={cx} cy={cy} rx={Math.abs(b.x - a!.x) / 2} ry={Math.abs(b.y - a!.y) / 2} {...common} fill="currentColor" fillOpacity={0.08} style={{ pointerEvents: 'all' }} />;
    }
    case 'fib': {
      if (!b) return null;
      const left = Math.min(a!.x, b.x);
      const right = Math.max(a!.x, b.x);
      const levels = fibPrices(d.points[0]!.p, d.points[1]!.p);
      return (
        <g>
          {levels.map(({ level, price }) => {
            const y = geo.priceToY(price);
            if (y === null) return null;
            return (
              <g key={level}>
                <line x1={left} x2={right} y1={y} y2={y} {...common} strokeWidth={level === 0 || level === 1 ? w : 1} strokeDasharray={level > 1 ? '4 3' : undefined} />
                {label(right + 6, y + 4, `${(level * 100).toFixed(1)}%  ${fmtPrice(price)}`)}
              </g>
            );
          })}
        </g>
      );
    }
    case 'long': case 'short': {
      const lv = positionLevels(d);
      if (!lv || !px[1] || !px[2]) return null;
      const x0 = a!.x;
      const xFar = px[1].x;
      const left = Math.min(x0, xFar);
      const right = Math.max(x0, xFar);
      const boxW = Math.max(right - left, 2);
      const yE = a!.y;
      const yT = px[1].y;
      const yS = px[2].y;
      const up = d.kind === 'long';
      const profitTop = Math.min(yE, yT);
      const lossTop = Math.min(yE, yS);
      const pct = (p: number) => signedPct(changePct(lv.entry, p) / 100);
      return (
        <g data-position={up ? 'long' : 'short'}>
          <rect x={left} y={profitTop} width={boxW} height={Math.abs(yT - yE)} fill="currentColor" fillOpacity={0.1} className="text-gain" style={{ pointerEvents: 'all' }} />
          <rect x={left} y={lossTop} width={boxW} height={Math.abs(yS - yE)} fill="currentColor" fillOpacity={0.1} className="text-loss" style={{ pointerEvents: 'all' }} />
          <line x1={left} x2={left + boxW} y1={yE} y2={yE} {...common} strokeWidth={w} />
          <line x1={left} x2={left + boxW} y1={yT} y2={yT} stroke="currentColor" strokeWidth={1} className="text-gain" />
          <line x1={left} x2={left + boxW} y1={yS} y2={yS} stroke="currentColor" strokeWidth={1} className="text-loss" />
          {label(right + 6, yT + 4, `${t('broker.position.target')} ${fmtPrice(lv.target)} ${pct(lv.target)}`)}
          {label(right + 6, yS + 4, `${t('broker.position.stop')} ${fmtPrice(lv.stop)} ${pct(lv.stop)}`)}
          {label(left + 6, yE - 6, `${t('broker.position.entry')} ${fmtPrice(lv.entry)}`)}
        </g>
      );
    }
    case 'text': {
      if (!a) return null;
      return label(a.x, a.y, d.text ?? '');
    }
    case 'brush': {
      if (px.length < 2) return null;
      return <polyline points={px.map((p) => `${p.x},${p.y}`).join(' ')} {...common} strokeLinejoin="round" strokeLinecap="round" />;
    }
    default:
      return null;
  }
}
