'use client';

// Toasts (P2-085..P2-087, simplified for step 1): top right under the strip, at most three, the oldest
// leaving first, each held 4 s and dismissed by a click. They read the game's toast list, so the same
// messages reach the old and the new layout.
import { useEffect } from 'react';
import { useGame } from '@/game/store';
import { Glyph, type GlyphName } from './glyphs';

const TOAST_HOLD_MS = 4000;

const ICON: Record<string, GlyphName> = { gain: 'check', loss: 'close', warn: 'bell', info: 'bell', brass: 'bell' };

export function OsToasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const shown = toasts.slice(-3);
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = toasts[0]!.id;
    const h = window.setTimeout(() => dismiss(id), TOAST_HOLD_MS);
    return () => window.clearTimeout(h);
  }, [toasts, dismiss]);
  return (
    <div className="os-toasts" aria-live="polite" data-testid="os-toasts">
      {shown.map((x, i) => (
        <button
          key={x.id}
          type="button"
          className="os-toast text-left"
          data-testid={`os-toast-${i + 1}`}
          onClick={() => dismiss(x.id)}
        >
          <span className="os-toast-ic" style={{ color: x.tone === 'loss' ? 'var(--color-loss)' : undefined }} aria-hidden>
            <Glyph name={ICON[x.tone] ?? 'bell'} size={14} />
          </span>
          <span className="os-toast-t2 text-fg">{x.text}</span>
        </button>
      ))}
    </div>
  );
}
