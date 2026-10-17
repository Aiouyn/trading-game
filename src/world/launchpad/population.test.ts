import { describe, expect, it } from 'vitest';
import { CREATOR, launch, lpWorld } from './fixture';
import { cohortsOf } from './cohorts';
import { MICROFLOW, tokenTraders } from './microflow';
import { buyCurve } from './trade';

describe('funded launchpad participant population', () => {
  it('adds actors without changing the hidden archetype or attention draw for a given seed', () => {
    const original = { traders: MICROFLOW.traders, population: MICROFLOW.population };
    try {
      MICROFLOW.traders = 24;
      MICROFLOW.population = 240;
      const oldWorld = lpWorld('stable-launch-rng');
      expect(launch(oldWorld, CREATOR, 'STBL').ok).toBe(true);
      const oldPa = JSON.stringify(oldWorld.launchpad!.tokens.STBL!.micro!.pa);

      MICROFLOW.traders = 64;
      MICROFLOW.population = 1_200;
      const expandedWorld = lpWorld('stable-launch-rng');
      expect(launch(expandedWorld, CREATOR, 'STBL').ok).toBe(true);
      const expandedToken = expandedWorld.launchpad!.tokens.STBL!;
      expect(tokenTraders(expandedWorld, expandedToken)).toHaveLength(64);
      expect(JSON.stringify(expandedToken.micro!.pa)).toBe(oldPa);
    } finally {
      MICROFLOW.traders = original.traders;
      MICROFLOW.population = original.population;
    }
  });

  it('backfills new world accounts once and expands old coin state without replacing existing wallets', () => {
    const original = { traders: MICROFLOW.traders, population: MICROFLOW.population };
    try {
      MICROFLOW.traders = 24;
      MICROFLOW.population = 240;
      const g = lpWorld('population-migration');
      expect(launch(g, CREATOR, 'MIGR').ok).toBe(true);
      const t = g.launchpad!.tokens.MIGR!;
      const legacyTraders = tokenTraders(g, t);
      expect(legacyTraders).toHaveLength(24);

      const buyer = legacyTraders[0]!;
      expect(buyCurve(g, null, t.ticker, 50_000, 1, null, true, false, buyer).ok).toBe(true);
      buyer.attn = 0.7;
      buyer.attnUntil = g.market.tick + 90;
      const oldIds = legacyTraders.map(w => w.id);
      const oldCash = new Map(oldIds.map(id => [id, g.market.accounts[id]!.cash]));
      const oldPa = t.micro!.pa;
      const oldPaJson = JSON.stringify(oldPa);
      const oldCohorts = JSON.stringify(cohortsOf(t));
      const faucetBefore = g.economy.faucets.npcRetail ?? 0;

      MICROFLOW.traders = 64;
      MICROFLOW.population = 1_200;
      const expanded = tokenTraders(g, t);

      expect(expanded).toHaveLength(64);
      expect(oldIds.every(id => expanded.some(w => w.id === id))).toBe(true);
      for (const [id, cash] of oldCash) expect(g.market.accounts[id]!.cash).toBe(cash);
      expect(buyer.attn).toBe(0.7);
      expect(buyer.attnUntil).toBe(g.market.tick + 90);
      expect(t.micro!.pa).toBe(oldPa);
      expect(JSON.stringify(t.micro!.pa)).toBe(oldPaJson);
      expect(JSON.stringify(cohortsOf(t))).toBe(oldCohorts);

      const addedCash = Array.from({ length: 960 }, (_, i) => g.market.accounts[`lp:npc:trader:${i + 240}`]!.cash);
      expect(addedCash.every(cash => cash >= 2_000 && cash <= 24_000)).toBe(true);
      expect((g.economy.faucets.npcRetail ?? 0) - faucetBefore).toBeCloseTo(addedCash.reduce((sum, cash) => sum + cash, 0), 6);

      // A second access must not refill or otherwise change the established account balances.
      const cashAfterFirstAccess = JSON.stringify(g.market.accounts);
      tokenTraders(g, t);
      expect(JSON.stringify(g.market.accounts)).toBe(cashAfterFirstAccess);
    } finally {
      MICROFLOW.traders = original.traders;
      MICROFLOW.population = original.population;
    }
  });
});
