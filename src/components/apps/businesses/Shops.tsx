'use client';

// The Shops tab (Phase 4 stage C): the overdraft notice, bulk settings for many shops (one sector or all), and one
// management card per owned shop. Each change goes through the shop commands; refusals show inline with their copy.
import { useState } from 'react';
import { BIZ_SECTORS } from '@/content/businesses';
import { bizSectorLabel } from '@/game/sectorLabel';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import type { ShopView } from '@/world/shopView';
import { Button, Card, EmptyNext, Select } from '@/components/ui';
import { ShopCard } from './ShopCard';
import { ShopRefusal } from './ShopRefusal';
import { NO_BULK, bulkCommands, bulkPicked, bulkResult, bulkScope, type BulkResult, type BulkSettings } from './shopPlan';
import { dec } from '@/game/format';

export function ShopsTab({ onBuy }: { onBuy: () => void }) {
  const me = useGame((s) => s.me)!;
  const shops = me.shops;
  const cash = me.account?.cash ?? 0;
  if (!shops.length) {
    return (
      <EmptyNext testId="shops-empty" title={t('shop.none')} body={t('shop.empty.body')}
        cta={<Button variant="brass" onClick={onBuy} testId="shops-to-catalog">{t('shop.empty.cta')}</Button>} />
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="shops-view">
      {cash < 0 && <OverdraftNotice />}
      <p className="text-small text-fg-muted">{t('shop.intro')}</p>
      <BulkPanel shops={shops} />
      <div className="grid gap-4 @2xl:grid-cols-2">
        {shops.map((v) => <ShopCard key={v.id} v={v} />)}
      </div>
    </div>
  );
}

function OverdraftNotice() {
  return (
    <Card className="border-loss/50 p-4" role="alert" data-testid="shops-overdraft">
      <p className="font-medium text-loss">{t('shop.overdraft.title')}</p>
      <p className="mt-1 text-small text-fg-muted">{t('shop.overdraft.body')}</p>
    </Card>
  );
}

const KEEP = 'keep';
const toNum = (x: string): number | null => (x === KEEP ? null : Number(x));

/** Applies chosen settings to every shop in a sector (or all of them). Each shop takes what it can; refusals are tallied. */
function BulkPanel({ shops }: { shops: ShopView[] }) {
  const act = useGame((s) => s.act);
  const [sector, setSector] = useState<string>('all');
  const [picks, setPicks] = useState<BulkSettings>(NO_BULK);
  const [result, setResult] = useState<BulkResult | null>(null);
  const levels = shops[0]!.levels;
  const scope = bulkScope(shops, sector);
  const sectors = [...new Set(shops.map((s) => s.sector))];
  const sectorName = (id: string) => bizSectorLabel(id, BIZ_SECTORS.find((s) => s.id === id)?.name ?? id);
  const keepOr = <T extends number | string>(xs: T[], fmt: (x: T) => string) => [
    { value: KEEP, label: t('shop.bulk.keep') },
    ...xs.map((x) => ({ value: String(x), label: fmt(x) })),
  ];
  const set = <K extends keyof BulkSettings>(k: K, v: BulkSettings[K]) => { setPicks({ ...picks, [k]: v }); setResult(null); };

  const apply = async () => {
    if (!bulkPicked(picks)) return;
    const outcomes: { shop: ShopView; codes: string[] }[] = [];
    for (const shop of scope) {
      const codes: string[] = [];
      for (const cmd of bulkCommands(shop, picks)) {
        const r = await act(cmd, { silent: true });
        if (!r.ok) codes.push(r.error ?? 'unknown');
      }
      outcomes.push({ shop, codes });
    }
    setResult(bulkResult(scope, outcomes));
  };

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="shops-bulk">
      <h2 className="font-serif text-title text-fg">{t('shop.bulk.title')}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          label={t('shop.bulk.sector')}
          value={sector}
          onChange={(v) => { setSector(v); setResult(null); }}
          options={[
            { value: 'all', label: t('shop.bulk.all', { n: shops.length }) },
            ...sectors.map((id) => ({ value: id, label: t('shop.bulk.sectorOf', { sector: sectorName(id), n: shops.filter((s) => s.sector === id).length }) })),
          ]}
          testId="shops-bulk-sector"
        />
        <Select label={t('shop.crew')} value={String(picks.crew ?? KEEP)} onChange={(x) => set('crew', toNum(x))} options={keepOr(levels.crew, (c) => dec(c, 2))} testId="shops-bulk-crew" />
        <Select label={t('shop.price')} value={String(picks.price ?? KEEP)} onChange={(x) => set('price', toNum(x))} options={keepOr(levels.price, (p) => `${dec(p, 2)}x`)} testId="shops-bulk-price" />
        <Select label={t('shop.quality')} value={String(picks.quality ?? KEEP)} onChange={(x) => set('quality', toNum(x))} options={keepOr(levels.quality, (k) => String(k))} testId="shops-bulk-quality" />
        <Select label={t('shop.marketing')} value={String(picks.marketing ?? KEEP)} onChange={(x) => set('marketing', toNum(x))} options={keepOr(levels.marketing, (k) => String(k))} testId="shops-bulk-marketing" />
        <Select
          label={t('shop.maintained')}
          value={picks.maintained === null ? KEEP : picks.maintained ? 'on' : 'off'}
          onChange={(x) => set('maintained', x === KEEP ? null : x === 'on')}
          options={[{ value: KEEP, label: t('shop.bulk.keep') }, { value: 'on', label: t('shop.on') }, { value: 'off', label: t('shop.off') }]}
          testId="shops-bulk-maintained"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="brass" testId="shops-bulk-apply" disabled={!bulkPicked(picks) || !scope.length} onClick={apply}>
          {t('shop.bulk.apply', { n: scope.length })}
        </Button>
        {!bulkPicked(picks) && <span className="text-caption text-fg-faint">{t('shop.bulk.pick')}</span>}
      </div>
      {result && (
        <div className="flex flex-col gap-2" data-testid="shops-bulk-result">
          <p className="text-small text-fg" data-testid="shops-bulk-done">{t('shop.bulk.done', { ok: result.ok, n: result.n })}</p>
          {result.refusals.map((r) => (
            <div key={r.code} className="flex flex-col gap-1.5">
              <p className="text-caption text-fg-muted">{t('shop.bulk.refused', { count: r.count })}</p>
              <ShopRefusal code={r.code} vars={r.vars} testId={`shops-bulk-refusal-${r.code}`} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
