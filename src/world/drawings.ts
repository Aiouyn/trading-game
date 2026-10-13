/**
 * The chart drawings a player keeps per symbol (R-10-5). They are the player's own notes on the chart: private (only the owner
 * reads them, through the `drawings` request), capped in number and size, and stored on the player as an optional field, so a
 * save from before drawings loads with none. The engine never reads them: a drawing changes no price, order or cash.
 *
 * A point is a chart time (the game tick the candle carries) and a price. A drawing keeps its tick, so it stays on the same
 * candle when the candle size changes. The shapes are client-side geometry; this module only checks and bounds what is kept.
 */

/** Every shape the Broker chart draws (the toolbar lists them in this order's groups). */
export const DRAWING_KINDS = [
  'trend', 'ray', 'extended', 'hline', 'hray', 'vline', 'channel', 'rect', 'ellipse', 'fib',
  'pricerange', 'daterange', 'datepricerange', 'long', 'short', 'text', 'arrow', 'brush',
] as const;
export type DrawingKind = (typeof DRAWING_KINDS)[number];

/** The colours a drawing takes: token names the chart reads from the design system (never a raw hex in the save). */
export const DRAWING_COLORS = ['brass', 'info', 'gain', 'loss', 'warn', 'steel', 'line'] as const;
export type DrawingColor = (typeof DRAWING_COLORS)[number];

export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

export interface DrawingPoint {
  /** the chart time: a game tick (the candle's first tick, or any tick between candles) */
  t: number;
  /** the price */
  p: number;
}

/** A position tool's settings as the player left them (the risk panel), kept with the drawing. */
export interface PositionSettings {
  /** the risk the player accepts, in dollars and as a share of equity (synced in the panel) */
  riskUsd: number;
  riskPct: number;
  /** the fees and spread per unit the panel used (informational: the order is priced by the engine when placed) */
  feePerUnit?: number;
}

export interface ChartDrawing {
  id: string;
  kind: DrawingKind;
  points: DrawingPoint[];
  color?: DrawingColor;
  width?: 1 | 2 | 3 | 4;
  style?: LineStyle;
  /** the text of a text label or a note */
  text?: string;
  locked?: boolean;
  hidden?: boolean;
  /** the position tools only */
  position?: PositionSettings;
}

/** The caps a player's drawings live within (the save is refused past them; the chart says so). */
export const DRAWING_CAPS = {
  /** drawings per symbol */
  perSymbol: 60,
  /** symbols with drawings */
  symbols: 40,
  /** points in one drawing (a brush stroke is the long one) */
  points: 160,
  /** characters of a text label */
  text: 80,
  /** characters of a drawing id */
  id: 40,
  /** bytes of one symbol's saved drawings */
  bytesPerSymbol: 24_000,
} as const;

/** The longest a chart time can be (far past any game): keeps a bad number out of the save. */
const MAX_TICK = 1_000_000_000;
const MAX_PRICE = 1_000_000_000;

const KIND_SET = new Set<string>(DRAWING_KINDS);
const COLOR_SET = new Set<string>(DRAWING_COLORS);
const STYLE_SET = new Set<string>(LINE_STYLES);

export type SanitizeResult = { ok: true; value: ChartDrawing[] } | { ok: false; error: string };

function point(x: unknown): DrawingPoint | null {
  if (!x || typeof x !== 'object') return null;
  const { t, p } = x as { t?: unknown; p?: unknown };
  if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > MAX_TICK) return null;
  if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p > MAX_PRICE) return null;
  return { t, p };
}

function drawing(x: unknown): ChartDrawing | string {
  if (!x || typeof x !== 'object') return 'drawingBad';
  const d = x as Record<string, unknown>;
  if (typeof d.id !== 'string' || d.id.length === 0 || d.id.length > DRAWING_CAPS.id) return 'drawingBad';
  if (typeof d.kind !== 'string' || !KIND_SET.has(d.kind)) return 'drawingBad';
  if (!Array.isArray(d.points) || d.points.length === 0 || d.points.length > DRAWING_CAPS.points) return 'drawingBad';
  const points: DrawingPoint[] = [];
  for (const q of d.points) {
    const pt = point(q);
    if (!pt) return 'drawingBad';
    points.push(pt);
  }
  const out: ChartDrawing = { id: d.id, kind: d.kind as DrawingKind, points };
  if (d.color !== undefined) {
    if (typeof d.color !== 'string' || !COLOR_SET.has(d.color)) return 'drawingBad';
    out.color = d.color as DrawingColor;
  }
  if (d.width !== undefined) {
    if (d.width !== 1 && d.width !== 2 && d.width !== 3 && d.width !== 4) return 'drawingBad';
    out.width = d.width;
  }
  if (d.style !== undefined) {
    if (typeof d.style !== 'string' || !STYLE_SET.has(d.style)) return 'drawingBad';
    out.style = d.style as LineStyle;
  }
  if (d.text !== undefined) {
    if (typeof d.text !== 'string' || d.text.length > DRAWING_CAPS.text) return 'drawingBad';
    out.text = d.text;
  }
  if (d.locked !== undefined) {
    if (typeof d.locked !== 'boolean') return 'drawingBad';
    out.locked = d.locked;
  }
  if (d.hidden !== undefined) {
    if (typeof d.hidden !== 'boolean') return 'drawingBad';
    out.hidden = d.hidden;
  }
  if (d.position !== undefined) {
    const pos = d.position as Record<string, unknown> | null;
    if (!pos || typeof pos !== 'object') return 'drawingBad';
    const riskUsd = pos.riskUsd;
    const riskPct = pos.riskPct;
    if (typeof riskUsd !== 'number' || !Number.isFinite(riskUsd) || riskUsd < 0 || riskUsd > MAX_PRICE) return 'drawingBad';
    if (typeof riskPct !== 'number' || !Number.isFinite(riskPct) || riskPct < 0 || riskPct > 100) return 'drawingBad';
    const position: PositionSettings = { riskUsd, riskPct };
    if (pos.feePerUnit !== undefined) {
      if (typeof pos.feePerUnit !== 'number' || !Number.isFinite(pos.feePerUnit) || pos.feePerUnit < 0) return 'drawingBad';
      position.feePerUnit = pos.feePerUnit;
    }
    out.position = position;
  }
  return out;
}

/**
 * Checks a symbol's drawings as the client sends them and returns the clean list, or the reason it is refused. Unknown fields
 * are dropped, every number is range-checked, and the caps (per symbol, points, text, bytes) are enforced here, never trusted
 * to the client.
 */
export function sanitizeDrawings(input: unknown): SanitizeResult {
  if (!Array.isArray(input)) return { ok: false, error: 'drawingBad' };
  if (input.length > DRAWING_CAPS.perSymbol) return { ok: false, error: 'drawingsFull' };
  const seen = new Set<string>();
  const out: ChartDrawing[] = [];
  for (const x of input) {
    const d = drawing(x);
    if (typeof d === 'string') return { ok: false, error: d };
    if (seen.has(d.id)) return { ok: false, error: 'drawingBad' };
    seen.add(d.id);
    out.push(d);
  }
  if (JSON.stringify(out).length > DRAWING_CAPS.bytesPerSymbol) return { ok: false, error: 'drawingsTooLarge' };
  return { ok: true, value: out };
}
