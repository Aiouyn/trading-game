'use client';

// Boutique (Velvet app 11): the lifestyle shop and your collection, from the old Estate screen. Property
// lives in Businesses (Velvet's app table). Game money only; palettes are never sold here.
import { useState } from 'react';
import { LIFE_CATEGORIES, LIFE_ITEMS, RANKS, itemPrestige, rankIndex, resaleValue, type LifeCategory } from '@/content/lifestyle';
import { compactMoney, money, qty } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { isAppUnlocked } from '@/shell/ctx';
import { Button, Card, Chip, ConfirmButton, Stat, Tabs } from '@/components/ui';

type Tab = 'shop' | 'collection';

export function BoutiqueApp() {
  const me = useGame((s) => s.me)!;
  const [tab, setTab] = useState<Tab>('shop');
  const rank = RANKS.find((r) => r.id === me.player.rankId)!;
  if (!isAppUnlocked('boutique', me.player.rankId)) return null;
  return (
    <div className="flex flex-col gap-4" data-testid="estate-view">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-hero text-fg">{t('shell.app.boutique')}</h1>
            <p className="text-small text-fg-muted">{t('boutique.intro')}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 @md:grid-cols-3">
            <Stat label={t('boutique.stat.prestige')} value={<span className="text-brass-hi">{qty(Math.round(me.player.prestige))}</span>} testId="prestige" />
            <Stat label={t('boutique.stat.reputation')} value={Math.round(me.player.reputation)} />
            <Stat label={t('boutique.stat.shell')} value={rank.shell} />
          </div>
        </div>
      </Card>
      <Tabs<Tab>
        tabs={[
          { id: 'shop', label: t('boutique.tab.shop') },
          { id: 'collection', label: t('boutique.tab.collection'), badge: me.player.lifestyle.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'shop' ? <Shop /> : <Collection />}
    </div>
  );
}

function Shop() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const directory = useGame((s) => s.directory);
  const coll = useGame((s) => s.pub?.collectibles ?? 1);
  const [cat, setCat] = useState<LifeCategory | 'all'>('all');
  const rIdx = rankIndex(me.player.rankId);
  const cash = me.account?.cash ?? 0;
  // A unique item can be held once. The directory shows who holds what, but the shop only says "Taken":
  // another player's holdings are never named here.
  const held = new Set(directory.flatMap((d) => d.lifestyle));
  const items = LIFE_ITEMS.filter((i) => cat === 'all' || i.category === cat);
  const clsLabel = (cls: string) => t(`boutique.cls.${cls}`);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 overflow-x-auto" role="group" aria-label={t('boutique.categories')}>
        {[{ id: 'all' as const, name: t('boutique.all') }, ...LIFE_CATEGORIES].map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={cat === c.id} className={`shrink-0 rounded-chip border px-3 py-1 text-caption ${cat === c.id ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted'}`}>{c.name}</button>
        ))}
      </div>
      <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
        {items.map((i) => {
          const locked = rIdx < rankIndex(i.rank);
          const taken = i.cls === 'unique' && held.has(i.id);
          return (
            <Card key={i.id} className={`flex flex-col p-4 ${locked ? 'opacity-70' : ''}`} data-testid={`item-${i.id}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-body font-semibold">{i.name}</h3>
                <Chip className={i.cls === 'unique' ? 'border-brass/50 text-brass-hi' : i.cls === 'limited' ? 'border-info/50 text-info' : ''}>{clsLabel(i.cls)}</Chip>
              </div>
              <p className="mt-1 flex-1 text-small text-fg-muted">{i.blurb}</p>
              {i.perk && <p className="mt-1 text-caption text-brass">{i.perk}</p>}
              <div className="num mt-3 flex flex-wrap justify-between gap-x-2 text-caption">
                <span className="text-fg">{money(i.price)}</span>
                <span className="text-brass-hi">{t('boutique.pp', { n: Math.round(itemPrestige(i, 0)) })}</span>
                <span className="text-fg-faint">{i.upkeep ? t('boutique.upkeep', { x: (i.upkeep * 100).toFixed(1) }) : t('boutique.noUpkeep')}</span>
              </div>
              <Button size="sm" variant={locked || taken ? 'outline' : 'brass'} className="mt-3" disabled={locked || taken || cash < i.price}
                onClick={() => act({ type: 'life.buy', itemId: i.id }, { success: t('boutique.yours', { name: i.name }) })} testId={`buy-item-${i.id}`}>
                {taken ? t('boutique.taken') : locked ? t('common.unlocksAt', { rank: t(`rank.${i.rank}`) }) : t('boutique.buyFor', { price: compactMoney(i.price) })}
              </Button>
            </Card>
          );
        })}
      </div>
      <p className="text-caption text-fg-faint">{t('boutique.prestigeNote', { index: (coll).toFixed(2) })}</p>
    </div>
  );
}

function Collection() {
  const me = useGame((s) => s.me)!;
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const act = useGame((s) => s.act);
  const coll = useGame((s) => s.pub?.collectibles ?? 1);
  if (!me.player.lifestyle.length) return <Card className="p-8 text-center font-serif text-title text-fg-muted">{t('boutique.empty')}</Card>;
  return (
    <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
      {me.player.lifestyle.map((o) => {
        const i = LIFE_ITEMS.find((x) => x.id === o.itemId)!;
        const age = (tick - o.boughtTick) / 720;
        const v = resaleValue(i, o.paid, age, coll);
        return (
          <Card key={o.uid} className="p-4">
            <div className="flex items-start justify-between gap-2"><h3 className="text-body font-semibold">{i.name}</h3><span className="num text-caption text-brass-hi">{t('boutique.pp', { n: Math.round(itemPrestige(i, age)) })}</span></div>
            <p className="num mt-1 text-caption text-fg-faint">{t('boutique.paid', { paid: money(o.paid), resale: money(v), days: age.toFixed(1) })}</p>
            {i.cls !== 'consumed' ? (
              <div className="mt-3"><ConfirmButton confirm={t('boutique.sellFor', { amount: compactMoney(v) })} onConfirm={() => act({ type: 'life.sell', uid: o.uid })}>{t('common.sell')}</ConfirmButton></div>
            ) : <p className="mt-3 text-caption text-fg-faint">{t('boutique.experience')}</p>}
          </Card>
        );
      })}
    </div>
  );
}
