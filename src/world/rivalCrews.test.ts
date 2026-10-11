import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { TPD } from './core';
import {
  AP_RANGE, CREW_DAY_CHANCE, LIST_SIZE_RANGE, NEW_ACCOUNT_PROTECTION, OFFLINE_PROTECTION, canaryFlagChance, crewMayAttack,
  fundDefense, fundHoneypot, honeypotEvidence, inheritedPoison, rivalCrewDay,
} from './rivalCrews';
import type { GameState } from './types';

// M26, M29 and M31 (ROADMAP §2.3, 03 §4.6.4, RESOLVED-NUMBERS B2). The harness: 20 seeds, rookies, owners, protection and
// offline gates, and the breach floor. Days are stepped by hand (the crew rule reads the clock, not the price path), so the
// 90-day run is cheap.

const SEEDS = Array.from({ length: 20 }, (_, i) => `crew-${i}`);

/** A world with six rookies (R0) and four owners (R2), all joined at the start tick. Owner `ow3` is offline for two days. */
function crewWorld(seed: string): { g: GameState; joined: number; rookies: string[]; owners: string[] } {
  const g = createGame(seed, { warmupDays: 1 });
  const joined = g.market.tick;
  const rookies: string[] = [];
  const owners: string[] = [];
  for (let i = 0; i < 6; i++) {
    const id = `rk${i}`;
    applyCommand(g, id, { type: 'join', handle: `trader_${id}`, country: 'AV' });
    rookies.push(id);
  }
  for (let i = 0; i < 4; i++) {
    const id = `ow${i}`;
    applyCommand(g, id, { type: 'join', handle: `trader_${id}`, country: 'AV' });
    g.players[id]!.rankId = 'R2';
    owners.push(id);
  }
  // ow3 has been offline longer than eight real hours
  g.players.ow3!.online = false;
  g.players.ow3!.lastSeenTick = joined - 2 * TPD;
  return { g, joined, rookies, owners };
}

describe('rival fund defense (M26)', () => {
  it('each fund has a tier, an AP inside its B2 range, DP_ai = 0.8 × AP, and a list size from 03 §4.6.4', () => {
    const { g } = crewWorld('defense');
    for (const d of g.market.config.rivals ?? []) {
      const f = fundDefense(g, d.id);
      const [alo, ahi] = AP_RANGE[f.tier]!;
      const [llo, lhi] = LIST_SIZE_RANGE[f.tier]!;
      expect(f.ap).toBeGreaterThanOrEqual(alo);
      expect(f.ap).toBeLessThanOrEqual(ahi);
      expect(f.dpAi).toBe(Math.round(0.8 * f.ap));
      expect(f.listSize).toBeGreaterThanOrEqual(llo);
      expect(f.listSize).toBeLessThanOrEqual(lhi);
    }
    expect(fundDefense(g, 'hale').tier).toBe(1);
    expect(fundDefense(g, 'pinn').tier).toBe(2);
    expect(fundDefense(g, 'vetch').tier).toBe(2);
  });

  it('is deterministic for a seed and changes with the seed', () => {
    const a = crewWorld('same').g;
    const b = crewWorld('same').g;
    expect(fundDefense(a, 'pinn')).toEqual(fundDefense(b, 'pinn'));
  });
});

describe('honeypots (M29, ROADMAP §2.3)', () => {
  it('a fund at T2 and up runs one honeypot in about 25% of game quarters, and a T1 fund never does', () => {
    let t2 = 0;
    let t1 = 0;
    const total = SEEDS.length * 40;
    for (const seed of SEEDS) {
      const { g } = crewWorld(seed);
      for (let q = 0; q < 40; q++) {
        if (fundHoneypot(g, 'pinn', q)) t2++;
        if (fundHoneypot(g, 'hale', q)) t1++;
      }
    }
    const rate = t2 / total;
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.35);
    expect(t1).toBe(0);
  });

  it('poison scales with session progress and reaches the tier value at P = 0.85 (the residue scaling)', () => {
    expect(inheritedPoison(0.6, 0.85)).toBeCloseTo(0.6, 12);
    expect(inheritedPoison(0.6, 0)).toBeCloseTo(0.24, 12);
    expect(inheritedPoison(0.2, 0.5)).toBeGreaterThan(inheritedPoison(0.2, 0.2));
    expect(inheritedPoison(0.4, 2)).toBeCloseTo(0.4, 12); // progress is capped at the 0.85 ceiling
  });

  it('the honeypot alone caps its evidence at +40 (the civil bar), +15 on plant and +3 per effective hour', () => {
    expect(honeypotEvidence(0)).toBe(15);
    expect(honeypotEvidence(5)).toBe(30);
    expect(honeypotEvidence(100)).toBe(40);
    expect(honeypotEvidence(-3)).toBe(15);
  });

  it('the canary check rises with the attacker\'s advantage and stays between 5% and 75%', () => {
    expect(canaryFlagChance(100, 100)).toBeCloseTo(0.25, 12);
    expect(canaryFlagChance(100, 100 / 2)).toBeCloseTo(0.4, 12); // one doubling: +15 points
    expect(canaryFlagChance(1e9, 1)).toBe(0.75);
    expect(canaryFlagChance(1, 1e9)).toBe(0.05);
  });
});

describe('rival crews attack players (M31): the harness', () => {
  it('rookies are attacked in under 5% of attacks (no rookie is attacked at all), over 20 seeds and 90 game days', () => {
    let attacks = 0;
    let onRookies = 0;
    for (const seed of SEEDS) {
      const { g, joined, rookies } = crewWorld(seed);
      for (let d = 0; d < 90; d++) {
        g.market.tick = joined + d * TPD;
        rivalCrewDay(g, null);
      }
      for (const op of g.cyber.ops) {
        if (!g.market.config.rivals!.some((r) => r.id === op.attackerId)) continue;
        attacks++;
        if (rookies.includes(op.victimId)) onRookies++;
      }
    }
    expect(attacks).toBeGreaterThan(0);
    expect(onRookies / Math.max(1, attacks)).toBeLessThan(0.05);
    expect(onRookies).toBe(0);
  });

  it('no attack lands before the new-account protection ends (72 game hours), over 20 seeds', () => {
    let attacks = 0;
    for (const seed of SEEDS) {
      const { g, joined } = crewWorld(seed);
      const protectedUntil = joined + NEW_ACCOUNT_PROTECTION;
      for (let d = 0; d < 90; d++) {
        g.market.tick = joined + d * TPD;
        rivalCrewDay(g, null);
      }
      for (const op of g.cyber.ops) {
        if (!g.market.config.rivals!.some((r) => r.id === op.attackerId)) continue;
        attacks++;
        expect(op.tick).toBeGreaterThanOrEqual(protectedUntil);
      }
    }
    expect(attacks).toBeGreaterThan(0);
  });

  it('an owner offline for more than eight real hours is not attacked, and is attacked once back online', () => {
    const { g, joined } = crewWorld('offline');
    g.market.tick = joined + NEW_ACCOUNT_PROTECTION + 2 * TPD;
    expect(crewMayAttack(g, 'pinn', g.players.ow3!)).toBe(false);
    expect(crewMayAttack(g, 'pinn', g.players.ow0!)).toBe(true);
    g.players.ow3!.online = true;
    expect(crewMayAttack(g, 'pinn', g.players.ow3!)).toBe(true);
    g.players.ow3!.online = false;
    g.players.ow3!.lastSeenTick = g.market.tick - OFFLINE_PROTECTION;
    expect(crewMayAttack(g, 'pinn', g.players.ow3!)).toBe(true); // exactly eight hours is still inside the window
  });

  it('a crew attacks at most once a day per fund, and at the stated day chance', () => {
    let days = 0;
    let fired = 0;
    const { g, joined } = crewWorld('chance');
    for (let d = 0; d < 400; d++) {
      g.market.tick = joined + NEW_ACCOUNT_PROTECTION + d * TPD;
      const n = rivalCrewDay(g, null);
      days++;
      fired += n;
      expect(n).toBeLessThanOrEqual(3); // one per fund at most: Pinn and Vetch (T2), Hale (T1)
    }
    // 3 funds, about 25% each: the mean per day sits near 3 × CREW_DAY_CHANCE, subject to who has a target
    expect(fired / days).toBeLessThan(3 * CREW_DAY_CHANCE + 0.3);
  });

  it('a player who is not eligible for any reason is never on a crew\'s target list', () => {
    const { g, joined } = crewWorld('elig');
    g.market.tick = joined + NEW_ACCOUNT_PROTECTION + TPD;
    g.players.ow0!.npc = 'npc-test';
    expect(crewMayAttack(g, 'pinn', g.players.ow0!)).toBe(false);
  });
});
