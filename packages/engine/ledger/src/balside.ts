// E-84 incremental tick invariants: the BALANCE side. Every value in this file is read from account balances in the store: the
// running per-ccy totals, the store-layer dirty set (each written key's balance at the start and at the end of the tick, from the
// SortedMap write journal, which records every write by any path), or a full scan of the accounts. Nothing here reads a posting:
// the FLOW side (FAUCET / SINK / CREDIT_* sums, buckets, byCode) comes from postings in invariants.ts / sysside.ts, and the two
// sides must agree (E-84 condition 1; test/incremental.test.ts checks this file's imports and identifiers structurally).
import { cbkId, kindOfId, parseAccountKey, SYS_ID } from './accounts';
import { cmpStr, SortedMap } from './det';
import { CCYS, type Ccy, type Id, type Money, type Qty } from './money';
import type { Accounts, Bal, Failure } from './invariants';
import { bmaHolder } from './sysside';

/** Running money totals of one ccy, each a pure function of the balances (T03-11 definitions; same keys as the full scans). */
export interface CcyTotals {
  m0: Money; m0sys: Money; m2: Money; netIssuance: Money; bridge2909: Money;
  escrow1001: Money; sum2160: Money; sum1070: Money; // INV-LED-022 (a): Σ 1001 ESCROW:*, Σ 2160, Σ 1070
  mirror: SortedMap<string, Money>; // I17 mirror per elastic sector: sys:2909:<X> + X:1009 (no sub); 0n entries are dropped
}
export type Totals = SortedMap<Ccy, CcyTotals>;
/** One dirty account: its balance at the start of the tick (last commit) and now; undefined = absent (0n/0n). */
export type DirtyRow = readonly [key: string, start: Bal | undefined, end: Bal | undefined];
/** The balance side of a tick, as the checks read it: totals at the start and at the end of the tick, and the qty movement. */
export interface BalanceSide {
  start(ccy: Ccy): CcyTotals;
  end(ccy: Ccy): CcyTotals;
  /** Σ end − start qty per `${sub}|${ccy}` over the accounts that moved; only non-zero groups. */
  qtyDelta: SortedMap<string, Qty>;
}

const emptyCcy = (): CcyTotals => ({ m0: 0n, m0sys: 0n, m2: 0n, netIssuance: 0n, bridge2909: 0n, escrow1001: 0n, sum2160: 0n, sum1070: 0n, mirror: new SortedMap() });
export const emptyTotals = (): Totals => new SortedMap(CCYS.map((c) => [c, emptyCcy()]));
const copyCcy = (t: CcyTotals): CcyTotals => ({ ...t, mirror: t.mirror.clone() });
export const copyTotals = (t: Totals): Totals => new SortedMap(t.entries().map(([c, x]) => [c, copyCcy(x)]));
const bump = (m: SortedMap<string, bigint>, k: string, d: bigint): void => { const n = (m.get(k) ?? 0n) + d; if (n === 0n) m.delete(k); else m.set(k, n); };

/** Adds `b` (a balance, or a balance change) held on account `k` to the totals of k's ccy. */
function addBalance(t: Totals, k: string, b: Money): void {
  if (b === 0n) return;
  const q = parseAccountKey(k); if (!q) return;
  const c = t.get(q.ccy); if (!c) return;
  const kind = kindOfId(q.entityId);
  if (kind === 'cbk' && q.code >= 2001 && q.code <= 2003) c.m0 -= b;                      // computeM0
  if (q.entityId === cbkId(q.ccy) && q.code === 1910 && q.sub === undefined) c.m0sys += b; // computeM0sys: cbk_<ccy>:1910:<ccy>
  if (q.code === 1001 && kind !== 'bnk' && kind !== 'cbk' && kind !== 'gov') c.m2 += b;    // computeM2
  if (q.code === 2100 && kind === 'bnk') c.m2 -= b;
  if (q.entityId === SYS_ID && (q.code === 3990 || q.code === 4900 || q.code === 5900)) c.netIssuance += b;
  if (q.code === 1001 && q.sub?.startsWith('ESCROW:')) c.escrow1001 += b;
  if (q.code === 2160) c.sum2160 += b;
  if (q.code === 1070) c.sum1070 += b;
  if (q.entityId === SYS_ID && q.code === 2909) { c.bridge2909 += b; if (q.sub) bump(c.mirror, q.sub, b); }
  else if (q.code === 1009 && q.sub === undefined) bump(c.mirror, q.entityId, b);
}
/** Full recompute from every account in `a` (load, replay, abort, the DAY_CLOSE cross-check, the every-tick fallback flag). */
export function scanTotals(a: Accounts): Totals {
  const t = emptyTotals();
  for (const [k, b] of a) addBalance(t, k, b.balance);
  return t;
}
/** O(dirty): the totals after the dirty accounts moved from their start to their end balance. Does not modify `start`. */
export function advanceTotals(start: Totals, dirty: readonly DirtyRow[]): Totals {
  const t = copyTotals(start);
  for (const [k, s, e] of dirty) addBalance(t, k, (e?.balance ?? 0n) - (s?.balance ?? 0n));
  return t;
}
function qtyDeltaOf(dirty: readonly DirtyRow[]): SortedMap<string, Qty> {
  const out = new SortedMap<string, Qty>();
  for (const [k, s, e] of dirty) {
    const d = (e?.qty ?? 0n) - (s?.qty ?? 0n); if (d === 0n) continue;
    const q = parseAccountKey(k); if (q?.sub) bump(out, `${q.sub}|${q.ccy}`, d);
  }
  return out;
}
/** The incremental balance side: running totals at the start of the tick, advanced over the dirty set. */
export function incrementalSide(start: Totals, dirty: readonly DirtyRow[]): BalanceSide & { endTotals: Totals } {
  const end = advanceTotals(start, dirty);
  return { start: (c) => start.get(c) as CcyTotals, end: (c) => end.get(c) as CcyTotals, qtyDelta: qtyDeltaOf(dirty), endTotals: end };
}
/** The full-scan balance side (pure CheckViews in tests; the world when ledger_inv_full_scan_every_tick is on). */
export function scanSide(pre: Accounts, post: Accounts): BalanceSide {
  const s = scanTotals(pre); const e = scanTotals(post);
  const dirty: DirtyRow[] = [];
  for (const [k, b] of post) { const a = pre.get(k); if (!a || a.qty !== b.qty) dirty.push([k, a, b]); }
  for (const [k, a] of pre) if (!post.has(k)) dirty.push([k, a, undefined]);
  return { start: (c) => s.get(c) as CcyTotals, end: (c) => e.get(c) as CcyTotals, qtyDelta: qtyDeltaOf(dirty) };
}

/** m(e) per `${id}|${ccy}` after the tick: the committed holdings plus each dirty base-money account's balance change, attributed by
 *  bmaHolder (escrow subs to the depositor). A dirty holder key is always present afterwards (0n included), as before. */
export function advanceHoldings(pre: SortedMap<string, Money>, dirty: readonly DirtyRow[], escrowVictim: (id: Id) => Id | undefined): SortedMap<string, Money> {
  const out = pre.clone();
  for (const [k, s, e] of dirty) {
    const q = parseAccountKey(k); if (!q) continue;
    const h = bmaHolder(k, q.ccy, escrowVictim); if (!h) continue;
    const key = `${h}|${q.ccy}`; out.set(key, (out.get(key) ?? 0n) + (e?.balance ?? 0n) - (s?.balance ?? 0n));
  }
  return out;
}
/** Full recompute of m(e) from every account (non-zero holders only). */
export function scanHoldings(a: Accounts, escrowVictim: (id: Id) => Id | undefined): SortedMap<string, Money> {
  const out = new SortedMap<string, Money>();
  for (const [k, b] of a) {
    const q = parseAccountKey(k); if (!q) continue;
    const h = bmaHolder(k, q.ccy, escrowVictim); if (h) bump(out, `${h}|${q.ccy}`, b.balance);
  }
  return out;
}

/**
 * Accounts the tick checks must see beyond the dirty set (E-84 condition 5, INCR-PERF), kept like the totals: every account with a
 * negative balance that INV-LED-008 bounds (`overdraftScope`; it skips the rest) and every non-zero account with a sub, grouped by `${entity}|${sub}`
 * (INV-LED-022 (e)). Applied in place at each commit from the dirty set, rebuilt by a full scan on load and abort, cross-checked at
 * DAY_CLOSE.
 */
export class AccountIndex {
  readonly negative = new SortedMap<string, Money>();
  readonly bySub = new SortedMap<string, SortedMap<string, Money>>();
  static scan(a: Accounts): AccountIndex { const x = new AccountIndex(); for (const [k, b] of a) x.put(k, b); return x; }
  apply(dirty: readonly DirtyRow[]): void { for (const [k, , e] of dirty) { this.drop(k); if (e) this.put(k, e); } }
  private put(k: string, b: Bal): void {
    if (b.balance < 0n && overdraftScope(k)) this.negative.set(k, b.balance);
    const g = subGroup(k); if (!g || b.balance === 0n) return;
    let m = this.bySub.get(g); if (!m) { m = new SortedMap(); this.bySub.set(g, m); }
    m.set(k, b.balance);
  }
  private drop(k: string): void {
    this.negative.delete(k);
    const g = subGroup(k); const m = g ? this.bySub.get(g) : undefined;
    if (g && m) { m.delete(k); if (m.size === 0) this.bySub.delete(g); }
  }
}
/** The accounts INV-LED-008 (I10) bounds below: 1001/1002/1003/1010 of any entity but CBK and SYS. */
export const overdraftScope = (k: string): boolean => {
  const q = parseAccountKey(k); if (!q) return false;
  const kind = kindOfId(q.entityId);
  return kind !== 'cbk' && kind !== 'sys' && (q.code === 1001 || q.code === 1002 || q.code === 1003 || q.code === 1010);
};
const subGroup = (k: string): string | undefined => { const q = parseAccountKey(k); return q?.sub === undefined ? undefined : `${q.entityId}|${q.sub}`; };
/** What the checks read for this tick: the committed index overlaid with the dirty set (O(index hits + dirty)). */
export interface TickIndex {
  /** Keys of every `overdraftScope` account with a negative balance now, sorted. */
  negatives(): string[];
  /** Every non-zero account of `entity` with sub `sub` now, sorted by key. */
  withSub(entity: Id, sub: string): [string, Money][];
  /** Every account written this tick (any path) with its balance now, sorted; absent accounts omitted. */
  written(): [string, Bal][];
  /** Every `${entity}|${sub}` group the index may hold an account for (cross-check). */
  groups(): string[];
}
export function tickIndex(base: AccountIndex, dirty: readonly DirtyRow[]): TickIndex {
  const end = new SortedMap<string, Bal | undefined>(dirty.map(([k, , e]) => [k, e]));
  const dirtyBySub = new SortedMap<string, string[]>();
  for (const [k] of dirty) { const g = subGroup(k); if (g) dirtyBySub.set(g, [...(dirtyBySub.get(g) ?? []), k]); }
  return {
    negatives: () => [...base.negative.keys().filter((k) => !end.has(k)), ...dirty.filter(([k, , e]) => e !== undefined && e.balance < 0n && overdraftScope(k)).map(([k]) => k)].sort(cmpStr),
    withSub: (entity, sub) => {
      const g = `${entity}|${sub}`;
      const kept = (base.bySub.get(g)?.entries() ?? []).filter(([k]) => !end.has(k));
      const now = (dirtyBySub.get(g) ?? []).flatMap((k): [string, Money][] => { const b = end.get(k)?.balance ?? 0n; return b === 0n ? [] : [[k, b]]; });
      return [...kept, ...now].sort((a, b) => cmpStr(a[0], b[0]));
    },
    written: () => dirty.flatMap(([k, , e]): [string, Bal][] => (e ? [[k, e]] : [])),
    groups: () => [...new SortedMap<string, true>([...base.bySub.keys(), ...dirtyBySub.keys()].map((g) => [g, true])).keys()],
  };
}
/** The full-scan TickIndex (fallback flag, cross-check). */
export const scanIndex = (a: Accounts): TickIndex => tickIndex(AccountIndex.scan(a), []);
const indexRows = (t: TickIndex, groups: readonly string[]): string[] => [
  ...t.negatives().map((k) => `negative ${k}`),
  ...groups.flatMap((g) => { const i = g.indexOf('|'); return t.withSub(g.slice(0, i), g.slice(i + 1)).map(([k, b]) => `sub ${k} ${b}`); }),
];

const FIELDS = ['m0', 'm0sys', 'm2', 'netIssuance', 'bridge2909', 'escrow1001', 'sum2160', 'sum1070'] as const;
const FIELD_NAME: Record<(typeof FIELDS)[number], string> = { m0: 'M0', m0sys: 'M0_sys', m2: 'M2', netIssuance: 'netIssuance', bridge2909: 'bridge2909',
  escrow1001: 'Σ 1001 ESCROW', sum2160: 'Σ 2160', sum1070: 'Σ 1070' };
/**
 * E-84 condition 3: incremental running totals and per-holder aggregates = the full recompute from live accounts, exactly. Any
 * mismatch is FATAL and names the ccy, the field and both values. Id INV-LED-013 (the existing derived-state = full recompute
 * cross-check, see dormantCrossCheck); E-84 names no id of its own.
 */
export function totalsCrossCheck(inc: Totals, full: Totals, holdInc: SortedMap<string, Money>, holdFull: SortedMap<string, Money>,
  idxInc: TickIndex, live: Accounts): Failure[] {
  const out: Failure[] = [];
  const f = (observed: string): Failure => ({ invariantId: 'INV-LED-013', severity: 'FATAL', observed, expected: 'incremental = full recompute (E-84 DAY_CLOSE cross-check)' });
  for (const c of CCYS) {
    const a = inc.get(c) ?? emptyCcy(); const b = full.get(c) ?? emptyCcy();
    for (const k of FIELDS) if (a[k] !== b[k]) out.push(f(`E-84 ${c} ${FIELD_NAME[k]}: incremental ${a[k]} vs full ${b[k]}`));
    for (const x of [...new SortedMap([...a.mirror.entries(), ...b.mirror.entries()]).keys()]) {
      const ai = a.mirror.get(x) ?? 0n; const bi = b.mirror.get(x) ?? 0n;
      if (ai !== bi) out.push(f(`E-84 ${c} mirror ${x}: incremental ${ai} vs full ${bi}`));
    }
  }
  for (const k of new SortedMap([...holdInc.entries(), ...holdFull.entries()]).keys()) {
    const ai = holdInc.get(k) ?? 0n; const bi = holdFull.get(k) ?? 0n;
    if (ai !== bi) { const i = k.lastIndexOf('|'); out.push(f(`E-84 ${k.slice(i + 1)} m(${k.slice(0, i)}): incremental ${ai} vs full ${bi}`)); }
  }
  // The account index: the rows the incremental index yields (over every group either side knows) = the full scan's.
  const idxFull = scanIndex(live);
  const groups = [...new SortedMap<string, true>([...idxInc.groups(), ...idxFull.groups()].map((g) => [g, true])).keys()];
  const a = indexRows(idxInc, groups).join('\n'); const b = indexRows(idxFull, groups).join('\n');
  if (a !== b) {
    const as = a.split('\n'); const bs = b.split('\n');
    const x = as.find((r) => !bs.includes(r)); const y = bs.find((r) => !as.includes(r));
    const ccy = (r: string | undefined): string => (r ? parseAccountKey(r.split(' ')[1])?.ccy ?? '?' : '?');
    out.push(f(`E-84 ${ccy(x ?? y)} account index: incremental ${x ?? '(none)'} vs full ${y ?? '(none)'}`));
  }
  return out;
}
