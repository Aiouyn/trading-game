'use client';

import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from 'react';
import { t } from '@/i18n';

/** The dock's height at the start, and the least it may shrink to (spec 1.1: resizable, default 220 px). */
export const DOCK_DEFAULT = 220;
const DOCK_MIN = 120;
/** The chart keeps at least this much height when the dock grows. */
const CHART_MIN = 180;
const SPLIT = 6;
/** The watchlist column opens by default from this window width; below it the column starts collapsed. */
export const WATCHLIST_OPEN_W = 1360;
/** The collapse and expand glyphs (the characters are data, not copy, so they stay out of the JSX text). */
const CHEVRON_LEFT = '‹';
const CHEVRON_RIGHT = '›';

/**
 * The desktop terminal (spec 1.1): a collapsible watchlist on the left, the chart on top of a resizable bottom dock in the
 * middle, and the order ticket as a full-height, sticky-looking column on the right. Each region is a slot, so the parts
 * can change without this file: chart, dock, watchlist and ticket.
 */
export function TerminalLayout({ chart, dock, watchlist, ticket, watchlistOpen = true }: {
  chart: ReactNode;
  dock: ReactNode;
  watchlist: ReactNode;
  ticket: ReactNode;
  watchlistOpen?: boolean;
}) {
  const [open, setOpen] = useState(watchlistOpen);
  const [dockH, setDockH] = useState(DOCK_DEFAULT);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const clamp = (h: number) => {
    const max = (body.current?.clientHeight ?? DOCK_DEFAULT + CHART_MIN) - CHART_MIN - SPLIT;
    return Math.round(Math.max(DOCK_MIN, Math.min(h, Math.max(DOCK_MIN, max))));
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, h: dockH };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setDockH(clamp(d.h + (d.y - e.clientY)));
  };
  const onUp = () => { drag.current = null; };
  // the splitter is a focusable separator: arrow keys move it by 16 px
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setDockH((h) => clamp(h + (e.key === 'ArrowUp' ? 16 : -16)));
  };
  return (
    <div ref={body} className="flex min-h-0 flex-1" data-testid="broker-terminal">
      {open ? (
        <aside className="flex w-64 shrink-0 flex-col border-r border-ink-2" data-testid="terminal-watchlist">
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="label">{t('broker.watchlist.title')}</span>
            <button
              type="button" aria-expanded aria-label={t('broker.watchlist.hide')} title={t('broker.watchlist.hide')}
              onClick={() => setOpen(false)} className="h-6 w-6 rounded-sm text-caption text-fg-faint hover:bg-ink-2 hover:text-fg" data-testid="watchlist-toggle"
            >
              {CHEVRON_LEFT}
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{watchlist}</div>
        </aside>
      ) : (
        <div className="flex w-8 shrink-0 flex-col items-center border-r border-ink-2 pt-2">
          <button
            type="button" aria-expanded={false} aria-label={t('broker.watchlist.show')} title={t('broker.watchlist.show')}
            onClick={() => setOpen(true)} className="h-6 w-6 rounded-sm text-caption text-fg-faint hover:bg-ink-2 hover:text-fg" data-testid="watchlist-toggle"
          >
            {CHEVRON_RIGHT}
          </button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col" data-testid="terminal-chart">{chart}</div>
        <div
          role="separator" aria-orientation="horizontal" aria-label={t('broker.dock.resize')} aria-valuenow={dockH} tabIndex={0}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
          className="touch-none bg-ink-2 hover:bg-brass/40 focus-visible:bg-brass/40" style={{ height: SPLIT, cursor: 'ns-resize' }}
          data-testid="dock-split"
        />
        <div className="flex min-h-0 shrink-0 flex-col" style={{ height: dockH }} data-testid="terminal-dock">{dock}</div>
      </div>
      <aside className="flex min-h-0 w-[344px] shrink-0 flex-col overflow-hidden border-l border-ink-2 p-2" data-testid="terminal-ticket">{ticket}</aside>
    </div>
  );
}

/**
 * The phone-width Broker (spec 1.1, under 900 px): the chart takes 45% of the height, the dock (positions, orders, history,
 * asset, options, markets) sits below it and scrolls, and a bottom trade bar stays on screen. The full ticket is the sheet.
 */
export function TerminalNarrow({ chart, dock, tradeBar, sheet }: {
  chart: ReactNode;
  dock: ReactNode;
  tradeBar: ReactNode;
  sheet: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="broker-narrow">
      <div className="flex min-h-0 shrink-0 flex-col" style={{ flex: '0 0 45%' }} data-testid="terminal-chart">{chart}</div>
      <div className="flex min-h-0 flex-1 flex-col border-t border-ink-2" data-testid="terminal-dock">{dock}</div>
      <div className="shrink-0 border-t border-ink-2 bg-ink-1 p-2" data-testid="trade-bar-slot">{tradeBar}</div>
      {sheet}
    </div>
  );
}
