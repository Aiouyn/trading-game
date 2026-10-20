// INV-LED-016, 019, 020, 021, 022, 023, 024 (TICK, FATAL): spec §4 L17-L23 (errata E-2), E-12, E-13 (L24), E-14 (L25).
import { accountKey, parseAccountKey } from './accounts';
import { ESCROW_ONLY_CODES } from './catalog';
import { canonEncode, hashHex, SortedMap } from './det';
import type { CheckView, Failure, TickFlows } from './invariants';
import { CCYS, type Ccy, type Money, type Tick } from './money';
import { RECEIVABLE, SETTLEMENT_CODES, type AccrualKind } from './legpolicy';
import { addSys, controlChanges, emptySys, HOLDER_CLASSES, RIVAL_TAGS, sumMap, TERM_KEYS, type HolderTerms, type SysSideFlows } from './sysside';

const F = (invariantId: string, observed: string, expected: string): Failure => ({ invariantId, observed, expected, severity: 'FATAL' });
const sysOf = (v: CheckView, c: Ccy): SysSideFlows | undefined => v.flows.get(c)?.sysSide;
const bal = (v: CheckView, k: string): Money => v.post.get(k)?.balance ?? 0n;

/** L17: TreasuryBalance(e) = m(e) for every e ∈ S_{t+1}; ΔΣ_S m = F_s − K_s − X_in + X_out + C_s + Σ controlIn − Σ controlOut; every BMA posting classified. */
export const INV_LED_016 = (v: CheckView): Failure[] => {
  if (!v.sys) return [];
  const out: Failure[] = v.sys.anomalies.map((a) => F('INV-LED-016', `unclassified BMA posting ${a}`, 'MOVE or ISSUE'));
  for (const c of CCYS) {
    const s = sysOf(v, c); if (!s) continue;
    for (const [id, m] of s.treasury) { const h = v.sys.holdPost.get(`${id}|${c}`) ?? 0n; if (h !== m) out.push(F('INV-LED-016', `TreasuryBalance(${id},${c}) ${m}`, `m(e) ${h}`)); }
    const want = s.F_s - s.K_s - sumMap(s.faucet) + sumMap(s.sink) + s.C_s + sumMap(s.controlIn) - sumMap(s.controlOut);
    if (s.sysDelta !== want) out.push(F('INV-LED-016', `ΔΣ_S m(${c}) ${s.sysDelta}`, `F_s − K_s − X_in + X_out + C_s + ctlIn − ctlOut = ${want}`));
  }
  return out;
};
/** L20: ΔM0_player = (F_p − K_p) + (X_in − X_out) + C_p − (Σ controlIn − Σ controlOut); F_p+F_s−K_p−K_s = ΔM0_sys; C_p + C_s = ΔM0_cb. */
export const INV_LED_019 = (v: CheckView): Failure[] => {
  if (!v.sys) return [];
  const out: Failure[] = [];
  for (const c of CCYS) {
    const s = sysOf(v, c); const f = v.flows.get(c); if (!s || !f) continue;
    const want = s.netFlow - (sumMap(s.controlIn) - sumMap(s.controlOut));
    if (s.m0PlayerDelta !== want) out.push(F('INV-LED-019', `ΔM0_player(${c}) ${s.m0PlayerDelta}`, `N − (ctlIn − ctlOut) = ${want}`));
    if (s.F_p + s.F_s - s.K_p - s.K_s !== f.m0sysDelta) out.push(F('INV-LED-019', `F_p+F_s−K_p−K_s(${c}) ${s.F_p + s.F_s - s.K_p - s.K_s}`, `ΔM0_sys ${f.m0sysDelta}`));
    if (s.C_p + s.C_s !== v.sys.dM0cb(c)) out.push(F('INV-LED-019', `C_p+C_s(${c}) ${s.C_p + s.C_s}`, `ΔM0_cb ${v.sys.dM0cb(c)}`));
  }
  return out;
};
/** L21 (Δ10): exactly one CONTROL_RECLASS entry per changed entity per ccy with m ≠ 0n, amount m(e), refs [before, after]; nothing else; no BMA touched. */
export const INV_LED_020 = (v: CheckView): Failure[] => {
  if (!v.sys) return [];
  const out: Failure[] = [];
  const got = v.entries.filter((e) => e.template === 'CONTROL_RECLASS');
  for (const c of CCYS) {
    const want = controlChanges(v.sys.ids, c, v.sys.before, v.sys.after, v.sys.holdPost).map((x) => `${x.code}|${x.id}|${x.amount}`);
    const have = got.flatMap((e) => e.postings.filter((p) => p.ccy === c).map((p) => `${e.reason}|${parseAccountKey(p.debitAccount)?.sub ?? ''}|${p.amount}`));
    if (want.join(';') !== have.join(';')) out.push(F('INV-LED-020', `control entries(${c}) [${have.join(';')}]`, `[${want.join(';')}]`));
  }
  for (const e of got) for (const p of e.postings) for (const k of [p.debitAccount, p.creditAccount]) {
    const q = parseAccountKey(k); if (q && q.code < 9000) out.push(F('INV-LED-020', `${e.reason} touches ${k}`, 'MEMO accounts only'));
  }
  return out;
};
const termsCheck = (id: string, where: string, t: HolderTerms, withSub: boolean): Failure[] => {
  const sub = withSub ? t.subIntraIn - t.subIntraOut + t.subReclassIn - t.subReclassOut : 0n;
  const want = t.F_p - t.K_p + t.X_in - t.X_out + t.C_p + t.intraIn - t.intraOut + t.reclassIn - t.reclassOut + sub - (t.controlIn - t.controlOut);
  return t.m0Delta === want ? [] : [F(id, `${where} m0Delta ${t.m0Delta}`, `class identity ${want}`)];
};
/** L22 (Δ13): per class identity closes; Σ_class terms = totals; intra and reclass net to 0. */
export const INV_LED_021 = (v: CheckView): Failure[] => {
  if (!v.sys) return [];
  const out: Failure[] = [];
  for (const c of CCYS) {
    const s = sysOf(v, c); if (!s) continue;
    const sum = (k: keyof HolderTerms): Money => HOLDER_CLASSES.reduce((a, h) => a + (s.byHolder.get(h) as HolderTerms)[k], 0n);
    for (const h of HOLDER_CLASSES) out.push(...termsCheck('INV-LED-021', `${c}/${h}`, s.byHolder.get(h) as HolderTerms, false));
    const totals: [keyof HolderTerms, Money][] = [['F_p', s.F_p], ['K_p', s.K_p], ['X_in', sumMap(s.faucet)], ['X_out', sumMap(s.sink)], ['C_p', s.C_p],
      ['controlIn', sumMap(s.controlIn)], ['controlOut', sumMap(s.controlOut)], ['netFlow', s.netFlow], ['m0Delta', s.m0PlayerDelta]];
    for (const [k, tot] of totals) if (sum(k) !== tot) out.push(F('INV-LED-021', `Σ_class ${k}(${c}) ${sum(k)}`, `${tot}`));
    if (sum('intraIn') !== sum('intraOut')) out.push(F('INV-LED-021', `intra(${c}) in ${sum('intraIn')} out ${sum('intraOut')}`, 'net 0n'));
    if (sum('reclassIn') !== sum('reclassOut')) out.push(F('INV-LED-021', `reclass(${c}) in ${sum('reclassIn')} out ${sum('reclassOut')}`, 'net 0n'));
  }
  return out;
};
/** L24 (E-13): rival tags sum to npcRival; sub-terms net 0; each tag's identity closes (archive half: INV-LED-017). */
export const INV_LED_023 = (v: CheckView): Failure[] => {
  if (!v.sys) return [];
  const out: Failure[] = [];
  for (const c of CCYS) { const s = sysOf(v, c); if (s) out.push(...rivalTagChecks(s, `${c}`)); }
  return out;
};
export function rivalTagChecks(s: SysSideFlows, where: string): Failure[] {
  const out: Failure[] = [];
  const r = s.byHolder.get('npcRival') as HolderTerms;
  const tag = (k: keyof HolderTerms): Money => RIVAL_TAGS.reduce((a, t) => a + (s.byRivalTag.get(t) as HolderTerms)[k], 0n);
  for (const k of TERM_KEYS) if (!k.startsWith('sub') && tag(k) !== r[k]) out.push(F('INV-LED-023', `Σ_tag ${k}(${where}) ${tag(k)}`, `npcRival ${r[k]}`));
  if (tag('subIntraIn') !== tag('subIntraOut')) out.push(F('INV-LED-023', `subIntra(${where}) ${tag('subIntraIn')}/${tag('subIntraOut')}`, 'net 0n'));
  if (tag('subReclassIn') !== tag('subReclassOut')) out.push(F('INV-LED-023', `subReclass(${where}) ${tag('subReclassIn')}/${tag('subReclassOut')}`, 'net 0n'));
  for (const t of RIVAL_TAGS) out.push(...termsCheck('INV-LED-023', `${where}/${t}`, s.byRivalTag.get(t) as HolderTerms, true));
  return out;
}
const isEscrowKey = (k: string): boolean => { const q = parseAccountKey(k); return !!q && ((q.code === 1001 && !!q.sub?.startsWith('ESCROW:')) || q.code === 2160 || q.code === 1070); };
/** L23 (§6.11 a-e, PD-15; E-12 layer 3 widened). */
export const INV_LED_022 = (v: CheckView): Failure[] => {
  if (!v.escrows) return [];
  const out: Failure[] = [];
  for (const c of CCYS) { // (a)
    let esc = 0n; let liab = 0n; let claim = 0n;
    for (const [k, b] of v.post) { const q = parseAccountKey(k); if (!q || q.ccy !== c) continue;
      if (q.code === 1001 && q.sub?.startsWith('ESCROW:')) esc += b.balance; if (q.code === 2160) liab -= b.balance; if (q.code === 1070) claim += b.balance; }
    const held = v.escrows.values().filter((e) => e.ccy === c && e.status === 'HELD').reduce((s, e) => s + e.amount, 0n);
    if (esc !== held || liab !== held || claim !== held) out.push(F('INV-LED-022', `(a) ${c}: ESCROW ${esc}, 2160 ${liab}, 1070 ${claim}`, `Σ HELD ${held}`));
  }
  for (const e of v.entries) { // (b) + E-12 layer 3
    const escrowTpl = e.template === 'ESCROW_PLACE' || e.template === 'ESCROW_SETTLE';
    for (const p of e.postings) {
      if (!escrowTpl && (isEscrowKey(p.debitAccount) || isEscrowKey(p.creditAccount))) out.push(F('INV-LED-022', `(b) ${e.entryId} ${p.reason} touches escrow accounts`, 'ESCROW_PLACE / ESCROW_SETTLE only'));
      if (ESCROW_ONLY_CODES.includes(p.reason)) {
        const m = e.meta?.escrow; const want = m?.op === 'PLACE' ? m.row : undefined; const row = want ? v.escrows.get(want.escrowId) : undefined;
        if (!row || !want || row.victimId !== want.victimId || row.amount !== want.amount || e.template !== 'ESCROW_PLACE')
          out.push(F('INV-LED-022', `(b) ${e.entryId} ${p.reason} without a live led.escrow row`, 'matching escrowId, victim and amount'));
      }
    }
  }
  for (const h of v.holds?.values() ?? []) if (h.status === 'ACTIVE') for (const part of h.parts) if (isEscrowKey(part.accountKey)) out.push(F('INV-LED-022', `(c) hold ${h.holdId} on ${part.accountKey}`, 'no holds on escrow accounts'));
  for (const e of v.escrows.values()) {
    if (e.status === 'HELD' && e.caseId === null && v.tick >= e.expiresTick) out.push(F('INV-LED-022', `(d) ${e.escrowId} HELD at ${v.tick} ≥ expiry ${e.expiresTick} with no case`, 'released at expiry'));
    for (const [k, b] of v.post) { const q = parseAccountKey(k); if (q && q.entityId === e.attackerId && q.sub === e.escrowId && b.balance !== 0n) out.push(F('INV-LED-022', `(e) attacker ${k} = ${b.balance}`, 'attacker never holds escrowed money')); }
  }
  return out;
};
/** L25 (E-14): per accrual receivable + payable = 0n; settled ≤ accrued; the code is in SETTLEMENT_CODES[kind]. */
export const INV_LED_024 = (v: CheckView): Failure[] => {
  if (!v.accruals) return [];
  const out: Failure[] = [];
  for (const r of v.accruals.values()) {
    const rec = bal(v, accountKey(r.a, RECEIVABLE, r.ccy, r.accrualId)); const pay = bal(v, accountKey(r.b, r.payable, r.ccy, r.accrualId));
    if (rec + pay !== 0n) out.push(F('INV-LED-024', `${r.accrualId} receivable ${rec} + payable ${pay}`, '0n'));
    if (r.settled > r.accrued) out.push(F('INV-LED-024', `${r.accrualId} settled ${r.settled}`, `≤ accrued ${r.accrued}`));
    if (!(SETTLEMENT_CODES[r.kind as AccrualKind] ?? []).includes(r.code)) out.push(F('INV-LED-024', `${r.accrualId} ${r.kind} code ${r.code}`, 'in SETTLEMENT_CODES[kind]'));
  }
  return out;
};
export const SYS_INVARIANTS: readonly [string, (v: CheckView) => Failure[]][] = [
  ['INV-LED-016', INV_LED_016], ['INV-LED-019', INV_LED_019], ['INV-LED-020', INV_LED_020], ['INV-LED-021', INV_LED_021],
  ['INV-LED-022', INV_LED_022], ['INV-LED-023', INV_LED_023], ['INV-LED-024', INV_LED_024],
];

// ───────── Δ7 FlowDayArchive (option B, unbounded, hash chain) and INV-LED-017 (L18, DAY_CLOSE, FATAL) ─────────
export interface FlowDayArchive {
  id: string; ccy: Ccy; dayIndex: number; ticks: number;
  byClass: SortedMap<string, Money>; byCode: SortedMap<string, Money>; m0sysDelta: Money; cbCredit: Money;
  sys: SysSideFlows; prevHash: string; hash: string;
}
const body = (r: FlowDayArchive): unknown => ({ ...r, hash: undefined, sys: { ...r.sys, treasury: undefined } });
export const archiveHash = (r: FlowDayArchive): string => hashHex(canonEncode(body(r)));
/** Running archive row += one tick's flows. */
export function addTick(r: FlowDayArchive, f: TickFlows): FlowDayArchive {
  const mm = (x: SortedMap<string, Money>, y: SortedMap<string, Money>): SortedMap<string, Money> => { const o = x.clone(); for (const [k, a] of y) o.set(k, (o.get(k) ?? 0n) + a); return o; };
  return { ...r, ticks: r.ticks + 1, byClass: mm(r.byClass, f.byClass), byCode: mm(r.byCode, f.byCode), m0sysDelta: r.m0sysDelta + f.m0sysDelta,
    cbCredit: r.cbCredit + f.cbCredit, sys: addSys(r.sys, f.sysSide ?? emptySys()) };
}
export const emptyArchive = (ccy: Ccy, dayIndex: number): FlowDayArchive => ({ id: `${ccy}:${dayIndex}`, ccy, dayIndex, ticks: 0, byClass: new SortedMap(),
  byCode: new SortedMap(), m0sysDelta: 0n, cbCredit: 0n, sys: emptySys(), prevHash: '', hash: '' });
/** The day row equals the Σ of that day's TickFlows (ring), the identities close for the day, and the hash chain links to the previous row. */
export function INV_LED_017(row: FlowDayArchive, dayTicks: readonly TickFlows[], prev: FlowDayArchive | undefined): Failure[] {
  const out: Failure[] = [];
  const sum = dayTicks.reduce((r, f) => addTick(r, f), emptyArchive(row.ccy, row.dayIndex));
  const enc = (r: FlowDayArchive, rival: boolean): string => canonEncode(rival ? r.sys.byRivalTag
    : { ...r, id: '', prevHash: '', hash: '', sys: { ...r.sys, treasury: undefined, byRivalTag: undefined } });
  if (enc(sum, false) !== enc(row, false)) out.push(F('INV-LED-017', `archive ${row.id} ≠ Σ of its ${dayTicks.length} TickFlows`, 'equal'));
  if (enc(sum, true) !== enc(row, true)) out.push(F('INV-LED-023', `archive ${row.id} byRivalTag ≠ Σ of its ticks`, 'equal (E-13 d)'));
  if (row.prevHash !== (prev?.hash ?? '')) out.push(F('INV-LED-017', `archive ${row.id} prevHash ${row.prevHash}`, `${prev?.hash ?? '(genesis)'}`));
  if (row.hash !== archiveHash(row)) out.push(F('INV-LED-017', `archive ${row.id} hash ${row.hash}`, archiveHash(row)));
  out.push(...rivalTagChecks(row.sys, row.id));
  return out;
}
/** Full-chain check (offline; P13 checks one link per day). */
export function verifyArchiveChain(rows: readonly FlowDayArchive[]): string[] {
  const bad: string[] = [];
  for (const c of CCYS) {
    let prev = '';
    for (const r of rows.filter((x) => x.ccy === c).sort((a, b) => a.dayIndex - b.dayIndex)) {
      if (r.prevHash !== prev || r.hash !== archiveHash(r)) bad.push(r.id);
      prev = r.hash;
    }
  }
  return bad;
}
/** INV-LED-018 (L19): per ccy the hook cursor advances by exactly 1 per committed tick, and not at all on replay. */
export function INV_LED_018(before: Tick, after: Tick, tick: Tick, replay: boolean): Failure[] {
  const ok = replay ? after === before : after === tick && before === tick - 1;
  return ok ? [] : [F('INV-LED-018', `cursor ${before} -> ${after} at tick ${tick}${replay ? ' (replay)' : ''}`, replay ? 'unchanged' : `${tick - 1} -> ${tick}`)];
}
