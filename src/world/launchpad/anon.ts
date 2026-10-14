import { tickerHash } from './icon';

/**
 * The anonymous id of a trader or a holder on one token (R-10-6, Phase 10): six hex characters, a hash of the ticker and the account
 * id. It is the same for the same account on the same token, and different on another token, so one account cannot be followed
 * across tokens. It is never the handle, and the viewer sees only this id (the trades table, the holder distribution, the replies).
 */
export function anonOf(ticker: string, id: string): string {
  return tickerHash(`${ticker}|${id}`).toString(16).padStart(8, '0').slice(0, 6);
}
