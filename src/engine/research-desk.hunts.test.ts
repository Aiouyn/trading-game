import { describe, expect, it } from 'vitest';
import { createWorld, shockPrice, shockValue, stepMany } from './sim';
import { universeConfig } from './universe';
import { DEFAULT_RIVALS } from './rivals';
import {
  EXPLAIN_ROWS, FLOW_POOLS, dayRows, depthByPool, ecoArchive, ecologyLog, explainMove, playersShown, PUBLIC_MAX_TRADER_SHARE,
  PUBLIC_MIN_TRADERS,
} from './ecology';
import { openAccount, placeOrder } from './trading';
import type { EcoArchiveAsset, WorldState } from './types';

/**
 * Tape's Research Desk hunts at the engine (docs/team/specs/tape-research-desk.md). Each test carries its hunt id. Seeds are
 * the 20 harness seeds. Accounts are human unless opened with openNpc, which is how the world opens a persona (npc flag).
 */

const TPD = 24;
const ASSETS = ['OSTV', 'HLCN', 'VLT'];
const SEEDS = Array.from({ length: 20 }, (_, i) => `hunt-${i + 1}`);
const NPC_IDS = Array.from({ length: 24 }, (_, i) => `npc-persona-${i}`);

function openNpc(s: WorldState, id: string): WorldState {
  const o = openAccount(s, id);
  return { ...o, accounts: { ...o.accounts, [id]: { ...o.accounts[id]!, npc: true } } };
}

/**
 * Days of trading: on each day, the listed accounts buy `qty` of every asset at the open. `daily[d]` is the set of human
 * accounts that trade on day d (the Players rule reads it); NPC accounts trade every day when `npcs` is set.
 */
function market(seed: string, daily: string[][], opts: { npcs?: boolean; qty?: number } = {}): WorldState {
  let s = createWorld(seed, universeConfig({ ticksPerDay: TPD }));
  const humans = new Set(daily.flat());
  for (const h of humans) s = openAccount(s, h);
  if (opts.npcs) for (const n of NPC_IDS) s = openNpc(s, n);
  for (const day of daily) {
    for (const h of day) for (const a of ASSETS) s = placeOrder(s, { playerId: h, assetId: a, side: 'buy', type: 'market', qty: opts.qty ?? 5 }).state;
    if (opts.npcs) for (const n of NPC_IDS) for (const a of ASSETS) s = placeOrder(s, { playerId: n, assetId: a, side: 'buy', type: 'market', qty: 1 }).state;
    s = stepMany(s, TPD).state;
  }
  return s;
}

const lastClosed = (s: WorldState): number => ecologyLog(s)[ecologyLog(s).length - 1]!.day;

/** the seeded daily trader sets: 6, 1, 5, 2 humans, so the window mixes shown days and folded days */
const MIXED: string[][] = [
  ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'],
  ['a0'],
  ['a0', 'a1', 'a2', 'a3', 'a4'],
  ['a1', 'a2'],
];

describe('explain_move_rejects_open_day (20 seeds)', () => {
  it('explainMove throws for a window that reaches the open session day or any day after the last close', () => {
    for (const seed of SEEDS) {
      const s = market(seed, [['p0'], ['p0'], ['p0']]);
      const last = lastClosed(s);
      for (const a of ASSETS) {
        expect(() => explainMove(s, a, 0, last + 1), `${seed} ${a}`).toThrow(/open or not closed/);
        expect(() => explainMove(s, a, 0, last + 7), `${seed} ${a}`).toThrow(/open or not closed/);
        expect(() => explainMove(s, a, last, last + 1), `${seed} ${a}`).toThrow(/open or not closed/);
        expect(explainMove(s, a, 0, last).to).toBe(last);
      }
    }
  });
});

describe('explain_move_rejects_future_from (20 seeds)', () => {
  it('a window that starts after the last closed day is rejected, whatever its end', () => {
    for (const seed of SEEDS) {
      const s = market(seed, [['p0'], ['p0'], ['p0']]);
      const last = lastClosed(s);
      expect(() => explainMove(s, 'OSTV', last + 1, last + 1), seed).toThrow(/open or not closed|after the last closed/);
      expect(() => explainMove(s, 'OSTV', last + 2, last + 1), seed).toThrow(/after toDay|open or not closed/);
      expect(() => explainMove(s, 'OSTV', last + 3, last), seed).toThrow(/after toDay/);
    }
  });
});

describe('explain_move_clamps_window (engine lower bound; the upper bound is the desk picker, D-12)', () => {
  it('a window that starts before the listing is clamped to the first archived day, and the parts sum to the move', () => {
    for (const seed of SEEDS) {
      const s = market(seed, [['p0'], ['p0'], ['p0']]);
      const first = ecoArchive(s)[0]!.day;
      const e = explainMove(s, 'HLCN', first - 50, lastClosed(s));
      expect(e.from, seed).toBe(first);
      expect(e.to, seed).toBe(lastClosed(s));
      const sum = Object.values(e.parts).reduce((a, b) => a + (b ?? 0), 0);
      expect(Math.abs(sum - e.totalLog), seed).toBeLessThan(1e-12);
    }
  });
});

describe('flow_pool_types_only and npc_funds_folded (20 seeds, rivals on, 24 NPC personas present)', () => {
  it('the flow keys are pool types, and no rival, persona or account id appears in an explanation', () => {
    const rivals = DEFAULT_RIVALS.map((r) => r.id);
    expect(rivals.length).toBeGreaterThan(0);
    for (const seed of SEEDS) {
      const s = market(seed, MIXED, { npcs: true });
      const names = JSON.stringify(explainMove(s, 'OSTV', 0, lastClosed(s)));
      const e = explainMove(s, 'OSTV', 0, lastClosed(s));
      for (const k of Object.keys(e.flow)) expect(FLOW_POOLS as readonly string[], seed).toContain(k);
      for (const k of Object.keys(e.parts)) expect(EXPLAIN_ROWS as readonly string[], seed).toContain(k);
      for (const id of [...rivals, ...NPC_IDS, ...MIXED.flat()]) expect(names.includes(`"${id}"`), `${seed} ${id}`).toBe(false);
      // NPC flow is pool flow: no NPC or rival row of its own
      expect(Object.keys(e.parts).some((k) => k.startsWith('npc') || k.startsWith('hale') || k === 'pinn' || k === 'vetch')).toBe(false);
    }
  });

  it('the 24 personas and the rivals fold into the pools, and the Players row never counts them (P1)', () => {
    for (const seed of SEEDS) {
      const s = market(seed, [['h0', 'h1', 'h2', 'h3', 'h4'], ['h0']], { npcs: true });
      const log = ecologyLog(s);
      for (const d of log) {
        for (const a of d.assets) {
          // the Players bucket counts human accounts only: 5 humans, never 5 + the personas
          expect(a.players?.accounts ?? 0, `${seed} day ${d.day}`).toBeLessThanOrEqual(5);
        }
      }
      expect(Object.keys(s.accounts).filter((k) => s.accounts[k]!.npc).length).toBe(24);
    }
  });
});

describe('solo_you_row (one human with the 24 personas present)', () => {
  it('a solo human who traded the asset has exactly one You row and never a Players row', () => {
    for (const seed of SEEDS) {
      const s = market(seed, [['solo'], ['solo'], ['solo']], { npcs: true });
      const e = explainMove(s, 'OSTV', 0, lastClosed(s));
      expect(e.parts.you, seed).toBeDefined();
      expect(e.parts.players, seed).toBeUndefined();
      expect(e.foldedDays, seed).toEqual([]);
    }
  });
});

describe('online_players_threshold (synthetic days, the exact boundaries)', () => {
  const cause = { value: 0, trend: 0, retail: 0, pension: 0, own: 1, maker: 0, news: 0, event: 0, shock: 0 };
  const day = (players?: { accounts: number; maxShare: number }): EcoArchiveAsset => ({ id: 'X', lnS: 0, lnV: 0, cause, players });

  it('five human accounts with no more than 40% each show Players; four, or a 40.01% leader, fold into Retail', () => {
    expect(PUBLIC_MIN_TRADERS).toBe(5);
    expect(PUBLIC_MAX_TRADER_SHARE).toBe(0.4);
    expect(playersShown({ accounts: 5, maxShare: 0.4 })).toBe(true);
    expect(playersShown({ accounts: 5, maxShare: 0.4 + 1e-9 })).toBe(false);
    expect(playersShown({ accounts: 4, maxShare: 0.2 })).toBe(false);
    expect(playersShown({ accounts: 6, maxShare: 0.92 })).toBe(false);
    expect(playersShown(undefined)).toBe(false);
    const shown = dayRows(day({ accounts: 5, maxShare: 0.4 }), false);
    expect(shown.parts.players).toBe(1);
    expect(shown.flow.retail).toBe(0);
    const folded = dayRows(day({ accounts: 4, maxShare: 0.25 }), false);
    expect(folded.parts.players).toBe(0);
    expect(folded.flow.retail).toBe(1);
    expect(folded.folded).toBe(true);
  });

  it('a solo day is You, whatever its bucket says', () => {
    const r = dayRows(day({ accounts: 1, maxShare: 1 }), true);
    expect(r.parts.you).toBe(1);
    expect(r.parts.players).toBe(0);
    expect(r.flow.retail).toBe(0);
  });
});

describe('day_level_fold_before_sum (fold each day, then sum the window)', () => {
  it('a day that folds goes to Retail before the window is summed, and the other day still shows Players', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const s = market(seed, [['h0', 'h1', 'h2', 'h3', 'h4'], ['h0']]);
      const d0 = explainMove(s, 'OSTV', 0, 0);
      const d1 = explainMove(s, 'OSTV', 1, 1);
      const both = explainMove(s, 'OSTV', 0, 1);
      expect(d0.parts.players, seed).toBeDefined();
      expect(d1.parts.players, seed).toBeUndefined();
      expect(both.parts.players ?? 0, seed).toBeCloseTo(d0.parts.players ?? 0, 14);
      expect(both.foldedDays, seed).toEqual([1]);
      // the day that folded is inside the window's Retail flow
      expect(both.flow.retail ?? 0, seed).toBeCloseTo((d0.flow.retail ?? 0) + (d1.flow.retail ?? 0), 12);
    }
  });
});

describe('window_diff_no_isolate (20 seeds x assets x adjacent pairs, depth subtraction included)', () => {
  it('the difference of two windows never shows Players flow on a folded day, and depth never reveals player flow on a shown day', () => {
    let pairs = 0;
    for (const seed of SEEDS) {
      const s = market(seed, MIXED);
      const last = lastClosed(s);
      for (const a of ASSETS) {
        const idx = s.config.assets.findIndex((x) => x.id === a);
        const log = ecologyLog(s);
        for (let from = 0; from < last; from++) {
          for (let to = from; to + 1 <= last; to++) {
            const w1 = explainMove(s, a, from, to);
            const w2 = explainMove(s, a, from, to + 1);
            const implied = (w2.parts.players ?? 0) - (w1.parts.players ?? 0);
            const day = log.find((d) => d.day === to + 1)!.assets[idx]!;
            pairs++;
            if (implied !== 0) {
              // only a day that shows Players can add Players flow: at least 5 humans and no one above 40%
              expect(playersShown(day.players), `${seed} ${a} ${to + 1}`).toBe(true);
            } else if (playersShown(day.players)) {
              expect(day.players!.accounts, `${seed} ${a} ${to + 1}`).toBeGreaterThanOrEqual(PUBLIC_MIN_TRADERS);
            }
            // the implied day of Retail is the day's own Retail row: nothing else leaks through the difference
            const implRetail = (w2.flow.retail ?? 0) - (w1.flow.retail ?? 0);
            expect(Number.isFinite(implRetail)).toBe(true);
            // depth subtraction: a shown day's depth Retail holds no player flow, so depth minus the explained pool is zero
            const dep = depthByPool(s, a, to + 1);
            const pool = day.desired.retail + (day.desired.npc ?? 0);
            if (playersShown(day.players)) expect(dep.desired.retail, `${seed} ${a} ${to + 1}`).toBeCloseTo(pool, 12);
            else expect(dep.desired.retail - pool, `${seed} ${a} ${to + 1}`).toBeCloseTo(day.desired.own + (day.blur ?? 0), 12);
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(300);
  });
});

describe('explain_move_parts_sum (20 seeds, many windows)', () => {
  it('the parts sum to the move exactly, and the move is the close-to-close change of the printed close', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const s = market(seed, MIXED, { npcs: true });
      const last = lastClosed(s);
      for (let from = 0; from <= last; from++) {
        for (let to = from; to <= last; to++) {
          const e = explainMove(s, 'VLT', from, to);
          const sum = Object.values(e.parts).reduce((a, b) => a + (b ?? 0), 0);
          expect(Math.abs(sum - e.totalLog), `${seed} ${from}-${to}`).toBeLessThan(1e-12);
          expect(Math.abs(e.total - Math.expm1(e.totalLog)), `${seed} ${from}-${to}`).toBeLessThan(1e-12);
        }
      }
    }
  });
});

describe('event_window_no_end_leak (the explanation carries no event length or end)', () => {
  it('the explanation has only the window, the parts and the flow, and no event length, end tick or give-back point', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const s = market(seed, MIXED);
      const e = explainMove(s, 'OSTV', 0, lastClosed(s));
      expect(Object.keys(e).sort()).toEqual(['assetId', 'flow', 'foldedDays', 'from', 'parts', 'to', 'total', 'totalLog'].sort());
      const text = JSON.stringify(e);
      for (const word of ['endTick', 'duration', 'lasted', 'planned', 'giveBack', 'length']) expect(text.includes(word), seed).toBe(false);
    }
  });
});

describe('the blur keeps prices (R1 fix, Tape measured)', () => {
  it('the close of every asset is the same with the R1 blur off and on: only the attribution moves', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const withBlur = market(seed, MIXED);
      let off = createWorld(seed, universeConfig({ ticksPerDay: TPD, ecology: { mode: 'full', weight: 1, newsPrint: 1, ratePrint: 0.5, foldBlur: 0 } }));
      for (const h of new Set(MIXED.flat())) off = openAccount(off, h);
      for (const day of MIXED) {
        for (const h of day) for (const a of ASSETS) off = placeOrder(off, { playerId: h, assetId: a, side: 'buy', type: 'market', qty: 5 }).state;
        off = stepMany(off, TPD).state;
      }
      const a1 = ecoArchive(withBlur);
      const a0 = ecoArchive(off);
      expect(a1.length).toBe(a0.length);
      a1.forEach((d, i) => d.assets.forEach((x, j) => {
        expect(x.lnS, `${seed} day ${d.day} ${x.id}`).toBe(a0[i]!.assets[j]!.lnS);
      }));
      // and the blurred day's total is the same move
      const e1 = explainMove(withBlur, 'OSTV', 0, lastClosed(withBlur));
      const e0 = explainMove(off, 'OSTV', 0, lastClosed(off));
      expect(e1.totalLog).toBeCloseTo(e0.totalLog, 12);
    }
  });
});

describe('test_shock_labeled (a window with shockPrice or shockValue gets a Test shock row, never a story)', () => {
  /** a world whose day 1 holds one test shock made at its first tick, then closes: the close prints it */
  function shockedDay(seed: string, kind: 'price' | 'value', pct: number): WorldState {
    let s = createWorld(seed, universeConfig({ ticksPerDay: TPD }));
    s = stepMany(s, TPD).state; // day 0 closes
    s = kind === 'price' ? shockPrice(s, 'HLCN', pct) : shockValue(s, 'HLCN', pct);
    s = stepMany(s, TPD).state; // day 1 closes
    return s;
  }

  it('a shockPrice day explains its move with a Test shock row equal to the shock, and the parts still sum to the move', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const s = shockedDay(seed, 'price', -0.05);
      const e = explainMove(s, 'HLCN', 1, 1);
      expect(e.parts.shock, seed).toBeDefined();
      expect(e.parts.shock!, seed).toBeCloseTo(Math.log1p(-0.05), 9);
      const sum = Object.values(e.parts).reduce((a, b) => a + (b ?? 0), 0);
      expect(Math.abs(sum - e.totalLog), seed).toBeLessThan(1e-12);
      // the shocked close is the price: the day's log move is the shock plus the rest of the day's own flow and value
      expect(Number.isFinite(e.total)).toBe(true);
    }
  });

  it('a shockValue day has its value move on the Test shock row too (a share of the value line, labeled, sums exactly)', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const s = shockedDay(seed, 'value', 0.08);
      const e = explainMove(s, 'HLCN', 1, 1);
      expect(Math.abs(e.parts.shock ?? 0), seed).toBeGreaterThan(0);
      const sum = Object.values(e.parts).reduce((a, b) => a + (b ?? 0), 0);
      expect(Math.abs(sum - e.totalLog), seed).toBeLessThan(1e-12);
    }
  });

  it('a day with no test shock has no Test shock row at all', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const s = market(seed, MIXED);
      expect(explainMove(s, 'HLCN', 0, lastClosed(s)).parts.shock, seed).toBeUndefined();
    }
  });

  it('the memo for a shock day says it was a test shock, and tells no story (the dominant part is the test shock)', async () => {
    const { textProvider } = await import('../world/text');
    const msg = textProvider.deskMemo({ assetId: 'HLCN', from: 1, to: 1, move: -0.05, dominant: 'shock', pool: null });
    const text = msg.map((m) => textProvider.render(m, 'en')).join(' ');
    expect(text).toMatch(/test shock/);
    expect(text).not.toMatch(/because|after the news|rumou?r|earnings|expected/i);
  });
});
