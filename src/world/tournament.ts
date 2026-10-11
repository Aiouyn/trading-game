import { createWorld, equityOf, openAccount, placeOrder, step, universeConfig, type OrderRequest, type WorldConfig, type WorldState } from '@/engine';
import { BOT_CADENCE, mcsTier } from '@/content/research';
import { sha256Hex } from './company/hash';
import { strategySignal } from './lab';
import type { TradingBot } from './types';

/**
 * The weekly AI tournament (ROADMAP §2.4, M32 solo and M43 server-run; lead-phase6.md 6D).
 *
 * An entry is one frozen trading model: its strategy block, its assets, its allocation, and the model's capability (MCS).
 * Each entry trades alone in its own copy of the world (format v1, isolated runs) against the same three secret seeds, for
 * `TOURNAMENT.days` game days from `TOURNAMENT.startingCash`. The house AIs run the same way, as reference rows. The score
 * is the median over the three seeds of the annualised Sharpe of the daily equity returns, net of fees. A run that draws
 * down more than 40% or places fewer than 20 trades disqualifies the entry.
 *
 * Everything here is pure: no clock, no storage, no tick loop. The server triggers `runTournamentWeek` from a scheduled job
 * once a real week has locked (see `tournamentDue`), and tests call it directly with a short horizon.
 *
 * Commitment and reveal: the three seeds are hashed at the week's open (`seedCommit`) and published after the results. An
 * entry is hashed at lock (`entryHash`) and its parameters are never published by default. The house rows reproduce from
 * the published seeds alone. An entrant reproduces their own row from their own frozen entry, which matches its hash.
 * Nothing about a player's strategy is published unless that player opts in (N8, the trade log).
 */

export const TOURNAMENT = {
  seeds: 3,
  days: 30,
  startingCash: 1_000_000,
  minTrades: 20,
  maxDrawdown: 0.4,
  /** the house AIs run at this capability, a mid-table model */
  houseMcs: 120,
  /** the house AIs hold at most this share of their equity in the universe */
  houseAllocation: 0.9,
  /** the number of listed stocks the house AIs trade (the first in universe order, so the set is deterministic) */
  houseAssets: 12,
} as const;

export const HOUSE_STRATEGIES: TradingBot['strategy'][] = ['momentum', 'meanrev', 'value', 'trend', 'earnings'];

export type DivisionId = 'laptop' | 'startup' | 'frontier';

/** Divisions by the entrant's AI tier (ROADMAP §2.4): Laptop T0–T1, Startup T2–T3, Frontier T4–T5. */
export function divisionOf(mcs: number): DivisionId {
  const t = mcsTier(mcs);
  return t <= 1 ? 'laptop' : t <= 3 ? 'startup' : 'frontier';
}

/** What an entry trades with: the strategy block and its parameters. Frozen at lock. */
export interface TournamentActor {
  id: string;
  strategy: TradingBot['strategy'];
  assets: string[];
  allocation: number;
  mcs: number;
}

export interface TournamentRun {
  seed: string;
  days: number;
  /** the closing equity of each game day, the day-0 start first */
  equity: number[];
  totalReturn: number;
  sharpe: number;
  maxDrawdown: number;
  trades: number;
  qualified: boolean;
  /** why the run disqualified the entry, when it did */
  reason?: 'drawdown' | 'trades';
}

export interface TournamentScore {
  /** median over the seeds of the annualised Sharpe */
  sharpe: number;
  /** median over the seeds of the total return (the tie-break) */
  totalReturn: number;
  qualified: boolean;
  runs: TournamentRun[];
}

/** The fixed universe of a tournament run: the game's own config, so a run trades the same market a player trades. */
export function tournamentConfig(): WorldConfig {
  return universeConfig({});
}

/** The house AI actor for one strategy. Its id is fixed by the strategy, so the house rows reproduce from the seeds alone. */
export function houseActor(strategy: TradingBot['strategy'], config: WorldConfig = tournamentConfig()): TournamentActor {
  const assets = config.assets.filter((a) => a.assetClass === 'stock' && a.listed !== false).slice(0, TOURNAMENT.houseAssets).map((a) => a.id);
  return { id: `house:${strategy}`, strategy, assets, allocation: TOURNAMENT.houseAllocation, mcs: TOURNAMENT.houseMcs };
}

/** The three secret seeds of a week, from the server's per-week secret. Pure: the same secret and week give the same seeds. */
export function weekSeeds(weekId: string, secret: string, count: number = TOURNAMENT.seeds): string[] {
  const out: string[] = [];
  for (let k = 0; k < count; k++) out.push(sha256Hex(`tournament|${secret}|${weekId}|${k}`).slice(0, 24));
  return out;
}

/** The commitment published at the week's open, before any entry locks: a hash over the seeds. */
export function seedCommitment(seeds: string[]): string {
  return sha256Hex(`tournament-commit|${seeds.join('|')}`);
}

/** An entry's hash at lock: over its canonical fields (the strategy parameters and the model's capability). */
export function entryHash(actor: TournamentActor, handle: string, weekId: string): string {
  const canonical = JSON.stringify({ week: weekId, handle, id: actor.id, strategy: actor.strategy, assets: actor.assets, allocation: actor.allocation, mcs: actor.mcs });
  return sha256Hex(`tournament-entry|${canonical}`);
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Annualised Sharpe of the daily returns of an equity path (sample standard deviation, zero risk-free). */
export function sharpeOf(equity: number[], daysPerYear: number): number {
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const a = equity[i - 1]!;
    if (a > 0) rets.push(equity[i]! / a - 1);
  }
  if (rets.length < 2) return 0;
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(v);
  return sd > 0 ? (mean / sd) * Math.sqrt(daysPerYear) : 0;
}

/** Largest peak-to-trough fall of an equity path, as a fraction of the peak. */
export function maxDrawdownOf(equity: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    if (peak > 0) worst = Math.max(worst, (peak - e) / peak);
  }
  return worst;
}

const ACCOUNT_ID = 'entrant';

/**
 * One isolated headless run: a fresh world from the seed, one account, the strategy block trading the engine's own order
 * API (the same rules the live lab bots use: strategySignal, the model's noise, its cadence and the sizing of runBot). No
 * other player's order is in the world, so the run is purely a function of (seed, actor, days).
 */
export function runIsolated(seed: string, actor: TournamentActor, days: number = TOURNAMENT.days, config: WorldConfig = tournamentConfig()): TournamentRun {
  let st: WorldState = createWorld(seed, config);
  st = openAccount(st, ACCOUNT_ID, TOURNAMENT.startingCash);
  const start = equityOf(st, st.accounts[ACCOUNT_ID]!);
  const tpd = config.ticksPerDay;
  const cadence = BOT_CADENCE[mcsTier(actor.mcs)] ?? 1;
  const noise = 0.08 / (1 + actor.mcs / 80);
  const memory: Record<string, number> = {};
  const equity: number[] = [start];
  let trades = 0;
  const totalTicks = days * tpd;
  // a deterministic per-run draw for the noise: a counter-based hash of (seed, actor, tick, asset) keeps the run a pure function
  const draw = (tick: number, assetId: string): number => {
    const h = sha256Hex(`noise|${seed}|${actor.id}|${tick}|${assetId}`);
    const u1 = (parseInt(h.slice(0, 8), 16) + 1) / 4294967297;
    const u2 = (parseInt(h.slice(8, 16), 16) + 1) / 4294967297;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  for (let k = 1; k <= totalTicks; k++) {
    const r = step(st);
    st = r.state;
    trades += r.fills.filter((f) => f.playerId === ACCOUNT_ID).length;
    if (k % cadence === 0) st = decide(st, actor, memory, noise, draw, k);
    if (k % tpd === 0) equity.push(equityOf(st, st.accounts[ACCOUNT_ID]!));
  }
  const sharpe = sharpeOf(equity, config.daysPerYear);
  const maxDD = maxDrawdownOf(equity);
  const last = equity[equity.length - 1] ?? start;
  const reason = maxDD > TOURNAMENT.maxDrawdown ? 'drawdown' : trades < TOURNAMENT.minTrades ? 'trades' : undefined;
  return {
    seed, days, equity, totalReturn: start > 0 ? last / start - 1 : 0, sharpe, maxDrawdown: maxDD, trades,
    qualified: reason === undefined, ...(reason ? { reason } : {}),
  };
}

/** One decision round for the actor: the same sizing as runBot (equity share split over the assets, whole shares for stocks). */
function decide(
  st: WorldState, actor: TournamentActor, memory: Record<string, number>, noise: number,
  draw: (tick: number, assetId: string) => number, tick: number,
): WorldState {
  const acct = st.accounts[ACCOUNT_ID]!;
  const equity = equityOf(st, acct);
  const budgetPerAsset = (equity * actor.allocation) / actor.assets.length;
  let cur = st;
  for (const assetId of actor.assets) {
    const i = cur.config.assets.findIndex((a) => a.id === assetId);
    if (i < 0) continue;
    const a = cur.assets[i]!;
    const def = cur.config.assets[i]!;
    const px = Math.exp(a.lnP);
    const held = cur.accounts[ACCOUNT_ID]?.positions[assetId]?.qty ?? 0;
    let signal = strategySignal(actor.strategy, assetId, a, memory, tick, held);
    signal += noise * 10 * draw(tick, assetId);
    const step_ = def.qtyStep ?? (def.assetClass === 'stock' ? 1 : 0);
    const round = (q: number) => (step_ === 1 ? Math.floor(q) : Math.floor(q * 1e4) / 1e4);
    let req: Omit<OrderRequest, 'playerId'> | null = null;
    if (signal > 0.6 && held <= 0) {
      const q = round(budgetPerAsset / px);
      if (q > 0) req = { assetId, side: 'buy', type: 'market', qty: held < 0 ? -held + q : q };
    } else if (signal < -0.6 && held > 0) {
      req = { assetId, side: 'sell', type: 'market', qty: held };
    }
    if (!req) continue;
    const r = placeOrder(cur, { ...req, playerId: ACCOUNT_ID });
    if (r.order.status === 'open') cur = r.state;
  }
  return cur;
}

export interface TournamentRow {
  /** the entrant's id, or the house actor's id; never a strategy */
  id: string;
  kind: 'entry' | 'house';
  handle: string;
  division?: DivisionId;
  mcs: number;
  score: TournamentScore;
}

/** Score one actor over the seeds. */
export function scoreActor(actor: TournamentActor, seeds: string[], days: number = TOURNAMENT.days, config: WorldConfig = tournamentConfig()): TournamentScore {
  const runs = seeds.map((s) => runIsolated(s, actor, days, config));
  return {
    sharpe: median(runs.map((r) => r.sharpe)),
    totalReturn: median(runs.map((r) => r.totalReturn)),
    qualified: runs.every((r) => r.qualified),
    runs,
  };
}

/** A ranked leaderboard: qualified first, then Sharpe, then total return, then id (a stable order). */
export function rankRows(rows: TournamentRow[]): TournamentRow[] {
  return [...rows].sort((a, b) =>
    Number(b.score.qualified) - Number(a.score.qualified)
    || b.score.sharpe - a.score.sharpe
    || b.score.totalReturn - a.score.totalReturn
    || a.id.localeCompare(b.id));
}

export interface TournamentEntryInput {
  id: string;
  handle: string;
  actor: TournamentActor;
}

/**
 * The weekly run: score every locked entry and the house AIs over the week's three seeds. Pure and deterministic in its
 * inputs, so a published week re-runs to the same rows (the reproducibility test). Trade logs are never returned here; an
 * entrant's log exists only if that entrant publishes it (N8).
 */
export function runTournamentWeek(
  seeds: string[], entries: TournamentEntryInput[], opts: { days?: number; config?: WorldConfig } = {},
): TournamentRow[] {
  const days = opts.days ?? TOURNAMENT.days;
  const config = opts.config ?? tournamentConfig();
  const entryRows: TournamentRow[] = entries.map((e) => ({
    id: e.id, kind: 'entry', handle: e.handle, division: divisionOf(e.actor.mcs), mcs: e.actor.mcs,
    score: scoreActor(e.actor, seeds, days, config),
  }));
  const houseRows: TournamentRow[] = HOUSE_STRATEGIES.map((s) => {
    const actor = houseActor(s, config);
    return { id: actor.id, kind: 'house', handle: `House ${s}`, mcs: actor.mcs, score: scoreActor(actor, seeds, days, config) };
  });
  return rankRows([...entryRows, ...houseRows]);
}
