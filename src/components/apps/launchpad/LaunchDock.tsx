'use client';

// The dock under a launch chart: the same tabs as the broker (Positions, Open orders, History, Asset, Options,
// and Markets on a narrow window). A live coin is not a broker asset, so the panels read the launch view.
// The option chain and the asset dossier are not mounted here.
import { useState, type ReactNode } from 'react';
import { commission } from '@/engine';
import { money, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { assetDefOf, useGame } from '@/game/store';
import { useMedia } from '@/game/useMedia';
import { t } from '@/i18n';
import { OpenOrders } from '@/components/Holdings';
import { Td, Th, ticksLabel } from '@/components/ui';
import { dockTabs, type DockTab } from '@/components/apps/broker/BrokerDock';
import { BROKER_TERMINAL_W } from '@/shell/geometry';
import { LP } from '@/world/launchpad/constants';
import { anonOf } from '@/world/launchpad/anon';
import type { LaunchpadView, LpPage } from '@/world/launchpad/view';
import { lpPrice, tokens as fmtTokens } from './copy';
import { Fact } from './Shared';

const LABEL: Record<DockTab, string> = {
  positions: 'broker.dock.positions',
  orders: 'broker.dock.orders',
  history: 'broker.dock.history',
  asset: 'broker.dock.asset',
  options: 'broker.dock.options',
  markets: 'broker.dock.markets',
};

const NO_HOLDINGS: LaunchpadView['holdings'] = [];
const NO_FEED: LaunchpadView['feeds']['newest'] = [];

type Holding = LaunchpadView['holdings'][number];

/** What a sale would bank: the bag less its cost and the exit fee. A curve sale pays the curve fee. A listed coin pays the broker fee. */
function ifSold(h: Holding, world: ReturnType<typeof useGame.getState>['world']): number {
  if (h.status === 'graduated' && world) {
    const def = assetDefOf(h.ticker);
    if (def) return h.value - commission(world, def, Math.abs(h.value)) - h.cost;
  }
  return h.value * (1 - LP.FEE_RATE) - h.cost;
}

export function LaunchDock({ page, tick, onOpen }: { page: LpPage; tick: number; onOpen: (ticker: string) => void }) {
  const narrow = useMedia(`(max-width: ${BROKER_TERMINAL_W - 1}px)`);
  const [tab, setTab] = useState<DockTab>('positions');
  const holdings = useGame((s) => s.me?.launchpad.holdings ?? NO_HOLDINGS);
  const orders = useGame((s) => s.me?.orders);
  const playerId = useGame((s) => s.playerId);
  const world = useGame((s) => s.world);
  const newest = useGame((s) => s.me?.launchpad.feeds.newest ?? NO_FEED);
  const tabs = dockTabs(narrow);
  const shown = tabs.includes(tab) ? tab : 'positions';
  const listed = page.status === 'graduated' && assetDefOf(page.ticker) !== undefined;
  const openHere = listed ? (orders ?? []).filter((o) => o.status === 'open' && o.assetId === page.ticker) : [];
  let panel: ReactNode;
  switch (shown) {
    case 'positions':
      panel = <LaunchPositions holdings={holdings} current={page.ticker} world={world} onOpen={onOpen} />;
      break;
    case 'orders':
      // OpenOrders returns null when nothing is working, which is still an element, so the empty line is chosen here.
      panel = listed && openHere.length > 0
        ? <OpenOrders assetId={page.ticker} bare />
        : <p className="px-1 text-small text-fg-faint" data-testid="lp-orders-empty">{t('broker.dock.noOrders')}</p>;
      break;
    case 'history':
      panel = <LaunchHistory page={page} tick={tick} playerId={playerId} />;
      break;
    case 'asset':
      panel = (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Fact label={t('lp.page.price')} value={lpPrice(page.price)} testId="lp-dock-price" />
          <Fact label={t('lp.page.marketCap')} value={money(page.marketCap)} testId="lp-dock-mcap" />
          <Fact label={t('lp.page.raised')} value={money(page.raised)} testId="lp-dock-raised" />
          <Fact label={t('lp.page.count')} value={String(page.buckets.holders)} testId="lp-dock-holders" />
        </div>
      );
      break;
    case 'options':
      panel = <p className="px-1 text-small text-fg-faint" data-testid="lp-options-empty">{t('lp.dock.noOptions')}</p>;
      break;
    case 'markets':
      panel = newest.length === 0
        ? <p className="px-1 text-small text-fg-faint">{t('lp.feed.empty.new')}</p>
        : (
          <ul className="flex flex-col">
            {newest.map((c) => (
              <li key={c.ticker} className="border-t border-ink-2 first:border-t-0">
                <button
                  type="button" onClick={() => onOpen(c.ticker)} data-testid="lp-dock-market"
                  className={`flex w-full items-baseline gap-3 px-1 py-1.5 text-left text-small hover:bg-ink-2 ${c.ticker === page.ticker ? 'text-fg' : 'text-fg-muted'}`}
                >
                  <span className="num font-semibold text-fg">{c.ticker}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="num">{lpPrice(c.price)}</span>
                </button>
              </li>
            ))}
          </ul>
        );
      break;
  }
  return (
    <div className="flex h-72 flex-col border-t border-ink-2" data-testid="lp-dock">
      <div role="tablist" aria-label={t('broker.dock.label')} className="flex shrink-0 items-center gap-1 overflow-x-auto">
        {tabs.map((id) => {
          const on = id === shown;
          const count = id === 'orders' && openHere.length > 0 ? ` (${openHere.length})` : '';
          return (
            <button
              key={id} type="button" role="tab" aria-selected={on} onClick={() => setTab(id)} data-testid={`lp-dock-tab-${id}`}
              className={`shrink-0 border-b-2 px-2.5 py-2 text-caption ${on ? 'border-brass text-fg' : 'border-transparent text-fg-faint hover:text-fg-muted'}`}
            >
              {t(LABEL[id])}{count}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto py-2" data-testid={`lp-dock-panel-${shown}`}>
        {panel}
      </div>
    </div>
  );
}

function LaunchPositions({ holdings, current, world, onOpen }: {
  holdings: LaunchpadView['holdings'];
  current: string;
  world: ReturnType<typeof useGame.getState>['world'];
  onOpen: (ticker: string) => void;
}) {
  if (holdings.length === 0) return <p className="px-1 text-small text-fg-faint" data-testid="lp-positions-empty">{t('lp.dock.noPosition')}</p>;
  const rows = [...holdings].sort((a, b) => (a.ticker === current ? -1 : b.ticker === current ? 1 : a.ticker.localeCompare(b.ticker)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-small [&_td]:px-2 [&_th]:px-2" data-testid="lp-positions">
        <thead>
          <tr className="text-caption text-fg-faint">
            <Th>{t('holdings.col.asset')}</Th>
            <Th right>{t('holdings.col.qty')}</Th>
            <Th right>{t('holdings.col.avg')}</Th>
            <Th right>{t('holdings.col.last')}</Th>
            <Th right>{t('holdings.col.value')}</Th>
            <Th right>{t('holdings.col.pnl')}</Th>
            <Th right>{t('holdings.col.ifSold')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const avg = h.qty > 0 ? h.cost / h.qty : 0;
            const last = h.qty > 0 ? h.value / h.qty : 0;
            const pnl = h.value - h.cost;
            const sold = ifSold(h, world);
            const pct = h.cost > 0 ? pnl / h.cost : 0;
            return (
              <tr key={h.ticker} className="border-t border-ink-2" data-testid={`lp-position-${h.ticker}`}>
                <Td>
                  <button type="button" onClick={() => onOpen(h.ticker)} className="text-left">
                    <div className="num font-semibold">{h.ticker}</div>
                    <div className="text-caption text-fg-faint">{h.name}</div>
                  </button>
                </Td>
                <Td right num>{fmtTokens(h.qty)}</Td>
                <Td right num>{lpPrice(avg)}</Td>
                <Td right num>{lpPrice(last)}</Td>
                <Td right num>{money(h.value)}</Td>
                <Td right num className={toneText[tone(pnl)]}>{signedMoney(pnl)}{h.cost > 0 && <div className="text-caption">{signedPct(pct)}</div>}</Td>
                <Td right num className={toneText[tone(sold)]}><span data-testid={`lp-position-ifsold-${h.ticker}`}>{signedMoney(sold)}</span></Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The viewer's own prints on this coin. The public tape is anonymous; this keeps the lines whose id is theirs. */
function LaunchHistory({ page, tick, playerId }: { page: LpPage; tick: number; playerId: string | null }) {
  const mine = playerId ? page.tape.filter((r) => r.anon === anonOf(page.ticker, playerId)) : [];
  if (mine.length === 0) return <p className="px-1 text-small text-fg-faint" data-testid="lp-history-empty">{t('broker.dock.noFills')}</p>;
  const rows = [...mine].reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-small" data-testid="lp-history">
        <thead>
          <tr className="text-caption text-fg-faint">
            <Th>{t('broker.dock.when')}</Th>
            <Th>{t('broker.dock.side')}</Th>
            <Th right>{t('broker.dock.units')}</Th>
            <Th right>{t('broker.dock.fillPrice')}</Th>
            <Th right>{t('lp.trades.usd')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.tick}-${r.side}-${i}`} className="border-t border-ink-2" data-testid="lp-history-row">
              <Td className="text-fg-muted">{tick - r.tick > 0 ? t('lp.tape.ago', { when: ticksLabel(tick - r.tick) }) : t('lp.tape.now')}</Td>
              <Td className={r.side === 'buy' ? 'text-gain' : 'text-loss'}>{r.side === 'buy' ? t('common.buy') : t('common.sell')}</Td>
              <Td right num>{fmtTokens(r.qty)}</Td>
              <Td right num>{lpPrice(r.price)}</Td>
              <Td right num>{money(r.usd)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
