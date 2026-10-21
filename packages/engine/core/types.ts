import { cmpStr } from './order';

export type Tick = number; export type Money = bigint; export type Qty = bigint; export type Price = bigint;
export type Ccy = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL'; export type Id = string;
export type PhaseId = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9' | 'P10' | 'P11' | 'P12' | 'P13' | 'P14';
export const PHASES: readonly PhaseId[] = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14'];
export function phaseIndex(p: PhaseId): number { return PHASES.indexOf(p); }
export type Visibility = 'PUBLIC' | 'PARTIES' | 'PRIVATE' | 'SEALED';
export type Hash32 = Uint8Array;
export const CCYS: readonly Ccy[] = ['EUN', 'FDL', 'NKR', 'PYN', 'SRL'];
export const KIND_TAG_ORDER: readonly string[] = ['sys', 'cbk', 'gov', 'reg', 'crt', 'exc', 'ccp', 'rat', 'bnk', 'ins', 'fnd', 'spv', 'cmp',
  'biz', 'prop', 'ali', 'npc', 'hh', 'frm', 'row', 'chr'];

export function kindOf(id: Id): string { const i = id.indexOf('_'); return i < 0 ? id : id.slice(0, i); }

export function cmpEntityCanonical(a: Id, b: Id): -1 | 0 | 1 {
  const ka = kindOf(a), kb = kindOf(b);
  const ia = KIND_TAG_ORDER.indexOf(ka), ib = KIND_TAG_ORDER.indexOf(kb);
  const ra = ia < 0 ? KIND_TAG_ORDER.length : ia, rb = ib < 0 ? KIND_TAG_ORDER.length : ib;
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (ia < 0) { const c = cmpStr(ka, kb); if (c !== 0) return c; }
  return cmpStr(a, b);
}

export class EngineFault extends Error {
  readonly code: string; readonly entityIds: Id[];
  constructor(code: string, message: string, entityIds: Id[] = []) { super(message); this.name = 'EngineFault'; this.code = code; this.entityIds = entityIds; }
}
