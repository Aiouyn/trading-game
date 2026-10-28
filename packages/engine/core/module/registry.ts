// T02-11: build units (19 §12.2), intent namespaces, ModuleSetError and buildModuleSet.
import type { ZodType } from 'zod';
import { cmpStr } from '../order';
import { matchStream, STREAM_REGISTRY, streamPrefix } from '../rng/registry';
import type { IntentHandler } from './ctx';
import type { ModuleDef } from './define';
import type { LedgerProvider } from './ledger-port';
import type { ViewHandler } from './views';

/** 19 §12.2 "Hard dependencies" column, every row transcribed (unit ids without the dot; 01 and 24 have no code and are omitted).
 *  17.B "17.A and the module of each screen" -> ['17A']; 22.B "22.A and each consuming module's schema" -> ['22A'];
 *  20.B "all units above" -> every unit listed above it in the table. */
const ROWS: readonly [string, readonly string[]][] = [
  ['19A', []], ['23', ['19A']], ['22A', ['19A']], ['20A', ['19A']], ['02', ['19A', '23', '22A', '20A']], ['03', ['02']], ['19B', ['02', '03']],
  ['14A', ['03']], ['13A', ['03', '14A']], ['15A', ['03', '14A', '19B']], ['19C', ['19B', '14A']], ['17A', ['19C']], ['04', ['03']], ['16A', ['04']],
  ['05', ['03', '04', '14A', '13A']], ['06A', ['05']], ['07A', ['03', '04', '06A']], ['07B', ['07A', '06A']], ['06B', ['07B']], ['06C', ['06A', '07A']],
  ['10A', ['03', '04', '22A']], ['10B', ['10A', '07A']], ['09A', ['10A', '03', '04']], ['09B', ['09A', '06A', '07A', '15A']], ['08', ['06B', '07B', '09A', '10B']],
  ['11', ['05', '06A', '14A', '19B']], ['12', ['11', '09A', '10A', '13A']], ['13B', ['12', '05', '07B', '08', '13A', '15A']], ['16B', ['16A', '08', '09B', '10B']],
  ['16C', ['16B', '13B']], ['14B', ['14A', '10B', '13B']], ['15B', ['15A', '14B', '16A', '19C']], ['17B', ['17A']], ['18', ['17B', '05', '09A', '14A', '16A']],
  ['19D', ['19C', '11', '15B']], ['21', ['19C', '15B', '14B']], ['22B', ['22A']],
];
const all: Record<string, readonly string[]> = {};
for (const [u, d] of ROWS) all[u] = Object.freeze([...d]);
all['20B'] = Object.freeze(ROWS.map(([u]) => u));
export const BUILD_UNITS: Readonly<Record<string, readonly string[]>> = Object.freeze(all);

/** Units with no ModuleDef (tooling, params, content, truth machine, hosts, client, docs): a dependency on one of them is
 *  satisfied outside the module set (they are packages or infrastructure, not engine modules). */
export const NON_MODULE_UNITS: readonly string[] = Object.freeze(['19A', '19B', '19C', '19D', '23', '22A', '22B', '20A', '20B', '17A', '17B', '18']);

/** '04': the sub-namespaces of the 12 kinds in T04-21 step 2 (04 §4); G6's list has no 04 entry (T04-21 decision). */
export const INTENT_NAMESPACES: Readonly<Record<string, string[]>> = Object.freeze({
  '02': ['adm.', 'core.'], '04': ['mkt.sov.', 'bank.cb.', 'bank.primaryDealer.'], '05': ['mkt.'], '07': ['bank.'], '08': ['fund.'], '09': ['biz.'], '10': ['prop.'], '11': ['lab.'], '12': ['ops.'],
  '13': ['law.'], '14': ['life.', 'acct.'], '15': ['soc.'], '20': ['acct.'], '21': ['adm.'],
});
/** Event kinds: a module may use its intent namespaces and the first segment of its registered stream keys (e.g. 04 'macro.'). */
export function eventNamespaces(module: string): string[] {
  const out = [...(INTENT_NAMESPACES[module] ?? [])];
  for (const s of STREAM_REGISTRY) if (s.module === module) { const ns = `${s.pattern.slice(0, s.pattern.indexOf('.'))}.`; if (!out.includes(ns)) out.push(ns); }
  return out;
}

export type ModuleSetErrorCode = 'MOD_UNKNOWN_UNIT'|'MOD_MISSING_DEP'|'MOD_DUP_UNIT'|'MOD_TABLE_OWNER'|'MOD_DUP_TABLE'|'MOD_STREAM_FOREIGN'|'MOD_DUP_INTENT'|'MOD_INTENT_NS'|'MOD_DUP_EVENT'|'MOD_EVENT_NS'|'MOD_DUP_VIEW'|'MOD_TWO_LEDGERS';
export class ModuleSetError extends Error {
  readonly code: ModuleSetErrorCode;
  constructor(code: ModuleSetErrorCode, message: string) { super(message); this.name = 'ModuleSetError'; this.code = code; }
}

export interface ModuleSet { modules: readonly ModuleDef[] /* sorted by module number then unit id */; intent(kind: string): { def: ModuleDef; h: IntentHandler<any> } | undefined;   // eslint-disable-line @typescript-eslint/no-explicit-any
  eventSchema(kind: string): ZodType | undefined; view(id: string): { def: ModuleDef; v: ViewHandler<any, any> } | undefined; ledger?: LedgerProvider; ownsStream(module: string, key: string): boolean }   // eslint-disable-line @typescript-eslint/no-explicit-any

/** Registry spec of a declared stream prefix: the bare key, or the prefix with one or two placeholder segments. */
export function streamSpecOfPrefix(prefix: string) { return matchStream(prefix) ?? matchStream(`${prefix}:x`) ?? matchStream(`${prefix}:x:x`); }

export function buildModuleSet(mods: readonly ModuleDef[]): ModuleSet {
  const sorted = [...mods].sort((a, b) => cmpStr(a.module, b.module) || cmpStr(a.id, b.id));
  const ids: string[] = [];
  for (const m of sorted) {
    if (!(m.id in BUILD_UNITS)) throw new ModuleSetError('MOD_UNKNOWN_UNIT', `unit '${m.id}' is not in 19 §12.2`);
    if (ids.includes(m.id)) throw new ModuleSetError('MOD_DUP_UNIT', `unit '${m.id}' loaded twice`);
    ids.push(m.id);
  }
  for (const m of sorted) for (const d of BUILD_UNITS[m.id]!) {
    if (!NON_MODULE_UNITS.includes(d) && !ids.includes(d)) throw new ModuleSetError('MOD_MISSING_DEP', `unit '${m.id}' needs '${d}' (19 Rule 12.4.2: the unit waits)`);
  }
  const dict = <V,>(): Record<string, V> => Object.create(null) as Record<string, V>;   // no prototype keys ('toString' ...)
  const tables = dict<string>(), intents = dict<{ def: ModuleDef; h: IntentHandler<any> }>();   // eslint-disable-line @typescript-eslint/no-explicit-any
  const events = dict<ZodType>(), views = dict<{ def: ModuleDef; v: ViewHandler<any, any> }>();   // eslint-disable-line @typescript-eslint/no-explicit-any
  let ledger: { def: ModuleDef; p: LedgerProvider } | undefined;
  for (const m of sorted) {
    for (const t of m.tables) { if (t.name in tables) throw new ModuleSetError('MOD_DUP_TABLE', `table '${t.name}' declared by '${tables[t.name]}' and '${m.id}'`); tables[t.name] = m.id; }
    for (const h of m.intents) { if (h.kind in intents) throw new ModuleSetError('MOD_DUP_INTENT', `intent '${h.kind}' declared twice`); intents[h.kind] = { def: m, h }; }
    for (const k of Object.getOwnPropertyNames(m.events)) { if (k in events) throw new ModuleSetError('MOD_DUP_EVENT', `event '${k}' declared twice`); events[k] = m.events[k]!; }
    for (const v of m.views) { if (v.id in views) throw new ModuleSetError('MOD_DUP_VIEW', `view '${v.id}' declared twice`); views[v.id] = { def: m, v }; }
    if (m.services?.ledger) {
      if (ledger) throw new ModuleSetError('MOD_TWO_LEDGERS', `'${ledger.def.id}' and '${m.id}' both provide services.ledger`);
      if (m.module !== '03') throw new ModuleSetError('MOD_TWO_LEDGERS', `services.ledger must come from module '03', not '${m.module}'`);
      ledger = { def: m, p: m.services.ledger };
    }
  }
  const byModule = dict<ModuleDef[]>();
  for (const m of sorted) (byModule[m.module] ??= []).push(m);
  const set: ModuleSet = {
    modules: Object.freeze(sorted),
    intent: (kind) => (kind in intents ? intents[kind] : undefined),
    eventSchema: (kind) => (kind in events ? events[kind] : undefined),
    view: (id) => (id in views ? views[id] : undefined),
    ownsStream(module, key) {
      const spec = matchStream(key);
      if (!spec || spec.module !== module) return false;
      const p = streamPrefix(spec);
      return (byModule[module] ?? []).some((m) => m.streams.includes(p));
    },
  };
  if (ledger) set.ledger = ledger.p;
  return Object.freeze(set);
}
