import { boardNetWorth } from './comeback';
import { rankBasisOf } from './social';
import { stabilizerTaxShift } from './tax';
import { bizValuedIncome, CHAPTER_TICKS, notify, playerBusinesses, playerProperties, propValue, pushWire } from './core';
import { textProvider } from './text';
import type { BoardRow, Boards, GameState, Player, StepOutput } from './types';

const TOP = 100;

export function emptyBoards(): Boards {
  return { tick: 0, netWorth: [], chapter: [], climber: [], tycoon: [], trader: [], prestige: [], landlord: [], alliance: [], mostWanted: [], defender: [], country: {}, nwRank: {} };
}

/** The rank basis at the chapter's start (R-9-4); an older save without it starts at its raw chapter-start net worth. */
function chapterStartBasisOf(p: Player): number {
  return p.chapterStartBasis ?? p.chapterStartNetWorth;
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
  // R-9-4: every board ranks on the rank basis (marked net worth minus loans owed and net gifts received), as rank-ups do
  const all = ps.map((p) => row(p, boardNetWorth(g, p))).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
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
    value: Object.keys(a.members).reduce((s, m) => s + (g.players[m] ? rankBasisOf(g, g.players[m]!) : 0), 0) + a.treasury,
  }));
  g.boards = {
    tick: g.market.tick,
    netWorth: all.slice(0, TOP),
    chapter: top(ps.map((p) => row(p, rankBasisOf(g, p) - chapterStartBasisOf(p)))),
    climber: top(ps.map((p) => row(p, Math.log(Math.max(rankBasisOf(g, p), 1e5) / Math.max(chapterStartBasisOf(p), 1e5))))),
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
      // R-9-10 lever 2: the tax brackets move with the same error, only while the levy is engaged (sinkMult above 1)
      st.taxShift = stabilizerTaxShift(err, st.sinkMult > 1);
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
  const number = g.chapter.number;
  pushWire(g, out, {
    kind: 'chapter', tag: 'Chapter', tone: 'brass', text: `Chapter ${number} closes. ${w ? `${w.name} wins the chapter.` : ''} Chapter ${number + 1} begins.`,
    msg: textProvider.newsroom({ kind: 'chapter', id: `${number}:chapter`, number, winner: w ? w.name : null }),
  });
  richest.slice(0, 3).forEach((r, i) => notify(g, out, r.id, {
    kind: 'system', tone: 'brass', text: `You finished #${i + 1} in Chapter ${number}. Your portrait hangs in the Hall of Fame.`,
    msg: textProvider.newsroom({ kind: 'hallOfFame', id: `${number}:hof:${r.id}`, rank: i + 1, number }),
  }));
  for (const p of Object.values(g.players)) { p.chapterStartNetWorth = p.netWorth; p.chapterStartBasis = rankBasisOf(g, p); }
  g.chapter = { number: g.chapter.number + 1, startTick: g.market.tick, endTick: g.market.tick + CHAPTER_TICKS };
}
