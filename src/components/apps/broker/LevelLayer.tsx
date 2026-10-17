'use client';

import { type PointerEvent, useRef, useState } from 'react';
import type { AssetClass } from '@/engine';
import { assetPrice } from '@/game/format';
import { t } from '@/i18n';
import { draggedLevelPrice, roundPrice, type ChartLevel } from './chartLevels';

/** A line and the pixel row it sits on (null when the price is off the visible scale: the line is not drawn). */
export interface PlacedLevel { level: ChartLevel; y: number | null }

const LINE: Record<ChartLevel['tone'], string> = {
  gain: 'border-gain/70', loss: 'border-loss/70', brass: 'border-brass/70', info: 'border-info/70', steel: 'border-steel/70',
};
const TEXT: Record<ChartLevel['tone'], string> = {
  gain: 'text-gain', loss: 'text-loss', brass: 'text-brass-hi', info: 'text-info', steel: 'text-steel',
};
/** A pinned pill sits this many pixels inside the edge it is past; pinned pills on one edge stack, one pill height apart. */
const EDGE = 14;
const PILL_H = 22;
/** The arrows of a pinned pill (characters, not copy: they stay out of the JSX text). */
const ARROW_UP = '▲';
const ARROW_DOWN = '▼';

/** A drag in progress: the level, the price it now shows, its own price at the press, and the pointer price at the press. */
interface Drag { id: string; price: number | null; base: number; startP: number | null }

/**
 * The lines of a position and its orders, drawn over the chart (spec 1.3). Lightweight-charts has no drag, so the lines are
 * HTML: a dashed rule across the plot and a pill at the price axis. A pill drags on pointer events. The level moves by the
 * pointer's move in price (so a pinned level, which sits at the edge, moves from its own price and not from the edge's),
 * the pill follows the new price through the chart's own scale (toY), and the new price is committed on release. The pills
 * are the only pointer targets, so the chart under them still pans and zooms.
 */
export function LevelLayer({ placed, axisW, height, toPrice, toY, onCommit, onCancel, onAction, assetClass }: {
  placed: PlacedLevel[];
  /** the price axis's width in pixels: the pills sit just left of it */
  axisW: number;
  /** the plot's height in pixels: a line off it is pinned to its edge */
  height: number;
  /** the price under a pixel row, and the row of a price (the chart's scale; null off it) */
  toPrice: (y: number) => number | null;
  toY: (price: number) => number | null;
  onCommit: (level: ChartLevel, price: number) => void;
  onCancel: (level: ChartLevel) => void;
  onAction: (level: ChartLevel, key: 'addTp' | 'addSl' | 'close') => void;
  /** the asset's class: its prices are written at its own precision and dragged to its tick (R-10-3) */
  assetClass: AssetClass;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // the latest drag, read by the release handler (a release right after a move must see that move's price)
  const live = useRef<Drag | null>(null);
  const rowOf = (e: PointerEvent<HTMLElement>): number => {
    const r = box.current?.getBoundingClientRect();
    return r ? e.clientY - r.top : 0;
  };
  const start = (e: PointerEvent<HTMLDivElement>, level: ChartLevel) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p0 = toPrice(rowOf(e));
    live.current = { id: level.id, price: level.price, base: level.price, startP: p0 };
    setDrag(live.current);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const cur = live.current;
    if (!cur) return;
    const p = toPrice(rowOf(e));
    // the pointer's move in price since the press, applied to the level's own price
    const price = draggedLevelPrice(cur.base, cur.startP, p);
    live.current = { ...cur, price };
    setDrag(live.current);
  };
  const end = (level: ChartLevel) => {
    const cur = live.current;
    live.current = null;
    setDrag(null);
    if (!cur || cur.id !== level.id || cur.price === null || cur.startP === null) return;
    // a press without a move is a click, not a drag: it must not move an off-tick level to the tick
    if (Math.abs(cur.price - cur.base) < 1e-9) return;
    const next = roundPrice(cur.price, assetClass);
    if (!(next > 0) || !Number.isFinite(next)) return;
    if (Math.abs(next - level.price) > 1e-9) onCommit(level, next);
  };

  // Each pill's row: while dragging, the dragged price (on the scale or pinned); otherwise its own row. A price off the visible
  // range is pinned to the edge it is past, with an arrow: the line is not drawn, but the pill still shows the level and takes
  // its drag and cancel (the chart's autoscale does not count the lines). Pinned pills on one edge stack, so they do not cover
  // each other or the buttons on the average line.
  let up = 0;
  let down = 0;
  const laid = placed.flatMap(({ level, y }) => {
    const dragging = drag?.id === level.id && drag.price !== null;
    const at = dragging ? toY(drag.price!) ?? y : y;
    if (at === null) return [];
    const edge: 'up' | 'down' | null = at < 0 ? 'up' : at > height ? 'down' : null;
    const row = edge === 'up' ? EDGE + up++ * PILL_H : edge === 'down' ? height - EDGE - down++ * PILL_H : at;
    return [{ level, edge, row, dragging, shown: dragging ? drag.price! : level.price }];
  });
  // Pills on the scale that sit on nearly the same row (the average line and a take-profit a few cents apart) are spread one
  // pill height apart, top to bottom; the line keeps its true row, and the dragged pill keeps the pointer's row.
  // A pinned pill (an edge row, its arrow) takes its row as it is, and an in-range pill below it moves down past it too: a take-profit
  // pinned at the top never sits over the average line's own buttons (the +SL control). Only in-range pills move.
  const ordered = laid.slice().sort((a, b) => a.row - b.row);
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const cur = ordered[i]!;
    // A pill pinned at the top (edge up) that lands just under an in-range pill moves down past it as well: the average line's
    // own buttons (+SL) are never covered by a pinned take-profit.
    const movable = cur.edge === null || (cur.edge === 'up' && prev.edge === null);
    if (movable && !cur.dragging && cur.row < prev.row + PILL_H) cur.row = prev.row + PILL_H;
  }
  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-[4] overflow-hidden" data-testid="chart-levels">
      {laid.map(({ level, edge, row, dragging, shown }) => {
        return (
          <div key={level.id} className="contents" data-kind={level.kind} data-edge={edge ?? undefined}>
            {edge === null && (
              <div
                className={`absolute left-0 border-t ${level.dashed ? 'border-dashed' : ''} ${LINE[level.tone]}`}
                style={{ top: row, right: axisW }}
                data-testid={`level-line-${level.id}`}
              />
            )}
            <div
              className={`pointer-events-auto absolute flex items-center gap-1 rounded-chip border bg-ink-1 px-1.5 py-0.5 text-micro ${LINE[level.tone]} ${dragging ? 'z-[5]' : ''} ${level.draggable ? 'cursor-ns-resize touch-none' : ''}`}
              style={{ top: row, right: axisW + 8, transform: 'translateY(-50%)', maxWidth: `calc(100% - ${axisW + 16}px)` }}
              onPointerDown={level.draggable ? (e) => start(e, level) : undefined}
              onPointerMove={level.draggable ? move : undefined}
              onPointerUp={level.draggable ? () => end(level) : undefined}
              onPointerCancel={level.draggable ? () => { live.current = null; setDrag(null); } : undefined}
              title={level.draggable ? t('broker.level.drag') : undefined}
              data-testid={`level-${level.id}`}
            >
              <span className={`num truncate ${TEXT[level.tone]}`}>
                {edge === 'up' ? `${ARROW_UP} ` : edge === 'down' ? `${ARROW_DOWN} ` : ''}
                {dragging ? (level.labelAt?.(shown) ?? assetPrice({ assetClass }, shown)) : level.label}
              </span>
              {level.actions?.map((a) => (
                <button
                  key={a.key} type="button" onClick={() => onAction(level, a.key)}
                  className="rounded-sm border border-ink-3 px-1 text-fg-muted hover:border-brass/60 hover:text-fg"
                  data-testid={a.key === 'addTp' ? 'level-add-tp' : 'level-add-sl'}
                >
                  {a.label}
                </button>
              ))}
              {level.closable && (
                <button
                  type="button" onClick={() => onAction(level, 'close')} data-testid="level-close"
                  className="rounded-sm border border-loss/50 px-1 text-micro text-loss hover:bg-loss/10"
                >
                  {t('broker.level.close')}
                </button>
              )}
              {level.cancelable && (
                <button
                  type="button" aria-label={t('common.cancel')} title={t('common.cancel')} onClick={() => onCancel(level)}
                  className="px-0.5 text-fg-faint hover:text-fg" data-testid={`level-cancel-${level.id}`}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
