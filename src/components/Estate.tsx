'use client';

import { useState } from 'react';
import { CITIES, districtAssetId } from '@/engine';
import {
  LIFE_CATEGORIES, LIFE_ITEMS, PROPERTY_TYPES, PROPERTY_TYPE_BY_ID, RANKS, TIER_VALUE_MULT, itemPrestige, rankIndex, resaleValue,
  type LifeCategory,
} from '@/content/lifestyle';
import { compactMoney, money, signedPct } from '@/game/format';
import { CONFIG, useGame } from '@/game/store';
import { BrassChip, Button, Card, Chip, ConfirmButton, LockGlyph, Select, Stat, Tabs } from './ui';

export function EstateView() {
  const me = useGame((s) => s.me)!;
  const [tab, setTab] = useState<'property' | 'mine' | 'shop' | 'collection'>('property');
  const rank = RANKS.find((r) => r.id === me.player.rankId)!;
  return (
    <div className="flex flex-col gap-4" data-testid="estate-view">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-hero text-fg">Estate</h1>
            <p className="text-small text-fg-muted">Property pays rent and rides the cycle. Lifestyle turns money into Prestige: status, access and a target on your back.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            <Stat label="Prestige" value={<span className="text-brass-hi">{Math.round(me.player.prestige).toLocaleString('en-US')}</span>} testId="prestige" />
            <Stat label="Reputation" value={Math.round(me.player.reputation)} />
            <Stat label="Properties" value={me.properties.length} />
            <Stat label="Shell" value={rank.shell} />
          </div>
        </div>
      </Card>
      <Tabs tabs={[
        { id: 'property', label: 'Property market' }, { id: 'mine', label: 'Your property', badge: me.properties.length },
        { id: 'shop', label: 'Lifestyle shop' }, { id: 'collection', label: 'Your collection', badge: me.player.lifestyle.length },
      ]} value={tab} onChange={setTab} />
      {tab === 'property' && <PropertyMarket />}
      {tab === 'mine' && <MyProperty />}
      {tab === 'shop' && <Shop />}
      {tab === 'collection' && <Collection />}
    </div>
  );
}

function districtIndexOf(world: ReturnType<typeof useGame.getState>['world'], cityId: string, districtId: string): number {
  const i = CONFIG.assets.findIndex((a) => a.id === districtAssetId(cityId, districtId));
  return i < 0 || !world ? 100 : Math.exp(world.assets[i]!.lnP);
}

function PropertyMarket() {
  const me = useGame((s) => s.me)!;
  const world = useGame((s) => s.world)!;
  const act = useGame((s) => s.act);
  const [cityId, setCity] = useState('avalon');
  const [ltv, setLtv] = useState(0);
  const rIdx = rankIndex(me.player.rankId);
  const city = CITIES.find((c) => c.id === cityId)!;
  const cityLocked = rIdx < rankIndex(city.unlockRank);
  const maxLtv = rIdx >= 1 ? 0.7 : 0;
  const cash = me.account?.cash ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select label="City" value={cityId} onChange={setCity} options={CITIES.map((c) => ({ value: c.id, label: `${c.name}${rIdx < rankIndex(c.unlockRank) ? ` (${RANKS.find((r) => r.id === c.unlockRank)!.name})` : ''}` }))} testId="prop-city" />
        <label className="flex items-center gap-2 text-small text-fg-muted">
          Mortgage
          <input type="range" min={0} max={maxLtv * 100} step={5} value={ltv * 100} disabled={!maxLtv} onChange={(e) => setLtv(Number(e.target.value) / 100)} data-testid="ltv" />
          <span className="num w-10 text-fg">{Math.round(ltv * 100)}%</span>
        </label>
        <span className="text-caption text-fg-faint">{maxLtv ? `Rate ${(me.mortgageRate * 100).toFixed(2)}% (10-year yield + 2%)` : 'Mortgages unlock at Hustler'}</span>
      </div>
      <p className="text-small text-fg-muted">{city.blurb}</p>
      {cityLocked && <Card className="flex items-center gap-3 p-4"><LockGlyph /><span className="text-small text-fg-muted">{city.name} opens at {RANKS.find((r) => r.id === city.unlockRank)!.name}.</span></Card>}
      {city.districts.map((d) => {
        const idx = districtIndexOf(world, city.id, d.id);
        const types = PROPERTY_TYPES.filter((t) => t.tiers.includes(d.tier));
        return (
          <Card key={d.id} className="p-4" data-testid={`district-${d.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-serif text-title">{d.name}</h3>
                <p className="text-caption text-fg-faint">{d.blurb} · {d.tier} district</p>
              </div>
              <span className="num text-small text-fg-muted">Index {idx.toFixed(1)} <span className={idx >= 100 ? 'text-gain' : 'text-loss'}>{signedPct(idx / 100 - 1)}</span></span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {types.map((t) => {
                const price = Math.round(t.value * TIER_VALUE_MULT[d.tier] * (idx / 100));
                const down = price * (1 - ltv) + price * 0.02;
                const locked = cityLocked || rIdx < rankIndex(t.rank);
                return (
                  <div key={t.id} className="flex flex-col rounded-md border border-ink-3 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-small font-semibold">{t.name}</span>
                      {t.home && <Chip>Home</Chip>}
                    </div>
                    <p className="mt-1 flex-1 text-caption text-fg-faint">{t.blurb}</p>
                    <div className="num mt-2 flex justify-between text-caption">
                      <span className="text-fg">{compactMoney(price)}</span>
                      <span className="text-gain">{(t.rentYield * 100).toFixed(1)}% rent</span>
                      <span className="text-fg-faint">{(t.upkeep * 100).toFixed(1)}% upkeep</span>
                    </div>
                    <Button size="sm" variant={locked ? 'outline' : 'brass'} className="mt-2" disabled={locked || cash < down}
                      onClick={() => act({ type: 'prop.buy', cityId: city.id, districtId: d.id, typeId: t.id, ltv }, { success: `You bought a ${t.name.toLowerCase()} in ${d.name}` })} testId={`buy-prop-${d.id}-${t.id}`}>
                      {locked ? `Unlocks at ${RANKS.find((r) => r.id === (cityLocked ? city.unlockRank : t.rank))!.name}` : `Buy · ${compactMoney(down)} down`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function MyProperty() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  if (!me.properties.length) return <Card className="p-8 text-center font-serif text-title text-fg-muted">No property yet.</Card>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {me.properties.map((p) => {
        const t = PROPERTY_TYPE_BY_ID.get(p.typeId)!;
        const city = CITIES.find((c) => c.id === p.cityId)!;
        const d = city.districts.find((x) => x.id === p.districtId)!;
        const home = me.player.homePropId === p.id;
        const gain = p.value / p.paid - 1;
        return (
          <Card key={p.id} className="p-4" data-testid={`prop-${p.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-serif text-title">{t.name}</h3>
                <p className="text-caption text-fg-faint">{d.name}, {city.name}{p.improvement > 1.01 ? ` · renovated ×${p.improvement.toFixed(2)}` : ''}</p>
              </div>
              {home ? <BrassChip>Your home</BrassChip> : <Chip>Rented out</Chip>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Value" value={compactMoney(p.value)} sub={<span className={gain >= 0 ? 'text-gain' : 'text-loss'}>{signedPct(gain)}</span>} />
              <Stat label="Mortgage" value={compactMoney(p.mortgage)} sub={p.mortgage ? `${(p.mortgageRate * 100).toFixed(2)}%` : undefined} />
              <Stat label="Equity" value={compactMoney(p.value - p.mortgage)} />
              <Stat label="Rent earned" value={compactMoney(p.rentEarned)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.home && !home && <Button size="sm" onClick={() => act({ type: 'prop.home', propId: p.id }, { success: 'Moved in. Homes earn Prestige instead of rent.' })}>Live here</Button>}
              {home && <Button size="sm" onClick={() => act({ type: 'prop.home', propId: null })}>Move out (rent it)</Button>}
              <Button size="sm" disabled={p.improvement >= 1.5} onClick={() => act({ type: 'prop.renovate', propId: p.id }, { success: 'Renovated: +15% value' })}>Renovate · {compactMoney(p.value * 0.12)}</Button>
              {p.mortgage > 0 && <Button size="sm" onClick={() => act({ type: 'prop.repay', propId: p.id, amount: p.mortgage })}>Repay mortgage</Button>}
              <ConfirmButton confirm={`Sell for ${compactMoney(p.value * 0.98 - p.mortgage)} net`} onConfirm={() => act({ type: 'prop.sell', propId: p.id })}>Sell</ConfirmButton>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Shop() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const directory = useGame((s) => s.directory);
  const [cat, setCat] = useState<LifeCategory | 'all'>('all');
  const rIdx = rankIndex(me.player.rankId);
  const cash = me.account?.cash ?? 0;
  const owners = new Map<string, string>();
  for (const d of directory) for (const id of d.lifestyle) owners.set(id, d.handle);
  const items = LIFE_ITEMS.filter((i) => cat === 'all' || i.category === cat);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 overflow-x-auto">
        {[{ id: 'all' as const, name: 'All' }, ...LIFE_CATEGORIES].map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`shrink-0 rounded-chip border px-3 py-1 text-caption ${cat === c.id ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted'}`}>{c.name}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => {
          const locked = rIdx < rankIndex(i.rank);
          const takenBy = i.cls === 'unique' ? owners.get(i.id) : undefined;
          return (
            <Card key={i.id} className={`flex flex-col p-4 ${locked ? 'opacity-70' : ''}`} data-testid={`item-${i.id}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-body font-semibold">{i.name}</h3>
                <Chip className={i.cls === 'unique' ? 'border-brass/50 text-brass-hi' : i.cls === 'limited' ? 'border-info/50 text-info' : ''}>{i.cls}</Chip>
              </div>
              <p className="mt-1 flex-1 text-small text-fg-muted">{i.blurb}</p>
              {i.perk && <p className="mt-1 text-caption text-brass">{i.perk}</p>}
              <div className="num mt-3 flex justify-between text-caption">
                <span className="text-fg">{money(i.price)}</span>
                <span className="text-brass-hi">+{Math.round(itemPrestige(i, 0))} PP</span>
                <span className="text-fg-faint">{i.upkeep ? `${(i.upkeep * 100).toFixed(1)}%/yr upkeep` : 'no upkeep'}</span>
              </div>
              <Button size="sm" variant={locked || takenBy ? 'outline' : 'brass'} className="mt-3" disabled={locked || !!takenBy || cash < i.price}
                onClick={() => act({ type: 'life.buy', itemId: i.id }, { success: `${i.name}: yours.` })} testId={`buy-item-${i.id}`}>
                {takenBy ? `Owned by ${takenBy}` : locked ? `Unlocks at ${RANKS.find((r) => r.id === i.rank)!.name}` : `Buy for ${compactMoney(i.price)}`}
              </Button>
            </Card>
          );
        })}
      </div>
      <p className="text-caption text-fg-faint">Prestige counts the best item in each category fully, the second half, the third a third: breadth beats forty identical cars. Mass items fade; limited and unique pieces gain heritage and track the collectibles index ({(useGame.getState().pub?.collectibles ?? 1).toFixed(2)}×).</p>
    </div>
  );
}

function Collection() {
  const me = useGame((s) => s.me)!;
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const act = useGame((s) => s.act);
  const coll = useGame((s) => s.pub?.collectibles ?? 1);
  if (!me.player.lifestyle.length) return <Card className="p-8 text-center font-serif text-title text-fg-muted">Nothing here yet. Treat yourself.</Card>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {me.player.lifestyle.map((o) => {
        const i = LIFE_ITEMS.find((x) => x.id === o.itemId)!;
        const age = (tick - o.boughtTick) / 720;
        const v = resaleValue(i, o.paid, age, coll);
        return (
          <Card key={o.uid} className="p-4">
            <div className="flex items-start justify-between"><h3 className="text-body font-semibold">{i.name}</h3><span className="num text-caption text-brass-hi">{Math.round(itemPrestige(i, age))} PP</span></div>
            <p className="num mt-1 text-caption text-fg-faint">Paid {money(o.paid)} · resale {money(v)} · {age.toFixed(1)} days</p>
            {i.cls !== 'consumed' ? (
              <div className="mt-3"><ConfirmButton confirm={`Sell for ${compactMoney(v)}`} onConfirm={() => act({ type: 'life.sell', uid: o.uid })}>Sell</ConfirmButton></div>
            ) : <p className="mt-3 text-caption text-fg-faint">An experience: the memory fades after 30 days.</p>}
          </Card>
        );
      })}
    </div>
  );
}

export { LockGlyph };
