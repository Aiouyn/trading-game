'use client';

import { type PointerEvent, useRef, useState } from 'react';
import { price as fmtPrice } from '@/game/format';
import { t } from '@/i18n';
import { roundPrice, type ChartLevel } from './chartLevels';

/** A line and the pixel row it sits on (null when the price is off the visible scale: the line is not drawn). */
export interface PlacedLevel { level: ChartLevel; y: number | null }

const LINE: Record<ChartLevel['tone'], string> = {
  gain: 'border-gain/70', loss: 'border-loss/70', brass: 'border-brass/70', info: 'border-info/70', steel: 'border-steel/70',
};
const TEXT: Record<ChartLevel['tone'], string> = {
  gain: 'text-gain', loss: 'text-loss', brass: 'text-brass-hi', info: 'text-info', steel: 'text-steel',
};

/**
 * The lines of a position and its orders, drawn over the chart (spec 1.3). Lightweight-charts has no drag, so the lines are
 * HTML: a dashed rule across the plot and a pill at the price axis. A pill drags on pointer events: the price follows the
 * pointer through the chart's own scale (toPrice), and the new price is committed on release. The pills are the only
 * pointer targets, so the chart under them still pans and zooms.
 */
export function LevelLayer({ placed, axisW, height, toPrice, onCommit, onCancel, onAction }: {
  placed: PlacedLevel[];
  /** the price axis's width in pixels: the pills sit just left of it */
  axisW: number;
  /** the plot's height in pixels: a line off it is not drawn */
  height: number;
  toPrice: (y: number) => number | null;
  onCommit: (level: ChartLevel, price: number) => void;
  onCancel: (level: ChartLevel) => void;
  onAction: (level: ChartLevel, key: 'addTp' | 'addSl') => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; y: number; price: number | null } | null>(null);
  // the latest drag, read by the release handler (a release right after a move must see that move's price)
  const live = useRef<{ id: string; y: number; price: number | null } | null>(null);
  const rowOf = (e: PointerEvent<HTMLElement>): number => {
    const r = box.current?.getBoundingClientRect();
    return r ? e.clientY - r.top : 0;
  };
  const start = (e: PointerEvent<HTMLDivElement>, level: ChartLevel) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const y = rowOf(e);
    live.current = { id: level.id, y, price: toPrice(y) };
    setDrag(live.current);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const cur = live.current;
    if (!cur) return;
    const y = rowOf(e);
    live.current = { id: cur.id, y, price: toPrice(y) };
    setDrag(live.current);
  };
  const end = (level: ChartLevel) => {
    const cur = live.current;
    live.current = null;
    setDrag(null);
    if (!cur || cur.id !== level.id || cur.price === null) return;
    const next = roundPrice(cur.price);
    if (Math.abs(next - level.price) > 1e-9) onCommit(level, next);
  };

  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-[4] overflow-hidden" data-testid="chart-levels">
      {placed.map(({ level, y }) => {
        const dragging = drag?.id === level.id;
        const row = dragging ? drag.y : y;
        if (row === null || row < 0 || row > height) return null;
        const shown = dragging && drag.price !== null ? drag.price : level.price;
        return (
          <div key={level.id} className="contents" data-kind={level.kind}>
            <div
              className={`absolute left-0 border-t ${level.dashed ? 'border-dashed' : ''} ${LINE[level.tone]}`}
              style={{ top: row, right: axisW }}
              data-testid={`level-line-${level.id}`}
            />
            <div
              className={`pointer-events-auto absolute flex items-center gap-1 rounded-chip border bg-ink-1 px-1.5 py-0.5 text-micro ${LINE[level.tone]} ${dragging ? 'z-[5]' : ''} ${level.draggable ? 'cursor-ns-resize touch-none' : ''}`}
              style={{ top: row, right: axisW + 4, transform: 'translateY(-50%)', maxWidth: `calc(100% - ${axisW + 12}px)` }}
              onPointerDown={level.draggable ? (e) => start(e, level) : undefined}
              onPointerMove={level.draggable ? move : undefined}
              onPointerUp={level.draggable ? () => end(level) : undefined}
              onPointerCancel={level.draggable ? () => { live.current = null; setDrag(null); } : undefined}
              title={level.draggable ? t('broker.level.drag') : undefined}
              data-testid={`level-${level.id}`}
            >
              <span className={`num truncate ${TEXT[level.tone]}`}>
                {dragging ? `${fmtPrice(shown)}` : level.label}
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
