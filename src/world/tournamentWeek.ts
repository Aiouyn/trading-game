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
const fail = (error: string): CommandResult => ({ ok: false, error });

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
 * Enter the tournament with the player's best trading model, which must run a deployed bot (its strategy, assets and
 * allocation are frozen at lock). One entry per player per week. The entry window is open until the week's lock tick.
 */
export function enterTournament(g: GameState, pid: string): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return fail('No player account to enter with. Join the world first.');
  if (rankIndex(p.rankId) < rankIndex(LAB_RANK)) return fail('The tournament runs on AI Lab models. Your lab opens at Owner ($250k). Reach Owner, then train a model.');
  const lab = labFor(g, pid);
  const model = bestModel(lab, 'trading');
  if (!model) return fail('You have no trading model to enter. Train one in the AI Lab first.');
  const bot = lab.bots.find((b) => b.modelId === model.id && b.active) ?? lab.bots.find((b) => b.modelId === model.id);
  if (!bot) return fail(`Your best model "${model.name}" runs no bot. Deploy one in the AI Lab, then enter.`);
  const week = weekEnteringAt(g.market.tick);
  const rec = weekRecord(g, week);
  if (rec.entries.some((e) => e.playerId === pid)) return fail(`You already entered week ${week}. One entry per week; it locks at tick ${lockTickOf(week)}.`);
  const actor: TournamentActor = { id: `entry:${pid}`, strategy: bot.strategy, assets: [...bot.assets], allocation: bot.allocation, mcs: model.mcs };
  const hash = entryHash(actor, p.handle, String(week));
  rec.entries.push({
    playerId: pid, handle: p.handle, modelName: model.name, mcs: model.mcs, division: divisionOf(model.mcs), hash,
    lockedTick: g.market.tick, actor,
  });
  return ok({ week, hash });
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
export function settlementInput(g: GameState, week: number): { seeds: string[]; entries: { id: string; handle: string; actor: TournamentActor }[] } | null {
  const rec = g.tournament?.weeks[String(week)];
  if (!rec || rec.settled || lockTickOf(week) > g.market.tick || rec.entries.length === 0) return null;
  return {
    seeds: weekSeedsOf(g, week),
    entries: rec.entries.map((e) => ({ id: e.actor.id, handle: e.handle, actor: { ...e.actor, assets: [...e.actor.assets] } })),
  };
}

/** Run one due week's isolated runs. Pure and slow (minutes for a full field): the server runs it off the tick loop. */
export function settleWeekRows(g: GameState, week: number, days: number = TOURNAMENT.days): { seeds: string[]; rows: TournamentRowRecord[] } | null {
  const input = settlementInput(g, week);
  if (!input) return null;
  const rows = runTournamentWeek(input.seeds, input.entries, { days, config: tournamentConfig() });
  return { seeds: input.seeds, rows: rows.map(toRowRecord) };
}

function toRowRecord(r: TournamentRow): TournamentRowRecord {
  const runs = r.score.runs;
  // the row keeps the median of each figure; a disqualifying run's reason is the first one the seeds gave
  const reason = runs.find((x) => !x.qualified)?.reason;
  return {
    id: r.id, kind: r.kind, handle: r.handle, ...(r.division ? { division: r.division } : {}), mcs: r.mcs,
    sharpe: r.score.sharpe, totalReturn: r.score.totalReturn, qualified: r.score.qualified, ...(reason ? { reason } : {}),
  };
}

/**
 * Apply a settlement: the server's rows for a due week, with the revealed seeds. The seeds must hash to the week's
 * commitment, the rows must name only this week's entries and the house AIs, and a week settles once.
 */
export function settleTournament(g: GameState, week: number, seeds: string[], rows: TournamentRowRecord[], out: StepOutput | null = null): CommandResult {
  const rec = g.tournament?.weeks[String(week)];
  if (!rec) return fail(`No tournament week ${week}. Nobody entered it.`);
  if (rec.settled) return fail(`Week ${week} is already settled. Its seeds are public.`);
  if (lockTickOf(week) > g.market.tick) return fail(`Week ${week} has not locked. Its entries lock at tick ${lockTickOf(week)}.`);
  if (seedCommitment(seeds) !== commitmentOf(g, week)) return fail(`The seeds do not match week ${week}'s commitment. The settlement is refused; the run must use the committed seeds.`);
  const known = new Set(rec.entries.map((e) => e.actor.id));
  for (const r of rows) {
    if (r.kind === 'entry' && !known.has(r.id)) return fail(`Row ${r.id} is not an entry of week ${week}.`);
    if (r.kind === 'house' && !r.id.startsWith('house:')) return fail(`Row ${r.id} is not a house AI.`);
  }
  rec.settled = { seeds: [...seeds], rows: rows.map((r) => ({ ...r })), settledTick: g.market.tick };
  for (const e of rec.entries) {
    const row = rows.find((r) => r.id === e.actor.id);
    if (!row) continue;
    notify(g, out, e.playerId, {
      kind: 'lab', tone: row.qualified ? 'brass' : 'info',
      text: row.qualified
        ? `Tournament week ${week} is in. Your median Sharpe is ${row.sharpe.toFixed(2)} (${row.division ?? 'your'} division).`
        : `Tournament week ${week} disqualified your entry (${row.reason === 'drawdown' ? 'a drawdown over 40%' : 'fewer than 20 trades'}). No cash is at stake.`,
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
      ? { week: latest.week, seeds: latest.settled.seeds, settledTick: latest.settled.settledTick, board }
      : null,
  };
}
