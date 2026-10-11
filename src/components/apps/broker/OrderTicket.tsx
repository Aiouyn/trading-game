'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buyingPower, commission, estimateFill, marginConfig, marginRuleApplies, mayShort, tradingConfig, type OrderType, type Side } from '@/engine';
import { licenseFor, rankIndex } from '@/content/lifestyle';
import { QUICK_ENTER, SIMPLE_MODE } from '@/content/learning';
import { money, price, qty as fmtQty } from '@/game/format';
import { isIndex, useGame } from '@/game/store';
import { isDelisted, isUntradable } from '@/game/universe';
import { capBaseOf, openingNotionalOf } from '@/world/orders';
import { t } from '@/i18n';
import { getDraft, setDraft } from '@/components/os/drafts';
import { isPhoneViewport } from '@/components/os/phoneStore';
import { Button, Card, KV, LockGlyph, NumberField, Segmented } from '@/components/ui';
import { RefusalBox } from '@/components/apps/exchange/Shared';
import { type RefusalCopy, refusalCopy, rejectVars } from '@/components/apps/exchange/copy';
import { quickEnterAllowed, tradeKeyIntent } from './tradeKeys';

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

/** Native controls keep their own Enter (a button clicks, a checkbox toggles), so the ticket leaves that Enter alone. */
function nativeEnter(el: HTMLElement | null): boolean {
  if (!el) return false;
  return el.tagName === 'BUTTON' || el.tagName === 'A' || (el instanceof HTMLInputElement && el.type === 'checkbox');
}

/**
 * The ticket for a ticker. A Broker passes its own ticker. A ticket preset (the stop explainer) fills
 * only the ticket on the game's selected ticker, so two Brokers on other tickers stay clean.
 */
export function OrderTicket({ ticker, dense = false }: { ticker?: string; dense?: boolean } = {}) {
  const globalSelected = useGame((s) => s.selected);
  const preset = useGame((s) => s.ticketPreset);
  const selected = ticker ?? globalSelected;
  const here = ticker === undefined || ticker === globalSelected ? preset : null;
  // a new asset or a new preset starts a fresh ticket
  return <Ticket key={`${selected}-${here?.nonce ?? 0}`} preset={here} selected={selected} dense={dense} />;
}

function Ticket({ preset, selected, dense }: { preset: ReturnType<typeof useGame.getState>['ticketPreset']; selected: string; dense: boolean }) {
  const world = useGame((s) => s.world);
  const me = useGame((s) => s.me);
  const playerId = useGame((s) => s.playerId);
  const config = useGame((s) => s.config);
  const act = useGame((s) => s.act);
  const setSheet = useGame((s) => s.setTradeSheet);
  const quick = useGame((s) => s.quickEnter);
  const setQuick = useGame((s) => s.setQuickEnter);
  const rootRef = useRef<HTMLDivElement>(null);
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
  // A manager may trade through the account of his own fund (the selector shows only then). Fund trades are market or
  // limit, through the fund's own account: the world enforces the mandate and the fund's refusals show inline.
  const managed = me?.exchange.managed ?? null;
  const [account, setAccount] = useState<'me' | 'fund'>('me');
  const [fundRefusal, setFundRefusal] = useState<RefusalCopy | null>(null);
  const fundMode = !!managed && account === 'fund';
  // The confirm line belongs to one order: it holds that order's signature, so any edit clears it without an effect.
  const [confirm, setConfirm] = useState<string | null>(null);
  const signature = [side, type, q, limit, stop, trail, tif, bracket, tp, sl].join('|');
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

  const ready = !!(world && me && playerId && ctx);
  const lic = ready ? licenseFor(me!.player.rankId) : null;
  const locked = !fundMode && ready && lic ? !lic.classes.includes(ctx!.def.assetClass) : false;
  const acct = me?.account ?? null;
  // the fund's own cash and position, when the ticket trades through the fund
  const cashNow = fundMode && managed ? managed.cash : (acct?.cash ?? 0);
  const held = fundMode && managed ? (managed.positions.find((p) => p.assetId === selected)?.qty ?? 0) : (acct?.positions[selected]?.qty ?? 0);
  const outside = fundMode && !!ctx && !!managed && !managed.mandate.classes.includes(ctx.def.assetClass);
  const whole = ctx?.def.assetClass === 'stock';
  const firstTrade = !!me && me.player.stats.trades === 0 && !me.player.onboarding.skipped;
  const simple = firstTrade && !fundMode;
  const typeOpts = fundMode ? TYPE_OPTS.filter((o) => o.value === 'market' || o.value === 'limit') : TYPE_OPTS;
  const qtyN = num(q);
  const est = world && ctx ? estimateFill(world, { assetId: selected, side, qty: Math.max(qtyN, whole ? 1 : 0.0001) }) : null;
  const refPrice = est ? (type === 'limit' || type === 'stop_limit' ? num(limit) || est.price : type === 'stop' ? num(stop) || est.price : est.price) : 0;
  const notional = qtyN * refPrice;
  const fee = world && ctx ? commission(world, ctx.def, notional) : 0;
  const total = side === 'buy' ? notional + fee : notional - fee;
  const bp = world && playerId ? buyingPower(world, playerId) : 0;
  // the margin rules bite for an account that borrows or holds a short; a cash-secured long account buys with its cash
  const margin = !fundMode && !!acct && marginRuleApplies(acct);
  // the server's rule (orders.ts): every buy below R1 is capped, not only the first trade
  const simpleCap = !fundMode && !!me && rankIndex(me.player.rankId) < rankIndex(SIMPLE_MODE.untilRank);
  // the cap is a share of cash the short proceeds do not inflate (orders.ts capBaseOf, the same rule the server reads)
  const capCash = acct && simpleCap ? capBaseOf(acct.cash, acct.positions) * SIMPLE_MODE.capFraction : Infinity;
  // a short the rules allow this account (a covered insider on a cash-secured account may not short its own company)
  const shortOk = !!world && !!acct && mayShort(world, acct, selected);
  const budget = side === 'buy' ? Math.min(margin ? bp : cashNow, capCash) : 0;
  const maxQty = !est ? 0 : side === 'buy'
    ? Math.max(0, (budget - (ctx?.def.assetClass === 'crypto' ? 0 : 1)) / (est.price * 1.002))
    : held > 0 ? held : shortOk ? bp / est.price : 0;
  const roundQ = (x: number) => (whole ? Math.floor(x) : Math.floor(x * 1e4) / 1e4);
  const shorting = !fundMode && side === 'sell' && qtyN > Math.max(0, held) + 1e-9;
  // the notional this order opens: a buy's shares, or a sell's shares past the holding (a short), at the reference price
  const opening = side === 'buy' ? qtyN : Math.max(0, qtyN - Math.max(0, held));
  const openingNotional = opening * refPrice;
  // a short is secured by its full notional on top of the proceeds (cash-secured at 1x, orders.ts and trading.ts)
  const shortCollateral = shorting ? openingNotional : 0;
  // the engine's accrual rate: the asset's own borrow fee, else its class rate (trading.ts), so the ticket never shows another
  const borrowRate = world && ctx ? (ctx.def.borrowFee ?? marginConfig(world).borrowFee[ctx.def.assetClass] ?? 0.01) : 0;
  // the open orders' committed notional, for simple mode's aggregate cap (the server reads the same rule, orders.ts)
  const committedOpen = simpleCap && world && me
    ? openingNotionalOf(me.orders, acct?.positions ?? {}, (id) => { const i = config.assets.findIndex((a) => a.id === id); return i < 0 ? 0 : Math.exp(world.assets[i]!.lnP); })
    : 0;

  // the cap's percent and the rank that lifts it come from the same constant the server reads (SIMPLE_MODE), never typed here
  const firstCapVars = { pct: Math.round(SIMPLE_MODE.capFraction * 100), rank: t('rank.' + SIMPLE_MODE.untilRank) };

  // Every refusal says why (the ticket never just greys out): the first failing rule wins.
  let invalid: Refusal | null = null;
  if (!ctx || !acct || !est) invalid = null;
  else if (fundMode) {
    // the mandate and the fund's cash and limits are the world's to refuse (the refusal shows after the send)
    if (outside) invalid = { key: 'broker.fund.outside', vars: { name: managed!.name } };
    else if (qtyN <= 0) invalid = null;
    else if (whole && !Number.isInteger(qtyN)) invalid = { key: 'broker.refuse.whole' };
    else if (type === 'limit' && num(limit) <= 0) invalid = { key: 'broker.refuse.limit' };
  }
  else if (locked) invalid = { key: 'broker.refuse.license', vars: { tier: t(ctx.def.assetClass === 'stock' || ctx.def.assetClass === 'crypto' ? 'broker.tier.retail' : 'broker.tier.pro') } };
  else if (qtyN <= 0) invalid = null;
  else if (whole && !Number.isInteger(qtyN)) invalid = { key: 'broker.refuse.whole' };
  else if ((side === 'buy' || shorting) && simpleCap && committedOpen + opening * ctx.mid > capCash + 1e-6) invalid = { key: 'broker.firstCap', vars: firstCapVars };
  else if (side === 'buy' && !margin && total > acct.cash + 1e-6) invalid = { key: 'broker.refuse.cash', vars: { total: money(total), cash: money(acct.cash) } };
  else if (side === 'buy' && margin && notional + fee > bp + Math.max(0, -held) * refPrice + 1e-6) invalid = { key: 'broker.refuse.bp', vars: { need: money(notional + fee), bp: money(bp) } };
  else if (shorting && !acct.canShort) invalid = held > 0 ? { key: 'broker.refuse.fewer' } : { key: 'broker.refuse.short' };
  else if (shorting && !shortOk) invalid = { key: 'broker.refuse.covered' };
  else if (shorting && shortCollateral + fee > bp + 1e-6) invalid = { key: 'broker.refuse.bp', vars: { need: money(shortCollateral + fee), bp: money(bp) } };
  else if ((type === 'limit' || type === 'stop_limit') && num(limit) <= 0) invalid = { key: 'broker.refuse.limit' };
  else if ((type === 'stop' || type === 'stop_limit') && num(stop) <= 0) invalid = { key: 'broker.refuse.stop' };
  else if (type === 'trailing' && !(num(trail) > 0 && num(trail) < 50)) invalid = { key: 'broker.refuse.trail' };
  else if (bracket && (num(tp) <= 0 || num(sl) <= 0)) invalid = { key: 'broker.refuse.bracket' };
  else if (bracket && (side === 'buy' ? num(tp) <= num(sl) : num(tp) >= num(sl))) invalid = { key: 'broker.refuse.bracketSide' };

  const canSubmit = !invalid && qtyN > 0;
  const confirming = canSubmit && confirm === signature;
  const verb = side === 'buy'
    ? (held < 0 ? t('broker.verb.cover') : t('broker.verb.buy'))
    : shorting ? t('broker.verb.short') : t('broker.verb.sell');
  const actionLabel = t('broker.action', { verb, qty: qtyN > 0 ? fmtQty(qtyN) : '', ticker: selected }).replace(/\s+/g, ' ').trim();

  const submit = async () => {
    setConfirm(null);
    setFundRefusal(null);
    if (isUntradable(config, selected)) return; // a delisted or off-book name is refused before anything is sent
    if (fundMode && managed) {
      const fr = await act({
        type: 'fund.trade', fundId: managed.id, assetId: selected, side, qty: qtyN,
        orderType: type === 'limit' ? 'limit' : 'market',
        ...(type === 'limit' ? { limitPrice: num(limit) } : {}),
      }, { silent: true });
      if (fr.ok) {
        setQ('');
        useGame.getState().toast({ tone: 'info', text: t('broker.fund.sent', { fund: managed.name, label: actionLabel }) });
      } else {
        setFundRefusal(refusalCopy('funds.refusal', fr.error ?? '', rejectVars(fr.data)));
      }
      return;
    }
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

  // Keyboard trading (M10): B and S set the side, 1 to 4 the order type, slash finds an asset, and Enter asks for the
  // confirm line; a second Enter sends it (one Enter does, under the quick-Enter setting, for a small order). Escape
  // cancels the confirm. Only the focused desktop window reacts, and a typed key in a field stays typed. The listener is
  // registered on every render, so it always sees this render's order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ready || e.ctrlKey || e.metaKey || e.altKey || isPhoneViewport()) return;
      const win = rootRef.current?.closest('.os-win');
      if (!win?.classList.contains('active')) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const typing = !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      const intent = tradeKeyIntent(e.code, typing);
      if (!intent) return;
      // Enter and Escape are shared keys: in a text field outside this ticket (the asset search, say) they belong to that field
      const inTicket = !!el && !!rootRef.current?.contains(el);
      if (typing && !inTicket && (intent.kind === 'enter' || intent.kind === 'cancel')) return;
      // Shift is the shell's (Shift with the question mark opens the key list), so only Enter and Escape read it
      if (e.shiftKey && intent.kind !== 'enter' && intent.kind !== 'cancel') return;
      let handled = false;
      if (intent.kind === 'enter') {
        if (nativeEnter(el) || !canSubmit) return;
        handled = true;
        if (confirm === signature || (quick && quickEnterAllowed(notional, acct?.cash ?? 0))) void submit();
        else setConfirm(signature);
      } else if (intent.kind === 'cancel') {
        if (confirm !== signature) return;
        handled = true;
        setConfirm(null);
      } else if (intent.kind === 'side') {
        handled = true;
        setSide(intent.side);
      } else if (intent.kind === 'type') {
        if (simple) return; // the type picker is hidden on a first trade
        handled = true;
        setType(intent.type);
      } else if (intent.kind === 'ticker') {
        const search = win.querySelector<HTMLInputElement>('[data-testid="asset-search"]');
        if (!search) return;
        handled = true;
        search.focus();
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!world || !me || !playerId) return null;
  if (!ctx || !lic || !acct) {
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

  // the rate the engine charges this class (trading config), so the ticket never shows a stale fee
  const feeTable = tradingConfig(world).fees;
  const fees = `${((feeTable[def.assetClass] ?? feeTable.stock).rate * 100).toFixed(2)}%`;
  // the refusal, the confirm line and the Buy button stay pinned under the fields, so they are on screen whatever the fields height
  const footerBody = (
    <>
            {invalid && <p className="mt-2 text-caption text-warn" data-testid="order-invalid">{t(invalid.key, invalid.vars)}</p>}
            {fundRefusal && <RefusalBox copy={fundRefusal} testId="order-fund-refusal" />}
            {halted && <p className="mt-2 text-caption text-warn">{t('broker.haltedNote')}</p>}
            {confirming && (
              <p className="mt-3 text-small text-fg" role="status" data-testid="order-confirm">{t('broker.confirm', { label: actionLabel, total: money(total) })}</p>
            )}
            <Button variant="brass" size={dense ? "md" : "lg"} className={`w-full ${dense ? "mt-2" : "mt-3"}`} disabled={!canSubmit} onClick={submit} testId="order-submit">{actionLabel}</Button>
            <p className="mt-2 text-center text-caption text-fg-faint" data-testid="honest-note">{t('order.honest')}</p>
            <label className="mt-2 flex items-center gap-2 text-caption text-fg-muted">
              <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} data-testid="quick-enter" />
              {t('broker.quickEnter', { pct: Math.round(QUICK_ENTER.maxCashFraction * 100) })}
            </label>
    </>
  );
  return (
    <Card className={dense ? 'flex min-h-0 flex-1 flex-col p-3' : 'p-4'} data-testid="order-pad">
      <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
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

        {managed && (
          <div className="mt-3 flex flex-col gap-1" data-testid="order-account">
            <Segmented
              label={t('broker.account.label')} size="sm" className="w-full" value={account}
              onChange={(v) => {
                const next = v as 'me' | 'fund';
                setAccount(next);
                if (next === 'fund' && type !== 'market' && type !== 'limit') setType('market');
              }}
              options={[
                { value: 'me', label: t('broker.account.me'), testId: 'account-me' },
                { value: 'fund', label: t('broker.account.fund', { name: managed.name }), testId: 'account-fund' },
              ]}
            />
            {fundMode && <p className="text-caption text-fg-muted" data-testid="account-fund-note">{t('broker.account.note', { name: managed.name })}</p>}
          </div>
        )}

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
                { value: 'sell', label: fundMode || held > 0 || !shortOk ? t('common.sell') : t('broker.sellShort'), testId: 'side-sell' },
              ]}
            />
            {!simple && (
              <Segmented
                label={t('broker.orderType')} size="sm" className="mt-2 w-full" value={type} onChange={(v) => setType(v as OrderType)}
                options={typeOpts.map((o) => ({ value: o.value, label: t(o.key), testId: o.testId }))}
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
                  {f === 1 ? (simpleCap && side === 'buy' ? t('broker.maxCap', { pct: firstCapVars.pct }) : t('broker.max')) : t('broker.pct', { p: Math.round(f * 100) })}
                </button>
              ))}
            </div>
            {simpleCap && (side === 'buy' || shorting) && <p className="mt-1.5 text-caption text-fg-muted" data-testid="first-trade-cap">{t('broker.firstCap', firstCapVars)}</p>}

            {(type === 'limit' || type === 'stop_limit') && <NumberField className="mt-2" label={t('order.limit')} value={limit} onChange={setLimit} suffix="$" testId="order-limit" />}
            {(type === 'stop' || type === 'stop_limit') && <NumberField className="mt-2" label={t('order.stop')} value={stop} onChange={setStop} suffix="$" testId="order-stop" />}
            {type === 'trailing' && <NumberField className="mt-2" label={t('broker.trail')} value={trail} onChange={setTrail} suffix="%" testId="order-trail" />}

            {!simple && !fundMode && (
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
                        setTp((est!.price * (1 + up * 0.08)).toFixed(2));
                        setSl((est!.price * (1 - up * 0.04)).toFixed(2));
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
              <KV k={side === 'buy' ? t('broker.askEst') : t('broker.bidEst')} v={price(est!.price)} />
              <KV k={t('broker.notional')} v={money(notional)} />
              <KV k={t('broker.fee', { rate: fees })} v={money(fee)} />
              <KV k={t('broker.slippage')} v={t('broker.bp', { v: est!.slippageBps.toFixed(1) })} />
              <KV k={<span className="font-semibold text-fg">{t('broker.total')}</span>} v={<span className="font-semibold" data-testid="order-total">{money(total)}</span>} />
              <KV
                k={margin || shorting ? t('broker.buyingPower') : t('broker.cashAfter')}
                v={<span className="text-fg-muted">{money(margin || shorting ? bp - (side === 'buy' || shorting ? notional : 0) : cashNow - (side === 'buy' ? total : -total))}</span>}
              />
              {shorting && (
                <div className="mt-1 grid gap-1" data-testid="order-short-terms">
                  <KV k={t('broker.collateral')} v={<span className="text-fg-muted" data-testid="order-collateral">{money(shortCollateral)}</span>} />
                  <KV k={t('broker.borrowFee')} v={<span className="text-fg-muted" data-testid="order-borrow-fee">{t('broker.borrowFee.rate', { rate: (borrowRate * 100).toFixed(2) })}</span>} />
                </div>
              )}
              {shorting && <p className="mt-1 text-caption text-warn">{t('broker.shortWarn')}</p>}
              {margin && side === 'buy' && notional > acct.cash && <p className="mt-1 text-caption text-warn">{t('broker.marginWarn')}</p>}
            </div>
          </>
        )}
        </div>
        {!locked && <div className="shrink-0 pt-2">{footerBody}</div>}
      </div>
    </Card>
  );
}
