'use client';

// What each app shows inside its window (Phase 2 step 1: the old screens, moved into windows). The
// screens keep their own content; Phase 2 step 3 splits them into proper apps. The Broker, Portfolio and
// Wire are loaded with the desktop. The other screens load on first open (P2-244), so the desktop root
// does not ship their code. Apps with no content yet show a stub (C-38).
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { t } from '@/i18n';
import { knownSeries, useGame } from '@/game/store';
import { AssetPanel, ChartCard, Watchlist } from '@/components/Market';
import { OrderPad } from '@/components/OrderPad';
import { PortfolioView } from '@/components/Portfolio';
import { WireView } from '@/components/Wire';
import { CalendarView } from '@/components/Calendar';
import { type Size, brokerView } from '@/shell/geometry';
import type { Win } from '@/shell/wm';
import { About } from './About';
import { PalettePicker } from './PalettePicker';
import { ShortcutList } from './ShortcutList';
import { openApp } from './shellStore';

const MessagesView = dynamic(() => import('@/components/Messages').then((m) => m.MessagesView), { ssr: false });
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
      return <BrokerBody ticker={win.props.ticker} size={size} />;
    case 'portfolio':
      return <div className="os-body"><PortfolioView /></div>;
    case 'wire':
      return <WireView />;
    case 'calendar':
      return <CalendarView />;
    case 'messages':
      return <MessagesView view={win.props.view} />;
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
function BrokerBody({ ticker, size }: { ticker?: string; size: Size }) {
  const selected = useGame((s) => s.selected);
  const config = useGame((s) => s.config);
  const [pane, setPane] = useState<'chart' | 'ticket'>('chart');
  const name = ticker ?? selected;
  if (!knownSeries(config, name)) {
    return (
      <div className="os-body">
        <p className="text-small text-fg-muted" data-testid="broker-unknown">{t('shell.ticker.unknown', { ticker: name })}</p>
      </div>
    );
  }
  // Under 560 px tall the chart and the ticket take turns behind a toggle; under 720 px wide the ticket
  // stacks under the chart (V:41, C-37). Both are presentation: the order pad is the same either way.
  const view = brokerView(size);
  if (view.short) {
    return (
      <div className="os-body" data-testid="broker-short">
        <div className="os-seg" role="group" aria-label={t('shell.broker.view')}>
          <button
            type="button"
            className="os-tool"
            aria-pressed={pane === 'chart'}
            data-testid="broker-pane-chart"
            onClick={() => setPane('chart')}
          >
            {t('shell.broker.chart')}
          </button>
          <button
            type="button"
            className="os-tool"
            aria-pressed={pane === 'ticket'}
            data-testid="broker-pane-ticket"
            onClick={() => setPane('ticket')}
          >
            {t('shell.broker.ticket')}
          </button>
        </div>
        {pane === 'chart' ? (
          <ChartCard ticker={name} />
        ) : (
          <>
            <OrderPad ticker={name} />
            <AssetPanel ticker={name} />
          </>
        )}
      </div>
    );
  }
  return (
    <div className="os-body">
      <ChartCard ticker={name} />
      <div className={`os-body-row${view.narrow ? ' os-body-stack' : ''}`}>
        <OrderPad ticker={name} />
        <AssetPanel ticker={name} />
      </div>
      <Watchlist ticker={name} onPick={(id) => openApp('broker', { ticker: id }, { focus: true })} />
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
