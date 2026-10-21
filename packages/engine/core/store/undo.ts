// T02-09: the open-tick undo log (19 Rule 3.6.3, G6): ordered write records with before/after, and value normalisation.
import { assertFinite } from '../fixed';
import { sortBy } from '../order';
import { EngineFault, type Id } from '../types';
import type { TruthWrite } from '../invariants';

export interface WriteRecord extends TruthWrite { before?: unknown; after?: unknown; seq: number }

/** 02 §3.7.2: every number finite (I0.nan) and -0 -> +0; undefined object fields dropped; Map/Set and other objects rejected
 *  (I0.store_type); bigint, string, boolean, null, arrays, plain objects and Uint8Array allowed. Returns a deep-frozen copy. */
export function normalizeEntity(v: unknown, table: string, id: Id): unknown {
  const at = (path: string): string => `${table}/${id}${path}`;
  const go = (x: unknown, path: string): unknown => {
    if (typeof x === 'number') { assertFinite(x, at(path)); return x === 0 ? 0 : x; }
    if (typeof x === 'bigint' || typeof x === 'string' || typeof x === 'boolean' || x === null) return x;
    if (x instanceof Uint8Array) return new Uint8Array(x);   // typed arrays cannot be frozen; stored as a private copy
    if (Array.isArray(x)) {
      const out = x.map((e, i) => { if (e === undefined) throw new EngineFault('I0.store_type', `${at(`${path}[${i}]`)}: undefined in array`, [id]); return go(e, `${path}[${i}]`); });
      return Object.freeze(out);
    }
    if (typeof x === 'object' && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)) {
      const out: Record<string, unknown> = {};
      for (const k of sortBy(Object.getOwnPropertyNames(x), (n) => [n])) { const e = (x as Record<string, unknown>)[k]; if (e !== undefined) out[k] = go(e, `${path}.${k}`); }
      return Object.freeze(out);
    }
    throw new EngineFault('I0.store_type', `${at(path)}: ${typeof x === 'object' ? ((x as object).constructor?.name ?? 'object') : typeof x} values are not storable`, [id]);
  };
  return go(v, '');
}

/** E-73 AC-02-09-BYTES-ISOLATION: true when the normalised value holds any Uint8Array. */
export function hasBytes(v: unknown): boolean {
  if (v instanceof Uint8Array) return true;
  if (Array.isArray(v)) return v.some(hasBytes);
  if (typeof v === 'object' && v !== null) { for (const k of Object.getOwnPropertyNames(v)) if (hasBytes((v as Record<string, unknown>)[k])) return true; }
  return false;
}
/** Read-side copy: every Uint8Array is copied (containers rebuilt and frozen), so no caller ever holds the stored buffer. */
export function copyBytesOut(v: unknown): unknown {
  if (v instanceof Uint8Array) return new Uint8Array(v);
  if (Array.isArray(v)) return Object.freeze(v.map(copyBytesOut));
  if (typeof v === 'object' && v !== null) {
    const out: Record<string, unknown> = {};
    for (const k of Object.getOwnPropertyNames(v)) out[k] = copyBytesOut((v as Record<string, unknown>)[k]);
    return Object.freeze(out);
  }
  return v;
}
