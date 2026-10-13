'use client';

import { useState } from 'react';
import { estimateFill, type Side } from '@/engine';
import { BLOCK, RECURRING } from '@/content/learning';
import { rankIndex } from '@/content/lifestyle';
import { money, qty as fmtQty } from '@/game/format';
import { isIndex, useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, CardHeader, Locked, NumberField, Segmented } from '@/components/ui';
import { unlockLine } from '../unlock';

/** Whole units for a stock, six decimals otherwise: the same rounding the server applies to a block slice. */
function unitsFor(assetClass: string, units: number, stepOf: number | undefined): number {
  if (!(units > 0)) return 0;
  // the asset's own step (R-10-4): stocks in 0.0001 shares, the rest in six decimals (the same rounding the server applies)
  const step = stepOf ?? (assetClass === 'stock' ? 0.0001 : 0);
  return step > 0 ? Number((Math.floor(units / step + 1e-9) * step).toFixed(8)) : Math.floor(units * 1e6) / 1e6;
}

function num(s: string): number {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

/** Game day for a tick, the same count the server uses (day 0 is the first day). */
function dayOf(tick: number, ticksPerDay: number): number {
  return tick <= 0 ? 0 : Math.floor((tick - 1) / ticksPerDay);
}

/**
 * Plans on the Broker (Phase 3 section 3): recurring buys (a fixed amount every N game days, from cash) and block trades
 * (a TWAP over N ticks, the normal impact and fees, Institutional only). Both are the world's plans, so the server runs them
 * and the card only sends commands and lists what the player's own record holds.
 */
export function PlansCard({ ticker }: { ticker: string }) {
  const world = useGame((s) => s.world);
  const me = useGame((s) => s.me);
  const config = useGame((s) => s.config);
  const playerId = useGame((s) => s.playerId);
  const act = useGame((s) => s.act);
  const [dollars, setDollars] = useState('');
  const [every, setEvery] = useState(String(RECURRING.minEveryDays + 6));
  const [side, setSide] = useState<Side>('buy');
  const [units, setUnits] = useState('');
  const [slices, setSlices] = useState('6');
  if (!world || !me || isIndex(ticker)) return null;

  const plans = me.trading?.plans ?? null;
  const recurring = plans?.recurring ?? [];
  const blocks = plans?.blocks ?? [];
  const ticksPerDay = world.config.ticksPerDay;
  const today = dayOf(world.tick, ticksPerDay);
  const def = config.assets.find((a) => a.id === ticker);

  const dollarsN = num(dollars);
  const everyN = num(every);
  const recurringOk = dollarsN >= RECURRING.minDollars && Number.isInteger(everyN) && everyN >= RECURRING.minEveryDays && everyN <= RECURRING.maxEveryDays
    && recurring.length < RECURRING.maxPlans && !!def;

  const blockLocked = rankIndex(me.player.rankId) < rankIndex(BLOCK.minRank);
  const unitsN = num(units);
  const slicesN = num(slices);
  const slice = def && Number.isInteger(slicesN) && slicesN > 0 ? unitsFor(def.assetClass, unitsN / slicesN, def.qtyStep) : 0;
  const blockOk = !blockLocked && !!def && Number.isInteger(slicesN) && slicesN >= BLOCK.minSlices && slicesN <= BLOCK.maxSlices
    && unitsN > 0 && slice >= 1;
  // the preview prices one slice with estimateFill (the same call the server makes), then multiplies it out
  const expected = blockOk && world ? estimateFill(world, { assetId: ticker, side, qty: slice, playerId: playerId ?? undefined }).total * slicesN : 0;

  return (
    <Card className="p-4" data-testid="plans-card">
      <CardHeader title={t('broker.plans.title')} />

      <section className="mt-2" aria-labelledby="plans-recurring">
        <h3 id="plans-recurring" className="text-small font-semibold text-fg">{t('broker.plans.recurring')}</h3>
        <p className="mt-1 text-caption text-fg-faint">{t('broker.plans.recurringHelp', { ticker })}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField label={t('broker.plans.dollars')} value={dollars} onChange={setDollars} suffix="$" testId="plan-recurring-dollars" />
          <NumberField label={t('broker.plans.every')} value={every} onChange={setEvery} suffix={t('broker.plans.days')} step={1} testId="plan-recurring-days" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!recurringOk} onClick={() => void act({ type: 'recurring.add', assetId: ticker, dollars: dollarsN, everyDays: everyN }, { success: t('broker.plans.added') })} testId="plan-recurring-add">
            {t('broker.plans.addRecurring')}
          </Button>
          {recurring.length >= RECURRING.maxPlans && <span className="text-caption text-fg-faint">{t('broker.plans.maxRecurring', { n: RECURRING.maxPlans })}</span>}
        </div>
        {recurring.length === 0 ? (
          <p className="mt-2 text-caption text-fg-faint" data-testid="recurring-none">{t('broker.plans.noRecurring')}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {recurring.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small" data-testid={`recurring-${r.id}`}>
                <span className="num">{t('broker.plans.line', { dollars: money(r.dollars), asset: r.assetId, days: r.everyDays, left: Math.max(0, r.nextDay - today) })}</span>
                <button type="button" className="ml-auto text-caption text-fg-muted underline hover:text-fg" data-testid={`recurring-cancel-${r.id}`}
                  onClick={() => void act({ type: 'recurring.cancel', planId: r.id }, { success: t('broker.plans.cancelled') })}>
                  {t('common.cancel')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 border-t border-ink-2 pt-3" aria-labelledby="plans-block">
        <h3 id="plans-block" className="text-small font-semibold text-fg">{t('broker.plans.block')}</h3>
        {blockLocked ? (
          <div className="mt-2" data-testid="block-locked">
            <Locked what={t('broker.plans.block')} need={<>{t('broker.plans.blockLocked', { rank: t('rank.' + BLOCK.minRank) })}<span className="mt-1 block text-caption text-fg-faint">{unlockLine(BLOCK.minRank, me?.player.netWorthPeak ?? 0).text}</span></>} />
          </div>
        ) : (
          <>
            <p className="mt-1 text-caption text-fg-faint">{t('broker.plans.blockHelp')}</p>
            <Segmented
              label={t('broker.side')} size="sm" className="mt-2 w-full" value={side} onChange={(v) => setSide(v as Side)}
              options={[{ value: 'buy', label: t('common.buy'), testId: 'block-side-buy' }, { value: 'sell', label: t('common.sell'), testId: 'block-side-sell' }]}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <NumberField label={t('broker.plans.units')} value={units} onChange={setUnits} suffix={def?.assetClass === 'stock' ? t('broker.unit.shares') : t('broker.unit.units')} testId="block-qty" />
              <NumberField label={t('broker.plans.slices')} value={slices} onChange={setSlices} suffix={t('broker.plans.ticks')} step={1} testId="block-slices" />
            </div>
            <p className="mt-2 text-caption text-fg-muted" data-testid="block-preview">
              {blockOk
                ? t('broker.plans.preview', { slice: fmtQty(slice), slices: slicesN, total: money(expected) })
                : t('broker.plans.previewNone')}
            </p>
            <div className="mt-2">
              <Button size="sm" disabled={!blockOk} onClick={() => void act({ type: 'block.start', assetId: ticker, side, qty: unitsN, slices: slicesN }, { success: t('broker.plans.blockStarted') })} testId="block-start">
                {t('broker.plans.startBlock')}
              </Button>
            </div>
          </>
        )}
        {blocks.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small" data-testid={`block-${b.id}`}>
                <span className="num">{t('broker.plans.blockLine', { asset: b.assetId, units: fmtQty(b.remaining), slices: b.slicesLeft, total: money(b.expectedTotal) })}</span>
                <button type="button" className="ml-auto text-caption text-fg-muted underline hover:text-fg" data-testid={`block-cancel-${b.id}`}
                  onClick={() => void act({ type: 'block.cancel', planId: b.id }, { success: t('broker.plans.cancelled') })}>
                  {t('common.cancel')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
