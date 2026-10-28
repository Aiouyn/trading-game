// T04-12: ports of the primary-market intents (dealer, syndication, buyback), bound once at init (T04-21) as intents/sovBid.ts; unbound = defaultMacroPorts().
import { defaultMacroPorts, type MacroPorts } from '../ports';

let bound: MacroPorts = defaultMacroPorts();
export function bindPrimaryPorts(p: MacroPorts): void { bound = p; }
export const primaryPorts = (): MacroPorts => bound;
