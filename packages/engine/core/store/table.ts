// T02-09: table registry and ownership table (19 Rule 3.6.3: every table is owned by exactly one module).
import { cmpStr } from '../order';
import { SortedMap } from '../sorted';
import type { Id } from '../types';

export interface IndexDef<T> { name: string; key(e: T): string | null }    // null = not indexed
export interface TableDef<T> { name: string; module: string; idOf(e: T): Id; schema?: unknown; indexes?: IndexDef<T>[] }  // G6 + optional indexes

export class TableError extends Error {
  readonly code: 'TBL_DUPLICATE' | 'TBL_BAD_NAME' | 'TBL_UNKNOWN';
  constructor(code: 'TBL_DUPLICATE' | 'TBL_BAD_NAME' | 'TBL_UNKNOWN', message: string) { super(message); this.name = 'TableError'; this.code = code; }
}
export const TABLE_NAME_RE = /^[a-z]{2,8}\.[a-z0-9_]+$/;

export class TableRegistry {
  private readonly defs = new SortedMap<string, TableDef<unknown>>();
  add(def: TableDef<unknown>): void {
    if (!TABLE_NAME_RE.test(def.name)) throw new TableError('TBL_BAD_NAME', `table name '${def.name}' must match ${String(TABLE_NAME_RE)}`);
    if (this.defs.has(def.name)) throw new TableError('TBL_DUPLICATE', `table '${def.name}' already registered`);
    const names = (def.indexes ?? []).map((i) => i.name);
    for (let i = 1; i < names.length; i++) if (names.slice(0, i).includes(names[i]!)) throw new TableError('TBL_DUPLICATE', `index '${names[i]}' twice on '${def.name}'`);
    this.defs.set(def.name, def);
  }
  get(name: string): TableDef<unknown> | undefined { return this.defs.get(name); }
  owner(name: string): string {
    const d = this.defs.get(name);
    if (!d) throw new TableError('TBL_UNKNOWN', `unknown table '${name}'`);
    return d.module;
  }
  all(): TableDef<unknown>[] { return [...this.defs.values()].sort((a, b) => cmpStr(a.name, b.name)); }
}
