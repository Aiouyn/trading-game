import { clamp } from './core';

/**
 * Honeypots (M29, ROADMAP §2.3, RESOLVED-NUMBERS honeypots): the pure math shared by the defender's side (a player's own
 * honeypot, cyber.ts), the rival funds' side (rivalCrews.ts) and the attacker's canary check. Nothing here reads the state.
 *
 *  - A honeypot is a bait model in the defender's list: basic $30k (poison 0.20), advanced $120k (0.40), frontier $400k (0.60).
 *  - The attacker's canary check (an add-on to recon) flags it with p = clamp(0.25 + 0.15·log2(AP/DP_eff), 0.05, 0.75). A flagged
 *    honeypot is avoided: the attacker goes to the real systems instead. An unflagged one takes the session.
 *  - A session in a honeypot progresses on the same curve as any session, P = 0.85·(1 − e^(−k·h_eff)). The thief's student is
 *    built from the bait (bait·P), and inherits poison = poison_tier · (0.4 + 0.6·P/0.85), reaching the tier value at P = 0.85.
 *  - The defender's evidence from a honeypot: +15 on the plant, +3 per effective hour connected, capped at +40 alone (the civil
 *    bar; never the criminal bar of 55 by itself).
 */

export type HoneypotKind = 'basic' | 'advanced' | 'frontier';

/** The poison each honeypot carries (ROADMAP §2.3). */
export const HONEYPOT_POISON: Record<HoneypotKind, number> = { basic: 0.2, advanced: 0.4, frontier: 0.6 };
/** What a player pays to place one (a sink in the 'security' book). */
export const HONEYPOT_COST: Record<HoneypotKind, number> = { basic: 30_000, advanced: 120_000, frontier: 400_000 };
/** The defense tier a player needs to place each kind. */
export const HONEYPOT_MIN_TIER: Record<HoneypotKind, number> = { basic: 1, advanced: 3, frontier: 4 };
/** The bait a player may set: between 0.5 and 1.25 times their best security model's MCS (ROADMAP §2.3). */
export const BAIT_RANGE: [number, number] = [0.5, 1.25];
/** The evidence a honeypot alone can give: the civil bar (never the criminal bar of 55 by itself). */
export const HONEYPOT_EVIDENCE_CAP = 40;
/** The plant evidence on a honeypot session (M29). */
export const HONEYPOT_PLANT_EVIDENCE = 15;
/** The progress ceiling of a session, as for any session (P = 0.85 at most). */
export const PROGRESS_CAP = 0.85;

/** M29: the attacker's canary check on a honeypot: the chance it flags one, p = clamp(0.25 + 0.15·log2(AP/DP_eff), 0.05, 0.75). */
export function canaryFlagChance(ap: number, dpEff: number): number {
  return clamp(0.25 + 0.15 * Math.log2(Math.max(1e-6, ap) / Math.max(1e-6, dpEff)), 0.05, 0.75);
}

/** M29: the poison a thief's student inherits from a honeypot at session progress P: poison_tier · (0.4 + 0.6·P/0.85). */
export function inheritedPoison(poisonTier: number, progress: number): number {
  const p = clamp(progress, 0, PROGRESS_CAP);
  return poisonTier * (0.4 + (0.6 * p) / PROGRESS_CAP);
}

/** M29: the evidence a honeypot gives the defender after `effectiveHours` connected: 15 + 3 per hour, capped at 40. */
export function honeypotEvidence(effectiveHours: number): number {
  return Math.min(HONEYPOT_EVIDENCE_CAP, HONEYPOT_PLANT_EVIDENCE + 3 * Math.max(0, effectiveHours));
}

/**
 * One day of progress on a session, the curve every session uses (cyber.ts): `online` sessions copy at full speed, offline ones
 * at a quarter and at most 0.08 a stretch. `k` is the strength's rate. Pure.
 */
export function copyStep(progress: number, k: number, online: boolean): number {
  const hEff = online ? 1 : 0.25;
  const target = PROGRESS_CAP * (1 - Math.exp(-k * 24 * hEff));
  const add = (PROGRESS_CAP - progress) * (target / PROGRESS_CAP);
  return Math.min(PROGRESS_CAP, progress + (online ? add : Math.min(add, 0.08)));
}

/** The bait a honeypot holds for a bait ratio (clamped to the allowed range) on the defender's best security MCS. */
export function baitMcs(bestMcs: number, ratio: number): number {
  return bestMcs * clamp(ratio, BAIT_RANGE[0], BAIT_RANGE[1]);
}
