'use client';

import { useMemo, useState } from 'react';
import { CITIES } from '@/engine';
import {
  BIZ_BY_ID, BIZ_EVENTS, BIZ_SECTORS, BUSINESSES, MAX_UPGRADE, TIERS, UPGRADES, upgradeCost, type BizSectorId,
} from '@/content/businesses';
import { RANKS, rankIndex } from '@/content/lifestyle';
import { compactMoney, money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import type { Business } from '@/world/types';
import { CITY_DEMAND } from '@/world/assets';
import { BrassChip, Button, Card, CardHeader, Chip, ConfirmButton, LockGlyph, Select, Stat, Tabs, TextField } from './ui';

export function EmpireView() {
  const me = useGame((s) => s.me)!;
  const [tab, setTab] = useState<'owned' | 'buy'>(me.businesses.length ? 'owned' : 'buy');
  const income = me.businesses.reduce((s, b) => s + b.incomePerDay, 0);
  const invested = me.businesses.reduce((s, b) => s + b.invested, 0);
  const sectors = new Set(me.businesses.map((b) => BIZ_BY_ID.get(b.defId)!.sector)).size;
  return (
    <div className="flex flex-col gap-4" data-testid="empire-view">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-hero text-fg">Empire</h1>
            <p className="text-small text-fg-muted">Businesses earn every tick, even while you sleep. They compete for each city’s customers: upgrades win share, crowding loses it.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            <Stat label="Businesses" value={me.businesses.length} />
            <Stat label="Income / game day" value={<span className="text-gain">{money(income)}</span>} testId="empire-income" />
            <Stat label="Invested" value={compactMoney(invested)} />
            <Stat label="Sectors" value={`${sectors} / 13`} />
          </div>
        </div>
      </Card>
      <Tabs tabs={[{ id: 'owned', label: 'Your businesses', badge: me.businesses.length }, { id: 'buy', label: 'Buy a business' }]} value={tab} onChange={setTab} />
      {tab === 'owned' ? <Owned /> : <Catalog onBought={() => setTab('owned')} />}
    </div>
  );
}

function Owned() {
  const me = useGame((s) => s.me)!;
  if (!me.businesses.length) {
    return <Card className="p-8 text-center"><p className="font-serif text-title text-fg-muted">No businesses yet.</p><p className="mt-2 text-small text-fg-faint">A street food cart costs $1,500 and pays for itself in about a real day. Upgrades and higher tiers pay more.</p></Card>;
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {me.businesses.slice().sort((a, b) => b.incomePerDay - a.incomePerDay).map((b) => <BizCard key={b.id} b={b} />)}
    </div>
  );
}

function BizCard({ b }: { b: Business }) {
  const act = useGame((s) => s.act);
  const cash = useGame((s) => s.me?.account?.cash ?? 0);
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const def = BIZ_BY_ID.get(b.defId)!;
  const sec = BIZ_SECTORS.find((s) => s.id === def.sector)!;
  const [name, setName] = useState<string | null>(null);
  const ev = b.event && b.event.untilTick > tick ? BIZ_EVENTS.find((e) => e.id === b.event!.id) : null;
  return (
    <Card className="p-4" data-testid={`biz-${b.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {name === null ? (
            <button type="button" className="text-left font-serif text-title text-fg hover:underline" onClick={() => setName(b.name)} title="Rename">{b.name}</button>
          ) : (
            <div className="flex gap-2">
              <TextField value={name} onChange={setName} maxLength={40} className="h-9" onEnter={async () => { await act({ type: 'biz.rename', bizId: b.id, name }); setName(null); }} autoFocus />
              <Button size="sm" onClick={async () => { await act({ type: 'biz.rename', bizId: b.id, name }); setName(null); }}>Save</Button>
            </div>
          )}
          <p className="text-caption text-fg-faint">{def.name} · {sec.name} · T{def.tier} {TIERS[def.tier - 1]!.name} · {CITIES.find((c) => c.id === b.cityId)?.name}</p>
        </div>
        <div className="text-right">
          <div className="num text-body text-gain">{money(b.incomePerDay)}<span className="text-caption text-fg-faint"> / day</span></div>
          <div className="num text-caption text-fg-faint">share {pct(b.share)} · earned {compactMoney(b.earned)}</div>
        </div>
      </div>
      {ev && <div className="mt-2"><Chip className={ev.good ? 'border-gain/50 text-gain' : 'border-loss/50 text-loss'}>{ev.title} · {ev.mult >= 1 ? '+' : '−'}{Math.round(Math.abs(ev.mult - 1) * 100)}%</Chip></div>}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {UPGRADES.map((u) => {
          const lvl = b.levels[u.id];
          const cost = upgradeCost(def.cost, lvl);
          const maxed = lvl >= MAX_UPGRADE;
          return (
            <div key={u.id} className="rounded-md border border-ink-3 p-2.5" title={u.blurb}>
              <div className="flex items-center justify-between">
                <span className="text-small font-medium">{u.name}</span>
                <span className="flex gap-0.5" aria-label={`Level ${lvl} of ${MAX_UPGRADE}`}>
                  {Array.from({ length: MAX_UPGRADE }, (_, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${k < lvl ? 'bg-brass' : 'bg-ink-3'}`} />)}
                </span>
              </div>
              <p className="mt-0.5 text-caption text-fg-faint">{u.effect}</p>
              <Button size="sm" className="mt-2 w-full" disabled={maxed || cash < cost} onClick={() => act({ type: 'biz.upgrade', bizId: b.id, axis: u.id })} testId={`upgrade-${b.id}-${u.id}`}>
                {maxed ? 'Maxed' : compactMoney(cost)}
              </Button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <ConfirmButton confirm={`Sell for ${compactMoney(b.invested * 0.7)}`} onConfirm={() => act({ type: 'biz.sell', bizId: b.id })} testId={`sell-${b.id}`}>Sell</ConfirmButton>
      </div>
    </Card>
  );
}

function Catalog({ onBought }: { onBought: () => void }) {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [sector, setSector] = useState<BizSectorId | 'all'>('all');
  const [city, setCity] = useState('avalon');
  const [tierF, setTierF] = useState<string>('all');
  const rIdx = rankIndex(me.player.rankId);
  const cash = me.account?.cash ?? 0;
  const cities = CITIES.map((c) => ({ value: c.id, label: `${c.name}${rIdx < rankIndex(c.unlockRank) ? ' (locked)' : ''}`, disabled: rIdx < rankIndex(c.unlockRank) }));
  const list = useMemo(() => BUSINESSES.filter((b) => (sector === 'all' || b.sector === sector) && (tierF === 'all' || String(b.tier) === tierF)), [sector, tierF]);
  const demand = CITY_DEMAND[city] ?? 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select label="Sector" value={sector} onChange={(v) => setSector(v)} options={[{ value: 'all', label: 'All 13 sectors' }, ...BIZ_SECTORS.map((s) => ({ value: s.id, label: s.name }))]} testId="biz-sector" />
        <Select label="Tier" value={tierF} onChange={setTierF} options={[{ value: 'all', label: 'All tiers' }, ...TIERS.map((t) => ({ value: String(t.tier), label: `T${t.tier} ${t.name}` }))]} />
        <Select label="City" value={city} onChange={setCity} options={cities} testId="biz-city" />
        <span className="text-caption text-fg-faint">Demand in this city ×{demand.toFixed(2)}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((d) => {
          const t = TIERS[d.tier - 1]!;
          const locked = rIdx < rankIndex(t.rank);
          const used = me.businesses.filter((b) => BIZ_BY_ID.get(b.defId)!.tier === d.tier).length;
          const full = used >= t.max;
          const inc = d.income * demand;
          const sec = BIZ_SECTORS.find((s) => s.id === d.sector)!;
          return (
            <Card key={d.id} className={`flex flex-col p-4 ${locked ? 'opacity-70' : ''}`} data-testid={`catalog-${d.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-body font-semibold">{d.name}</h3>
                  <p className="text-caption text-fg-faint">{sec.name} · T{d.tier} {t.name}</p>
                </div>
                {locked ? <span className="flex items-center gap-1 text-caption text-fg-faint"><LockGlyph size={14} /> {RANKS.find((r) => r.id === t.rank)!.name}</span> : <BrassChip>T{d.tier}</BrassChip>}
              </div>
              <p className="mt-2 flex-1 text-small text-fg-muted">{d.blurb}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-caption">
                <div><div className="label">Cost</div><div className="num text-fg">{compactMoney(d.cost)}</div></div>
                <div><div className="label">Per day</div><div className="num text-gain">{compactMoney(inc)}</div></div>
                <div><div className="label">Payback</div><div className="num text-fg">{(d.cost / inc).toFixed(1)} d</div></div>
              </div>
              {(d.power || d.compute || d.feeds) && (
                <p className="mt-2 text-caption text-brass">
                  {d.power ? `Powers your data centers: ${d.power} MWh/day. ` : ''}{d.compute ? `Supplies compute. ` : ''}{d.feeds ? `Supplies ${BIZ_SECTORS.find((s) => s.id === d.feeds)?.name}: +5% to those businesses.` : ''}
                </p>
              )}
              {!locked && <p className="num mt-2 text-caption text-fg-faint">{t.name} slots {used}/{t.max}</p>}
              <Button variant={locked || full ? 'outline' : 'brass'} className="mt-3 w-full" disabled={locked || full || cash < d.cost}
                onClick={async () => { const r = await act({ type: 'biz.buy', defId: d.id, cityId: city }, { success: `You now own ${d.name}` }); if (r.ok) onBought(); }} testId={`buy-biz-${d.id}`}>
                {locked ? `Unlocks at ${RANKS.find((r) => r.id === t.rank)!.name}` : full ? 'All slots in use' : cash < d.cost ? `Need ${compactMoney(d.cost - cash)} more` : `Buy for ${money(d.cost)}`}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
