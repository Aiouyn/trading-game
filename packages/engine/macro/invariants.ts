// T04-21 step 3: 20 lists no INV-MAC-*; 04's ledger safety is 03's INV-LED-* / INV-BS-* (Open point 1).
import type { InvariantImpl } from '@tycoon/engine-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ModuleDef.invariants is InvariantImpl<any>[] (G6)
export const MACRO_INVARIANTS: InvariantImpl<any>[] = [];
