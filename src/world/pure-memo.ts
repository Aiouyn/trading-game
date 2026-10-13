/**
 * A bounded memo for a pure function (V1-PHASE9 9C.1). The key carries every input of the function, so a hit is the value the
 * function would return, and nothing needs invalidating. Past `cap` entries the oldest one is dropped. Used for the hashes that
 * every view used to recompute: the auction lots and reserve factors and the tournament seeds (one answer per week, not per socket).
 * clearPureMemos empties every memo: the tests compare a cold view (no memo) with a warm one.
 */
const memos: Map<string, unknown>[] = [];

export function pureMemo<V>(cap: number): (key: string, make: () => V) => V {
  const m = new Map<string, V>();
  memos.push(m);
  return (key, make) => {
    const hit = m.get(key);
    if (hit !== undefined) return hit;
    const v = make();
    m.set(key, v);
    if (m.size > cap) {
      const first = m.keys().next().value;
      if (first !== undefined) m.delete(first);
    }
    return v;
  };
}

/** Empties every pure memo (tests only: the answers are the same with or without them). */
export function clearPureMemos(): void {
  for (const m of memos) m.clear();
}
