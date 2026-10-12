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
import { Button, Card, CommitBar, Segmented, Select, TextField } from '@/components/ui';
import { unlockLine } from '../unlock';

type SortKey = 'payback' | 'perDay' | 'cost';

/** The most units one Max buy sends, so a large cash balance cannot flood the shop with commands. */
const MAX_BATCH = 20;

export function Catalog({ onBought }: { onBought: () => void }) {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [sector, setSector] = useState<BizSectorId | 'all'>('all');
  const [city, setCity] = useState('avalon');
  const [tierF, setTierF] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('payback');
  const [pick, setPick] = useState<string | null>(null);
  // How many of the picked business to buy: one, five, or as many as the cash covers (capped, so one tap is never a flood).
  const [qty, setQty] = useState<'1' | '5' | 'max'>('1');
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
  const unitCost = picked?.d.cost ?? 0;
  const count = !picked ? 1 : qty === '1' ? 1 : qty === '5' ? 5 : Math.max(1, Math.min(MAX_BATCH, Math.floor(cash / unitCost)));
  const total = unitCost * count;
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
        <div className="sticky top-0 z-10 flex flex-col gap-2">
          <Segmented<'1' | '5' | 'max'>
            size="sm"
            label={t('commit.qty')}
            value={qty}
            onChange={setQty}
            className="self-start"
            options={[
              { value: '1', label: '×1', testId: 'biz-qty-1' },
              { value: '5', label: '×5', testId: 'biz-qty-5', disabled: cash < unitCost * 5 },
              { value: 'max', label: t('commit.qty.max'), testId: 'biz-qty-max', disabled: cash < unitCost },
            ]}
          />
          <CommitBar
            testId="biz-commit"
            title={t('commit.buyTitle', { name: picked.d.name })}
            rows={[
              { label: t('commit.qty'), value: String(count), testId: 'biz-commit-qty' },
              { label: t('commit.cost'), value: money(total), testId: 'biz-commit-cost' },
              { label: t('commit.cashNow'), value: money(cash) },
              { label: t('commit.cashAfter'), value: money(cash - total), testId: 'biz-commit-after' },
            ]}
            confirmLabel={t('commit.confirmBuy')}
            disabled={!cityOpen || picked.locked || cash < unitCost}
            onCancel={() => { setPick(null); setQty('1'); }}
            onConfirm={async () => {
              // one buy command per unit: the first refusal stops the run, and the units already bought stay bought
              let bought = 0;
              for (let i = 0; i < count; i++) {
                const last = i === count - 1;
                const r = await act({ type: 'biz.buy', defId: picked.d.id, cityId: city }, last ? { success: t('biz.bought', { name: picked.d.name }) } : { silent: true });
                if (!r.ok) break;
                bought++;
              }
              if (bought > 0) { setPick(null); setQty('1'); onBought(); }
            }}
          />
        </div>
      )}
      {rows.length === 0 ? (
        <Card className="p-6 text-center text-small text-fg-faint" data-testid="catalog-none">{t('biz.none')}</Card>
      ) : (
        // A row is a grid. In a narrow panel (under the container's xl, about 576 px) the name sits on top and the cost beside
        // it, with the Buy button full width below, so no text depends on the panel's width (UX stage 6, item 5).
        <Card className="overflow-hidden">
          <div className="flex flex-col" data-testid="catalog-table" role="list">
            <div aria-hidden className="hidden border-b border-ink-2 px-4 py-2 text-caption text-fg-faint @xl:grid @xl:grid-cols-[minmax(0,2fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto] @xl:gap-x-4">
              <span>{t('biz.col.business')}</span>
              <span>{t('biz.col.tier')}</span>
              <span className="text-right">{t('biz.cost')}</span>
              <span className="text-right">{t('biz.col.perDay')}</span>
              <span className="text-right">{t('biz.col.action')}</span>
            </div>
            {rows.map(({ d, tier, inc, payback, locked }) => {
              const sec = BIZ_SECTORS.find((s) => s.id === d.sector)!;
              const used = me.businesses.filter((b) => BIZ_BY_ID.get(b.defId)?.tier === d.tier).length;
              const full = used >= tier.max;
              const unlock = locked ? unlockLine(tier.rank, me.player.netWorthPeak) : null;
              return (
                <div
                  key={d.id}
                  role="listitem"
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-ink-2 px-4 py-3 last:border-0 @xl:grid-cols-[minmax(0,2fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto] @xl:gap-x-4 @xl:py-2.5 ${locked ? 'text-fg-faint' : ''} ${pick === d.id ? 'bg-brass/10' : ''}`}
                  data-testid={`catalog-${d.id}`}
                >
                  <div className="min-w-0">
                    <span className="block truncate font-semibold text-fg">{d.name}</span>
                    <span className="block truncate text-caption text-fg-faint">{sec.name} · {t(`biz.blurb.${d.id}`)}</span>
                  </div>
                  <div className="hidden text-small @xl:block">{t('biz.tierChip', { n: d.tier })} {tier.name}</div>
                  <div className="num whitespace-nowrap text-right text-small text-fg">
                    {compactMoney(d.cost)}
                    <span className="block text-caption text-gain @xl:hidden">{t('biz.perDayShort', { amount: compactMoney(inc) })}</span>
                  </div>
                  <div className="num hidden whitespace-nowrap text-right text-small text-gain @xl:block">
                    {compactMoney(inc)}
                    <span className="block text-caption text-fg-faint">{t('biz.paybackValue', { n: payback.toFixed(1) })}</span>
                  </div>
                  <div className="col-span-2 @xl:col-auto @xl:justify-self-end">
                    {unlock ? (
                      <span className="block text-caption text-fg-faint" data-testid={`catalog-unlock-${d.id}`}>{unlock.text}</span>
                    ) : (
                      <Button size="sm" className="w-full @xl:w-auto" variant={pick === d.id ? 'brass' : 'outline'} disabled={full || cash < d.cost}
                        onClick={() => setPick(d.id)} testId={`buy-biz-${d.id}`}>
                        {full ? t('biz.full') : cash < d.cost ? t('biz.needMore', { amount: compactMoney(d.cost - cash) }) : t('biz.buyFor', { price: compactMoney(d.cost) })}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
