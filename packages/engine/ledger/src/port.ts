// E-81 (i), one-way dependency: core's ledger port (core/module/ledger-port.ts) never imports the ledger. The ledger supplies its G7
// types to core here, by declaration merging into core's LedgerPortTypes; ctx.ledger, ctx.holds and the LedgerProvider postings
// are then these types in any program that includes the ledger. Types only: nothing is imported or exported at runtime.
import type { Posting } from './types';
import type { HoldApi, LedgerApi } from './world';

declare module '@tycoon/engine-core' {
  interface LedgerPortTypes { ledger: LedgerApi; holds: HoldApi; posting: Posting }
}
