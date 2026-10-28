// TEMPORARY FILE: typed stubs for the T04-14 exports T04-13 imports (canAgreeConcord, openConcord, fxReservesFdl, importsMonthFdl).
// Signatures from the T04-13 card's upstream exports. Replaced by rules/concord.ts and rules/fxReserves.ts when T04-14 lands.
import { EngineFault, type Money, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import type { MacroPorts } from '../ports';
import type { BlocId, ConcordFacility } from '../schema';

const missing = (f: string): never => { throw new EngineFault('I0.macro_stub', `${f}: T04-14 export missing`); };
/** T04-14 stub. */
export function canAgreeConcord(_store: StoreRead, _b: BlocId): boolean { return missing('canAgreeConcord'); }
/** T04-14 stub. */
export function openConcord(_ctx: PhaseCtx, _b: BlocId, _cause: 'BREAK_PENDING' | 'FX_SERVICE' | 'SPREAD' | 'RESTRUCTURING'): ConcordFacility['programs'][number] | null { return missing('openConcord'); }
/** T04-14 stub. */
export function fxReservesFdl(_store: StoreRead, _b: BlocId, _ports: MacroPorts): Money { return missing('fxReservesFdl'); }
/** T04-14 stub. */
export function importsMonthFdl(_store: StoreRead, _b: BlocId): Money { return missing('importsMonthFdl'); }
/** T04-14 stub. */
export function concordActive(_store: StoreRead, _b: BlocId): boolean { return missing('concordActive'); }
