import { earningsInfo, type Side } from '@/engine';
import { TPD, priceOf } from './core';
import { say } from './say';
import { rosterOf } from './company/insiders';
import type { CompanyWorld } from './company/types';
import type { GameState, StepOutput } from './types';

/**
 * Insider tips from crime (M16 v1, specs/quant-rumors.md, lead-phase6.md 6C). A successful session (a planted hidden session)
 * against a covered insider of a listed company hands the attacker a tip about that company's next earnings report. A tip is
 * always true: its claim is the sign of the report's surprise, which the engine draws at the analyst preview. The tip is queued
 * at the session and delivered privately once the surprise is locked (the preview, five game days before the report). It is
 * a NON-PUBLIC card: the claim and the report day are shown, never the outcome, and nothing says the claim is right.
 *
 * Trades on a tip are flagged when placed: an order on the claim's side, after the tip and before the report, adds surveillance
 * points to the trader (ECA, eca.ts). Rumors (the engine's public catalyst rumors) are never flagged.
 */

/** Surveillance points for a flagged trade at full size (quant-rumors / ROADMAP 2.5): 40 × size factor. */
export const TIP_FLAG_POINTS = 40;
/** A trade counts as full size at three times the player's median trade (ROADMAP 2.5). */
export const SIZE_CAP_MULT = 3;
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
  /** the listed company the tip concerns */
  companyId: string;
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
  qty: number;
  price: number;
  points: number;
  /** a tip flag is always before the reveal (only orders placed after the tip tick and before the reveal count) */
  tradedBeforeReveal: true;
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
 * Called after a planted session (cyber.ts plantSession / plantCrewSession are the caller's). A successful session on a covered
 * insider of a listed stock queues a tip for the attacker. Worlds without catalysts or company stock queue nothing.
 */
export function queueInsiderTip(g: GameState, attackerId: string, victimId: string): void {
  if (!g.market.config.catalysts) return;
  const ins = listedInsiderOf(g, victimId);
  if (!ins || !g.players[attackerId] || g.players[attackerId]!.npc) return;
  const t = tipsOf(g);
  if (t.pending.some((p) => p.playerId === attackerId && p.assetId === ins.assetId)) return;
  t.seq++;
  t.pending.push({ id: `pt${t.seq}`, playerId: attackerId, assetId: ins.assetId, companyId: ins.companyId, tick: g.market.tick });
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
      revealsTick: info.day * TPD + 1, companyId: p.companyId,
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
 * Flags a placed order that trades on a tip (the claim's side, after the tip, before the report). Returns the surveillance points
 * it adds (0 when nothing is flagged). Called only for an accepted order, and only for an insider tip (every tip is one).
 */
export function flagTipTrade(g: GameState, pid: string, assetId: string, side: Side, qty: number, tick: number): number {
  const tips = openTipsFor(g, pid, assetId, tick);
  if (tips.length === 0) return 0;
  const aligned = tips.find((x) => (x.claim === 'up' && side === 'buy') || (x.claim === 'down' && side === 'sell'));
  if (!aligned) return 0;
  const price = priceOf(g, assetId);
  const notional = qty * price;
  const sizeF = Math.min(1, notional / (SIZE_CAP_MULT * medianNotional(g, pid, notional)));
  const points = TIP_FLAG_POINTS * sizeF;
  const t = tipsOf(g);
  t.flags.push({ playerId: pid, tipId: aligned.id, assetId, tick, side, qty, price, points, tradedBeforeReveal: true });
  if (t.flags.length > FLAGS_KEEP) t.flags.splice(0, t.flags.length - FLAGS_KEEP);
  return points;
}

/** The tip trail for the regulator: did this account ever receive a tip on the asset. */
export function receivedTip(g: GameState, pid: string, assetId: string): boolean {
  return (g.tips?.received[`${pid}|${assetId}`] ?? 0) > 0;
}
