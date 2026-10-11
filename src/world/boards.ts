import { bizValuedIncome, CHAPTER_TICKS, notify, playerBusinesses, playerProperties, propValue, pushWire } from './core';
import type { BoardRow, Boards, GameState, Player, StepOutput } from './types';

const TOP = 100;

export function emptyBoards(): Boards {
  return { tick: 0, netWorth: [], chapter: [], climber: [], tycoon: [], trader: [], prestige: [], landlord: [], alliance: [], mostWanted: [], defender: [], country: {}, nwRank: {} };
}

function row(p: Player, value: number): BoardRow {
  return { id: p.id, name: p.handle, value, rankId: p.rankId, country: p.country, ...(p.npc ? { npc: true } : {}) };
}

function top(rows: BoardRow[]): BoardRow[] {
  return rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, TOP);
}

/**
 * Recompute every board (bible 02 §6): the primary Net Worth board (also shown as the Net Worth
 * Index, net worth ÷ money index), the chapter ladders (richest this chapter counts gains without
 * transfers; fastest climber uses log growth from a $100k floor so fresh accounts can't game it),
 * Tycoon (business income), Trader (realized trading P&L), Prestige, Landlord, Alliance,
 * the opt-in Most Wanted board, Defender, and country boards.
 */
export function computeBoards(g: GameState): void {
  const ps = Object.values(g.players);
  const all = ps.map((p) => row(p, p.markNetWorth ?? p.netWorth)).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const nwRank: Record<string, number> = {};
  all.forEach((r, i) => { nwRank[r.id] = i + 1; });
  const country: Record<string, BoardRow[]> = {};
  for (const r of all) {
    const c = r.country ?? 'XX';
    const arr = (country[c] ??= []);
    if (arr.length < TOP) arr.push(r);
  }
  const tycoon = ps.map((p) => row(p, playerBusinesses(g, p.id).reduce((s, b) => s + bizValuedIncome(b), 0)));
  const landlord = ps.map((p) => row(p, playerProperties(g, p.id).reduce((s, x) => s + propValue(g, x), 0)));
  const trader = ps.map((p) => row(p, g.market.accounts[p.id]?.realizedPnl ?? 0));
  const alliance: BoardRow[] = Object.values(g.alliances).map((a) => ({
    id: a.id, name: `${a.name} [${a.tag}]`,
    value: Object.keys(a.members).reduce((s, m) => s + (g.players[m]?.netWorth ?? 0), 0) + a.treasury,
  }));
  g.boards = {
    tick: g.market.tick,
    netWorth: all.slice(0, TOP),
    chapter: top(ps.map((p) => row(p, p.netWorth - p.chapterStartNetWorth))),
    climber: top(ps.map((p) => row(p, Math.log(Math.max(p.netWorth, 1e5) / Math.max(p.chapterStartNetWorth, 1e5))))),
    tycoon: top(tycoon),
    trader: top(trader),
    prestige: top(ps.map((p) => row(p, p.prestige))),
    landlord: top(landlord),
    alliance: top(alliance),
    mostWanted: top(ps.filter((p) => p.mostWantedOptIn && p.notoriety > 0).map((p) => row(p, p.notoriety))),
    defender: top(ps.map((p) => row(p, p.stats.sessionsCut * 10 + p.stats.casesWon * 25))),
    country,
    nwRank,
  };
}

/** The stabilizer's target: money growth per game day, measured on the trailing STABILIZER_WINDOW days (ruling O-6). */
export const STABILIZER_TARGET = 0.01;
/** The trailing window, in game days, that the growth is measured over (ruling O-6). */
export const STABILIZER_WINDOW = 7;

/**
 * Stabilizer (bible 01 anti-inflation): a public PI controller on the growth of total money
 * held by players. When money grows faster than the target, upkeep and fees scale up (sinkMult,
 * shown in-world as the Treasury levy); when it is calm, the levy relaxes back to 1.
 * Ruling O-6: the target is 1.0% a game day, on the average daily growth over the trailing 7 game days (the supply
 * seven days ago is the base). The old 4% a day never engaged. `hist` holds the last supplies, oldest first (optional,
 * so an old save loads with an empty history and the controller starts once a full window exists).
 */
export function stabilizerDay(g: GameState): void {
  let supply = 0;
  for (const p of Object.values(g.players)) supply += Math.max(0, p.netWorth);
  const st = g.economy.stabilizer;
  const hist = st.hist ?? [];
  if (hist.length >= STABILIZER_WINDOW) {
    const base = hist[hist.length - STABILIZER_WINDOW]!;
    if (base > 0 && supply > 0) {
      // growth per player, so new players joining do not look like inflation
      const growth = Math.pow(supply / base, 1 / STABILIZER_WINDOW) - 1;
      const err = growth - STABILIZER_TARGET;
      st.integral = Math.max(-0.5, Math.min(0.5, st.integral * 0.9 + err));
      st.sinkMult = Math.max(1, Math.min(1.6, 1 + 2 * Math.max(0, err) + 0.5 * Math.max(0, st.integral)));
    }
  }
  st.hist = [...hist, supply].slice(-STABILIZER_WINDOW);
  st.lastSupply = supply;
  const created = Object.values(g.economy.faucets).reduce((s, v) => s + v, 0);
  const destroyed = Object.values(g.economy.sinks).reduce((s, v) => s + v, 0);
  const players = Math.max(1, Object.keys(g.players).length);
  g.economy.moneyIndex = Math.max(1, 1 + (created - destroyed) / (players * 5_000_000));
}

/** Chapters: 8-week seasons inside the persistent world. At the end, crown winners and reset the ladders. */
export function chapterCheck(g: GameState, out: StepOutput): void {
  if (g.market.tick < g.chapter.endTick) return;
  const richest = g.boards.chapter.slice(0, 10);
  const climber = g.boards.climber.slice(0, 10);
  g.hallOfFame.unshift({ chapter: g.chapter.number, tick: g.market.tick, richest, climber });
  const w = richest[0];
  pushWire(g, out, { kind: 'chapter', tag: 'Chapter', tone: 'brass', text: `Chapter ${g.chapter.number} closes. ${w ? `${w.name} wins the chapter.` : ''} Chapter ${g.chapter.number + 1} begins.` });
  richest.slice(0, 3).forEach((r, i) => notify(g, out, r.id, { kind: 'system', tone: 'brass', text: `You finished #${i + 1} in Chapter ${g.chapter.number}. Your portrait hangs in the Hall of Fame.` }));
  for (const p of Object.values(g.players)) p.chapterStartNetWorth = p.netWorth;
  g.chapter = { number: g.chapter.number + 1, startTick: g.market.tick, endTick: g.market.tick + CHAPTER_TICKS };
}
