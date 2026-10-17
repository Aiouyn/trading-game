'use client';

// What each app shows inside its window. The Broker (apps/broker), Portfolio and Wire are loaded with the
// desktop; the other screens load on first open (P2-244), so the desktop root does not ship their code.
// Apps with no content yet show a stub (C-38).
import dynamic from 'next/dynamic';
import { t } from '@/i18n';
import { BrokerApp } from '@/components/apps/broker/BrokerApp';
import { PortfolioView } from '@/components/Portfolio';
import { WireView } from '@/components/Wire';
import { CalendarView } from '@/components/Calendar';
import type { Size } from '@/shell/geometry';
import type { Win } from '@/shell/wm';
const MessagesView = dynamic(() => import('@/components/Messages').then((m) => m.MessagesView), { ssr: false });
const BusinessesApp = dynamic(() => import('@/components/apps/businesses/BusinessesApp').then((m) => m.BusinessesApp), { ssr: false });
const BoutiqueApp = dynamic(() => import('@/components/apps/boutique/BoutiqueApp').then((m) => m.BoutiqueApp), { ssr: false });
const BankApp = dynamic(() => import('@/components/apps/bank/BankApp').then((m) => m.BankApp), { ssr: false });
const LabApp = dynamic(() => import('@/components/apps/ailab/LabApp').then((m) => m.LabApp), { ssr: false });
const SecurityApp = dynamic(() => import('@/components/apps/security/SecurityApp').then((m) => m.SecurityApp), { ssr: false });
const LegalApp = dynamic(() => import('@/components/apps/legal/LegalApp').then((m) => m.LegalApp), { ssr: false });
// Settings, Learn, Research Desk and Company are their own apps (Phase 2 step 3). Their code loads on first open.
const SettingsView = dynamic(() => import('./SettingsView').then((m) => m.SettingsView), { ssr: false });
const LearnApp = dynamic(() => import('./LearnApp').then((m) => m.LearnApp), { ssr: false });
const ResearchDesk = dynamic(() => import('./ResearchDesk').then((m) => m.ResearchDesk), { ssr: false });
const CompanyApp = dynamic(() => import('@/components/apps/company/CompanyApp').then((m) => m.CompanyApp), { ssr: false });
// The Exchange (Phase 4): listed player stocks, IPO books and player-run funds. Its code loads on first open.
const ExchangeApp = dynamic(() => import('@/components/apps/exchange/ExchangeApp').then((m) => m.ExchangeApp), { ssr: false });
// The Launchpad (Phase 5, memecoins on a bonding curve). Its code loads on first open.
const LaunchpadApp = dynamic(() => import('@/components/apps/launchpad/LaunchpadApp').then((m) => m.LaunchpadApp), { ssr: false });
const CityApp = dynamic(() => import('@/city/CityApp').then((m) => m.CityApp), { ssr: false });

/** A window's content. `size` is the window's current size, which the Broker lays itself out by. */
export function AppBody({ win, size, active = true }: { win: Win; size: Size; active?: boolean }) {
  switch (win.app) {
    case 'broker':
      return <BrokerApp ticker={win.props.ticker} size={size} />;
    case 'portfolio':
      return <div className="os-body"><PortfolioView view={win.props.view} /></div>;
    case 'wire':
      return <WireView />;
    case 'calendar':
      return <CalendarView />;
    case 'messages':
      return <MessagesView view={win.props.view} />;
    case 'businesses':
      return <div className="os-body"><BusinessesApp view={win.props.view} key={win.props.view} /></div>;
    case 'boutique':
      return <div className="os-body"><BoutiqueApp /></div>;
    case 'bank':
      return <div className="os-body"><BankApp /></div>;
    case 'ailab':
      return <div className="os-body"><LabApp /></div>;
    case 'security':
      return <div className="os-body"><SecurityApp /></div>;
    case 'legal':
      return <div className="os-body"><LegalApp /></div>;
    case 'settings':
      return <SettingsView view={win.props.view} />;
    case 'learn':
      return <LearnApp />;
    case 'research':
      return <ResearchDesk />;
    case 'company':
      return <div className="os-body"><CompanyApp view={win.props.view} /></div>;
    case 'exchange':
      return <div className="os-body"><ExchangeApp /></div>;
    case 'launchpad':
      return <div className="os-body"><LaunchpadApp /></div>;
    case 'city':
      return <CityApp active={active} />;
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
