import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { TPD } from './core';
import { decoyDay, defenseTier, deployHoneypot, entriesOf, plantSession } from './cyber';
import { labFor } from './lab';
import { canaryFlagChance, HONEYPOT_COST, honeypotEvidence, inheritedPoison } from './honeypots';
import type { GameState, Model } from './types';

// M29 (ROADMAP §2.3) in play: a player places a honeypot, an attacker meets it with or without the canary, the decoy session
// closes into a poisoned student, and the defender's evidence is capped. The numbers are the §2.3 ones.

function world(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1 });
  for (const id of ['atk', 'vic']) {
    applyCommand(g, id, { type: 'join', handle: `trader_${id}`, country: 'AV' });
    g.market.accounts[id]!.cash = 1e8;
  }
  const a = g.players.atk!;
  a.rankId = 'R3';
  a.shieldUntil = 0;
  const v = g.players.vic!;
  v.rankId = 'R3';
  v.shieldUntil = 0;
  v.joinedTick = -1000 * TPD;
  v.online = true;
  const model: Model = { id: 'sec', name: 'Sec', kind: 'security', mcs: 800, createdTick: 0, residue: 0 };
  labFor(g, 'atk').models.push({ ...model });
  labFor(g, 'vic').models.push({ ...model, id: 'vsec', mcs: 800 });
  g.market.tick = 3 * TPD;
  return g;
}

/** An attempt with the cooldown and the live-session cap cleared, so each try is a clean roll. */
function attempt(g: GameState, canary: boolean, k: number): void {
  g.cyber.cooldowns = {};
  g.cyber.decoys = [];
  g.market.tick += 1 + k;
  plantSession(g, 'atk', 'vic', 'tap', 'sec', null, canary);
}

describe('placing a honeypot (the defender side)', () => {
  it('costs its price as a security sink, needs a model and the tier, and the bait is the best model times the ratio', () => {
    const g = world('place');
    const cash0 = g.market.accounts.vic!.cash;
    expect(deployHoneypot(g, 'vic', 'basic', 1.25, null).ok).toBe(true);
    expect(g.market.accounts.vic!.cash).toBeCloseTo(cash0 - HONEYPOT_COST.basic, 6);
    expect(g.cyber.defense.vic!.honeypot!.bait).toBeCloseTo(800 * 1.25, 6);
    expect(g.cyber.defense.vic!.honeypot!.poison).toBe(0.2);
    expect(deployHoneypot(g, 'vic', 'basic', 2, null).ok).toBe(false); // the bait is 0.5 to 1.25 times the best model
    expect(deployHoneypot(g, 'vic', 'basic', 0.4, null).ok).toBe(false);
    expect(deployHoneypot(g, 'vic', 'frontier', 1, null).ok).toBe(defenseTier(g, 'vic') >= 4); // frontier needs defense tier 4
    expect(deployHoneypot(g, 'rookie', 'basic', 1, null).ok).toBe(false); // an unknown player
  });

  it('replaces the honeypot in place: one at a time', () => {
    const g = world('replace');
    deployHoneypot(g, 'vic', 'basic', 1, null);
    deployHoneypot(g, 'vic', 'basic', 0.5, null);
    expect(g.cyber.defense.vic!.honeypot!.bait).toBeCloseTo(400, 6);
  });
});

describe('an attempt meets the honeypot (the attacker side)', () => {
  it('a session that goes into the honeypot leaves no Connections entry, and the defender gets the plant evidence', () => {
    const g = world('decoy');
    deployHoneypot(g, 'vic', 'basic', 1, null);
    const ops: string[] = [];
    for (let k = 0; k < 60 && !ops.includes('decoy'); k++) {
      attempt(g, false, k);
      ops.push(g.cyber.ops[0]!.result);
    }
    expect(ops).toContain('decoy');
    expect(entriesOf(g, 'vic').filter((e) => e.hostile).length).toBe(0);
    expect(g.cyber.evidence['atk>vic'] ?? 0).toBeGreaterThanOrEqual(15);
    // the thief's own view of the op is a plant, not a decoy (the view maps it)
    expect(g.cyber.decoys!.every((s) => s.on === 'honeypot' && s.targetId === 'vic')).toBe(true);
  });

  it('a canary check can flag the honeypot and keep the attempt out of it; the thief is told it stayed out', () => {
    const g = world('canary');
    deployHoneypot(g, 'vic', 'basic', 1, null);
    for (let k = 0; k < 60; k++) attempt(g, true, k);
    expect(g.players.atk!.inbox.some((n) => n.msg?.key === 'security.msg.canary')).toBe(true);
    expect(g.cyber.ops.some((o) => o.result !== 'decoy')).toBe(true);
    // the canary is priced at +20% of the op
    expect(canaryFlagChance(800, 100)).toBeGreaterThan(0.25);
  });

  it('a closed decoy session leaves the thief a student built from the bait, poisoned by the honeypot tier', () => {
    const g = world('student');
    deployHoneypot(g, 'vic', 'advanced', 1, null);
    for (let k = 0; k < 60 && (g.cyber.decoys ?? []).length === 0; k++) attempt(g, false, k);
    expect((g.cyber.decoys ?? []).length).toBeGreaterThan(0);
    for (let d = 0; d < 9; d++) { g.market.tick += TPD; decoyDay(g, null); }
    expect(g.cyber.decoys ?? []).toEqual([]);
    const student = labFor(g, 'atk').models.find((m) => m.name === 'Distilled decoy model');
    expect(student).toBeDefined();
    expect(student!.poison).toBeGreaterThan(0);
    expect(student!.poison!).toBeLessThanOrEqual(0.4); // advanced poison 0.4 at most
    expect(student!.mcs).toBeLessThan(800 * 1.0); // the bait cut by the progress and the poison
  });

  it('the evidence on a honeypot caps at 40 alone, whatever the hours', () => {
    expect(honeypotEvidence(0)).toBe(15);
    expect(honeypotEvidence(9)).toBe(40);
    expect(honeypotEvidence(10_000)).toBe(40);
    expect(inheritedPoison(0.6, 0.85)).toBeCloseTo(0.6, 9);
    expect(inheritedPoison(0.6, 0)).toBeCloseTo(0.24, 9);
  });

  it('a whole game step with a honeypot placed runs without error and keeps the defender clean', () => {
    const g = world('step');
    deployHoneypot(g, 'vic', 'basic', 1, null);
    for (let k = 0; k < 2 * 720; k++) stepGame(g);
    expect(g.players.vic!.netWorth).toBeGreaterThan(0);
  });
});
