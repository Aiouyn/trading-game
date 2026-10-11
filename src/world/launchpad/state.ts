import { openAccount, seedStream, type RngState } from '@/engine';
import { TPD, cashOf, pushWire } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import { textProvider } from '../text';
import { curveAccountId, tokenStream } from './constants';
import type { LaunchpadState, LpToken } from './types';
import { linked } from '../funds/state';
import type { Msg } from '@/i18n';

/** The state, created on first use. Worlds that never launch have none, so their fingerprints do not change. */
export function ensureLaunchpad(g: GameState): LaunchpadState {
  if (!g.launchpad) {
    g.launchpad = {
      seq: 0, tokens: {}, order: [], lastLaunch: {}, bans: {}, tickerDay: {},
      worldRng: seedStream(g.seed, 'lp:world'), npcSeq: 0, rumorDay: -1,
      totals: { launchFee: 0, tradeFee: 0, creatorFee: 0, gradFee: 0, buzz: 0, npcNet: 0, launches: 0, graduations: 0, deaths: 0 },
    };
  }
  return g.launchpad;
}

/** The game day a tick falls in (0 before the first tick). */
export function dayOf(tick: number): number {
  return tick <= 0 ? 0 : Math.floor((tick - 1) / TPD);
}

/** Whole cents from dollars, rounding half up (for the curve's and the state's money figures). */
export function centsOf(dollars: number): number {
  return Math.round(dollars * 100);
}

export function tokenOf(g: GameState, ticker: string): LpToken | undefined {
  return g.launchpad?.tokens[ticker];
}

/** A live token: on the curve, not graduated and not dead. */
export function isLive(t: LpToken): boolean {
  return t.status === 'live';
}

/** The deterministic stream of one token (lp:<TICKER>), as a fresh Rng state. */
export function streamOf(g: GameState, ticker: string): RngState {
  return seedStream(g.seed, tokenStream(ticker));
}

/** Adds cents to an engine account (no trading baseline moves: curve and fee cash is trading, not an outside grant). */
export function addAccountCash(g: GameState, accountId: string, cents: number): void {
  if (!(cents !== 0)) return;
  const a = g.market.accounts[accountId];
  if (!a) throw new Error(`launchpad: no account ${accountId}`);
  g.market = { ...g.market, accounts: { ...g.market.accounts, [accountId]: { ...a, cash: a.cash + cents / 100 } } };
}

/** Moves whole cents between two engine accounts (a zero-sum move). The sum of their cash does not change. */
export function moveCents(g: GameState, fromId: string, toId: string, cents: number): void {
  if (!(cents > 0)) return;
  addAccountCash(g, fromId, -cents);
  addAccountCash(g, toId, cents);
}

/** Books a sink: money that leaves the world (the sink line's total goes up by the cents). */
export function sinkCents(g: GameState, accountId: string, line: string, cents: number): void {
  if (!(cents > 0)) return;
  addAccountCash(g, accountId, -cents);
  g.economy.sinks[line] = (g.economy.sinks[line] ?? 0) + cents / 100;
}

/** Books a faucet: money that enters the world (the faucet line goes up, the account gains). */
export function faucetCents(g: GameState, accountId: string, line: string, cents: number): void {
  if (!(cents > 0)) return;
  addAccountCash(g, accountId, cents);
  g.economy.faucets[line] = (g.economy.faucets[line] ?? 0) + cents / 100;
}

/** Opens a token's curve account (zero cash) in the engine, once. */
export function openCurve(g: GameState, ticker: string): void {
  const id = curveAccountId(ticker);
  if (!g.market.accounts[id]) g.market = openAccount(g.market, id, 0);
}

/** The owner-linked accounts of a creator: the creator and their alliance members (the 10% cap counts them, L3). */
export function isCreatorLinked(g: GameState, creatorId: string, pid: string): boolean {
  return linked(g, creatorId, pid);
}

/**
 * The three-part refusal (lead-launchpad.md L2): what happened, why, and what to do. The English line is the command's error; the
 * descriptors go to the viewer's language. Keys are `lp.refuse.<code>.what|why|do` in en.json and fr.json.
 */
export function refuse(code: string, vars?: Record<string, string | number>): CommandResult {
  const parts: Msg[] = [
    { key: `lp.refuse.${code}.what`, vars },
    { key: `lp.refuse.${code}.why`, vars },
    { key: `lp.refuse.${code}.do`, vars },
  ];
  const error = parts.map((m) => textProvider.render(m, 'en')).join(' ');
  return { ok: false, error, data: { refusal: code, parts } };
}

/** A public Wire item for a launchpad event: the English line for old clients, the descriptor for the viewer's language. */
export function lpWire(g: GameState, out: StepOutput | null, tone: 'brass' | 'gain' | 'loss' | 'warn' | 'info', tag: string, msg: Msg, assetId?: string): void {
  pushWire(g, out, { kind: 'launchpad', tag, tone, text: textProvider.render(msg, 'en'), msg, ...(assetId ? { assetId } : {}) });
}

/** The player's cash, for the gates (the same figure the engine reads). */
export function playerCash(g: GameState, pid: string): number {
  return cashOf(g, pid);
}

/** The creator's live tokens (not graduated, not dead). */
export function liveCountOf(s: LaunchpadState, creatorId: string): number {
  let n = 0;
  for (const t of Object.values(s.tokens)) if (t.creatorId === creatorId && t.status === 'live') n++;
  return n;
}

/** The public short name of a token, for copy and the feed (the ticker is the public id). */
export function tokenLabel(t: LpToken): string {
  return `${t.name} (${t.ticker})`;
}
