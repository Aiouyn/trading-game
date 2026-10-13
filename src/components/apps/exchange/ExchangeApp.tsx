'use client';

// The Exchange (Phase 4): player stocks, the IPO books open today, player-run funds, the viewer's fund holdings, and the
// manager console for the viewer's own fund. Every number comes from the player view (`me.exchange`), built by the world.
import { useState } from 'react';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { StatStrip, Tabs } from '@/components/ui';
import { FundsTab } from './FundsTab';
import { HoldingsTab } from './HoldingsTab';
import { IposTab } from './IposTab';
import { ManageTab } from './ManageTab';
import { StocksTab } from './StocksTab';

type Tab = 'stocks' | 'ipos' | 'funds' | 'mine' | 'manage';

export function ExchangeApp() {
  const me = useGame((s) => s.me);
  const [tab, setTab] = useState<Tab>('stocks');
  const [fundId, setFundId] = useState<string | null>(null);
  if (!me) return null;
  const x = me.exchange;
  const openFund = (id: string) => {
    setFundId(id);
    setTab('funds');
  };
  return (
    <div className="flex flex-col gap-4" data-testid="exchange-view">
      <StatStrip
        testId="exchange-stats"
        intro={t('exchange.intro')}
        items={[
          { label: t('exchange.stat.stocks'), value: x.stocks.length, testId: 'exchange-stat-stocks' },
          { label: t('exchange.stat.ipos'), value: x.ipos.length, testId: 'exchange-stat-ipos' },
          { label: t('exchange.stat.funds'), value: x.funds.length, testId: 'exchange-stat-funds' },
          { label: t('exchange.stat.mine'), value: money(x.holdingsValue), testId: 'exchange-stat-mine' },
        ]}
      />
      {/* the five tabs wrap onto a second row on a phone: a scrolling row under the edge fade hid the last label ("Gérer") */}
      <Tabs<Tab>
        wrap
        tabs={[
          { id: 'stocks', label: t('exchange.tab.stocks') },
          { id: 'ipos', label: t('exchange.tab.ipos'), badge: x.ipos.length },
          { id: 'funds', label: t('exchange.tab.funds') },
          { id: 'mine', label: t('exchange.tab.mine'), badge: x.holdings.length },
          { id: 'manage', label: t('exchange.tab.manage') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'stocks' && <StocksTab stocks={x.stocks} />}
      {tab === 'ipos' && <IposTab ipos={x.ipos} onTab={setTab} />}
      {tab === 'funds' && <FundsTab x={x} selected={fundId} onSelect={setFundId} onOpenManage={() => setTab('manage')} />}
      {tab === 'mine' && <HoldingsTab holdings={x.holdings} ticksPerDay={x.rules.ticksPerDay} onOpen={openFund} onTab={setTab} />}
      {tab === 'manage' && <ManageTab x={x} />}
    </div>
  );
}
