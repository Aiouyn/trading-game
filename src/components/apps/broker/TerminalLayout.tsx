'use client';

import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';

/** The dock's height at the start, and the least it may shrink to (spec 1.1: resizable, default 220 px). */
export const DOCK_DEFAULT = 220;
/** Below this window height the dock starts shorter, so the chart keeps its room (UX stage 6, weakness 12: 1280 x 720). */
export const DOCK_SHORT_H = 800;
export const DOCK_SHORT = 140;
const DOCK_MIN = 120;
/** The chart keeps at least this much height when the dock grows. */
const CHART_MIN = 180;
/** The chart keeps at least this share of the body's height (UX stage 6): the dock takes at most the rest. */
export const CHART_SHARE_MIN = 0.45;
const SPLIT = 6;
/**
 * The watchlist column opens by default from this window width. Below it the column starts as an icon rail, so the chart and
 * the ticket keep their width (a Broker beside a side panel is about 1000 px wide).
 */
export const WATCHLIST_OPEN_W = 1100;
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
  // The user's own choice holds until the window crosses the width again: the default follows the window's width. The choice
  // is kept with the default it was made under, so a crossing drops it without an effect.
  const [choice, setChoice] = useState<{ open: boolean; under: boolean } | null>(null);
  const open = choice && choice.under === watchlistOpen ? choice.open : watchlistOpen;
  const [dockH, setDockH] = useState(DOCK_DEFAULT);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  // A short screen starts the dock at 140 px (set after mount, so the server markup and the first paint agree).
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (window.innerHeight < DOCK_SHORT_H) setDockH(DOCK_SHORT);
    }, 0);
    return () => window.clearTimeout(h);
  }, []);
  const clamp = (h: number) => {
    const body0 = body.current?.clientHeight ?? DOCK_DEFAULT + CHART_MIN;
    const max = Math.min(body0 - CHART_MIN - SPLIT, body0 * (1 - CHART_SHARE_MIN) - SPLIT);
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
              onClick={() => setChoice({ open: false, under: watchlistOpen })} className="h-6 w-6 rounded-sm text-caption text-fg-faint hover:bg-ink-2 hover:text-fg" data-testid="watchlist-toggle"
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
            onClick={() => setChoice({ open: true, under: watchlistOpen })} className="h-6 w-6 rounded-sm text-caption text-fg-faint hover:bg-ink-2 hover:text-fg" data-testid="watchlist-toggle"
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
          className="flex touch-none items-center justify-center bg-ink-2 hover:bg-brass/40 focus-visible:bg-brass/40" style={{ height: SPLIT, cursor: 'ns-resize' }}
          data-testid="dock-split"
        >
          {/* the drag handle: a short grip, so the splitter reads as something to pull */}
          <span aria-hidden className="block h-[3px] w-10 rounded-full bg-fg-faint/60" data-testid="dock-grip" />
        </div>
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
  const slot = useRef<HTMLDivElement>(null);
  // The phone's toast banner sits just above this bar (os-phone.css reads --phone-trade-h), so the bar publishes its height.
  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    const put = () => document.documentElement.style.setProperty('--phone-trade-h', `${el.offsetHeight}px`);
    put();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(put);
    ro?.observe(el);
    return () => { ro?.disconnect(); document.documentElement.style.removeProperty('--phone-trade-h'); };
  }, []);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="broker-narrow">
      <div className="flex min-h-0 shrink-0 flex-col" style={{ flex: '0 0 45%' }} data-testid="terminal-chart">{chart}</div>
      <div className="flex min-h-0 flex-1 flex-col border-t border-ink-2" data-testid="terminal-dock">{dock}</div>
      <div ref={slot} className="shrink-0 border-t border-ink-2 bg-ink-1 p-2" data-testid="trade-bar-slot">{tradeBar}</div>
      {sheet}
    </div>
  );
}
