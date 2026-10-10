'use client';

// The Exchange (Phase 4): player stocks, the IPO books open today, player-run funds, the viewer's fund holdings, and the
// manager console for the viewer's own fund. Every number comes from the player view (`me.exchange`), built by the world.
import { useState } from 'react';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, Stat, Tabs } from '@/components/ui';
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
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-hero text-fg">{t('exchange.title')}</h1>
            <p className="text-small text-fg-muted">{t('exchange.intro')}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 @xl:grid-cols-4">
            <Stat figure label={t('exchange.stat.stocks')} value={x.stocks.length} testId="exchange-stat-stocks" />
            <Stat figure label={t('exchange.stat.ipos')} value={x.ipos.length} testId="exchange-stat-ipos" />
            <Stat figure label={t('exchange.stat.funds')} value={x.funds.length} testId="exchange-stat-funds" />
            <Stat figure label={t('exchange.stat.mine')} value={money(x.holdingsValue)} testId="exchange-stat-mine" />
          </div>
        </div>
      </Card>
      <Tabs<Tab>
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
      {tab === 'ipos' && <IposTab ipos={x.ipos} />}
      {tab === 'funds' && <FundsTab x={x} selected={fundId} onSelect={setFundId} onOpenManage={() => setTab('manage')} />}
      {tab === 'mine' && <HoldingsTab holdings={x.holdings} ticksPerDay={x.rules.ticksPerDay} onOpen={openFund} />}
      {tab === 'manage' && <ManageTab x={x} />}
    </div>
  );
}
