'use client';

import { useEffect } from 'react';
import { tickMs } from '@/game/clock';
import { WARMUP_DAYS, useGame } from '@/game/store';
import { useIsDesktop, useIsPhone } from '@/game/useMedia';
import { PhoneHeader, TopBar } from './Header';
import { ChartCard, Positions, TickerStrip, Watchlist } from './Market';
import { OpenOrders, OrderPad } from './OrderPad';
import { PortfolioView } from './Portfolio';
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
  const isPhone = useIsPhone();
  const isDesktop = useIsDesktop();
  const selected = useGame((s) => s.selected);
  const setSheet = useGame((s) => s.setTradeSheet);
  const tradable = useGame((s) => !!s.world?.config.assets.some((a) => a.id === s.selected));
  const tab = useGame((s) => s.tab);

  if (status !== 'ready') return <Loading />;

  if (isPhone) {
    return (
      <div className="flex w-full flex-1 flex-col" data-layout="phone">
        <PhoneHeader />
        {/* bottom padding = tab bar + 16 gap + 52 Trade button + 24, so the last row scrolls clear */}
        <main className="flex flex-col gap-4 px-4 pt-4 pb-[calc(var(--tabbar-h)+92px)]" data-testid="phone-main" data-tab={tab}>
          {tab === 'portfolio' ? (
            <PortfolioView phone />
          ) : (
            <>
              <TickerStrip />
              <ChartCard phone />
              <Positions phone />
              <OpenOrders />
            </>
          )}
        </main>
        {/* ink fade behind the floating Trade button (mock §4) */}
        <div className="pointer-events-none fixed inset-x-0 bottom-[var(--tabbar-h)] z-10 h-24 bg-linear-to-t from-ink-0 from-40% to-transparent" aria-hidden data-testid="trade-fade" />
        <div className="fixed inset-x-4 bottom-[calc(var(--tabbar-h)+16px)] z-10">
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
    <div className="flex h-dvh w-full overflow-hidden" data-layout={isDesktop ? 'desktop' : 'tablet'}>
      <NavRail />
      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        <TopBar />
        {/* Only the area between the top bar and the Wire scrolls, so nothing ever renders under the Wire. */}
        {isDesktop ? (
          <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_var(--side-w)] grid-rows-[minmax(0,1fr)] gap-4 p-4">
            <div key={tab} className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto" data-testid="main-column" data-tab={tab}>
              {tab === 'portfolio' ? <PortfolioView /> : <><ChartCard /><Positions /><OpenOrders /></>}
            </div>
            <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto" data-testid="side-column">
              <div className="shrink-0"><OrderPad /></div>
              <div className="flex min-h-[176px] flex-1 flex-col [&>section]:flex-1">
                <Watchlist />
              </div>
            </aside>
          </main>
        ) : (
          <main key={tab} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-testid="main-column" data-tab={tab}>
            {tab === 'portfolio' ? <PortfolioView /> : <><ChartCard /><Positions /><OpenOrders /></>}
            <aside className="grid grid-cols-2 items-start gap-4">
              <OrderPad />
              <div className="[&>section]:max-h-[640px]">
                <Watchlist />
              </div>
            </aside>
          </main>
        )}
        <WireStrip />
      </div>
      <Toasts />
    </div>
  );
}
