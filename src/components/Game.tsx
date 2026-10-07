'use client';

import { useEffect } from 'react';
import { tickMs } from '@/game/clock';
import { WARMUP_DAYS, useGame } from '@/game/store';
import { useIsDesktop, useIsPhone } from '@/game/useMedia';
import { PhoneHeader, TopBar } from './Header';
import { ChartCard, Positions, TickerStrip, Watchlist } from './Market';
import { OpenOrders, OrderPad } from './OrderPad';
import { NavRail, TabBar, Toasts, TradeSheet, WireStrip } from './Shell';

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
    window.__tg = {
      advance: (n = 1) => useGame.getState().tick(n),
      pause: () => { if (!useGame.getState().paused) useGame.getState().togglePause(); },
      state: useGame.getState,
    };
    const save = () => useGame.getState().persist();
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
    };
  }, []);

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
  const isPhone = useIsPhone();
  const isDesktop = useIsDesktop();
  const selected = useGame((s) => s.selected);
  const setSheet = useGame((s) => s.setTradeSheet);
  const tradable = useGame((s) => !!s.world?.config.assets.some((a) => a.id === s.selected));

  if (status !== 'ready') return <Loading />;

  if (isPhone) {
    return (
      <div className="flex w-full flex-1 flex-col" data-layout="phone">
        <PhoneHeader />
        <main className="flex flex-col gap-4 px-4 pt-4 pb-[calc(var(--tabbar-h)+88px)]">
          <TickerStrip />
          <ChartCard phone />
          <Positions phone />
          <OpenOrders />
        </main>
        <div className="fixed inset-x-4 bottom-[calc(var(--tabbar-h)+12px)] z-10">
          <button type="button" onClick={() => setSheet(true)} className="btn-brass h-13 w-full text-body" data-testid="open-trade">
            {tradable ? `Trade ${selected}` : 'Trade'}
          </button>
        </div>
        <TabBar />
        <TradeSheet />
        <Toasts phone />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1" data-layout={isDesktop ? 'desktop' : 'tablet'}>
      <NavRail />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <TopBar />
        <main className={`grid flex-1 content-start gap-4 p-4 ${isDesktop ? 'grid-cols-[minmax(0,1fr)_var(--side-w)]' : 'grid-cols-1'}`}>
          <div className="flex min-w-0 flex-col gap-4">
            <ChartCard />
            <Positions />
            <OpenOrders />
          </div>
          <aside className={isDesktop ? 'flex min-w-0 flex-col gap-4' : 'grid grid-cols-2 items-start gap-4'}>
            <OrderPad />
            <div className={isDesktop ? 'max-h-[520px] min-h-0 [&>section]:max-h-[520px]' : '[&>section]:max-h-[640px]'}>
              <Watchlist />
            </div>
          </aside>
        </main>
        <WireStrip />
      </div>
      <Toasts />
    </div>
  );
}
