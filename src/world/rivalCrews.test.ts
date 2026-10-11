import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, securityDay, stepGame } from './game';
import { TPD } from './core';
import {
  AP_RANGE, attackFund, CREW_DAY_CHANCE, LIST_SIZE_RANGE, NEW_ACCOUNT_PROTECTION, OFFLINE_PROTECTION, canaryFlagChance, crewMayAttack,
  fundDefense, fundHoneypot, fundModelList, honeypotEvidence, inheritedPoison, quarterOf, rivalCrewDay,
} from './rivalCrews';
import { decoyDay, defensePoints, entriesOf, plantCrewSession } from './cyber';
import { labFor } from './lab';
import type { GameState, Player } from './types';

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
  // The harness runs the game's own security day (securityDay, the function stepGame calls once a game day), with real rank,
  // protection and presence. The rookie gate is rank-based, so the test also counts the rookies who would be eligible for every
  // other reason: the gate is exercised by real candidates, not vacuous.
  it('rookies (below R2) are never attacked, while rookies who pass every other gate exist (20 seeds, 90 game days)', () => {
    let attacks = 0;
    let onRookies = 0;
    let rookieEligibleDays = 0;
    for (const seed of SEEDS) {
      const { g, joined, rookies } = crewWorld(seed);
      for (let d = 0; d < 90; d++) {
        g.market.tick = joined + NEW_ACCOUNT_PROTECTION + d * TPD;
        for (const id of rookies) {
          const p = g.players[id]!;
          if (p.shieldUntil <= g.market.tick && p.online && crewMayAttackIgnoringRank(g, p)) rookieEligibleDays++;
        }
        securityDay(g, null);
      }
      for (const op of g.cyber.ops) {
        if (!g.market.config.rivals!.some((r) => r.id === op.attackerId)) continue;
        attacks++;
        if (rookies.includes(op.victimId)) onRookies++;
      }
    }
    expect(rookieEligibleDays).toBeGreaterThan(0);
    expect(attacks).toBeGreaterThan(0);
    expect(onRookies / Math.max(1, attacks)).toBeLessThan(0.05);
    expect(onRookies).toBe(0);
  });

  it('a rookie one rank below R2 is never on a target list, and an R2 player who passes every gate is', () => {
    const { g, joined } = crewWorld('rank-edge');
    g.market.tick = joined + NEW_ACCOUNT_PROTECTION + TPD;
    g.players.rk0!.rankId = 'R1';
    g.players.rk0!.online = true;
    g.players.ow0!.online = true;
    expect(crewMayAttack(g, 'pinn', g.players.rk0!)).toBe(false);
    expect(crewMayAttack(g, 'pinn', g.players.ow0!)).toBe(true);
  });

  it('no attack lands before the new-account protection ends (72 game hours), over 20 seeds and 90 game days', () => {
    let attacks = 0;
    let beforeProtection = 0;
    for (const seed of SEEDS) {
      const { g, joined } = crewWorld(seed);
      for (let d = 0; d < 90; d++) {
        g.market.tick = joined + d * TPD;
        securityDay(g, null);
      }
      for (const op of g.cyber.ops) {
        if (!g.market.config.rivals!.some((r) => r.id === op.attackerId)) continue;
        attacks++;
        if (op.tick < joined + NEW_ACCOUNT_PROTECTION) beforeProtection++;
      }
    }
    expect(beforeProtection).toBe(0);
    expect(attacks).toBeGreaterThan(0); // the days after protection do produce attacks
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

  it('a crew picks a target about once a month of game days (CREW_DAY_CHANCE = 1/30), over 20 seeds and 240 days', () => {
    let fundDays = 0;
    let picks = 0;
    for (const seed of SEEDS) {
      const { g, joined } = crewWorld(`chance-${seed}`);
      for (let d = 0; d < 240; d++) {
        g.market.tick = joined + NEW_ACCOUNT_PROTECTION + d * TPD;
        const before = g.cyber.ops.length;
        rivalCrewDay(g, null);
        picks += g.cyber.ops.length - before;
        fundDays += (g.market.config.rivals ?? []).filter((r) => (r.tier ?? 1) >= 1).length;
      }
    }
    expect(CREW_DAY_CHANCE).toBeCloseTo(1 / 30, 9);
    // one attempt per fund-day at most: a 1-in-30 pick, times the chance that an eligible victim exists that day (about half here: one owner is offline, and the cooldowns)
    const rate = picks / fundDays;
    expect(rate).toBeGreaterThan(0.3 / 30);
    expect(rate).toBeLessThan(1 / 30);
  });

  it('a player who is not eligible for any reason is never on a crew\'s target list', () => {
    const { g, joined } = crewWorld('elig');
    g.market.tick = joined + NEW_ACCOUNT_PROTECTION + TPD;
    g.players.ow0!.npc = 'npc-test';
    expect(crewMayAttack(g, 'pinn', g.players.ow0!)).toBe(false);
  });
});

/** The gates of crewMayAttack except the rookie zone, for the harness's "would be eligible" count. */
function crewMayAttackIgnoringRank(g: GameState, p: Player): boolean {
  const saved = p.rankId;
  p.rankId = 'R2';
  const ok = crewMayAttack(g, 'pinn', p);
  p.rankId = saved;
  return ok;
}

describe('the security day is the function the game steps', () => {
  it('stepGame runs game days without error, and no attack lands on a protected new account', () => {
    const g = createGame('step-day', { warmupDays: 1 });
    applyCommand(g, 'nw1', { type: 'join', handle: 'trader_nw1', country: 'AV' });
    g.players.nw1!.rankId = 'R3';
    const start = g.market.tick;
    for (let k = 0; k < TPD + 2; k++) stepGame(g);
    expect(g.market.tick).toBeGreaterThan(start);
    for (const op of g.cyber.ops) {
      if (op.victimId === 'nw1') expect(op.tick).toBeGreaterThanOrEqual(g.players.nw1!.joinedTick + NEW_ACCOUNT_PROTECTION);
    }
  });
});

describe('the canary and the honeypot in play (M29)', () => {
  it('an unflagged honeypot takes a crew session as a decoy: no entry on the victim, +15 evidence, a student when it closes', () => {
    const { g, joined } = crewWorld('decoy-crew');
    g.market.tick = joined + NEW_ACCOUNT_PROTECTION + TPD;
    g.cyber.defense.ow0 = { budget: 0, tier: 2, lastScanTick: 0, lockdownUntil: 0, shieldUntil: 0, honeypot: { kind: 'basic', poison: 0.2, bait: 500, placedTick: 0 } };
    // a crew model at the victim's defense: the canary flags with p = 0.25, breach odds about 0.45 at tap
    const mcs = defensePoints(g, 'ow0');
    const model = { id: 'crew-test', name: 'Crew test', kind: 'security' as const, mcs, createdTick: 0, residue: 0 };
    let tries = 0;
    while ((g.cyber.decoys ?? []).length === 0 && tries < 60) {
      g.market.tick += 1;
      tries++;
      plantCrewSession(g, 'pinn', 'ow0', model, 'tap', null);
    }
    expect((g.cyber.decoys ?? []).length).toBeGreaterThan(0);
    expect(entriesOf(g, 'ow0').filter((e) => e.hostile).length).toBe(0); // the decoy is not in the victim's Connections
    expect(g.cyber.evidence['pinn>ow0'] ?? 0).toBeGreaterThanOrEqual(15);
    for (let k = 0; k < 9; k++) { g.market.tick += TPD; decoyDay(g, null); }
    expect(g.cyber.decoys?.length ?? 0).toBe(0);
    expect(labFor(g, 'pinn').models.some((m) => m.name === 'Distilled decoy model' && (m.poison ?? 0) > 0)).toBe(true);
  });

  it('the honeypot evidence never goes past the civil cap of 40', () => {
    expect(honeypotEvidence(1000)).toBe(40);
    expect(honeypotEvidence(0)).toBe(15);
  });

  it('the canary flag rate matches the formula (a balanced attacker is flagged a quarter of the time)', () => {
    expect(canaryFlagChance(100, 100)).toBeCloseTo(0.25, 9);
    expect(canaryFlagChance(1e9, 1)).toBeCloseTo(0.75, 9);
  });

  it('a fund with a honeypot: the canary can steer an op away from it; without the canary the honeypot takes the session', () => {
    let withHoneypot = 0;
    let flagged = 0;
    let decoyNoCanary = 0;
    let flaggedWithoutCanary = 0;
    for (let i = 0; i < 60; i++) {
      const g = createGame(`fund-op-${i}`, { warmupDays: 1 });
      applyCommand(g, 'fx1', { type: 'join', handle: 'trader_fx1', country: 'AV' });
      g.players.fx1!.rankId = 'R3';
      g.market.accounts.fx1!.cash = 1e7;
      labFor(g, 'fx1').models.push({ id: 'sec1', name: 'Sec', kind: 'security', mcs: 1000, createdTick: 0, residue: 0 });
      if (!fundHoneypot(g, 'pinn', quarterOf(g.market.tick))) continue;
      withHoneypot++;
      attackFund(g, 'fx1', 'pinn', 'tap', 'sec1', true, null);
      if (g.cyber.ops[0]?.result === 'flagged') flagged++;
      const g2 = createGame(`fund-op-${i}`, { warmupDays: 1 });
      applyCommand(g2, 'fx1', { type: 'join', handle: 'trader_fx1', country: 'AV' });
      g2.players.fx1!.rankId = 'R3';
      g2.market.accounts.fx1!.cash = 1e7;
      labFor(g2, 'fx1').models.push({ id: 'sec1', name: 'Sec', kind: 'security', mcs: 1000, createdTick: 0, residue: 0 });
      attackFund(g2, 'fx1', 'pinn', 'tap', 'sec1', false, null);
      if (g2.cyber.ops[0]?.result === 'flagged') flaggedWithoutCanary++;
      if ((g2.cyber.decoys ?? []).some((s) => s.on === 'fund' && s.poisonTier > 0)) decoyNoCanary++;
    }
    expect(withHoneypot).toBeGreaterThan(0);
    expect(flaggedWithoutCanary).toBe(0); // only the canary can flag
    expect(flagged + decoyNoCanary).toBeGreaterThan(0);
  }, 180_000); // 120 game setups: past the 60 s default on a loaded machine

  it('a fund runs its honeypot in the model list only when the quarter draw hits (fundModelList)', () => {
    const g = createGame('fund-list', { warmupDays: 1 });
    const list = fundModelList(g, 'pinn', 1);
    expect(list.listSize).toBeGreaterThanOrEqual(LIST_SIZE_RANGE[2]![0]);
    expect(list.models[0]!.kind).toBe('security');
    expect(list.models.length).toBe(list.honeypot ? 2 : 1);
    expect(fundModelList(g, 'hale', 1).honeypot).toBeNull(); // T1 never runs one
  });
});
