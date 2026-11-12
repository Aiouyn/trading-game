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
