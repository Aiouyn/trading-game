'use client';

// What each app shows inside its window. The Broker (apps/broker), Portfolio and Wire are loaded with the
// desktop; the other screens load on first open (P2-244), so the desktop root does not ship their code.
// Apps with no content yet show a stub (C-38).
import dynamic from 'next/dynamic';
import { t } from '@/i18n';
import { BrokerApp } from '@/components/apps/broker/BrokerApp';
import { PortfolioView } from '@/components/Portfolio';
import { WireView, Calendar } from '@/components/Wire';
import type { Size } from '@/shell/geometry';
import type { Win } from '@/shell/wm';
import { About } from './About';
import { PalettePicker } from './PalettePicker';
import { ShortcutList } from './ShortcutList';

const SocialView = dynamic(() => import('@/components/Social').then((m) => m.SocialView), { ssr: false });
const EmpireView = dynamic(() => import('@/components/Empire').then((m) => m.EmpireView), { ssr: false });
const EstateView = dynamic(() => import('@/components/Estate').then((m) => m.EstateView), { ssr: false });
const LabView = dynamic(() => import('@/components/Lab').then((m) => m.LabView), { ssr: false });
const SecurityView = dynamic(() => import('@/components/Security').then((m) => m.SecurityView), { ssr: false });
const CourtView = dynamic(() => import('@/components/Court').then((m) => m.CourtView), { ssr: false });
const ProfileView = dynamic(() => import('@/components/Profile').then((m) => m.ProfileView), { ssr: false });

/** A window's content. `size` is the window's current size, which the Broker lays itself out by. */
export function AppBody({ win, size }: { win: Win; size: Size }) {
  switch (win.app) {
    case 'broker':
      return <BrokerApp ticker={win.props.ticker} size={size} />;
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

/** Placeholder for an app whose content lands in a later phase. */
function Stub() {
  return (
    <div className="os-body">
      <p className="text-small text-fg-muted" data-testid="os-stub">{t('shell.stub')}</p>
    </div>
  );
}
