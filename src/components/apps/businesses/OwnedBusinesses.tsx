'use client';

// Owned businesses (Stage 4, item 2): a dense table, one row per shop. A row shows the name, city, income per day, the tax that
// day (R-9-10; the bracket is in its tooltip), what it has earned, its share and how many upgrade levels it carries. Manage opens the row's panel: the rename, the four upgrades
// (each one a CommitBar review) and the sale. An empty list is a next-step card with one CTA.
import { useState } from 'react';
import { CITIES } from '@/engine';
import { BIZ_BY_ID, BIZ_EVENTS, BIZ_SECTORS, MAX_UPGRADE, TIERS, UPGRADES, upgradeCost } from '@/content/businesses';
import { bizSectorLabel } from '@/game/sectorLabel';
import { compactMoney, money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { businessSalePrice } from '@/world/assets';
import type { Business } from '@/world/types';
import type { ShopView } from '@/world/shopView';
import { t } from '@/i18n';
import { Button, Card, Chip, ConfirmButton, EmptyNext, SpendReview, TextField, Td, Th, spendRows } from '@/components/ui';

/** The sticky name column: opaque (the card's own background), so the columns that scroll under it do not show through. */
const NAME_COL = 'sticky left-0 z-[1] bg-ink-1';

export function OwnedBusinesses({ onBrowse }: { onBrowse: () => void }) {
  const me = useGame((s) => s.me)!;
  if (!me.businesses.length) {
    return (
      <EmptyNext testId="biz-owned-empty" title={t('biz.none.title')} body={t('biz.none.body')}
        cta={<Button variant="brass" onClick={onBrowse} testId="biz-to-catalog">{t('biz.none.cta')}</Button>} />
    );
  }
  const rows = me.businesses.slice().sort((a, b) => b.incomePerDay - a.incomePerDay);
  const shops = new Map(me.shops.map((v) => [v.id, v] as const));
  return (
    <Card className="overflow-hidden" data-testid="biz-owned-table">
      {/* the table scrolls sideways in a narrow panel; the business name stays at the left edge (sticky), so a scrolled table
          still names each row. The scroller starts at 0: its first column is the first thing on the left. */}
      <div className="overflow-x-auto" data-testid="biz-owned-scroll">
        <table className="w-full min-w-[720px] text-small">
          <thead>
            <tr>
              <Th className={NAME_COL}>{t('biz.col.business')}</Th>
              <Th>{t('biz.col.city')}</Th>
              <Th right>{t('biz.col.income')}</Th>
              <Th right className="whitespace-nowrap">{t('biz.col.tax')}</Th>
              <Th right>{t('biz.col.earned')}</Th>
              <Th right>{t('biz.col.share')}</Th>
              <Th right>{t('biz.col.upgrades')}</Th>
              <Th><span className="sr-only">{t('biz.col.actions')}</span></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => <OwnedRow key={b.id} b={b} shop={shops.get(b.id)} />)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function OwnedRow({ b, shop }: { b: Business; shop?: ShopView }) {
  const [open, setOpen] = useState(false);
  const def = BIZ_BY_ID.get(b.defId)!;
  const cityName = CITIES.find((c) => c.id === b.cityId)?.name ?? b.cityId;
  const levels = UPGRADES.reduce((s, u) => s + (b.levels[u.id] ?? 0), 0);
  return (
    <>
      <tr className="border-t border-ink-2" data-testid={`biz-${b.id}`}>
        <Td className={NAME_COL}>
          <span className="block font-medium text-fg">{b.name}</span>
          {def.name !== b.name && <span className="block text-caption text-fg-faint">{def.name}</span>}
        </Td>
        <Td className="whitespace-nowrap text-fg-muted">{cityName}</Td>
        <Td right num className="whitespace-nowrap"><span className="text-gain">{money(b.incomePerDay)}</span><span className="text-caption text-fg-faint"> {t('biz.perDay')}</span></Td>
        <Td right num className="whitespace-nowrap">
          {shop ? (
            <span className="text-fg" title={t('shop.line.tax', { rate: Math.round(shop.daily.taxRate * 100) })} data-testid={`biz-${b.id}-tax`}>{money(shop.daily.tax)}</span>
          ) : <span className="text-fg-faint">—</span>}
        </Td>
        <Td right num className="whitespace-nowrap">{compactMoney(b.earned)}</Td>
        <Td right num className="whitespace-nowrap">{pct(b.share)}</Td>
        <Td right num className="whitespace-nowrap">{t('biz.upgrades.count', { n: levels, max: UPGRADES.length * MAX_UPGRADE })}</Td>
        <Td right>
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} testId={`biz-manage-${b.id}`}>
            {open ? t('biz.manage.close') : t('biz.manage')}
          </Button>
        </Td>
      </tr>
      {open && (
        <tr className="border-t border-ink-2 bg-ink-0/40">
          <td colSpan={8} className="px-4 pb-4 pt-3">
            <OwnedPanel b={b} />
          </td>
        </tr>
      )}
    </>
  );
}

/** The row's panel: the rename, the event, the four upgrades (each reviewed before it spends) and the sale. */
function OwnedPanel({ b }: { b: Business }) {
  const act = useGame((s) => s.act);
  const cash = useGame((s) => s.me?.account?.cash ?? 0);
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const def = BIZ_BY_ID.get(b.defId)!;
  const sec = BIZ_SECTORS.find((s) => s.id === def.sector)!;
  const tierName = TIERS[def.tier - 1]!.name;
  const cityName = CITIES.find((c) => c.id === b.cityId)?.name ?? b.cityId;
  const [name, setName] = useState<string | null>(null);
  const ev = b.event && b.event.untilTick > tick ? BIZ_EVENTS.find((e) => e.id === b.event!.id) : null;
  const rename = async () => { await act({ type: 'biz.rename', bizId: b.id, name: name ?? b.name }); setName(null); };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {name === null ? (
            <button type="button" className="text-left text-small font-semibold text-fg hover:underline" onClick={() => setName(b.name)} title={t('biz.rename')}>{b.name}</button>
          ) : (
            <div className="flex gap-2">
              <TextField value={name} onChange={setName} maxLength={40} className="h-9" label={t('biz.rename')} onEnter={rename} autoFocus />
              <Button size="sm" onClick={rename}>{t('common.save')}</Button>
            </div>
          )}
          <p className="text-caption text-fg-faint">{t('biz.meta', { name: def.name, sector: bizSectorLabel(sec.id, sec.name), tier: def.tier, tierName, city: cityName })}</p>
        </div>
        {ev && <Chip className={ev.good ? 'border-gain/50 text-gain' : 'border-loss/50 text-loss'}>{t(`biz.event.${ev.id}.title`)} · {ev.mult >= 1 ? '+' : '−'}{Math.round(Math.abs(ev.mult - 1) * 100)}%</Chip>}
      </div>
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        {UPGRADES.map((u) => {
          const lvl = b.levels[u.id];
          const cost = upgradeCost(def.cost, lvl);
          const maxed = lvl >= MAX_UPGRADE;
          return (
            <div key={u.id} className="flex flex-col gap-2 rounded-md border border-ink-3 p-2.5" title={t(`biz.upgrade.${u.id}.blurb`)}>
              <div className="flex items-center justify-between">
                <span className="text-small font-medium">{t(`biz.upgrade.${u.id}.name`)}</span>
                <span className="flex gap-0.5" aria-label={t('biz.level', { lvl, max: MAX_UPGRADE })}>
                  {Array.from({ length: MAX_UPGRADE }, (_, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${k < lvl ? 'bg-brass' : 'bg-ink-3'}`} />)}
                </span>
              </div>
              <p className="text-caption text-fg-faint">{t(u.effectKey)}</p>
              <SpendReview
                size="sm"
                className="w-full"
                testId={`upgrade-${b.id}-${u.id}`}
                label={maxed ? t('biz.maxed') : compactMoney(cost)}
                title={t(`biz.upgrade.${u.id}.name`)}
                rows={spendRows(cost, cash)}
                disabled={maxed || cash < cost}
                onConfirm={() => act({ type: 'biz.upgrade', bizId: b.id, axis: u.id })}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <ConfirmButton confirm={t('biz.sellFor', { amount: compactMoney(businessSalePrice(b.invested)) })} onConfirm={() => act({ type: 'biz.sell', bizId: b.id })} testId={`sell-${b.id}`}>{t('common.sell')}</ConfirmButton>
      </div>
    </div>
  );
}
