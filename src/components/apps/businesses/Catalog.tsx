'use client';

// The business catalog (Stage 4): a dense market table with search, sort and an inline Buy. A Buy only picks the
// business; the CommitBar above the table shows the cash before and after, and Confirm spends (one review, one confirm).
import { useState } from 'react';
import { CITIES } from '@/engine';
import { BIZ_BY_ID, BIZ_SECTORS, BUSINESSES, TIERS, type BizSectorId } from '@/content/businesses';
import { rankIndex } from '@/content/lifestyle';
import { compactMoney, money } from '@/game/format';
import { useGame } from '@/game/store';
import { CITY_DEMAND } from '@/world/assets';
import { t } from '@/i18n';
import { Button, Card, CommitBar, Select, Td, TextField, Th } from '@/components/ui';
import { unlockLine } from '../unlock';

type SortKey = 'payback' | 'perDay' | 'cost';

export function Catalog({ onBought }: { onBought: () => void }) {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [sector, setSector] = useState<BizSectorId | 'all'>('all');
  const [city, setCity] = useState('avalon');
  const [tierF, setTierF] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('payback');
  const [pick, setPick] = useState<string | null>(null);
  const rIdx = rankIndex(me.player.rankId);
  const cash = me.account?.cash ?? 0;
  const cities = CITIES.map((c) => {
    const locked = rIdx < rankIndex(c.unlockRank);
    return { value: c.id, label: locked ? t('biz.city.locked', { name: c.name }) : c.name, disabled: locked };
  });
  const demand = CITY_DEMAND[city] ?? 1;
  const needle = q.trim().toLowerCase();
  const rows = BUSINESSES
    .filter((b) => (sector === 'all' || b.sector === sector) && (tierF === 'all' || String(b.tier) === tierF))
    .filter((b) => !needle || b.name.toLowerCase().includes(needle) || (BIZ_SECTORS.find((s) => s.id === b.sector)?.name ?? '').toLowerCase().includes(needle))
    .map((d) => {
      const tier = TIERS[d.tier - 1]!;
      const inc = d.income * demand;
      return { d, tier, inc, payback: d.cost / inc, locked: rIdx < rankIndex(tier.rank) };
    })
    .sort((a, b) => (sort === 'payback' ? a.payback - b.payback : sort === 'perDay' ? b.inc - a.inc : a.d.cost - b.d.cost));
  const picked = pick ? rows.find((r) => r.d.id === pick) ?? null : null;
  const cityOpen = !cities.find((c) => c.value === city)?.disabled;
  return (
    <div className="flex flex-col gap-3" data-testid="catalog">
      <div className="flex flex-wrap items-center gap-2">
        <TextField value={q} onChange={setQ} placeholder={t('biz.search')} className="w-56" testId="biz-search" />
        <Select label={t('biz.filter.sector')} value={sector} onChange={(v) => setSector(v)} options={[{ value: 'all', label: t('biz.filter.allSectors', { n: BIZ_SECTORS.length }) }, ...BIZ_SECTORS.map((s) => ({ value: s.id, label: s.name }))]} testId="biz-sector" />
        <Select label={t('biz.filter.tier')} value={tierF} onChange={setTierF} options={[{ value: 'all', label: t('biz.filter.allTiers') }, ...TIERS.map((x) => ({ value: String(x.tier), label: `T${x.tier} ${x.name}` }))]} />
        <Select label={t('biz.filter.city')} value={city} onChange={setCity} options={cities} testId="biz-city" />
        <Select<SortKey> label={t('biz.sort.label')} value={sort} onChange={setSort} testId="biz-sort" options={[
          { value: 'payback', label: t('biz.sort.payback') },
          { value: 'perDay', label: t('biz.sort.perDay') },
          { value: 'cost', label: t('biz.sort.cost') },
        ]} />
        <span className="text-caption text-fg-faint">{t('biz.demand', { x: demand.toFixed(2) })} · {t('biz.count', { n: rows.length })}</span>
      </div>
      {picked && (
        <div className="sticky top-0 z-10">
          <CommitBar
            testId="biz-commit"
            title={t('commit.buyTitle', { name: picked.d.name })}
            rows={[
              { label: t('commit.cost'), value: money(picked.d.cost), testId: 'biz-commit-cost' },
              { label: t('commit.cashNow'), value: money(cash) },
              { label: t('commit.cashAfter'), value: money(cash - picked.d.cost), testId: 'biz-commit-after' },
            ]}
            confirmLabel={t('commit.confirmBuy')}
            disabled={!cityOpen || picked.locked || cash < picked.d.cost}
            onCancel={() => setPick(null)}
            onConfirm={async () => {
              const r = await act({ type: 'biz.buy', defId: picked.d.id, cityId: city }, { success: t('biz.bought', { name: picked.d.name }) });
              if (r.ok) { setPick(null); onBought(); }
            }}
          />
        </div>
      )}
      {rows.length === 0 ? (
        <Card className="p-6 text-center text-small text-fg-faint" data-testid="catalog-none">{t('biz.none')}</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-small" data-testid="catalog-table">
            <thead>
              <tr className="border-b border-ink-2 text-left">
                <Th>{t('biz.col.business')}</Th>
                <Th className="hidden @2xl:table-cell">{t('biz.col.sector')}</Th>
                <Th className="hidden @xl:table-cell">{t('biz.col.tier')}</Th>
                <Th right>{t('biz.cost')}</Th>
                <Th right>{t('biz.col.perDay')}</Th>
                <Th right className="hidden @md:table-cell">{t('biz.col.payback')}</Th>
                <Th right>{t('biz.col.action')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ d, tier, inc, payback, locked }) => {
                const sec = BIZ_SECTORS.find((s) => s.id === d.sector)!;
                const used = me.businesses.filter((b) => BIZ_BY_ID.get(b.defId)?.tier === d.tier).length;
                const full = used >= tier.max;
                const unlock = locked ? unlockLine(tier.rank, me.player.netWorthPeak) : null;
                return (
                  <tr key={d.id} className={`border-b border-ink-2 last:border-0 ${locked ? 'text-fg-faint' : ''} ${pick === d.id ? 'bg-brass/10' : ''}`} data-testid={`catalog-${d.id}`}>
                    <Td className="max-w-[14rem]">
                      <span className="block truncate font-semibold text-fg">{d.name}</span>
                      <span className="block truncate text-caption text-fg-faint">{d.blurb}</span>
                    </Td>
                    <Td className="hidden @2xl:table-cell">{sec.name}</Td>
                    <Td className="hidden @xl:table-cell">{t('biz.tierChip', { n: d.tier })} {tier.name}</Td>
                    <Td right num className="whitespace-nowrap text-fg">{compactMoney(d.cost)}</Td>
                    <Td right num className="whitespace-nowrap text-gain">{compactMoney(inc)}</Td>
                    <Td right num className="hidden whitespace-nowrap @md:table-cell">{t('biz.paybackValue', { n: payback.toFixed(1) })}</Td>
                    <Td right>
                      {unlock ? (
                        <span className="block max-w-[15rem] text-caption text-fg-faint" data-testid={`catalog-unlock-${d.id}`}>{unlock.text}</span>
                      ) : (
                        <Button size="sm" variant={pick === d.id ? 'brass' : 'outline'} disabled={full || cash < d.cost}
                          onClick={() => setPick(d.id)} testId={`buy-biz-${d.id}`}>
                          {full ? t('biz.full') : cash < d.cost ? t('biz.needMore', { amount: compactMoney(d.cost - cash) }) : t('biz.buyFor', { price: compactMoney(d.cost) })}
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
