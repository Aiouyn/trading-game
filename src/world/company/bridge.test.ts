import { describe, expect, it, vi } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { applyCommand, createGame, stepGame } from '../game';
import { credit, netWorthBreakdown } from '../core';
import { newOutput } from '../core';
import type { CompanyReject } from './types';
import { companyDay, refusalKeys } from './bridge';
import type { GameState } from '../types';

// The company world runs through the same command log and day step as the rest of the world.
// Each case warms a live world, so it can take a few seconds under a full parallel run.
vi.setConfig({ testTimeout: 30_000 });
const CODES: CompanyReject['code'][] = [
  'notRank', 'capitalTooLow', 'alreadyFounded', 'insufficientFunds', 'unknownCompany', 'notFounder', 'headcountCap',
  'notEnoughStaff', 'noRdStaff', 'projectBusy', 'productCap', 'unknownProduct', 'priceOutOfBand', 'negativeAmount',
  'roundDilutionCap', 'investorCash', 'plantBuilding', 'unknownAction', 'noValuation', 'marketingCap', 'noLaunchCredit',
];

function world(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  const r = applyCommand(g, 'u1', { type: 'join', handle: 'founder_u1', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  g.players.u1!.rankId = 'R2';
  credit(g, 'u1', 500_000, 'test');
  return g;
}

describe('the company commands through the world', () => {
  it('found and act through applyCommand; a refusal carries its code and its copy keys', () => {
    const g = world('bridge-1');
    const f = applyCommand(g, 'u1', { type: 'company.found', name: 'Acme', sector: 'tech', cityId: 'av', capital: 150_000 });
    expect(f.ok).toBe(true);
    const id = (f.data as { id: string }).id;
    const hire = applyCommand(g, 'u1', { type: 'company.act', companyId: id, action: { kind: 'hire', role: 'ops', n: 2 } });
    expect(hire.ok).toBe(true);
    const bad = applyCommand(g, 'u1', { type: 'company.act', companyId: id, action: { kind: 'hire', role: 'ops', n: 40 } });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe('headcountCap');
    const reject = bad.data as CompanyReject;
    expect(reject.code).toBe('headcountCap');
    expect(refusalKeys(reject).what).toBe('company.refusal.headcountCap.what');
  });

  it('a day step advances the company world and leaves a world without companies untouched', () => {
    const plain = world('bridge-2');
    const id = (applyCommand(plain, 'u1', { type: 'company.found', name: 'Acme', sector: 'tech', cityId: 'av', capital: 150_000 }).data as { id: string }).id;
    for (let k = 0; k < 2 * 720 + 5; k++) stepGame(plain);
    const c = plain.companies!.companies[id]!;
    // the day step ran: the company booked its ledger for the days after founding
    expect(c.ledger.length).toBeGreaterThan(0);
    expect(c.closed.length).toBe(0);
    // no company world: the day hook is a no-op
    const none = createGame('bridge-3', { warmupDays: 1, npcs: false });
    expect(none.companies).toBeUndefined();
    companyDay(none, newOutput());
    expect(none.companies).toBeUndefined();
    expect(JSON.stringify(none)).not.toContain('"companies"');
  });

  it('an old save (no companies key) loads and steps as before', () => {
    const g = createGame('bridge-4', { warmupDays: 1, npcs: false });
    const restored = JSON.parse(JSON.stringify(g)) as GameState;
    expect(restored.companies).toBeUndefined();
    stepGame(restored);
    expect(restored.companies).toBeUndefined();
  });
});

describe('copy coverage (refusals, notes and goals in English and French)', () => {
  it('every reject code has what, why and do in both languages, with the same variables', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const code of CODES) {
      for (const part of ['what', 'why', 'do']) {
        const key = `company.refusal.${code}.${part}`;
        const e = (en as Record<string, string>)[key];
        const f = (fr as Record<string, string>)[key];
        expect(e, key).toBeTruthy();
        expect(f, key).toBeTruthy();
        expect(vars(f!), key).toBe(vars(e!));
      }
    }
  });

  it('the notes and goals have French text', () => {
    for (const k of ['company.note.founded', 'company.note.filed', 'company.note.tier.seed', 'company.note.tier.growth', 'company.note.tier.late', 'company.note.distress', 'company.note.repay', 'company.goal.firstHire', 'company.goal.firstRevenue', 'company.goal.breakEven', 'company.goal.firstRound']) {
      expect((fr as Record<string, string>)[k], k).toBeTruthy();
    }
  });
});

describe('review fixes: the world exists only after a founding (spec 5, C2)', () => {
  it('a refused command never creates a company world, and a failed founding leaves none behind', () => {
    const g = world('bridge-5');
    const act = applyCommand(g, 'u1', { type: 'company.act', companyId: 'co9', action: { kind: 'hire', role: 'ops', n: 1 } });
    expect(act.ok).toBe(false);
    expect(act.error).toBe('unknownCompany');
    expect(g.companies).toBeUndefined();
    const poor = applyCommand(g, 'u1', { type: 'company.found', name: 'Tiny', sector: 'tech', cityId: 'av', capital: 1_000 });
    expect(poor.ok).toBe(false);
    expect(g.companies).toBeUndefined();
    for (let k = 0; k < 3; k++) stepGame(g);
    expect(g.companies).toBeUndefined();
  });

  it('net worth counts a founded private company at 0.85 x V x ownership, so founding costs only the haircut', () => {
    const g = world('bridge-6');
    const before = netWorthBreakdown(g, 'u1');
    expect(before.companies).toBe(0);
    const f = applyCommand(g, 'u1', { type: 'company.found', name: 'Acme', sector: 'tech', cityId: 'av', capital: 150_000 });
    expect(f.ok).toBe(true);
    const after = netWorthBreakdown(g, 'u1');
    // V of a company whose only asset is its cash is the cash itself; the founder owns every share at founding
    expect(after.companies).toBeCloseTo(0.85 * 150_000, 4);
    expect(after.cash).toBeCloseTo(before.cash - 150_000, 4);
  });
});
