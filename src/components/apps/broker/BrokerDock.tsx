'use client';

import { type ReactNode } from 'react';
import { signedMoney, money, price, qty as fmtQty, tone, toneText } from '@/game/format';
import { useGame } from '@/game/store';
import { clockLabel } from '@/game/clock';
import { t } from '@/i18n';
import { OpenOrders, Positions } from '@/components/Holdings';
import { Card, Td, Th } from '@/components/ui';
import { AssetPanel } from './AssetPanel';
import { OptionChain } from './OptionChain';
import { PlansCard } from './PlansCard';
import { RivalsCard } from './RivalsCard';
import { Universe } from './Universe';

export type DockTab = 'positions' | 'orders' | 'history' | 'asset' | 'options' | 'markets';

/** The dock's tabs. Markets is listed only on the phone width, where the watchlist column has no room (spec 1.1). */
export function dockTabs(narrow: boolean): DockTab[] {
  return narrow ? ['positions', 'orders', 'history', 'asset', 'options', 'markets'] : ['positions', 'orders', 'history', 'asset', 'options'];
}

const LABEL: Record<DockTab, string> = {
  positions: 'broker.dock.positions',
  orders: 'broker.dock.orders',
  history: 'broker.dock.history',
  asset: 'broker.dock.asset',
  options: 'broker.dock.options',
  markets: 'broker.dock.markets',
};

/**
 * The bottom dock under the chart: Positions, Open orders (with the count), History of this asset, the Asset panel (stats,
 * earnings, the analyst note, plans and the rivals board) and the option chain. The phone adds Markets. The panel scrolls.
 */
export function BrokerDock({ ticker, tab, onTab, narrow = false, onPick }: {
  ticker: string;
  tab: DockTab;
  onTab: (tab: DockTab) => void;
  narrow?: boolean;
  onPick: (id: string) => void;
}) {
  const openCount = useGame((s) => (s.me?.orders ?? []).filter((o) => o.status === 'open').length);
  const tabs = dockTabs(narrow);
  let panel: ReactNode;
  switch (tab) {
    case 'positions':
      panel = <Positions />;
      break;
    case 'orders':
      panel = openCount > 0 ? <OpenOrders /> : <p className="px-1 text-small text-fg-faint" data-testid="orders-empty">{t('broker.dock.noOrders')}</p>;
      break;
    case 'history':
      panel = <FillHistory assetId={ticker} />;
      break;
    case 'asset':
      panel = (
        <div className="flex flex-col gap-3">
          <AssetPanel ticker={ticker} onOptions={() => onTab('options')} chainOpen={false} />
          <PlansCard ticker={ticker} />
          <RivalsCard />
        </div>
      );
      break;
    case 'options':
      panel = <Card className="p-3"><OptionChain underlying={ticker} /></Card>;
      break;
    case 'markets':
      panel = <Universe ticker={ticker} onPick={onPick} bare />;
      break;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="broker-dock">
      <div role="tablist" aria-label={t('broker.dock.label')} className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-ink-2 px-2">
        {tabs.map((id) => {
          const on = id === tab;
          const count = id === 'orders' && openCount > 0 ? ` (${openCount})` : '';
          return (
            <button
              key={id} type="button" role="tab" aria-selected={on} onClick={() => onTab(id)} data-testid={`dock-tab-${id}`}
              className={`shrink-0 border-b-2 px-2.5 py-2 text-caption ${on ? 'border-brass text-fg' : 'border-transparent text-fg-faint hover:text-fg-muted'}`}
            >
              {t(LABEL[id])}{count}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-2" data-testid={`dock-panel-${tab}`}>
        {panel}
      </div>
    </div>
  );
}

/** The fills of one asset, newest first: when, side, units, price, fee and the realized P&L each fill booked. */
export function FillHistory({ assetId }: { assetId: string }) {
  const tpd = useGame((s) => s.world?.config.ticksPerDay ?? 720);
  const fills = useGame((s) => (s.me?.trading?.fills ?? []).filter((f) => f.assetId === assetId));
  if (fills.length === 0) return <p className="px-1 text-small text-fg-faint" data-testid="history-empty">{t('broker.dock.noFills')}</p>;
  const rows = fills.slice(-60).reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-small" data-testid="fill-history">
        <thead>
          <tr className="text-caption text-fg-faint">
            <Th>{t('broker.dock.when')}</Th>
            <Th>{t('broker.dock.side')}</Th>
            <Th right>{t('broker.dock.units')}</Th>
            <Th right>{t('broker.dock.fillPrice')}</Th>
            <Th right>{t('broker.dock.fee')}</Th>
            <Th right>{t('broker.dock.realized')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id} className="border-t border-ink-2" data-testid={`fill-${f.id}`}>
              <Td className="num text-fg-muted">{clockLabel(f.tick, tpd)}</Td>
              <Td className={f.side === 'buy' ? 'text-gain' : 'text-loss'}>{f.side === 'buy' ? t('common.buy') : t('common.sell')}</Td>
              <Td right num>{fmtQty(f.qty)}</Td>
              <Td right num>{price(f.price)}</Td>
              <Td right num className="text-fg-muted">{money(f.fee)}</Td>
              <Td right num className={toneText[tone(f.realizedPnl)]}>{f.side === 'sell' ? signedMoney(f.realizedPnl) : '–'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
