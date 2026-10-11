import { rankIndex } from '@/content/lifestyle';
import { TPD, notify } from './core';
import { bestModel, labFor, LAB_RANK } from './lab';
import {
  divisionOf, entryHash, runTournamentWeek, seedCommitment, TOURNAMENT, tournamentConfig, weekSeeds, type TournamentActor, type TournamentRow,
} from './tournament';
import type { CommandResult, GameState, StepOutput, TournamentRowRecord, TournamentWeekRecord } from './types';

/**
 * The weekly tournament's lifecycle in game state (ROADMAP §2.4). A real week is 168 game hours (1 gd = 1 real hour), so
 * `TOURNAMENT_WEEK_TICKS` is one real week of ticks. Week w's entries are open during week w-1 and lock at tick w * W.
 *
 * The seeds are derived from the world seed and the week number, so they are never stored before a settlement and every
 * replay derives the same ones. The commitment is the hash of those seeds, visible from the week's open without the seeds.
 * A settlement is run off the tick loop (`settlementInput` and `settleWeekRows`, called by the server's scheduled job or the
 * script) and enters the game as a logged command, so a replay applies the same rows. It checks the revealed seeds against
 * the commitment before it accepts them.
 *
 * Nothing here moves money: an entry costs nothing and a tournament pays no cash (ROADMAP §2.4: no cash, zero faucet).
 */

export const TOURNAMENT_WEEK_TICKS = 7 * 24 * TPD;
/** the player id the server settles tournaments as. Players cannot use it: their ids are their account ids. */
export const TOURNAMENT_SYSTEM = '__tournament';

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string, data?: Record<string, number | string>): CommandResult => ({ ok: false, error, ...(data ? { data } : {}) });

/** The week whose entries are open at this tick (week w is entered during week w-1). */
export function weekEnteringAt(tick: number): number {
  return Math.floor(tick / TOURNAMENT_WEEK_TICKS) + 1;
}

/** The tick at which a week's entries lock and its run becomes due. */
export function lockTickOf(week: number): number {
  return week * TOURNAMENT_WEEK_TICKS;
}

export function weekSeedsOf(g: GameState, week: number): string[] {
  return weekSeeds(String(week), g.seed);
}

/** The commitment for a week, published from its open. Hashing the seeds reveals nothing about them. */
export function commitmentOf(g: GameState, week: number): string {
  return seedCommitment(weekSeedsOf(g, week));
}

function weekRecord(g: GameState, week: number): TournamentWeekRecord {
  g.tournament ??= { weeks: {} };
  return (g.tournament.weeks[String(week)] ??= { week, entries: [] });
}

/**
 * Enter the tournament with the player's best trading model, which must run a deployed bot. The entry's actor (strategy,
 * assets, allocation, capability) is captured now and hashed now; later changes to the bot do not reach it. One entry per
 * player per week. The entry window is open until the week's lock tick. `publishLog` opts the entry into the trade log
 * (N8): it is published only if the entry finishes top three, and only then.
 */
export function enterTournament(g: GameState, pid: string, publishLog = false): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return fail('noPlayer');
  if (rankIndex(p.rankId) < rankIndex(LAB_RANK)) return fail('tnRank', { rank: LAB_RANK });
  const lab = labFor(g, pid);
  const model = bestModel(lab, 'trading');
  if (!model) return fail('tnNoModel');
  const bot = lab.bots.find((b) => b.modelId === model.id && b.active) ?? lab.bots.find((b) => b.modelId === model.id);
  if (!bot) return fail('tnNoBot', { model: model.name });
  const week = weekEnteringAt(g.market.tick);
  const rec = weekRecord(g, week);
  if (rec.entries.some((e) => e.playerId === pid)) return fail('tnEntered', { week, lock: lockTickOf(week) });
  const actor: TournamentActor = { id: `entry:${pid}`, strategy: bot.strategy, assets: [...bot.assets], allocation: bot.allocation, mcs: model.mcs };
  const hash = entryHash(actor, p.handle, String(week));
  rec.entries.push({
    playerId: pid, handle: p.handle, modelName: model.name, mcs: model.mcs, division: divisionOf(model.mcs), hash,
    lockedTick: g.market.tick, actor, ...(publishLog ? { publishLog: true } : {}),
  });
  return ok({ week, hash, publishLog });
}

/** The weeks that have locked, hold entries, and have no settlement yet, oldest first. */
export function dueSettlements(g: GameState): number[] {
  const out: number[] = [];
  for (const rec of Object.values(g.tournament?.weeks ?? {})) {
    if (rec.settled || rec.entries.length === 0) continue;
    if (lockTickOf(rec.week) <= g.market.tick) out.push(rec.week);
  }
  return out.sort((a, b) => a - b);
}

/** The off-tick inputs of a due week: its seeds and every entry's frozen actor. Null when the week is not due. */
export function settlementInput(
  g: GameState, week: number,
): { seeds: string[]; entries: { id: string; handle: string; actor: TournamentActor; publishLog: boolean }[] } | null {
  const rec = g.tournament?.weeks[String(week)];
  if (!rec || rec.settled || lockTickOf(week) > g.market.tick || rec.entries.length === 0) return null;
  return {
    seeds: weekSeedsOf(g, week),
    entries: rec.entries.map((e) => ({
      id: e.actor.id, handle: e.handle, actor: { ...e.actor, assets: [...e.actor.assets] }, publishLog: !!e.publishLog,
    })),
  };
}

/**
 * The off-tick run of one week from its settlement input: every entry and house AI over the seeds, with the top-three trade
 * logs (N8). Pure and slow (a field of ten is about two minutes of one core). The server runs it in a child process
 * (server/tournamentJob.ts, scripts/tournament-run.ts), and tests call it with a short horizon.
 */
/** One entry of a week's settlement input: its id, handle, frozen actor, and whether it opted in to the trade log (N8). */
export interface SettlementEntry {
  id: string;
  handle: string;
  actor: TournamentActor;
  publishLog?: boolean;
}

export function runWeekRows(input: { seeds: string[]; entries: SettlementEntry[] }, days: number = TOURNAMENT.days): TournamentRowRecord[] {
  const rows = runTournamentWeek(input.seeds, input.entries, { days, config: tournamentConfig() });
  return rows.map(toRowRecord);
}

/** Run one due week's isolated runs in this process (tests and the dev script). The server uses the child process instead. */
export function settleWeekRows(g: GameState, week: number, days: number = TOURNAMENT.days): { seeds: string[]; rows: TournamentRowRecord[] } | null {
  const input = settlementInput(g, week);
  if (!input) return null;
  return { seeds: input.seeds, rows: runWeekRows(input, days) };
}

function toRowRecord(r: TournamentRow): TournamentRowRecord {
  const runs = r.score.runs;
  // the row keeps the median of each figure; a disqualifying run's reason is the first one the seeds gave
  const reason = runs.find((x) => !x.qualified)?.reason;
  return {
    id: r.id, kind: r.kind, handle: r.handle, ...(r.division ? { division: r.division } : {}), mcs: r.mcs,
    sharpe: r.score.sharpe, totalReturn: r.score.totalReturn, qualified: r.score.qualified, ...(reason ? { reason } : {}),
    ...(r.log ? { log: { seed: r.log.seed, trades: r.log.trades } } : {}),
  };
}

/** The ids of the top `n` entry rows, by the leaderboard's order (qualified, Sharpe, total return, id): the N8 eligibility. */
export function topEntryIds(rows: TournamentRowRecord[], n = 3): string[] {
  return rows
    .filter((r) => r.kind === 'entry')
    .sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.sharpe - a.sharpe || b.totalReturn - a.totalReturn || a.id.localeCompare(b.id))
    .slice(0, n)
    .map((r) => r.id);
}

/**
 * Apply a settlement: the server's rows for a due week, with the revealed seeds. The seeds must hash to the week's
 * commitment, the rows must name only this week's entries and the house AIs, and a week settles once.
 */
export function settleTournament(g: GameState, week: number, seeds: string[], rows: TournamentRowRecord[], out: StepOutput | null = null): CommandResult {
  const rec = g.tournament?.weeks[String(week)];
  if (!rec) return fail('tnNoWeek', { week });
  if (rec.settled) return fail('tnSettled', { week });
  if (lockTickOf(week) > g.market.tick) return fail('tnNotLocked', { week, lock: lockTickOf(week) });
  if (seedCommitment(seeds) !== commitmentOf(g, week)) return fail('tnCommit', { week });
  const known = new Set(rec.entries.map((e) => e.actor.id));
  for (const r of rows) {
    if (r.kind === 'entry' && !known.has(r.id)) return fail('tnRowUnknown', { id: r.id });
    if (r.kind === 'house' && !r.id.startsWith('house:')) return fail('tnRowHouse', { id: r.id });
  }
  // N8: a trade log is published only for a top-three entry that opted in at entry
  const top = new Set(topEntryIds(rows, 3));
  for (const r of rows) {
    if (!r.log) continue;
    const entry = rec.entries.find((e) => e.actor.id === r.id);
    if (!entry?.publishLog) return fail('tnLogOptOut', { id: r.id });
    if (!top.has(r.id)) return fail('tnLogTop', { id: r.id });
  }
  rec.settled = { seeds: [...seeds], rows: rows.map((r) => ({ ...r })), settledTick: g.market.tick };
  for (const e of rec.entries) {
    const row = rows.find((r) => r.id === e.actor.id);
    if (!row) continue;
    const reason = row.reason === 'drawdown' ? 'drawdown' : 'trades';
    notify(g, out, e.playerId, {
      kind: 'lab', tone: row.qualified ? 'brass' : 'info',
      text: row.qualified
        ? `Tournament week ${week} is in. Your median Sharpe is ${row.sharpe.toFixed(2)} (${row.division ?? 'your'} division).`
        : `Tournament week ${week} disqualified your entry (${row.reason === 'drawdown' ? 'a drawdown over 40%' : 'fewer than 20 trades'}). No cash is at stake.`,
      msg: row.qualified
        ? { key: 'tournament.in', vars: { week, sharpe: row.sharpe.toFixed(2), division: row.division ?? 'your' } }
        : { key: 'tournament.out', vars: { week, reason } },
    });
  }
  return ok({ week, rows: rows.length });
}

export interface TournamentLeaderRow {
  handle: string;
  kind: 'entry' | 'house';
  division?: 'laptop' | 'startup' | 'frontier';
  sharpe: number;
  totalReturn: number;
  qualified: boolean;
  /** true on the viewer's own entry row */
  mine: boolean;
}

/**
 * The public tournament view: the open week's commitment and entry count, and the latest settled week's leaderboard. The
 * seeds appear only after the week's settlement; the entries' strategy parameters never appear.
 */
export function tournamentView(g: GameState, pid: string | null) {
  const now = g.market.tick;
  const entering = weekEnteringAt(now);
  const open = g.tournament?.weeks[String(entering)];
  const latest = Object.values(g.tournament?.weeks ?? {}).filter((w) => w.settled).sort((a, b) => b.week - a.week)[0];
  const board: TournamentLeaderRow[] = latest?.settled
    ? latest.settled.rows.map((r) => ({
      handle: r.handle, kind: r.kind, ...(r.division ? { division: r.division } : {}), sharpe: r.sharpe, totalReturn: r.totalReturn,
      qualified: r.qualified, mine: r.kind === 'entry' && latest.entries.some((e) => e.playerId === pid && e.actor.id === r.id),
    }))
    : [];
  return {
    entering: {
      week: entering,
      lockTick: lockTickOf(entering),
      commitment: commitmentOf(g, entering),
      entries: open?.entries.length ?? 0,
      mine: open?.entries.find((e) => e.playerId === pid)?.hash ?? null,
    },
    latest: latest?.settled
      ? {
        week: latest.week, seeds: latest.settled.seeds, settledTick: latest.settled.settledTick, board,
        /** the trade logs the top three published (N8): none unless an entrant opted in and finished in the top three */
        logs: latest.settled.rows.filter((r) => r.log).map((r) => ({ handle: r.handle, seed: r.log!.seed, trades: r.log!.trades })),
      }
      : null,
  };
}
