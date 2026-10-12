'use client';

import { useState } from 'react';
import { CITIES } from '@/engine';
import { BIZ_BY_ID, BIZ_EVENTS, BIZ_SECTORS, MAX_UPGRADE, TIERS, UPGRADES, upgradeCost } from '@/content/businesses';
import { compactMoney, money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { businessSalePrice } from '@/world/assets';
import type { Business } from '@/world/types';
import { t } from '@/i18n';
import { Button, Card, Chip, ConfirmButton, TextField } from '@/components/ui';

export function OwnedBusinesses() {
  const me = useGame((s) => s.me)!;
  if (!me.businesses.length) {
    return (
      <Card className="p-8 text-center">
        <p className="font-serif text-title text-fg-muted">{t('biz.none.title')}</p>
        <p className="mt-2 text-small text-fg-faint">{t('biz.none.body')}</p>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 @2xl:grid-cols-2">
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
  const tierName = TIERS[def.tier - 1]!.name;
  const cityName = CITIES.find((c) => c.id === b.cityId)?.name ?? b.cityId;
  const [name, setName] = useState<string | null>(null);
  const ev = b.event && b.event.untilTick > tick ? BIZ_EVENTS.find((e) => e.id === b.event!.id) : null;
  const rename = async () => { await act({ type: 'biz.rename', bizId: b.id, name: name ?? b.name }); setName(null); };
  return (
    <Card className="p-4" data-testid={`biz-${b.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {name === null ? (
            <button type="button" className="text-left font-serif text-title text-fg hover:underline" onClick={() => setName(b.name)} title={t('biz.rename')}>{b.name}</button>
          ) : (
            <div className="flex gap-2">
              <TextField value={name} onChange={setName} maxLength={40} className="h-9" label={t('biz.rename')} onEnter={rename} autoFocus />
              <Button size="sm" onClick={rename}>{t('common.save')}</Button>
            </div>
          )}
          <p className="text-caption text-fg-faint">{t('biz.meta', { name: def.name, sector: sec.name, tier: def.tier, tierName, city: cityName })}</p>
        </div>
        <div className="text-right">
          <div className="num text-body text-gain">{money(b.incomePerDay)}<span className="text-caption text-fg-faint"> {t('biz.perDay')}</span></div>
          <div className="num text-caption text-fg-faint">{t('biz.share', { share: pct(b.share), earned: compactMoney(b.earned) })}</div>
        </div>
      </div>
      {ev && <div className="mt-2"><Chip className={ev.good ? 'border-gain/50 text-gain' : 'border-loss/50 text-loss'}>{t(`biz.event.${ev.id}.title`)} · {ev.mult >= 1 ? '+' : '−'}{Math.round(Math.abs(ev.mult - 1) * 100)}%</Chip></div>}
      <div className="mt-3 grid grid-cols-2 gap-2 @2xl:grid-cols-3">
        {UPGRADES.map((u) => {
          const lvl = b.levels[u.id];
          const cost = upgradeCost(def.cost, lvl);
          const maxed = lvl >= MAX_UPGRADE;
          return (
            <div key={u.id} className="rounded-md border border-ink-3 p-2.5" title={t(`biz.upgrade.${u.id}.blurb`)}>
              <div className="flex items-center justify-between">
                <span className="text-small font-medium">{t(`biz.upgrade.${u.id}.name`)}</span>
                <span className="flex gap-0.5" aria-label={t('biz.level', { lvl, max: MAX_UPGRADE })}>
                  {Array.from({ length: MAX_UPGRADE }, (_, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${k < lvl ? 'bg-brass' : 'bg-ink-3'}`} />)}
                </span>
              </div>
              <p className="mt-0.5 text-caption text-fg-faint">{t(u.effectKey)}</p>
              <Button size="sm" className="mt-2 w-full" disabled={maxed || cash < cost} onClick={() => act({ type: 'biz.upgrade', bizId: b.id, axis: u.id })} testId={`upgrade-${b.id}-${u.id}`}>
                {maxed ? t('biz.maxed') : compactMoney(cost)}
              </Button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <ConfirmButton confirm={t('biz.sellFor', { amount: compactMoney(businessSalePrice(b.invested)) })} onConfirm={() => act({ type: 'biz.sell', bizId: b.id })} testId={`sell-${b.id}`}>{t('common.sell')}</ConfirmButton>
      </div>
    </Card>
  );
}
