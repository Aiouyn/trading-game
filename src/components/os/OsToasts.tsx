'use client';

// Toasts (P2-085..P2-095, V:137-143): under the strip at the top right, or the top left when a Broker
// sits under the column (P2-088). At most three, the oldest leaving first. Each holds 4 s, pauses while
// the pointer or focus is on it, and stays until read when it is a warning or a margin call (P2-090).
// A click opens the window the notice is about and dismisses it. Focus mode shows only fills, margin
// warnings and world events (P2-069). Fills and world events are announced at once (P2-094).
import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { isAppId } from '@/shell/apps';
import { TOAST_HOLD_MS, type ShellToast, isSticky, visibleToasts } from '@/shell/toasts';
import { Glyph, type GlyphName } from './glyphs';
import { focusOrOpen } from './shellStore';

const ICON: Record<string, GlyphName> = { gain: 'check', loss: 'close', warn: 'bell', info: 'bell', brass: 'bell' };

export function OsToasts({ focusMode, side }: { focusMode: boolean; side: 'right' | 'left' }) {
  const toasts = useGame((s) => s.toasts);
  const shown = visibleToasts(toasts, focusMode);
  return (
    <div className={`os-toasts${side === 'left' ? ' left' : ''}`} aria-live="polite" data-testid="os-toasts">
      {shown.map((x, i) => (
        <OsToast key={x.id} toast={x} n={i + 1} />
      ))}
    </div>
  );
}

function OsToast({ toast, n }: { toast: ShellToast; n: number }) {
  const dismiss = useGame((s) => s.dismissToast);
  const [paused, setPaused] = useState(false);
  const sticky = isSticky(toast);

  // The hold restarts from the full time when the pointer or focus leaves: simple, and never shorter than 4 s.
  useEffect(() => {
    if (sticky || paused) return;
    const h = window.setTimeout(() => dismiss(toast.id), TOAST_HOLD_MS);
    return () => window.clearTimeout(h);
  }, [toast.id, sticky, paused, dismiss]);

  const label =
    toast.kind === 'fill' ? t('shell.toast.fill') : toast.kind === 'margin' ? t('shell.toast.margin') : toast.kind === 'world' ? t('shell.toast.world') : undefined;
  const urgent = toast.kind === 'fill' || toast.kind === 'world';

  const open = (): void => {
    if (toast.app !== undefined && isAppId(toast.app)) focusOrOpen(toast.app);
    dismiss(toast.id);
  };

  return (
    <button
      type="button"
      className="os-toast text-left"
      data-testid={`os-toast-${n}`}
      data-tone={toast.tone}
      data-kind={toast.kind ?? 'other'}
      role={urgent ? 'alert' : undefined}
      onClick={open}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="os-toast-ic" style={{ color: toast.tone === 'loss' ? 'var(--color-loss)' : undefined }} aria-hidden>
        <Glyph name={ICON[toast.tone] ?? 'bell'} size={14} />
      </span>
      <span className="os-toast-body">
        {label !== undefined && <span className="os-toast-t1 os-label">{label}</span>}
        <span className="os-toast-t2 text-fg">{toast.text}</span>
      </span>
    </button>
  );
}
