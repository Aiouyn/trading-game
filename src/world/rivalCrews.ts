import { rankIndex } from '@/content/lifestyle';
import { clamp, keyedRng, TPD } from './core';
import { breachOdds, defensePoints, entriesOf, plantCrewSession } from './cyber';
import { labFor } from './lab';
import type { GameState, Model, Player, StepOutput } from './types';

/**
 * The rival funds' models, defense and crews (M26, M29, M31; ROADMAP §2.3 and §4.6, 03 §4.6.4, RESOLVED-NUMBERS B2).
 *
 *  - M26: each fund has a tier (rivals.ts RivalDef.tier), an attack power AP from the tier's B2 range, a defense DP_ai =
 *    0.8 × AP, and a normal list size from 03 §4.6.4. The draw inside the range is the fund's own seeded stream.
 *  - M29: a fund at T2+ runs one honeypot in a game quarter with 25% chance. Its poison and the attacker's canary check are
 *    the §2.3 numbers below. (No player can attack a fund yet: the fund-side hidden sessions are M28. The functions are here
 *    and tested; nothing in the live game calls the canary check.)
 *  - M31: a crew attacks a player with its AP against the player's effective DP. The gates: the 72-game-hour new-account
 *    protection, the rookie zone (no attack below R2), the 1% breach floor (breachOdds), offline protection (no attack while
 *    the player has been offline for more than 8 real hours) and the same session caps and cooldowns as a player's op.
 *
 * One game day is one real hour (720 ticks). Everything is seeded per fund and per day; nothing draws on the price streams.
 */

/** B2: AP range per tier, T0 to T5 (RESOLVED-NUMBERS (b)). */
export const AP_RANGE: [number, number][] = [[5, 20], [20, 60], [60, 200], [200, 600], [600, 2000], [2000, 5000]];
/** 03 §4.6.4: normal legitimate list size per tier, T0 to T5. */
export const LIST_SIZE_RANGE: [number, number][] = [[2, 4], [4, 8], [8, 15], [15, 30], [30, 60], [60, 120]];
/** DP_ai = 0.8 × AP at equal tier (a pure-AI defender sits slightly behind a pure-AI attacker on purpose). */
export const DP_AI_RATIO = 0.8;

/** M29: honeypot poison by tier (basic $30k, advanced $120k, frontier $400k), and the fund tier that runs each. */
export const HONEYPOT_POISON = { basic: 0.2, advanced: 0.4, frontier: 0.6 } as const;
/** the chance a fund at T2 or above runs one honeypot in a game quarter (63 game days) */
export const HONEYPOT_QUARTER_CHANCE = 0.25;
/** M31: the chance a fund's crew picks a target on a given game day (a crew attacks about once a month of game days) */
export const CREW_DAY_CHANCE = 0.25;
/** M31: the new-account protection, 72 game hours (real hours): a player's shieldUntil is set to this at join (players.ts) */
export const NEW_ACCOUNT_PROTECTION = 72 * TPD;
/** M31: a player offline longer than this is not attacked */
export const OFFLINE_PROTECTION = 8 * TPD;
/** M31: no attack on a player below this rank (the rookie zone) */
export const CREW_RANK = 'R2';
/** the strength a crew plants with (Tap: the middle session, 03 §4.6) */
const CREW_STRENGTH = 'tap' as const;
const CREW_MODEL_ID = 'crew';
/** at most three hostile sessions on one player, as for a player's op (03 §4.6) */
const MAX_HOSTILE_ON_TARGET = 3;

/** The tier a fund runs at, with the default for a fund that names none (T1). */
export function fundTier(def: { tier?: number }): number {
  return clamp(Math.round(def.tier ?? 1), 0, 5);
}

/** The honeypot a fund of this tier runs, if any (T2 basic, T3 advanced, T4 and up frontier). */
export function honeypotKind(tier: number): keyof typeof HONEYPOT_POISON | null {
  if (tier < 2) return null;
  if (tier === 2) return 'basic';
  if (tier === 3) return 'advanced';
  return 'frontier';
}

/** A fund's M26 numbers: its tier, its attack power (AP), its defense (DP_ai) and its normal list size. Deterministic per seed. */
export interface FundDefense { tier: number; ap: number; dpAi: number; listSize: number }

export function fundDefense(g: GameState, id: string): FundDefense {
  const def = (g.market.config.rivals ?? []).find((d) => d.id === id);
  const tier = def ? fundTier(def) : 1;
  const rng = keyedRng(g, `rival:defense:${id}`);
  const [alo, ahi] = AP_RANGE[tier]!;
  const [llo, lhi] = LIST_SIZE_RANGE[tier]!;
  const ap = Math.round(alo + (ahi - alo) * rng.uniform());
  const listSize = Math.round(llo + (lhi - llo) * rng.uniform());
  return { tier, ap, dpAi: Math.round(DP_AI_RATIO * ap), listSize };
}

/** M29: the honeypot a fund runs in a quarter: null for a T0 or T1 fund, or when the quarter's draw misses (25% at T2+). */
export function fundHoneypot(g: GameState, id: string, quarter: number): { kind: keyof typeof HONEYPOT_POISON; poison: number } | null {
  const { tier } = fundDefense(g, id);
  const kind = honeypotKind(tier);
  if (!kind) return null;
  if (!keyedRng(g, `rival:honeypot:${id}:${quarter}`).chance(HONEYPOT_QUARTER_CHANCE)) return null;
  return { kind, poison: HONEYPOT_POISON[kind] };
}

/**
 * M29, the attacker's canary check on a honeypot (ROADMAP §2.3): the chance it flags one, p = clamp(0.25 + 0.15·log2(AP/DP_eff),
 * 0.05, 0.75). Each doubling of the attacker's AP over the defense adds 15 points.
 */
export function canaryFlagChance(ap: number, dpEff: number): number {
  return clamp(0.25 + 0.15 * Math.log2(Math.max(1e-6, ap) / Math.max(1e-6, dpEff)), 0.05, 0.75);
}

/**
 * M29, the poison a thief's student inherits from a honeypot at session progress P: poison_tier · (0.4 + 0.6·P/0.85), reaching
 * the tier value at P = 0.85 (the same scaling as residue).
 */
export function inheritedPoison(poisonTier: number, progress: number): number {
  const p = clamp(progress, 0, 0.85);
  return poisonTier * (0.4 + (0.6 * p) / 0.85);
}

/**
 * M29, the evidence a honeypot gives the defender: +15 on the plant, +3 per effective hour connected, and the honeypot alone
 * caps at +40 (the civil bar; it never reaches the criminal bar of 55 by itself).
 */
export function honeypotEvidence(effectiveHours: number): number {
  return Math.min(40, 15 + 3 * Math.max(0, effectiveHours));
}

/** M31: may this player be attacked by a crew at all, on this tick? Every gate is here, in one place. */
export function crewMayAttack(g: GameState, crewId: string, p: Player): boolean {
  const tick = g.market.tick;
  if (p.npc || p.id === crewId) return false;
  if (p.shieldUntil > tick) return false; // the new-account protection (72 game hours)
  if (rankIndex(p.rankId) < rankIndex(CREW_RANK)) return false; // the rookie zone
  if (!p.online && tick - p.lastSeenTick > OFFLINE_PROTECTION) return false; // offline protection
  if ((g.cyber.defense[p.id]?.shieldUntil ?? 0) > tick) return false; // shielded after a lockdown
  if ((g.cyber.cooldowns[`${crewId}>${p.id}`] ?? 0) > tick) return false; // the cooldown on this target
  const hostile = entriesOf(g, p.id).filter((e) => e.hostile);
  if (hostile.length >= MAX_HOSTILE_ON_TARGET) return false;
  if (hostile.some((e) => e.hostile!.attackerId === crewId)) return false; // one session per target
  return true;
}

/** The crew's model, created once: its AP is its MCS, the same as a player's security model. */
function crewModel(g: GameState, id: string): Model {
  const lab = labFor(g, id);
  const ap = fundDefense(g, id).ap;
  let m = lab.models.find((x) => x.id === CREW_MODEL_ID);
  if (!m) {
    m = { id: CREW_MODEL_ID, name: 'Crew model', kind: 'security', mcs: ap, createdTick: g.market.tick, residue: 0 };
    lab.models.push(m);
  }
  return m;
}

/** The breach odds a crew has against a player now (the 1% floor is inside breachOdds). Exposed for the harness. */
export function crewBreachOdds(g: GameState, crewId: string, victimId: string): number {
  return breachOdds(fundDefense(g, crewId).ap, defensePoints(g, victimId), 0);
}

/**
 * One game day of crew attacks (called once a game day, after the cyber day). Each fund at T1 and up may pick one eligible
 * player with CREW_DAY_CHANCE; the pick and the breach roll are keyed on the day, so the day is replayable. Returns how many
 * attacks ran.
 */
export function rivalCrewDay(g: GameState, out: StepOutput | null): number {
  const defs = g.market.config.rivals ?? [];
  if (defs.length === 0) return 0;
  const day = Math.floor((g.market.tick - 1) / TPD);
  const rng = keyedRng(g, `crew:day:${day}`);
  let attacks = 0;
  for (const def of defs) {
    if (!g.market.ecology?.rivals?.some((b) => b.id === def.id)) continue;
    if (fundTier(def) < 1) continue;
    if (!rng.chance(CREW_DAY_CHANCE)) continue;
    const targets = Object.values(g.players).filter((p) => crewMayAttack(g, def.id, p));
    if (targets.length === 0) continue;
    const victim = targets[Math.floor(rng.uniform() * targets.length) % targets.length]!;
    plantCrewSession(g, def.id, victim.id, crewModel(g, def.id), CREW_STRENGTH, out);
    attacks++;
  }
  return attacks;
}
