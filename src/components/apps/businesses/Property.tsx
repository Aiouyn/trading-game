'use client';

// Property (Estate's real-estate half, moved here by Velvet's app table): the market by city and
// district, and the homes and rentals you own. Mortgages are the same commands the Bank app shows.
import { useState } from 'react';
import { CITIES, districtAssetId } from '@/engine';
import { PROPERTY_TYPE_BY_ID, PROPERTY_TYPES, rankIndex } from '@/content/lifestyle';
import { compactMoney, money, signedPct } from '@/game/format';
import { useGame } from '@/game/store';
import { maxLtvFor, priceAt, propertyDeposit, propertySaleNet, renovateCost } from '@/world/assets';
import { t } from '@/i18n';
import { BrassChip, Button, Card, Chip, CommitBar, ConfirmButton, EmptyNext, LockGlyph, Select, Stat } from '@/components/ui';
import { unlockLine } from '../unlock';

const rankName = (id: string) => t(`rank.${id}`);

function districtIndexOf(world: ReturnType<typeof useGame.getState>['world'], cityId: string, districtId: string): number {
  const i = useGame.getState().config.assets.findIndex((a) => a.id === districtAssetId(cityId, districtId));
  return i < 0 || !world ? 100 : Math.exp(world.assets[i]!.lnP);
}

export function PropertyMarket() {
  const me = useGame((s) => s.me)!;
  const world = useGame((s) => s.world)!;
  const act = useGame((s) => s.act);
  const [cityId, setCity] = useState('avalon');
  const [ltv, setLtv] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const rIdx = rankIndex(me.player.rankId);
  const city = CITIES.find((c) => c.id === cityId)!;
  const cityLocked = rIdx < rankIndex(city.unlockRank);
  const maxLtv = maxLtvFor(me.player.rankId);
  const cash = me.account?.cash ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select label={t('prop.city')} value={cityId} onChange={setCity} options={CITIES.map((c) => ({ value: c.id, label: rIdx < rankIndex(c.unlockRank) ? `${c.name} (${rankName(c.unlockRank)})` : c.name }))} testId="prop-city" />
        <label className="flex items-center gap-2 text-small text-fg-muted">
          {t('prop.mortgage')}
          <input type="range" min={0} max={maxLtv * 100} step={5} value={ltv * 100} disabled={!maxLtv} onChange={(e) => setLtv(Number(e.target.value) / 100)} data-testid="ltv" aria-label={t('prop.mortgage')} />
          <span className="num w-10 text-fg">{Math.round(ltv * 100)}%</span>
        </label>
        <span className="text-caption text-fg-faint">{maxLtv ? t('prop.rate', { rate: (me.mortgageRate * 100).toFixed(2) }) : t('prop.mortgageLocked', { rank: rankName('R1') })}</span>
      </div>
      <p className="text-small text-fg-muted">{city.blurb}</p>
      {pick && (() => {
        const [dId, tId] = pick.split('|');
        const d = city.districts.find((x) => x.id === dId);
        const ty = PROPERTY_TYPE_BY_ID.get(tId ?? '');
        if (!d || !ty) return null;
        const idx = districtIndexOf(world, city.id, d.id);
        const price = priceAt(ty.value, d.tier, idx);
        const down = propertyDeposit(price, ltv);
        return (
          <div className="sticky top-0 z-10">
            <CommitBar
              testId="prop-commit"
              title={t('commit.propTitle', { type: ty.name, district: d.name })}
              rows={[
                { label: t('commit.price'), value: money(price), testId: 'prop-commit-price' },
                { label: t('commit.down'), value: money(down), testId: 'prop-commit-down' },
                { label: t('commit.loan'), value: money(price - down) },
                { label: t('commit.cashAfter'), value: money(cash - down), testId: 'prop-commit-after' },
              ]}
              confirmLabel={t('commit.confirmProp')}
              disabled={cityLocked || rIdx < rankIndex(ty.rank) || cash < down}
              onCancel={() => setPick(null)}
              onConfirm={async () => {
                const r = await act({ type: 'prop.buy', cityId: city.id, districtId: d.id, typeId: ty.id, ltv }, { success: t('prop.bought', { type: ty.name, district: d.name }) });
                if (r.ok) setPick(null);
              }}
            />
          </div>
        );
      })()}
      {cityLocked && <Card className="flex items-center gap-3 p-4"><LockGlyph /><span className="text-small text-fg-muted">{t('prop.cityLocked', { city: city.name, rank: rankName(city.unlockRank) })}</span></Card>}
      {city.districts.map((d) => {
        const idx = districtIndexOf(world, city.id, d.id);
        const types = PROPERTY_TYPES.filter((x) => x.tiers.includes(d.tier));
        return (
          <Card key={d.id} className="p-4" data-testid={`district-${d.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-serif text-title">{d.name}</h3>
                <p className="text-caption text-fg-faint">{t('prop.district', { blurb: d.blurb, tier: t(`prop.tier.${d.tier}`) })}</p>
              </div>
              <span className="num text-small text-fg-muted">{t('prop.index', { idx: idx.toFixed(1) })} <span className={idx >= 100 ? 'text-gain' : 'text-loss'}>{signedPct(idx / 100 - 1)}</span></span>
            </div>
            <div className="mt-3 grid gap-2 @md:grid-cols-2 @4xl:grid-cols-3">
              {types.map((ty) => {
                const price = priceAt(ty.value, d.tier, idx);
                const down = propertyDeposit(price, ltv);
                const locked = cityLocked || rIdx < rankIndex(ty.rank);
                return (
                  <div key={ty.id} className="flex flex-col rounded-md border border-ink-3 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-small font-semibold">{ty.name}</span>
                      {ty.home && <Chip>{t('prop.home')}</Chip>}
                    </div>
                    <p className="mt-1 flex-1 text-caption text-fg-faint">{ty.blurb}</p>
                    <div className="num mt-2 flex flex-wrap justify-between gap-x-2 text-caption">
                      <span className="text-fg">{compactMoney(price)}</span>
                      <span className="text-gain">{t('prop.rent', { x: (ty.rentYield * 100).toFixed(1) })}</span>
                      <span className="text-fg-faint">{t('prop.upkeep', { x: (ty.upkeep * 100).toFixed(1) })}</span>
                    </div>
                    {locked ? (
                      <p className="mt-2 text-caption text-fg-faint" data-testid={`prop-unlock-${d.id}-${ty.id}`}>{cityLocked ? t('common.unlocksAt', { rank: rankName(city.unlockRank) }) : unlockLine(ty.rank, me.player.netWorthPeak).text}</p>
                    ) : (
                      <Button size="sm" variant={pick === `${d.id}|${ty.id}` ? 'brass' : 'outline'} className="mt-2" disabled={cash < down}
                        onClick={() => setPick(`${d.id}|${ty.id}`)} testId={`buy-prop-${d.id}-${ty.id}`}>
                        {cash < down ? t('biz.needMore', { amount: compactMoney(down - cash) }) : t('prop.buyDown', { amount: compactMoney(down) })}
                      </Button>
                    )}
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

export function OwnedProperty({ onBrowse }: { onBrowse: () => void }) {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  if (!me.properties.length) {
    return <EmptyNext testId="prop-empty" title={t('prop.none')} body={t('prop.empty.body')} cta={<Button variant="brass" onClick={onBrowse} testId="prop-to-market">{t('prop.empty.cta')}</Button>} />;
  }
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      {me.properties.map((p) => {
        const ty = PROPERTY_TYPE_BY_ID.get(p.typeId)!;
        const city = CITIES.find((c) => c.id === p.cityId)!;
        const d = city.districts.find((x) => x.id === p.districtId)!;
        const home = me.player.homePropId === p.id;
        const gain = p.value / p.paid - 1;
        return (
          <Card key={p.id} className="p-4" data-testid={`prop-${p.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-serif text-title">{ty.name}</h3>
                <p className="text-caption text-fg-faint">{t('prop.where', { district: d.name, city: city.name })}{p.improvement > 1.01 ? ` · ${t('prop.renovatedX', { x: p.improvement.toFixed(2) })}` : ''}</p>
              </div>
              {home ? <BrassChip>{t('prop.yourHome')}</BrassChip> : <Chip>{t('prop.rented')}</Chip>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 @md:grid-cols-4">
              <Stat label={t('prop.stat.value')} value={compactMoney(p.value)} sub={<span className={gain >= 0 ? 'text-gain' : 'text-loss'}>{signedPct(gain)}</span>} />
              <Stat label={t('prop.stat.mortgage')} value={compactMoney(p.mortgage)} sub={p.mortgage ? `${(p.mortgageRate * 100).toFixed(2)}%` : undefined} />
              <Stat label={t('prop.stat.equity')} value={compactMoney(p.value - p.mortgage)} />
              <Stat label={t('prop.stat.rent')} value={compactMoney(p.rentEarned)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ty.home && !home && <Button size="sm" onClick={() => act({ type: 'prop.home', propId: p.id }, { success: t('prop.movedIn') })}>{t('prop.live')}</Button>}
              {home && <Button size="sm" onClick={() => act({ type: 'prop.home', propId: null })}>{t('prop.moveOut')}</Button>}
              <Button size="sm" disabled={p.improvement >= 1.5} onClick={() => act({ type: 'prop.renovate', propId: p.id }, { success: t('prop.renovatedOk') })}>{t('prop.renovate', { amount: compactMoney(renovateCost(p.value)) })}</Button>
              {p.mortgage > 0 && <Button size="sm" onClick={() => act({ type: 'prop.repay', propId: p.id, amount: p.mortgage })}>{t('prop.repay')}</Button>}
              <ConfirmButton confirm={t('prop.sellFor', { amount: compactMoney(propertySaleNet(p.value, p.mortgage)) })} onConfirm={() => act({ type: 'prop.sell', propId: p.id })}>{t('common.sell')}</ConfirmButton>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
