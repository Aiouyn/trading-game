import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { addEcaPoints, applyLots, ECA, ECA_REGULATOR_COUNSEL, ecaDay, ecaOf, ecaScore, markTipLots, tipGainOf } from './eca';
import { ECA_TUNE } from './eca-tune';
import { ECA_FINE_FLOOR, FLOOR, regulatorVerdict, TRIBUNAL_BAR } from './court';
import { credit, debit, priceOf, TPD } from './core';
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
    // R-6C-4 (review repair): the tribunal is a logistic on evidence minus the bar, with the regulator's counsel term live
    const z = (q.evidence - TRIBUNAL_BAR) / ECA_TUNE.tribunalSlope + 0.25 * ECA_REGULATOR_COUNSEL;
    expect(q.p).toBeCloseTo(1 / (1 + Math.exp(-z)), 9);
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

  it('the insider penalty is the gain disgorged in full plus k × gain, and the fine is at most 35% of net worth; both are sinks', () => {
    const { g } = world('eca-fine');
    g.players.p1!.netWorth = 80_000;
    const nw0 = g.players.p1!.netWorth;
    const cash0 = g.market.accounts.p1!.cash;
    const v = regulatorVerdict(g, { id: 'eqF', evidence: 500, playerId: 'p1', gain: 1_000 });
    expect(v.convicted).toBe(true);
    expect(v.disgorged).toBeCloseTo(1_000, 6);
    expect(v.fine).toBeCloseTo(ECA_TUNE.insiderK * 1_000, 6);
    expect(v.fine).toBeLessThanOrEqual(0.35 * nw0 + 1e-6);
    expect(g.market.accounts.p1!.cash).toBeCloseTo(cash0 - v.fine - v.disgorged, 4);
    expect(g.economy.sinks['eca fines']).toBeCloseTo(v.fine, 6);
    expect(g.economy.sinks['eca disgorgement']).toBeCloseTo(v.disgorged, 6);
  });

  it('a small gain pays the $1,000 floor, and a large one is capped at 35% of net worth (R-6C-2)', () => {
    const { g } = world('eca-floor-fine');
    g.players.p1!.netWorth = 80_000;
    const small = regulatorVerdict(g, { id: 'eqSm', evidence: 500, playerId: 'p1', gain: 0 });
    expect(small.fine).toBeCloseTo(ECA_FINE_FLOOR, 6);
    const big = regulatorVerdict(g, { id: 'eqBig', evidence: 500, playerId: 'p1', gain: 1_000_000 });
    expect(big.disgorged).toBeLessThanOrEqual(g.players.p1!.netWorth);
    expect(big.fine).toBeLessThanOrEqual(0.35 * 80_000 + 1e-6);
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

describe('the ECA repair (6C review): cash floor, repeat, season cap, stalled investigations', () => {
  it('the fine and the disgorgement come from cash above the $5k floor, never below it (ROADMAP 2.6)', () => {
    const { g } = world('eca-floor');
    g.players.p1!.netWorth = 80_000;
    const cash = g.market.accounts.p1!.cash;
    debit(g, 'p1', cash - 6_000, 'test');
    const v = regulatorVerdict(g, { id: 'eqC', evidence: 500, playerId: 'p1', gain: 50_000 });
    expect(v.convicted).toBe(true);
    expect(g.market.accounts.p1!.cash).toBeGreaterThanOrEqual(FLOOR - 1e-6);
    expect(v.fine + v.disgorged).toBeLessThanOrEqual(1_000 + 1e-6);
  });

  it('a repeat conviction in the season is x1.5 the scheduled fine; the first is not', () => {
    const { g } = world('eca-repeat');
    credit(g, 'p1', 2_000_000, 'test');
    g.players.p1!.netWorth = 2_000_000;
    const first = regulatorVerdict(g, { id: 'eqR1', evidence: 500, playerId: 'p1', gain: 50_000, priorConvictions: 0 });
    const second = regulatorVerdict(g, { id: 'eqR2', evidence: 500, playerId: 'p1', gain: 50_000, priorConvictions: 1 });
    expect(first.fine).toBeCloseTo(ECA_TUNE.insiderK * 50_000, 4);
    expect(second.fine).toBeCloseTo(1.5 * ECA_TUNE.insiderK * 50_000, 4);
  });

  it('the season room caps a verdict: all fines of a season stay within the room left (03 section 1)', () => {
    const { g } = world('eca-room');
    credit(g, 'p1', 2_000_000, 'test');
    g.players.p1!.netWorth = 2_000_000;
    const v = regulatorVerdict(g, { id: 'eqS1', evidence: 500, playerId: 'p1', gain: 50_000, priorConvictions: 0, seasonFinesLeft: 10_000 });
    expect(v.fine).toBeCloseTo(10_000, 6);
  });

  it('the tribunal counsel moves the verdict by at most 0.75 logit, each side (R-6C-4)', () => {
    const { g } = world('eca-counsel');
    g.players.p1!.netWorth = 80_000;
    const none = regulatorVerdict(g, { id: 'eqK0', evidence: TRIBUNAL_BAR, playerId: 'p1', gain: 0 });
    const reg = regulatorVerdict(g, { id: 'eqK1', evidence: TRIBUNAL_BAR, playerId: 'p1', gain: 0, counsel: { regulator: 3 } });
    const def = regulatorVerdict(g, { id: 'eqK2', evidence: TRIBUNAL_BAR, playerId: 'p1', gain: 0, counsel: { defence: 3 } });
    expect(none.p).toBeCloseTo(0.5, 9);
    expect(reg.p).toBeCloseTo(1 / (1 + Math.exp(-0.75)), 9);
    expect(def.p).toBeCloseTo(1 / (1 + Math.exp(0.75)), 9);
  });

  it('the tribunal is a logistic on evidence minus the bar over the tuned slope (R-6C-4): far above the bar is still uncertain', () => {
    const { g } = world('eca-slope');
    g.players.p1!.netWorth = 80_000;
    const at = regulatorVerdict(g, { id: 'eqL1', evidence: TRIBUNAL_BAR + ECA_TUNE.tribunalSlope, playerId: 'p1', gain: 0 });
    expect(at.p).toBeCloseTo(1 / (1 + Math.exp(-1)), 9);
  });

  it('an investigation that stalls below the line for five days closes quietly and frees the pair for a new inquiry', () => {
    const { g, asset } = world('eca-stall');
    for (let k = 1; k <= 3; k++) day(g, asset, 90, k);
    const q = Object.values(ecaOf(g).inquiries)[0]!;
    expect(q.stage).toBe('inquiry');
    day(g, asset, 90, 4);
    expect(q.stage).toBe('investigation');
    let k = 5;
    while (q.stage === 'investigation' && k < 80) { day(g, asset, 0, k); k++; }
    expect(q.stage).toBe('closed');
    expect(ecaOf(g).open[`p1|${asset}`]).toBeUndefined();
    expect(q.letters.map((l) => l.kind)).not.toContain('verdict');
  });
});

describe('an open inquiry is never stranded (6C review repair)', () => {
  it('an open inquiry closes even when its score has been removed from the map', () => {
    const { g, asset } = world('eca-gone');
    ecaOf(g).score[`p1|${asset}`] = 70;
    for (let k = 1; k <= 3; k++) day(g, asset, 14, k);
    const q = Object.values(ecaOf(g).inquiries)[0]!;
    expect(q.stage).toBe('inquiry');
    delete ecaOf(g).score[`p1|${asset}`];
    for (let k = 4; k < 60 && q.stage === 'inquiry'; k++) day(g, asset, 0, k);
    expect(q.stage).toBe('closed');
    expect(ecaOf(g).open[`p1|${asset}`]).toBeUndefined();
  });
});

describe('the FIFO lots and the disgorged gain (R-6C-2)', () => {
  const key = 'p1|AAA';
  function fresh() {
    const { g } = world('eca-fifo');
    return ecaOf(g);
  }

  it('a sale closes the oldest lot first, and the realized gain counts only on the tipped share', () => {
    const e = fresh();
    applyLots(e, key, 10, 100, 0); // an honest lot
    applyLots(e, key, 10, 100, 10); // a tipped lot
    applyLots(e, key, -15, 120, 0); // closes 10 honest (oldest) and 5 tipped
    // the tipped share closed: 5 shares at +20
    expect(e.tipGain![key]).toBeCloseTo(100, 9);
    expect(e.lots![key]!.reduce((s, l) => s + l.qty, 0)).toBeCloseTo(5, 9);
    expect(e.lots![key]![0]!.tip).toBeCloseTo(5, 9);
  });

  it('a tipped short that is covered lower realizes the gain on the short side', () => {
    const e = fresh();
    applyLots(e, key, -10, 100, 10); // a tipped short
    applyLots(e, key, 10, 90, 0); // covers it at 90
    expect(e.tipGain![key]).toBeCloseTo(100, 9);
    expect(e.lots![key] ?? []).toHaveLength(0);
  });

  it('a loss on the tipped share is booked as a negative pool; the disgorged gain never goes below zero', () => {
    const e = fresh();
    applyLots(e, key, 10, 100, 10);
    applyLots(e, key, -10, 80, 0);
    expect(e.tipGain![key]).toBeCloseTo(-200, 9);
    const { g } = world('eca-fifo-zero');
    expect(tipGainOf(g, 'p1', 'AAA')).toBe(0);
  });

  it('an open tipped lot is not disgorged until it is closed (realized, not today\'s price)', () => {
    const e = fresh();
    applyLots(e, key, 10, 100, 10);
    expect(e.tipGain?.[key] ?? 0).toBe(0);
  });

  it('a verdict marks the tipped share of an open lot to the verdict price: the gain joins the pool once, and a later close books only what came after', () => {
    const e = fresh();
    applyLots(e, key, 10, 100, 10); // a tipped long
    applyLots(e, key, 4, 100, 0); // an honest add, a second lot
    expect(markTipLots(e, key, 130)).toBeCloseTo(300, 9); // 10 tipped shares at +30
    expect(e.tipGain![key]).toBeCloseTo(300, 9);
    // the verdict disgorges the mark (the pool goes to zero); the position is then closed at 150: only the +20 after it is booked
    e.tipGain![key] = 0;
    applyLots(e, key, -14, 150, 0);
    expect(e.tipGain![key]).toBeCloseTo(200, 9);
  });

  it('a tipped position held past the verdict disgorges its unrealized gain, and the rest stays in the pool (hold to reveal)', () => {
    const { g, asset } = world('eca-hold');
    g.players.p1!.netWorth = 80_000;
    const e = ecaOf(g);
    const k = `p1|${asset}`;
    const px = priceOf(g, asset);
    applyLots(e, k, 10, px * 0.5, 10); // a tipped long held, marked at +50%
    for (let d = 1; d <= 3; d++) day(g, asset, 70, d);
    const q = Object.values(e.inquiries)[0]!;
    let d = 4;
    while (q.stage !== 'convicted' && q.stage !== 'cleared' && d < 60) { day(g, asset, 70, d); d++; }
    const marked = 10 * (px - px * 0.5);
    if (q.stage === 'convicted') expect(q.disgorged!).toBeCloseTo(marked, 6);
    else expect(q.disgorged ?? 0).toBe(0);
    // the pool keeps what the verdict did not disgorge, so the same gain is not booked again by a later close
    expect(e.tipGain![k]).toBeCloseTo(marked - (q.disgorged ?? 0), 6);
  });

  it('a verdict disgorges the tipped gain in full, and the fine is max(floor, k x gain)', () => {
    const { g, asset } = world('eca-disgorge');
    g.players.p1!.netWorth = 80_000;
    const e = ecaOf(g);
    const k = `p1|${asset}`;
    applyLots(e, k, 10, 100, 10);
    applyLots(e, k, -10, 150, 0); // realized +500 on the tipped share
    expect(tipGainOf(g, 'p1', asset)).toBeCloseTo(500, 9);
    const v = regulatorVerdict(g, { id: 'eqG', evidence: 500, playerId: 'p1', gain: tipGainOf(g, 'p1', asset) });
    expect(v.disgorged).toBeCloseTo(500, 6);
    expect(v.fine).toBeCloseTo(Math.max(ECA_FINE_FLOOR, ECA_TUNE.insiderK * 500), 6);
  });
});
