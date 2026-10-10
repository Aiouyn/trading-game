'use client';

import { useMemo, useState } from 'react';
import { CITIES } from '@/engine';
import { BIZ_BY_ID, BIZ_SECTORS, BUSINESSES, TIERS, type BizSectorId } from '@/content/businesses';
import { rankIndex } from '@/content/lifestyle';
import { compactMoney, money } from '@/game/format';
import { useGame } from '@/game/store';
import { CITY_DEMAND } from '@/world/assets';
import { t } from '@/i18n';
import { BrassChip, Button, Card, LockGlyph, Select } from '@/components/ui';

export function Catalog({ onBought }: { onBought: () => void }) {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [sector, setSector] = useState<BizSectorId | 'all'>('all');
  const [city, setCity] = useState('avalon');
  const [tierF, setTierF] = useState<string>('all');
  const rIdx = rankIndex(me.player.rankId);
  const cash = me.account?.cash ?? 0;
  const rankName = (id: string) => t(`rank.${id}`);
  const cities = CITIES.map((c) => {
    const locked = rIdx < rankIndex(c.unlockRank);
    return { value: c.id, label: locked ? t('biz.city.locked', { name: c.name }) : c.name, disabled: locked };
  });
  const list = useMemo(() => BUSINESSES.filter((b) => (sector === 'all' || b.sector === sector) && (tierF === 'all' || String(b.tier) === tierF)), [sector, tierF]);
  const demand = CITY_DEMAND[city] ?? 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select label={t('biz.filter.sector')} value={sector} onChange={(v) => setSector(v)} options={[{ value: 'all', label: t('biz.filter.allSectors', { n: BIZ_SECTORS.length }) }, ...BIZ_SECTORS.map((s) => ({ value: s.id, label: s.name }))]} testId="biz-sector" />
        <Select label={t('biz.filter.tier')} value={tierF} onChange={setTierF} options={[{ value: 'all', label: t('biz.filter.allTiers') }, ...TIERS.map((x) => ({ value: String(x.tier), label: `T${x.tier} ${x.name}` }))]} />
        <Select label={t('biz.filter.city')} value={city} onChange={setCity} options={cities} testId="biz-city" />
        <span className="text-caption text-fg-faint">{t('biz.demand', { x: demand.toFixed(2) })}</span>
      </div>
      <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
        {list.map((d) => {
          const tier = TIERS[d.tier - 1]!;
          const locked = rIdx < rankIndex(tier.rank);
          const used = me.businesses.filter((b) => BIZ_BY_ID.get(b.defId)?.tier === d.tier).length;
          const full = used >= tier.max;
          const inc = d.income * demand;
          const sec = BIZ_SECTORS.find((s) => s.id === d.sector)!;
          return (
            <Card key={d.id} className={`flex flex-col p-4 ${locked ? 'opacity-70' : ''}`} data-testid={`catalog-${d.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-body font-semibold">{d.name}</h3>
                  <p className="text-caption text-fg-faint">{t('biz.tierLine', { sector: sec.name, tier: d.tier, name: tier.name })}</p>
                </div>
                {locked ? <span className="flex items-center gap-1 text-caption text-fg-faint"><LockGlyph size={14} /> {rankName(tier.rank)}</span> : <BrassChip>{t('biz.tierChip', { n: d.tier })}</BrassChip>}
              </div>
              <p className="mt-2 flex-1 text-small text-fg-muted">{d.blurb}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-caption">
                <div><div className="label">{t('biz.cost')}</div><div className="num text-fg">{compactMoney(d.cost)}</div></div>
                <div><div className="label">{t('biz.perDayLabel')}</div><div className="num text-gain">{compactMoney(inc)}</div></div>
                <div><div className="label">{t('biz.payback')}</div><div className="num text-fg">{t('biz.paybackValue', { n: (d.cost / inc).toFixed(1) })}</div></div>
              </div>
              {(d.power || d.compute || d.feeds) && (
                <p className="mt-2 text-caption text-brass">
                  {d.power ? t('biz.power', { n: d.power }) + ' ' : ''}{d.compute ? t('biz.compute') + ' ' : ''}{d.feeds ? t('biz.feeds', { sector: BIZ_SECTORS.find((s) => s.id === d.feeds)?.name ?? '' }) : ''}
                </p>
              )}
              {!locked && <p className="num mt-2 text-caption text-fg-faint">{t('biz.slots', { name: tier.name, used, max: tier.max })}</p>}
              <Button variant={locked || full ? 'outline' : 'brass'} className="mt-3 w-full" disabled={locked || full || cash < d.cost}
                onClick={async () => { const r = await act({ type: 'biz.buy', defId: d.id, cityId: city }, { success: t('biz.bought', { name: d.name }) }); if (r.ok) onBought(); }} testId={`buy-biz-${d.id}`}>
                {locked ? t('common.unlocksAt', { rank: rankName(tier.rank) }) : full ? t('biz.full') : cash < d.cost ? t('biz.needMore', { amount: compactMoney(d.cost - cash) }) : t('biz.buyFor', { price: money(d.cost) })}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
