// T02-11: ModuleDef (G6 + optional services, a flagged superset) and defineModule (validation at module load time, never in step()).
import type { ZodType } from 'zod';
import type { Boundary } from '../calendar';
import type { InvariantImpl } from '../invariants';
import type { StoreRead, TableDef } from '../store';
import type { Id, Money, PhaseId } from '../types';
import type { IntentHandler, PhaseCtx } from './ctx';
import type { LedgerProvider } from './ledger-port';
import { eventNamespaces, INTENT_NAMESPACES, ModuleSetError, streamSpecOfPrefix } from './registry';
import type { ViewHandler } from './views';

/* eslint-disable @typescript-eslint/no-explicit-any -- G6 verbatim (TableDef<any>, IntentHandler<any> ...) */
export interface ModuleServices { ledger?: LedgerProvider; /** E-92 (4): this module's reason-code rows (03 CodeRow), registered by 03 by class in FLOW_CLASSES order. */ reasonCodes?: readonly unknown[];
  calendarEvents?: (store: StoreRead, year: number) => { tick: number; kind: string; labelKey: string; module: string; bloc?: string }[];
  spawnCharacter?: (ctx: PhaseCtx, opts: { cash?: Money; license?: string; rank?: string; city?: string }) => Id }   // calendarEvents: read by core.calendar.get (T02-20); spawnCharacter: provided by 14A, used by TestWorld.spawnCharacter (T02-21)
export interface ModuleDef { id: string; module: string; dependsOn: string[]; tables: TableDef<any>[]; streams: string[];
  phases: Partial<Record<PhaseId, (ctx: PhaseCtx) => void>>; boundaries?: Partial<Record<Boundary, (ctx: PhaseCtx) => void>>;
  intents: IntentHandler<any>[]; events: Record<string, ZodType>; invariants: InvariantImpl<any>[]; views: ViewHandler<any, any>[];
  genesis?(ctx: PhaseCtx): void; services?: ModuleServices }      // G6 + optional `services` (superset, flagged)
/* eslint-enable @typescript-eslint/no-explicit-any */

const hasNs = (kind: string, ns: readonly string[]): boolean => ns.some((p) => kind.startsWith(p) && kind.length > p.length);

/** Validates shape, freezes, returns the same object. Throws ModuleSetError. */
export function defineModule(m: ModuleDef): ModuleDef {
  if (!m.id.startsWith(m.module)) throw new ModuleSetError('MOD_UNKNOWN_UNIT', `unit id '${m.id}' does not start with module '${m.module}'`);
  for (const t of m.tables) if (t.module !== m.module) throw new ModuleSetError('MOD_TABLE_OWNER', `table '${t.name}' is owned by '${t.module}', not '${m.module}'`);
  const evNs = eventNamespaces(m.module);
  for (const k of Object.getOwnPropertyNames(m.events)) if (!hasNs(k, evNs)) throw new ModuleSetError('MOD_EVENT_NS', `event '${k}' is outside ${m.module}'s namespaces [${evNs.join(', ')}]`);
  const inNs = INTENT_NAMESPACES[m.module] ?? [];
  for (const h of m.intents) if (!hasNs(h.kind, inNs)) throw new ModuleSetError('MOD_INTENT_NS', `intent '${h.kind}' is outside ${m.module}'s namespaces [${inNs.join(', ')}]`);
  for (const s of m.streams) {
    const spec = streamSpecOfPrefix(s);
    if (!spec || spec.module !== m.module) throw new ModuleSetError('MOD_STREAM_FOREIGN', `stream prefix '${s}' is ${spec ? `owned by '${spec.module}'` : 'not registered'}, not '${m.module}'`);
  }
  for (const a of [m.tables, m.streams, m.dependsOn, m.intents, m.invariants, m.views]) Object.freeze(a);
  Object.freeze(m.phases); Object.freeze(m.events); if (m.boundaries) Object.freeze(m.boundaries); if (m.services) Object.freeze(m.services);
  return Object.freeze(m);
}
