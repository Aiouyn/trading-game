'use client';

import { useEffect } from 'react';
import { tickMs } from '@/game/clock';
import { WARMUP_DAYS, useGame } from '@/game/store';
import { DesktopOS } from './desktop/DesktopOS';

declare global {
  interface Window {
    /** test hook for Tape: advance ticks without waiting on the clock */
    __tg?: { advance: (n?: number) => void; pause: () => void; state: typeof useGame.getState };
  }
}

function useBootAndLoop() {
  const status = useGame((s) => s.status);
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    void useGame.getState().boot({ seed: p.get('seed') ?? undefined, fresh: p.has('fresh') });
    const save = () => useGame.getState().persist();
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
    };
  }, []);

  // Test hook and readiness flag appear only once the market has loaded, so waiting on either
  // never catches the "Opening the market" screen.
  useEffect(() => {
    const root = document.documentElement;
    if (status !== 'ready') {
      root.dataset.game = 'loading';
      delete window.__tg;
      return;
    }
    root.dataset.game = 'ready';
    window.__tg = {
      advance: (n = 1) => useGame.getState().tick(n),
      pause: () => { if (!useGame.getState().paused) useGame.getState().togglePause(); },
      state: useGame.getState,
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'ready' || paused) return;
    const id = setInterval(() => useGame.getState().tick(), tickMs(speed));
    return () => clearInterval(id);
  }, [status, speed, paused]);

  return status;
}

function Loading() {
  const progress = useGame((s) => s.loadProgress);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center" data-testid="loading">
      <h1 className="font-serif text-hero text-fg">Opening the market</h1>
      <p className="max-w-sm text-small text-fg-muted">
        Port Avalon has been trading for {WARMUP_DAYS} days before you arrive. Building that history now.
      </p>
      <div className="h-1 w-64 overflow-hidden rounded-chip bg-ink-3" role="progressbar" aria-label="Loading market history" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className="h-full bg-brass transition-[width] duration-[var(--dur-base)]" style={{ width: `${progress * 100}%` }} />
      </div>
    </main>
  );
}

export function Game() {
  const status = useBootAndLoop();
  if (status !== 'ready') return <Loading />;
  return <DesktopOS />;
}
