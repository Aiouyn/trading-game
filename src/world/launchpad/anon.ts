import { tickerHash } from './icon';

/**
 * The anonymous id of a trader or a holder on one token (R-10-6, Phase 10): six hex characters, a hash of the ticker and the account
 * id. It is stable per account and token and never exposes the handle in trades, holders or replies. This is pseudonymization,
 * not a secrecy guarantee: the hash is unkeyed, so a known account id can be matched; six hex characters can also collide.
 * A secret-keyed mapping remains a follow-up (docs/V1-PHASE10.md 10C.2).
 */
export function anonOf(ticker: string, id: string): string {
  return tickerHash(`${ticker}|${id}`).toString(16).padStart(8, '0').slice(0, 6);
}
