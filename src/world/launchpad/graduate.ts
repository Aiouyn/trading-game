import { Rng, appendAsset, openAccount, type AssetDef } from '@/engine';
import { addShares } from '../company/ipo';
import type { GameState, StepOutput } from '../types';
import { notify } from '../core';
import { LP, bookAccountId, npcAccountId, curveAccountId } from './constants';
import { spotAt } from './curve';
import { dayOf, lpWire, moveCents, sinkCents } from './state';
import { lockedAmount } from './vest';
import type { LpToken } from './types';

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
    supplyAccount: bookId,
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
    s = addShares(s, npc, t.ticker, t.npcBal, t.npcCost / t.npcBal);
  }
  g.market = s;

  t.status = 'graduated';
  t.gradTick = tick;
  t.gradPrice = price;
  t.gradRaise = raisedCents / 100;
  t.creatorHeldAtGrad = t.creatorId ? (t.bal[t.creatorId] ?? 0) : 0;
  // the balances are engine positions now; the lots and realised P&L stay, and the engine's fills keep them (rug.ts lpFills)
  t.bal = {};
  t.npcBal = 0;
  t.npcCost = 0;
  t.cashLowSince = null;
  g.launchpad!.totals.graduations++;
  const vars = { name: t.name, ticker: t.ticker, raised: (raisedCents / 100).toFixed(2), price: price.toFixed(6) };
  lpWire(g, out, 'brass', 'Launchpad', { key: 'lp.wire.grad', vars }, t.ticker);
  if (t.creatorId) notify(g, out, t.creatorId, { kind: 'system', tone: 'brass', text: `${t.name} graduated to the Broker as ${t.ticker}.`, msg: { key: 'lp.inbox.grad', vars } });
}

/**
 * The creator's engine-side sell rule after graduation: their allocation is locked by the vesting (L5), and an order that would
 * sell into the locked part is refused. False when the sell is allowed, or when the asset is not a Launchpad token.
 */
export function lockedEngineSell(g: GameState, pid: string, assetId: string, qty: number): boolean {
  const t = g.launchpad?.tokens[assetId];
  if (!t || t.status !== 'graduated' || t.creatorId !== pid) return false;
  const held = g.market.accounts[pid]?.positions[assetId]?.qty ?? 0;
  const locked = Math.min(lockedAmount(t, g.market.tick), held);
  return held - qty < locked;
}
