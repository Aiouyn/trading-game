import { applyCommand, createGame } from '../game';
import { TPD, credit } from '../core';
import type { Command, CommandResult, GameState } from '../types';

/** The three test players: a creator, a trader and a holder. Each is a rank R2 player with an old account and $200k of cash. */
export const CREATOR = 'lp_creator';
export const TRADER = 'lp_trader';
export const HOLDER = 'lp_holder';

/** A world with three players and the Launchpad ready to use. No NPC launches unless asked (`npcLaunches`). */
export function lpWorld(seed = 'lp', opts: { npcLaunches?: boolean } = {}): GameState {
  const g = createGame(seed, { warmupDays: 0, npcs: false, launchpadNpc: opts.npcLaunches === true });
  for (const [id, handle] of [[CREATOR, 'maker_one'], [TRADER, 'trader_two'], [HOLDER, 'zed_holder_x']] as const) {
    const r = applyCommand(g, id, { type: 'join', handle, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
  }
  g.market = { ...g.market, tick: 2 * TPD + 1 };
  for (const id of [CREATOR, TRADER, HOLDER]) {
    g.players[id]!.joinedTick = -1000 * TPD;
    g.players[id]!.rankId = 'R2';
    credit(g, id, 200_000, 'test');
  }
  return g;
}

/** Runs a command as a player and returns the result (a refusal stays a normal result). */
export function run(g: GameState, pid: string, c: Command): CommandResult {
  return applyCommand(g, pid, c);
}

/** Advances the clock by whole game days without stepping the engine (for the day rules and the death clocks). */
export function jumpDays(g: GameState, days: number): void {
  g.market = { ...g.market, tick: g.market.tick + Math.round(days * TPD) };
}

export function launch(g: GameState, pid: string, ticker: string, extra: Partial<Extract<Command, { type: 'lp.launch' }>> = {}): CommandResult {
  return run(g, pid, { type: 'lp.launch', name: `Coin ${ticker}`, ticker, tagline: 'tg1', allocation: 0, ...extra });
}
