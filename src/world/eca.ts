import type { Fill, Side, StepEvent } from '@/engine';
import type { Msg } from '@/i18n';
import { TPD, keyedRng, priceOf, today } from './core';
import { say } from './say';
import { TRIBUNAL_BAR, regulatorVerdict } from './court';
import { fundByAccount, isFundAccount } from './funds/state';
import { claimTipQty, flagTipTrade, medianNotional, noteNotional, receivedTip } from './tips';
import { ECA_TUNE } from './eca-tune';
import type { CompanyWorld } from './company/types';
import type { CommandResult, GameState, StepOutput } from './types';

/**
 * The ECA, the market regulator (M16 v2, ROADMAP 2.5, 03 §10.2). Per account and asset it keeps a surveillance score in [0, 100]:
 *  - points from the company module's insider surveillance (Phase 4: window and plan attempts, related trades out of band);
 *  - points from trades on a tip, scored when placed (tips.ts flagTipTrade, through noteOrderPlaced on every trading route);
 *  - points from abnormal pre-announcement trading: a right-side trade within two game days before a report that moves the
 *    stock by at least 3%. Points are 40 × size factor × timing factor (1 within a day, 0.5 at one to two days). A fund the
 *    player manages counts as the player's own trade when it is a manager order (a discretionary fill).
 * Each game day the score decays to 0.8 of the day before and adds the day's points (capped at 100).
 *
 * Thresholds (03 §10.2): a score at or above 60 for three game days opens an inquiry (a notice, and its evidence converts at
 * 10 to 20 points). An investigation starts at 80, or at 60 when the account received a tip on the asset. The investigation adds
 * 5 evidence a day while the score stays at 60, and the tip trail gives 30 evidence on half the investigation days for an
 * account that received a tip. An investigation or inquiry that stays under 60 for five game days closes quietly (and cannot
 * reopen for 20 game days). At 55 evidence the tribunal-lite (court.ts regulatorVerdict) decides. Nothing is shown before a
 * verdict: the letters give what happened, why, and what to do, and never the evidence or the outcome of the market.
 */

export const ECA = {
  inquiryDays: 3,
  investigationScore: 80,
  decay: 0.8,
  cap: 100,
  inquiryEvidenceMin: 10,
  inquiryEvidenceMax: 20,
  investigationPerDay: 5,
  trailChance: 0.5,
  trailPts: 30,
  tribunalBar: TRIBUNAL_BAR,
  quietDaysClose: 5,
  clearCooldownDays: 20,
  preWindowTicks: 2 * TPD,
  preMinMove: 0.03,
  preBasePts: 40,
  keepClosed: 60,
  /** all fines of one account in one season are at most 60% of its peak net worth (03 §1) */
  seasonCapPct: 0.6,
} as const;

/**
 * The regulator's counsel level at the tribunal (R-6C-4, the M30 counsel term: +0.25 logit a level, at most 0.75). The ECA staffs one
 * level of counsel for every tribunal it brings. The defence side (regulatorVerdict counsel.defence) has no purchase yet, so it is 0.
 */
export const ECA_REGULATOR_COUNSEL = 1;

export type EcaStage = 'inquiry' | 'investigation' | 'closed' | 'convicted' | 'cleared';

/** A letter from the ECA, in three parts (what happened, why, what to do). The keys go through en.json and fr.json. */
export interface EcaLetter {
  kind: 'notice' | 'investigation' | 'verdict';
  day: number;
  what: Msg;
  why: Msg;
  do: Msg;
}

export interface EcaInquiry {
  id: string;
  playerId: string;
  assetId: string;
  stage: EcaStage;
  openedDay: number;
  evidence: number;
  quietDays: number;
  /** tip-trail finds so far (the regulator's count, never shown) */
  trail: number;
  letters: EcaLetter[];
  fine?: number;
  disgorged?: number;
  /** the regulator's conviction probability at the verdict (regulator-side, never shown; the harness reads it) */
  p?: number;
}

export interface EcaRecentFill {
  tick: number;
  pid: string;
  side: Side;
  qty: number;
  notional: number;
}

/** The fines an account has paid in the current season (a chapter), for the repeat and season-cap rules (never shown). */
export interface EcaSeason {
  chapter: number;
  fines: number;
  convictions: number;
}

/**
 * A FIFO lot of an account on an asset (R-6C-2): `qty` is signed (negative is a short), `price` the fill price, and `tip` the part of
 * |qty| that is tip-flagged. The gain on the tipped share of a closed lot is what the regulator disgorges.
 */
export interface EcaLot {
  qty: number;
  price: number;
  tip: number;
}

export interface EcaState {
  seq: number;
  /** FIFO lots per `playerId|assetId` (R-6C-2); optional, older saves have none */
  lots?: Record<string, EcaLot[]>;
  /** the realized gain on the tipped share of the closed FIFO lots per `playerId|assetId` (disgorged at a conviction) */
  tipGain?: Record<string, number>;
  /** today's points per `playerId|assetId`, folded into the score at the day close */
  pts: Record<string, number>;
  /** the score per `playerId|assetId` after the last day close */
  score: Record<string, number>;
  /** consecutive day closes at or above the inquiry line */
  over: Record<string, number>;
  /** the first day a new inquiry may open again (after a clear or a verdict) */
  cool: Record<string, number>;
  /** the company insider points last folded, per player */
  insiderSeen: Record<string, number>;
  /** the open inquiry per key */
  open: Record<string, string>;
  inquiries: Record<string, EcaInquiry>;
  /** recent fills per asset, for the pre-announcement window */
  fills: Record<string, EcaRecentFill[]>;
  /** the season ledger per player (optional: older saves have none) */
  season?: Record<string, EcaSeason>;
}

export function ecaOf(g: GameState): EcaState {
  return (g.eca ??= { seq: 0, pts: {}, score: {}, over: {}, cool: {}, insiderSeen: {}, open: {}, inquiries: {}, fills: {} });
}

function keyOf(pid: string, assetId: string): string {
  return `${pid}|${assetId}`;
}

/** Adds surveillance points to an account on an asset (a flagged trade, or a scored pre-announcement trade). */
export function addEcaPoints(g: GameState, pid: string, assetId: string, points: number): void {
  if (!(points > 0) || !g.players[pid] || g.players[pid]!.npc) return;
  const e = ecaOf(g);
  const k = keyOf(pid, assetId);
  e.pts[k] = (e.pts[k] ?? 0) + points;
}

/**
 * Scores one order an account placed, on every route a player trades through (order.place, position.close, fund.trade, a lab
 * model order). `posBefore` is the controlled position before the order (tips.ts controlledQty). A tip trade adds its points; the
 * notional feeds the size median. Only accepted orders call this.
 */
export function noteOrderPlaced(
  g: GameState, pid: string, assetId: string, side: Side, qty: number, posBefore: number, orderId?: string,
): void {
  if (!g.players[pid] || g.players[pid]!.npc) return;
  addEcaPoints(g, pid, assetId, flagTipTrade(g, pid, assetId, side, qty, g.market.tick, posBefore, orderId));
  noteNotional(g, pid, qty * priceOf(g, assetId));
}

/**
 * Keeps the recent fills of each asset for the pre-announcement window (three game days, capped). A fund's fill counts for its
 * manager, and only when it is a manager order (a discretionary fill, not a forced wind-down sale).
 */
export function ecaFills(g: GameState, fills: Fill[]): void {
  if (fills.length === 0) return;
  const e = ecaOf(g);
  for (const f of fills) {
    let pid = f.playerId;
    if (isFundAccount(pid)) {
      const fund = fundByAccount(g, pid);
      if (!fund || !fund.managerOrders[f.orderId]) continue;
      pid = fund.managerId;
    }
    if (!g.players[pid] || g.players[pid]!.npc) continue;
    // the FIFO lots of the account (R-6C-2): the flagged part of the fill is the tip share of the lot it opens
    const sgn = f.side === 'buy' ? 1 : -1;
    applyLots(e, keyOf(pid, f.assetId), sgn * f.qty, f.price, claimTipQty(g, f.orderId, f.qty));
    const list = (e.fills[f.assetId] ??= []);
    list.push({ tick: f.tick, pid, side: f.side, qty: f.qty, notional: f.qty * f.price });
    if (list.length > 400) list.splice(0, list.length - 400);
  }
}

/**
 * Scores the abnormal pre-announcement trading when a report moves the stock by at least 3%. A fill counts when it is on the
 * right side of the move and falls within the two game days before the report. The fills of that asset are then spent.
 */
export function ecaEvents(g: GameState, events: StepEvent[]): void {
  const e = g.eca;
  if (!e) return;
  for (const ev of events) {
    if (ev.type !== 'earnings') continue;
    const list = e.fills[ev.assetId];
    if (!list || list.length === 0) continue;
    const move = ev.move;
    if (Math.abs(move) < ECA.preMinMove) { e.fills[ev.assetId] = list.filter((x) => x.tick >= ev.tick); continue; }
    const from = ev.tick - ECA.preWindowTicks;
    const keep: EcaRecentFill[] = [];
    for (const f of list) {
      if (f.tick < from) continue;
      if (f.tick >= ev.tick) { keep.push(f); continue; }
      const right = (f.side === 'buy' && move > 0) || (f.side === 'sell' && move < 0);
      if (right) {
        const timing = f.tick >= ev.tick - TPD ? 1 : 0.5;
        const size = Math.min(1, f.notional / (3 * medianNotional(g, f.pid, f.notional)));
        addEcaPoints(g, f.pid, ev.assetId, ECA.preBasePts * size * timing);
      }
    }
    e.fills[ev.assetId] = keep;
  }
}

/** The points an account's company insider record has gained since the last day close, on the listed stock of its company. */
function insiderDeltas(g: GameState): void {
  const w = g.companies as CompanyWorld | undefined;
  if (!w?.insider) return;
  const e = ecaOf(g);
  for (const pid of Object.keys(w.insider).sort()) {
    const rec = w.insider[pid]!;
    const last = e.insiderSeen[pid] ?? 0;
    const delta = rec.points >= last ? rec.points - last : rec.points;
    e.insiderSeen[pid] = rec.points;
    const assetId = rec.companyId ? w.companies[rec.companyId]?.listed?.assetId : undefined;
    if (delta > 0 && assetId) addEcaPoints(g, pid, assetId, delta);
  }
}

/**
 * Books a fill against the account's FIFO lots (R-6C-2). The fill first closes the opposite lots, oldest first; the realized gain on
 * each closed share is booked to the tip gain when that share was tip-flagged. The rest opens a new lot, whose tip share is the
 * flagged part of the fill (at most the remainder). `signed` is the fill's quantity (buy positive, sell negative).
 */
export function applyLots(e: EcaState, key: string, signed: number, price: number, tipQty: number): void {
  const lots = ((e.lots ??= {})[key] ??= []);
  let rem = signed;
  let gain = 0;
  while (Math.abs(rem) > 1e-9 && lots.length > 0 && Math.sign(lots[0]!.qty) === -Math.sign(rem)) {
    const lot = lots[0]!;
    const side = Math.sign(lot.qty);
    const m = Math.min(Math.abs(rem), Math.abs(lot.qty));
    const share = lot.tip * (m / Math.abs(lot.qty));
    gain += side * (price - lot.price) * share;
    lot.tip -= share;
    lot.qty = side * (Math.abs(lot.qty) - m);
    rem = Math.sign(rem) * (Math.abs(rem) - m);
    if (Math.abs(lot.qty) <= 1e-9) lots.shift();
  }
  if (Math.abs(rem) > 1e-9) lots.push({ qty: rem, price, tip: Math.min(Math.max(0, tipQty), Math.abs(rem)) });
  if (gain !== 0) {
    e.tipGain ??= {};
    e.tipGain[key] = (e.tipGain[key] ?? 0) + gain;
  }
}

/**
 * Review repair (hold to reveal, R-6C-2): at a verdict the tipped share of each open FIFO lot is marked to the verdict price. The
 * unrealized gain on it joins the realized pool (so the verdict disgorges it), and the tipped share takes the verdict price as its
 * basis, so a later close does not book the same gain again. Returns the gain marked (negative for a loss).
 */
export function markTipLots(e: EcaState, key: string, price: number): number {
  const lots = e.lots?.[key];
  if (!lots || lots.length === 0) return 0;
  let gain = 0;
  const out: EcaLot[] = [];
  for (const lot of lots) {
    const side = Math.sign(lot.qty);
    const t = Math.min(Math.max(0, lot.tip), Math.abs(lot.qty));
    if (t <= 1e-9) { out.push(lot); continue; }
    gain += side * (price - lot.price) * t;
    const rest = Math.abs(lot.qty) - t;
    if (rest > 1e-9) out.push({ qty: side * rest, price: lot.price, tip: 0 });
    out.push({ qty: side * t, price, tip: t });
  }
  e.lots![key] = out;
  if (gain !== 0) {
    e.tipGain ??= {};
    e.tipGain[key] = (e.tipGain[key] ?? 0) + gain;
  }
  return gain;
}

/** The realized gain on the tipped share of an account's closed FIFO lots on an asset, never below zero (R-6C-2). */
export function tipGainOf(g: GameState, pid: string, assetId: string): number {
  return Math.max(0, g.eca?.tipGain?.[keyOf(pid, assetId)] ?? 0);
}

/** The season ledger of an account: reset when the chapter (the 8-week season) has changed. */
function seasonOf(g: GameState, pid: string): EcaSeason {
  const e = ecaOf(g);
  e.season ??= {};
  const ch = g.chapter.number;
  const cur = e.season[pid];
  if (!cur || cur.chapter !== ch) e.season[pid] = { chapter: ch, fines: 0, convictions: 0 };
  return e.season[pid]!;
}

function letter(g: GameState, inq: EcaInquiry, out: StepOutput | null, l: EcaLetter): void {
  inq.letters.push(l);
  if (inq.letters.length > 6) inq.letters.splice(0, inq.letters.length - 6);
  say(g, out, inq.playerId, 'court', l.kind === 'verdict' ? 'loss' : 'warn', l.what);
}

/** The three-part letters for each stage. The keys are `eca.<kind>.what|why|do` in en.json and fr.json. */
function noticeOf(day: number, inq: EcaInquiry): EcaLetter {
  const vars = { ticker: inq.assetId };
  return { kind: 'notice', day, what: { key: 'eca.notice.what', vars }, why: { key: 'eca.notice.why', vars }, do: { key: 'eca.notice.do', vars } };
}

/**
 * The per-day ECA step, after the market day closes: fold the points into the score, move the inquiry state, and run the
 * tribunal-lite once evidence reaches the bar. Worlds with no points keep no state (the record is created on demand).
 */
export function ecaDay(g: GameState, out: StepOutput | null): void {
  // an open inquiry always keeps the step running, even after its score has decayed away: it must still be able to close
  const hasPts = Object.keys(g.eca?.pts ?? {}).length > 0 || Object.keys(g.eca?.score ?? {}).length > 0
    || Object.keys(g.eca?.open ?? {}).length > 0 || Object.keys(g.companies?.insider ?? {}).length > 0;
  if (!hasPts) return;
  insiderDeltas(g);
  const e = ecaOf(g);
  const day = today(g);
  // every key that has points, a score or an open inquiry: a score that decays to nothing still lets its inquiry close
  const keys = [...new Set([...Object.keys(e.pts), ...Object.keys(e.score), ...Object.keys(e.open)])].sort();
  for (const k of keys) {
    const s = Math.min(ECA.cap, ECA.decay * (e.score[k] ?? 0) + (e.pts[k] ?? 0));
    if (s > 0.01) e.score[k] = s; else delete e.score[k];
  }
  e.pts = {};
  for (const k of keys) {
    const [pid, assetId] = k.split('|') as [string, string];
    if (!g.players[pid] || g.players[pid]!.npc) continue;
    const s = e.score[k] ?? 0;
    e.over[k] = s >= ECA_TUNE.inquiryScore ? (e.over[k] ?? 0) + 1 : 0;
    const id = e.open[k];
    if (!id) {
      if (e.over[k]! >= ECA.inquiryDays && (e.cool[k] ?? 0) <= day) {
        e.seq++;
        const inq: EcaInquiry = {
          id: `eq${e.seq}`, playerId: pid, assetId, stage: 'inquiry', openedDay: day,
          evidence: Math.max(ECA.inquiryEvidenceMin, Math.min(ECA.inquiryEvidenceMax, s / 5)),
          quietDays: 0, trail: 0, letters: [],
        };
        e.inquiries[inq.id] = inq;
        e.open[k] = inq.id;
        letter(g, inq, out, noticeOf(day, inq));
      }
      continue;
    }
    const inq = e.inquiries[id]!;
    if (inq.stage === 'inquiry') {
      if (s >= ECA.investigationScore || (s >= ECA_TUNE.inquiryScore && receivedTip(g, pid, assetId))) {
        inq.stage = 'investigation';
        inq.quietDays = 0;
        letter(g, inq, out, { kind: 'investigation', day, what: { key: 'eca.investigation.what', vars: { ticker: inq.assetId } }, why: { key: 'eca.investigation.why', vars: { ticker: inq.assetId } }, do: { key: 'eca.investigation.do', vars: { ticker: inq.assetId } } });
      } else if (s < ECA_TUNE.inquiryScore) {
        inq.quietDays++;
      } else {
        inq.quietDays = 0;
      }
      if (inq.stage === 'inquiry' && inq.quietDays >= ECA.quietDaysClose) {
        inq.stage = 'closed';
        delete e.open[k];
        e.cool[k] = day + ECA.clearCooldownDays;
        continue;
      }
    }
    if (inq.stage === 'investigation') {
      // the pattern keeps the file open; a quiet stretch closes it (it cannot stall open and block new inquiries)
      if (s >= ECA_TUNE.inquiryScore) { inq.evidence += ECA.investigationPerDay; inq.quietDays = 0; } else inq.quietDays++;
      if (receivedTip(g, pid, assetId)) {
        const rng = keyedRng(g, `eca:trail:${inq.id}:${day}`);
        if (rng.chance(ECA.trailChance)) { inq.evidence += ECA.trailPts; inq.trail++; }
      }
      if (inq.evidence >= ECA.tribunalBar) {
        const led = seasonOf(g, pid);
        const df = g.players[pid]!;
        const peak = Math.max(df.netWorthPeak ?? 0, df.netWorth);
        const left = Math.max(0, ECA.seasonCapPct * peak - led.fines);
        // review repair (hold to reveal): the tipped share of the open lots is marked to the verdict price first, so a tipped position
        // held past the verdict disgorges its gain too (markTipLots); a later close books only the gain after this verdict
        markTipLots(e, k, priceOf(g, assetId));
        const gain = tipGainOf(g, pid, assetId);
        const v = regulatorVerdict(g, {
          id: inq.id, evidence: inq.evidence, playerId: pid, gain, priorConvictions: led.convictions, seasonFinesLeft: left,
          counsel: { regulator: ECA_REGULATOR_COUNSEL, defence: 0 },
        });
        inq.p = v.p;
        // what the verdict did not disgorge (cash-limited, or not convicted) stays in the pool for the next verdict on this asset
        if (e.tipGain) e.tipGain[k] = (e.tipGain[k] ?? 0) - v.disgorged;
        led.fines += v.fine;
        if (v.convicted) led.convictions++;
        delete e.open[k];
        e.cool[k] = day + ECA.clearCooldownDays;
        inq.stage = v.convicted ? 'convicted' : 'cleared';
        inq.fine = v.fine;
        inq.disgorged = v.disgorged;
        const vv = { ticker: assetId, fine: Math.round(v.fine), disgorged: Math.round(v.disgorged) };
        letter(g, inq, out, {
          kind: 'verdict', day, what: { key: v.convicted ? 'eca.verdict.convicted.what' : 'eca.verdict.cleared.what', vars: vv },
          why: { key: v.convicted ? 'eca.verdict.convicted.why' : 'eca.verdict.cleared.why', vars: vv },
          do: { key: v.convicted ? 'eca.verdict.convicted.do' : 'eca.verdict.cleared.do', vars: vv },
        });
      } else if (inq.quietDays >= ECA.quietDaysClose) {
        inq.stage = 'closed';
        delete e.open[k];
        e.cool[k] = day + ECA.clearCooldownDays;
      }
    }
  }
  // closed inquiries: keep the newest few
  const closed = Object.values(e.inquiries).filter((x) => x.stage !== 'inquiry' && x.stage !== 'investigation').sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const x of closed.slice(0, Math.max(0, closed.length - ECA.keepClosed))) delete e.inquiries[x.id];
}

/** The score of an account on an asset as the ECA sees it (regulator-side; never shown to players). */
export function ecaScore(g: GameState, pid: string, assetId: string): number {
  return g.eca?.score[keyOf(pid, assetId)] ?? 0;
}

/** What the player sees of their own inquiries: the stage, the letters and any verdict sums. Never the score or the evidence. */
export interface EcaInquiryView {
  id: string;
  ticker: string;
  stage: EcaStage;
  openedDay: number;
  letters: EcaLetter[];
  fine?: number;
  disgorged?: number;
}

/** The player's own inquiries, newest first (the latest ten). */
export function ecaViewOf(g: GameState, pid: string): EcaInquiryView[] {
  return Object.values(g.eca?.inquiries ?? {})
    .filter((q) => q.playerId === pid)
    .sort((a, b) => b.openedDay - a.openedDay || (a.id < b.id ? 1 : -1))
    .slice(0, 10)
    .map((q) => ({ id: q.id, ticker: q.assetId, stage: q.stage, openedDay: q.openedDay, letters: q.letters.slice(), fine: q.fine, disgorged: q.disgorged }));
}

/**
 * e2e seed (admin only, behind ADMIN_TOKEN): opens an inquiry on an account and asset at the inquiry stage, with its notice, as the
 * ECA would after three days at 60. Nothing else changes (no score, no evidence, no fine).
 */
export function adminSeedInquiry(g: GameState, pid: string, asked: string, out: StepOutput | null): CommandResult {
  const assetId = asked || (g.market.config.assets.find((d) => d.assetClass === 'stock')?.id ?? '');
  if (!g.players[pid] || g.players[pid]!.npc || assetId === '' || !g.market.config.assets.some((d) => d.id === assetId)) return { ok: false, error: 'pick a stock' };
  const e = ecaOf(g);
  const k = keyOf(pid, assetId);
  if (e.open[k]) return { ok: false, error: 'an inquiry is already open on that stock' };
  const day = today(g);
  e.seq++;
  const inq: EcaInquiry = { id: `eq${e.seq}`, playerId: pid, assetId, stage: 'inquiry', openedDay: day, evidence: ECA.inquiryEvidenceMin, quietDays: 0, trail: 0, letters: [] };
  e.inquiries[inq.id] = inq;
  e.open[k] = inq.id;
  letter(g, inq, out, noticeOf(day, inq));
  return { ok: true, data: { id: inq.id, assetId } };
}
