'use client';

// What each app shows inside its window (Phase 2 step 1: the old screens, moved into windows). The
// screens keep their own content; Phase 2 step 3 splits them into proper apps. The Broker, Portfolio and
// Wire are loaded with the desktop. The other screens load on first open (P2-244), so the desktop root
// does not ship their code. Apps with no content yet show a stub (C-38).
import dynamic from 'next/dynamic';
import { t } from '@/i18n';
import { knownSeries, useGame } from '@/game/store';
import { AssetPanel, ChartCard, Watchlist } from '@/components/Market';
import { OrderPad } from '@/components/OrderPad';
import { PortfolioView } from '@/components/Portfolio';
import { WireView, Calendar } from '@/components/Wire';
import type { Win } from '@/shell/wm';
import { About } from './About';
import { PalettePicker } from './PalettePicker';
import { ShortcutList } from './ShortcutList';
import { openApp } from './shellStore';

const SocialView = dynamic(() => import('@/components/Social').then((m) => m.SocialView), { ssr: false });
const EmpireView = dynamic(() => import('@/components/Empire').then((m) => m.EmpireView), { ssr: false });
const EstateView = dynamic(() => import('@/components/Estate').then((m) => m.EstateView), { ssr: false });
const LabView = dynamic(() => import('@/components/Lab').then((m) => m.LabView), { ssr: false });
const SecurityView = dynamic(() => import('@/components/Security').then((m) => m.SecurityView), { ssr: false });
const CourtView = dynamic(() => import('@/components/Court').then((m) => m.CourtView), { ssr: false });
const ProfileView = dynamic(() => import('@/components/Profile').then((m) => m.ProfileView), { ssr: false });

export function AppBody({ win }: { win: Win }) {
  switch (win.app) {
    case 'broker':
      return <BrokerBody ticker={win.props.ticker} />;
    case 'portfolio':
      return <div className="os-body"><PortfolioView /></div>;
    case 'wire':
      return <div className="os-body"><WireView /></div>;
    case 'calendar':
      return <div className="os-body"><Calendar /></div>;
    case 'messages':
      return <div className="os-body"><SocialView /></div>;
    case 'businesses':
      return <div className="os-body"><EmpireView /></div>;
    case 'boutique':
      return <div className="os-body"><EstateView /></div>;
    case 'ailab':
      return <div className="os-body"><LabView /></div>;
    case 'security':
      return <div className="os-body"><SecurityView /></div>;
    case 'legal':
      return <div className="os-body"><CourtView /></div>;
    case 'settings':
      if (win.props.view === 'about') return <About />;
      return (
        <div className="os-body">
          <PalettePicker />
          <ShortcutList />
          <ProfileView />
        </div>
      );
    default:
      return <Stub />;
  }
}

/**
 * A Broker shows its own ticker (P2-117). The chart, ticket, asset panel and watchlist all read it, so
 * two Brokers on different tickers show different markets. An unknown ticker shows a note, never a chart.
 */
function BrokerBody({ ticker }: { ticker?: string }) {
  const selected = useGame((s) => s.selected);
  const config = useGame((s) => s.config);
  const name = ticker ?? selected;
  if (!knownSeries(config, name)) {
    return (
      <div className="os-body">
        <p className="text-small text-fg-muted" data-testid="broker-unknown">{t('shell.ticker.unknown', { ticker: name })}</p>
      </div>
    );
  }
  return (
    <div className="os-body">
      <ChartCard ticker={name} />
      <div className="os-body-row">
        <OrderPad ticker={name} />
        <AssetPanel ticker={name} />
      </div>
      <Watchlist ticker={name} onPick={(id) => openApp('broker', { ticker: id })} />
    </div>
  );
}

/** Placeholder for an app whose content lands in a later phase. */
function Stub() {
  return (
    <div className="os-body">
      <p className="text-small text-fg-muted" data-testid="os-stub">{t('shell.stub')}</p>
    </div>
  );
}
