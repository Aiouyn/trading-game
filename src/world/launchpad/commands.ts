import type { CommandResult, GameState, StepOutput, Command } from '../types';
import { LP, LP_K } from './constants';
import { cancelLaunch, launchToken } from './launch';
import { buyBuzz } from './flow';
import { lpBuy, lpSell, buyCurve } from './trade';
import { fileRugCase } from './rug';
import { ensureLaunchpad, refuse, tokenOf } from './state';
import { cashReserveAt } from './curve';

/**
 * The Launchpad's commands and the admin seam (lead-launchpad.md L7, L8). Every command returns through the same refusal shape,
 * and returns null for a command that is not the Launchpad's, so the world's dispatcher can fall through.
 */
export function launchpadCommand(g: GameState, pid: string, cmd: Command, out: StepOutput | null): CommandResult | null {
  switch (cmd.type) {
    case 'lp.launch':
      return launchToken(g, pid, {
        name: cmd.name.trim(), ticker: cmd.ticker.trim().toUpperCase(), tagline: cmd.tagline, allocation: cmd.allocation,
        ...(cmd.devBuyCents !== undefined ? { devBuyCents: cmd.devBuyCents } : {}),
      }, out);
    case 'lp.buy': return lpBuy(g, pid, cmd.ticker.toUpperCase(), cmd.spendCents, cmd.maxSlip, out);
    case 'lp.sell': return lpSell(g, pid, cmd.ticker.toUpperCase(), cmd.tokens, cmd.maxSlip, out);
    case 'lp.buzz': return buyBuzz(g, pid, cmd.ticker.toUpperCase(), cmd.kind, out);
    case 'lp.cancel': return cancelLaunch(g, pid, cmd.ticker.toUpperCase());
    case 'lp.file': return fileRugCase(g, pid, cmd.ticker.toUpperCase(), out);
    case 'admin.lpFill': return adminFill(g, cmd.ticker.toUpperCase(), out);
    default: return null;
  }
}

/**
 * Dev and tests only (the server refuses admin.* from clients): fills a token's curve up to graduation in one fill, so the e2e
 * suite can reach the graduation path without trading. It is an NPC-side fill (the cash is the npcRetail faucet), booked as any other.
 */
export function adminFill(g: GameState, ticker: string, out: StepOutput | null): CommandResult {
  ensureLaunchpad(g);
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  if (t.status !== 'live') return refuse('dead', { ticker });
  // the cash to reach the graduation reserve, with room for the fee, and the fill clips at the reserve (quoteBuy)
  const need = LP_K / LP.GRAD_Y - cashReserveAt(t.y);
  const spendCents = Math.ceil((need * 100) / (1 - LP.FEE_RATE)) + 100;
  return buyCurve(g, null, ticker, spendCents, 1, out, true);
}
