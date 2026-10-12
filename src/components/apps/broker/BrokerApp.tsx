'use client';

import { useEffect, useRef, useState } from 'react';
import { OpenOrders } from '@/components/Holdings';
import { LowCashCard } from '@/components/comeback/LowCashCard';
import { notify, openApp, useShell } from '@/components/os/shellStore';
import { Button, Card } from '@/components/ui';
import { knownSeries, useGame } from '@/game/store';
import { t } from '@/i18n';
import { MAX_BROKERS } from '@/shell/apps';
import { brokerView, type Size } from '@/shell/geometry';
import { AssetPanel } from './AssetPanel';
import { BrokerDock, type DockTab } from './BrokerDock';
import { ChartCard } from './ChartCard';
import { OptionChain } from './OptionChain';
import { OrderTicket } from './OrderTicket';
import { PlansCard } from './PlansCard';
import { RivalsCard } from './RivalsCard';
import { TerminalLayout, TerminalNarrow, WATCHLIST_OPEN_W } from './TerminalLayout';
import { TradeBar, TradeSheet } from './TradeBar';
import { Universe } from './Universe';

/**
 * The Broker app: the heart of the game. Each Broker window holds one ticker (P2-117) with its own chart, order ticket,
 * dock and watchlist. Nothing here executes an order except the ticket's own Enter (P2-105, OrderTicket). Layouts:
 *   terminal (>= 900 px wide, spec 1.1): the watchlist, the chart over a bottom dock, and the ticket column on the right.
 *   narrow (under 900 px wide, and the phone): the chart at 45% of the height, the dock below, a sticky trade bar, and the
 *     full ticket as a bottom sheet.
 *   short (under 560 px tall): a Chart / Ticket toggle, one pane at a time (V:41).
 */
export function BrokerApp({ ticker, size }: { ticker?: string; size: Size }) {
  const selected = useGame((s) => s.selected);
  const config = useGame((s) => s.config);
  const storeSheet = useGame((s) => s.tradeSheetOpen);
  const tradesMade = useGame((s) => s.me?.player.stats.trades ?? 0);
  const setStoreSheet = useGame((s) => s.setTradeSheet);
  const [pane, setPane] = useState<'chart' | 'ticket'>('chart');
  const [chain, setChain] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>('positions');
  // the bottom sheet is the store's trade sheet flag (a preset opens it, a fill closes it, as the coach and the close card read it);
  // the bar remounts when the sheet closes, so it shows what the ticket left in the draft
  const [barKey, setBarKey] = useState(0);
  // The sheet belongs to the narrow layout. A new ticket preset (a chart menu pick, the coach's stop) opens it there; the
  // desktop terminal never draws it, so it clears a flag that another window or a wider width left behind (CloseCard and
  // the event takeover wait on that flag, so it must not outlive the sheet).
  const terminalLayout = brokerView(size).terminal;
  const presetNonce = useGame((s) => s.ticketPreset?.nonce);
  const lastPreset = useRef(presetNonce);
  useEffect(() => {
    if (presetNonce === lastPreset.current) return;
    lastPreset.current = presetNonce;
    if (!terminalLayout && presetNonce !== undefined) setStoreSheet(true);
  }, [presetNonce, terminalLayout, setStoreSheet]);
  useEffect(() => {
    if (terminalLayout && useGame.getState().tradeSheetOpen) setStoreSheet(false);
  }, [terminalLayout, storeSheet, setStoreSheet]);
  const name = ticker ?? selected;
  if (!knownSeries(config, name)) {
    return (
      <div className="os-body">
        <p className="text-small text-fg-muted" data-testid="broker-unknown">{t('shell.ticker.unknown', { ticker: name })}</p>
      </div>
    );
  }
  const view = brokerView(size);
  // Picking a row opens that ticker in a Broker, or focuses the Broker that already has it. At the cap a new
  // ticker is refused with a notice: no other window is retargeted.
  const pick = (id: string) => {
    const brokers = useShell.getState().shell.wins.filter((w) => w.app === 'broker');
    if (brokers.length >= MAX_BROKERS && !brokers.some((w) => w.props.ticker === id)) {
      notify(t('broker.cap', { n: MAX_BROKERS }), 'warn');
      return;
    }
    openApp('broker', { ticker: id }, { focus: true });
  };
  const toggleChain = () => setChain((c) => !c);
  const chainCard = chain ? (
    <Card className="p-4" data-testid="chain-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-title">{t('broker.chain.title', { ticker: name })}</h2>
        <Button size="sm" onClick={toggleChain} testId="chain-close">{t('common.close')}</Button>
      </div>
      <div className="mt-3">
        <OptionChain underlying={name} />
      </div>
    </Card>
  ) : null;

  if (view.short) {
    return (
      <div className="os-body" data-testid="broker-short">
        <div className="os-seg" role="group" aria-label={t('shell.broker.view')}>
          <button
            type="button" className="os-tool" aria-pressed={pane === 'chart'} data-testid="broker-pane-chart"
            onClick={() => setPane('chart')}
          >
            {t('shell.broker.chart')}
          </button>
          <button
            type="button" className="os-tool" aria-pressed={pane === 'ticket'} data-testid="broker-pane-ticket"
            onClick={() => setPane('ticket')}
          >
            {t('shell.broker.ticket')}
          </button>
        </div>
        {pane === 'chart' ? (
          <>
            <div className="h-80"><ChartCard ticker={name} narrow /></div>
            <LowCashCard />
            <Universe ticker={name} onPick={pick} />
            <RivalsCard />
          </>
        ) : (
          <>
            <div className="os-body-row os-body-stack">
              <OrderTicket ticker={name} />
              <AssetPanel ticker={name} onOptions={toggleChain} chainOpen={chain} />
            </div>
            {chainCard}
            <OpenOrders assetId={name} />
            <PlansCard ticker={name} />
          </>
        )}
      </div>
    );
  }

  const openSheet = () => setStoreSheet(true);
  const closeSheet = () => { setStoreSheet(false); setBarKey((k) => k + 1); };
  const chart = (
    <>
      <ChartCard ticker={name} narrow={!view.terminal} />
      <LowCashCard />
    </>
  );
  const dock = <BrokerDock ticker={name} tab={dockTab} onTab={setDockTab} narrow={!view.terminal} onPick={pick} />;

  if (view.terminal) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="broker-body">
        {/* First run (UX 5): a one-line welcome strip instead of a tip card over the trade surface. */}
        {tradesMade === 0 && (
          <p className="shrink-0 truncate border-b border-ink-2 px-3 py-1.5 text-caption text-fg-muted" data-testid="broker-welcome">{t('broker.welcome')}</p>
        )}
        <TerminalLayout
          watchlistOpen={size.w >= WATCHLIST_OPEN_W}
          chart={chart}
          dock={dock}
          watchlist={<Universe ticker={name} onPick={pick} bare />}
          ticket={<OrderTicket ticker={name} dense />}
        />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="broker-body" data-layout="narrow">
      <TerminalNarrow
        chart={chart}
        dock={dock}
        tradeBar={<TradeBar key={barKey} ticker={name} onReview={openSheet} />}
        sheet={storeSheet ? <TradeSheet ticker={name} onClose={closeSheet} /> : null}
      />
    </div>
  );
}
