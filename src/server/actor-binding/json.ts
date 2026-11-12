import { isProxy } from "node:util/types";

/** Shared input/journal boundary. Inspect descriptors, never execute a getter or toJSON. */
export function isPlainJson(v: unknown, ancestors = new Set<object>()): boolean {
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v) && !Object.is(v, -0);
  if (typeof v !== "object" || isProxy(v) || ancestors.has(v)) return false;
  const array = Array.isArray(v);
  if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)) return false;
  const keys = Reflect.ownKeys(v);
  if (array && keys.length !== v.length + 1) return false;
  ancestors.add(v);
  const valid = keys.every((key) => {
    if (array && key === "length") return true;
    if (array && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= v.length)) return false;
    const d = Object.getOwnPropertyDescriptor(v, key);
    return typeof key === "string" && !!d && d.enumerable === true && "value" in d && isPlainJson(d.value, ancestors);
  });
  ancestors.delete(v);
  return valid;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return isPlainJson(v) && typeof v === "object" && v !== null && !Array.isArray(v);
}

export function canonical(value: unknown): string {
  if (!isPlainJson(value)) throw new Error("INVALID_JSON");
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) out[key] = sortKeys((value as Record<string, unknown>)[key]);
  return out;
}
