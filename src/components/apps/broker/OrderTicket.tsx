'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { buyingPower, commission, estimateFill, tradingConfig, type OrderType, type Side } from '@/engine';
import { licenseFor } from '@/content/lifestyle';
import { money, price, qty as fmtQty } from '@/game/format';
import { isIndex, useGame } from '@/game/store';
import { isDelisted, isUntradable } from '@/game/universe';
import { t } from '@/i18n';
import { getDraft, setDraft } from '@/components/os/drafts';
import { Button, Card, KV, LockGlyph, NumberField, Segmented } from '@/components/ui';

const TYPE_OPTS: { value: OrderType; key: string; testId: string }[] = [
  { value: 'market', key: 'order.market', testId: 'type-market' },
  { value: 'limit', key: 'order.limit', testId: 'type-limit' },
  { value: 'stop', key: 'order.stop', testId: 'type-stop' },
  { value: 'stop_limit', key: 'order.stop_limit', testId: 'type-stop_limit' },
  { value: 'trailing', key: 'order.trailing', testId: 'type-trailing' },
];

/** A refusal shown inline under the ticket: a translation key and its values. */
interface Refusal { key: string; vars?: Record<string, string | number> }

function num(s: string): number {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

/**
 * The ticket for a ticker. A Broker passes its own ticker. A ticket preset (the stop explainer) fills
 * only the ticket on the game's selected ticker, so two Brokers on other tickers stay clean.
 */
export function OrderTicket({ ticker }: { ticker?: string } = {}) {
  const globalSelected = useGame((s) => s.selected);
  const preset = useGame((s) => s.ticketPreset);
  const selected = ticker ?? globalSelected;
  const here = ticker === undefined || ticker === globalSelected ? preset : null;
  // a new asset or a new preset starts a fresh ticket
  return <Ticket key={`${selected}-${here?.nonce ?? 0}`} preset={here} selected={selected} />;
}

function Ticket({ preset, selected }: { preset: ReturnType<typeof useGame.getState>['ticketPreset']; selected: string }) {
  const world = useGame((s) => s.world);
  const me = useGame((s) => s.me);
  const playerId = useGame((s) => s.playerId);
  const config = useGame((s) => s.config);
  const act = useGame((s) => s.act);
  const setSheet = useGame((s) => s.setTradeSheet);
  // A ticket reopened after its window or phone app closed restores what was typed. A preset still wins (P2-161).
  const saved = getDraft(selected);
  const [side, setSide] = useState<Side>(preset?.side ?? saved?.side ?? 'buy');
  const [type, setType] = useState<OrderType>(preset?.type ?? 'market');
  const [q, setQ] = useState(preset?.qty !== undefined ? String(preset.qty) : (saved?.q ?? ''));
  const [limit, setLimit] = useState(preset?.limitPrice !== undefined ? preset.limitPrice.toFixed(2) : '');
  const [stop, setStop] = useState(preset?.stopPrice !== undefined ? preset.stopPrice.toFixed(2) : '');
  const [trail, setTrail] = useState('5');
  const [tif, setTif] = useState<'gtc' | 'day'>('gtc');
  const [bracket, setBracket] = useState(false);
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  // Unsent input is a session draft for this ticker (P2-160, P2-161): it stays when the ticket unmounts, and Recent
  // shows its dot. It is never sent from there. An empty quantity (a sent order clears it) leaves no draft.
  useEffect(() => {
    setDraft(selected, { side, q });
  }, [selected, side, q]);

  const ctx = useMemo(() => {
    if (!world || !me || !playerId || isIndex(selected)) return null;
    const i = config.assets.findIndex((a) => a.id === selected);
    const def = config.assets[i];
    if (!def || isUntradable(config, selected)) return null;
    const a = world.assets[i]!;
    return { def, mid: Math.exp(a.lnP), halted: a.haltUntil !== -1 && a.haltUntil > world.tick };
  }, [world, me, playerId, selected, config]);

  if (!world || !me || !playerId) return null;
  if (!ctx) {
    const delisted = isDelisted(config, selected);
    const untradable = !isIndex(selected) && isUntradable(config, selected);
    return (
      <Card className="p-4" data-testid="order-pad">
        <h2 className="font-serif text-title">{t('broker.trade')}</h2>
        {delisted
          ? <p className="mt-2 text-small text-loss" data-testid="order-delisted">{t('broker.delistedTicket', { ticker: selected })}</p>
          : untradable
            ? <p className="mt-2 text-small text-fg-muted" data-testid="order-untradable">{t('broker.notTradable.ticket', { ticker: selected })}</p>
            : <p className="mt-2 text-small text-fg-muted">{t('broker.indexNoTrade')}</p>}
      </Card>
    );
  }
  const { def, mid, halted } = ctx;
  const lic = licenseFor(me.player.rankId);
  const locked = !lic.classes.includes(def.assetClass);
  const acct = me.account!;
  const held = acct.positions[selected]?.qty ?? 0;
  const whole = def.assetClass === 'stock';
  const firstTrade = me.player.stats.trades === 0 && !me.player.onboarding.skipped;
  const simple = firstTrade;
  const qtyN = num(q);
  const est = estimateFill(world, { assetId: selected, side, qty: Math.max(qtyN, whole ? 1 : 0.0001) });
  const refPrice = type === 'limit' || type === 'stop_limit' ? num(limit) || est.price : type === 'stop' ? num(stop) || est.price : est.price;
  const notional = qtyN * refPrice;
  const fee = commission(world, def, notional);
  const total = side === 'buy' ? notional + fee : notional - fee;
  const bp = buyingPower(world, playerId);
  const margin = (acct.maxLeverage ?? 1) > 1 || !!acct.canShort;
  const capCash = firstTrade ? acct.cash * 0.2 : Infinity;
  const budget = side === 'buy' ? Math.min(margin ? bp : acct.cash, capCash) : 0;
  const maxQty = side === 'buy'
    ? Math.max(0, (budget - (def.assetClass === 'crypto' ? 0 : 1)) / (est.price * 1.002))
    : held > 0 ? held : acct.canShort ? bp / est.price : 0;
  const roundQ = (x: number) => (whole ? Math.floor(x) : Math.floor(x * 1e4) / 1e4);
  const shorting = side === 'sell' && qtyN > Math.max(0, held) + 1e-9;

  // Every refusal says why (the ticket never just greys out): the first failing rule wins.
  let invalid: Refusal | null = null;
  if (locked) invalid = { key: 'broker.refuse.license', vars: { tier: t(def.assetClass === 'stock' || def.assetClass === 'crypto' ? 'broker.tier.retail' : 'broker.tier.pro') } };
  else if (qtyN <= 0) invalid = null;
  else if (whole && !Number.isInteger(qtyN)) invalid = { key: 'broker.refuse.whole' };
  else if (side === 'buy' && firstTrade && notional > capCash + 1e-6) invalid = { key: 'broker.firstCap' };
  else if (side === 'buy' && !margin && total > acct.cash + 1e-6) invalid = { key: 'broker.refuse.cash', vars: { total: money(total), cash: money(acct.cash) } };
  else if (side === 'buy' && margin && notional > bp + Math.max(0, -held) * refPrice + 1e-6) invalid = { key: 'broker.refuse.bp', vars: { need: money(notional), bp: money(bp) } };
  else if (shorting && !acct.canShort) invalid = held > 0 ? { key: 'broker.refuse.fewer' } : { key: 'broker.refuse.short' };
  else if ((type === 'limit' || type === 'stop_limit') && num(limit) <= 0) invalid = { key: 'broker.refuse.limit' };
  else if ((type === 'stop' || type === 'stop_limit') && num(stop) <= 0) invalid = { key: 'broker.refuse.stop' };
  else if (type === 'trailing' && !(num(trail) > 0 && num(trail) < 50)) invalid = { key: 'broker.refuse.trail' };
  else if (bracket && (num(tp) <= 0 || num(sl) <= 0)) invalid = { key: 'broker.refuse.bracket' };
  else if (bracket && (side === 'buy' ? num(tp) <= num(sl) : num(tp) >= num(sl))) invalid = { key: 'broker.refuse.bracketSide' };

  const canSubmit = !invalid && qtyN > 0;
  const verb = side === 'buy'
    ? (held < 0 ? t('broker.verb.cover') : t('broker.verb.buy'))
    : shorting ? t('broker.verb.short') : t('broker.verb.sell');
  const actionLabel = t('broker.action', { verb, qty: qtyN > 0 ? fmtQty(qtyN) : '', ticker: selected }).replace(/\s+/g, ' ').trim();

  const submit = async () => {
    if (isUntradable(config, selected)) return; // a delisted or off-book name is refused before anything is sent
    const order = {
      assetId: selected, side, type, qty: qtyN, tif,
      ...(type === 'limit' || type === 'stop_limit' ? { limitPrice: num(limit) } : {}),
      ...(type === 'stop' || type === 'stop_limit' ? { stopPrice: num(stop) } : {}),
      ...(type === 'trailing' ? { trailPct: num(trail) / 100 } : {}),
      ...(bracket ? { takeProfit: num(tp), stopLoss: num(sl) } : {}),
    };
    const r = await act({ type: 'order.place', order });
    if (r.ok) {
      setQ('');
      useGame.getState().toast({
        tone: 'info',
        text: type === 'market' ? t('broker.toast.fillsNext', { label: actionLabel }) : t('broker.toast.working', { label: actionLabel }),
      });
      if (type !== 'market') setSheet(false);
    }
  };

  // the rate the engine charges this class (trading config), so the ticket never shows a stale fee
  const feeTable = tradingConfig(world).fees;
  const fees = `${((feeTable[def.assetClass] ?? feeTable.stock).rate * 100).toFixed(2)}%`;
  // Enter in a ticket field sends the order (P2-105), the same as the button; the button stays the only click path
  const onEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target;
    if (e.key !== 'Enter' || !(el instanceof HTMLInputElement) || el.type === 'checkbox') return;
    e.preventDefault();
    if (canSubmit) void submit();
  };
  return (
    <Card className="p-4" data-testid="order-pad">
      <div onKeyDown={onEnter}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-title">{t('broker.trade')}</h2>
          <span className="text-caption text-fg-faint">
            {margin ? t('broker.licenseMargin', { name: lic.name, lev: acct.maxLeverage ?? 1 }) : t('broker.license', { name: lic.name })}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between text-caption">
          <span className="num text-fg-muted">{t('broker.mid', { ticker: selected, price: price(mid) })}</span>
          {held !== 0 && <span className="num text-fg-faint">{t('broker.youHold', { qty: fmtQty(held) })}</span>}
        </div>

        {locked ? (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-ink-3 p-3" data-testid="locked-ticket">
            <LockGlyph />
            <p className="text-small text-fg-muted">{t('broker.lockedNeed', { name: def.name })}</p>
          </div>
        ) : (
          <>
            <Segmented
              label={t('broker.side')} className="mt-3 w-full" value={side} onChange={(v) => setSide(v as Side)}
              options={[
                { value: 'buy', label: held < 0 ? t('broker.buyCover') : t('common.buy'), testId: 'side-buy' },
                { value: 'sell', label: held > 0 || !acct.canShort ? t('common.sell') : t('broker.sellShort'), testId: 'side-sell' },
              ]}
            />
            {!simple && (
              <Segmented
                label={t('broker.orderType')} size="sm" className="mt-2 w-full" value={type} onChange={(v) => setType(v as OrderType)}
                options={TYPE_OPTS.map((o) => ({ value: o.value, label: t(o.key), testId: o.testId }))}
              />
            )}
            <p className="mt-1.5 text-caption text-fg-faint">{t(`broker.help.${type}`)}</p>

            <NumberField className="mt-3" label={t('broker.quantity')} value={q} onChange={setQ} suffix={whole ? t('broker.unit.shares') : t('broker.unit.units')} step={whole ? 1 : 'any'} testId="order-qty" />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[0.1, 0.25, 0.5, 1].map((f) => (
                <button
                  key={f} type="button" onClick={() => setQ(String(roundQ(maxQty * f)))}
                  className="h-9 rounded-md border border-ink-3 text-caption text-fg-muted hover:border-brass/50 hover:text-fg"
                  data-testid={`chip-${f === 1 ? 'Max' : Math.round(f * 100)}`}
                >
                  {f === 1 ? (firstTrade && side === 'buy' ? t('broker.max20') : t('broker.max')) : t('broker.pct', { p: Math.round(f * 100) })}
                </button>
              ))}
            </div>
            {firstTrade && side === 'buy' && <p className="mt-1.5 text-caption text-fg-muted" data-testid="first-trade-cap">{t('broker.firstCap')}</p>}

            {(type === 'limit' || type === 'stop_limit') && <NumberField className="mt-2" label={t('order.limit')} value={limit} onChange={setLimit} suffix="$" testId="order-limit" />}
            {(type === 'stop' || type === 'stop_limit') && <NumberField className="mt-2" label={t('order.stop')} value={stop} onChange={setStop} suffix="$" testId="order-stop" />}
            {type === 'trailing' && <NumberField className="mt-2" label={t('broker.trail')} value={trail} onChange={setTrail} suffix="%" testId="order-trail" />}

            {!simple && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Segmented
                  label={t('broker.tif')} size="sm" value={tif} onChange={(v) => setTif(v as 'gtc' | 'day')}
                  options={[{ value: 'gtc', label: t('broker.gtc') }, { value: 'day', label: t('broker.day') }]}
                />
                <label className="ml-auto flex items-center gap-2 text-caption text-fg-muted">
                  <input
                    type="checkbox" checked={bracket} data-testid="bracket-toggle"
                    onChange={(e) => {
                      setBracket(e.target.checked);
                      if (e.target.checked && !tp) {
                        const up = side === 'buy' ? 1 : -1;
                        setTp((est.price * (1 + up * 0.08)).toFixed(2));
                        setSl((est.price * (1 - up * 0.04)).toFixed(2));
                      }
                    }}
                  />
                  {t('broker.bracket')}
                </label>
              </div>
            )}
            {bracket && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <NumberField label={t('broker.takeProfit')} value={tp} onChange={setTp} testId="order-tp" />
                <NumberField label={t('broker.stopLoss')} value={sl} onChange={setSl} testId="order-sl" />
              </div>
            )}

            <div className="mt-4 border-t border-ink-2 pt-3">
              <KV k={side === 'buy' ? t('broker.askEst') : t('broker.bidEst')} v={price(est.price)} />
              <KV k={t('broker.notional')} v={money(notional)} />
              <KV k={t('broker.fee', { rate: fees })} v={money(fee)} />
              <KV k={t('broker.slippage')} v={t('broker.bp', { v: est.slippageBps.toFixed(1) })} />
              <KV k={<span className="font-semibold text-fg">{t('broker.total')}</span>} v={<span className="font-semibold" data-testid="order-total">{money(total)}</span>} />
              <KV
                k={margin ? t('broker.buyingPower') : t('broker.cashAfter')}
                v={<span className="text-fg-muted">{money(margin ? bp - (side === 'buy' || shorting ? notional : 0) : acct.cash - (side === 'buy' ? total : -total))}</span>}
              />
              {shorting && <p className="mt-1 text-caption text-warn">{t('broker.shortWarn')}</p>}
              {margin && side === 'buy' && notional > acct.cash && <p className="mt-1 text-caption text-warn">{t('broker.marginWarn')}</p>}
            </div>
            {invalid && <p className="mt-2 text-caption text-warn" data-testid="order-invalid">{t(invalid.key, invalid.vars)}</p>}
            {halted && <p className="mt-2 text-caption text-warn">{t('broker.haltedNote')}</p>}
            <Button variant="brass" size="lg" className="mt-3 w-full" disabled={!canSubmit} onClick={submit} testId="order-submit">{actionLabel}</Button>
            <p className="mt-2 text-center text-caption text-fg-faint" data-testid="honest-note">{t('order.honest')}</p>
          </>
        )}
      </div>
    </Card>
  );
}
