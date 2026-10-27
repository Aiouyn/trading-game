// Δ6-B system-side view, control changes (Δ9/Δ10/Δ12), holder classes (Δ13) and rival sub-tags (E-13): spec §2.5, §6.8, §6.9.
import { cbkId, kindOfId, parseAccountKey } from './accounts';
import type { ReasonCatalog } from './catalog';
import { cmpStr, SortedMap } from './det';
import type { Ccy, Id, Money } from './money';
import type { Entry, LedgerEntity } from './types';

export type HolderClass = 'human' | 'npcFirm' | 'npcRival';
export const HOLDER_CLASSES: readonly HolderClass[] = ['human', 'npcFirm', 'npcRival'];
export type RivalTag = 'rival.dynasty' | 'rival.fund';
export const RIVAL_TAGS: readonly RivalTag[] = ['rival.dynasty', 'rival.fund'];
/** Side of an entity in force for a tick: system side S, or a holder class (+ rival tag) on the non-system side. */
export interface SideTag { side: 'S' | 'N'; cls?: HolderClass; tag?: RivalTag }
export const TERM_KEYS = ['F_p', 'K_p', 'X_in', 'X_out', 'C_p', 'controlIn', 'controlOut', 'intraIn', 'intraOut', 'reclassIn', 'reclassOut',
  'netFlow', 'm0Delta', 'subIntraIn', 'subIntraOut', 'subReclassIn', 'subReclassOut'] as const;
export type HolderTerms = Record<(typeof TERM_KEYS)[number], Money>;
export const zeroTerms = (): HolderTerms => ({ F_p: 0n, K_p: 0n, X_in: 0n, X_out: 0n, C_p: 0n, controlIn: 0n, controlOut: 0n, intraIn: 0n, intraOut: 0n,
  reclassIn: 0n, reclassOut: 0n, netFlow: 0n, m0Delta: 0n, subIntraIn: 0n, subIntraOut: 0n, subReclassIn: 0n, subReclassOut: 0n });
export interface SysSideFlows {
  F_p: Money; K_p: Money; F_s: Money; K_s: Money;
  faucet: SortedMap<string, Money>;  // X_in by code: MOVE S -> holder ∉ S
  sink: SortedMap<string, Money>;    // X_out by code: MOVE holder ∉ S -> S
  C_p: Money; C_s: Money;
  controlIn: SortedMap<Id, Money>; controlOut: SortedMap<Id, Money>;
  m0PlayerDelta: Money;              // from balances: Σ_{∉S_{t+1}} m(post) − Σ_{∉S_t} m(pre)
  sysDelta: Money;                   // from balances: Σ_{S_{t+1}} m(post) − Σ_{S_t} m(pre)
  netFlow: Money;                    // N = (F_p − K_p) + (X_in − X_out) + C_p
  netDelta: Money;                   // Σ faucet − Σ sink
  byHolder: SortedMap<HolderClass, HolderTerms>;
  byRivalTag: SortedMap<RivalTag, HolderTerms>;
  treasury: SortedMap<Id, Money>;    // TreasuryBalance: m(e) at end of tick for e ∈ S_{t+1}
}
export const sumMap = <K extends string>(m: SortedMap<K, Money>): Money => m.values().reduce((s, x) => s + x, 0n);

/** Registries read at P13 (TODO(unit-16): the real actor-role registry and Dynasty.holdingCmpIds). */
export interface SideInputs { entity(id: Id): LedgerEntity | undefined; hasRole(id: Id, role: string): boolean; isDynastyHolding(id: Id): boolean }

/**
 * §2.3 / PD-9: gov, cbk, reg, crt are S; exc, ccp are S unless their ultimate controller is a player. Holder side: human (chain ends at
 * chr/ali), npcRival (Δ13 / E-13: under a FUND_PRINCIPAL fund, a dynasty holding cmp or a DYNASTY_MEMBER; the top-most qualifying
 * node of the control chain decides the tag), else npcFirm. Elastic sectors and sys hold no base money: undefined.
 */
export function sideOf(inp: SideInputs, id: Id): SideTag | undefined {
  const k = kindOfId(id);
  if (!k || k === 'sys' || k === 'hh' || k === 'frm' || k === 'row') return undefined;
  if (k === 'gov' || k === 'cbk' || k === 'reg' || k === 'crt') return { side: 'S' };
  const chain: Id[] = []; const seen: Record<string, true> = {};
  for (let cur: Id | null | undefined = id; cur && !seen[cur]; cur = inp.entity(cur)?.ownerId) { seen[cur] = true; chain.push(cur); }
  const rootK = kindOfId(chain[chain.length - 1]);
  const player = rootK === 'chr' || rootK === 'ali';
  if ((k === 'exc' || k === 'ccp') && !player) return { side: 'S' };
  if (player) return { side: 'N', cls: 'human' };
  let tag: RivalTag | undefined;
  for (const n of chain) { // later (higher) nodes override: the top of the chain decides
    const own = inp.entity(n)?.ownerId;
    if (inp.isDynastyHolding(n) || inp.hasRole(n, 'DYNASTY_MEMBER')) tag = 'rival.dynasty';
    else if (kindOfId(n) === 'fnd' && own && inp.hasRole(own, 'FUND_PRINCIPAL')) tag = 'rival.fund';
  }
  return tag ? { side: 'N', cls: 'npcRival', tag } : { side: 'N', cls: 'npcFirm' };
}
export const sameSide = (a: SideTag | undefined, b: SideTag | undefined): boolean => a?.side === b?.side && a?.cls === b?.cls && a?.tag === b?.tag;

/** Holder of a base-money account (1001-1003). Escrow subs are attributed to the depositor (§6.11); the issuer's own-ccy BMA is not money. */
export function bmaHolder(key: string, ccy: Ccy, escrowVictim: (escrowId: Id) => Id | undefined): Id | undefined {
  const q = parseAccountKey(key);
  if (!q || q.ccy !== ccy || q.code < 1001 || q.code > 1003) return undefined;
  const k = kindOfId(q.entityId);
  if (!k || k === 'sys' || k === 'hh' || k === 'frm' || k === 'row' || q.entityId === cbkId(ccy)) return undefined;
  if (k === 'crt' && q.sub?.startsWith('ESCROW:')) return escrowVictim(q.sub.slice(7)) ?? q.entityId;
  return q.entityId;
}
const isIssuer = (key: string, ccy: Ccy): boolean => { const q = parseAccountKey(key); return !!q && q.entityId === cbkId(ccy) && q.code >= 2001 && q.code <= 2003; };

export interface ControlChange { id: Id; ccy: Ccy; code: 'LED_CONTROL_IN' | 'LED_CONTROL_OUT' | 'LED_HOLDER_RECLASS'; amount: Money; before: SideTag; after: SideTag }
/** Control / class / tag changes of tick t, sorted by id (Δ10): one per entity per ccy with m(e) ≠ 0n at the end of t. */
export function controlChanges(ids: readonly Id[], ccy: Ccy, before: (id: Id) => SideTag | undefined, after: (id: Id) => SideTag | undefined,
  holdPost: SortedMap<string, Money>): ControlChange[] {
  const out: ControlChange[] = [];
  for (const id of [...ids].sort(cmpStr)) {
    const b = before(id); const a = after(id); if (!b || !a || sameSide(a, b)) continue;
    const m = holdPost.get(`${id}|${ccy}`) ?? 0n; if (m === 0n) continue;
    const code = b.side === 'N' && a.side === 'S' ? 'LED_CONTROL_IN' : b.side === 'S' && a.side === 'N' ? 'LED_CONTROL_OUT' : b.side === 'N' ? 'LED_HOLDER_RECLASS' : null;
    if (code) out.push({ id, ccy, code, amount: m, before: b, after: a });
  }
  return out;
}

export interface ClassifyInput {
  ccy: Ccy; entries: readonly Entry[]; catalog: ReasonCatalog;
  before(id: Id): SideTag | undefined;   // S_t / classes_t: in force for this tick's flows
  after(id: Id): SideTag | undefined;    // S_{t+1}
  escrowVictim(id: Id): Id | undefined;
  holdPre: SortedMap<string, Money>; holdPost: SortedMap<string, Money>;
}
/** The per-tick system-side view of one currency (§2.5). BMA postings that fit no bucket are returned as anomalies (INV-LED-016). */
export function classify(inp: ClassifyInput, changes: readonly ControlChange[]): { flows: SysSideFlows; anomalies: string[] } {
  const { ccy } = inp;
  const f: SysSideFlows = { F_p: 0n, K_p: 0n, F_s: 0n, K_s: 0n, faucet: new SortedMap(), sink: new SortedMap(), C_p: 0n, C_s: 0n,
    controlIn: new SortedMap(), controlOut: new SortedMap(), m0PlayerDelta: 0n, sysDelta: 0n, netFlow: 0n, netDelta: 0n,
    byHolder: new SortedMap(HOLDER_CLASSES.map((c) => [c, zeroTerms()])), byRivalTag: new SortedMap(RIVAL_TAGS.map((t) => [t, zeroTerms()])), treasury: new SortedMap() };
  const anomalies: string[] = [];
  const add = (m: SortedMap<string, Money>, k: string, a: Money): void => { m.set(k, (m.get(k) ?? 0n) + a); };
  const term = (s: SideTag | undefined, key: keyof HolderTerms, a: Money, tagKey?: keyof HolderTerms): void => {
    if (!s?.cls) return;
    (f.byHolder.get(s.cls) as HolderTerms)[key] += a;
    if (s.tag) (f.byRivalTag.get(s.tag) as HolderTerms)[tagKey ?? key] += a;
  };
  for (const e of inp.entries) for (const p of e.postings) {
    if (p.ccy !== ccy) continue;
    const d = bmaHolder(p.debitAccount, ccy, inp.escrowVictim); const c = bmaHolder(p.creditAccount, ccy, inp.escrowVictim);
    if (!d && !c) continue;
    const a = p.amount;
    if (d && c) { // MOVE c -> d
      if (d === c) continue;
      const sc = inp.before(c); const sd = inp.before(d); const cs = sc?.side === 'S'; const ds = sd?.side === 'S';
      if (cs && ds) continue;
      if (!cs && ds) { add(f.sink, p.reason, a); term(sc, 'X_out', a); continue; }
      if (cs && !ds) { add(f.faucet, p.reason, a); term(sd, 'X_in', a); continue; }
      if (sc?.cls !== sd?.cls) { term(sc, 'intraOut', a); term(sd, 'intraIn', a); }
      else if (sc?.tag !== sd?.tag) { term(sc, 'subIntraOut', a); term(sd, 'subIntraIn', a); }
      continue;
    }
    const h = (d ?? c) as Id; const other = d ? p.creditAccount : p.debitAccount; const signed = d ? a : -a;
    if (!isIssuer(other, ccy)) { anomalies.push(`${e.entryId}#${p.postingSeq} ${p.reason}: BMA ${d ? p.debitAccount : p.creditAccount} against ${other}`); continue; }
    const s = inp.before(h); const inS = s?.side === 'S'; const cls = inp.catalog.get(p.reason)?.cls;
    if (cls === 'FAUCET' || cls === 'SINK') {
      if (signed > 0n) { if (inS) f.F_s += signed; else { f.F_p += signed; term(s, 'F_p', signed); } }
      else if (inS) f.K_s += -signed; else { f.K_p += -signed; term(s, 'K_p', -signed); }
    } else if (inS) f.C_s += signed; else { f.C_p += signed; term(s, 'C_p', signed); }
  }
  for (const ch of changes) {
    if (ch.ccy !== ccy) continue;
    if (ch.code === 'LED_CONTROL_IN') { add(f.controlIn, ch.id, ch.amount); term(ch.before, 'controlIn', ch.amount); }
    else if (ch.code === 'LED_CONTROL_OUT') { add(f.controlOut, ch.id, ch.amount); term(ch.after, 'controlOut', ch.amount); }
    else if (ch.before.cls !== ch.after.cls) { term(ch.before, 'reclassOut', ch.amount); term(ch.after, 'reclassIn', ch.amount); }
    else { // tag change inside npcRival: sub-terms only, net 0 at class level (E-13)
      (f.byRivalTag.get(ch.before.tag as RivalTag) as HolderTerms).subReclassOut += ch.amount;
      (f.byRivalTag.get(ch.after.tag as RivalTag) as HolderTerms).subReclassIn += ch.amount;
    }
  }
  // Balance-derived deltas (independent of the classification above).
  const sideSum = (h: SortedMap<string, Money>, at: (id: Id) => SideTag | undefined, want: (s: SideTag) => boolean): Money => {
    let s = 0n;
    for (const [k, m] of h) { const i = k.lastIndexOf('|'); if (k.slice(i + 1) !== ccy) continue; const t = at(k.slice(0, i)); if (t && want(t)) s += m; }
    return s;
  };
  f.m0PlayerDelta = sideSum(inp.holdPost, inp.after, (s) => s.side === 'N') - sideSum(inp.holdPre, inp.before, (s) => s.side === 'N');
  f.sysDelta = sideSum(inp.holdPost, inp.after, (s) => s.side === 'S') - sideSum(inp.holdPre, inp.before, (s) => s.side === 'S');
  for (const [k, t] of f.byHolder) {
    t.netFlow = t.F_p - t.K_p + t.X_in - t.X_out + t.C_p;
    t.m0Delta = sideSum(inp.holdPost, inp.after, (s) => s.cls === k) - sideSum(inp.holdPre, inp.before, (s) => s.cls === k);
  }
  for (const [k, t] of f.byRivalTag) {
    t.netFlow = t.F_p - t.K_p + t.X_in - t.X_out + t.C_p;
    t.m0Delta = sideSum(inp.holdPost, inp.after, (s) => s.tag === k) - sideSum(inp.holdPre, inp.before, (s) => s.tag === k);
  }
  f.netFlow = f.F_p - f.K_p + sumMap(f.faucet) - sumMap(f.sink) + f.C_p;
  f.netDelta = sumMap(f.faucet) - sumMap(f.sink);
  for (const [k, m] of inp.holdPost) { const i = k.lastIndexOf('|'); if (k.slice(i + 1) === ccy && inp.after(k.slice(0, i))?.side === 'S') f.treasury.set(k.slice(0, i), m); }
  return { flows: f, anomalies };
}

/** Sum of two SysSideFlows (archive rows); treasury = the later row's. */
export function addSys(a: SysSideFlows, b: SysSideFlows): SysSideFlows {
  const mm = <K extends string>(x: SortedMap<K, Money>, y: SortedMap<K, Money>): SortedMap<K, Money> => {
    const o = x.clone(); for (const [k, v] of y) o.set(k, (o.get(k) ?? 0n) + v); return o;
  };
  const tt = <K extends string>(x: SortedMap<K, HolderTerms>, y: SortedMap<K, HolderTerms>): SortedMap<K, HolderTerms> =>
    new SortedMap(x.entries().map(([k, t]) => { const u = y.get(k) ?? zeroTerms(); const r = zeroTerms(); for (const n of TERM_KEYS) r[n] = t[n] + u[n]; return [k, r]; }));
  return { F_p: a.F_p + b.F_p, K_p: a.K_p + b.K_p, F_s: a.F_s + b.F_s, K_s: a.K_s + b.K_s, faucet: mm(a.faucet, b.faucet), sink: mm(a.sink, b.sink),
    C_p: a.C_p + b.C_p, C_s: a.C_s + b.C_s, controlIn: mm(a.controlIn, b.controlIn), controlOut: mm(a.controlOut, b.controlOut),
    m0PlayerDelta: a.m0PlayerDelta + b.m0PlayerDelta, sysDelta: a.sysDelta + b.sysDelta, netFlow: a.netFlow + b.netFlow, netDelta: a.netDelta + b.netDelta,
    byHolder: tt(a.byHolder, b.byHolder), byRivalTag: tt(a.byRivalTag, b.byRivalTag), treasury: b.treasury.clone() };
}
export function emptySys(): SysSideFlows {
  return { F_p: 0n, K_p: 0n, F_s: 0n, K_s: 0n, faucet: new SortedMap(), sink: new SortedMap(), C_p: 0n, C_s: 0n, controlIn: new SortedMap(), controlOut: new SortedMap(),
    m0PlayerDelta: 0n, sysDelta: 0n, netFlow: 0n, netDelta: 0n, byHolder: new SortedMap(HOLDER_CLASSES.map((c) => [c, zeroTerms()])),
    byRivalTag: new SortedMap(RIVAL_TAGS.map((t) => [t, zeroTerms()])), treasury: new SortedMap() };
}
