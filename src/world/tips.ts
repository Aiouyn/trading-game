import { earningsInfo, type Side } from '@/engine';
import { keyedRng, TPD, priceOf } from './core';
import { ECA_TUNE } from './eca-tune';
import { say } from './say';
import { rosterOf } from './company/insiders';
import type { CompanyWorld } from './company/types';
import { managedBy } from './funds/state';
import type { CommandResult, GameState, StepOutput } from './types';

/**
 * Insider tips from crime (M16 v1, specs/quant-rumors.md, lead-phase6.md 6C). A successful session (a planted hidden session)
 * against a covered insider of a listed company, or against a rival fund, hands the attacker a tip about a listed stock's next
 * earnings report. A tip is always true: its claim is the sign of the report's surprise, which the engine draws at the analyst
 * preview. The tip is queued at the session and delivered privately once the surprise is locked (the preview, five game days
 * before the report). It is a NON-PUBLIC card: the claim and the report day are shown, never the outcome, and nothing says the
 * claim is right.
 *
 * Trades on a tip are flagged when placed, by every route a player can trade through: a manual order, a reduce-only close, a
 * fund the player manages, and a lab model order (eca.ts noteOrderPlaced). A flagged trade adds surveillance points to the
 * trader (ECA, eca.ts). A trade that only reduces a position the player held before the tip is not flagged (quant-rumors.md).
 * Rumors (the engine's public catalyst rumors) are never flagged.
 */

/** A flagged trade's points are the base (eca-tune.ts tipBase) times the log size factor (R-6C-3, tipSizeFactor). */
/** The size factor is capped at this (a trade 100 times the median scores five times the base). */
export const TIP_SIZE_CAP = 5;
/** The size factor's floor: a flagged trade always scores at least this share of the base (review repair: no zero-point trade). */
export const TIP_SIZE_FLOOR = 0.25;
/** Tips kept in the save; the oldest go first. */
const TIPS_KEEP = 60;
const FLAGS_KEEP = 200;
const PENDING_KEEP = 50;
const NOTIONAL_KEEP = 30;

export interface InsiderTip {
  id: string;
  tick: number;
  playerId: string;
  assetId: string;
  claim: 'up' | 'down';
  /** always true for an insider tip; kept in the save, never shown before the report */
  truth: true;
  insider: true;
  source: 'insider';
  /** the tick of the earnings print (the reveal) */
  revealsTick: number;
  /** the listed company the tip concerns, or `rival:<fundId>` for a tip from a session on a rival fund */
  companyId: string;
  /** the shares the player controls in the asset at delivery (own account plus a managed fund); optional for older saves */
  heldAtTip?: number;
  /** the notional flagged on this tip so far (all its flagged trades, cumulative; review repair, splitting); optional for older saves */
  flaggedNotional?: number;
  /** the points this tip has scored so far (the running maximum of tipBase x size factor); optional for older saves */
  scoredPts?: number;
}

export interface PendingTip {
  id: string;
  playerId: string;
  assetId: string;
  companyId: string;
  tick: number;
}

export interface TipFlag {
  playerId: string;
  tipId: string;
  assetId: string;
  tick: number;
  side: Side;
  /** the flagged quantity (the order less any part that reduces a position held before the tip) */
  qty: number;
  price: number;
  points: number;
  /** a tip flag is always before the reveal (only orders placed after the tip tick and before the reveal count) */
  tradedBeforeReveal: true;
  /** the order the flag is on, so its fills can be matched to the flagged part (FIFO lots, eca.ts); optional for older saves */
  orderId?: string;
  /** the flagged quantity already filled (the FIFO tip share, claimTipQty) */
  filled?: number;
}

export interface TipState {
  seq: number;
  tips: InsiderTip[];
  pending: PendingTip[];
  flags: TipFlag[];
  /** tips ever received per `playerId|assetId` (the trail the regulator can find) */
  received: Record<string, number>;
  /** notionals of each account's recent trades, newest last (the median for the size factor) */
  notionals: Record<string, number[]>;
}

export function tipsOf(g: GameState): TipState {
  return (g.tips ??= { seq: 0, tips: [], pending: [], flags: [], received: {}, notionals: {} });
}

/** The listed company whose insider roster holds `pid` (covered accounts: founder, treasury, linked players, 10% holders). */
export function listedInsiderOf(g: GameState, pid: string): { companyId: string; assetId: string } | null {
  const w = g.companies as CompanyWorld | undefined;
  if (!w) return null;
  for (const c of Object.values(w.companies).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!c.listed) continue;
    if (rosterOf(g, c).includes(pid)) return { companyId: c.id, assetId: c.listed.assetId };
  }
  return null;
}

/** The asset index for an asset id in the market config (the engine's per-asset state is indexed the same way). */
function assetIndex(g: GameState, assetId: string): number {
  return g.market.config.assets.findIndex((d) => d.id === assetId);
}

/**
 * The shares a player controls in an asset: the player's own account plus the custody account of a fund the player manages.
 * A trade through either route moves this quantity, so the tip rules read the same position on every route.
 */
export function controlledQty(g: GameState, pid: string, assetId: string): number {
  let q = g.market.accounts[pid]?.positions[assetId]?.qty ?? 0;
  const f = managedBy(g, pid);
  if (f) q += g.market.accounts[f.accountId]?.positions[assetId]?.qty ?? 0;
  return q;
}

/**
 * Called after a planted session (cyber.ts plantSession / plantCrewSession are the caller's). A successful session on a covered
 * insider of a listed stock queues a tip for the attacker. Worlds without catalysts or company stock queue nothing.
 */
export function queueInsiderTip(g: GameState, attackerId: string, victimId: string): void {
  if (!g.market.config.catalysts) return;
  const ins = listedInsiderOf(g, victimId);
  if (!ins || !g.players[attackerId] || g.players[attackerId]!.npc) return;
  queuePending(g, attackerId, ins.assetId, ins.companyId);
}

/**
 * Called after a planted session on a rival fund (rivalCrews.ts attackFund). The rival's research points at one listed stock
 * whose report is ahead (a keyed pick, so a replay agrees).
 */
export function queueRivalTip(g: GameState, attackerId: string, fundId: string): void {
  if (!g.market.config.catalysts) return;
  if (!g.players[attackerId] || g.players[attackerId]!.npc) return;
  const stocks = g.market.config.assets
    .filter((d) => d.assetClass === 'stock' && d.listed !== false && !d.delisted && earningsInfo(g.market, d.id) !== null)
    .map((d) => d.id)
    .sort();
  if (stocks.length === 0) return;
  const pick = keyedRng(g, `tip:rival:${attackerId}:${fundId}:${g.market.tick}`).uniform();
  queuePending(g, attackerId, stocks[Math.floor(pick * stocks.length)]!, `rival:${fundId}`);
}

function queuePending(g: GameState, attackerId: string, assetId: string, companyId: string): void {
  const t = tipsOf(g);
  if (t.pending.some((p) => p.playerId === attackerId && p.assetId === assetId)) return;
  t.seq++;
  t.pending.push({ id: `pt${t.seq}`, playerId: attackerId, assetId, companyId, tick: g.market.tick });
  if (t.pending.length > PENDING_KEEP) t.pending.splice(0, t.pending.length - PENDING_KEEP);
}

/**
 * Once a day: deliver each pending tip whose report surprise is now locked (the analyst preview) and still ahead. A tip is
 * dropped when its report has passed. The claim is the sign of the surprise, so the tip is always true.
 */
export function tipsDay(g: GameState, out: StepOutput | null): void {
  if (!g.tips?.pending.length) return;
  const t = tipsOf(g);
  const keep: PendingTip[] = [];
  for (const p of t.pending) {
    const info = earningsInfo(g.market, p.assetId);
    const i = assetIndex(g, p.assetId);
    const a = i >= 0 ? g.market.assets[i] : undefined;
    if (!info || !a || info.day * TPD + 1 <= g.market.tick) continue; // no report ahead: the tip lapses
    if (a.surprise === null || a.surprise === undefined) { keep.push(p); continue; }
    t.seq++;
    const tip: InsiderTip = {
      id: `tp${t.seq}`, tick: g.market.tick, playerId: p.playerId, assetId: p.assetId,
      claim: a.surprise >= 0 ? 'up' : 'down', truth: true, insider: true, source: 'insider',
      revealsTick: info.day * TPD + 1, companyId: p.companyId, heldAtTip: controlledQty(g, p.playerId, p.assetId),
    };
    t.tips.push(tip);
    if (t.tips.length > TIPS_KEEP) t.tips.splice(0, t.tips.length - TIPS_KEEP);
    const rk = `${p.playerId}|${p.assetId}`;
    t.received[rk] = (t.received[rk] ?? 0) + 1;
    const ticker = p.assetId;
    say(g, out, p.playerId, 'tip', 'brass', { key: tip.claim === 'up' ? 'tip.arrived.up' : 'tip.arrived.down', vars: { ticker, days: Math.max(1, info.daysAway) } });
  }
  t.pending = keep;
}

/** The tip the account holds on an asset that is still open (after the tip, before its report). */
function openTipsFor(g: GameState, pid: string, assetId: string, tick: number): InsiderTip[] {
  const t = g.tips;
  if (!t) return [];
  return t.tips.filter((x) => x.playerId === pid && x.assetId === assetId && tick >= x.tick && tick < x.revealsTick);
}

/** The median of the account's recent notionals before this trade, or a floor when it has none (the size factor's base). */
export function medianNotional(g: GameState, pid: string, notional: number): number {
  const list = g.tips?.notionals[pid] ?? [];
  if (list.length < 3) return Math.max(500, (g.players[pid]?.netWorth ?? 0) * 0.02);
  const s = [...list].sort((a, b) => a - b);
  const m = s[Math.floor(s.length / 2)]!;
  return m > 0 ? m : Math.max(notional, 1);
}

/** Records a placed order's notional for the size factor (the account's last NOTIONAL_KEEP trades). */
export function noteNotional(g: GameState, pid: string, notional: number): void {
  if (!(notional > 0)) return;
  const t = tipsOf(g);
  const list = (t.notionals[pid] ??= []);
  list.push(notional);
  if (list.length > NOTIONAL_KEEP) list.splice(0, list.length - NOTIONAL_KEEP);
}

/**
 * R-6C-3: the size factor of a flagged trade, log-shaped against the account's median trade. A trade at the median scores 1, ten
 * times the median scores 3, and the factor stays between TIP_SIZE_FLOOR (a small trade still scores) and TIP_SIZE_CAP.
 */
export function tipSizeFactor(notional: number, median: number): number {
  if (!(notional > 0) || !(median > 0)) return 0;
  return Math.min(TIP_SIZE_CAP, Math.max(TIP_SIZE_FLOOR, 1 + 2 * Math.log10(notional / median)));
}

/**
 * Flags a placed order that trades on a tip (the claim's side, after the tip, before the report). `posBefore` is the controlled
 * position before the order (controlledQty, captured by the caller before it placed the order). The part of the order that
 * reduces a position the player held before the tip (a long for a "down" claim, a short for an "up" claim) is not flagged. Returns
 * the surveillance points it adds (0 when nothing is flagged). Only accepted orders call this. `orderId` ties the flag to the
 * order's fills (claimTipQty).
 */
export function flagTipTrade(
  g: GameState, pid: string, assetId: string, side: Side, qty: number, tick: number, posBefore: number, orderId?: string,
): number {
  if (!(qty > 0)) return 0;
  const tips = openTipsFor(g, pid, assetId, tick);
  if (tips.length === 0) return 0;
  const aligned = tips.find((x) => (x.claim === 'up' && side === 'buy') || (x.claim === 'down' && side === 'sell'));
  if (!aligned) return 0;
  const pre = aligned.heldAtTip ?? 0;
  const exempt = aligned.claim === 'down'
    ? Math.min(qty, Math.max(0, Math.min(pre, posBefore)))
    : Math.min(qty, Math.max(0, Math.min(-pre, -posBefore)));
  const flagQty = qty - exempt;
  if (flagQty <= 1e-9) return 0;
  const price = priceOf(g, assetId);
  // review repair (splitting): the size is scored on the tip's cumulative flagged notional, so one position split into many orders
  // scores what one order of the same total scores. The tip's points are the running maximum of tipBase x size factor.
  aligned.flaggedNotional = (aligned.flaggedNotional ?? 0) + flagQty * price;
  const cum = aligned.flaggedNotional;
  const target = ECA_TUNE.tipBase * tipSizeFactor(cum, medianNotional(g, pid, cum));
  const points = Math.max(0, target - (aligned.scoredPts ?? 0));
  aligned.scoredPts = Math.max(aligned.scoredPts ?? 0, target);
  const t = tipsOf(g);
  t.flags.push({
    playerId: pid, tipId: aligned.id, assetId, tick, side, qty: flagQty, price, points, tradedBeforeReveal: true,
    ...(orderId ? { orderId, filled: 0 } : {}),
  });
  if (t.flags.length > FLAGS_KEEP) t.flags.splice(0, t.flags.length - FLAGS_KEEP);
  return points;
}

/**
 * The part of a fill that is the flagged (tip) quantity of its order: the flags of that order take the fill up to their unfilled
 * flagged quantity, in placement order (the exempt part of an order is never flagged, so it is never a tip share). Returns the
 * tip quantity of this fill, which the FIFO lots carry (eca.ts).
 */
export function claimTipQty(g: GameState, orderId: string, qty: number): number {
  let left = qty;
  let got = 0;
  for (const f of g.tips?.flags ?? []) {
    if (f.orderId !== orderId || left <= 1e-9) continue;
    const room = Math.max(0, f.qty - (f.filled ?? 0));
    const take = Math.min(room, left);
    if (take <= 0) continue;
    f.filled = (f.filled ?? 0) + take;
    got += take;
    left -= take;
  }
  return got;
}

/** The tip trail for the regulator: did this account ever receive a tip on the asset. */
export function receivedTip(g: GameState, pid: string, assetId: string): boolean {
  return (g.tips?.received[`${pid}|${assetId}`] ?? 0) > 0;
}

/**
 * e2e seed (admin only, behind ADMIN_TOKEN): an insider tip on a stock whose report is ahead, delivered now. A real tip waits for
 * the report's surprise to be locked; this seed locks it at once (a keyed draw, so a replay agrees) and then runs the same
 * delivery as tipsDay, so the card and the flags are the game's own. Refused when there is no report ahead.
 */
export function adminSeedTip(g: GameState, pid: string, asked: string, out: StepOutput | null): CommandResult {
  // an empty asset picks the first stock with a report ahead (the seed is for tests; the game never picks for a player)
  const assetId = asked || (g.market.config.assets.find((d) => d.assetClass === 'stock' && earningsInfo(g.market, d.id) !== null)?.id ?? '');
  const idx = assetIndex(g, assetId);
  const info = earningsInfo(g.market, assetId);
  if (!g.players[pid] || idx < 0 || !info || info.day * TPD + 1 <= g.market.tick) return { ok: false, error: 'no report ahead on that stock' };
  const a = g.market.assets[idx]!;
  if (a.surprise === null || a.surprise === undefined) {
    a.surprise = keyedRng(g, `admin.tip:${assetId}:${info.day}`).normal();
    // a consensus set here stops the analyst preview from drawing a new surprise later (the tip must stay true)
    if (a.consensus === null || a.consensus === undefined) a.consensus = a.surprise >= 0 ? 0.2 : -0.2;
  }
  const t = tipsOf(g);
  t.pending.push({ id: `pt${t.seq + 1}`, playerId: pid, assetId, companyId: 'admin', tick: g.market.tick });
  tipsDay(g, out);
  return { ok: true, data: { assetId } };
}
