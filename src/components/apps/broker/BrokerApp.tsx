'use client';

import { useState } from 'react';
import { OpenOrders } from '@/components/Holdings';
import { LowCashCard } from '@/components/comeback/LowCashCard';
import { notify, openApp, useShell } from '@/components/os/shellStore';
import { Button, Card } from '@/components/ui';
import { knownSeries, useGame } from '@/game/store';
import { t } from '@/i18n';
import { MAX_BROKERS } from '@/shell/apps';
import { brokerView, type Size } from '@/shell/geometry';
import { AssetPanel } from './AssetPanel';
import { ChartCard } from './ChartCard';
import { OptionChain } from './OptionChain';
import { OrderTicket } from './OrderTicket';
import { PlansCard } from './PlansCard';
import { RivalsCard } from './RivalsCard';
import { Universe } from './Universe';

/**
 * The Broker app: the heart of the game. Each Broker window holds one ticker (P2-117) with its own chart,
 * order ticket, asset panel, option chain, open orders and universe browser. Nothing here executes an order
 * except the ticket's own Enter (P2-105, OrderTicket). Layouts:
 *   wide (>= 720 px wide, >= 560 px tall): chart on top, ticket and asset panel side by side.
 *   narrow (480-719 px wide, and the phone): the same stacked under the chart (C-37, P2-148).
 *   short (under 560 px tall): a Chart / Ticket toggle, one pane at a time (V:41).
 */
export function BrokerApp({ ticker, size }: { ticker?: string; size: Size }) {
  const selected = useGame((s) => s.selected);
  const config = useGame((s) => s.config);
  const [pane, setPane] = useState<'chart' | 'ticket'>('chart');
  const [chain, setChain] = useState(false);
  const name = ticker ?? selected;
  if (!knownSeries(config, name)) {
    return (
      <div className="os-body">
        <p className="text-small text-fg-muted" data-testid="broker-unknown">{t('shell.ticker.unknown', { ticker: name })}</p>
      </div>
    );
  }
  const view = brokerView(size);
  const stack = view.narrow ? ' os-body-stack' : '';
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
            <ChartCard ticker={name} narrow={view.narrow} />
            <LowCashCard />
            <Universe ticker={name} onPick={pick} />
            <RivalsCard />
          </>
        ) : (
          <>
            <div className={`os-body-row${stack}`}>
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

  return (
    <div className="os-body" data-testid="broker-body">
      <ChartCard ticker={name} narrow={view.narrow} />
      <LowCashCard />
      <div className={`os-body-row${stack}`}>
        <OrderTicket ticker={name} />
        <AssetPanel ticker={name} onOptions={toggleChain} chainOpen={chain} />
      </div>
      {chainCard}
      <OpenOrders assetId={name} />
      <PlansCard ticker={name} />
      <Universe ticker={name} onPick={pick} />
            <RivalsCard />
    </div>
  );
}
