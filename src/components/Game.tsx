'use client';

import { useEffect } from 'react';
import { useGame, type Screen } from '@/game/store';
import { useIsPhone } from '@/game/useMedia';
import { CourtView } from './Court';
import { EmpireView } from './Empire';
import { EstateView } from './Estate';
import { PhoneHeader } from './Header';
import { LabView } from './Lab';
import { AssetPanel, ChartCard, OpenOrders, Positions, TickerStrip } from './Market';
import { ChatDrawer, InboxDrawer, MoreSheet, TabBar, Toasts, TradeSheet } from './Shell';
import { Coach, ConnectionBanner, DigestModal, RankUpOverlay } from './Overlays';
import { PortfolioView } from './Portfolio';
import { ProfileView } from './Profile';
import { SecurityView } from './Security';
import { ProfileModal, SocialView } from './Social';
import { WireView } from './Wire';
import { OsRoot } from './os/OsRoot';
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

/** The phone keeps the screens until its home lands (Phase 2 step 2). The desktop is the OS shell. */
function MarketScreen() {
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

function ScreenView({ screen, phone }: { screen: Screen; phone: boolean }) {
  switch (screen) {
    case 'market': return <MarketScreen />;
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

/** Screens that keep the order pad and watchlist beside them on the phone. */
const TRADING: Screen[] = ['market', 'portfolio'];

export function Game() {
  const status = useBoot();
  const isPhone = useIsPhone();
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

  if (!isPhone) {
    return (
      <>
        <OsRoot />
        {overlays}
      </>
    );
  }

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
