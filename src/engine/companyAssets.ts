import { dayOfTick } from './catalysts';
import { appendAsset, delistAsset } from './listings';
import { companyRulesOf, endProgramsOn, restrictionsOf, setLockup } from './restrictions';
import { assetIndex, settleAsset } from './trading';
import type { Account, AssetDef, StepEvent, WorldState } from './types';

/**
 * Company stocks in the engine (quant-company-building v1.7, DECISIONS C2 hooks 1, 2, 5 and 6). The world layer decides
 * every number (the filed value, the IPO price, who may trade, the tender terms); these functions put them into the
 * market and enforce the engine-side rules. Pure: each returns the next state.
 */

/** VWAP30 looks back this many closed game days. */
export const VWAP_DAYS = 30;

function indexOf(state: WorldState, assetId: string): number {
  const i = assetIndex(state, assetId);
  if (i < 0) throw new Error(`unknown asset ${assetId}`);
  return i;
}

/**
 * IPO listing (hook 2): appends a company stock at its IPO price, with its value per share as the fundamental value.
 * The gap (price 0.9 x V by the world's rule) is what the value pool trades after the listing. Factor loadings, vol,
 * ADV and spread come from `def`, the sector template chosen by the world.
 */
export function listCompanyStock(state: WorldState, def: AssetDef, ipoPrice: number, valuePerShare: number): WorldState {
  if (def.assetClass !== 'stock' || def.valueSource !== 'company') throw new Error(`listCompanyStock: ${def.id} is not a company stock`);
  if (!(ipoPrice > 0) || !Number.isFinite(ipoPrice)) throw new Error('listCompanyStock: the IPO price must be positive');
  if (!(valuePerShare > 0) || !Number.isFinite(valuePerShare)) throw new Error('listCompanyStock: the value per share must be positive');
  if (state.config.assets.some((a) => a.id === def.id)) throw new Error(`listCompanyStock: ${def.id} already exists`);
  const day = dayOfTick(state.tick, state.config.ticksPerDay);
  let next = appendAsset(state, { ...def, initialPrice: ipoPrice, listedDay: def.listedDay ?? day });
  const i = next.assets.length - 1;
  const lnP = Math.log(ipoPrice);
  const lnV = Math.log(valuePerShare);
  const assets = next.assets.slice();
  assets[i] = { ...assets[i]!, lnP, lnV, lnOpen: lnP };
  next = { ...next, assets };
  if (next.ecology) {
    const eco = next.ecology.assets.slice();
    eco[i] = { ...eco[i]!, lnS: lnP, core: lnP, lnV };
    next = { ...next, ecology: { ...next.ecology, assets: eco } };
  }
  return next;
}

/**
 * A company print (hook 1): the world's filed value or signal-implied revision, as a log move of the asset's value. It
 * lands on the next tick: the value takes all of it, the price its companyPrintShare, and the ecology close prints it
 * through the value pool like news. Nothing else moves a company's lnV.
 */
export function printCompanyValue(state: WorldState, assetId: string, dLnV: number): WorldState {
  const i = indexOf(state, assetId);
  if (state.config.assets[i]!.valueSource !== 'company') throw new Error(`printCompanyValue: ${assetId} is not a company stock`);
  if (!Number.isFinite(dLnV)) throw new Error('printCompanyValue: the print must be finite');
  const assets = state.assets.slice();
  assets[i] = { ...assets[i]!, pendingPrint: (assets[i]!.pendingPrint ?? 0) + dLnV };
  return { ...state, assets };
}

/** VWAP over the last 30 closed days: sum(close x units) / sum(units). Null with no volume yet. */
export function vwap30(state: WorldState, assetId: string): number | null {
  const a = state.assets.find((x) => x.id === assetId);
  const bars = (a?.bars ?? []).slice(-VWAP_DAYS);
  let num = 0;
  let units = 0;
  for (const b of bars) {
    num += b.c * b.u;
    units += b.u;
  }
  return units > 0 ? num / units : null;
}

export type TenderReject =
  | { code: 'tenderNotCompany' }
  | { code: 'tenderBelowFloor'; floor: number }
  | { code: 'tenderUnfunded'; shortfall: number };

/**
 * Takeover tender (hook 6): every holder, long, short or locked, is settled at one price (settleAsset, through the
 * delisting path), and the company is delisted. The bidder pays exactly what is settled, so cash is conserved across
 * all accounts. The price must clear the floor of 1.2 x VWAP30 (the mid if there is no volume yet). The world decides
 * acceptance (board vote) before it calls this.
 */
export function tenderOffer(
  state: WorldState, assetId: string, price: number, bidderId?: string,
): { state: WorldState; events: StepEvent[]; reject?: TenderReject } {
  const i = indexOf(state, assetId);
  const def = state.config.assets[i]!;
  if (def.valueSource !== 'company' || def.delisted) return { state, events: [], reject: { code: 'tenderNotCompany' } };
  const base = vwap30(state, assetId) ?? Math.exp(state.assets[i]!.lnP);
  const floor = companyRulesOf(state).tenderFloorRatio * base;
  if (!(price >= floor) || !Number.isFinite(price)) return { state, events: [], reject: { code: 'tenderBelowFloor', floor } };

  // what the holders are paid: sum of signed quantity x price (a short is paid to cover, so it is a debit to the holder)
  let total = 0;
  for (const acct of Object.values(state.accounts)) {
    const pos = acct.positions[assetId];
    if (pos) total += pos.qty * price;
  }
  if (bidderId !== undefined) {
    const bidder = state.accounts[bidderId];
    if (!bidder) throw new Error(`tenderOffer: no bidder account ${bidderId}`);
    // cash after the settlement itself (the bidder may hold shares too) must not go negative
    const own = bidder.positions[assetId]?.qty ?? 0;
    const after = bidder.cash + own * price - total;
    if (after < 0) return { state, events: [], reject: { code: 'tenderUnfunded', shortfall: -after } };
  }

  const events: StepEvent[] = [];
  let next: WorldState = state;
  if (state.restrictions) {
    next = { ...state, restrictions: endProgramsOn(restrictionsOf(state), assetId, 'tender', dayOfTick(state.tick, state.config.ticksPerDay), state.tick, events) };
  }
  next = settleAsset(next, assetId, price);
  const delisted = delistAsset(next, i, price, state.tick);
  next = delisted.state;
  events.push(...delisted.events);
  if (bidderId !== undefined) {
    const bidder: Account = { ...next.accounts[bidderId]!, positions: { ...next.accounts[bidderId]!.positions } };
    bidder.cash -= total;
    next = { ...next, accounts: { ...next.accounts, [bidderId]: bidder } };
  }
  events.push({ type: 'listing', tick: state.tick, kind: 'merger', assetId, price });
  return { state: next, events };
}

/**
 * Founder and allocation shares (hook 3, lockup): a long position granted at `avgCost` with its sells refused before
 * `untilDay`. Cash does not move here: the world moves it (an IPO allocation is paid by the buyer, the founder's private
 * equity is not cash). Adds to any existing long.
 */
export function grantLockedShares(state: WorldState, playerId: string, assetId: string, qty: number, avgCost: number, untilDay: number): WorldState {
  const acct = state.accounts[playerId];
  if (!acct) throw new Error(`grantLockedShares: no account ${playerId}`);
  indexOf(state, assetId);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('grantLockedShares: qty must be a positive whole number');
  const pos = acct.positions[assetId];
  const q0 = pos?.qty ?? 0;
  if (q0 < 0) throw new Error('grantLockedShares: the account is short this asset');
  const newQty = q0 + qty;
  const avg = ((pos?.avgCost ?? 0) * q0 + avgCost * qty) / newQty;
  const accounts = { ...state.accounts, [playerId]: { ...acct, positions: { ...acct.positions, [assetId]: { qty: newQty, avgCost: avg, realizedPnl: pos?.realizedPnl ?? 0 } } } };
  return { ...state, accounts, restrictions: setLockup(restrictionsOf(state), assetId, playerId, untilDay) };
}
