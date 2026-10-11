import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { addEcaPoints, ECA, ecaDay, ecaOf, ecaScore } from './eca';
import { regulatorVerdict, TRIBUNAL_BAR } from './court';
import { credit, TPD } from './core';
import type { GameState } from './types';

// The ECA (M16 v2, ROADMAP 2.5, 03 §10.2). A score per account and asset, inquiry at 60 for three game days, investigation at 80
// (or 60 with a tip), a tribunal at 55 evidence, and an S5 fine booked as a sink. Nothing is shown before a verdict.

function world(seed: string): { g: GameState; asset: string } {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  applyCommand(g, 'p1', { type: 'join', handle: 'eca_one', country: 'AV' });
  credit(g, 'p1', 80_000, 'test');
  const asset = g.market.config.assets.find((d) => d.assetClass === 'stock')!.id;
  return { g, asset };
}

/** One game day: the points are added, then the day closes (the market steps are not needed for the regulator's logic). */
function day(g: GameState, asset: string, points: number, k: number): void {
  g.market = { ...g.market, tick: k * TPD + 1 };
  if (points > 0) addEcaPoints(g, 'p1', asset, points);
  ecaDay(g, null);
}

describe('the ECA score and inquiry (M16 v2)', () => {
  it('a score decays to 0.8 a day, adds the day points, and is capped at 100', () => {
    const { g, asset } = world('eca-score');
    day(g, asset, 50, 1);
    expect(ecaScore(g, 'p1', asset)).toBe(50);
    day(g, asset, 0, 2);
    expect(ecaScore(g, 'p1', asset)).toBeCloseTo(40, 6);
    day(g, asset, 500, 3);
    expect(ecaScore(g, 'p1', asset)).toBe(ECA.cap);
  });

  it('three game days at or above 60 open an inquiry with a notice letter in three parts', () => {
    const { g, asset } = world('eca-inquiry');
    day(g, asset, 70, 1);
    day(g, asset, 70, 2);
    expect(Object.keys(ecaOf(g).inquiries).length).toBe(0);
    day(g, asset, 70, 3);
    const inqs = Object.values(ecaOf(g).inquiries);
    expect(inqs.length).toBe(1);
    expect(inqs[0]!.stage).toBe('inquiry');
    expect(inqs[0]!.letters[0]!.kind).toBe('notice');
    expect(inqs[0]!.letters[0]!.what.key).toBe('eca.notice.what');
    expect(inqs[0]!.letters[0]!.why.key).toBe('eca.notice.why');
    expect(inqs[0]!.letters[0]!.do.key).toBe('eca.notice.do');
    expect(inqs[0]!.evidence).toBeGreaterThanOrEqual(ECA.inquiryEvidenceMin);
    expect(inqs[0]!.evidence).toBeLessThanOrEqual(ECA.inquiryEvidenceMax);
  });

  it('a sustained pattern goes to investigation, gathers evidence, and reaches a tribunal verdict', () => {
    const { g, asset } = world('eca-verdict');
    g.players.p1!.netWorth = 80_000;
    const before = g.players.p1!.netWorth;
    for (let k = 1; k <= 3; k++) day(g, asset, 70, k);
    const q = Object.values(ecaOf(g).inquiries)[0]!;
    expect(q.stage).toBe('inquiry');
    let k = 4;
    while (q.stage !== 'convicted' && q.stage !== 'cleared' && k < 60) { day(g, asset, 70, k); k++; }
    expect(['convicted', 'cleared']).toContain(q.stage);
    expect(q.letters.map((l) => l.kind)).toContain('investigation');
    expect(q.letters[q.letters.length - 1]!.kind).toBe('verdict');
    if (q.stage === 'convicted') {
      expect(q.fine).toBeGreaterThan(0);
      expect(g.economy.sinks['eca fines']).toBeCloseTo(q.fine!, 6);
    }
    expect(g.players.p1!.netWorth).toBeLessThanOrEqual(before + 1);
  });

  it('an inquiry closes quietly even after its score has decayed to nothing', () => {
    const { g, asset } = world('eca-vanish');
    ecaOf(g).score[`p1|${asset}`] = 70;
    for (let k = 1; k <= 3; k++) day(g, asset, 14, k);
    const q = Object.values(ecaOf(g).inquiries)[0]!;
    expect(q.stage).toBe('inquiry');
    for (let k = 4; k < 60 && q.stage === 'inquiry'; k++) day(g, asset, 0, k);
    expect(q.stage).toBe('closed');
    expect(ecaOf(g).open[`p1|${asset}`]).toBeUndefined();
  });

  it('a score that falls back below the line for five days closes an inquiry quietly', () => {
    const { g, asset } = world('eca-quiet');
    // a score of 70 held by 14 points a day (below the investigation line of 80), then the pattern stops
    ecaOf(g).score[`p1|${asset}`] = 70;
    for (let k = 1; k <= 3; k++) day(g, asset, 14, k);
    const q = Object.values(ecaOf(g).inquiries)[0]!;
    expect(q.stage).toBe('inquiry');
    for (let k = 4; k <= 4 + ECA.quietDaysClose + 2 && q.stage === 'inquiry'; k++) day(g, asset, 0, k);
    expect(q.stage).toBe('closed');
    expect(ecaOf(g).open[`p1|${asset}`]).toBeUndefined();
  });
});

describe('the tribunal-lite (court.ts regulatorVerdict)', () => {
  it('at the bar the verdict is a coin flip; far above it the account is convicted; far below it is cleared', () => {
    const { g } = world('eca-tribunal');
    g.players.p1!.netWorth = 80_000;
    const at = regulatorVerdict(g, { id: 'eqT1', evidence: TRIBUNAL_BAR, playerId: 'p1', gain: 0 });
    expect(at.p).toBeCloseTo(0.5, 6);
    const high = regulatorVerdict(g, { id: 'eqT2', evidence: 200, playerId: 'p1', gain: 0 });
    expect(high.convicted).toBe(true);
    expect(high.p).toBeGreaterThan(0.99);
    const low = regulatorVerdict(g, { id: 'eqT3', evidence: 0, playerId: 'p1', gain: 0 });
    expect(low.p).toBeLessThan(0.02);
  });

  it('the S5 fine is at most 35% of net worth, and the disgorgement is a sink too: cash falls by exactly both', () => {
    const { g } = world('eca-fine');
    g.players.p1!.netWorth = 80_000;
    const nw0 = g.players.p1!.netWorth;
    const cash0 = g.market.accounts.p1!.cash;
    const v = regulatorVerdict(g, { id: 'eqF', evidence: 500, playerId: 'p1', gain: 1_000 });
    expect(v.convicted).toBe(true);
    expect(v.fine).toBeLessThanOrEqual(0.35 * nw0 + 1e-6);
    expect(v.disgorged).toBeLessThanOrEqual(1_000);
    expect(g.market.accounts.p1!.cash).toBeCloseTo(cash0 - v.fine - v.disgorged, 4);
    expect(g.economy.sinks['eca fines']).toBeCloseTo(v.fine, 6);
    expect(g.economy.sinks['eca disgorgement']).toBeCloseTo(v.disgorged, 6);
  });

  it('the same inquiry id gives the same verdict (keyed draw, so replays agree)', () => {
    const a = world('eca-det').g;
    const b = world('eca-det').g;
    const va = regulatorVerdict(a, { id: 'eqD', evidence: 56, playerId: 'p1', gain: 0 });
    const vb = regulatorVerdict(b, { id: 'eqD', evidence: 56, playerId: 'p1', gain: 0 });
    expect(va.convicted).toBe(vb.convicted);
    expect(va.fine).toBe(vb.fine);
  });
});
