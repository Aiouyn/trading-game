'use client';

// One owned shop under management (Phase 4 stage C, DECISIONS S2): the levers, the manager, the day's money, the
// away window and what well run means. Every figure comes from the shop view on the server; this file only formats.
import { useState, type ReactNode } from 'react';
import { BIZ_SECTORS, TIERS } from '@/content/businesses';
import { bizSectorLabel } from '@/game/sectorLabel';
import { CITIES } from '@/engine';
import { money, pct, dec } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import type { ShopView } from '@/world/shopView';
import type { Command } from '@/world/types';
import { Card, ConfirmButton, Segmented, SpendReview, Stat, spendRows } from '@/components/ui';
import { ShopRefusal } from './ShopRefusal';
import { refusalVars } from './shopPlan';

interface Refusal { code: string; vars: Record<string, string | number> }

const fx = (n: number, d = 2) => dec(n, d);

export function ShopCard({ v }: { v: ShopView }) {
  const act = useGame((s) => s.act);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const sector = bizSectorLabel(v.sector, BIZ_SECTORS.find((s) => s.id === v.sector)?.name ?? v.sector);
  const tierName = TIERS[v.tier - 1]?.name ?? '';
  const cityName = CITIES.find((c) => c.id === v.cityId)?.name ?? v.cityId;
  const st = v.settings;
  const m = v.manager;
  const id = v.id;
  const cash = useGame((s) => s.me?.account?.cash ?? 0);

  /** Sends one change; a refusal stays on the card with its copy, a success clears it. */
  const run = async (cmd: Command, vars: Record<string, string | number> = {}) => {
    const r = await act(cmd, { silent: true });
    if (r.ok) { setRefusal(null); return; }
    const code = r.error ?? 'unknown';
    setRefusal({ code, vars: { ...refusalVars(code, v), ...vars } });
  };

  /** Sends a change only when it differs from what the shop has now: a re-click on the selected level sends nothing. */
  const change = (current: string | number, next: string, cmd: Command, vars?: Record<string, string | number>) => {
    if (String(current) === next) return;
    void run(cmd, vars);
  };

  // the day's lines come from the server signed (money out is negative): the card formats them and does no arithmetic
  const lines: { key: string; label: string; value: number }[] = [
    { key: 'revenue', label: t('shop.line.revenue'), value: v.daily.revenue },
    { key: 'wages', label: t('shop.line.wages'), value: v.daily.wages },
    { key: 'opex', label: t('shop.line.opex'), value: v.daily.opex },
    { key: 'marketing', label: t('shop.line.marketing'), value: v.daily.marketing },
    { key: 'quality', label: t('shop.line.quality'), value: v.daily.quality },
    { key: 'maintenance', label: t('shop.line.maintenance'), value: v.daily.maintenance },
    { key: 'manager', label: t('shop.line.manager'), value: v.daily.manager },
  ];

  return (
    <Card className="flex flex-col gap-4 p-4" data-testid={`shop-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-title text-fg">{v.name}</h2>
          <p className="text-caption text-fg-faint">{t('shop.meta', { sector, tier: v.tier, tierName, city: cityName })}</p>
        </div>
        <div className="text-right">
          <div className="label">{t('shop.net.perDay')}</div>
          <div className={`num text-body ${v.daily.net >= 0 ? 'text-gain' : 'text-loss'}`} data-testid={`shop-${id}-net`}>{money(v.daily.net)}</div>
        </div>
      </div>

      {/*
        A figure never splits or truncates (Stat `figure`: one line). The grid steps down to one column before a cell is
        too narrow for the longest figure (14px mono, about 8.4 px a digit: "$154,321.00" is about 92 px). Two columns
        from 22rem, four from 40rem (each cell then keeps about 134 px).
      */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 @[22rem]:grid-cols-2 @[40rem]:grid-cols-4">
        <Stat figure label={t('biz.payback')} value={v.payback.days === null ? '—' : t('biz.paybackValue', { n: fx(v.payback.days, 1) })} testId={`shop-${id}-payback`} />
        <Stat figure label={t('shop.line.revenue')} value={money(v.daily.revenue)} testId={`shop-${id}-revenue`} />
        <Stat figure label={t('shop.label.reviews')} value={t('shop.label.starsValue', { stars: fx(v.stars, 1) })} testId={`shop-${id}-stars`} />
        <Stat figure label={t('shop.label.morale')} value={pct(v.morale)} testId={`shop-${id}-morale`} />
      </div>
      <div className="flex flex-col gap-1 text-caption text-fg-muted">
        <p data-testid={`shop-${id}-payback-note`}>{v.payback.days === null ? t('shop.payback.none') : t('shop.payback', { days: fx(v.payback.days, 1) })}</p>
        <p data-testid={`shop-${id}-served`}>{t('shop.served', { served: fx(v.served), demand: fx(v.demand) })}</p>
        <p data-testid={`shop-${id}-queue`}>{t('shop.queue', { n: fx(v.turnedAway), share: pct(v.turnedAwayShare) })}</p>
        <p data-testid={`shop-${id}-condition`}>{t('shop.condition', { condition: Math.round(v.condition) })}</p>
        <p data-testid={`shop-${id}-touched`}>{v.unattendedDays < 1 ? t('shop.touched.today') : t('shop.touched.ago', { n: Math.floor(v.unattendedDays) })}</p>
      </div>

      {refusal && <ShopRefusal code={refusal.code} vars={refusal.vars} testId={`shop-${id}-refusal`} />}

      <section className="flex flex-col gap-3" aria-label={t('shop.settings')}>
        <h3 className="label">{t('shop.settings')}</h3>
        <Lever label={t('shop.crew')} hint={t('shop.crew.hint')}>
          <Segmented<string>
            size="sm"
            label={t('shop.crew')}
            value={String(st.crew)}
            onChange={(x) => change(st.crew, x, { type: 'biz.crew', bizId: id, crew: Number(x) })}
            options={v.levels.crew.map((c) => ({ value: String(c), label: fx(c), testId: `shop-${id}-crew-${c}` }))}
          />
        </Lever>

        <Lever label={t('shop.price')} hint={t('shop.price.hint')}>
          <Segmented<string>
            size="sm"
            label={t('shop.price')}
            value={String(st.pendingPrice ?? st.price)}
            onChange={(x) => change(st.pendingPrice ?? st.price, x, { type: 'biz.price', bizId: id, price: Number(x) }, { day: v.price.nextChangeDay })}
            options={v.levels.price.map((p) => ({ value: String(p), label: `${fx(p)}x`, testId: `shop-${id}-price-${p}` }))}
          />
          <p className="text-caption text-fg-faint" data-testid={`shop-${id}-price-now`}>{t('shop.price.now', { price: fx(st.price) })}</p>
          {st.pendingPrice !== null && v.price.effectiveDay !== null && (
            <p className="text-caption text-fg-muted" data-testid={`shop-${id}-price-pending`}>{t('shop.price.pending', { price: fx(st.pendingPrice), day: v.price.effectiveDay })}</p>
          )}
          {v.price.cappedTo !== null && (
            <p className="text-caption text-fg-muted" data-testid={`shop-${id}-price-capped`}>{t('shop.price.capped', { cap: fx(v.price.cappedTo) })}</p>
          )}
          {!v.price.changeable && <p className="text-caption text-fg-muted" data-testid={`shop-${id}-price-locked`}>{t('shop.price.locked', { day: v.price.nextChangeDay })}</p>}
        </Lever>

        <Lever label={t('shop.quality')} hint={t('shop.quality.hint')}>
          <Segmented<string>
            size="sm"
            label={t('shop.quality')}
            value={String(st.quality)}
            onChange={(x) => change(st.quality, x, { type: 'biz.quality', bizId: id, level: Number(x) })}
            options={v.levels.quality.map((k) => ({ value: String(k), label: String(k), testId: `shop-${id}-quality-${k}` }))}
          />
        </Lever>

        <Lever label={t('shop.marketing')} hint={t('shop.marketing.hint')}>
          <Segmented<string>
            size="sm"
            label={t('shop.marketing')}
            value={String(st.marketing)}
            onChange={(x) => change(st.marketing, x, { type: 'biz.marketing', bizId: id, level: Number(x) })}
            options={v.levels.marketing.map((k) => ({ value: String(k), label: String(k), testId: `shop-${id}-marketing-${k}` }))}
          />
        </Lever>

        <Lever label={t('shop.maintained')} hint={t('shop.maintained.hint')}>
          <Segmented<'on' | 'off'>
            size="sm"
            label={t('shop.maintained')}
            value={st.maintained ? 'on' : 'off'}
            onChange={(x) => change(st.maintained ? 'on' : 'off', x, { type: 'biz.maintain', bizId: id, on: x === 'on' })}
            options={[
              { value: 'on', label: t('shop.on'), testId: `shop-${id}-maintain-on` },
              { value: 'off', label: t('shop.off'), testId: `shop-${id}-maintain-off`, disabled: st.maintainedByManager },
            ]}
          />
          {st.maintainedByManager && <p className="text-caption text-fg-muted" data-testid={`shop-${id}-maintain-managed`}>{t('shop.maintained.managed')}</p>}
        </Lever>
      </section>

      <section className="flex flex-col gap-2" aria-label={t('shop.manager.title')} data-testid={`shop-${id}-manager`}>
        <h3 className="label">{t('shop.manager.title')}</h3>
        {m.stars === 0 ? (
          <>
            <p className="text-caption text-fg-faint">{t('shop.manager.none')}</p>
            <div className="flex flex-wrap gap-2">
              {m.offers.map((o) => (
                <SpendReview
                  key={o.stars}
                  size="sm"
                  testId={`shop-${id}-hire-${o.stars}`}
                  label={t('shop.manager.hire', { stars: o.stars, prepay: money(o.prepay) })}
                  title={t('shop.manager.hire', { stars: o.stars, prepay: money(o.prepay) })}
                  rows={spendRows(o.prepay, cash)}
                  onConfirm={() => run({ type: 'biz.manager.hire', bizId: id, stars: o.stars }, { prepay: money(o.prepay), shortfall: money(o.shortfall) })}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            {m.autopilot && (
              <p className="text-caption text-fg-muted">
                {t('shop.manager.has', { stars: m.stars, crew: fx(m.autopilot.crewFloor), quality: m.autopilot.qualityFloor, cap: fx(m.autopilot.priceCap) })}
              </p>
            )}
            <p className="text-caption text-fg-faint">{t('shop.manager.forfeit', { amount: money(m.forfeit) })}</p>
            <div>
              <ConfirmButton
                testId={`shop-${id}-fire`}
                confirm={t('shop.manager.fireConfirm', { amount: money(m.forfeit) })}
                onConfirm={() => run({ type: 'biz.manager.fire', bizId: id }, { day: m.fireOpenDay })}
              >
                {t('shop.manager.fire')}
              </ConfirmButton>
            </div>
            {!m.canFire && <p className="text-caption text-fg-faint" data-testid={`shop-${id}-tenure`}>{t('shop.manager.tenure', { day: m.fireOpenDay })}</p>}
          </>
        )}
      </section>

      <section data-testid={`shop-${id}-day`} className="flex flex-col gap-2">
        <h3 className="label">{t('shop.day.title')}</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-small @[22rem]:grid-cols-2 @[40rem]:grid-cols-4">
          {lines.map((ln) => (
            <Line key={ln.key} label={ln.label} testId={`shop-${id}-line-${ln.key}`}>{money(ln.value)}</Line>
          ))}
          <Line label={t('shop.line.net')} testId={`shop-${id}-line-net`} strong tone={v.daily.net >= 0 ? 'gain' : 'loss'}>{money(v.daily.net)}</Line>
        </dl>
      </section>

      <div className="flex flex-col gap-1 text-caption text-fg-faint">
        <p data-testid={`shop-${id}-offline`}>
          {t('shop.offline', {
            full: v.offline.fullDays, fullManaged: v.offline.fullDaysManaged, floor: pct(v.offline.floor),
            ramp: v.offline.rampEndDays, rampManaged: v.offline.rampEndDaysManaged,
          })}
        </p>
        <p className="text-fg-muted" data-testid={`shop-${id}-wellrun`}>
          {t('shop.wellRun', { crew: fx(v.wellRun.crew), quality: v.wellRun.quality, price: fx(v.wellRun.price), days: fx(v.payback.wellRunDays, 1) })}
        </p>
      </div>
    </Card>
  );
}

function Lever({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col">
        <span className="text-small font-medium text-fg">{label}</span>
        <span className="text-caption text-fg-faint">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Line({ label, children, testId, strong = false, tone }: { label: string; children: ReactNode; testId: string; strong?: boolean; tone?: 'gain' | 'loss' }) {
  const color = tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-fg';
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-ink-2 pt-1" data-testid={testId}>
      <dt className={strong ? 'font-medium text-fg' : 'text-fg-muted'}>{label}</dt>
      <dd className={`num whitespace-nowrap ${strong ? 'font-medium' : ''} ${color}`}>{children}</dd>
    </div>
  );
}
