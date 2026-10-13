'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { assetIndex, buyingPower, commission, estimateFill, halfSpread, marginConfig, marginRuleApplies, mayShort, qtyStep, tradingConfig, type OrderType, type Side } from '@/engine';
import { licenseFor, rankIndex } from '@/content/lifestyle';
import { QUICK_ENTER, SIMPLE_MODE } from '@/content/learning';
import { assetPrice, dec, money, pctUnit, qtyIn, signedMoney, signedPct } from '@/game/format';
import { isIndex, useGame } from '@/game/store';
import { isDelisted, isUntradable } from '@/game/universe';
import { capBaseOf, openingNotionalOf } from '@/world/orders';
import { t } from '@/i18n';
import { getDraft, setDraft } from '@/components/os/drafts';
import { isPhoneViewport } from '@/components/os/phoneStore';
import { useMedia } from '@/game/useMedia';
import { Button, Card, KV, LockGlyph, NumberField, Segmented } from '@/components/ui';
import { RefusalBox } from '@/components/apps/exchange/Shared';
import { type RefusalCopy, refusalCopy, rejectVars } from '@/components/apps/exchange/copy';
import { quickEnterAllowed, tradeKeyIntent } from './tradeKeys';
import { levelMove } from './chartLevels';
import { checkOrder, engineRefusal, formatRefusalVars, parseDecimal, tradeSummary, type EngineRefusal, type Refusal, type RefusalField } from './ticketMath';

const TYPE_OPTS: { value: OrderType; key: string; testId: string }[] = [
  { value: 'market', key: 'order.market', testId: 'type-market' },
  { value: 'limit', key: 'order.limit', testId: 'type-limit' },
  { value: 'stop', key: 'order.stop', testId: 'type-stop' },
  { value: 'stop_limit', key: 'order.stop_limit', testId: 'type-stop_limit' },
  { value: 'trailing', key: 'order.trailing', testId: 'type-trailing' },
];

/** The order-type help on a short screen is a "?" control: the glyph is data, not copy (the strings are t() keys). */
const HELP_MARK = '?';

/** The size is typed in shares, or in dollars and converted at the reference price (spec 1.4). */
type Unit = 'shares' | 'usd';

/** Native controls keep their own Enter (a button clicks, a checkbox toggles), so the ticket leaves that Enter alone. */
/**
 * A summary line. The dense ticket (the desktop terminal) runs them as one column of label and value rows: a label never wraps,
 * and the value is right-aligned in tabular figures, so the rows line up. The full ticket keeps KV. `k` is the label drawn; `full`
 * is the full wording, the label's title (a short label, on a short screen, keeps the whole wording one hover away).
 */
function SumRow({ dense, k, full, v, className = '' }: { dense: boolean; k: ReactNode; full?: string; v: ReactNode; className?: string }) {
  if (!dense) return <KV className={className} k={k} v={v} />;
  return (
    <div className={`flex items-baseline justify-between gap-3 whitespace-nowrap text-caption leading-4 ${className}`}>
      <span className="min-w-0 truncate text-fg-muted" title={full ?? (typeof k === 'string' ? k : undefined)}>{k}</span>
      <span className="num shrink-0 text-right text-fg">{v}</span>
    </div>
  );
}

function nativeEnter(el: HTMLElement | null): boolean {
  if (!el) return false;
  return el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SELECT' || (el instanceof HTMLInputElement && el.type === 'checkbox');
}

/**
 * The ticket for a ticker. A Broker passes its own ticker. A ticket preset (the stop explainer, a chart menu item) fills
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

/** A refusal the engine gave for the ticket as it was when it was sent: it shows until the ticket changes. */
interface EngineSaid { sig: string; refusal: EngineRefusal }

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
  // A short screen (under 800 px tall, the dock's short-screen rule) keeps the summary in two columns: one column of nine rows does not
  // fit 1280 x 720 beside the fields for every order type (UX stage 6). A taller screen runs it as one column.
  const tall = useMedia('(min-height: 800px)', true);
  // The two columns are narrow: their labels are the short forms (the full wording stays in the title). One column keeps the full labels.
  const shortLabels = dense && !tall;
  // On the same short screen the order-type help is a "?" control beside the picker, and the first-trade cap is one line: the
  // full wording is one hover away (UX stage 6, 1280 x 720 with a stop or stop-limit order).
  const shortScreen = shortLabels;
  // A ticket reopened after its window or phone app closed restores what was typed. A preset still wins (P2-161).
  const saved = getDraft(selected);
  const [side, setSide] = useState<Side>(preset?.side ?? saved?.side ?? 'buy');
  const [type, setType] = useState<OrderType>(preset?.type ?? 'market');
  const [unit, setUnit] = useState<Unit>('shares');
  const [q, setQ] = useState(preset?.qty !== undefined ? String(preset.qty) : (saved?.q ?? ''));
  const [limit, setLimit] = useState(preset?.limitPrice !== undefined ? preset.limitPrice.toFixed(2) : '');
  const [stop, setStop] = useState(preset?.stopPrice !== undefined ? preset.stopPrice.toFixed(2) : '');
  const [trail, setTrail] = useState('5');
  const [tif, setTif] = useState<'gtc' | 'day'>('gtc');
  // take profit and stop loss are always there (spec 1.4, also in simple mode): an empty field is no leg
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
  const [engineSaid, setEngineSaid] = useState<EngineSaid | null>(null);
  const signature = [side, type, unit, q, limit, stop, trail, tif, tp, sl].join('|');
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
    return { def, idx: assetIndex(world, selected), mid: Math.exp(a.lnP), halted: a.haltUntil !== -1 && a.haltUntil > world.tick };
  }, [world, me, playerId, selected, config]);

  const ready = !!(world && me && playerId && ctx);
  const lic = ready ? licenseFor(me!.player.rankId) : null;
  const locked = !fundMode && ready && lic ? !lic.classes.includes(ctx!.def.assetClass) : false;
  const acct = me?.account ?? null;
  // the fund's own cash and position, when the ticket trades through the fund
  const cashNow = fundMode && managed ? managed.cash : (acct?.cash ?? 0);
  const held = fundMode && managed ? (managed.positions.find((p) => p.assetId === selected)?.qty ?? 0) : (acct?.positions[selected]?.qty ?? 0);
  const outside = fundMode && !!ctx && !!managed && !managed.mandate.classes.includes(ctx.def.assetClass);
  // a share (stocks, ETFs) trades in 0.0001 steps (R-10-4): the step is the asset's own, a fraction for the rest
  const shares = ctx?.def.assetClass === 'stock';
  const step = ctx ? qtyStep(ctx.def) : 0;
  const firstTrade = !!me && me.player.stats.trades === 0 && !me.player.onboarding.skipped;
  const simple = firstTrade && !fundMode;
  // The order-type picker is hidden on a first trade (simple mode), except in the narrow layout (the trade sheet, UX 4).
  const showType = !simple || !dense;
  const typeOpts = fundMode ? TYPE_OPTS.filter((o) => o.value === 'market' || o.value === 'limit') : TYPE_OPTS;
  // the size grid (R-10-4, 10A.5): a stock or ETF in 0.0001 shares; crypto in 1e-8 units (its own precision); FX in whole units
  // of the base currency (the lot a retail FX ticket takes); anything else in 1e-4 units. The engine accepts a finer fraction.
  const unitDp = ctx?.def.assetClass === 'crypto' ? 8 : ctx?.def.assetClass === 'forex' ? 0 : 4;
  const grid = step > 0 ? step : 10 ** -unitDp;
  const roundQ = (x: number) => Number((Math.floor(x / grid + 1e-9) * grid).toFixed(unitDp));
  // a size reads at the asset's own decimals (a crypto size keeps its 8 decimals; a share 4)
  const fmtQty = (n: number) => qtyIn(n, unitDp);
  // a size chip never rounds to zero (R-10-4): a chip that is affordable at all sizes to the smallest step, and the refusal says why
  const chipQty = (x: number) => { const r = roundQ(x); return r > 0 || !(x > 0) ? r : grid; };
  // the size in units: the typed number, or a dollar amount converted at the price (the estimate at mid guesses the units)
  const typed = parseDecimal(q);
  const mid = ctx?.mid ?? 0;
  const guessQty = unit === 'shares' ? typed : (mid > 0 ? typed / mid : 0);
  // the preview prices under the account the order fills in: a fund trade fills in the fund's own account (R-10-1, funds/trade.ts)
  const fillAccount = fundMode && managed ? managed.accountId : playerId;
  const est = world && ctx ? estimateFill(world, { assetId: selected, side, qty: Math.max(guessQty, step > 0 ? step : 0.0001), playerId: fillAccount ?? undefined }) : null;
  const refPrice = est ? (type === 'limit' || type === 'stop_limit' ? parseDecimal(limit) || est.price : type === 'stop' ? parseDecimal(stop) || est.price : est.price) : 0;
  const qtyN = unit === 'shares' ? typed : (refPrice > 0 ? roundQ(typed / refPrice) : 0);
  // a dollar amount that does not reach one whole share at this price: said under the size, never sent as zero
  const tooSmall = unit === 'usd' && shares && typed > 0 && qtyN === 0;
  const notional = qtyN * refPrice;
  const fee = world && ctx ? commission(world, ctx.def, notional, qtyN) : 0;
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

  // The rules (ticketMath.ts): the first failing rule is the refusal, under its field. A fund trade keeps its own short list.
  const check = !ctx || !acct || !est || fundMode ? null : checkOrder({
    side, type, qty: qtyN, mid: ctx?.mid ?? 0, ref: refPrice,
    limit: parseDecimal(limit), stop: parseDecimal(stop), trail: parseDecimal(trail),
    tp: tp.trim() === '' ? null : parseDecimal(tp), sl: sl.trim() === '' ? null : parseDecimal(sl),
    cash: acct?.cash ?? 0, bp, margin, total, notional, held, simpleCap, capCash, capPct: firstCapVars.pct, capRank: firstCapVars.rank,
    locked, lockedTier: t(ctx?.def.assetClass === 'stock' || ctx?.def.assetClass === 'crypto' ? 'broker.tier.retail' : 'broker.tier.pro'),
    shorting, opening, committed: committedOpen, canShort: !!acct.canShort, shortOk, shortCollateral, fee,
    // the largest buy the cash affords: a refused buy says "Max = X" (weakness 2)
    max: side === 'buy' && maxQty > 0 ? roundQ(maxQty) : undefined,
  });
  let invalid: Refusal | null = null;
  if (fundMode) {
    // the mandate and the fund's cash and limits are the world's to refuse (the refusal shows after the send)
    if (!ctx || !acct || !est) invalid = null;
    else if (outside) invalid = { field: 'general', key: 'broker.fund.outside', vars: { name: managed!.name }, cta: 'broker.fund.outside' };
    else if (qtyN > 0 && type === 'limit' && parseDecimal(limit) <= 0) invalid = { field: 'limit', key: 'broker.refuse.limit', cta: 'broker.cta.limit' };
  } else {
    invalid = check?.refusal ?? null;
  }
  const warning = check?.warning ?? null;
  // the engine's refusal of this ticket, shown until the ticket changes; a local refusal is shown first
  const said = engineSaid && engineSaid.sig === signature ? engineSaid.refusal : null;
  const shown: { field: RefusalField; key: string; vars?: Record<string, string | number> } | null =
    invalid?.key ? { field: invalid.field, key: invalid.key, vars: invalid.vars } : said ? { field: said.field, key: said.key, vars: said.vars } : null;
  // refusal copy: the money and the size are formatted with the ticket's own formatters, never as raw floats (weakness 2)
  const fmtVars = (vars: Record<string, string | number> | undefined) => formatRefusalVars(vars, { money, qty: fmtQty });
  const at = (field: RefusalField) => (shown && shown.field === field ? t(shown.key, fmtVars(shown.vars)) : null);

  const canSubmit = !invalid && qtyN > 0;
  const confirming = canSubmit && confirm === signature;
  const verb = side === 'buy'
    ? (held < 0 ? t('broker.verb.cover') : t('broker.verb.buy'))
    : shorting ? t('broker.verb.short') : t('broker.verb.sell');
  const actionLabel = t('broker.action', { verb, qty: qtyN > 0 ? fmtQty(qtyN) : '', ticker: selected }).replace(/\s+/g, ' ').trim();
  // The CTA says why it is disabled (spec 1.4): the refusal's short reason, or "Enter a size".
  const ctaLabel = canSubmit ? actionLabel : invalid?.cta ? t(invalid.cta, fmtVars(invalid.vars)) : tooSmall ? t('broker.cta.tooSmall') : t('broker.cta.size');

  const submit = async () => {
    setConfirm(null);
    setFundRefusal(null);
    if (isUntradable(config, selected)) return; // a delisted or off-book name is refused before anything is sent
    if (fundMode && managed) {
      const fr = await act({
        type: 'fund.trade', fundId: managed.id, assetId: selected, side, qty: qtyN,
        orderType: type === 'limit' ? 'limit' : 'market',
        ...(type === 'limit' ? { limitPrice: parseDecimal(limit) } : {}),
      }, { silent: true });
      if (fr.ok) {
        setQ('');
        useGame.getState().toast({ tone: 'info', text: t('broker.fund.sent', { fund: managed.name, label: actionLabel }) });
      } else {
        setFundRefusal(refusalCopy('funds.refusal', fr.error ?? '', rejectVars(fr.data)));
      }
      return;
    }
    const tpN = tp.trim() === '' ? null : parseDecimal(tp);
    const slN = sl.trim() === '' ? null : parseDecimal(sl);
    const order = {
      assetId: selected, side, type, qty: qtyN, tif,
      ...(type === 'limit' || type === 'stop_limit' ? { limitPrice: parseDecimal(limit) } : {}),
      ...(type === 'stop' || type === 'stop_limit' ? { stopPrice: parseDecimal(stop) } : {}),
      ...(type === 'trailing' ? { trailPct: parseDecimal(trail) / 100 } : {}),
      ...(tpN !== null ? { takeProfit: tpN } : {}),
      ...(slN !== null ? { stopLoss: slN } : {}),
    };
    // a refusal stays on the ticket, under its field (the engine's words are not toasted over the form)
    const r = await act({ type: 'order.place', order }, { silent: true });
    if (r.ok) {
      setQ('');
      setEngineSaid(null);
      // a pending notice: the fill of this asset replaces it, so one order is one toast (UX stage 6)
      useGame.getState().toast({
        tone: 'info', kind: 'pending', ref: selected,
        text: type === 'market' ? t('broker.toast.fillsNext', { label: actionLabel }) : t('broker.toast.working', { label: actionLabel }),
      });
      if (type !== 'market') setSheet(false);
    } else {
      setEngineSaid({ sig: signature, refusal: engineRefusal(r.error ?? 'rejected', side, !!acct?.canShort, { cash: acct?.cash ?? 0, bp }) });
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
        if (!showType) return; // the type picker is hidden on a first trade
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
  const { def, halted } = ctx;
  const d = est!;

  // The cost summary (spec 1.4): the fee at its rate and its minimum, the spread, the round trip and the break-even.
  const feeTable = tradingConfig(world).fees;
  const feeRule = feeTable[def.assetClass] ?? feeTable.stock;
  // R-10-2: a per-share schedule (stocks, ETFs) reads as its own rule; a rate schedule reads as its rate and minimum
  const feeText = feeRule.perUnit !== undefined
    ? t('broker.feeShare', { perShare: dec(feeRule.perUnit, 3), min: money(feeRule.min), max: `${dec((feeRule.max ?? 0) * 100, 0)}%` })
    : t('broker.feeMin', { rate: `${dec(feeRule.rate * 100, 2)}%`, min: money(feeRule.min) });
  // the label keeps to one line; the full rule (max, value) is the row's hover text
  const feeShort = feeRule.perUnit !== undefined ? t('broker.feeShareShort', { perShare: dec(feeRule.perUnit, 3), min: money(feeRule.min) }) : feeText;
  const summary = tradeSummary({
    side, qty: qtyN, price: d.price, mid: ctx.mid, fee, halfSpreadFrac: halfSpread(world, ctx.idx), impactFrac: d.impactBps / 1e4,
    cash: cashNow, bp, margin, shorting, total, notional,
  });
  const cashAfter = summary.cashAfter;
  // a take-profit or stop-loss shows its move on the position, once it is typed (the same rule the chart's lines use)
  const legMove = (v: string) => {
    const n = parseDecimal(v);
    if (v.trim() === '' || !(n > 0) || !(qtyN > 0)) return null;
    return levelMove(side === 'buy' ? qtyN : -qtyN, d.price, n);
  };
  const tpMove = legMove(tp);
  const slMove = legMove(sl);
  const showWarn = warning ? t(warning) : null;

  // the refusal, the confirm line and the Buy button stay pinned under the fields, so they are on screen whatever the fields height
  const footerBody = (
    <>
      {fundRefusal && <RefusalBox copy={fundRefusal} testId="order-fund-refusal" />}
      {halted && <p className="mt-2 text-caption text-warn">{t('broker.haltedNote')}</p>}
      {shown && !['qty', 'limit', 'stop', 'trail', 'tp', 'sl'].includes(shown.field) && <p className="mt-2 text-caption text-warn" data-testid="order-invalid">{at(shown.field)}</p>}
      {confirming && (
        <p className="mt-3 text-small text-fg" role="status" data-testid="order-confirm">{t('broker.confirm', { label: actionLabel, total: money(total) })}</p>
      )}
      {/* a refusal's label may carry two figures: it wraps inside the button rather than being cut at both edges (UX stage 6, weakness 2) */}
      <Button variant="brass" size={dense ? 'md' : 'lg'} className={`w-full ${dense ? 'mt-2 !whitespace-normal py-1 text-center leading-tight' : 'mt-3'}`} disabled={!canSubmit} onClick={submit} testId="order-submit">{ctaLabel}</Button>
      <p className={`${dense ? 'mt-1' : 'mt-2'} text-center text-caption text-fg-faint`} data-testid="honest-note">{t('order.honest')}</p>
      <label className={`${dense ? 'mt-1' : 'mt-2'} flex items-center gap-2 text-caption text-fg-muted`}>
        <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} data-testid="quick-enter" />
        {t('broker.quickEnter', { pct: Math.round(QUICK_ENTER.maxCashFraction * 100) })}
      </label>
    </>
  );
  // a refusal under one field: the message, with the test id the core spec reads
  const under = (field: RefusalField) => {
    const msg = at(field);
    return msg ? <p className="mt-1 text-caption text-warn" data-testid={field === 'qty' ? 'order-invalid' : `order-${field}-refusal`}>{msg}</p> : null;
  };
  return (
    <Card className={dense ? 'flex min-h-0 flex-1 flex-col p-2' : 'p-4'} data-testid="order-pad">
      <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-baseline justify-between">
            <h2 className={dense ? 'font-serif text-body' : 'font-serif text-title'}>{t('broker.trade')}</h2>
            <span className="text-caption text-fg-faint">
              {margin ? t('broker.licenseMargin', { name: lic.name, lev: acct.maxLeverage ?? 1 }) : t('broker.license', { name: lic.name })}
            </span>
          </div>
          <div className={`${dense ? 'mt-0.5' : 'mt-1'} flex items-baseline justify-between text-caption`}>
            <span className="num text-fg-muted">{t('broker.mid', { ticker: selected, price: assetPrice(ctx.def, ctx.mid) })}</span>
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
              {/* Long and Short are the two tabs (spec 1.4): Short is a sell to open, and it is offered from the first trade */}
              {/* Dense (the desktop terminal, the phone sheet): the side tabs and the order type share a row, and the size row holds the unit
                  next to the quantity, so the TP and SL fields and the Good-till row fit a 720 px screen without scrolling (UX 1.4). */}
              <div className={dense ? 'mt-1.5 flex items-center gap-2' : undefined}>
                <Segmented
                  label={t('broker.side')} size={dense ? 'sm' : 'md'} className={dense ? 'min-w-0 flex-1' : 'mt-3 w-full'} value={side} onChange={(v) => setSide(v as Side)}
                  options={[
                    { value: 'buy', label: fundMode ? t('common.buy') : t('broker.side.long'), testId: 'side-buy' },
                    { value: 'sell', label: fundMode ? t('common.sell') : shortScreen ? t('broker.sideTab.short') : t('broker.side.short'), testId: 'side-sell' },
                  ]}
                />
                {showType && (
                  <label className={dense ? 'shrink-0' : 'mt-2 flex flex-col gap-1'}>
                    {!dense && <span className="text-caption text-fg-muted">{t('broker.orderType')}</span>}
                    <select
                      value={type} onChange={(e) => setType(e.target.value as OrderType)} data-testid="order-type"
                      aria-label={t('broker.orderType')}
                      className={`rounded-md border border-ink-3 bg-ink-0 px-2 text-small text-fg outline-none focus:border-brass/60 ${dense ? (shortScreen ? 'h-8 w-28' : 'h-8 w-36') : 'h-9'}`}
                    >
                      {typeOpts.map((o) => <option key={o.value} value={o.value} data-testid={o.testId}>{t(o.key)}</option>)}
                    </select>
                  </label>
                )}
                {shortScreen && (
                  <button
                    type="button" data-testid="order-type-help-tip" title={t(`broker.help.${type}`)} aria-label={t(`broker.help.${type}`)}
                    className="grid h-8 w-7 shrink-0 place-items-center rounded-md border border-ink-3 text-caption text-fg-muted hover:border-brass/50 hover:text-fg"
                  >{HELP_MARK}</button>
                )}
              </div>
              {!shortScreen && <p className={`${dense ? 'mt-0' : 'mt-1.5'} text-caption text-fg-faint`} data-testid="order-type-help">{t(`broker.help.${type}`)}</p>}

              <div className={dense ? 'mt-1 flex items-end gap-2' : undefined}>
                <NumberField
                  className={dense ? 'min-w-0 flex-1' : 'mt-2'} label={t('broker.quantity')} value={q} onChange={setQ}
                  suffix={unit === 'usd' ? '$' : shares ? t('broker.unit.shares') : t('broker.unit.units')} step="any" testId="order-qty"
                />
                <Segmented
                  label={t('broker.unit.label')} size="sm" className={dense ? 'shrink-0' : 'mt-3 w-full'} value={unit} onChange={(v) => setUnit(v as Unit)}
                  options={[
                    { value: 'shares', label: shares ? t('broker.unit.shares') : t('broker.unit.units'), testId: 'unit-shares' },
                    { value: 'usd', label: t('broker.unit.dollars'), testId: 'unit-usd' },
                  ]}
                />
              </div>
              {unit === 'usd' && qtyN > 0 && <p className="mt-1 text-caption text-fg-faint" data-testid="order-usd-shares">{t('broker.approxShares', { qty: fmtQty(qtyN) })}</p>}
              {tooSmall && <p className="mt-1 text-caption text-warn" data-testid="order-too-small">{t('broker.refuse.tooSmall')}</p>}
              {under('qty')}
              <div className={`${dense ? 'mt-0.5' : 'mt-2'} grid grid-cols-4 gap-2`}>
                {[0.1, 0.25, 0.5, 1].map((f) => (
                  <button
                    key={f} type="button"
                    onClick={() => setQ(unit === 'usd' ? String(Math.floor(maxQty * f * d.price * 100) / 100) : String(side === 'sell' && f >= 1 ? maxQty : chipQty(maxQty * f)))}
                    className={`${dense ? 'h-7' : 'h-9'} rounded-md border border-ink-3 text-caption text-fg-muted hover:border-brass/50 hover:text-fg`}
                    data-testid={`chip-${f === 1 ? 'Max' : Math.round(f * 100)}`}
                  >
                    {f === 1 ? (simpleCap && side === 'buy' ? t('broker.maxCap', { pct: firstCapVars.pct }) : t('broker.max')) : t('broker.pct', { p: Math.round(f * 100) })}
                  </button>
                ))}
              </div>
              {simpleCap && (side === 'buy' || shorting) && (shortScreen
                ? <p className="mt-1.5 truncate whitespace-nowrap text-caption text-fg-muted" title={t('broker.firstCap', firstCapVars)} data-testid="first-trade-cap">{t('broker.firstCap.short', { pct: firstCapVars.pct })}</p>
                : <p className="mt-1.5 text-caption text-fg-muted" data-testid="first-trade-cap">{t('broker.firstCap', firstCapVars)}</p>)}

              {/* Dense (the desktop terminal): the price field of the order type shares a row with Good till, so the TP and SL
                  fields and the summary fit a 720 px screen without scrolling (UX 1.4). The full ticket keeps the stacked fields. */}
              {dense && type !== 'market' ? (
                <>
                <div className="mt-2 grid grid-cols-2 items-end gap-2">
                  {(type === 'stop' || type === 'stop_limit') && (
                    <div>
                      <NumberField label={t('order.stop')} value={stop} onChange={setStop} suffix="$" testId="order-stop" />
                    </div>
                  )}
                  {(type === 'limit' || type === 'stop_limit') && (
                    <div>
                      <NumberField label={t('order.limit')} value={limit} onChange={setLimit} suffix="$" testId="order-limit" />
                    </div>
                  )}
                  {type === 'trailing' && (
                    <div>
                      <NumberField label={t('broker.trail')} value={trail} onChange={setTrail} suffix="%" testId="order-trail" />
                    </div>
                  )}
                  {!simple && !fundMode && (
                    // a stop-limit has two prices, so its time in force takes a second line (UX stage 6: the Limit pill no longer runs into it)
                    <Segmented label={t('broker.tif')} size="sm" className={`w-full${type === 'stop_limit' ? ' col-span-2' : ''}`} value={tif} onChange={(v) => setTif(v as 'gtc' | 'day')} options={[{ value: 'gtc', label: t('broker.gtc') }, { value: 'day', label: t('broker.day') }]} />
                  )}
                </div>
                {/* the price refusals sit under the whole price row, so the row stays one line tall (UX stage 6, 1280 x 720) */}
                {under('stop')}
                {under('limit')}
                {under('trail')}
                </>
              ) : (
                <>
                  {(type === 'limit' || type === 'stop_limit') && (
                    <>
                      <NumberField className="mt-2" label={t('order.limit')} value={limit} onChange={setLimit} suffix="$" testId="order-limit" />
                      {under('limit')}
                      {showWarn && !at('limit') && <p className="mt-1 text-caption text-fg-muted" data-testid="order-warn">{showWarn}</p>}
                    </>
                  )}
                  {(type === 'stop' || type === 'stop_limit') && (
                    <>
                      <NumberField className="mt-2" label={t('order.stop')} value={stop} onChange={setStop} suffix="$" testId="order-stop" />
                      {under('stop')}
                    </>
                  )}
                  {type === 'trailing' && (
                    <>
                      <NumberField className="mt-2" label={t('broker.trail')} value={trail} onChange={setTrail} suffix="%" testId="order-trail" />
                      {under('trail')}
                    </>
                  )}
                  {!simple && !fundMode && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Segmented
                        label={t('broker.tif')} size="sm" value={tif} onChange={(v) => setTif(v as 'gtc' | 'day')}
                        options={[{ value: 'gtc', label: t('broker.gtc') }, { value: 'day', label: t('broker.day') }]}
                      />
                    </div>
                  )}
                </>
              )}
              {!fundMode && (
                <div className={dense ? "mt-1 grid grid-cols-2 gap-2" : "mt-2 grid grid-cols-2 gap-2"}>
                  <div>
                    <NumberField label={t('broker.takeProfit')} value={tp} onChange={setTp} testId="order-tp" />
                    {tpMove && <p className="mt-1 text-caption text-gain" data-testid="order-tp-move">{t('broker.bracket.move', { usd: signedMoney(tpMove.usd), pct: signedPct(tpMove.pct) })}</p>}
                    {under('tp')}
                  </div>
                  <div>
                    <NumberField label={t('broker.stopLoss')} value={sl} onChange={setSl} testId="order-sl" />
                    {slMove && <p className="mt-1 text-caption text-loss" data-testid="order-sl-move">{t('broker.bracket.move', { usd: signedMoney(slMove.usd), pct: signedPct(slMove.pct) })}</p>}
                    {under('sl')}
                  </div>
                </div>
              )}

              <div className={dense ? 'mt-1 border-t border-ink-2 pt-0.5' : 'mt-4 border-t border-ink-2 pt-3'} data-testid="order-summary">
                {/* the dense ticket on a tall screen runs the summary as one column (the empty space above the Buy/Sell button holds it);
                    on a short screen it keeps two columns, so the whole block fits 1280 x 720 without a scroll */}
                <div className={dense ? (tall ? 'flex flex-col' : 'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-x-3') : undefined}>
                {/* On a short screen the two columns take short labels, so no label is cut; the full wording is the label's title (hover). */}
                <SumRow
                  dense={dense}
                  full={side === 'buy' ? t('broker.askEst') : t('broker.bidEst')}
                  k={shortLabels ? (side === 'buy' ? t('broker.sum.buyPrice') : t('broker.sum.sellPrice')) : (side === 'buy' ? t('broker.askEst') : t('broker.bidEst'))}
                  v={assetPrice(ctx.def, d.price)}
                />
                <SumRow dense={dense} full={t('broker.notional')} k={shortLabels ? t('broker.sum.notional') : t('broker.notional')} v={money(notional)} />
                <SumRow dense={dense} full={feeText} k={shortLabels ? t('broker.sum.fee') : feeShort} v={money(fee)} />
                {/* R-10-1: the spread the order pays (its half spread at the quote) and the quoted full spread in percent share one line;
                    the order's own impact is a separate line (a dash when under half a cent); other accounts' flow is in neither */}
                <SumRow
                  dense={dense} full={t('broker.spreadCost')} k={shortLabels ? t('broker.sum.spreadCost') : t('broker.spreadCost')}
                  v={<span><span data-testid="order-spread-cost">{money(summary.spreadCost)}</span> <span className="text-fg-faint" data-testid="order-spread">({dec(summary.spreadPct * 100, 2)}{pctUnit()})</span></span>}
                />
                <SumRow
                  dense={dense} full={t('broker.impactCost')} k={shortLabels ? t('broker.sum.impactCost') : t('broker.impactCost')}
                  v={<span data-testid="order-impact-cost">{summary.impactCost < 0.005 ? '—' : money(summary.impactCost)}</span>}
                />
                <SumRow dense={dense} k={<span className="font-semibold text-fg">{t('broker.total')}</span>} v={<span className="font-semibold" data-testid="order-total">{money(total)}</span>} />
                <SumRow dense={dense} full={t('broker.roundTrip')} k={shortLabels ? t('broker.sum.roundTrip') : t('broker.roundTrip')} v={<span data-testid="order-roundtrip">{money(summary.roundTrip)}</span>} />
                <SumRow dense={dense} full={t('broker.breakEven')} k={shortLabels ? t('broker.sum.breakEven') : t('broker.breakEven')} v={<span data-testid="order-breakeven">{assetPrice(ctx.def, summary.breakEven)}</span>} />
                <SumRow
                  dense={dense} full={t('broker.cashAfter')} k={shortLabels ? t('broker.sum.cashAfter') : t('broker.cashAfter')}
                  v={<span className="text-fg-muted" data-testid="order-cash-after">{cashAfter < -0.005 ? '—' : money(cashAfter)}</span>}
                />
                <SumRow
                  dense={dense} className={dense && !tall ? 'col-span-2' : ''} full={t('broker.bpAfter')} k={shortLabels ? t('broker.sum.bpAfter') : t('broker.bpAfter')}
                  v={<span className="text-fg-muted" data-testid="order-bp-after">{money(summary.bpAfter)}</span>}
                />
                {type === 'market' && <p className={`col-span-2 text-caption text-fg-faint ${dense ? 'mt-1' : 'mt-2'}`} data-testid="order-fills-tick">{t('broker.fillsNextTick')}</p>}
                </div>
                {shorting && (
                  <div className={dense ? 'mt-0.5 grid grid-cols-2 gap-x-3' : 'mt-1 grid gap-1'} data-testid="order-short-terms">
                    <KV className="!py-0" k={t('broker.collateral')} v={<span className="text-fg-muted" data-testid="order-collateral">{money(shortCollateral)}</span>} />
                    <KV className="!py-0" k={t('broker.borrowFee')} v={<span className="text-fg-muted" data-testid="order-borrow-fee">{t('broker.borrowFee.rate', { rate: dec(borrowRate * 100, 2) })}</span>} />
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
