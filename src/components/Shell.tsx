'use client';

import { useEffect, useRef } from 'react';
import { useGame } from '@/game/store';
import type { WireItem } from '@/game/wire';
import { OrderPad } from './OrderPad';

const TONE: Record<WireItem['tone'], string> = {
  gain: 'text-gain', loss: 'text-loss', warn: 'text-warn', info: 'text-info', brass: 'text-brass',
};

type IconName = 'market' | 'portfolio' | 'estate' | 'wire' | 'more';

function Icon({ name }: { name: IconName }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'market':
      return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l3-4 3 2 5-6" /></svg>;
    case 'portfolio':
      return <svg {...common}><rect x="3.5" y="7" width="17" height="12" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3.5 12h17" /></svg>;
    case 'estate':
      return <svg {...common}><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>;
    case 'wire':
      return <svg {...common}><path d="M5 5h11a3 3 0 0 1 3 3v11H8a3 3 0 0 1-3-3Z" /><path d="M9 9h6M9 12.5h6M9 16h3" /></svg>;
    case 'more':
      return <svg {...common}><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></svg>;
  }
}

const NAV: { id: IconName; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'estate', label: 'Estate' },
  { id: 'wire', label: 'Wire' },
  { id: 'more', label: 'More' },
];

/** Desktop and tablet rail. Only Market exists in Phase 0; the rest are placeholders. */
export function NavRail() {
  const newGame = useGame((s) => s.newGame);
  return (
    <nav aria-label="Main" className="flex h-dvh w-[var(--rail-w)] shrink-0 flex-col items-center gap-1 border-r border-ink-2 py-4">
      <div className="mb-4 font-serif text-title text-brass" aria-hidden>T</div>
      {NAV.map((n) => {
        const on = n.id === 'market';
        return (
          <button
            key={n.id}
            type="button"
            aria-current={on ? 'page' : undefined}
            aria-disabled={!on}
            title={on ? n.label : `${n.label} (coming later)`}
            className={`flex w-14 flex-col items-center gap-1 rounded-md py-2 text-micro tracking-normal ${on ? 'bg-ink-2 text-fg' : 'cursor-default text-fg-disabled'}`}
          >
            <Icon name={n.id} />
            {n.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => { if (window.confirm('Start a new game? Your current portfolio will be lost.')) void newGame(); }}
        className="mt-auto w-14 rounded-md py-2 text-micro tracking-normal text-fg-faint hover:text-fg-muted"
        data-testid="new-game"
      >
        New game
      </button>
    </nav>
  );
}

export function TabBar() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex h-[var(--tabbar-h)] border-t border-ink-2 bg-ink-0 pb-[env(safe-area-inset-bottom)]">
      {NAV.map((n) => {
        const on = n.id === 'market';
        return (
          <button
            key={n.id}
            type="button"
            aria-current={on ? 'page' : undefined}
            aria-disabled={!on}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-micro tracking-normal ${on ? 'text-brass-hi' : 'text-fg-disabled'}`}
          >
            <Icon name={n.id} />
            {n.label}
          </button>
        );
      })}
    </nav>
  );
}

export function WireStrip() {
  const wire = useGame((s) => s.wire);
  return (
    <footer className="flex h-[34px] shrink-0 items-center gap-3 overflow-hidden border-t border-ink-2 bg-ink-0 px-4 text-caption" data-testid="wire-strip">
      <span className="label shrink-0 text-brass">Wire</span>
      {wire.length === 0 ? (
        <span className="text-fg-faint">Quiet markets. Headlines appear here when something real happens.</span>
      ) : (
        <ul className="flex min-w-0 gap-6 whitespace-nowrap">
          {wire.slice(0, 8).map((w) => (
            <li key={w.id} className="flex items-baseline gap-2">
              <span className="num text-fg-faint">{w.time}</span>
              <span className={`num font-semibold ${TONE[w.tone]}`}>{w.tag}</span>
              <span className="text-fg-muted">{w.text}</span>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}

export function TradeSheet() {
  const open = useGame((s) => s.tradeSheetOpen);
  const setOpen = useGame((s) => s.setTradeSheet);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end">
      <button type="button" aria-label="Close trade" className="absolute inset-0 bg-ink-0/70" onClick={() => setOpen(false)} />
      <div role="dialog" aria-modal="true" aria-label="Trade" className="relative max-h-[88dvh] overflow-y-auto rounded-t-lg border-t border-ink-3 bg-ink-1 pb-[env(safe-area-inset-bottom)] shadow-sheet">
        <div className="sticky top-0 z-10 flex justify-center bg-ink-1 pt-2">
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close trade" className="flex h-11 w-24 items-start justify-center">
            <span className="mt-1 h-1 w-10 rounded-chip bg-ink-3" />
          </button>
        </div>
        <div className="[&>section]:rounded-none [&>section]:border-0">
          <OrderPad />
        </div>
      </div>
    </div>
  );
}

export function Toasts({ phone = false }: { phone?: boolean }) {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = toasts[0]!.id;
    const t = setTimeout(() => dismiss(id), 4000);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed z-40 flex flex-col gap-2 ${
        phone ? 'inset-x-4 bottom-[calc(var(--tabbar-h)+76px)]' : 'top-[calc(var(--topbar-h)+12px)] right-6 w-80 items-end'
      }`}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex w-full overflow-hidden rounded-md border border-ink-3 bg-ink-1 ${phone ? '' : 'md:w-80'}`}
          data-testid="toast"
        >
          <span className={`w-1 shrink-0 ${t.tone === 'gain' ? 'bg-gain' : 'bg-loss'}`} aria-hidden />
          <span className="num px-4 py-3 text-small text-fg">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

