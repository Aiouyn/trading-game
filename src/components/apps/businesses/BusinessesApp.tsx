'use client';

// Businesses (Velvet app 5): owned businesses, the 156-business catalog and, per Velvet's table, the
// property that used to live in Estate (homes live here until an Estate app is scheduled).
import { useState } from 'react';
import { BIZ_BY_ID, BIZ_SECTORS } from '@/content/businesses';
import { compactMoney, money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { isAppUnlocked } from '@/shell/ctx';
import { StatStrip, Tabs } from '@/components/ui';
import { Catalog } from './Catalog';
import { OwnedBusinesses } from './OwnedBusinesses';
import { PropertyMarket, OwnedProperty } from './Property';
import { ShopsTab } from './Shops';

type Tab = 'owned' | 'shops' | 'buy' | 'property' | 'homes';

export function BusinessesApp({view}: {view?:string} = {}) {
  const me = useGame((s) => s.me)!;
  const [tab, setTab] = useState<Tab>(view==='homes'?'homes':view==='owned'?'owned':me.businesses.length ? 'owned' : 'buy');
  if (!isAppUnlocked('businesses', me.player.rankId)) return null;
  const income = me.businesses.reduce((s, b) => s + b.incomePerDay, 0);
  const invested = me.businesses.reduce((s, b) => s + b.invested, 0);
  const sectors = new Set(me.businesses.map((b) => BIZ_BY_ID.get(b.defId)!.sector)).size;
  return (
    <div className="flex flex-col gap-4" data-testid="empire-view">
      <StatStrip
        testId="biz-stats"
        intro={t('biz.intro')}
        items={[
          { label: t('biz.stat.count'), value: me.businesses.length },
          { label: t('biz.stat.income'), value: <span className="text-gain">{money(income)}</span>, testId: 'empire-income' },
          { label: t('biz.stat.invested'), value: compactMoney(invested) },
          { label: t('biz.stat.sectors'), value: t('biz.stat.sectorsOf', { n: sectors, total: BIZ_SECTORS.length }) },
        ]}
      />
      <Tabs<Tab>
        tabs={[
          { id: 'owned', label: t('biz.tab.owned'), badge: me.businesses.length },
          { id: 'shops', label: t('biz.tab.shops') },
          { id: 'buy', label: t('biz.tab.buy') },
          { id: 'property', label: t('biz.tab.property') },
          { id: 'homes', label: t('biz.tab.homes'), badge: me.properties.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'owned' && <OwnedBusinesses onBrowse={() => setTab('buy')} />}
      {tab === 'shops' && <ShopsTab onBuy={() => setTab('buy')} />}
      {tab === 'buy' && <Catalog onBought={() => setTab('owned')} />}
      {tab === 'property' && <PropertyMarket />}
      {tab === 'homes' && <OwnedProperty onBrowse={() => setTab('property')} />}
    </div>
  );
}
