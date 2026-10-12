/**
 * The IPO (quant-company-building v1.7 section 5.1, Phase 4 B1). A founder who passes the eligibility rules requests an IPO.
 * The price is 0.9 x the latest filed V_engine per post-IPO share (the engine prices it, not the book). The one-day book
 * takes subscriptions from accounts outside the owner set and at least seven days old. At the start of the next day the
 * book allocates pro rata, at most 5% of the float per buyer, and only what each buyer can pay. The unallocated float goes
 * to the NPC book. Then the company lists through the engine (listCompanyStock), the founder's shares are locked for 168 gd
 * (grantLockedShares), and the NPC pools' shares follow the same lockup.
 *
 * Money: buyers pay the company, a transfer between real parties. The NPC book's shares are paid as a booked faucet (the
 * world creates that money), so the conservation test counts it. No account is credited for the shares themselves. The
 * underwriting fee (5% of the gross proceeds, §5.1) is a sink: it leaves the company's books and is counted as one.
 *
 * The founder's daily sell cap (2% of the shares outstanding a game day, §5.1, §6.1) is set in the engine at listing, for
 * the founder's account; the engine enforces it on window sells and plan fills together.
 */

import { COMPANY } from '@/content/company';
import { rankIndex } from '@/content/lifestyle';
import { grantLockedShares, listCompanyStock, openAccount, restrictionsOf, setSellCap, type AssetDef, type WorldState } from '@/engine';
import { TPD, notify, pushWire, today } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import { isLinkedAccount, linkedAccounts } from '../collusion';
import { post } from './books';
import { textProvider } from '../text';
import { syncWindow } from './insiders';
import { headcountBand } from './signals';
import type { Company, CompanyReject, FilingPublic, IpoBook } from './types';

export const treasuryIdOf = (companyId: string): string => `co:${companyId}:treasury`;
export const poolIdOf = (companyId: string): string => `co:${companyId}:pool`;
export const npcBookIdOf = (assetId: string): string => `npc:book:${assetId}`;
export const founderKeyOf = (playerId: string): string => `founder:${playerId}`;

/** A conviction that bars an IPO: the fund conviction ledger (funds.convicted) within the window. */
export function recentConviction(g: GameState, playerId: string): boolean {
  const at = g.funds?.convicted?.[playerId];
  return at !== undefined && g.market.tick - at < COMPANY.ipo.convictionDays * TPD;
}

/** Eligibility on the filed numbers (§5, Ledger §12 #2), the first failing rule is the refusal. */
export function ipoEligibility(g: GameState, c: Company, playerId: string): CompanyReject | null {
  const I = COMPANY.ipo;
  if (c.ownerId !== playerId) return { code: 'notFounder' };
  if (c.listed) return { code: 'alreadyListed' };
  if (c.ipo) return { code: 'ipoAlreadyRequested' };
  if (c.filings.length < I.minFiledQuarters) return { code: 'ipoFilings' };
  if (!(c.filedV >= I.minValue)) return { code: 'ipoValue' };
  if (rankIndex(g.players[playerId]?.rankId ?? 'R0') < rankIndex(I.minRank)) return { code: 'ipoRank' };
  if (recentConviction(g, playerId)) return { code: 'ipoConviction' };
  if (c.covenant.status !== 'ok') return { code: 'ipoCovenant' };
  return null;
}

/** The accounts a founder controls or is linked to (the owner group: alliances, devices, gifts and mirrored trades, §6.1): they cannot buy in the book. */
export function allianceSetOf(g: GameState, c: Company): string[] {
  return linkedAccounts(g, c.ownerId);
}

/** Round every holder's shares to whole shares (the engine's quantities are whole), and keep c.shares as their sum. */
export function normalizeCapTable(c: Company): void {
  let total = 0;
  for (const k of Object.keys(c.capTable)) {
    c.capTable[k] = Math.round(c.capTable[k]!);
    total += c.capTable[k]!;
  }
  c.shares = total;
}

/** Request the IPO: fixes the price from the latest filing and opens the one-day book (it lists at the start of day + 1). */
export function requestIpo(g: GameState, playerId: string, c: Company, floatPct: number, out: StepOutput | null): { ok: true; value: Record<string, unknown> } | { ok: false; reject: CompanyReject } {
  const bad = ipoEligibility(g, c, playerId);
  if (bad) return { ok: false, reject: bad };
  const I = COMPANY.ipo;
  if (!(Number.isFinite(floatPct) && floatPct >= I.floatMin && floatPct <= I.floatMax)) {
    return { ok: false, reject: { code: 'ipoFloatOutOfBand', min: I.floatMin, max: I.floatMax } };
  }
  normalizeCapTable(c);
  const day = today(g);
  const ipoShares = Math.round((c.shares * floatPct) / (1 - floatPct));
  const sharesPost = c.shares + ipoShares;
  const price = ((1 - I.discount) * c.filedV) / sharesPost;
  const book: IpoBook = { requestDay: day, listDay: day + I.bookDays, floatPct, price, ipoShares, sharesPost, orders: {} };
  c.ipo = book;
  notify(g, out, playerId, { kind: 'system', tone: 'brass', text: `${c.name}: the IPO book is open at $${price.toFixed(2)} a share.`, msg: { key: 'company.note.ipoOpen', vars: { name: c.name, price: price.toFixed(2) } } });
  return { ok: true, value: { price, ipoShares, sharesPost, listDay: book.listDay } };
}

/** A subscription to the book. Only on the request day (the book is one game day). Owner-set accounts and young ones are refused. */
export function orderIpo(g: GameState, playerId: string, c: Company, shares: number): { ok: true; value: Record<string, unknown> } | { ok: false; reject: CompanyReject } {
  if (!c.ipo || today(g) >= c.ipo.listDay || today(g) < c.ipo.requestDay) return { ok: false, reject: { code: 'ipoBookClosed' } };
  if (isLinkedAccount(g, c.ownerId, playerId)) return { ok: false, reject: { code: 'ipoOwnerSet' } };
  const p = g.players[playerId];
  if (!p || !g.market.accounts[playerId]) return { ok: false, reject: { code: 'unknownCompany' } };
  if (g.market.tick - p.joinedTick < COMPANY.ipo.minAccountAgeDays * TPD) {
    return { ok: false, reject: { code: 'ipoAccountTooYoung', minDays: COMPANY.ipo.minAccountAgeDays } };
  }
  if (!Number.isInteger(shares) || shares <= 0) return { ok: false, reject: { code: 'ipoBadShares' } };
  c.ipo.orders[playerId] = (c.ipo.orders[playerId] ?? 0) + shares;
  return { ok: true, value: { requested: c.ipo.orders[playerId], cap: Math.floor(COMPANY.ipo.allocCapOfFloat * c.ipo.ipoShares) } };
}

/**
 * Test seam (dev and tests only, through the server's admin route, like admin.age): a founder's unlisted company meets the
 * two filed-history rules of the IPO without the years of filings they stand for. The filed quarters are padded to the
 * minimum, each new record one quarter after the last (a zero record when the company has not filed yet), and the filed
 * value is raised to the minimum. Every other rule, the request, the book and the listing stay the world's own. The
 * command is deterministic, so a replayed log rebuilds the same world.
 */
export function adminIpoReady(g: GameState, playerId: string): CommandResult {
  const c = g.companies ? Object.values(g.companies.companies).find((x) => x.ownerId === playerId && !x.listed && !x.ipo) : undefined;
  if (!c) return { ok: false, error: 'no unlisted company without an IPO book for this player' };
  const day = today(g);
  while (c.filings.length < COMPANY.ipo.minFiledQuarters) {
    const n = c.filings.length;
    const last = c.filings[n - 1];
    const base: FilingPublic = last ?? {
      quarter: 0,
      periodCloseDay: day,
      filedDay: day,
      hash: `seam-${c.id}-0`,
      income: { revUnrelated: 0, relatedPartyIncome: 0, cogs: 0, opex: 0, ebitda: 0, netIncome: 0, niAdj: 0, interest: 0 },
      balance: { cash: c.cash, receivables: 0, inventory: 0, ppe: c.ppe, debt: 0, equity: c.paidIn + c.retained, retainedEarnings: c.retained },
      cashFlow: { ocf: 0, capex: 0, capexMaint: 0, fcf: 0, dividends: 0, buybacks: 0 },
      headcountBand: headcountBand(1),
      backlog: 0,
      backlogContribution: 0,
      unitCost: 0,
      matUnit: 0,
      inputIndex: 0,
      backlogReversal: { nonConversion: 0, baseRate: 0, excessLift: 0, repayment: 0 },
    };
    c.filings.push({ ...base, quarter: last ? base.quarter + 1 : 0, hash: `seam-${c.id}-${n}` });
  }
  c.filedV = Math.max(c.filedV, COMPANY.ipo.minValue);
  return { ok: true };
}

/**
 * The allocation (§5.1, N8): each buyer's request, at most 5% of the float and at most what their cash covers at the price,
 * then pro rata when the total is more than the float. Sorted by account id, so the result is deterministic.
 */
export function allocateIpo(g: GameState, ipo: IpoBook, excluded: Set<string>): Record<string, number> {
  const cap = Math.floor(COMPANY.ipo.allocCapOfFloat * ipo.ipoShares);
  const want: Record<string, number> = {};
  let total = 0;
  for (const id of Object.keys(ipo.orders).sort()) {
    if (excluded.has(id)) continue;
    const cash = g.market.accounts[id]?.cash ?? 0;
    const q = Math.min(ipo.orders[id]!, cap, Math.floor(cash / ipo.price));
    if (q > 0) {
      want[id] = q;
      total += q;
    }
  }
  const out: Record<string, number> = {};
  for (const id of Object.keys(want)) out[id] = total <= ipo.ipoShares ? want[id]! : Math.floor((want[id]! * ipo.ipoShares) / total);
  return out;
}

/** Add shares to an engine account without a lockup (a buyer's or the NPC book's position). The cash does not move here. */
export function addShares(s: WorldState, accountId: string, assetId: string, qty: number, avgCost: number): WorldState {
  const acct = s.accounts[accountId];
  if (!acct) throw new Error(`addShares: no account ${accountId}`);
  const pos = acct.positions[assetId];
  const q0 = pos?.qty ?? 0;
  const newQty = q0 + qty;
  const avg = ((pos?.avgCost ?? 0) * q0 + avgCost * qty) / newQty;
  const accounts = { ...s.accounts, [accountId]: { ...acct, positions: { ...acct.positions, [assetId]: { qty: newQty, avgCost: avg, realizedPnl: pos?.realizedPnl ?? 0 } } } };
  return { ...s, accounts };
}

/** The engine asset of a listing: the sector peer's template, with the company's vol, spread and ADV (§5.1). */
export function listingDef(s: WorldState, c: Company, ipo: IpoBook, assetId: string, day: number): AssetDef {
  const I = COMPANY.ipo;
  const stocks = s.config.assets.filter((a) => a.assetClass === 'stock' && !a.delisted);
  const peer = stocks.find((a) => a.sector === c.sector && a.listed !== false) ?? stocks[0];
  if (!peer) throw new Error('listingDef: no stock to take a template from');
  const floatCap = ipo.ipoShares * ipo.price;
  const vol = peer.vol * (1 + I.volSmallCapSlope * Math.max(0, 1 - floatCap / I.volSmallCapRef));
  const spreadBps = Math.min(I.spreadMax, Math.max(I.spreadMin, I.spreadBase + I.spreadScale / Math.sqrt(floatCap / 1_000_000)));
  const {
    dividendYield: _dy, seasonal: _se, duration: _du, yieldKey: _yk, carrySpread: _cs, blurb: _bl, delisted: _de, listed: _li, ...rest
  } = peer;
  void _dy; void _se; void _du; void _yk; void _cs; void _bl; void _de; void _li;
  return {
    ...rest,
    id: assetId,
    name: c.name,
    assetClass: 'stock',
    sector: peer.sector,
    initialPrice: ipo.price,
    sharesOutstanding: ipo.sharesPost,
    vol,
    drift: 0,
    jumpsPerYear: 0,
    spreadBps,
    advNotional: I.advAtListing * floatCap,
    qtyStep: 1,
    listed: true,
    listedDay: day,
    valueSource: 'company',
    companyPrintShare: 1,
    // the other side of every fill is the NPC book, which holds the float (X11): a buy takes only shares the book holds
    supplyAccount: npcBookIdOf(assetId),
    // the founder is the stock's insider: the funds' insider cap and filing read it (O-14)
    insiderId: c.ownerId,
    blurb: `${c.name}, a company listed on the exchange.`,
  };
}

/**
 * Lists the company at the start of its listing day: allocates the book, moves the cash, appends the stock through the
 * engine, grants the founder and pool shares under the lockup and the NPC book its float, then syncs the window.
 */
export function listIpo(g: GameState, c: Company, out: StepOutput | null): void {
  const ipo = c.ipo;
  if (!ipo) return;
  const w = g.companies!;
  const day = today(g);
  const assetId = `CO${c.id.replace(/\D/g, '')}`;
  const excluded = new Set(allianceSetOf(g, c));
  for (const id of Object.keys(ipo.orders)) {
    const p = g.players[id];
    if (p && g.market.tick - p.joinedTick < COMPANY.ipo.minAccountAgeDays * TPD) excluded.add(id);
  }
  const alloc = allocateIpo(g, ipo, excluded);
  const sold = Object.values(alloc).reduce((a, b) => a + b, 0);
  const npcShares = ipo.ipoShares - sold;
  const P = ipo.price;
  const def = listingDef(g.market, c, ipo, assetId, day);
  const avgCost = (c.paidIn + c.retained) / c.shares;

  let s = g.market;
  const treasuryId = treasuryIdOf(c.id);
  const poolId = poolIdOf(c.id);
  const bookId = npcBookIdOf(assetId);
  for (const id of [treasuryId, poolId, bookId]) if (!s.accounts[id]) s = openAccount(s, id, 0);
  s = listCompanyStock(s, def, P, c.filedV / ipo.sharesPost);
  s = { ...s, restrictions: setSellCap(restrictionsOf(s), assetId, c.ownerId, Math.floor(COMPANY.insiders.sellCapPct * ipo.sharesPost)) };

  const lockUntil = day + COMPANY.ipo.lockupDays;
  const founderQty = c.capTable[founderKeyOf(c.ownerId)] ?? 0;
  if (founderQty > 0) s = grantLockedShares(s, c.ownerId, assetId, founderQty, avgCost, lockUntil);
  const poolQty = Object.keys(c.capTable).filter((k) => k !== founderKeyOf(c.ownerId)).reduce((x, k) => x + c.capTable[k]!, 0);
  if (poolQty > 0) s = grantLockedShares(s, poolId, assetId, poolQty, avgCost, lockUntil);
  if (npcShares > 0) s = addShares(s, bookId, assetId, npcShares, P);

  let buyerCash = 0;
  for (const id of Object.keys(alloc).sort()) {
    const q = alloc[id]!;
    if (q <= 0) continue;
    s = addShares(s, id, assetId, q, P);
    const acct = s.accounts[id]!;
    const cost = q * P;
    s = { ...s, accounts: { ...s.accounts, [id]: { ...acct, cash: acct.cash - cost } } };
    buyerCash += cost;
  }
  g.market = s;

  // the company receives the buyers' money (a transfer) and the NPC book's shares (a booked faucet), less the underwriting
  // fee on that gross (a sink, booked as one)
  post(w, c, day, 'ipo', buyerCash, true);
  post(w, c, day, 'ipo', npcShares * P);
  post(w, c, day, 'underwriting', -COMPANY.ipo.underwritingFee * ipo.ipoShares * P);

  c.listed = { assetId, ipoDay: day, sharesOut: ipo.sharesPost, floatShares: ipo.ipoShares, floatCap: ipo.ipoShares * P };
  c.shares = ipo.sharesPost;
  c.capTable[`float:${assetId}`] = ipo.ipoShares;
  c.treasuryId = treasuryId;
  if (c.consensus) c.consensus.lnV = Math.log(c.filedV / ipo.sharesPost);
  c.ipo = null;
  syncWindow(g, c);
  notify(g, out, c.ownerId, { kind: 'system', tone: 'brass', text: `${c.name} is listed as ${assetId} at $${P.toFixed(2)}. Your shares are locked for ${COMPANY.ipo.lockupDays} game days.`, msg: { key: 'company.note.listed', vars: { name: c.name, ticker: assetId, price: P.toFixed(2), days: COMPANY.ipo.lockupDays } } });
  pushWire(g, out, {
    kind: 'listing', tag: 'IPO', tone: 'brass', text: `${c.name} lists as ${assetId} at $${P.toFixed(2)}`, assetId,
    msg: textProvider.newsroom({ kind: 'priced', id: `${day}:${assetId}:priced`, name: c.name, ticker: assetId, price: P }),
  });
}
