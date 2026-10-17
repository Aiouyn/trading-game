import { describe, expect, it } from 'vitest';
import { translate } from '@/i18n';
import { LADDER_NAMES, LADDER_PER_BAND, ladderRungs } from '@/content/rivalLadder';
import { RANKS } from '@/content/lifestyle';
import { rivalEquity } from '@/engine';
import { applyCommand, createGame, stepGame } from './game';
import { ladderFunds } from './rivalLadder';
import { rivalsBoard } from './rivalsBoard';
import { today } from './core';
import type { GameState } from './types';

// R-10-7 (rivals ladder): fictional funds, six per rank band, sitting between the band's rank threshold and the next one.
// The paths are deterministic from the seed and the day, and the board ranks the player among all of them.

function game(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1 });
  applyCommand(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
  for (let k = 0; k < 2; k++) stepGame(g);
  return g;
}

function setWorth(g: GameState, amount: number) {
  g.players.u1!.netWorth = amount;
  g.players.u1!.markNetWorth = amount;
}

const ARRIVAL = { changePct: 0 };

describe('the rival ladder (R-10-7)', () => {
  it('has six funds per rank band, ascending, each band inside its rank threshold and the next', () => {
    const rungs = ladderRungs();
    expect(rungs.length).toBe(RANKS.length * LADDER_PER_BAND);
    for (let i = 1; i < rungs.length; i++) expect(rungs[i]!.anchor).toBeGreaterThan(rungs[i - 1]!.anchor);
    for (const [i, r] of RANKS.entries()) {
      const band = rungs.filter((x) => x.band === r.id);
      expect(band.length).toBe(LADDER_PER_BAND);
      const next = RANKS[i + 1]?.threshold ?? Infinity;
      expect(band[band.length - 1]!.anchor).toBeLessThan(next);
      expect(band[0]!.anchor).toBeGreaterThanOrEqual(r.threshold);
    }
  });

  it('every fund has a unique id and a unique invented name, and none is an engine rival', () => {
    const rungs = ladderRungs();
    expect(new Set(rungs.map((r) => r.id)).size).toBe(rungs.length);
    expect(new Set(rungs.map((r) => r.name)).size).toBe(rungs.length);
    for (const names of Object.values(LADDER_NAMES)) expect(names.length).toBe(LADDER_PER_BAND);
    const engine = ['Hale & Ward', 'Pinn', 'Vetch'];
    for (const r of rungs) expect(engine.some((e) => r.name.includes(e)), r.name).toBe(false);
  });

  it('a fund path is a pure function of the seed and the day: the same whatever was asked before', () => {
    const a = ladderFunds('ladder-det-1', 50, 0);
    const b = ladderFunds('ladder-det-1', 10, 0);
    const c = ladderFunds('ladder-det-1', 50, 0);
    expect(c).toEqual(a);
    // day 10 read on its own equals day 10 inside the longer history
    for (let i = 0; i < a.length; i++) expect(a[i]!.hist[10]!.equity).toBeCloseTo(b[i]!.equity, 9);
    expect(a[0]!.hist.length).toBe(51);
  });

  it('another seed draws other paths', () => {
    const a = ladderFunds('ladder-seed-a', 30, 0);
    const b = ladderFunds('ladder-seed-b', 30, 0);
    expect(a.some((f, i) => f.equity !== b[i]!.equity)).toBe(true);
  });

  it('the paths stay near their band: no fund drifts out of its band over 400 days', () => {
    for (const f of ladderFunds('ladder-band', 400, 0)) {
      const rung = ladderRungs().find((r) => r.id === f.id)!;
      for (const h of f.hist) {
        expect(h.equity, `${f.id} day ${h.day}`).toBeGreaterThan(rung.anchor / 10);
        expect(h.equity, `${f.id} day ${h.day}`).toBeLessThan(rung.anchor * 10);
      }
    }
  });

  it('the board ranks the player among every rival (the engine three and all the ladder)', () => {
    const g = game('ladder-rank');
    for (const amount of [1_000, 50_000, 3_000_000, 800_000_000, 40_000_000_000]) {
      setWorth(g, amount);
      const b = rivalsBoard(g, 'u1', ARRIVAL)!;
      const day = today(g);
      const ladder = ladderFunds(g.seed, day, g.ledgers?.u1?.startDay ?? day);
      const engine = (g.market.config.rivals ?? []).map((d) => rivalEquity(g.market, d.id));
      const above = engine.filter((e) => e >= b.you.netWorth).length + ladder.filter((f) => f.equity >= b.you.netWorth).length;
      expect(b.you.rank, `at ${amount}`).toBe(1 + above);
      // the board shows the three engine funds and the rivals nearest the player (up to four each side)
      expect(b.rows.filter((r) => !r.id.startsWith('lad-')).length).toBe(engine.length);
      expect(b.rows.filter((r) => r.id.startsWith('lad-')).length).toBeGreaterThan(0);
    }
  });

  it('there are rivals near the player at every size up to 100 billion: some above and some below', () => {
    const g = game('ladder-near');
    for (const amount of [1_000, 50_000, 3_000_000, 800_000_000, 40_000_000_000, 100_000_000_000]) {
      setWorth(g, amount);
      const b = rivalsBoard(g, 'u1', ARRIVAL)!;
      const you = b.you.netWorth;
      expect(b.rows.some((r) => r.equity > you), `above ${amount}`).toBe(true);
      expect(b.rows.some((r) => r.equity < you), `below ${amount}`).toBe(true);
      const nearAbove = b.rows.filter((r) => r.equity > you).reduce((m, r) => Math.min(m, r.equity), Infinity);
      expect(nearAbove / you, `nearest above at ${amount}`).toBeLessThan(3);
    }
  });

  it('the next-up chip is the lowest rival above the player, of every rival', () => {
    const g = game('ladder-next');
    setWorth(g, 3_000_000);
    const b = rivalsBoard(g, 'u1', ARRIVAL)!;
    expect(b.nextUp).not.toBeNull();
    const day = today(g);
    const ladder = ladderFunds(g.seed, day, g.ledgers?.u1?.startDay ?? day).map((f) => f.equity);
    const engine = (g.market.config.rivals ?? []).map((d) => rivalEquity(g.market, d.id));
    const you = b.you.netWorth;
    const all = [...ladder, ...engine].filter((e) => e > you);
    expect(b.nextUp!.gap).toBeCloseTo(Math.min(...all) - you, 1);
  });

  it('the board stores nothing: the world is unchanged by reading it', () => {
    const g = game('ladder-pure');
    const before = JSON.stringify(g);
    rivalsBoard(g, 'u1', ARRIVAL);
    expect(JSON.stringify(g)).toBe(before);
  });

  it('the generic persona reads in French with a decimal comma and a no-break space before the percent sign', () => {
    const out = translate('fr', 'txt.rival.fund.up.0', { pct: '#pct:0.035' });
    expect(out).toMatch(/3,50\s%/);
    expect(out).not.toMatch(/\d\.\d/);
    expect(translate('en', 'txt.rival.fund.down.0', { pct: '#pct:0.035' })).toContain('3.50%');
  });
});
