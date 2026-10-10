'use client';

// Businesses (Velvet app 5): owned businesses, the 156-business catalog and, per Velvet's table, the
// property that used to live in Estate (homes live here until an Estate app is scheduled).
import { useState } from 'react';
import { BIZ_BY_ID, BIZ_SECTORS } from '@/content/businesses';
import { compactMoney, money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { isAppUnlocked } from '@/shell/ctx';
import { Card, Stat, Tabs } from '@/components/ui';
import { Catalog } from './Catalog';
import { OwnedBusinesses } from './OwnedBusinesses';
import { PropertyMarket, OwnedProperty } from './Property';

type Tab = 'owned' | 'buy' | 'property' | 'homes';

export function BusinessesApp() {
  const me = useGame((s) => s.me)!;
  const [tab, setTab] = useState<Tab>(me.businesses.length ? 'owned' : 'buy');
  if (!isAppUnlocked('businesses', me.player.rankId)) return null;
  const income = me.businesses.reduce((s, b) => s + b.incomePerDay, 0);
  const invested = me.businesses.reduce((s, b) => s + b.invested, 0);
  const sectors = new Set(me.businesses.map((b) => BIZ_BY_ID.get(b.defId)!.sector)).size;
  return (
    <div className="flex flex-col gap-4" data-testid="empire-view">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-hero text-fg">{t('shell.app.businesses')}</h1>
            <p className="text-small text-fg-muted">{t('biz.intro')}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 @md:grid-cols-4">
            <Stat label={t('biz.stat.count')} value={me.businesses.length} />
            <Stat label={t('biz.stat.income')} value={<span className="text-gain">{money(income)}</span>} testId="empire-income" />
            <Stat label={t('biz.stat.invested')} value={compactMoney(invested)} />
            <Stat label={t('biz.stat.sectors')} value={t('biz.stat.sectorsOf', { n: sectors, total: BIZ_SECTORS.length })} />
          </div>
        </div>
      </Card>
      <Tabs<Tab>
        tabs={[
          { id: 'owned', label: t('biz.tab.owned'), badge: me.businesses.length },
          { id: 'buy', label: t('biz.tab.buy') },
          { id: 'property', label: t('biz.tab.property') },
          { id: 'homes', label: t('biz.tab.homes'), badge: me.properties.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'owned' && <OwnedBusinesses />}
      {tab === 'buy' && <Catalog onBought={() => setTab('owned')} />}
      {tab === 'property' && <PropertyMarket />}
      {tab === 'homes' && <OwnedProperty />}
    </div>
  );
}
