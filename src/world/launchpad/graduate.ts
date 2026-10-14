import { Rng, appendAsset, cancelOrderResult, openAccount, type AssetDef } from '@/engine';
import { addShares } from '../company/ipo';
import type { GameState, StepOutput } from '../types';
import { notify } from '../core';
import { LP, bookAccountId, npcAccountId, curveAccountId } from './constants';
import { spotAt } from './curve';
import { dayOf, lpWire, moveCents, sinkCents, faucetCents } from './state';
import { cohortsOf } from './cohorts';
import { lockedAmount } from './vest';
import type { LpToken } from './types';
import { touchBar } from './bars';

/**
 * Graduation (lead-launchpad.md L4). When the curve has sold its 800M tokens, the token leaves the curve at the end of that fill:
 *   - the graduation fee (1.5% of the raised cash) is a booked sink;
 *   - the rest of the raised cash and the LP tokens (200M less the creator's allocation) seed the liquidity book account, which
 *     nobody owns, so the book is locked forever (no LP rug);
 *   - the token becomes a runtime crypto asset through the engine's listing path (appendAsset, which bumps the list version so the
 *     clients get the def), priced by the engine with the meme template of the universe (FROG), `initialPrice` = the last curve
 *     price and `sharesOutstanding` = the supply;
 *   - the holders' curve balances become engine positions in the same tick, at their cost basis; the NPC cohort's tokens go to its
 *     own account. Fills against the token run against the book (the company-stock path, `supplyAccount`): a buy takes only what the
 *     book holds, so a fill the book cannot cover is partial and never minted.
 */

const MEME_TEMPLATES = ['FROG', 'BONK'];

/** The meme template of the universe: FROG, or BONK when FROG is not in the world. */
function memeTemplate(g: GameState): AssetDef {
  for (const id of MEME_TEMPLATES) {
    const d = g.market.config.assets.find((a) => a.id === id);
    if (d) return d;
  }
  throw new Error('launchpad: no meme template in the world');
}

export function graduate(g: GameState, t: LpToken, out: StepOutput | null): void {
  if (t.status !== 'live') throw new Error(`launchpad: ${t.ticker} is not live`);
  const tick = g.market.tick;
  const curve = curveAccountId(t.ticker);
  const bookId = bookAccountId(t.ticker);
  const price = spotAt(t.y);

  // the raised cash: the graduation fee is a sink, the rest seeds the book
  const raisedCents = Math.round((g.market.accounts[curve]?.cash ?? 0) * 100);
  const feeCents = Math.round(raisedCents * LP.GRAD_FEE_RATE);
  sinkCents(g, curve, 'lpGradFee', feeCents);
  g.launchpad!.totals.gradFee += feeCents / 100;
  const restCents = Math.round((g.market.accounts[curve]?.cash ?? 0) * 100);
  g.market = openAccount(g.market, bookId, 0);
  moveCents(g, curve, bookId, restCents);

  // the engine's asset: the meme template's parameters, with this token's vol and drift drawn from its own stream
  const rng = new Rng(t.rng);
  const vol = 1.9 + 0.1 * rng.uniform();
  const drift = -(0.15 + 0.1 * rng.uniform());
  t.rng = rng.state();
  const tpl = memeTemplate(g);
  const {
    dividendYield: _dy, seasonal: _se, duration: _du, yieldKey: _yk, carrySpread: _cs, blurb: _bl, delisted: _de, listed: _li,
    insiderId: _in, supplyAccount: _sa, ...rest
  } = tpl;
  void _dy; void _se; void _du; void _yk; void _cs; void _bl; void _de; void _li; void _in; void _sa;
  const def: AssetDef = {
    ...rest,
    id: t.ticker,
    name: t.name,
    initialPrice: price,
    sharesOutstanding: LP.SUPPLY,
    vol,
    drift,
    // Newly graduated liquidity is tens of thousands, not the template's hundreds of millions of ADV.
    advNotional: Math.max(1000, restCents / 100),
    supplyAccount: bookId,
    // the book pays for what it buys: a sell the book cannot pay for is partial (never minted, trading.ts routeToSupply)
    bookCashBound: true,
    listedDay: dayOf(tick),
    blurb: `${t.name} (${t.ticker}): a memecoin that graduated from the Launchpad.`,
  };
  let s = appendAsset(g.market, def);
  // the LP tokens: the rest of the 200M after the creator's allocation (the book holds the float)
  const lpQty = LP.SUPPLY - LP.CURVE_SUPPLY - t.allocation;
  s = addShares(s, bookId, t.ticker, lpQty, price);
  // holders: their balances become positions at their cost basis (the creator's allocation cost nothing)
  for (const [pid, qty] of Object.entries(t.bal)) {
    if (!(qty > 0)) continue;
    const lots = t.lots[pid] ?? [];
    let cost = 0;
    for (const lot of lots) cost += lot.qty * lot.cost;
    s = addShares(s, pid, t.ticker, qty, cost / qty);
  }
  if (t.npcBal > 0) {
    const npc = npcAccountId(t.ticker);
    s = openAccount(s, npc, 0);
    const cs = cohortsOf(t);
    const owned = cs.filter(c => c.wallet);
    const legacyQty = t.npcBal - owned.reduce((sum, c) => sum + c.tokens, 0);
    const legacyCost = t.npcCost - owned.reduce((sum, c) => sum + c.cost, 0);
    if (legacyQty > 0) s = addShares(s, npc, t.ticker, legacyQty, legacyCost / legacyQty);
    for (const w of t.micro?.traders ?? []) {
      const bag = owned.filter(c => c.wallet === w.id);
      const qty = bag.reduce((sum, c) => sum + c.tokens, 0);
      const cost = bag.reduce((sum, c) => sum + c.cost, 0);
      s = openAccount(s, w.id, 0);
      if (qty > 0) s = addShares(s, w.id, t.ticker, qty, cost / qty);
      w.accountId = w.id;
    }
  }
  g.market = s;
  // External unspent wallet capital becomes account cash once, and is booked like every other NPC inflow.
  for (const w of t.micro?.traders ?? []) {
    if (!w.accountId) {
      g.market = openAccount(g.market, w.id, 0);
      w.accountId = w.id;
    }
    if (w.cashCents > 0) faucetCents(g, w.id, 'npcRetail', w.cashCents);
    w.cashCents = 0;
  }

  t.status = 'graduated';
  t.gradTick = tick;
  t.gradPrice = price;
  t.gradRaise = raisedCents / 100;
  // the candles end at the graduation price: the graduating fill is a touch (its tape line is pushed by buyCurve before this runs)
  touchBar(t, tick, price);
  t.creatorHeldAtGrad = t.creatorId ? (t.bal[t.creatorId] ?? 0) : 0;
  // the day's sweep test starts from the graduation price (not the launch price the day was opened at)
  t.creatorDay = { day: dayOf(tick), qty: 0, proceeds: 0, startPrice: price, wired: false };
  // the balances are engine positions now; the lots and realised P&L stay, and the engine's fills keep them (rug.ts lpFills)
  t.bal = {};
  t.npcBal = 0;
  t.npcCost = 0;
  t.lowCloses = 0;
  t.npcCohorts = [];
  g.launchpad!.totals.graduations++;
  const vars = { name: t.name, ticker: t.ticker, raised: (raisedCents / 100).toFixed(2), price: price.toFixed(6) };
  lpWire(g, out, 'brass', 'Launchpad', { key: 'lp.wire.grad', vars }, t.ticker);
  if (t.creatorId) notify(g, out, t.creatorId, { kind: 'system', tone: 'brass', text: `${t.name} graduated to the Broker as ${t.ticker}.`, msg: { key: 'lp.inbox.grad', vars } });
}

/** The creator's resting sell quantity in a token: every open sell (limits, stops and bracket children included). */
export function openSellQty(g: GameState, pid: string, assetId: string): number {
  let q = 0;
  for (const o of g.market.orders) {
    if (o.status === 'open' && o.playerId === pid && o.assetId === assetId && o.side === 'sell') q += o.qty - o.filledQty;
  }
  return q;
}

/**
 * The creator's engine-side sell rule after graduation (L5). The vesting locks the allocation's unvested part: the open sells
 * and the new sell together may not reach into it. Resting orders count (a second sell cannot be placed against shares the first
 * already commits). False when the sell is allowed, or when the asset is not a Launchpad token, or nothing is locked.
 */
export function lockedEngineSell(g: GameState, pid: string, assetId: string, qty: number): boolean {
  const t = g.launchpad?.tokens[assetId];
  if (!t || t.status !== 'graduated' || t.creatorId !== pid) return false;
  const held = g.market.accounts[pid]?.positions[assetId]?.qty ?? 0;
  const locked = Math.min(lockedAmount(t, g.market.tick), held);
  if (locked <= 0) return false;
  return openSellQty(g, pid, assetId) + qty > held - locked;
}

/**
 * The pre-step re-check (L5, the engine's fill loop has no hook of its own): before each tick's matching, the creator's resting
 * sells are cut back to what the vesting lets them sell. The newest resting sell goes first; the owner is told. Returns the
 * cancelled order ids. Nothing moves when no allocation is locked.
 */
export function vestingSweep(g: GameState, out: StepOutput | null): string[] {
  const s = g.launchpad;
  if (!s) return [];
  const cancelled: string[] = [];
  for (const t of Object.values(s.tokens)) {
    if (t.status !== 'graduated' || !t.creatorId) continue;
    const pid = t.creatorId;
    const held = g.market.accounts[pid]?.positions[t.ticker]?.qty ?? 0;
    const locked = Math.min(lockedAmount(t, g.market.tick), held);
    if (locked <= 0) continue;
    const sellable = Math.max(0, held - locked);
    let open = openSellQty(g, pid, t.ticker);
    if (open <= sellable) continue;
    const newest = g.market.orders.filter((o) => o.status === 'open' && o.playerId === pid && o.assetId === t.ticker && o.side === 'sell').reverse();
    for (const o of newest) {
      if (open <= sellable) break;
      const res = cancelOrderResult(g.market, pid, o.id);
      if (res.error) continue;
      g.market = res.state;
      open -= o.qty - o.filledQty;
      cancelled.push(o.id);
      notify(g, out, pid, { kind: 'order', tone: 'warn', text: `${t.ticker} sell cancelled: the unvested allocation is locked.`, msg: { key: 'lp.inbox.vestCancel', vars: { ticker: t.ticker } } });
    }
  }
  return cancelled;
}
