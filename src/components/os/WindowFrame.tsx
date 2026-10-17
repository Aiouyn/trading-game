'use client';

// One window (P2-011..P2-037): title bar with collapse, fill and close; a drag that snaps in the halves
// and full modes (V:39, C-07), follows the pointer live only in the full mode and commits the snap or
// the free rect on release; edge resize with the minimum sizes (P2-031, P2-032); the close prompt when a
// Broker has an order pending (P2-030). Every change goes through the reducer, so the window rules live
// in one place.
import { type PointerEvent as ReactPointerEvent, useEffect, useId, useRef, useState } from 'react';
import { t } from '@/i18n';
import { APPS } from '@/shell/apps';
import type { LayoutMode, Rect, Size } from '@/shell/geometry';
import type { Win } from '@/shell/wm';
import { APP_GLYPH } from './appMap';
import { AppBody } from './appViews';
import { Glyph } from './glyphs';
import { type Edge, type SnapTarget, clampDelta, resizeRect, snapFits, snapTargetAt, targetRect } from './windowMath';
import { useMoreBelow } from './scrollMore';
import { WIN_OPEN_MS, closeWindow, dispatchWm, useCloseAsk, useFocusHint } from './shellStore';

const EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
/** The drop-zone outline sits above every window (their z is 2 + index), so a drag always previews the snap (UX stage 6, item 4). */
const SNAP_Z = 40;

/** Window ids already drawn this session. Only a first draw opens with the open animation (P2-215), so a
 *  workspace switch does not replay it. OsRoot drops an id once its window is gone (pruneDrawn). */
const drawn = new Set<string>();

/** Forgets the drawn state of windows that no longer exist, so a reopened window animates again. */
export function pruneDrawn(liveIds: readonly string[]): void {
  const live = new Set(liveIds);
  for (const id of [...drawn]) if (!live.has(id)) drawn.delete(id);
}

export interface WindowFrameProps {
  win: Win;
  /** The projected rect, relative to the work area (what the shell shows now). */
  rect: Rect;
  active: boolean;
  /** Stacking order: the frame's z-index. Raising a window changes this, never the DOM order. */
  z: number;
  /** The layout mode. Halves (1000-1199 px) snap to the sides and the top; free placement and resize need full (C-26). */
  mode: LayoutMode;
  wa: Size;
  gutter: number;
}

export function WindowFrame({ win, rect, active, z, mode, wa, gutter }: WindowFrameProps) {
  const def = APPS[win.app];
  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useMoreBelow(frameRef, bodyRef);
  const titleId = `win-title-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const [live, setLive] = useState<Rect | null>(null);
  const [target, setTarget] = useState<SnapTarget | null>(null);
  // Read once at mount (the state initializer does not write, so StrictMode's second call agrees with the first).
  const [opening, setOpening] = useState(() => !drawn.has(win.id));
  useEffect(() => {
    drawn.add(win.id);
  }, [win.id]);
  const askId = useCloseAsk((s) => s.id);
  const confirm = askId === win.id;
  const free = mode === 'full';
  const snapping = mode === 'full' || mode === 'halves';
  const shown = live ?? rect;
  const name = t(def.titleKey);
  const sub = win.app === 'broker' ? win.props.ticker : win.app === 'research' ? win.props.fileId : undefined;
  const hint = useFocusHint((s) => s.id);

  useEffect(() => {
    if (!opening) return;
    const h = window.setTimeout(() => setOpening(false), WIN_OPEN_MS);
    return () => window.clearTimeout(h);
  }, [opening]);

  // A keyboard, shelf or launcher open moves DOM focus into the window it opened (P2-235).
  useEffect(() => {
    if (hint !== win.id || !active) return;
    frameRef.current?.focus({ preventScroll: true });
    useFocusHint.setState({ id: null });
  }, [hint, active, win.id]);

  const focusWin = (): void => {
    if (!active) dispatchWm({ type: 'focus', id: win.id });
  };

  const onTitleDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    focusWin();
    const frame = frameRef.current;
    const box = frame?.parentElement?.getBoundingClientRect();
    if (!snapping || !frame || !box) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let dx = 0;
    let dy = 0;
    let cur: SnapTarget | null = null;
    const move = (ev: PointerEvent): void => {
      // the live follow stays inside the work area: a window dragged past an edge stops at it (UX stage 6, item 4)
      const c = clampDelta(rect, ev.clientX - sx, ev.clientY - sy, wa);
      dx = c.dx;
      dy = c.dy;
      if (free) frame.style.transform = `translate(${dx}px, ${dy}px)`;
      // A snap the app cannot fit (the Broker in a 403 px quarter) is not offered: no preview, and release moves freely.
      const raw = snapTargetAt(ev.clientX - box.left, ev.clientY - box.top, box.width, box.height, mode);
      const next = raw !== null && snapFits(raw, def, wa, gutter) ? raw : null;
      if (next !== cur) {
        cur = next;
        setTarget(next);
      }
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      frame.style.transform = '';
      setTarget(null);
      if (cur !== null) {
        if (cur === 'fill') {
          if (!win.filled) dispatchWm({ type: 'fill', id: win.id });
        } else {
          dispatchWm({ type: 'snap', id: win.id, slot: cur });
        }
      } else if (free && Math.abs(dx) + Math.abs(dy) > 1) {
        dispatchWm({ type: 'move', id: win.id, rect: { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h } });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startResize = (e: ReactPointerEvent<HTMLDivElement>, edge: Edge): void => {
    if (!free || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    focusWin();
    const sx = e.clientX;
    const sy = e.clientY;
    let latest = rect;
    const move = (ev: PointerEvent): void => {
      latest = resizeRect(rect, edge, ev.clientX - sx, ev.clientY - sy, def, wa);
      setLive(latest);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLive(null);
      const changed = latest.x !== rect.x || latest.y !== rect.y || latest.w !== rect.w || latest.h !== rect.h;
      if (changed) dispatchWm({ type: 'resize', id: win.id, rect: latest });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const close = (): void => closeWindow(win.id);

  const closeAnyway = (): void => closeWindow(win.id, true);

  const keepOpen = (): void => useCloseAsk.setState({ id: null });

  // The drop zone is drawn where the window will land. targetRect gives x, y, w, h; the CSS needs left, top, width and
  // height (a Rect spread into style drew a 2 px square, UX stage 6, item 4).
  const dropAt = target === null ? null : targetRect(target, wa, gutter);
  const preview = dropAt !== null && (
    <div
      className="os-snap"
      data-testid="snap-preview"
      aria-hidden
      style={{ left: dropAt.x, top: dropAt.y, width: dropAt.w, height: dropAt.h, position: 'absolute', zIndex: SNAP_Z }}
    />
  );

  return (
    <>
      {preview}
      <div
        ref={frameRef}
        className={`os-win${active ? ' active' : ''}${opening ? ' opening' : ''}`}
        role="dialog"
        aria-labelledby={titleId}
        data-testid={`win-${win.id}`}
        data-app={win.app}
        tabIndex={-1}
        style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h, zIndex: z }}
        onPointerDown={focusWin}
      >
        <div
          className="os-tb select-none"
          onPointerDown={onTitleDown}
          // Double-click on the title bar maximizes, and restores when already filled (the Fill toggle).
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            dispatchWm({ type: 'fill', id: win.id });
          }}
          data-testid={`win-${win.id}-title`}
        >
          <span className="os-tb-gl"><Glyph name={APP_GLYPH[win.app]} size={15} /></span>
          <span id={titleId} className="os-tb-nm">{name}</span>
          {sub !== undefined && <span className="os-tb-sub">{sub}</span>}
          <span className="os-ctl">
            <button
              type="button"
              className="os-ctl-btn"
              aria-label={t('shell.win.collapse')}
              title={t('shell.win.collapse')}
              data-testid={`win-${win.id}-collapse`}
              onClick={() => dispatchWm({ type: 'collapse', id: win.id })}
            >
              <Glyph name="collapse" size={12} />
            </button>
            <button
              type="button"
              className="os-ctl-btn"
              aria-label={t('shell.win.fill')}
              title={t('shell.win.fill')}
              data-testid={`win-${win.id}-fill`}
              onClick={() => dispatchWm({ type: 'fill', id: win.id })}
            >
              <Glyph name="fill" size={12} />
            </button>
            <button
              type="button"
              className="os-ctl-btn"
              aria-label={t('shell.win.close')}
              title={t('shell.win.close')}
              data-testid={`win-${win.id}-close`}
              onClick={close}
            >
              <Glyph name="close" size={12} />
            </button>
          </span>
        </div>
        {confirm && (
          <div className="os-confirm" role="alertdialog" aria-label={name} data-testid={`win-${win.id}-confirm`}>
            <p className="text-small text-fg">{t('shell.close.confirm', { ticker: win.props.ticker ?? '' })}</p>
            <div className="flex gap-2">
              <button type="button" className="os-tool" onClick={closeAnyway} data-testid={`win-${win.id}-confirm-yes`}>
                {t('shell.close.yes')}
              </button>
              <button type="button" className="os-tool" onClick={keepOpen}>
                {t('shell.close.no')}
              </button>
            </div>
          </div>
        )}
        <div className="os-win-body" ref={bodyRef}>
          <AppBody win={win} size={{ w: shown.w, h: shown.h }} active={active} />
        </div>
        {free && EDGES.map((e) => (
          <div
            key={e}
            className={`os-rz os-rz-${e}`}
            data-testid={`win-${win.id}-resize-${e}`}
            aria-hidden
            onPointerDown={(ev) => startResize(ev, e)}
          />
        ))}
      </div>
    </>
  );
}
