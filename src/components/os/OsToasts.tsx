'use client';

// Toasts (P2-085..P2-095, V:137-143): under the strip at the top right, or the top left when a Broker
// sits under the column (P2-088). At most three are drawn, the oldest leaving first. The store owns the
// hold timers (src/shell/holds.ts), so each notice expires on time even when it is queued behind others.
// A pointer or keyboard focus on a toast pauses its hold (P2-086). Warnings and margin calls stay until
// read (P2-090). A click opens the window the notice is about and dismisses it. In focus mode the
// notices it hides are removed from the queue, so they wait in the bell instead of coming back when focus
// mode ends (P2-069). Fills and world events are announced at once (P2-094).
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { isAppId } from '@/shell/apps';
import { TOAST_HOLD_MS, type ShellToast, allowedInFocus, isSticky, visibleToasts } from '@/shell/toasts';
import { Glyph, type GlyphName } from './glyphs';
import { focusOrOpen } from './shellStore';
import { phoneOpen } from './phoneStore';

const ICON: Record<string, GlyphName> = { gain: 'check', loss: 'close', warn: 'bell', info: 'bell', brass: 'bell' };

export function OsToasts({ focusMode, side, phone = false }: { focusMode: boolean; side: 'right' | 'left'; phone?: boolean }) {
  const toasts = useGame((s) => s.toasts);
  const dismissMany = useGame((s) => s.dismissToasts);
  // On the phone one notice at a time drops from the status bar (P2-095).
  // On the phone the trade sheet covers the bar the banner sits above, so notices wait (in the bell) while it is open.
  const sheetOpen = useGame((s) => s.tradeSheetOpen);
  const held = phone && sheetOpen;
  const shown = held ? [] : visibleToasts(toasts, focusMode).slice(0, phone ? 1 : undefined);
  // Notices past the drawn ones are not lost: the count opens the notification center behind the bell (UX 3).
  const queued = (focusMode ? toasts.filter(allowedInFocus) : toasts).length;
  const more = held ? 0 : queued - shown.length;
  const setInbox = useGame((s) => s.setInbox);

  useEffect(() => {
    if (!focusMode) return;
    const hidden = toasts.filter((x) => !allowedInFocus(x)).map((x) => x.id);
    if (hidden.length > 0) dismissMany(hidden);
  }, [focusMode, toasts, dismissMany]);

  return (
    <div className={`os-toasts${side === 'left' && !phone ? ' left' : ''}${phone ? ' phone' : ''}`} aria-live="polite" data-testid="os-toasts">
      {shown.map((x, i) => (
        <OsToast key={x.id} toast={x} n={i + 1} phone={phone} />
      ))}
      {more > 0 && (
        <button
          type="button"
          className="os-toast-more"
          data-testid="os-toast-more"
          onClick={() => setInbox(true)}
        >
          {t('shell.toast.more', { n: more })}
        </button>
      )}
    </div>
  );
}

function OsToast({ toast, n, phone }: { toast: ShellToast; n: number; phone: boolean }) {
  const dismiss = useGame((s) => s.dismissToast);
  const pause = useGame((s) => s.pauseToast);
  const resume = useGame((s) => s.resumeToast);
  // Pointer and keyboard focus each hold the toast on their own; the count runs when both have left.
  const hovered = useRef(false);
  const focused = useRef(false);
  const id = toast.id;
  // Phone: a slim banner that leaves after the hold (4 s) or on a swipe away (the store's hold does not run for a sticky one).
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; off: number; moved: boolean } | null>(null);
  useEffect(() => {
    if (!phone) return;
    const h = window.setTimeout(() => dismiss(id), TOAST_HOLD_MS);
    return () => window.clearTimeout(h);
  }, [phone, id, dismiss]);

  // A toast that leaves the column while it is held must release its holds, or it would never expire.
  useEffect(
    () => () => {
      if (hovered.current) resume(id);
      if (focused.current) resume(id);
      hovered.current = false;
      focused.current = false;
    },
    [id, resume],
  );

  const label =
    toast.kind === 'fill' ? t('shell.toast.fill')
      : toast.kind === 'margin' ? t('shell.toast.margin')
      : toast.kind === 'world' ? t('shell.toast.world')
      : toast.kind === 'close' ? t('shell.toast.close')
      : toast.kind === 'coach' ? t('shell.toast.coach')
      : undefined;
  const urgent = toast.kind === 'fill' || toast.kind === 'world';
  const sticky = isSticky(toast);
  // A fill is news about an order, not an error: a neutral check, and the buy or sell colour on the text only. Errors keep the red X.
  const fill = toast.kind === 'fill';
  const iconName: GlyphName = fill ? 'check' : (ICON[toast.tone] ?? 'bell');
  const iconColor = fill ? 'var(--color-fg-muted)' : toast.tone === 'loss' ? 'var(--color-loss)' : undefined;
  const textTone = fill ? (toast.tone === 'gain' ? 'text-gain' : toast.tone === 'loss' ? 'text-loss' : 'text-fg') : 'text-fg';

  // A click runs the notice's own action (a coach tip), or opens the window it names, and dismisses the toast.
  const open = (): void => {
    // a swipe that ended a drag is not a click
    if (drag.current?.moved) { drag.current = null; return; }
    if (toast.run) toast.run();
    // on the phone the window is an app of the phone stack (the desktop windows are not drawn there)
    else if (toast.app !== undefined && isAppId(toast.app)) { if (phone) phoneOpen(toast.app, {}); else focusOrOpen(toast.app); }
    dismiss(id);
  };

  const onDown = (e: PointerEvent<HTMLButtonElement>): void => {
    if (!phone) return;
    drag.current = { x: e.clientX, off: 0, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current;
    if (!phone || !d) return;
    d.off = e.clientX - d.x;
    if (Math.abs(d.off) > 6) d.moved = true;
    setDx(d.off);
  };
  const onUp = (): void => {
    const d = drag.current;
    if (!phone || !d) return;
    // a swipe past 60 px in either direction dismisses; a short one springs back (the click that follows a moved drag is ignored)
    if (Math.abs(d.off) > 60) dismiss(id);
    else setDx(0);
  };

  const hold = (ref: { current: boolean }, on: boolean): void => {
    if (ref.current === on) return;
    ref.current = on;
    if (on) pause(id);
    else resume(id);
  };

  return (
    <button
      type="button"
      className={`os-toast text-left${phone ? ' slim' : ''}`}
      style={phone && dx !== 0 ? { transform: `translateX(${dx}px)`, opacity: Math.max(0.3, 1 - Math.abs(dx) / 160) } : undefined}
      data-testid={`os-toast-${n}`}
      data-tone={toast.tone}
      data-kind={toast.kind ?? 'other'}
      data-sticky={sticky || undefined}
      role={urgent ? 'alert' : undefined}
      onClick={open}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerEnter={() => hold(hovered, true)}
      onPointerLeave={() => hold(hovered, false)}
      onFocus={() => hold(focused, true)}
      onBlur={() => hold(focused, false)}
    >
      <span className="os-toast-ic" style={{ color: iconColor }} aria-hidden>
        <Glyph name={iconName} size={14} />
      </span>
      <span className="os-toast-body">
        {label !== undefined && <span className="os-toast-t1 os-label">{label}</span>}
        <span className={`os-toast-t2 ${textTone}`}>{toast.text}</span>
      </span>
    </button>
  );
}
