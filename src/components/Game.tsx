'use client';

import { useEffect } from 'react';
import { useGame, type Screen } from '@/game/store';
import { useIsDesktop, useIsPhone } from '@/game/useMedia';
import { CourtView } from './Court';
import { EmpireView } from './Empire';
import { EstateView } from './Estate';
import { PhoneHeader, TopBar } from './Header';
import { LabView } from './Lab';
import { AssetPanel, ChartCard, OpenOrders, Positions, TickerStrip, Watchlist } from './Market';
import { OrderPad } from './OrderPad';
import { Coach, ConnectionBanner, DigestModal, RankUpOverlay } from './Overlays';
import { PortfolioView } from './Portfolio';
import { ProfileView } from './Profile';
import { SecurityView } from './Security';
import { ChatDrawer, InboxDrawer, MoreSheet, NavRail, TabBar, Toasts, TradeSheet, WireStrip } from './Shell';
import { ProfileModal, SocialView } from './Social';
import { Calendar, WireView } from './Wire';
import { Loading, Welcome } from './Welcome';

declare global {
  interface Window {
    /** test hook: read the store */
    __tg?: { state: typeof useGame.getState };
  }
}

function useBoot() {
  const status = useGame((s) => s.status);
  useEffect(() => { useGame.getState().boot(); }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.game = status === 'ready' ? 'ready' : status;
    if (status === 'ready') window.__tg = { state: useGame.getState };
  }, [status]);
  return status;
}

function MarketScreen({ phone }: { phone: boolean }) {
  if (phone) {
    return (
      <>
        <TickerStrip />
        <ChartCard phone />
        <AssetPanel />
        <Positions phone />
        <OpenOrders />
      </>
    );
  }
  return (
    <>
      <ChartCard />
      <div className="grid gap-4 2xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Positions />
          <OpenOrders />
        </div>
        <div className="flex flex-col gap-4">
          <AssetPanel />
          <div className="hidden 2xl:block"><Calendar /></div>
        </div>
      </div>
    </>
  );
}

function ScreenView({ screen, phone }: { screen: Screen; phone: boolean }) {
  switch (screen) {
    case 'market': return <MarketScreen phone={phone} />;
    case 'portfolio': return <PortfolioView phone={phone} />;
    case 'empire': return <EmpireView />;
    case 'estate': return <EstateView />;
    case 'lab': return <LabView />;
    case 'security': return <SecurityView />;
    case 'court': return <CourtView />;
    case 'social': return <SocialView />;
    case 'wire': return <WireView />;
    case 'profile': return <ProfileView />;
  }
}

/** Screens that keep the order pad and watchlist beside them on desktop. */
const TRADING: Screen[] = ['market', 'portfolio'];

export function Game() {
  const status = useBoot();
  const isPhone = useIsPhone();
  const isDesktop = useIsDesktop();
  const screen = useGame((s) => s.screen);
  const selected = useGame((s) => s.selected);
  const setSheet = useGame((s) => s.setTradeSheet);
  const hasMe = useGame((s) => !!s.me && !!s.world);

  if (status === 'welcome') return <Welcome />;
  if (!hasMe) return <Loading />;

  const overlays = (
    <>
      <RankUpOverlay />
      <DigestModal />
      <InboxDrawer />
      <ChatDrawer />
      <ProfileModal />
      <ConnectionBanner />
      <Coach />
    </>
  );

  if (isPhone) {
    return (
      <div className="flex w-full flex-1 flex-col" data-layout="phone">
        <PhoneHeader />
        <main className="flex flex-col gap-4 px-4 pt-4 pb-[calc(var(--tabbar-h)+92px)]" data-testid="phone-main" data-tab={screen}>
          <ScreenView screen={screen} phone />
        </main>
        {TRADING.includes(screen) && (
          <>
            <div className="pointer-events-none fixed inset-x-0 bottom-[var(--tabbar-h)] z-10 h-24 bg-linear-to-t from-ink-0 from-40% to-transparent" aria-hidden data-testid="trade-fade" />
            <div className="fixed inset-x-4 bottom-[calc(var(--tabbar-h)+16px)] z-10">
              <button type="button" onClick={() => setSheet(true)} className="btn-brass h-13 w-full text-body" data-testid="open-trade">Trade {selected}</button>
            </div>
          </>
        )}
        <TabBar />
        <MoreSheet />
        <TradeSheet />
        <Toasts phone />
        {overlays}
      </div>
    );
  }

  const side = TRADING.includes(screen);
  return (
    <div className="flex h-dvh w-full overflow-hidden" data-layout={isDesktop ? 'desktop' : 'tablet'}>
      <NavRail />
      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        <TopBar />
        {isDesktop && side ? (
          <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_var(--side-w)] grid-rows-[minmax(0,1fr)] gap-4 p-4">
            <div key={screen} className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto" data-testid="main-column" data-tab={screen}>
              <ScreenView screen={screen} phone={false} />
            </div>
            <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto" data-testid="side-column">
              <div className="shrink-0"><OrderPad /></div>
              <div className="flex min-h-[260px] flex-1 flex-col [&>section]:flex-1"><Watchlist /></div>
            </aside>
          </main>
        ) : (
          <main key={screen} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-testid="main-column" data-tab={screen}>
            <ScreenView screen={screen} phone={false} />
            {side && (
              <aside className="grid grid-cols-2 items-start gap-4">
                <OrderPad />
                <div className="[&>section]:max-h-[640px]"><Watchlist /></div>
              </aside>
            )}
          </main>
        )}
        <WireStrip />
      </div>
      <Toasts />
      {overlays}
    </div>
  );
}
