import { rankIndex } from '@/content/lifestyle';
import { clamp, cashOf, debit, keyedRng, notify, TPD } from './core';
import {
  attackPoints, breachOdds, defensePoints, entriesOf, fundName, openDecoy, plantCrewSession, SECURITY_RANK, STRENGTHS,
} from './cyber';
import { canaryFlagChance, HONEYPOT_POISON, honeypotEvidence, inheritedPoison } from './honeypots';
import type { HoneypotKind } from './honeypots';
import { labFor } from './lab';
import { mcsTier } from '@/content/research';
import type { GameState, Model, Player, SessionStrength, StepOutput } from './types';

export { canaryFlagChance, HONEYPOT_POISON, honeypotEvidence, inheritedPoison };

/**
 * The rival funds' models, defense and crews (M26, M28, M29, M31; ROADMAP §2.3 and §4.6, 03 §4.6.4, RESOLVED-NUMBERS B2).
 *
 *  - M26: each fund has a tier (rivals.ts RivalDef.tier), an attack power AP from the tier's B2 range, a defense DP_ai = 0.8 × AP
 *    (the player's own formula on a security model), and a normal list size from 03 §4.6.4. The draws are the fund's own seeded
 *    streams. The fund's model list (fundModelList) is its security model, its honeypot when it runs one, and the list size.
 *  - M29: a fund at T2+ runs one honeypot in a game quarter (63 game days) with a 25% chance. A player who attacks a fund (attackFund)
 *    meets it: the canary (when run) may flag it, otherwise the session goes into the honeypot. The crews run the canary always.
 *  - M31: a crew attacks a player with its AP against the player's effective DP. The gates: the 72-game-hour new-account
 *    protection, the rookie zone (no attack below R2), the 1% breach floor (breachOdds), offline protection (no attack while the
 *    player has been offline for more than 8 real hours) and the same session caps and cooldowns as a player's op.
 *
 * One game day is one real hour (720 ticks). Everything is seeded per fund and per day; nothing draws on the price streams.
 */

/** B2: AP range per tier, T0 to T5 (RESOLVED-NUMBERS (b)). */
export const AP_RANGE: [number, number][] = [[5, 20], [20, 60], [60, 200], [200, 600], [600, 2000], [2000, 5000]];
/** 03 §4.6.4: normal legitimate list size per tier, T0 to T5. */
export const LIST_SIZE_RANGE: [number, number][] = [[2, 4], [4, 8], [8, 15], [15, 30], [30, 60], [60, 120]];
/** DP_ai = 0.8 × AP at equal tier (a pure-AI defender sits slightly behind a pure-AI attacker on purpose). */
export const DP_AI_RATIO = 0.8;

/** M29: the chance a fund at T2 or above runs one honeypot in a game quarter (63 game days) */
export const HONEYPOT_QUARTER_CHANCE = 0.25;
/** game days in a quarter (the fund quarter, funds/fees.ts FUND_TIME.quarterDays) */
export const QUARTER_DAYS = 63;
/**
 * M31: the chance a fund's crew picks a target on a game day. One pick a month of game days per fund (1 in 30), as the crew's
 * cadence in the comment on crewMayAttack and ROADMAP §2.3 says. (Measured in rivalCrews.test.ts: about one attempt a month.)
 */
export const CREW_DAY_CHANCE = 1 / 30;
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
/** the cooldown on a player's op against a fund, in game days (as the cooldown on a player) */
const FUND_COOLDOWN_DAYS = 3;
/** the canary add-on's price: +20% of the operation's cost (ROADMAP §2.3) */
export const CANARY_PRICE = 0.2;

/** The tier a fund runs at, with the default for a fund that names none (T1). */
export function fundTier(def: { tier?: number }): number {
  return clamp(Math.round(def.tier ?? 1), 0, 5);
}

/** The honeypot a fund of this tier runs, if any (T2 basic, T3 advanced, T4 and up frontier). */
export function honeypotKind(tier: number): HoneypotKind | null {
  if (tier < 2) return null;
  if (tier === 2) return 'basic';
  if (tier === 3) return 'advanced';
  return 'frontier';
}

/** The game quarter a tick falls in (quarter 0 is the first 63 game days). */
export function quarterOf(tick: number): number {
  return Math.floor(Math.max(0, tick - 1) / (QUARTER_DAYS * TPD));
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
export function fundHoneypot(g: GameState, id: string, quarter: number): { kind: HoneypotKind; poison: number } | null {
  const { tier } = fundDefense(g, id);
  const kind = honeypotKind(tier);
  if (!kind) return null;
  if (!keyedRng(g, `rival:honeypot:${id}:${quarter}`).chance(HONEYPOT_QUARTER_CHANCE)) return null;
  return { kind, poison: HONEYPOT_POISON[kind] };
}

/**
 * A fund's model list (M26, ROADMAP §2.3): its security model (the crew model, MCS = AP), its honeypot as a bait model in the
 * list when it runs one this quarter (MCS = AP, the bait), and its normal list size (03 §4.6.4). Read by attackFund and by the
 * harness; nothing a player sees.
 */
export interface FundModelList { listSize: number; models: Model[]; honeypot: { kind: HoneypotKind; poison: number } | null }

export function fundModelList(g: GameState, id: string, tick = g.market.tick): FundModelList {
  const d = fundDefense(g, id);
  const honeypot = fundHoneypot(g, id, quarterOf(tick));
  const models: Model[] = [crewModel(g, id)];
  if (honeypot) models.push({ id: 'honeypot', name: 'Honeypot', kind: 'security', mcs: d.ap, createdTick: tick, residue: 0 });
  return { listSize: d.listSize, models, honeypot };
}

/**
 */

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
    const model = crewModel(g, def.id);
    plantCrewSession(g, def.id, victim.id, model, CREW_STRENGTH, out);
    attacks++;
  }
  return attacks;
}

/**
 * A player's operation against a rival fund (M28, the fund side of the hidden sessions; ROADMAP §2.3 for the honeypot). The
 * player pays the op's price (the caller's cost rule: the same as a player op, see attackFundCost) and, with the canary add-on,
 * 20% more. A honeypot the canary flags is avoided: the op then goes to the fund's real systems. An unflagged honeypot takes
 * the session. The breach uses the fund's DP_ai against the player's model (the same odds as a player op, the 1% floor included).
 * A clean breach opens a session that distils a student from the fund's AP when it closes (poisoned when the fund ran a honeypot).
 */
export function attackFund(g: GameState, pid: string, fundId: string, strength: SessionStrength, modelId: string, canary: boolean, out: StepOutput | null): { ok: boolean; error?: string; data?: unknown } {
  const p = g.players[pid];
  const tick = g.market.tick;
  if (!p) return { ok: false, error: 'join the world first' };
  if (rankIndex(p.rankId) < rankIndex(SECURITY_RANK)) return { ok: false, error: 'Security Ops unlock at Operator' };
  const def = (g.market.config.rivals ?? []).find((d) => d.id === fundId);
  if (!def || !g.market.ecology?.rivals?.some((b) => b.id === fundId)) return { ok: false, error: 'pick a rival fund' };
  if (!STRENGTHS[strength]) return { ok: false, error: 'pick a strength' };
  const model = labFor(g, pid).models.find((m) => m.id === modelId && m.kind === 'security');
  if (!model) return { ok: false, error: 'pick a security model' };
  const key = `${pid}>${fundId}`;
  if ((g.cyber.cooldowns[key] ?? 0) > tick) return { ok: false, error: 'cooldown on this target' };
  if (g.cyber.decoys?.some((s) => s.attackerId === pid && s.targetId === fundId)) return { ok: false, error: 'one session per target' };
  const cost = attackFundCost(model, canary);
  if (cashOf(g, pid) < cost) return { ok: false, error: 'not enough cash for the operation' };
  debit(g, pid, cost, 'operations');
  g.cyber.seq++;
  const opId = `op${g.cyber.seq}`;
  const rng = keyedRng(g, `fund:op:${pid}:${fundId}:${tick}`);
  const d = fundDefense(g, fundId);
  const list = fundModelList(g, fundId, tick);
  g.cyber.cooldowns[key] = tick + FUND_COOLDOWN_DAYS * TPD;
  const st = STRENGTHS[strength];
  if (list.honeypot && canary && rng.chance(canaryFlagChance(attackPoints(model), d.dpAi))) {
    notify(g, out, pid, { kind: 'security', tone: 'info', text: `Your canary flagged a decoy in ${def.name}'s systems and stayed out of it.`, msg: { key: 'security.msg.canary', vars: { target: def.name } } });
    g.cyber.ops.unshift({ id: opId, attackerId: pid, victimId: fundId, strength, modelId, tick, result: 'flagged' });
  } else if (rng.chance(breachOdds(attackPoints(model), d.dpAi, st.bias))) {
    openDecoy(g, { attackerId: pid, targetId: fundId, on: 'fund', strength, bait: d.ap, poisonTier: list.honeypot?.poison ?? 0 });
    g.cyber.ops.unshift({ id: opId, attackerId: pid, victimId: fundId, strength, modelId, tick, result: 'decoy' });
    notify(g, out, pid, { kind: 'security', tone: 'gain', text: `${st.label} session planted on ${def.name}'s systems.`, msg: { key: 'security.msg.planted', vars: { label: `@security.strength.${strength}.label`, target: def.name } } });
  } else {
    const detected = rng.chance(0.5);
    g.cyber.ops.unshift({ id: opId, attackerId: pid, victimId: fundId, strength, modelId, tick, result: detected ? 'detected' : 'failed' });
    notify(g, out, pid, { kind: 'security', tone: 'loss', text: `The operation against ${def.name} failed${detected ? ' and was detected' : ''}.`, msg: { key: detected ? 'security.msg.failedDetected' : 'security.msg.failed', vars: { target: def.name } } });
  }
  if (g.cyber.ops.length > 200) g.cyber.ops.length = 200;
  return { ok: true, data: { fund: fundName(g, fundId) } };
}

/** The price of a player's op on a fund: the same tier price as a player op, plus the canary add-on when run. */
export function attackFundCost(model: Model, canary: boolean): number {
  const base = 15_000 * 2 ** mcsTier(model.mcs);
  return canary ? Math.round(base * (1 + CANARY_PRICE)) : base;
}
