// INV-LED-001..015 (spec §4). Each check is a pure function of a CheckView; observed strings start with the 03 §3.16 I-number.
import { BMA_CODES, classOfCode, isMoneyCode, kindOfId, parseAccountKey, RESTRICTED_PREFIX, SYS_ID } from './accounts';
import { CBK_CREDIT_CODES, CBK_UNWIND_CODES, CLASS_TEMPLATES, FLOW_CLASSES, RESTRICTED_OK_CODES, type FlowClass, type ReasonCatalog } from './catalog';
import { SortedMap } from './det';
import { CCYS, type Ccy, type Id, type Money, type Qty, type Tick } from './money';
import { legKey } from './templates';
import type { Entry, LedgerEntity, Posting } from './types';

export interface Bal { balance: Money; qty: Qty }
export type Accounts = SortedMap<string, Bal>;
export interface Failure { invariantId: string; observed: string; expected: string; severity: 'FATAL' | 'ALERT' }
export interface TickFlows {
  id: string; ccy: Ccy; tick: Tick;
  byClass: SortedMap<FlowClass, Money>; byCode: SortedMap<string, Money>;
  m0sysDelta: Money; cbCredit: Money;
  // Δ6 sysSide (INV-LED-016..022) is a follow-up; not part of this PR's scope.
}
export interface CheckView {
  tick: Tick; isDayClose: boolean; catalog: ReasonCatalog;
  entries: readonly Entry[];                 // valid entries applied this tick, in queue order
  pre: Accounts; post: Accounts;
  entity(id: Id): LedgerEntity | undefined;
  facts: { overdraftLimit(key: string): Money; intradayLimit(bankId: Id): Money };
  flows: SortedMap<string, TickFlows>;       // what the aggregator wrote this tick, id = ccy
  dayEntries?: readonly Entry[];             // day close only: this game day's committed entries (I18)
  flowsToday?: SortedMap<string, SortedMap<FlowClass, Money>>; // day close only
  dayHistory?: (ccy: Ccy, code: string) => Money[]; // day close only: previous days' totals, newest first (INV-LED-011)
  todayByCode?: (ccy: Ccy) => SortedMap<string, Money>;
  alarm: { mult: number; floorMicro: Money };
}
const F = (invariantId: string, observed: string, expected: string, severity: Failure['severity'] = 'FATAL'): Failure =>
  ({ invariantId, observed, expected, severity });
const bal = (m: Accounts, k: string): Money => m.get(k)?.balance ?? 0n;
const sides = (p: Posting): [string, Money][] => [[p.debitAccount, p.amount], [p.creditAccount, -p.amount]];
const QTY_ONLY_CODES = ['EQ_SPLIT', 'LED_DISSOLUTION'];

// ───────── money aggregates (T03-11; computed from balances) ─────────
export function computeM0(a: Accounts, ccy: Ccy): Money {
  let s = 0n;
  for (const [k, v] of a) { const p = parseAccountKey(k); if (p && p.ccy === ccy && kindOfId(p.entityId) === 'cbk' && p.code >= 2001 && p.code <= 2003) s -= v.balance; }
  return s;
}
export const computeM0sys = (a: Accounts, ccy: Ccy): Money => bal(a, `cbk_${ccy}:1910:${ccy}`);
export function computeM2(a: Accounts, ccy: Ccy): Money {
  let s = 0n;
  for (const [k, v] of a) {
    const p = parseAccountKey(k); if (!p || p.ccy !== ccy) continue;
    const kind = kindOfId(p.entityId);
    if (p.code === 1001 && kind !== 'bnk' && kind !== 'cbk' && kind !== 'gov') s += v.balance;
    if (p.code === 2100 && kind === 'bnk') s -= v.balance;
  }
  return s;
}
export function computePEM(a: Accounts, ccy: Ccy, perimeterOf: (id: Id) => string): Money {
  let s = 0n;
  for (const [k, v] of a) { const p = parseAccountKey(k); if (p && p.ccy === ccy && [1001, 1010, 1050, 1070].includes(p.code) && perimeterOf(p.entityId) === 'PLAYER') s += v.balance; }
  return s;
}
/** netIssuance = sys 3990 + 5900 + 4900, debit-positive, all subs (T03-11). */
export function netIssuance(a: Accounts, ccy: Ccy): Money {
  let s = 0n;
  for (const [k, v] of a) { const p = parseAccountKey(k); if (p && p.ccy === ccy && p.entityId === SYS_ID && [3990, 4900, 5900].includes(p.code)) s += v.balance; }
  return s;
}

/** Per-posting M0/M0_sys/M2 effect, from the accounts it touches (used by INV-LED-003/004 and the own-account line). */
export function postingEffect(p: Posting): { m0: Money; m0sys: Money; m2: Money } {
  let m0 = 0n; let m0sys = 0n; let m2 = 0n;
  for (const [k, d] of sides(p)) {
    const q = parseAccountKey(k); if (!q) continue;
    const kind = kindOfId(q.entityId);
    if (kind === 'cbk' && q.code >= 2001 && q.code <= 2003) m0 -= d;
    if (kind === 'cbk' && q.code === 1910) m0sys += d;
    if (q.code === 1001 && kind !== 'bnk' && kind !== 'cbk' && kind !== 'gov') m2 += d;
    if (q.code === 2100 && kind === 'bnk') m2 -= d;
  }
  return { m0, m0sys, m2 };
}

export function bridge2909(a: Accounts, ccy: Ccy): Money {
  let s = 0n;
  for (const [k, v] of a) { const p = parseAccountKey(k); if (p && p.ccy === ccy && p.entityId === SYS_ID && p.code === 2909) s += v.balance; }
  return s;
}

// ───────── Δ2 / PD-5 aggregator: O(postings this tick) ─────────
export function tickFlowsOf(entries: readonly Entry[], catalog: ReasonCatalog, tick: Tick, m0sysDelta: (ccy: Ccy) => Money): SortedMap<string, TickFlows> {
  const out = new SortedMap<string, TickFlows>();
  for (const ccy of CCYS) out.set(ccy, {
    id: `${ccy}:${tick}`, ccy, tick, byClass: new SortedMap(FLOW_CLASSES.map((c) => [c, 0n])), byCode: new SortedMap(), m0sysDelta: m0sysDelta(ccy), cbCredit: 0n,
  });
  for (const e of entries) for (const p of e.postings) {
    if (p.flowLeg !== true) continue;
    const t = out.get(p.ccy) as TickFlows; const cls = catalog.get(p.reason)?.cls;
    if (!cls) continue; // INV-LED-002 rejects the tick
    t.byCode.set(p.reason, (t.byCode.get(p.reason) ?? 0n) + p.amount);
    t.byClass.set(cls, (t.byClass.get(cls) as Money) + p.amount);
    if (CBK_CREDIT_CODES.includes(p.reason)) t.cbCredit += p.amount;
    if (CBK_UNWIND_CODES.includes(p.reason)) t.cbCredit -= p.amount;
  }
  return out;
}

// ───────── the invariants ─────────
type Check = (v: CheckView) => Failure[];

/** L1: per entry, per entity and ccy, non-MEMO postings net to 0 (I2); qty per asset is conserved over the tick (I8). */
export const INV_LED_001: Check = (v) => {
  const out: Failure[] = [];
  for (const e of v.entries) {
    const net = new SortedMap<string, Money>();
    for (const p of e.postings) for (const [k, d] of sides(p)) {
      const q = parseAccountKey(k); if (!q || classOfCode(q.code) === 'MEMO') continue;
      net.set(`${q.entityId}|${q.ccy}`, (net.get(`${q.entityId}|${q.ccy}`) ?? 0n) + d);
    }
    for (const [k, n] of net) if (n !== 0n) out.push(F('INV-LED-001', `I2: entry ${e.entryId} ${k} nets ${n}`, '0n per entity per ccy'));
  }
  const qty = (m: Accounts): SortedMap<string, Qty> => {
    const s = new SortedMap<string, Qty>();
    for (const [k, b] of m) if (b.qty !== 0n) { const q = parseAccountKey(k); if (q?.sub) s.set(`${q.sub}|${q.ccy}`, (s.get(`${q.sub}|${q.ccy}`) ?? 0n) + b.qty); }
    return s;
  };
  const a = qty(v.pre); const b = qty(v.post);
  for (const k of [...a.keys(), ...b.keys()]) if ((a.get(k) ?? 0n) !== (b.get(k) ?? 0n)) out.push(F('INV-LED-001', `I8: qty of ${k} ${a.get(k) ?? 0n} -> ${b.get(k) ?? 0n}`, 'qty conserved'));
  return dedupe(out);
};

/** L2: every posting has a registered reason with one class; the entry's template is allowed for its reason; no alias. */
export const INV_LED_002: Check = (v) => {
  const out: Failure[] = [];
  for (const e of v.entries) {
    if (!v.catalog.templateAllowed(e.reason, e.template)) out.push(F('INV-LED-002', `I1: ${e.entryId} template ${e.template} for ${e.reason}`, 'allowed template'));
    const primary = v.catalog.get(e.reason);
    for (const p of e.postings) {
      if (v.catalog.resolveAlias(p.reason)) { out.push(F('INV-LED-002', `I1: alias=${p.reason}`, 'canonical code')); continue; }
      const d = v.catalog.get(p.reason);
      if (!d) { out.push(F('INV-LED-002', `I1: unknown reason ${p.reason}`, 'registered code')); continue; }
      if (p.reason === e.reason) continue;
      // Supporting leg, T03-05 step 8 exactly (review A-5 / F3): its class must admit the entry's template, or it is a TAX_* TRANSFER
      // inside a TRANSFER/SINK entry.
      const ok = CLASS_TEMPLATES[d.cls].includes(e.template)
        || (d.cls === 'TRANSFER' && p.reason.startsWith('TAX_') && (primary?.cls === 'TRANSFER' || primary?.cls === 'SINK'));
      if (!ok) out.push(F('INV-LED-002', `I1: supporting leg code=${p.reason} template=${e.template}`, 'leg allowed by T03-05 step 8'));
    }
  }
  return out;
};

/** L3: ΔM0_sys = Σ FAUCET − Σ SINK exactly; only FAUCET/SINK legs move M0_sys (I4); I17; I18 at day close. */
export const INV_LED_003: Check = (v) => {
  const out: Failure[] = [];
  for (const ccy of CCYS) {
    let fs = 0n;
    for (const e of v.entries) for (const p of e.postings) {
      if (p.ccy !== ccy) continue;
      const cls = v.catalog.get(p.reason)?.cls;
      const eff = postingEffect(p).m0sys;
      if (eff !== 0n && cls !== 'FAUCET' && cls !== 'SINK') out.push(F('INV-LED-003', `I4: ${cls} posting ${e.entryId}#${p.postingSeq} moves M0_sys by ${eff}`, 'only FAUCET/SINK move M0_sys'));
      if (cls === 'FAUCET' || cls === 'SINK') fs += eff;
    }
    const d = computeM0sys(v.post, ccy) - computeM0sys(v.pre, ccy);
    if (d !== fs) out.push(F('INV-LED-003', `I4: ΔM0_sys(${ccy}) ${d}`, `Σ FAUCET − Σ SINK = ${fs}`));
    // I17. Ambiguity A-2: elastic issuance (03#3 layout) books sys:2909:<sector>, not 5900/4900, so the 2909 bridge is added to netIssuance.
    const ni = netIssuance(v.post, ccy) + bridge2909(v.post, ccy); const s2900 = bal(v.post, `${SYS_ID}:2900:${ccy}`);
    if (ni !== -s2900 || computeM0sys(v.post, ccy) !== -s2900) out.push(F('INV-LED-003', `I17: netIssuance+2909 ${ni}, cbk 1910 ${computeM0sys(v.post, ccy)}, sys 2900 ${s2900}`, 'netIssuance + Σ sys 2909 = cbk 1910 = −sys 2900'));
    // I17 mirror per elastic sector (review F2, erratum E-8): sys:2909:X + X:1009 = 0n.
    const mirror = new SortedMap<string, Money>();
    for (const [k, b] of v.post) {
      const q = parseAccountKey(k); if (!q || q.ccy !== ccy) continue;
      if (q.entityId === SYS_ID && q.code === 2909 && q.sub) mirror.set(q.sub, (mirror.get(q.sub) ?? 0n) + b.balance);
      else if (q.code === 1009 && q.sub === undefined) mirror.set(q.entityId, (mirror.get(q.entityId) ?? 0n) + b.balance);
    }
    for (const [x, m] of mirror) if (m !== 0n) out.push(F('INV-LED-003', `I17 2909 mirror ${x} (${ccy}) off by ${m}`, '0n'));
    if (v.isDayClose && v.dayEntries && v.flowsToday) {
      const ledger = new SortedMap<FlowClass, Money>(FLOW_CLASSES.map((c) => [c, 0n]));
      for (const e of v.dayEntries) for (const p of e.postings) if (p.flowLeg && p.ccy === ccy) {
        const c = v.catalog.get(p.reason)?.cls; if (c) ledger.set(c, (ledger.get(c) as Money) + p.amount);
      }
      const rep = v.flowsToday.get(ccy);
      for (const c of FLOW_CLASSES) if ((rep?.get(c) ?? 0n) !== ledger.get(c)) out.push(F('INV-LED-003', `I18: report ${ccy} ${c} ${rep?.get(c) ?? 0n}`, `postings ${ledger.get(c)}`));
    }
  }
  return out;
};

/**
 * L4, implemented as the card's I4 (T03-11 step 7; spec ambiguity A-1): (a) M0 moves only through FAUCET/SINK, central-bank
 * credit codes or cbk own-account postings, and ΔM0_cb = Σ cbCredit − Σ unwind + cbk own-account; (b) REVALUE never moves M2;
 * (c) the T03-11 step 7 per-entry M2 rules (m2EntryRules; erratum E-7).
 */
export const INV_LED_004: Check = (v) => {
  const out: Failure[] = [];
  for (const ccy of CCYS) {
    let cbExpected = 0n;
    for (const e of v.entries) {
      // cbk own-account entry: the cbk books a value leg itself (not only its issuer mirror 2001-2003 / 1910), e.g. CBK_PROFIT_REMITTANCE
      const cbkParty = e.postings.some((p) => [p.debitAccount, p.creditAccount].some((k) => {
        const q = parseAccountKey(k); return !!q && kindOfId(q.entityId) === 'cbk' && !(q.code >= 2001 && q.code <= 2003) && q.code !== 1910;
      }));
      for (const p of e.postings) {
        if (p.ccy !== ccy) continue;
        const cls = v.catalog.get(p.reason)?.cls; const eff = postingEffect(p);
        const m0cb = eff.m0 - eff.m0sys;
        if (CBK_CREDIT_CODES.includes(p.reason) || CBK_UNWIND_CODES.includes(p.reason) || (cbkParty && cls !== 'FAUCET' && cls !== 'SINK')) cbExpected += m0cb;
        else if (m0cb !== 0n && cls !== 'FAUCET' && cls !== 'SINK') out.push(F('INV-LED-004', `I4: ${p.reason} moves M0_cb by ${m0cb}`, '0n'));
        if (cls === 'REVALUE' && eff.m2 !== 0n) out.push(F('INV-LED-004', `I4: REVALUE ${p.reason} moves M2 by ${eff.m2}`, '0n'));
      }
      out.push(...m2EntryRules(v, e, ccy));
    }
    const dM0cb = computeM0(v.post, ccy) - computeM0sys(v.post, ccy) - (computeM0(v.pre, ccy) - computeM0sys(v.pre, ccy));
    if (dM0cb !== cbExpected) out.push(F('INV-LED-004', `I4: ΔM0_cb(${ccy}) ${dM0cb}`, `cb credit + cbk own-account ${cbExpected}`));
  }
  return out;
};

const isBankCreditCode = (c: string): boolean => c.startsWith('BNK_') || c.startsWith('REPO_BANK_') || c.startsWith('PB_');
const isCbkCreditCode = (c: string): boolean => CBK_CREDIT_CODES.includes(c) || CBK_UNWIND_CODES.includes(c);
/** Cash moved into non-bank 1001 by the entry's postings of one code (03#7: QE into a fund +amount; into bank reserves 0n). */
function nonBankCashDelta(ps: readonly Posting[]): Money {
  let s = 0n;
  for (const p of ps) for (const [k, d] of sides(p)) {
    const q = parseAccountKey(k); const kind = q && kindOfId(q.entityId);
    if (q && q.code === 1001 && kind !== 'bnk' && kind !== 'cbk' && kind !== 'gov') s += d;
  }
  return s;
}
const RAIL_CODES = [1001, 1002, 1003, 1009, 1010, 1910, 2001, 2002, 2003, 2100];
const MONEY_SIDE = ['bnk', 'cbk', 'gov'];
/**
 * Exemption from the non-bank TRANSFER M2 rule (QA PR #3 blockers): granted only when, inside this reason-code group, a value-leg
 * posting (touching no money or rail account) has a bank/cbk/gov entity on one side and a NON-bank entity on the other.
 * Same-entity postings never grant it.
 */
export function groupExempt(ps: readonly Posting[]): boolean {
  for (const p of ps) {
    const [d, c] = [p.debitAccount, p.creditAccount].map(parseAccountKey);
    if (!d || !c || RAIL_CODES.includes(d.code) || RAIL_CODES.includes(c.code) || d.entityId === c.entityId) continue;
    const dm = MONEY_SIDE.includes(kindOfId(d.entityId) ?? ''); const cm = MONEY_SIDE.includes(kindOfId(c.entityId) ?? '');
    if (dm !== cm) return true;
  }
  return false;
}
/** P2: an "M2 leg" = a posting that moves M2 against a non-money, non-rail account (a value account). A TAX_* group may carry none. */
export const m2ValueLegs = (ps: readonly Posting[]): Posting[] => ps.filter((p) => postingEffect(p).m2 !== 0n
  && [p.debitAccount, p.creditAccount].map(parseAccountKey).some((q) => !!q && !RAIL_CODES.includes(q.code)));
/**
 * T03-11 step 7 per-entry M2 rules (review F1). Applied per (entry, reason code) so a composed entry's supporting legs are judged by
 * their own class. The bank/cbk/gov exemption comes from each group's own cross-entity value legs (groupExempt), never from postings[0] (review X-4).
 */
function m2EntryRules(v: CheckView, e: Entry, ccy: Ccy): Failure[] {
  const out: Failure[] = [];
  const groups = new SortedMap<string, Posting[]>();
  for (const p of e.postings) if (p.ccy === ccy) groups.set(p.reason, [...(groups.get(p.reason) ?? []), p]);
  for (const [code, ps] of groups) {
    const cls = v.catalog.get(code)?.cls; if (!cls) continue;
    // Bank/cbk/gov exemption per reason-code group (QA blockers on PR #3): see groupExempt.
    const moneyIssuerOrBank = groupExempt(ps);
    if (code.startsWith('TAX_') && m2ValueLegs(ps).length > 0) out.push(F('INV-LED-004', `I4: ${e.entryId} TAX group ${code} carries an M2 leg`, 'no M2 legs in a TAX_* group'));
    const m2 = ps.reduce((s, p) => s + postingEffect(p).m2, 0n);
    if (cls === 'REVALUE' && m2 !== 0n) out.push(F('INV-LED-004', `I4: ${e.entryId} REVALUE ${code} moves M2 by ${m2}`, '0n'));
    if (cls === 'TRANSFER' && !moneyIssuerOrBank && m2 !== 0n) out.push(F('INV-LED-004', `I4: ${e.entryId} non-bank TRANSFER ${code} moves M2 by ${m2}`, '0n'));
    if ((cls === 'FAUCET' && m2 < 0n) || (cls === 'SINK' && m2 > 0n)) out.push(F('INV-LED-004', `I4: ${e.entryId} ${cls} ${code} M2 sign ${m2}`, cls === 'FAUCET' ? '≥ 0n' : '≤ 0n'));
    const borrower = e.meta?.borrowerId;
    if (isBankCreditCode(code) && (cls === 'CREDIT_CREATE' || cls === 'CREDIT_DESTROY') && borrower !== undefined && kindOfId(borrower) !== 'bnk' && e.headline) {
      const want = cls === 'CREDIT_CREATE' ? e.headline.amount : -e.headline.amount;
      if (m2 !== want) out.push(F('INV-LED-004', `I4: ${e.entryId} bank credit ${code} M2 ${m2}`, `${want}`));
    }
    if (isCbkCreditCode(code) && m2 !== nonBankCashDelta(ps)) out.push(F('INV-LED-004', `I4: ${e.entryId} CB credit ${code} M2 ${m2}`, `non-bank cash moved ${nonBankCashDelta(ps)}`));
  }
  return out;
}

/** L5 (local half of I13): TRANSFER legs touch sys only through 9900 and never touch the issuance pair. */
export const INV_LED_005: Check = (v) => {
  const out: Failure[] = [];
  for (const e of v.entries) for (const p of e.postings) {
    // Virtual elastic money (X:1009, sys:2909) only via ELASTIC_IN/OUT (review F2).
    if (e.template !== 'ELASTIC_IN' && e.template !== 'ELASTIC_OUT') for (const k of [p.debitAccount, p.creditAccount]) {
      const q = parseAccountKey(k);
      if (q && (q.code === 1009 || (q.entityId === SYS_ID && q.code === 2909))) out.push(F('INV-LED-005', `${p.reason} touches ${k}`, '1009/2909 only in ELASTIC_IN/OUT'));
    }
    if (v.catalog.get(p.reason)?.cls !== 'TRANSFER') continue;
    for (const k of [p.debitAccount, p.creditAccount]) {
      const q = parseAccountKey(k);
      if (q && ((q.entityId === SYS_ID && q.code !== 9900) || (kindOfId(q.entityId) === 'cbk' && q.code === 1910)))
        out.push(F('INV-LED-005', `I13: TRANSFER ${p.reason} touches ${k}`, 'sys only via 9900, never cbk 1910'));
    }
  }
  return out;
};

/** L6: REVALUE never touches cash or deposits; the one exception is LED_RECLASS between a RESTRICTED sub and 1001 of one entity. */
export const INV_LED_006: Check = (v) => {
  const out: Failure[] = [];
  for (const e of v.entries) for (const p of e.postings) {
    if (v.catalog.get(p.reason)?.cls !== 'REVALUE') continue;
    const d = parseAccountKey(p.debitAccount); const c = parseAccountKey(p.creditAccount);
    const restrictedRelease = p.reason === 'LED_RECLASS' && d && c && d.entityId === c.entityId && d.code === 1001 && c.code === 1001;
    if (restrictedRelease) continue;
    for (const q of [d, c]) if (q && (isMoneyCode(q.code, kindOfId(q.entityId)) || (kindOfId(q.entityId) === 'cbk' && q.code >= 2001 && q.code <= 2003)))
      out.push(F('INV-LED-006', `REVALUE ${p.reason} touches money account ${q.entityId}:${q.code}`, 'no cash or deposit'));
  }
  return out;
};

/** L7 (I1): amount > 0n integer micro (0n only with qty on QTY_ONLY codes); accounts parse; ccy matches; seq contiguous. */
export const INV_LED_007: Check = (v) => {
  const out: Failure[] = [];
  for (const e of v.entries) e.postings.forEach((p, i) => {
    const okAmt = typeof p.amount === 'bigint' && (p.amount > 0n || (p.amount === 0n && p.qty !== undefined && QTY_ONLY_CODES.includes(p.reason)));
    if (!okAmt) out.push(F('INV-LED-007', `I1: ${e.entryId}#${i} amount ${String(p.amount)}`, '> 0n'));
    for (const k of [p.debitAccount, p.creditAccount]) {
      const q = parseAccountKey(k);
      if (!q || classOfCode(q.code) === undefined) out.push(F('INV-LED-007', `I1: bad account ${k}`, '<entityId>:<code>[:<sub>]:<ccy>'));
      else if (q.ccy !== p.ccy) out.push(F('INV-LED-007', `I1: ${k} ccy ≠ ${p.ccy}`, 'ccy match'));
    }
    if (p.debitAccount === p.creditAccount) out.push(F('INV-LED-007', `I1: ${e.entryId}#${i} debit = credit`, 'two accounts'));
    if (p.postingSeq !== i || p.entryId !== e.entryId || p.tick !== e.tick) out.push(F('INV-LED-007', `I1: ${e.entryId}#${i} header`, 'seq/entryId/tick match'));
  });
  return out;
};

/** L8 (I9, I10): no negative cash or deposit beyond its recorded facility; bank reserves to the intraday limit, ≥ 0n at day close. */
export const INV_LED_008: Check = (v) => {
  const out: Failure[] = [];
  for (const [k, b] of v.post) {
    if (b.balance >= 0n) continue;
    const q = parseAccountKey(k); if (!q) continue;
    const kind = kindOfId(q.entityId);
    if (kind === 'cbk' || kind === 'sys' || !(q.code === 1001 || q.code === 1002 || q.code === 1003 || q.code === 1010)) continue;
    // TODO(T03-15): the day-close conversion of negative reserves into CBK_STANDING_FACILITY is not built; literal reading: ≥ 0n at close.
    const limit = q.code === 1002 && kind === 'bnk' && !v.isDayClose ? v.facts.intradayLimit(q.entityId) : v.facts.overdraftLimit(k);
    if (-b.balance > limit) out.push(F('INV-LED-008', `I10: ${k} = ${b.balance}`, `≥ −${limit}`));
  }
  return out;
};

/** L12 (I0, I16): every Money value in the staged state and the postings is an integer bigint. TODO(unit-02): store provenance tags. */
export const INV_LED_012: Check = (v) => {
  const out: Failure[] = [];
  for (const e of v.entries) for (const p of e.postings) if (typeof p.amount !== 'bigint' || (p.qty !== undefined && typeof p.qty !== 'bigint'))
    out.push(F('INV-LED-012', `I16: ${e.entryId}#${p.postingSeq} non-bigint`, 'bigint from toMoney'));
  for (const [k, b] of v.post) if (typeof b.balance !== 'bigint' || typeof b.qty !== 'bigint') out.push(F('INV-LED-012', `I0: ${k} non-bigint`, 'bigint'));
  return out;
};

/** L14 (I21): restricted lots are spent only by restrictedOk codes (or released by LED_RECLASS at/after release), FIFO. */
export const INV_LED_014: Check = (v) => {
  const out: Failure[] = [];
  for (const e of v.entries) {
    const spent = new SortedMap<string, Money>();
    for (const p of e.postings) {
      const q = parseAccountKey(p.creditAccount);
      if (!q || q.code !== 1001 || !q.sub?.startsWith(RESTRICTED_PREFIX)) continue;
      const release = Number(q.sub.split(':')[1]);
      const ok = RESTRICTED_OK_CODES.includes(p.reason) || (p.reason === 'LED_RECLASS' && v.tick >= release);
      if (!ok) out.push(F('INV-LED-014', `I21: ${p.reason} spends ${p.creditAccount} at tick ${v.tick}`, 'restrictedOk code or release'));
      spent.set(p.creditAccount, (spent.get(p.creditAccount) ?? 0n) + p.amount);
    }
    for (const [key] of spent) {
      const q = parseAccountKey(key) as NonNullable<ReturnType<typeof parseAccountKey>>;
      const rel = Number((q.sub as string).split(':')[1]);
      for (const [k2, b] of v.pre) {
        const q2 = parseAccountKey(k2);
        if (!q2 || q2.entityId !== q.entityId || q2.ccy !== q.ccy || q2.code !== 1001 || !q2.sub?.startsWith(RESTRICTED_PREFIX)) continue;
        const rel2 = Number(q2.sub.split(':')[1]);
        if ((rel2 < rel || (rel2 === rel && k2 < key)) && b.balance - (spent.get(k2) ?? 0n) > 0n)
          out.push(F('INV-LED-014', `I21: ${key} spent before earlier lot ${k2}`, 'FIFO by releaseTick'));
      }
    }
  }
  return out;
};

/** L15 (Δ3, PD-3): one flowLeg per leg; byCode/byClass = fold of flowLeg postings; m0sysDelta exact; TRANSFER adds 0n to FAUCET/SINK. */
export const INV_LED_015: Check = (v) => {
  const out: Failure[] = [];
  for (const e of v.entries) {
    const n = new SortedMap<string, number>();
    for (const p of e.postings) n.set(legKey(p), (n.get(legKey(p)) ?? 0) + (p.flowLeg === true ? 1 : 0));
    for (const [leg, c] of n) if (c !== 1) out.push(F('INV-LED-015', `(a) ${e.entryId} leg ${leg} has ${c} flowLeg postings`, 'exactly 1'));
    for (const p of e.postings) {
      const cls = v.catalog.get(p.reason)?.cls;
      if (p.flowLeg && (cls === 'FAUCET' || cls === 'SINK') && postingEffect(p).m0sys !== (cls === 'FAUCET' ? p.amount : -p.amount))
        out.push(F('INV-LED-015', `(c) ${e.entryId} ${cls} flowLeg is not the issuance posting`, 'cbk 1910 / sys 2900'));
    }
  }
  for (const ccy of CCYS) {
    const t = v.flows.get(ccy);
    if (!t) { out.push(F('INV-LED-015', `no TickFlows for ${ccy}`, 'one row per ccy per tick')); continue; }
    const byCode = new SortedMap<string, Money>(); const byClass = new SortedMap<FlowClass, Money>(FLOW_CLASSES.map((c) => [c, 0n]));
    for (const e of v.entries) for (const p of e.postings) if (p.flowLeg && p.ccy === ccy) byCode.set(p.reason, (byCode.get(p.reason) ?? 0n) + p.amount);
    for (const [code, a] of byCode) { const c = v.catalog.get(code)?.cls; if (c) byClass.set(c, (byClass.get(c) as Money) + a); }
    const same = (x: SortedMap<string, Money>, y: SortedMap<string, Money>): boolean => x.size === y.size && x.keys().every((k) => x.get(k) === y.get(k));
    if (!same(byCode, t.byCode)) out.push(F('INV-LED-015', `(b) byCode(${ccy}) differs from the flowLeg fold`, 'equal'));
    if (!same(byClass, t.byClass) || t.byClass.size !== 6) out.push(F('INV-LED-015', `(b) byClass(${ccy}) differs`, 'Σ by class, six classes'));
    const fs = (t.byClass.get('FAUCET') ?? 0n) - (t.byClass.get('SINK') ?? 0n);
    const d = computeM0sys(v.post, ccy) - computeM0sys(v.pre, ccy);
    if (t.m0sysDelta !== fs || fs !== d) out.push(F('INV-LED-015', `(c) m0sysDelta ${t.m0sysDelta}, FAUCET−SINK ${fs}, ΔM0_sys ${d}`, 'all equal'));
  }
  return out;
};

/** L10 (DAY_CLOSE): trial balance per ccy = 0 (I3); suspense 1999/2999 = 0 (I15); cbk mirror (I5); deposit mirror (I6). TODO(T03-23): I22. */
export const INV_LED_010: Check = (v) => {
  if (!v.isDayClose) return [];
  const out: Failure[] = [];
  for (const ccy of CCYS) {
    let tb = 0n; let cbk = 0n; let holders = 0n;
    const dep = new SortedMap<string, Money>();
    for (const [k, b] of v.post) {
      const q = parseAccountKey(k); if (!q || q.ccy !== ccy) continue;
      const kind = kindOfId(q.entityId);
      if (classOfCode(q.code) !== 'MEMO') tb += b.balance;
      if (q.entityId === SYS_ID && (q.code === 1999 || q.code === 2999) && b.balance !== 0n) out.push(F('INV-LED-010', `I15: ${k} = ${b.balance}`, '0n'));
      if (kind === 'cbk' && q.code >= 2001 && q.code <= 2003) cbk += b.balance;
      if (kind !== 'cbk' && (BMA_CODES as readonly number[]).includes(q.code)) holders += b.balance;
      if (kind === 'bnk' && q.code === 2100) dep.set(q.entityId, (dep.get(q.entityId) ?? 0n) + b.balance);
      if (q.code === 1010 && q.sub) dep.set(q.sub, (dep.get(q.sub) ?? 0n) + b.balance);
    }
    if (tb !== 0n) out.push(F('INV-LED-010', `I3: trial balance ${ccy} = ${tb}`, '0n'));
    if (cbk + holders !== 0n) out.push(F('INV-LED-010', `I5: cbk ${cbk} vs holders ${holders} (${ccy})`, 'mirror'));
    for (const [bank, n] of dep) if (n !== 0n) out.push(F('INV-LED-010', `I6: ${bank} deposits off by ${n} (${ccy})`, 'mirror'));
  }
  return out;
};

/** L11 (DAY_CLOSE, ALERT): each FAUCET/SINK code's day total ≤ mult × max(trailing 28-day mean, floor). */
export const INV_LED_011: Check = (v) => {
  if (!v.isDayClose || !v.todayByCode || !v.dayHistory) return [];
  const out: Failure[] = [];
  for (const ccy of CCYS) for (const [code, total] of v.todayByCode(ccy)) {
    const cls = v.catalog.get(code)?.cls; if (cls !== 'FAUCET' && cls !== 'SINK') continue;
    const hist = v.dayHistory(ccy, code).slice(0, 28);
    const mean = hist.length ? hist.reduce((s, x) => s + x, 0n) / BigInt(hist.length) : 0n;
    const ceiling = BigInt(v.alarm.mult) * (mean > v.alarm.floorMicro ? mean : v.alarm.floorMicro);
    if (total > ceiling) out.push(F('INV-LED-011', `${code} ${ccy} day total ${total}`, `≤ ${ceiling}`, 'ALERT'));
  }
  // TODO(systems): the ACCT_REWARDED_AD sub-rule (T03-11 step 7, "≤ 0.0001 × the day…") is truncated in the card.
  return out;
};

export const TICK_INVARIANTS: readonly [string, Check][] = [
  ['INV-LED-001', INV_LED_001], ['INV-LED-002', INV_LED_002], ['INV-LED-003', INV_LED_003], ['INV-LED-004', INV_LED_004],
  ['INV-LED-005', INV_LED_005], ['INV-LED-006', INV_LED_006], ['INV-LED-007', INV_LED_007], ['INV-LED-008', INV_LED_008],
  ['INV-LED-012', INV_LED_012], ['INV-LED-014', INV_LED_014], ['INV-LED-015', INV_LED_015],
  ['INV-LED-010', INV_LED_010], ['INV-LED-011', INV_LED_011],
];

function dedupe(f: Failure[]): Failure[] {
  const seen: Record<string, true> = {};
  return f.filter((x) => (seen[x.observed] ? false : (seen[x.observed] = true)));
}
export { bal as balanceOf };
