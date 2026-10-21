// 17B CH-00 delta ops (19 §2.4 DeltaOp): apply on the client, diff on the mock server. Pure and immutable.
// Paths are JSON-pointer-like (`/rows/HALC/last`); id-keyed paths are stable (Q4). Rings use `ins` + `trim` (Q4).
import type { DeltaOp } from "./channels";

type J = unknown;
const isObj = (v: J): v is Record<string, J> => typeof v === "object" && v !== null && !Array.isArray(v);
const segs = (path: string) => path.split("/").slice(1);

export class DeltaError extends Error {}

function update(node: J, keys: string[], fn: (leaf: J, parent: J, key: string) => J): J {
  if (keys.length === 0) throw new DeltaError("empty path");
  const [k, ...rest] = keys as [string, ...string[]];
  if (Array.isArray(node)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= node.length) throw new DeltaError(`bad index ${k}`);
    const copy = node.slice();
    copy[i] = rest.length ? update(node[i], rest, fn) : fn(node[i], node, k);
    return copy;
  }
  if (!isObj(node)) throw new DeltaError(`not a container at ${k}`);
  if (rest.length) {
    if (!(Object.hasOwn(node, k))) throw new DeltaError(`missing ${k}`);
    return { ...node, [k]: update(node[k], rest, fn) };
  }
  const v = fn(node[k], node, k);
  if (v === DELETE) { const { [k]: _gone, ...keep } = node; void _gone; return keep; }
  return { ...node, [k]: v };
}
const DELETE = Symbol("del");

/** Apply ops in order to a body. Throws DeltaError on a path that doesn't exist (the consumer then resyncs). */
export function applyOps<B>(body: B, ops: readonly DeltaOp[]): B {
  let b: J = body;
  for (const o of ops) {
    const keys = segs(o.path);
    switch (o.op) {
      case "set": b = update(b, keys, () => o.v); break;
      case "del": b = update(b, keys, (leaf) => { if (leaf === undefined) throw new DeltaError(`del of missing ${o.path}`); return DELETE; }); break;
      case "ins": b = update(b, keys, (leaf) => {
        if (!Array.isArray(leaf) || o.idx < 0 || o.idx > leaf.length) throw new DeltaError(`bad ins at ${o.path}`);
        return [...leaf.slice(0, o.idx), o.v, ...leaf.slice(o.idx)];
      }); break;
      case "trim": b = update(b, keys, (leaf) => {
        if (!Array.isArray(leaf) || o.keepLast < 0) throw new DeltaError(`bad trim at ${o.path}`);
        return leaf.slice(Math.max(0, leaf.length - o.keepLast));
      }); break;
    }
  }
  return b as B;
}

export const deepEqual = (a: J, b: J): boolean => {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
};

/**
 * Minimal ops turning `prev` into `next` (mock server side). Arrays at `rings` paths are append-only rings and diff to
 * `ins` + `trim`; other arrays that changed are `set` whole (book levels are small).
 */
export function diffOps(prev: J, next: J, rings: ReadonlySet<string> = new Set(), path = ""): DeltaOp[] {
  if (deepEqual(prev, next)) return [];
  if (Array.isArray(prev) && Array.isArray(next) && rings.has(ringKey(path))) {
    for (let s = 0; s <= prev.length; s++) {
      const kept = prev.slice(s);
      if (kept.length <= next.length && kept.every((x, i) => deepEqual(x, next[i]))) {
        const ops: DeltaOp[] = next.slice(kept.length).map((v, i) => ({ op: "ins", path, idx: prev.length + i, v }));
        if (s > 0) ops.push({ op: "trim", path, keepLast: next.length });
        return ops;
      }
    }
  }
  if (isObj(prev) && isObj(next)) {
    const ops: DeltaOp[] = [];
    for (const k of Object.keys(prev)) if (!(Object.hasOwn(next, k))) ops.push({ op: "del", path: `${path}/${k}` });
    for (const k of Object.keys(next)) {
      if (!(Object.hasOwn(prev, k))) ops.push({ op: "set", path: `${path}/${k}`, v: next[k] });
      else ops.push(...diffOps(prev[k], next[k], rings, `${path}/${k}`));
    }
    return ops;
  }
  return [{ op: "set", path, v: next }];
}
/** Ring keys ignore id segments: `/prints`, `/fills`, `/intents`, `/alerts`, `/items`. */
const ringKey = (path: string) => path;
