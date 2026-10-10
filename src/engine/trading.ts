/**
 * Order execution and portfolio math (01 §7).
 *
 * Orders and accounts live inside WorldState, so a save is still plain JSON and a replay of
 * (seed, placed orders) is deterministic. Orders queue on placement and clear inside the next
 * step(), against NPC liquidity: mid ± half spread ± square-root impact.
 *
 * Cash accounts (the default) are long only and can never spend more than their cash. Margin
 * accounts (maxLeverage > 1 or canShort, granted by licenses in the world layer) can short and
 * borrow up to maxLeverage × equity of gross exposure; they get a margin call below the
 * maintenance ratio and are liquidated, largest position first, below the liquidation ratio.
 *
 * Order types: market, limit, stop, stop-limit, trailing stop; any entry can carry a bracket
 * (take-profit + stop-loss) whose legs cancel each other. Options trade immediately at the quoted
 * bid/ask (see options.ts) and settle in cash at expiry.
 */
import { DEFAULT_TRADING } from './config';
import { ecologyWeight, PUBLIC_MAX_TRADER_SHARE, PUBLIC_MIN_TRADERS } from './ecology';
import { optionQuote, optionsValue, parseContract, underlyingDelisted } from './options';
import {
  closingWarning, companyRulesOf, gateOn, lockedQty, programFill, programRelease, restrictionsOf, sessionDay, sessionDayAt, windowOn,
  type Gate, type TradingRestrictions,
} from './restrictions';
import { dayOfTick } from './catalysts';
import type {
  Account, AssetDef, CrowdHold, DayTraded, Fill, FillEstimate, MarginConfig, Order, OrderRequest, PortfolioView, PositionView,
  Side, SqueezeConfig, StepEvent, TickTraded, TradingConfig, WorldConfig, WorldState,
} from './types';

const EPS = 1e-9;

export const DEFAULT_MARGIN: MarginConfig = {
  maintenance: 0.3,
  liquidation: 0.2,
  loanSpread: 0.03,
  cashInterestShare: 0.5,
  borrowFee: { stock: 0.01, crypto: 0.05, commodity: 0.02, forex: 0.005, bond: 0.005, realestate: 0.05 },
  fallbackRate: 0.03,
};

export function tradingConfig(state: WorldState): TradingConfig {
  return state.config.trading ?? DEFAULT_TRADING;
}

export function marginConfig(state: WorldState): MarginConfig {
  return state.config.margin ?? DEFAULT_MARGIN;
}

/** Squeeze threshold: a day's forced short covering of this share of ADV (or more) is a squeeze. */
export const DEFAULT_SQUEEZE: SqueezeConfig = { adv: 0.2 };

/** Resolved squeeze config, or null when squeezes are off (no tally, no event, no headline). */
export function squeezeConfig(cfg: WorldConfig): SqueezeConfig | null {
  return cfg.squeeze ? { adv: cfg.squeeze.adv ?? DEFAULT_SQUEEZE.adv } : null;
}

/** id → config index, cached per asset list */
const indexCache = new WeakMap<object, Map<string, number>>();
export function assetIndex(state: WorldState, assetId: string): number {
  let m = indexCache.get(state.config.assets);
  if (!m) {
    m = new Map(state.config.assets.map((a, i) => [a.id, i]));
    indexCache.set(state.config.assets, m);
  }
  return m.get(assetId) ?? -1;
}

function mid(state: WorldState, i: number): number {
  return Math.exp(state.assets[i]!.lnP);
}

/** current vol relative to calm: regime multiplier × GARCH */
function volScale(state: WorldState, i: number): number {
  return state.config.regimes[state.regime].volMult * Math.sqrt(state.assets[i]!.h);
}

/** half spread as a fraction of mid; widens with current volatility (01 §7.2) */
export function halfSpread(state: WorldState, i: number): number {
  const def = state.config.assets[i]!;
  return ((def.spreadBps ?? 10) / 2 / 1e4) * volScale(state, i);
}

/** temporary impact as a fraction of mid: Y · σ_daily · √(notional / ADV) (01 §7.3) */
export function impact(state: WorldState, i: number, notional: number): number {
  const def = state.config.assets[i]!;
  const t = tradingConfig(state);
  const sigmaDaily = (def.vol * volScale(state, i)) / Math.sqrt(state.config.daysPerYear);
  return t.impactY * sigmaDaily * Math.sqrt(Math.max(0, notional) / (def.advNotional ?? 1e9));
}

function sign(side: Side): 1 | -1 {
  return side === 'buy' ? 1 : -1;
}

/**
 * A fill at mid p with half spread plus impact `c` (fractions of mid). A sale never pays below 0 (F7): at a size where
 * the impact passes 1 the sell price floors at 0, not a negative price. Buys are unfloored.
 */
function fillPrice(p: number, side: Side, c: number): number {
  return side === 'sell' ? Math.max(0, p * (1 - c)) : p * (1 + c);
}

function execPrice(state: WorldState, i: number, side: Side, qty: number): { price: number; imp: number } {
  const p = mid(state, i);
  const imp = impact(state, i, qty * p);
  return { price: fillPrice(p, side, halfSpread(state, i) + imp), imp };
}

// ---------------------------------------------------------------- shared impact tallies (engine-staging, Ledger 2026-10-09)

/**
 * Permanent price move of a fill, in log price. The notional ALL accounts already traded today on this asset
 * and side (AssetState.dayTraded) is `before`; the fill adds `notional`. The move is sign · log1p(f(before + notional) − f(before))
 * with f(n) = permanentImpactShare · impact(n), so a day's clips (or alts) add up to what one order of the same total would do.
 */
export function permanentMove(state: WorldState, i: number, side: Side, before: number, notional: number): number {
  const share = tradingConfig(state).permanentImpactShare;
  const f = (n: number) => share * impact(state, i, n);
  return sign(side) * Math.log1p(f(before + notional) - f(before));
}

/** The asset's shared tally for game day `today`: absent or stamped with another day = nothing traded yet. */
export function tallyToday(t: DayTraded | undefined, today: number): DayTraded {
  return t && t.day === today ? t : { day: today, buy: 0, sell: 0 };
}

/** The asset's shared tally for this tick: absent or stamped with another tick = nothing filled yet, at the current mid. */
export function tallyTick(t: TickTraded | undefined, tick: number, lnP: number): TickTraded {
  return t && t.tick === tick ? t : { tick, lnMid: lnP, buy: 0, sell: 0 };
}

/**
 * Temporary impact per unit of a fill of `x` notional when `before` notional was already filled this tick on this
 * asset and side, across all accounts: (C(before + x) − C(before)) / x with C(n) = n · impact(n). Splitting a tick's
 * total into any number of fills adds up to C(total). With nothing before it is exactly impact(x).
 */
export function marginalImpact(state: WorldState, i: number, before: number, x: number): number {
  if (!(before > 0)) return impact(state, i, x);
  if (!(x > 0)) return impact(state, i, before);
  return ((before + x) * impact(state, i, before + x) - before * impact(state, i, before)) / x;
}

/** game day (0-based) a tick's fills belong to */
export function tallyDay(state: WorldState): number {
  return Math.floor((state.tick - 1) / state.config.ticksPerDay);
}

/** Print a fill on the tape: volume, the shared day tally and its permanent move. Mutates `assets` at i. */
function printFill(state: WorldState, assets: WorldState['assets'], i: number, side: Side, q: number, price: number, atMid?: number): void {
  const a = assets[i]!;
  const traded = tallyToday(a.dayTraded, tallyDay(state));
  const notional = q * price;
  const move = permanentMove(state, i, side, traded[side], notional);
  const next = {
    ...a,
    dayTraded: { ...traded, [side]: traded[side] + notional },
    lnP: a.lnP + move,
    volume: (a.volume ?? 0) + q,
    notional: (a.notional ?? 0) + notional,
    dayVolume: (a.dayVolume ?? 0) + q,
    dayNotional: (a.dayNotional ?? 0) + notional,
    cumVolume: (a.cumVolume ?? 0) + q,
  };
  if (atMid !== undefined) {
    const tt = tallyTick(a.tickTraded, state.tick, a.lnP);
    next.tickTraded = { ...tt, [side]: tt[side] + atMid };
  }
  assets[i] = next;
}

// ---------------------------------------------------------------- liquidation marks (engine-staging crowd exit + C5 guard)

/** Every account's long and short units per asset. Pure; O(positions). */
export function crowdHoldings(state: WorldState): Record<string, CrowdHold> {
  const crowd: Record<string, CrowdHold> = {};
  for (const acct of Object.values(state.accounts)) {
    for (const [assetId, pos] of Object.entries(acct.positions)) {
      const c = crowd[assetId] ?? (crowd[assetId] = { long: 0, short: 0 });
      if (pos.qty > 0) c.long += pos.qty;
      else c.short -= pos.qty;
    }
  }
  return crowd;
}

/**
 * Public aggregate short interest per stock: units held short across all accounts, as a share of shares outstanding.
 * 0 when nobody is short; null (withheld) when the shorts are concentrated (fewer than 5 holders, or one holder above
 * 40% of the total), because a lone short position would otherwise be read straight out of the total. No account is
 * named, and the published set is by asset only.
 */
export function publicShortInterest(state: WorldState): Record<string, number | null> {
  const per: Record<string, { total: number; holders: number; max: number }> = {};
  for (const acct of Object.values(state.accounts)) {
    for (const [assetId, pos] of Object.entries(acct.positions)) {
      if (pos.qty >= 0) continue;
      const s = -pos.qty;
      const c = per[assetId] ?? (per[assetId] = { total: 0, holders: 0, max: 0 });
      c.total += s;
      c.holders++;
      if (s > c.max) c.max = s;
    }
  }
  const out: Record<string, number | null> = {};
  for (const def of state.config.assets) {
    if (def.assetClass !== 'stock' || !def.sharesOutstanding) continue;
    const c = per[def.id];
    if (!c) { out[def.id] = 0; continue; }
    const spread = c.holders >= PUBLIC_MIN_TRADERS && c.max <= PUBLIC_MAX_TRADER_SHARE * c.total;
    out[def.id] = spread ? Math.round((c.total / def.sharesOutstanding) * 1e4) / 1e4 : null;
  }
  return out;
}

/**
 * A forced buy-in of shorts (squeeze on): add the covering to the asset's tally for the day. The first time the day's
 * covering reaches squeeze.adv × ADV, one 'squeeze' event names the asset (never an account). Mutates s.assets[i].
 */
function recordCover(s: WorldState, i: number, notional: number, tick: number, sq: SqueezeConfig, events: StepEvent[]): void {
  const day = tallyDay(s);
  const a = s.assets[i]!;
  const t = a.coverTally && a.coverTally.day === day ? a.coverTally : { day, notional: 0, fired: false };
  const adv = s.config.assets[i]!.advNotional ?? 1e9;
  const total = t.notional + notional;
  const fire = !t.fired && total >= sq.adv * adv;
  s.assets[i] = { ...a, coverTally: { day, notional: total, fired: t.fired || fire } };
  if (fire) events.push({ type: 'squeeze', tick, assetId: s.config.assets[i]!.id, cover: total / adv });
}

/** Mark price of asset i for a long (dir 1) or short (dir −1) position: mid, held at the guard's anchor during a pump or dump. */
export function guardedMark(state: WorldState, i: number, dir: 1 | -1): number {
  const m = mid(state, i);
  const g = state.assets[i]!.markGuard;
  if (!g || g.dir !== dir || tallyDay(state) > g.untilDay) return m;
  const anchor = Math.exp(g.lnAnchor);
  return dir === 1 ? Math.min(m, anchor) : Math.max(m, anchor);
}

/** True when the ecology sets every close (full mode): peak, rank and licence marks then read the closing auction. */
export function markCapOn(state: WorldState): boolean {
  return ecologyWeight(state.config) === 1;
}

const FLOW_DAYS = 5;

/**
 * Rule C5 (Quant's alt-peak recommendation, Ledger's bar: honest p95 haircut ≤ 3%, slow 5-day pump closed).
 * 1-day rule: today's net crowd flow (shared day tally) beyond thr × ADV: anchor = today's open (the previous close).
 * Rolling rule: the last 5 days' net flow beyond K × ADV: anchor = the open of the window's first day.
 * Either keeps the guard live through tomorrow. An episode keeps its anchor unless an earlier window fires; a flip
 * in direction starts a new episode. Mutates s.assets (the caller owns the copy).
 */
function updateMarkGuards(s: WorldState): void {
  const mg = s.config.markGuard;
  if (!mg) return;
  const day = tallyDay(s);
  for (let i = 0; i < s.assets.length; i++) {
    let a = s.assets[i]!;
    const t = a.dayTraded;
    const adv = s.config.assets[i]!.advNotional ?? 1e9;
    const todayNet = t && t.day === day ? (t.buy - t.sell) / adv : 0;
    let sum = 0;
    let winOpen = a.lnOpen;
    const f = a.markFlow;
    if (f || todayNet !== 0) {
      let net: number[], lnOpen: number[];
      if (!f) {
        net = new Array<number>(FLOW_DAYS).fill(0); lnOpen = new Array<number>(FLOW_DAYS).fill(a.lnOpen);
      } else if (f.day !== day) {
        const k = Math.min(FLOW_DAYS, day - f.day);
        net = [...f.net.slice(k), ...new Array<number>(k).fill(0)];
        lnOpen = [...f.lnOpen.slice(k), ...new Array<number>(k).fill(a.lnOpen)];
      } else { net = f.net; lnOpen = f.lnOpen; }
      if (!f || f.day !== day || net[FLOW_DAYS - 1] !== todayNet || lnOpen[FLOW_DAYS - 1] !== a.lnOpen) {
        if (net === f?.net) { net = net.slice(); lnOpen = lnOpen.slice(); }
        net[FLOW_DAYS - 1] = todayNet; lnOpen[FLOW_DAYS - 1] = a.lnOpen;
        if (net.every((x) => x === 0)) { const { markFlow: _drop, ...rest } = a; void _drop; a = rest; }
        else a = { ...a, markFlow: { day, net, lnOpen } };
        s.assets[i] = a;
      }
      const m = a.markFlow;
      if (m) { for (const x of m.net) sum += x; winOpen = m.lnOpen[0]!; }
    }
    const dir: 0 | 1 | -1 = todayNet > mg.thr || sum > mg.K ? 1 : todayNet < -mg.thr || sum < -mg.K ? -1 : 0;
    if (dir === 0) continue;
    const roll = dir * sum > mg.K;
    const cDay = roll ? day - (FLOW_DAYS - 1) : day;
    const cAnchor = roll ? winOpen : a.lnOpen;
    const g = a.markGuard;
    const keep = g !== undefined && day <= g.untilDay && g.dir === dir && g.anchorDay <= cDay;
    const next = keep ? { ...g, untilDay: day + 1 } : { lnAnchor: cAnchor, anchorDay: cDay, untilDay: day + 1, dir };
    if (g && g.lnAnchor === next.lnAnchor && g.anchorDay === next.anchorDay && g.untilDay === next.untilDay && g.dir === next.dir) continue;
    s.assets[i] = { ...a, markGuard: next };
  }
}

/**
 * Cash + each position's pro-rata share of a CROWD exit: every same-side holding in that asset (all accounts) closed
 * together at the (guarded) mid, paying half spread and square-root impact on the crowd's whole quantity, then the
 * account's own fee. Every holder of an asset gets the same exit price per unit, so holdings split across alts mark
 * no higher than one account holding the total, and an alt's buy adds its full quantity to the exit. With one holder
 * this is exactly estimateFill on the whole position. Options at their mark.
 */
function liquidationOf(state: WorldState, acct: Account, crowd: Record<string, CrowdHold> = state.crowd ?? crowdHoldings(state)): number {
  let eq = acct.cash;
  for (const [assetId, pos] of Object.entries(acct.positions)) {
    const i = assetIndex(state, assetId);
    if (i < 0 || pos.qty === 0) continue;
    const def = state.config.assets[i]!;
    const long = pos.qty > 0;
    const c = crowd[assetId];
    const q = Math.max(Math.abs(pos.qty), (long ? c?.long : c?.short) ?? 0);
    const p = guardedMark(state, i, long ? 1 : -1);
    const cost = halfSpread(state, i) + impact(state, i, q * p);
    // F7 (Phase 1 huge money): selling shares never pays negative money. A long's exit price floors at 0, so at a size
    // where the impact term passes 1 the proceeds are 0, not a negative sum. A short keeps its cover cost, which is what it is.
    const price = long ? Math.max(0, p * (1 - cost)) : p * (1 + cost);
    eq += pos.qty * price - commission(state, def, Math.abs(pos.qty) * price);
  }
  if (acct.options) eq += optionsValue(state, acct.options);
  return eq;
}

/**
 * Liquidation value of an account (see liquidationOf). This is the net worth used for peak equity, drawdown, rank
 * and licences, so neither your own buys nor an alt's can lift your peak. Displayed P&L stays mark-to-market.
 */
export function liquidationEquity(state: WorldState, playerId: string): number {
  const acct = state.accounts[playerId];
  if (!acct) throw new Error(`no account ${playerId}`);
  return liquidationOf(state, acct);
}

export function commission(state: WorldState, def: AssetDef, notional: number): number {
  if (notional <= 0) return 0;
  const fees = tradingConfig(state).fees;
  const f = fees[def.assetClass] ?? fees.stock;
  return Math.max(f.min, f.rate * notional);
}

function qtyStep(def: AssetDef): number {
  return def.qtyStep ?? (def.assetClass === 'stock' ? 1 : 0);
}

function roundQty(def: AssetDef, q: number): number {
  return qtyStep(def) === 1 ? Math.floor(q + EPS) : q;
}

export function isMarginAccount(acct: Account): boolean {
  return (acct.maxLeverage ?? 1) > 1 || !!acct.canShort;
}

// ---------------------------------------------------------------- accounts

export function openAccount(state: WorldState, playerId: string, cash = tradingConfig(state).startingCash): WorldState {
  if (state.accounts[playerId]) throw new Error(`account ${playerId} already exists`);
  if (!(cash >= 0)) throw new Error('starting cash must be >= 0');
  const acct: Account = {
    playerId, cash, startingCash: cash, positions: {}, realizedPnl: 0, feesPaid: 0,
    peakEquity: cash, maxDrawdown: 0, dayStartEquity: cash,
  };
  return { ...state, accounts: { ...state.accounts, [playerId]: acct } };
}

/** Change an account's trading permissions (licenses). Pure. */
export function setAccountPermissions(
  state: WorldState, playerId: string, perms: { maxLeverage?: number; canShort?: boolean; canOptions?: boolean },
): WorldState {
  const a = state.accounts[playerId];
  if (!a) throw new Error(`no account ${playerId}`);
  return { ...state, accounts: { ...state.accounts, [playerId]: { ...a, ...perms } } };
}

/**
 * Move cash in or out of an account (business income, purchases, fines). Pure. Non-trading
 * flows also move startingCash-free bookkeeping: they are not trading P&L, so `startingCash`
 * (the trading baseline) shifts with them and trading P&L stays honest.
 */
export function adjustCash(state: WorldState, playerId: string, delta: number): WorldState {
  const a = state.accounts[playerId];
  if (!a) throw new Error(`no account ${playerId}`);
  return {
    ...state,
    accounts: {
      ...state.accounts,
      [playerId]: {
        ...a, cash: a.cash + delta, startingCash: a.startingCash + delta,
        peakEquity: Math.max(0, a.peakEquity + delta), dayStartEquity: a.dayStartEquity + delta,
      },
    },
  };
}

export function grossExposure(state: WorldState, acct: Account): number {
  let g = 0;
  for (const [assetId, pos] of Object.entries(acct.positions)) {
    const i = assetIndex(state, assetId);
    if (i >= 0) g += Math.abs(pos.qty) * mid(state, i);
  }
  return g;
}

export function equityOf(state: WorldState, acct: Account): number {
  let eq = acct.cash;
  for (const [assetId, pos] of Object.entries(acct.positions)) {
    const i = assetIndex(state, assetId);
    if (i >= 0) eq += pos.qty * mid(state, i);
  }
  if (acct.options) eq += optionsValue(state, acct.options);
  return eq;
}

/** Shares of one asset an account has locked on a day (plan escrow and price holds). Zero with no restrictions. */
function lockedIn(state: WorldState, playerId: string, assetId: string, day: number): number {
  return state.restrictions ? lockedQty(restrictionsOf(state), playerId, assetId, day) : 0;
}

/**
 * Equity that counts as margin collateral. Locked shares (plan escrow and price holds, v1.4) add nothing: they cannot be
 * pledged, and a margin call or liquidation cannot sell them. A long contributes only its unlocked shares. With no
 * restrictions this is equityOf exactly.
 */
export function collateralEquityOf(state: WorldState, acct: Account, day: number): number {
  const eq = equityOf(state, acct);
  if (!state.restrictions) return eq;
  let locked = 0;
  for (const [assetId, pos] of Object.entries(acct.positions)) {
    if (pos.qty <= 0) continue;
    const q = Math.min(lockedIn(state, acct.playerId, assetId, day), pos.qty);
    const i = assetIndex(state, assetId);
    if (q > 0 && i >= 0) locked += q * mid(state, i);
  }
  return eq - locked;
}

/**
 * The mid price at which the engine's margin rule (equity below the liquidation ratio of gross exposure, marked on mid,
 * marginConfig) would liquidate this account on one asset, every other holding held at its mark. The same arithmetic as the
 * trigger in clearOrders: equity(x) = eqOther + qty * x, gross(x) = |qty| * x + grossOther, and the line is where
 * equity(x) = liquidation * gross(x). Null when there is no position, or no positive price triggers it (a long that
 * cannot reach the ratio at any price, for instance).
 */
export function liquidationPrice(state: WorldState, playerId: string, assetId: string): number | null {
  const acct = state.accounts[playerId];
  const i = assetIndex(state, assetId);
  const pos = acct?.positions[assetId];
  if (!acct || !pos || i < 0 || pos.qty === 0) return null;
  // only margin accounts are liquidated (clearOrders); a cash account has no line even with a negative balance
  if (!isMarginAccount(acct)) return null;
  const L = marginConfig(state).liquidation;
  const here = mid(state, i);
  // locked shares add no collateral (collateralEquityOf), so a long's collateral slope is its unlocked part
  const lockedHere = pos.qty > 0 ? Math.min(lockedIn(state, playerId, assetId, sessionDay(state)), pos.qty) : 0;
  const eqOther = collateralEquityOf(state, acct, sessionDay(state)) - (pos.qty - lockedHere) * here;
  const grossOther = grossExposure(state, acct) - Math.abs(pos.qty) * here;
  // x* solves eqOther + (qty - locked)*x = L * (|qty|*x + grossOther); a long's slope is (1 - L)|qty| - locked, a short's -(1 + L)|qty|
  const slope = pos.qty > 0 ? (1 - L) * Math.abs(pos.qty) - lockedHere : -(1 + L) * Math.abs(pos.qty);
  const x = (L * grossOther - eqOther) / slope;
  return Number.isFinite(x) && x > 0 ? x : null;
}

// ---------------------------------------------------------------- orders

/** Live preview for the trade ticket: what this order would cost if it filled at the current price. */
export function estimateFill(state: WorldState, req: Pick<OrderRequest, 'assetId' | 'side' | 'qty' | 'limitPrice'>): FillEstimate {
  const i = assetIndex(state, req.assetId);
  if (i < 0) throw new Error(`unknown asset ${req.assetId}`);
  const def = state.config.assets[i]!;
  const p = mid(state, i);
  const qty = Math.max(0, req.qty);
  const price = execPrice(state, i, req.side, qty).price;
  const fee = commission(state, def, qty * price);
  return {
    price,
    fee,
    slippageBps: Math.abs(price / p - 1) * 1e4,
    total: req.side === 'buy' ? qty * price + fee : qty * price - fee,
  };
}

/** worst-case price used to reserve cash for an open order */
function reservePrice(state: WorldState, i: number, o: OrderRequest, remaining: number): number {
  if ((o.type === 'limit' || o.type === 'stop_limit') && o.limitPrice) return o.limitPrice;
  const est = execPrice(state, i, o.side, remaining).price;
  if (o.type === 'stop' && o.stopPrice) {
    return o.side === 'buy' ? Math.max(est, o.stopPrice * (est / mid(state, i))) : est;
  }
  return est;
}

function reservedCash(state: WorldState, playerId: string): number {
  let r = 0;
  for (const o of state.orders) {
    if (o.status !== 'open' || o.playerId !== playerId || o.side !== 'buy' || o.reduceOnly) continue;
    const i = assetIndex(state, o.assetId);
    const remaining = o.qty - o.filledQty;
    const px = reservePrice(state, i, o, remaining);
    r += remaining * px + commission(state, state.config.assets[i]!, remaining * px);
  }
  return r;
}

/** Gross notional that open non-reducing orders would add (margin accounts). */
function reservedExposure(state: WorldState, playerId: string): number {
  let r = 0;
  for (const o of state.orders) {
    if (o.status !== 'open' || o.playerId !== playerId || o.reduceOnly) continue;
    const i = assetIndex(state, o.assetId);
    r += (o.qty - o.filledQty) * reservePrice(state, i, o, o.qty - o.filledQty);
  }
  return r;
}

function reservedQty(state: WorldState, playerId: string, assetId: string): number {
  let r = 0;
  // a program's open sell is already counted in its escrow (locked shares), so it is not reserved twice
  for (const o of state.orders) {
    if (o.status === 'open' && o.playerId === playerId && o.assetId === assetId && o.side === 'sell' && !o.reduceOnly && o.program === undefined) r += o.qty - o.filledQty;
  }
  return r;
}

/**
 * What the player can still commit. Cash accounts: cash not reserved by open buys.
 * Margin accounts: maxLeverage × equity − gross exposure − exposure reserved by open orders.
 */
export function buyingPower(state: WorldState, playerId: string): number {
  const acct = state.accounts[playerId];
  if (!acct) return 0;
  if (!isMarginAccount(acct)) return Math.max(0, acct.cash - reservedCash(state, playerId));
  const eq = collateralEquityOf(state, acct, sessionDay(state));
  return Math.max(0, eq * (acct.maxLeverage ?? 1) - grossExposure(state, acct) - reservedExposure(state, playerId));
}

const TYPES = ['market', 'limit', 'stop', 'stop_limit', 'trailing'];

function validate(state: WorldState, req: OrderRequest): string | null {
  const acct = state.accounts[req.playerId];
  if (!acct) return 'no account';
  const i = assetIndex(state, req.assetId);
  if (i < 0) return 'unknown asset';
  const def = state.config.assets[i]!;
  if (def.listed === false) return 'not tradable';
  if (req.side !== 'buy' && req.side !== 'sell') return 'bad side';
  if (!TYPES.includes(req.type)) return 'bad order type';
  if (!Number.isFinite(req.qty) || req.qty <= 0) return 'qty must be > 0';
  // X3 (Tape, hunts v1): above 2^53 a unit count is not exact (a share count rounds, a fraction is lost), so an order
  // that large is refused whatever the cash. Huge balances size down to this cap, they do not get a silent rounding.
  if (req.qty > Number.MAX_SAFE_INTEGER) return 'quantity above 2^53 units';
  if (qtyStep(def) === 1 && !Number.isInteger(req.qty)) return 'whole units only';
  if ((req.type === 'limit' || req.type === 'stop_limit') && !(req.limitPrice !== undefined && req.limitPrice > 0)) return 'limit price required';
  if ((req.type === 'stop' || req.type === 'stop_limit') && !(req.stopPrice !== undefined && req.stopPrice > 0)) return 'stop price required';
  if (req.type === 'trailing' && !(req.trailPct !== undefined && req.trailPct > 0 && req.trailPct < 0.5)) return 'trail between 0% and 50%';
  if (req.takeProfit !== undefined && !(req.takeProfit > 0)) return 'bad take-profit';
  if (req.stopLoss !== undefined && !(req.stopLoss > 0)) return 'bad stop-loss';
  if (req.takeProfit !== undefined && req.stopLoss !== undefined) {
    const ok = req.side === 'buy' ? req.takeProfit > req.stopLoss : req.takeProfit < req.stopLoss;
    if (!ok) return 'take-profit must be on the profit side of the stop-loss';
  }
  const held = acct.positions[req.assetId]?.qty ?? 0;
  // company programs (restrictions.ts): a plan sells only out of its own escrow and can never buy; other sells may use
  // only the shares not locked by a plan
  const r = restrictionsOf(state);
  const prog = req.program !== undefined ? r.programs[req.program] : undefined;
  if (req.program !== undefined) {
    if (!prog || prog.assetId !== req.assetId || prog.playerId !== req.playerId) return 'unknown program';
    if (prog.kind === 'plan') {
      if (req.side !== 'sell') return 'planSellOnly';
      return req.qty > prog.escrow + EPS ? 'insufficient position' : null;
    }
  }
  const locked = state.restrictions ? lockedQty(r, req.playerId, req.assetId, sessionDay(state)) : 0;
  if (req.reduceOnly) {
    if (held === 0 || Math.sign(held) === sign(req.side)) return 'nothing to reduce';
    if (req.qty > Math.abs(held) + EPS) return 'more than the position';
    if (req.side === 'sell' && held > 0 && req.qty > Math.max(0, held - locked) + EPS) return 'insufficient position';
    return null;
  }

  if (!isMarginAccount(acct)) {
    if (req.side === 'buy') {
      const px = reservePrice(state, i, req, req.qty);
      const need = req.qty * px + commission(state, def, req.qty * px);
      if (need > acct.cash - reservedCash(state, req.playerId) + EPS) return 'insufficient cash';
    } else if (req.qty > held - reservedQty(state, req.playerId, req.assetId) - locked + EPS) {
      // locked shares are the stacking rule's limit (position plus same-side open orders may not exceed what is free)
      return locked > 0 ? 'stacking' : 'insufficient position';
    }
    return null;
  }

  // margin account
  if (req.side === 'sell' && !acct.canShort && req.qty > held - reservedQty(state, req.playerId, req.assetId) - locked + EPS) {
    return locked > 0 ? 'stacking' : 'insufficient position';
  }
  const px = reservePrice(state, i, req, req.qty) || mid(state, i);
  const after = held + sign(req.side) * req.qty;
  const addExposure = Math.max(0, Math.abs(after) - Math.abs(held)) * px;
  if (addExposure > buyingPower(state, req.playerId) + EPS) return 'insufficient buying power';
  return null;
}

/** The window or lockup refusal for a placement, if any (restrictions.ts). Absent restrictions = no refusal. */
function placementGate(state: WorldState, req: OrderRequest): Gate | null {
  if (!state.restrictions) return null;
  const r = restrictionsOf(state);
  const kind = req.program !== undefined ? r.programs[req.program]?.kind : undefined;
  return gateOn(r, sessionDay(state), req.playerId, req.assetId, req.side, kind);
}

function newOrder(state: WorldState, seq: number, req: OrderRequest, reason: string | null, extra: Partial<Order> = {}): Order {
  return {
    playerId: req.playerId, assetId: req.assetId, side: req.side, type: req.type, qty: req.qty,
    ...(req.limitPrice !== undefined ? { limitPrice: req.limitPrice } : {}),
    ...(req.stopPrice !== undefined ? { stopPrice: req.stopPrice } : {}),
    ...(req.trailPct !== undefined ? { trailPct: req.trailPct } : {}),
    ...(req.takeProfit !== undefined ? { takeProfit: req.takeProfit } : {}),
    ...(req.stopLoss !== undefined ? { stopLoss: req.stopLoss } : {}),
    ...(req.reduceOnly ? { reduceOnly: true } : {}),
    ...(req.program !== undefined ? { program: req.program } : {}),
    tif: req.tif ?? 'gtc',
    id: `${req.playerId}-${seq}`,
    status: reason ? 'rejected' : 'open',
    placedTick: state.tick,
    triggered: false,
    filledQty: 0,
    avgFillPrice: 0,
    feesPaid: 0,
    ...(reason ? { rejectReason: reason, closedTick: state.tick } : {}),
    ...extra,
  };
}

function archiving(state: WorldState): boolean {
  return !!tradingConfig(state).archiveClosed;
}

/** Append closed orders to their players' history (copy-on-write per touched player), capped. */
function toHistory(state: WorldState, closed: Order[]): Record<string, Order[]> {
  const keep = tradingConfig(state).closedOrdersKept;
  const hist = { ...(state.closedOrders ?? {}) };
  const touched = new Set<string>();
  for (const o of closed) {
    if (!touched.has(o.playerId)) { hist[o.playerId] = (hist[o.playerId] ?? []).slice(); touched.add(o.playerId); }
    hist[o.playerId]!.push(o);
  }
  for (const pid of touched) if (hist[pid]!.length > keep) hist[pid] = hist[pid]!.slice(-keep);
  return hist;
}

/**
 * Place an order. `warning` is set on an accepted covered order in the last open days of its window (windowClosing,
 * restrictions.ts): the order stands, the warning is for the caller to show.
 */
export function placeOrder(state: WorldState, req: OrderRequest): { state: WorldState; order: Order; warning?: { code: 'windowClosing'; closesDay: number } } {
  return placeOrderImpl(state, req, false);
}

/**
 * The engine's own program orders only (programs.ts): a plan's sell out of its escrow, or a buyback's buy. A program id on
 * any other route is refused, so no order can use a plan's window exception or its escrow without the plan's terms.
 */
export function placeProgramOrder(state: WorldState, req: OrderRequest): { state: WorldState; order: Order; warning?: { code: 'windowClosing'; closesDay: number } } {
  return placeOrderImpl(state, req, true);
}

function placeOrderImpl(state: WorldState, req: OrderRequest, fromProgram: boolean): { state: WorldState; order: Order; warning?: { code: 'windowClosing'; closesDay: number } } {
  const seq = state.orderSeq + 1;
  const gate = placementGate(state, req);
  // a plan never buys, on any route: a buy that names a plan is planSellOnly; any other program id is reserved
  const named = req.program !== undefined ? restrictionsOf(state).programs[req.program] : undefined;
  const reserved = req.program !== undefined && !fromProgram;
  const reason = reserved
    ? (named?.kind === 'plan' && req.side === 'buy' ? 'planSellOnly' : 'programOrderReserved')
    : gate ? gate.code : validate(state, req);
  const i = assetIndex(state, req.assetId);
  const extra: Partial<Order> = {
    ...(req.type === 'trailing' && i >= 0 ? { trailRef: mid(state, i) } : {}),
    ...(gate?.untilDay !== undefined ? { rejectUntil: gate.untilDay } : {}),
  };
  const order = newOrder(state, seq, req, reason, extra);
  const w = !reason && state.restrictions && req.program === undefined
    ? closingWarning(restrictionsOf(state), sessionDay(state), req.playerId, req.assetId, companyRulesOf(state).windowClosingDays)
    : undefined;
  const warning = w ? { warning: w } : {};
  if (archiving(state)) {
    if (reason) return { state: { ...state, orderSeq: seq, closedOrders: toHistory(state, [order]) }, order };
    return { state: { ...state, orderSeq: seq, orders: [...state.orders, order] }, order, ...warning };
  }
  return { state: { ...state, orderSeq: seq, orders: prune(state, [...state.orders, order]) }, order, ...warning };
}

/** The reject code for changing a program's order: a plan's is planImmutable (v1.4), a buyback's is buybackImmutable (§5.2). */
function programImmutable(state: WorldState, o: Order): 'planImmutable' | 'buybackImmutable' | undefined {
  if (o.program === undefined) return undefined;
  return restrictionsOf(state).programs[o.program]?.kind === 'buyback' ? 'buybackImmutable' : 'planImmutable';
}

/**
 * Cancel an open order. A program's order (a plan's or a buyback's) is part of a committed program and cannot be
 * cancelled: the result carries its stable code and changes nothing. Any other closed order is returned unchanged.
 */
export function cancelOrderResult(
  state: WorldState, playerId: string, orderId: string,
): { state: WorldState; error?: 'planImmutable' | 'buybackImmutable' } {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) throw new Error(`unknown order ${orderId}`);
  const o = state.orders[idx]!;
  if (o.playerId !== playerId) throw new Error(`order ${orderId} belongs to another player`);
  const immutable = programImmutable(state, o);
  if (immutable) return { state, error: immutable };
  if (o.status !== 'open') return { state };
  const closed: Order = { ...o, status: 'cancelled', closedTick: state.tick };
  if (archiving(state)) {
    return { state: { ...state, orders: state.orders.filter((x) => x.id !== orderId), closedOrders: toHistory(state, [closed]) } };
  }
  const orders = state.orders.slice();
  orders[idx] = closed;
  return { state: { ...state, orders } };
}

export function cancelOrder(state: WorldState, playerId: string, orderId: string): WorldState {
  return cancelOrderResult(state, playerId, orderId).state;
}

/** Change the quantity or prices of an open order (it keeps its place in the queue). */
export function modifyOrder(
  state: WorldState, playerId: string, orderId: string, patch: { qty?: number; limitPrice?: number; stopPrice?: number; trailPct?: number },
): { state: WorldState; error?: string } {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return { state, error: 'unknown order' };
  const o = state.orders[idx]!;
  if (o.playerId !== playerId) return { state, error: 'not your order' };
  if (o.status !== 'open') return { state, error: 'order is closed' };
  const immutable = programImmutable(state, o);
  if (immutable) return { state, error: immutable };
  if (patch.qty !== undefined && patch.qty < o.filledQty + EPS) return { state, error: 'below the filled quantity' };
  const next: Order = { ...o, ...patch };
  const without = { ...state, orders: state.orders.filter((x) => x.id !== orderId) };
  const err = placementGate(without, next)?.code ?? validate(without, { ...next, qty: next.qty - next.filledQty });
  if (err) return { state, error: err };
  const orders = state.orders.slice();
  orders[idx] = next;
  return { state: { ...state, orders } };
}

export function openOrders(state: WorldState, playerId: string): Order[] {
  return state.orders.filter((o) => o.playerId === playerId && o.status === 'open');
}

export function orderHistory(state: WorldState, playerId: string): Order[] {
  const open = state.orders.filter((o) => o.playerId === playerId);
  return state.closedOrders?.[playerId] ? [...state.closedOrders[playerId]!, ...open] : open;
}

function prune(state: WorldState, orders: Order[]): Order[] {
  const keep = tradingConfig(state).closedOrdersKept;
  const closed = orders.filter((o) => o.status !== 'open').length;
  if (closed <= keep) return orders;
  let drop = closed - keep;
  return orders.filter((o) => {
    if (drop > 0 && o.status !== 'open') { drop--; return false; }
    return true;
  });
}

// ---------------------------------------------------------------- booking

/**
 * Book a fill of q units at `price` (fee extra) into an account, handling longs, shorts and
 * flips. Mutates `acct` (a working copy with its own positions map). Returns realized P&L.
 */
function book(acct: Account, assetId: string, side: Side, q: number, price: number, fee: number): number {
  const s = sign(side);
  const pos0 = acct.positions[assetId] ?? { qty: 0, avgCost: 0, realizedPnl: 0 };
  const Q = pos0.qty;
  // effective price per unit with the fee folded in: buys pay more, sells receive less
  const e = price + (s * fee) / q;
  let realized = 0;
  let qty = Q;
  let avg = pos0.avgCost;
  let rem = q;
  if (Q !== 0 && Math.sign(Q) !== s) {
    const close = Math.min(rem, Math.abs(Q));
    realized = close * (e - avg) * Math.sign(Q);
    qty = Q + s * close;
    rem -= close;
    if (Math.abs(qty) <= EPS) { qty = 0; avg = 0; }
  }
  if (rem > EPS) {
    const newQty = qty + s * rem;
    avg = (Math.abs(qty) * avg + rem * e) / Math.abs(newQty);
    qty = newQty;
  }
  acct.cash -= s * q * price + fee;
  acct.realizedPnl += realized;
  acct.feesPaid += fee;
  if (Math.abs(qty) <= EPS) delete acct.positions[assetId];
  else acct.positions[assetId] = { qty, avgCost: avg, realizedPnl: pos0.realizedPnl + realized };
  return realized;
}

/**
 * Close every account's position in one asset at a settlement price, with no fee: a bankruptcy's recovery, a cash
 * merger's premium, or a spin-off's carve-out. Open orders in the asset are cancelled. Pure.
 */
export function settleAsset(state: WorldState, assetId: string, price: number): WorldState {
  const accounts: Record<string, Account> = { ...state.accounts };
  for (const [id, acct] of Object.entries(state.accounts)) {
    const pos = acct.positions[assetId];
    if (!pos) continue;
    const copy: Account = { ...acct, positions: { ...acct.positions } };
    book(copy, assetId, pos.qty > 0 ? 'sell' : 'buy', Math.abs(pos.qty), price, 0);
    accounts[id] = copy;
  }
  const orders = state.orders.map((o) => (o.assetId === assetId && o.status === 'open'
    ? { ...o, status: 'cancelled' as const, rejectReason: 'delisted', closedTick: state.tick }
    : o));
  return { ...state, accounts, orders };
}

/**
 * Delisting settlement for listed options on one underlying: every open contract on it is cash-settled at intrinsic
 * value against the settlement price, as at expiry (longs receive, shorts pay), with no fee. The contracts are removed.
 * Pure: returns the next state and one `option_expiry` event per settled position, tagged `reason: 'delisting'`.
 */
export function settleOptionsOn(
  state: WorldState, underlying: string, price: number, tick: number,
): { state: WorldState; events: StepEvent[] } {
  const mult = state.config.options?.multiplier ?? 100;
  const events: StepEvent[] = [];
  const accounts: Record<string, Account> = { ...state.accounts };
  for (const [id, acct] of Object.entries(state.accounts)) {
    if (!acct.options) continue;
    let copy: Account | null = null;
    for (const [cid, pos] of Object.entries(acct.options)) {
      const c = parseContract(cid);
      if (!c || c.underlying !== underlying) continue;
      const intrinsic = c.kind === 'call' ? Math.max(0, price - c.strike) : Math.max(0, c.strike - price);
      const payout = intrinsic * mult * pos.qty;
      copy ??= { ...acct, options: { ...acct.options } };
      copy.cash += payout;
      copy.realizedPnl += payout - pos.avgCost * mult * pos.qty;
      delete copy.options![cid];
      events.push({ type: 'option_expiry', tick, playerId: id, contractId: cid, qty: pos.qty, payout, reason: 'delisting' });
    }
    if (copy) accounts[id] = copy;
  }
  return { state: { ...state, accounts }, events };
}

// ---------------------------------------------------------------- options

export interface OptionTradeResult {
  state: WorldState;
  fill?: { contractId: string; side: Side; qty: number; price: number; fee: number; total: number };
  error?: string;
}

/** Buy to open or sell to close listed option contracts at the current ask/bid. */
export function tradeOption(state: WorldState, playerId: string, contractId: string, side: Side, qty: number): OptionTradeResult {
  const cfg = state.config.options;
  const acct0 = state.accounts[playerId];
  if (!cfg) return { state, error: 'options are not listed' };
  if (!acct0) return { state, error: 'no account' };
  if (!acct0.canOptions) return { state, error: 'needs the Derivatives license' };
  if (!Number.isInteger(qty) || qty <= 0) return { state, error: 'whole contracts only' };
  const c = parseContract(contractId);
  if (!c || !cfg.underlyings.includes(c.underlying)) return { state, error: 'unknown contract' };
  const i = assetIndex(state, c.underlying);
  if (underlyingDelisted(state, c.underlying)) return { state, error: `${c.underlying} is delisted: its options no longer trade` };
  // company stock has no listed options (v1.7: a company's lnV moves only on prints, so there is nothing to hedge)
  if (state.config.assets[i]!.valueSource === 'company') return { state, error: 'no listed options on company stock' };
  // the window binds every §6.5 instrument: options on a covered company's stock are refused while it is closed
  if (state.restrictions) {
    const w = windowOn(restrictionsOf(state), c.underlying, playerId, sessionDay(state));
    if (!w.open) return { state, error: 'closedWindow' };
  }
  if (state.assets[i]!.haltUntil !== -1) return { state, error: 'underlying is halted' };
  const q = optionQuote(state, c);
  if (q.expired) return { state, error: 'contract has expired' };
  const fee = cfg.feePerContract * qty;
  // the dealer on the other side hedges the contract's delta in the underlying: that flow joins the asset's
  // shared day tally like any fill, so options can't move (or dodge moving) a stock more cheaply than shares
  const hedge = (st: WorldState): WorldState => {
    const units = q.delta * cfg.multiplier * qty * (side === 'buy' ? 1 : -1);
    if (!(Math.abs(units) > EPS)) return st;
    const assets = st.assets.slice();
    printFill(st, assets, i, units > 0 ? 'buy' : 'sell', Math.abs(units), mid(st, i));
    return { ...st, assets };
  };
  const acct: Account = { ...acct0, options: { ...(acct0.options ?? {}) } };
  const held = acct.options![contractId];
  if (side === 'buy') {
    const total = q.ask * cfg.multiplier * qty + fee;
    if (total > acct.cash + EPS) return { state, error: 'insufficient cash' };
    acct.cash -= total;
    const n = (held?.qty ?? 0) + qty;
    acct.options![contractId] = { qty: n, avgCost: ((held?.qty ?? 0) * (held?.avgCost ?? 0) + total / cfg.multiplier) / n };
    acct.feesPaid += fee;
    return { state: hedge({ ...state, accounts: { ...state.accounts, [playerId]: acct } }), fill: { contractId, side, qty, price: q.ask, fee, total } };
  }
  if (!held || held.qty < qty) return { state, error: 'you hold fewer contracts' };
  const proceeds = q.bid * cfg.multiplier * qty - fee;
  acct.cash += proceeds;
  acct.realizedPnl += proceeds - held.avgCost * cfg.multiplier * qty;
  acct.feesPaid += fee;
  if (held.qty === qty) delete acct.options![contractId];
  else acct.options![contractId] = { ...held, qty: held.qty - qty };
  return { state: hedge({ ...state, accounts: { ...state.accounts, [playerId]: acct } }), fill: { contractId, side, qty, price: q.bid, fee, total: proceeds } };
}

/**
 * A plan order's day is over with `rem` shares unsold. The reason is the order's own check, not the mid: a halt; `price`
 * when its last limit check failed (the fill price after the spread was below the minimum, so the floor, not the book,
 * held it: a price hold); otherwise `volume` (the book or the ADV cap). Returns the restrictions after the release.
 */
function expireProgramOrder(s: WorldState, o: Order, tick: number, events: StepEvent[]): TradingRestrictions | undefined {
  const r = restrictionsOf(s);
  const p = o.program !== undefined ? r.programs[o.program] : undefined;
  const rem = o.qty - o.filledQty;
  if (!p || p.kind !== 'plan' || !(rem > EPS)) return s.restrictions;
  const i = assetIndex(s, o.assetId);
  const reason = s.assets[i]!.haltUntil !== -1 ? 'halt' : o.priceMissed ? 'price' : 'volume';
  return programRelease(r, p.id, rem, reason, sessionDayAt(o.placedTick, s.config.ticksPerDay), tick, events);
}

// ---------------------------------------------------------------- clearing (called by step)

/**
 * Clear every open order against NPC liquidity at this tick's prices, then settle daily finance
 * (interest, dividends, borrow fees, option expiries), enforce margin and mark accounts.
 * `state` already holds the new tick's prices.
 */
export function clearOrders(state: WorldState, newDay: boolean): { state: WorldState; fills: Fill[]; events: StepEvent[] } {
  const fills: Fill[] = [];
  const events: StepEvent[] = [];
  const hasOpen = state.orders.some((o) => o.status === 'open');
  const accountIds = Object.keys(state.accounts);
  if (!hasOpen && accountIds.length === 0) return { state, fills, events };

  const t = tradingConfig(state);
  const tick = state.tick;
  const tpd = state.config.ticksPerDay;
  const s: WorldState = { ...state, orders: state.orders.slice(), assets: state.assets.slice(), accounts: { ...state.accounts } };

  // permanent share of impact moves the price (the pull to value decays it), charged on the asset's shared day
  // tally across every account, so splitting into clips or across accounts doesn't multiply or dodge it
  const printTape = (i: number, side: Side, q: number, price: number, p0: number) => printFill(s, s.assets, i, side, q, price, q * p0);
  // every fill this tick prices off the tick's pre-trade mid; temporary impact is charged on what ALL accounts
  // already filled this tick on that side (a lone order prices exactly as before)
  const tickPrice = (i: number, side: Side, q: number) => {
    const tt = tallyTick(s.assets[i]!.tickTraded, tick, s.assets[i]!.lnP);
    const p0 = Math.exp(tt.lnMid);
    const imp = marginalImpact(s, i, tt[side], q * p0);
    return { price: fillPrice(p0, side, halfSpread(s, i) + imp), p0 };
  };

  if (hasOpen) {
    const spawned: Order[] = [];
    const dayNow = dayOfTick(tick, tpd);
    for (let k = 0; k < s.orders.length; k++) {
      let o = s.orders[k]!;
      if (o.status !== 'open') continue;

      if (newDay && o.tif === 'day' && Math.floor(o.placedTick / tpd) < Math.floor((tick - 1) / tpd)) {
        s.orders[k] = { ...o, status: 'expired', closedTick: tick };
        if (o.program !== undefined && s.restrictions) s.restrictions = expireProgramOrder(s, o, tick, events);
        continue;
      }
      const i = assetIndex(s, o.assetId);
      const def = s.config.assets[i]!;
      if (s.assets[i]!.haltUntil !== -1) continue; // halted: wait for the reopen
      const p = mid(s, i);

      if (o.type === 'trailing' && !o.triggered) {
        const ref = o.side === 'sell' ? Math.max(o.trailRef ?? p, p) : Math.min(o.trailRef ?? p, p);
        const hit = o.side === 'sell' ? p <= ref * (1 - o.trailPct!) : p >= ref * (1 + o.trailPct!);
        o = { ...o, trailRef: ref, ...(hit ? { triggered: true } : {}) };
        s.orders[k] = o;
        if (!hit) continue;
      }
      if ((o.type === 'stop' || o.type === 'stop_limit') && !o.triggered) {
        const hit = o.side === 'buy' ? p >= o.stopPrice! : p <= o.stopPrice!;
        if (!hit) continue;
        o = { ...o, triggered: true };
        s.orders[k] = o;
      }

      const acct0 = s.accounts[o.playerId];
      if (!acct0) { s.orders[k] = { ...o, status: 'cancelled', rejectReason: 'no account', closedTick: tick }; continue; }
      const margin = isMarginAccount(acct0);
      const held = acct0.positions[o.assetId]?.qty ?? 0;

      // windows and lockups hold at the fill too: an open covered order is cancelled when its window shuts (v1.7)
      const r0 = s.restrictions ? restrictionsOf(s) : undefined;
      const prog = r0 !== undefined && o.program !== undefined ? r0.programs[o.program] : undefined;
      const gate = r0 ? gateOn(r0, dayNow, o.playerId, o.assetId, o.side, prog?.kind) : null;
      if (gate) {
        s.orders[k] = { ...o, status: 'cancelled', rejectReason: gate.code, ...(gate.untilDay !== undefined ? { rejectUntil: gate.untilDay } : {}), closedTick: tick };
        events.push({ type: 'restricted', tick, playerId: o.playerId, assetId: o.assetId, code: gate.code, ...(gate.untilDay !== undefined ? { untilDay: gate.untilDay } : {}) });
        continue;
      }
      // shares locked by a plan are not sellable outside it (escrow)
      const locked = r0 ? lockedQty(r0, o.playerId, o.assetId, dayNow) : 0;

      // the maxAdvPerTick cap is shared too: what other accounts filled this tick on this side counts against it
      const tt = tallyTick(s.assets[i]!.tickTraded, tick, s.assets[i]!.lnP);
      const capUnits = (t.maxAdvPerTick * (def.advNotional ?? 1e9) - tt[o.side]) / Math.exp(tt.lnMid);
      if (!(capUnits > EPS) || roundQty(def, capUnits) <= EPS) continue; // this tick's shared cap is used up: wait
      let q = o.qty - o.filledQty;
      q = roundQty(def, Math.min(q, capUnits));
      if (o.reduceOnly) {
        const can = held !== 0 && Math.sign(held) !== sign(o.side) ? (held > 0 ? Math.max(0, held - locked) : Math.abs(held)) : 0;
        if (can <= EPS) { s.orders[k] = { ...o, status: 'cancelled', rejectReason: 'position closed', closedTick: tick }; continue; }
        q = Math.min(q, can);
      } else if (prog?.kind === 'plan') {
        // a plan sells out of its escrow, and never more than the account still holds (held is checked on every fill)
        q = Math.min(q, prog.escrow, Math.max(0, held));
      } else if (o.side === 'sell' && (locked > 0 || !(margin && acct0.canShort))) {
        q = Math.min(q, Math.max(0, held - locked));
      }
      if (q <= EPS) {
        if (o.side === 'sell') s.orders[k] = { ...o, status: 'cancelled', rejectReason: 'insufficient position', closedTick: tick };
        // a plan order that cannot sell its day releases the escrow for it (or the escrow would stay locked for good)
        if (prog?.kind === 'plan' && s.restrictions) {
          s.restrictions = programRelease(restrictionsOf(s), prog.id, o.qty - o.filledQty, 'volume', sessionDayAt(o.placedTick, tpd), tick, events);
        }
        continue;
      }

      let { price, p0 } = tickPrice(i, o.side, q);
      if (o.type === 'limit' || o.type === 'stop_limit') {
        if (o.side === 'buy' ? price > o.limitPrice! : price < o.limitPrice!) {
          // a plan records that its last price check failed: an unsold remainder then becomes a price hold, not a volume skip
          if (prog?.kind === 'plan' && !o.priceMissed) s.orders[k] = { ...o, priceMissed: true };
          continue; // not marketable yet
        }
      }
      let fee = commission(s, def, q * price);

      let shrunk = false;
      if (!margin && o.side === 'buy' && q * price + fee > acct0.cash + EPS) {
        shrunk = true;
        // shrink to what the cash covers (prices moved since placement)
        const f = t.fees[def.assetClass] ?? t.fees.stock;
        q = roundQty(def, Math.max(0, (acct0.cash - f.min) / (price * (1 + f.rate))));
        if (q <= EPS) {
          s.orders[k] = { ...o, status: o.filledQty > 0 ? 'cancelled' : 'rejected', rejectReason: 'insufficient cash', closedTick: tick };
          continue;
        }
        ({ price, p0 } = tickPrice(i, o.side, q));
        fee = commission(s, def, q * price);
        if (q * price + fee > acct0.cash + EPS) {
          s.orders[k] = { ...o, status: o.filledQty > 0 ? 'cancelled' : 'rejected', rejectReason: 'insufficient cash', closedTick: tick };
          continue;
        }
      }

      const acct: Account = { ...acct0, positions: { ...acct0.positions } };
      book(acct, o.assetId, o.side, q, price, fee);
      s.accounts[o.playerId] = acct;

      const filledQty = o.filledQty + q;
      const done = filledQty >= o.qty - Math.max(EPS, o.qty * 1e-12);
      s.orders[k] = {
        ...o,
        filledQty,
        avgFillPrice: (o.filledQty * o.avgFillPrice + q * price) / filledQty,
        feesPaid: o.feesPaid + fee,
        // a buy shrunk to fit the cash closes now: the remainder is cancelled, not left waiting
        status: done ? 'filled' : shrunk ? 'cancelled' : 'open',
        ...(done || shrunk ? { closedTick: tick } : {}),
        ...(!done && shrunk ? { rejectReason: 'insufficient cash' } : {}),
        // the fill passed the limit, so the last price check is now a pass
        ...(prog?.kind === 'plan' ? { priceMissed: false } : {}),
      };
      fills.push({ orderId: o.id, playerId: o.playerId, assetId: o.assetId, side: o.side, qty: q, price, fee, tick, mid: p0 });
      printTape(i, o.side, q, price, p0);
      if (prog?.kind === 'plan' && s.restrictions) s.restrictions = programFill(restrictionsOf(s), prog.id, q, sessionDayAt(o.placedTick, tpd), tick, events);

      // one-cancels-other: a fill on a bracket leg cancels its sibling
      if (o.ocoGroup) {
        for (let m = 0; m < s.orders.length; m++) {
          const x = s.orders[m]!;
          if (m !== k && x.status === 'open' && x.ocoGroup === o.ocoGroup) s.orders[m] = { ...x, status: 'cancelled', rejectReason: 'other leg filled', closedTick: tick };
        }
      }
      // bracket: once the entry is complete, place its take-profit and stop-loss legs
      if (done && (o.takeProfit !== undefined || o.stopLoss !== undefined)) {
        const exit: Side = o.side === 'buy' ? 'sell' : 'buy';
        const base = { playerId: o.playerId, assetId: o.assetId, side: exit, qty: filledQty, reduceOnly: true, tif: 'gtc' as const };
        if (o.takeProfit !== undefined) {
          s.orderSeq++;
          spawned.push(newOrder(s, s.orderSeq, { ...base, type: 'limit', limitPrice: o.takeProfit }, null, { ocoGroup: o.id }));
        }
        if (o.stopLoss !== undefined) {
          s.orderSeq++;
          spawned.push(newOrder(s, s.orderSeq, { ...base, type: 'stop', stopPrice: o.stopLoss }, null, { ocoGroup: o.id }));
        }
      }
    }
    for (const x of spawned) s.orders.push(x);
    if (!archiving(s)) s.orders = prune(s, s.orders);
  }

  // ---- daily finance (rates on): cash interest, margin interest, dividends, borrow fees ----
  const today = Math.floor((tick - 1) / tpd);
  if (newDay && state.config.rates) {
    const mc = marginConfig(s);
    const policy = s.rates?.policy ?? mc.fallbackRate;
    const dpy = s.config.daysPerYear;
    for (const id of accountIds) {
      const a = { ...s.accounts[id]!, positions: { ...s.accounts[id]!.positions } };
      if (a.cash > 0) {
        const earned = (a.cash * policy * mc.cashInterestShare) / dpy;
        a.cash += earned;
        a.interestEarned = (a.interestEarned ?? 0) + earned;
      } else if (a.cash < 0) {
        const paid = (-a.cash * (policy + mc.loanSpread)) / dpy;
        a.cash -= paid;
        a.interestPaid = (a.interestPaid ?? 0) + paid;
      }
      for (const [assetId, pos] of Object.entries(a.positions)) {
        const i = assetIndex(s, assetId);
        if (i < 0) continue;
        const def = s.config.assets[i]!;
        const value = pos.qty * mid(s, i);
        if (def.dividendYield) {
          const d = (value * def.dividendYield) / dpy; // shorts pay the dividend
          a.cash += d;
          a.dividends = (a.dividends ?? 0) + d;
          events.push({ type: 'dividend', tick, playerId: id, assetId, amount: d });
        }
        if (pos.qty < 0) {
          const fee = (-value * (def.borrowFee ?? mc.borrowFee[def.assetClass] ?? 0.01)) / dpy;
          a.cash -= fee;
          a.borrowPaid = (a.borrowPaid ?? 0) + fee;
        }
      }
      s.accounts[id] = a;
    }
  }

  // ---- option expiries: cash-settle every contract whose expiry day has closed ----
  if (newDay && state.config.options) {
    const mult = state.config.options.multiplier;
    for (const id of accountIds) {
      const a0 = s.accounts[id]!;
      if (!a0.options || !Object.keys(a0.options).length) continue;
      const a = { ...a0, options: { ...a0.options } };
      for (const [cid, pos] of Object.entries(a.options)) {
        const c = parseContract(cid);
        if (!c || c.expiryDay >= today) continue;
        const S = mid(s, assetIndex(s, c.underlying));
        const intrinsic = c.kind === 'call' ? Math.max(0, S - c.strike) : Math.max(0, c.strike - S);
        const payout = intrinsic * mult * pos.qty;
        a.cash += payout;
        a.realizedPnl += payout - pos.avgCost * mult * pos.qty;
        delete a.options[cid];
        events.push({ type: 'option_expiry', tick, playerId: id, contractId: cid, qty: pos.qty, payout });
      }
      s.accounts[id] = a;
    }
  }

  // ---- margin calls and liquidation, then mark: peak and drawdown on liquidation value ----
  const mc = marginConfig(s);
  const squeeze = squeezeConfig(s.config);
  const liqDay = dayOfTick(tick, tpd);
  const marks: string[] = [];
  for (const id of accountIds) {
    let a = s.accounts[id]!;
    if (isMarginAccount(a)) {
      let gross = grossExposure(s, a);
      let eq = collateralEquityOf(s, a, liqDay);
      if (gross > 0 && eq / gross < mc.liquidation) {
        a = { ...a, positions: { ...a.positions } };
        // close the largest positions first until the account is back above maintenance
        const queue = Object.entries(a.positions)
          .map(([assetId, pos]) => ({ assetId, value: Math.abs(pos.qty) * mid(s, assetIndex(s, assetId)) }))
          .sort((x, y) => y.value - x.value || x.assetId.localeCompare(y.assetId));
        for (const { assetId } of queue) {
          if (gross <= 0 || eq / gross >= mc.maintenance) break;
          const i = assetIndex(s, assetId);
          if (s.assets[i]!.haltUntil !== -1) continue;
          const pos = a.positions[assetId]!;
          const side: Side = pos.qty > 0 ? 'sell' : 'buy';
          // plan escrow and price holds are never sold by a liquidation (v1.4): a long sells only its unlocked shares
          const locked = side === 'sell' ? lockedIn(s, id, assetId, liqDay) : 0;
          const q = side === 'sell' ? Math.max(0, pos.qty - locked) : Math.abs(pos.qty);
          if (locked > 0 && q <= EPS) continue;
          const { price, p0 } = tickPrice(i, side, q);
          const fee = commission(s, s.config.assets[i]!, q * price);
          book(a, assetId, side, q, price, fee);
          s.orderSeq++;
          const forcedOrder = newOrder(s, s.orderSeq, { playerId: id, assetId, side, type: 'market', qty: q }, null, {
            status: 'filled', filledQty: q, avgFillPrice: price, feesPaid: fee, closedTick: tick, forced: true,
          });
          s.orders.push(forcedOrder);
          fills.push({ orderId: forcedOrder.id, playerId: id, assetId, side, qty: q, price, fee, tick, mid: p0 });
          events.push({ type: 'liquidation', tick, playerId: id, assetId, qty: q, price });
          printTape(i, side, q, price, p0);
          if (side === 'buy' && squeeze) recordCover(s, i, q * price, tick, squeeze, events);
          gross = grossExposure(s, a);
          eq = collateralEquityOf(s, a, liqDay);
        }
        // cancel the account's open non-reducing orders after a liquidation; a program's order is not cancelled (its
        // plan or buyback is committed, and a plan keeps its escrow for its days)
        for (let m = 0; m < s.orders.length; m++) {
          const x = s.orders[m]!;
          if (x.playerId === id && x.status === 'open' && !x.reduceOnly && x.program === undefined) s.orders[m] = { ...x, status: 'cancelled', rejectReason: 'margin liquidation', closedTick: tick };
        }
      }
      if (gross > 0 && eq / gross < mc.maintenance) {
        if (a.marginCallTick === undefined) {
          a = { ...a, marginCallTick: tick };
          events.push({ type: 'margin_call', tick, playerId: id, equity: eq, required: gross * mc.maintenance });
        }
      } else if (a.marginCallTick !== undefined) {
        a = { ...a };
        delete a.marginCallTick;
      }
    }
    s.accounts[id] = a;
    marks.push(id);
  }
  updateMarkGuards(s);
  // the crowd after this tick's fills and liquidations: every account's exit is priced on it until the next tick
  s.crowd = crowdHoldings(s);
  for (const id of marks) {
    const a = s.accounts[id]!;
    const liq = Object.keys(a.positions).length || a.options ? liquidationOf(s, a, s.crowd) : a.cash;
    const peak = Math.max(a.peakEquity, liq);
    const dd = peak > 0 ? liq / peak - 1 : 0;
    if (peak === a.peakEquity && dd >= a.maxDrawdown && !newDay) continue;
    s.accounts[id] = {
      ...a,
      peakEquity: peak,
      maxDrawdown: Math.min(a.maxDrawdown, dd),
      dayStartEquity: newDay ? equityOf(s, a) : a.dayStartEquity,
    };
  }
  if (archiving(s) && s.orders.some((o) => o.status !== 'open')) {
    const closed = s.orders.filter((o) => o.status !== 'open');
    s.orders = s.orders.filter((o) => o.status === 'open');
    s.closedOrders = toHistory(s, closed);
  }
  return { state: s, fills, events };
}

// ---------------------------------------------------------------- portfolio view

export function portfolio(state: WorldState, playerId: string): PortfolioView {
  const acct = state.accounts[playerId];
  if (!acct) throw new Error(`no account ${playerId}`);
  const equity = equityOf(state, acct);
  const positions: PositionView[] = Object.entries(acct.positions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([assetId, pos]) => {
      const price = mid(state, assetIndex(state, assetId));
      const marketValue = pos.qty * price;
      const cost = pos.qty * pos.avgCost;
      return {
        assetId,
        qty: pos.qty,
        avgCost: pos.avgCost,
        price,
        marketValue,
        unrealizedPnl: marketValue - cost,
        unrealizedPct: cost !== 0 ? (marketValue - cost) / Math.abs(cost) : 0,
        realizedPnl: pos.realizedPnl,
        weight: equity > 0 ? marketValue / equity : 0,
      };
    });
  const unrealizedPnl = positions.reduce((x, p) => x + p.unrealizedPnl, 0);
  const liq = liquidationOf(state, acct);
  const peak = Math.max(acct.peakEquity, liq);
  return {
    playerId,
    cash: acct.cash,
    equity,
    startingCash: acct.startingCash,
    positions,
    realizedPnl: acct.realizedPnl,
    unrealizedPnl,
    totalPnl: equity - acct.startingCash,
    dayPnl: equity - acct.dayStartEquity,
    feesPaid: acct.feesPaid,
    peakEquity: peak,
    liquidationEquity: liq,
    drawdown: peak > 0 ? liq / peak - 1 : 0,
    maxDrawdown: Math.min(acct.maxDrawdown, peak > 0 ? liq / peak - 1 : 0),
  };
}
