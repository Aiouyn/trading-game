import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { depthByPool, ecologyLog, explainMove, playersShown } from './ecology';
import { openAccount, placeOrder } from './trading';
import type { WorldState } from './types';

const TPD = 24;
const ASSET = 'OSTV';
const ALLOWED = new Set(['market', 'sector', 'news', 'event', 'company', 'flow', 'players', 'you']);

/** Opens the given accounts, then for each of `days` game days every account buys `qty` of ASSET at the open. */
function trade(players: string[], days: number, qty = 5): WorldState {
  let s = createWorld('explain', universeConfig({ ticksPerDay: TPD }));
  for (const p of players) s = openAccount(s, p);
  for (let d = 0; d < days; d++) {
    for (const p of players) s = placeOrder(s, { playerId: p, assetId: ASSET, side: 'buy', type: 'market', qty }).state;
    s = stepMany(s, TPD).state;
  }
  return s;
}

describe('depthByPool', () => {
  it('shows a closed day by pool type only, and refuses the open day', () => {
    const s = trade(['p0', 'p1', 'p2', 'p3', 'p4'], 3);
    const d = depthByPool(s, ASSET, 1);
    expect(Object.keys(d.desired).sort()).toEqual(['pension', 'retail', 'trend', 'value']);
    expect(d.depth).toBeGreaterThan(0);
    expect(d.depth).toBeLessThanOrEqual(1);
    expect(() => depthByPool(s, ASSET, 3)).toThrow(/not a closed day/);
  });
});

describe('explainMove', () => {
  it('rejects the open session day and anything after the last close', () => {
    const s = trade(['p0'], 3);
    expect(() => explainMove(s, ASSET, 0, 3)).toThrow(/open or not closed/);
    expect(() => explainMove(s, ASSET, 0, 9)).toThrow(/open or not closed/);
    expect(() => explainMove(s, ASSET, 4, 2)).toThrow(/after toDay/);
    expect(() => explainMove(s, 'NOPE', 0, 1)).toThrow(/unknown asset/);
  });

  it('explains a closed window and its parts sum to the total exactly', () => {
    const s = trade(['p0'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    const sum = Object.values(e.parts).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBeCloseTo(e.totalLog, 14);
    expect(e.total).toBeCloseTo(Math.expm1(e.totalLog), 14);
    expect(e.from).toBe(0);
    expect(e.to).toBe(2);
  });

  it('clamps a window that starts before the listing to the first logged day', () => {
    const s = trade(['p0'], 3);
    expect(explainMove(s, ASSET, -5, 2).from).toBe(0);
  });

  it('shows pool types and player rows only, never a name', () => {
    const s = trade(['p0', 'p1', 'p2', 'p3', 'p4'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(Object.keys(e.parts).every((k) => ALLOWED.has(k))).toBe(true);
  });

  it('solo: the only player is You, never Players', () => {
    const s = trade(['p0'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.you).toBeDefined();
    expect(e.parts.players).toBeUndefined();
    expect(e.foldedDays).toEqual([]);
  });

  it('online: five accounts with none above 40% show as Players, every day', () => {
    const s = trade(['p0', 'p1', 'p2', 'p3', 'p4'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.players).toBeDefined();
    expect(e.parts.you).toBeUndefined();
    expect(e.foldedDays).toEqual([]);
  });

  it('online: four accounts fold into Retail, every day', () => {
    const s = trade(['p0', 'p1', 'p2', 'p3'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.players).toBeUndefined();
    expect(e.foldedDays).toEqual([0, 1, 2]);
  });

  it('online: one account above 40% of the day folds even with five accounts', () => {
    let s = createWorld('explain', universeConfig({ ticksPerDay: TPD }));
    for (const p of ['p0', 'p1', 'p2', 'p3', 'p4']) s = openAccount(s, p);
    for (let d = 0; d < 3; d++) {
      s = placeOrder(s, { playerId: 'p0', assetId: ASSET, side: 'buy', type: 'market', qty: 50 }).state;
      for (const p of ['p1', 'p2', 'p3', 'p4']) s = placeOrder(s, { playerId: p, assetId: ASSET, side: 'buy', type: 'market', qty: 1 }).state;
      s = stepMany(s, TPD).state;
    }
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.players).toBeUndefined();
    expect(e.foldedDays.length).toBe(3);
  });

  it('the Players rule is applied per day before the window is summed, so an adjacent window cannot isolate one account', () => {
    // days 0 and 1: five accounts trade; day 2: only p0 trades (fails the rule, folds to Retail)
    let s = createWorld('explain', universeConfig({ ticksPerDay: TPD }));
    const all = ['p0', 'p1', 'p2', 'p3', 'p4'];
    for (const p of all) s = openAccount(s, p);
    for (let d = 0; d < 3; d++) {
      for (const p of d < 2 ? all : ['p0']) s = placeOrder(s, { playerId: p, assetId: ASSET, side: 'buy', type: 'market', qty: 5 }).state;
      s = stepMany(s, TPD).state;
    }
    const two = explainMove(s, ASSET, 0, 1);
    const three = explainMove(s, ASSET, 0, 2);
    expect(three.foldedDays).toContain(2);
    // the implied day 2 Players flow is exactly zero: the lone account never reached the Players row
    expect((three.parts.players ?? 0) - (two.parts.players ?? 0)).toBe(0);
  });
});

/**
 * window_diff_no_isolate (Tape research-desk hunt, P2): the harness. For 20 seeds, every adjacent closed pair (from, to) and
 * (from, to + 1), and three assets, the day-diff of the Players row is the only player flow a viewer can read from explain,
 * and the depth Retail figure is the only other public player figure. Checked against the log:
 *  - a non-zero Players diff for day d needs that day to show Players (5+ human accounts, none above 40%);
 *  - the depth Retail figure on day d carries the player's own flow exactly when the day folds, and never when it shows,
 *    so subtracting depth from explain reveals nothing a fold does not already show.
 */
describe('window_diff_no_isolate (harness, 20 seeds, P2)', () => {
  const HTPD = 8;
  const HDAYS = 6;
  const HUMANS = ['h0', 'h1', 'h2', 'h3', 'h4'];
  const SEEDS = Array.from({ length: 20 }, (_, i) => `window-diff-${i}`);
  /** enough cash that every order fills: the harness tests the fold, not the cash limit */
  const HCASH = 1e7;

  /** An NPC persona's account, as the world opens it (createPlayer): the same account with the npc flag set. */
  function openNpc(s: WorldState, id: string): WorldState {
    const o = openAccount(s, id, HCASH);
    return { ...o, accounts: { ...o.accounts, [id]: { ...o.accounts[id]!, npc: true } } };
  }

  /** Which accounts trade on a day, and how much: varied by seed and day, so both shown and folded days occur. */
  function schedule(i: number, d: number): { id: string; qty: number }[] {
    const ids = [...HUMANS, 'n0'];
    const k = 1 + ((i + 2 * d) % 6);
    const out: { id: string; qty: number }[] = [];
    for (let j = 0; j < k; j++) out.push({ id: ids[(j + i + d) % ids.length]!, qty: 1 + ((i * 7 + d * 3 + j * 11) % 40) });
    return out;
  }

  function harness(i: number): { s: WorldState; assets: string[] } {
    let s = createWorld(SEEDS[i]!, universeConfig({ ticksPerDay: HTPD }));
    const assets = s.config.assets.filter((a) => a.assetClass === 'stock' && a.listed !== false && !a.delisted).slice(0, 3).map((a) => a.id);
    for (const id of HUMANS) s = openAccount(s, id, HCASH);
    s = openNpc(s, 'n0');
    for (let d = 0; d < HDAYS; d++) {
      for (const { id, qty } of schedule(i, d)) {
        for (const asset of assets) s = placeOrder(s, { playerId: id, assetId: asset, side: 'buy', type: 'market', qty }).state;
      }
      s = stepMany(s, HTPD).state;
    }
    return { s, assets };
  }

  it('a Players diff is attributed only to a day that shows Players, and depth reveals own flow only on a folded day', () => {
    let shownDays = 0;
    let foldedDays = 0;
    for (let i = 0; i < SEEDS.length; i++) {
      const { s, assets } = harness(i);
      const last = ecologyLog(s).at(-1)!.day;
      for (const asset of assets) {
        for (let from = 0; from < last; from++) {
          for (let to = from; to < last; to++) {
            const d = to + 1;
            const a = explainMove(s, asset, from, to);
            const b = explainMove(s, asset, from, d);
            const impliedPlayers = (b.parts.players ?? 0) - (a.parts.players ?? 0);
            const row = ecologyLog(s).find((x) => x.day === d)!.assets.find((x) => x.id === asset)!;
            const shown = playersShown(row.players);
            if (shown) shownDays++;
            else foldedDays++;
            // the Players diff needs a day that shows Players
            if (impliedPlayers !== 0) expect(shown, `seed ${i} ${asset} day ${d}`).toBe(true);
            // a folded day has no Players flow at all
            if (!shown) expect(impliedPlayers, `seed ${i} ${asset} day ${d}`).toBe(0);
            // depth Retail = NPC-and-pool Retail, plus the human's own flow on a folded day only
            const dep = depthByPool(s, asset, d);
            const base = row.desired.retail + (row.desired.npc ?? 0);
            expect(dep.desired.retail - base).toBeCloseTo(shown ? 0 : row.desired.own, 12);
          }
        }
      }
    }
    // the harness must exercise both sides of the rule, or it proves nothing
    expect(shownDays).toBeGreaterThan(0);
    expect(foldedDays).toBeGreaterThan(0);
  });
});
