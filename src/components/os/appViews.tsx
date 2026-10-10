'use client';

// What each app shows inside its window (Phase 2 step 1: the old screens, moved into windows). The
// screens keep their own content; Phase 2 step 3 splits them into proper apps. Apps with no content
// yet show a stub (C-38: the apps exist, their content comes later).
import { t } from '@/i18n';
import { AssetPanel, ChartCard, Watchlist } from '@/components/Market';
import { OrderPad } from '@/components/OrderPad';
import { PortfolioView } from '@/components/Portfolio';
import { WireView, Calendar } from '@/components/Wire';
import { SocialView } from '@/components/Social';
import { EmpireView } from '@/components/Empire';
import { EstateView } from '@/components/Estate';
import { LabView } from '@/components/Lab';
import { SecurityView } from '@/components/Security';
import { CourtView } from '@/components/Court';
import { ProfileView } from '@/components/Profile';
import type { Win } from '@/shell/wm';
import { About } from './About';
import { PalettePicker } from './PalettePicker';

export function AppBody({ win }: { win: Win }) {
  switch (win.app) {
    case 'broker':
      return (
        <div className="os-body">
          <ChartCard />
          <div className="os-body-row">
            <OrderPad />
            <AssetPanel />
          </div>
          <Watchlist />
        </div>
      );
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
    case 'lab':
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
          <ProfileView />
        </div>
      );
    default:
      return <Stub />;
  }
}

/** Placeholder for an app whose content lands in a later phase. */
function Stub() {
  return (
    <div className="os-body">
      <p className="text-small text-fg-muted" data-testid="os-stub">{t('shell.stub')}</p>
    </div>
  );
}
