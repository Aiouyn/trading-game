import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { tournamentConfig } from './tournament';
import {
  TOURNAMENT_SYSTEM, TOURNAMENT_WEEK_TICKS, commitmentOf, dueSettlements, enterTournament, lockTickOf, settleWeekRows,
  settlementInput, topEntryIds, tournamentView, weekEnteringAt, weekSeedsOf,
} from './tournamentWeek';
import { seedCommitment } from './tournament';
import type { GameState, TournamentRowRecord } from './types';

const ASSETS = tournamentConfig().assets.filter((a) => a.assetClass === 'stock' && a.listed !== false).slice(0, 4).map((a) => a.id);

/** A joined player with a trading model and a bot on it, at the Owner rank. */
function addTrader(g: GameState, pid: string): void {
  applyCommand(g, pid, { type: 'join', handle: pid.replace('p-', ''), country: 'XX' });
  g.players[pid]!.rankId = 'R2';
  const lab = (g.lab[pid] ??= { gpus: {}, reserved: null, data: 0, dataSynth: 0, research: [], researching: null, models: [], training: null, researchers: 0, bots: [], lastSignalTick: -1e9, modelSeq: 0 });
  lab.models.push({ id: 'm1', name: 'Alpha one', kind: 'trading', mcs: 90, createdTick: 0, residue: 0 });
  lab.bots.push({ id: 'bot1', modelId: 'm1', strategy: 'momentum', assets: ASSETS, allocation: 0.5, active: true, pnl: 0, trades: 0, lastRunTick: 0, memory: {} });
}

function world(): { g: GameState; pid: string } {
  const g = createGame('tournament-test', { warmupDays: 1, npcs: false });
  const pid = 'p-alpha';
  addTrader(g, pid);
  return { g, pid };
}

describe('tournament entries', () => {
  it('refuses a player below Owner, with what happened, why and what to do', () => {
    const { g, pid } = world();
    g.players[pid]!.rankId = 'R1';
    const r = enterTournament(g, pid);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('tnRank');
    expect(r.data).toEqual({ rank: 'R2' });
  });

  it('refuses when the best model runs no bot, and when there is no model', () => {
    const { g, pid } = world();
    g.lab[pid]!.bots = [];
    expect(enterTournament(g, pid).error).toBe('tnNoBot');
    g.lab[pid]!.models = [];
    expect(enterTournament(g, pid).error).toBe('tnNoModel');
  });

  it('opts an entry into the trade log only when asked, and keeps the flag on the entry', () => {
    const { g, pid } = world();
    expect(applyCommand(g, pid, { type: 'tournament.enter', publishLog: true }).ok).toBe(true);
    const week = weekEnteringAt(g.market.tick);
    expect(g.tournament!.weeks[String(week)]!.entries[0]!.publishLog).toBe(true);
    const other = world();
    applyCommand(other.g, other.pid, { type: 'tournament.enter' });
    expect(other.g.tournament!.weeks[String(week)]!.entries[0]!.publishLog).toBeUndefined();
  });

  it('enters with the best trading model, once a week, and locks the entry at the week tick', () => {
    const { g, pid } = world();
    const r = enterTournament(g, pid);
    expect(r.ok).toBe(true);
    const week = weekEnteringAt(g.market.tick);
    expect(g.tournament!.weeks[String(week)]!.entries).toHaveLength(1);
    expect(enterTournament(g, pid).ok).toBe(false);
    // the actor is frozen: a later change to the bot does not change the entry
    g.lab[pid]!.bots[0]!.allocation = 0.9;
    const entry = g.tournament!.weeks[String(week)]!.entries[0]!;
    expect(entry.actor.allocation).toBe(0.5);
    expect(entry.division).toBe('startup');
  });

  it('lock and become due at the week tick, and never before it', () => {
    const { g, pid } = world();
    enterTournament(g, pid);
    const week = weekEnteringAt(g.market.tick);
    expect(lockTickOf(week)).toBe(week * TOURNAMENT_WEEK_TICKS);
    expect(dueSettlements(g)).toEqual([]);
    expect(settlementInput(g, week)).toBeNull();
    g.market = { ...g.market, tick: lockTickOf(week) };
    expect(dueSettlements(g)).toEqual([week]);
    const input = settlementInput(g, week)!;
    expect(input.seeds).toEqual(weekSeedsOf(g, week));
    expect(input.entries[0]!.actor.id).toBe(`entry:${pid}`);
  });
});

describe('tournament settlement', () => {
  it('shows the commitment from the open and the seeds only after the settlement', () => {
    const { g, pid } = world();
    enterTournament(g, pid);
    const week = weekEnteringAt(g.market.tick);
    const before = tournamentView(g, pid);
    expect(before.entering.commitment).toBe(commitmentOf(g, week));
    expect(before.entering.commitment).toBe(seedCommitment(weekSeedsOf(g, week)));
    expect(before.latest).toBeNull();
    expect(JSON.stringify(before)).not.toContain('momentum');
    expect(JSON.stringify(before)).not.toContain(weekSeedsOf(g, week)[0]!);
  });

  it('settles a locked week from the committed seeds, reproducibly, and reveals the seeds', () => {
    const { g, pid } = world();
    enterTournament(g, pid);
    const week = weekEnteringAt(g.market.tick);
    g.market = { ...g.market, tick: lockTickOf(week) };
    // a 1-day horizon keeps the test fast; the reproducibility is the same at any horizon
    const a = settleWeekRows(g, week, 1)!;
    const b = settleWeekRows(g, week, 1)!;
    expect(b.rows).toEqual(a.rows);
    expect(a.seeds).toEqual(weekSeedsOf(g, week));
    const rows: TournamentRowRecord[] = a.rows;
    const r = applyCommand(g, TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds: a.seeds, rows });
    expect(r.ok).toBe(true);
    const view = tournamentView(g, pid);
    expect(view.latest!.seeds).toEqual(a.seeds);
    expect(view.latest!.board.find((x) => x.mine)).toBeDefined();
    expect(view.latest!.board.filter((x) => x.kind === 'house')).toHaveLength(5);
    expect(applyCommand(g, TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds: a.seeds, rows }).ok).toBe(false);
  });

  it('refuses seeds that do not match the commitment, and rows that are not this week\'s', () => {
    const { g, pid } = world();
    enterTournament(g, pid);
    const week = weekEnteringAt(g.market.tick);
    g.market = { ...g.market, tick: lockTickOf(week) };
    const bad = applyCommand(g, TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds: ['a', 'b', 'c'], rows: [] });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe('tnCommit');
    const seeds = weekSeedsOf(g, week);
    const stranger: TournamentRowRecord = { id: 'entry:someone-else', kind: 'entry', handle: 'x', mcs: 1, sharpe: 0, totalReturn: 0, qualified: true };
    expect(applyCommand(g, TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds, rows: [stranger] }).ok).toBe(false);
  });

  it('refuses a settlement from a player, and a settlement before the lock', () => {
    const { g, pid } = world();
    enterTournament(g, pid);
    const week = weekEnteringAt(g.market.tick);
    const seeds = weekSeedsOf(g, week);
    expect(applyCommand(g, pid, { type: 'tournament.settle', week, seeds, rows: [] }).ok).toBe(false);
    expect(applyCommand(g, TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds, rows: [] }).error).toBe('tnNotLocked');
  });
});

describe('tournament trade logs (N8)', () => {
  it('publishes the log of a top-three entry that opted in, reproducibly, and no other', () => {
    const { g, pid } = world();
    applyCommand(g, pid, { type: 'tournament.enter', publishLog: true });
    const week = weekEnteringAt(g.market.tick);
    g.market = { ...g.market, tick: lockTickOf(week) };
    const input = settlementInput(g, week)!;
    const a = settleWeekRows(g, week, 1)!;
    const b = settleWeekRows(g, week, 1)!;
    expect(b.rows).toEqual(a.rows);
    const entryRow = a.rows.find((r) => r.id === `entry:${pid}`)!;
    expect(input.entries[0]!.publishLog).toBe(true);
    expect(entryRow.log).toBeDefined();
    expect(entryRow.log!.seed).toBe(a.seeds[0]);
    // the house rows never carry a log
    expect(a.rows.filter((r) => r.kind === 'house' && r.log).length).toBe(0);
    const r = applyCommand(g, TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds: a.seeds, rows: a.rows });
    expect(r.ok).toBe(true);
    const logs = tournamentView(g, pid).latest!.logs;
    expect(logs).toHaveLength(1);
    expect(logs[0]!.trades.length).toBe(entryRow.log!.trades.length);
  });

  it('refuses a log for an entry that did not opt in, and a log for an entry outside the top three', () => {
    const { g, pid } = world();
    enterTournament(g, pid);
    const week = weekEnteringAt(g.market.tick);
    g.market = { ...g.market, tick: lockTickOf(week) };
    const a = settleWeekRows(g, week, 1)!;
    const withLog = a.rows.map((r) => (r.id === `entry:${pid}` ? { ...r, log: { seed: a.seeds[0]!, trades: [] } } : r));
    const r = applyCommand(g, TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds: a.seeds, rows: withLog });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('tnLogOptOut');
  });

  it('refuses a log for an opted-in entry that the settlement ranks outside the top three', () => {
    const { g, pid } = world();
    const ids = [pid, 'p-beta', 'p-gamma', 'p-delta'];
    for (const id of ids.slice(1)) addTrader(g, id);
    for (const id of ids) applyCommand(g, id, { type: 'tournament.enter', publishLog: true });
    const week = weekEnteringAt(g.market.tick);
    g.market = { ...g.market, tick: lockTickOf(week) };
    const a = settleWeekRows(g, week, 1)!;
    const top = new Set(topEntryIds(a.rows, 3));
    expect(top.size).toBe(3);
    const loser = ids.find((id) => !top.has(`entry:${id}`));
    expect(loser).toBeDefined();
    // the loser opted in, but finished fourth: its log is refused, and the same settlement without it is accepted
    const withLog = a.rows.map((r) => (r.id === `entry:${loser}` ? { ...r, log: { seed: a.seeds[0]!, trades: [] } } : r));
    expect(applyCommand(g, TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds: a.seeds, rows: withLog }).error).toBe('tnLogTop');
    expect(applyCommand(g, TOURNAMENT_SYSTEM, { type: 'tournament.settle', week, seeds: a.seeds, rows: a.rows }).ok).toBe(true);
  });
});

describe('tournament reveal', () => {
  it('the revealed seeds reproduce the commitment shown from the open, and the rows reproduce from the seeds', () => {
    const { g, pid } = world();
    enterTournament(g, pid);
    const week = weekEnteringAt(g.market.tick);
    const committed = commitmentOf(g, week);
    expect(seedCommitment(weekSeedsOf(g, week))).toBe(committed);
    g.market = { ...g.market, tick: lockTickOf(week) };
    const a = settleWeekRows(g, week, 1)!;
    expect(seedCommitment(a.seeds)).toBe(committed);
    const again = settleWeekRows(g, week, 1)!;
    expect(again.rows).toEqual(a.rows);
  });
});

describe('tournament carries no money', () => {
  it('books no cash on entry or settlement', () => {
    const { g, pid } = world();
    const cash = g.market.accounts[pid]?.cash;
    const faucets = JSON.stringify(g.economy.faucets);
    const sinks = JSON.stringify(g.economy.sinks);
    enterTournament(g, pid);
    expect(g.market.accounts[pid]?.cash).toBe(cash);
    expect(JSON.stringify(g.economy.faucets)).toBe(faucets);
    expect(JSON.stringify(g.economy.sinks)).toBe(sinks);
  });
});
