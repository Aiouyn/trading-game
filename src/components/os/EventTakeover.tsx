'use client';

// The world event takeover (velvet-world-events.md section 2): once per major onset, a hairline drops from the top, the screen
// dims and the brass accents go grey, then the engine's headline and the GX move in mono. Skippable from one second in; it
// ends by itself after three. The rules are in takeoverRules.ts. The queue lives in a small store driven by the game store's
// frames (not by React state), so a due takeover waits for a quiet moment without re-rendering the desk. The screen renders
// through a portal to the body, so the grey accents (a class on the body) reach the desk and not the takeover's own button.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { signedPct, tone, toneText } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import type { WorldEventFrame } from '@/world/view';
import { openFromShell } from './openApp';
import { useEventPanel } from './EventBanner';
import { headlineText } from './eventText';
import {
  TAKEOVER_END_MS, TAKEOVER_SKIP_MS, takeoverDue, takeoverGate,
} from './takeoverRules';

const POLL_MS = 250;

/** Events whose takeover already showed or was given up this session (a takeover is once per event). */
const shown = new Set<string>();
/** When the last full-screen moment began (ms since epoch), across mounts. */
let lastShownAt = -Infinity;

interface TakeoverState {
  pending: { ev: WorldEventFrame; since: number } | null;
  active: { ev: WorldEventFrame; startedAt: number } | null;
  skippable: boolean;
}

export const useTakeover = create<TakeoverState>(() => ({ pending: null, active: null, skippable: false }));

let pollId: number | null = null;
let skipId: number | null = null;
let endId: number | null = null;

function stopPolling(): void {
  if (pollId !== null) window.clearInterval(pollId);
  pollId = null;
}

function clearTimers(): void {
  stopPolling();
  if (skipId !== null) window.clearTimeout(skipId);
  if (endId !== null) window.clearTimeout(endId);
  skipId = endId = null;
}

/** The queue's clock: show the due takeover at a quiet moment, or give it up after ten seconds. */
function poll(): void {
  const st = useTakeover.getState();
  if (!st.pending) { stopPolling(); return; }
  const now = Date.now();
  const s = useGame.getState();
  const busy = s.rankUp !== null || s.tradeSheetOpen;
  const gate = takeoverGate(now - st.pending.since, busy, now - lastShownAt);
  if (gate === 'wait') return;
  stopPolling();
  if (gate === 'skip') {
    useTakeover.setState({ pending: null });
    return;
  }
  lastShownAt = now;
  useTakeover.setState({ pending: null, active: { ev: st.pending.ev, startedAt: now }, skippable: false });
  skipId = window.setTimeout(() => useTakeover.setState({ skippable: true }), TAKEOVER_SKIP_MS);
  endId = window.setTimeout(() => closeTakeover(), TAKEOVER_END_MS);
}

/** Queues a due takeover (once per event) and starts the quiet-moment clock. */
function offer(ev: WorldEventFrame | null | undefined): void {
  if (!ev || !takeoverDue(ev, shown)) return;
  shown.add(ev.id);
  useTakeover.setState({ pending: { ev, since: Date.now() } });
  if (pollId === null) pollId = window.setInterval(poll, POLL_MS);
  poll();
}

/** Closes the takeover now (Close, See my positions, or the three-second end). The banner stays. */
export function closeTakeover(): void {
  clearTimers();
  useTakeover.setState({ active: null, skippable: false });
}

/** Watches the game's frames: a due major is queued. Returns the unsubscribe. */
function watch(): () => void {
  offer(useGame.getState().frame?.worldEvent);
  return useGame.subscribe((s, prev) => {
    if (s.frame?.worldEvent !== prev.frame?.worldEvent) offer(s.frame?.worldEvent);
  });
}

export function EventTakeover() {
  const active = useTakeover((s) => s.active);
  const skippable = useTakeover((s) => s.skippable);

  useEffect(() => watch(), []);

  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // the desk's brass accents go grey while the takeover runs (not under reduced motion)
  useEffect(() => {
    if (!active || reduced) return;
    document.body.classList.add('os-takeover-on');
    return () => document.body.classList.remove('os-takeover-on');
  }, [active, reduced]);

  // a light double haptic at the headline, on the phone only (the vibrate call is a no-op elsewhere)
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      try { navigator.vibrate?.([12, 80, 12]); } catch { /* not supported: nothing to do */ }
    }, 900);
    return () => window.clearTimeout(id);
  }, [active]);

  // a takeover still queued or running when the desk goes away must not keep its timers
  useEffect(() => () => clearTimers(), []);

  if (!active) return null;
  const ev = active.ev;
  const seePositions = () => {
    useEventPanel.setState({ open: false });
    closeTakeover();
    openFromShell('portfolio');
  };
  const gx = ev.gxToday;
  return createPortal(
    <div className="os-takeover" data-testid="event-takeover" data-kind={ev.kind} data-state="live" data-reduced={reduced ? '' : undefined} role="alertdialog" aria-modal="true" aria-labelledby="event-takeover-headline">
      <div className="os-takeover-scrim" aria-hidden />
      {!reduced && <div className="os-takeover-line" aria-hidden />}
      <div className="os-takeover-card">
        <div className="label">{t('event.takeover.label')}</div>
        <h2 id="event-takeover-headline" className="os-takeover-headline" data-testid="event-headline">{headlineText(ev)}</h2>
        {gx !== null && (
          <p className={`num os-takeover-gx ${toneText[tone(gx)]}`} data-testid="event-gx">
            {t('event.takeover.gx', { move: signedPct(gx) })}
          </p>
        )}
        <p className="os-takeover-line-text text-fg-muted">{t('event.takeover.line')}</p>
        <div className="os-takeover-actions">
          <button type="button" className="os-takeover-cta" data-testid="event-positions" onClick={seePositions}>
            {t('event.takeover.positions')}
          </button>
          <button type="button" className="os-takeover-close" data-testid="event-close" disabled={!skippable} aria-disabled={!skippable} onClick={closeTakeover}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
