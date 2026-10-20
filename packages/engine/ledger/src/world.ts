// Ledger runtime for one world (T03-08/T03-09/T03-11/T03-12 subset): queue, holds, P13 commit, aggregates, FlowReader.
// All state lives on the instance (Δ11 spirit); nothing is process-global.
import { accountKey, cbkId, defaultMoneyCode, kindOfId, parseAccountKey, RESTRICTED_PREFIX, SYS_ID } from './accounts';
import { FLOW_CLASSES, RESTRICTED_OK_CODES, type FlowClass, ReasonCatalog } from './catalog';
import { canonEncode, SortedMap } from './det';
import {
  computeM0, computeM0sys, computeM2, computePEM, INV_LED_012, postingEffect, TICK_INVARIANTS, tickFlowsOf,
  type Accounts, type Bal, type CheckView, type Failure, type TickFlows,
} from './invariants';
import { CCYS, mulRate, toMoney, type Ccy, type Id, type Money, type Qty, type Tick } from './money';
import { DEFAULT_PARAMS, IntentEnvelope, rootOwnerOf, type Params } from './stubs';
import * as T from './templates';
import { classify, controlChanges, foldHoldings, sideOf, sumMap, type HolderClass, type SideTag } from './sysside';
import { addTick, archiveHash, emptyArchive, INV_LED_017, INV_LED_018, SYS_INVARIANTS, type FlowDayArchive } from './sysinv';
import { RECEIVABLE, SETTLEMENT_CODES, SETTLEMENT_PAYABLE, type AccrualKind } from './legpolicy';
import { cmpStr } from './det';
import type { AccrualRow, ConflictEscrow, Entry, EntityKind, Hold, LedgerEntity, PayAccountChoice, Perimeter, PhaseId, Reject } from './types';

export const TICKS_PER_DAY = 720;
export interface RegisterEntitySpec { id: Id; reportingCcy?: Ccy; ownerId?: Id | null; payFrom?: PayAccountChoice; receiveInto?: PayAccountChoice }
export interface FlowDay {
  id: string; ccy: Ccy; dayIndex: number; byClass: Record<FlowClass, string>; byCode: Record<string, string>;
  M0: string; M0_sys: string; M0_cb: string; M2: string; PEM: string; ownAccount: string;
}
export interface CommitResult { committed: boolean; replay: boolean; safeMode: boolean; applied: number; invalid: number; failedInvariants: string[]; failures: Failure[] }
export interface LedgerApi {
  pay(from: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  swapAsset(buyer: Id, seller: Id, assetId: Id, qty: Qty, amt: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  mint(to: Id, amt: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  burn(from: Id, amt: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  elasticIn(sector: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  elasticOut(from: Id, sector: Id, amt: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  lend(bank: Id, borrower: Id, amt: Money, ccy: Ccy, code: string, loanId: Id, o?: T.PostOptsExt): Id;
  repay(borrower: Id, bank: Id, principal: Money, ccy: Ccy, code: string, loanId: Id, o?: T.PostOptsExt): Id;
  cbCredit(cb: Id, bank: Id, amt: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  cbCreditUnwind(bank: Id, cb: Id, amt: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  accrue(e: Id, amt: Money, ccy: Ccy, code: string, drAcct: number, crAcct: number, o?: T.PostOptsExt): Id;
  accruePair(a: Id, b: Id, amt: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  fx(a: Id, b: Id, ccy1: Ccy, amt1: Money, ccy2: Ccy, amt2: Money, code: string, o?: T.PostOptsExt): Id;
  moveQty(from: Id, to: Id, assetId: Id, qty: Qty, bookValue: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  reclass(e: Id, amt: Money, ccy: Ccy, code: string, fromAcct: number, toAcct: number, o?: T.PostOptsExt): Id;
  /** composeEntries (T03-07 :66): build parts with `build`, queue one composed entry. */
  compose(primary: (b: Builders) => Entry, supporting: ((b: Builders) => Entry)[]): Id;
  payProRata(payer: Id, holders: SortedMap<Id, bigint>, total: Money, ccy: Ccy, code: string, o?: T.PostOptsExt): Id;
  balance(accountKey: string): Money; cash(entityId: Id, ccy: Ccy): Money; available(entityId: Id, ccy: Ccy): Money;
  availableFor(entityId: Id, ccy: Ccy, purposeCode: string): Money;
  position(entityId: Id, assetId: Id): Qty; availableQty(entityId: Id, assetId: Id): Qty; netWorth(entityId: Id): Money;
  entryOf(entryId: Id): Entry | undefined;
  /** §6.11 Δ14: owner 12 only (E-12 layer 2); opId = the SEALED op the escrow belongs to (layer 4). */
  escrowPlace(victim: Id, attacker: Id, amt: Money, ccy: Ccy, code: string, escrowId: Id, opId?: Id): Id;
  /** Verdict / expiry: toAttacker (release) + toVictim (clawback) = the escrowed amount. Module 13, or 03's scheduler. */
  escrowSettle(escrowId: Id, toAttacker: Money, toVictim: Money): Id | Reject;
  /** E-14: an accrual of `kind` settled under `code` (owner module = caller). a = receivable holder (payee), b = payer. */
  registerAccrual(kind: string, code: string, a: Id, b: Id, ccy: Ccy): Id | Reject;
  accrueOn(accrualId: Id, amt: Money): Id | Reject;
  /** Settles min(amt, outstanding) under `code` (must be in SETTLEMENT_CODES[kind] and owned by the accrual's module). */
  settleAccrual(accrualId: Id, amt: Money, code: string): Id | Reject;
  /** OD-2 Fresh Start (module 14): grant = max(0, toMoney(5000 × MSI) − liquid) into the restricted sub; cooldown per link group. */
  freshStart(chr: Id, ccy: Ccy, msi: number): Id | Reject | null;
  /** OD-2: 30% of `income` (up to the outstanding grant) via LAW_GARNISHMENT to gov_<ccy> (module 13). */
  garnishIncome(chr: Id, income: Money, ccy: Ccy): Id | null;
}
export interface HoldApi {
  placeCash(owner: Id, ccy: Ccy, amt: Money, expiresTick: Tick, ref: Id): Id | Reject;
  placeCashFor(owner: Id, ccy: Ccy, amt: Money, expiresTick: Tick, ref: Id, purposeCode: string): Id | Reject;
  placeQty(owner: Id, assetId: Id, qty: Qty, expiresTick: Tick, ref: Id): Id | Reject;
  release(holdId: Id): void; reduce(holdId: Id, byAmount: bigint): void; get(holdId: Id): Hold | undefined;
}
/** Template builders bound to an env; used by compose(). */
export interface Builders { env: T.TemplateEnv; t: typeof T }
export interface ScheduledProcess { name: string; module: string; run(tick: Tick): { subject: Id; post(api: LedgerApi): void }[] }
export interface FlowReader {
  tickFlows(ccy: Ccy, tick: Tick): TickFlows | undefined;
  codeTotal(ccy: Ccy, tick: Tick, code: string): Money;
  dayFlows(ccy: Ccy, dayIndex: number): FlowDay | undefined;
  /** Δ12 net flow N for a tick (whole non-system side, or one holder class). */
  netFlow(ccy: Ccy, tick: Tick, holder?: HolderClass): Money;
  /** N for an archived game day (FlowDayArchive, unbounded). */
  netFlowDay(ccy: Ccy, dayIndex: number, holder?: HolderClass): Money;
  archiveDay(ccy: Ccy, dayIndex: number): FlowDayArchive | undefined;
}
export type TickFlowsHook = (flows: Readonly<TickFlows>, at: { tick: Tick; ccy: Ccy }) => void;
export const FRESH_START_COOLDOWN_TICKS = 967_680; // OD-2: 56 real days per link group
export const GARNISH_RATE_E6 = 300_000n;          // OD-2: 30%

interface State {
  tick: Tick; lastCommitted: Tick; safeMode: boolean; idCounter: number;
  entities: SortedMap<Id, LedgerEntity>; accounts: Accounts; holds: SortedMap<Id, Hold>;
  facts: SortedMap<string, Money>;                // `OVERDRAFT_LIMIT:<key>` | `INTRADAY_CREDIT_LIMIT:<bankId>`
  log: Entry[];                                   // committed entry log (valid and invalid), the postings archive
  day: Entry[];                                   // this game day's committed valid entries (I18)
  tickFlows: SortedMap<string, TickFlows>;        // ring, id `${ccy}:${tick}`
  today: SortedMap<string, { byClass: SortedMap<FlowClass, Money>; byCode: SortedMap<string, Money>; ownAccount: Money }>;
  flowDays: SortedMap<string, FlowDay>;
  done: SortedMap<string, true>;                  // scheduled-process keys (process, subject, tick) already posted (Δ4)
  alerts: Failure[];
  sides: SortedMap<Id, SideTag>;                  // S_t / classes / rival tags in force for the open tick (Δ10)
  holdings: SortedMap<string, Money>;             // committed m(e) per `${id}|${ccy}` (escrow subs attributed to the depositor)
  roles: SortedMap<string, true>;                 // `${id}|${role}` (TODO(unit-16): actor-role registry)
  dynasty: SortedMap<Id, true>;                   // Dynasty.holdingCmpIds (TODO(unit-16))
  linkGroups: SortedMap<Id, string>;              // 15 §3.12 link groups (TODO(unit-15))
  escrows: SortedMap<Id, ConflictEscrow>;         // led.escrow
  accruals: SortedMap<Id, AccrualRow>;            // E-14 accrual registry
  freshStart: SortedMap<string, Tick>;            // link group -> tick of the last grant
  garnish: SortedMap<Id, Money>;                  // outstanding Fresh Start grant per chr
  archive: SortedMap<string, FlowDayArchive>;     // Δ7 option B, unbounded, id `${ccy}:${dayIndex}`
  dayAcc: SortedMap<string, FlowDayArchive>;      // this game day's running archive row per ccy
  hookCursor: SortedMap<string, Tick>;            // led.hookcursor: last notified tick per ccy
  flips: string[];                                // `${tick}|${id}` side flips (E14 churn alarm)
  m0PlayerOpen: SortedMap<string, Money>;         // M0_player at the open of the game day (gross-control alarm)
}

export class LedgerWorld {
  readonly catalog: ReasonCatalog;
  readonly params: Params;
  readonly intents = new IntentEnvelope();
  private s: State;
  private queue: Entry[] = [];
  private processes: ScheduledProcess[] = [];
  private committedVersion = 0;
  /** Test instrumentation for spec test 2 (Δ2 cost): counts reads of the postings archive. */
  archiveReads = 0;

  constructor(opts: { catalog?: ReasonCatalog; params?: Partial<Params>; tick?: Tick } = {}) {
    this.catalog = opts.catalog ?? new ReasonCatalog();
    this.params = { ...DEFAULT_PARAMS, ...opts.params };
    const t = opts.tick ?? 0;
    this.s = {
      tick: t, lastCommitted: t - 1, safeMode: false, idCounter: 0, entities: new SortedMap(), accounts: new SortedMap(), holds: new SortedMap(),
      facts: new SortedMap(), log: [], day: [], tickFlows: new SortedMap(), today: new SortedMap(), flowDays: new SortedMap(), done: new SortedMap(), alerts: [],
      sides: new SortedMap(), holdings: new SortedMap(), roles: new SortedMap(), dynasty: new SortedMap(), linkGroups: new SortedMap(), escrows: new SortedMap(),
      accruals: new SortedMap(), freshStart: new SortedMap(), garnish: new SortedMap(), archive: new SortedMap(), dayAcc: new SortedMap(),
      hookCursor: new SortedMap(CCYS.map((c) => [c, t - 1])), flips: [], m0PlayerOpen: new SortedMap(),
    };
    this.resetToday();
    this.registerEntity({ id: SYS_ID });
    for (const c of CCYS) this.registerEntity({ id: cbkId(c), reportingCcy: c });
    this.registerEntity({ id: T.ESCROW_COURT });
    this.committedVersion = this.s.accounts.version;
  }

  get tick(): Tick { return this.s.tick; }
  get safeMode(): boolean { return this.s.safeMode; }
  get alerts(): readonly Failure[] { return this.s.alerts; }

  // ───────── entities & facts ─────────
  /** Idempotent (T03-08 :99). */
  registerEntity(spec: RegisterEntitySpec): Id {
    if (this.s.entities.has(spec.id)) return spec.id;
    const kind = kindOfId(spec.id);
    if (!kind) throw new Error(`registerEntity: unknown kind for ${spec.id}`);
    this.s.entities.set(spec.id, {
      id: spec.id, kind, ownerId: spec.ownerId ?? null, reportingCcy: spec.reportingCcy ?? 'FDL',
      payFrom: spec.payFrom ?? { kind: 'CASH' }, receiveInto: spec.receiveInto ?? { kind: 'CASH' },
    });
    const side = sideOf(this.sideInputs(), spec.id); if (side) this.s.sides.set(spec.id, side); // in force from now; later changes at P13 (Δ10)
    return spec.id;
  }
  private sideInputs() {
    return { entity: this.entity, hasRole: (id: Id, r: string) => this.s.roles.has(`${id}|${r}`), isDynastyHolding: (id: Id) => this.s.dynasty.has(id) };
  }
  /** Registry inputs (T03-16 control graph, 16 roles and dynasties, 15 link groups). They take effect for flows at P13 of this tick → t+1 (Δ10). */
  setController(id: Id, ownerId: Id | null): void { const e = this.s.entities.get(id); if (!e) throw new Error(`setController: ${id}`); this.s.entities.set(id, { ...e, ownerId }); }
  setRole(id: Id, role: string, on = true): void { if (on) this.s.roles.set(`${id}|${role}`, true); else this.s.roles.delete(`${id}|${role}`); }
  setDynastyHolding(id: Id, on = true): void { if (on) this.s.dynasty.set(id, true); else this.s.dynasty.delete(id); }
  setLinkGroup(id: Id, group: string): void { this.s.linkGroups.set(id, group); }
  sideTag(id: Id): SideTag | undefined { return this.s.sides.get(id); }
  escrow(id: Id): ConflictEscrow | undefined { const e = this.s.escrows.get(id); return e ? { ...e } : undefined; }
  accrual(id: Id): AccrualRow | undefined { const a = this.s.accruals.get(id); return a ? { ...a } : undefined; }
  garnishOutstanding(chr: Id): Money { return this.s.garnish.get(chr) ?? 0n; }
  /** PD-15: a case filed before expiry against the attacker or any account in the attacker's link group holds the op's escrows. */
  fileCase(caseId: Id, opId: Id, defendant: Id): number {
    const g = (x: Id): string => this.s.linkGroups.get(x) ?? x; let n = 0;
    for (const e of this.s.escrows.values()) if (e.status === 'HELD' && e.opId === opId && this.s.tick < e.expiresTick && g(e.attackerId) === g(defendant)) { e.caseId = caseId; n++; }
    return n;
  }
  private hooks: { module: string; fn: TickFlowsHook }[] = [];
  private started = false;
  private inHook = false;
  /** Δ8: once per committed tick per ccy (ccys sorted, modules sorted), frozen read-only flows, never on replay. Frozen at world start. */
  registerTickFlowsHook(module: string, fn: TickFlowsHook): void {
    if (this.started) throw new Error('registerTickFlowsHook: the hook registry is frozen once the world has started');
    this.hooks.push({ module, fn }); this.hooks.sort((a, b) => cmpStr(a.module, b.module));
  }
  entity = (id: Id): LedgerEntity | undefined => this.s.entities.get(id);
  /** Unit 16 dissolution end state (E-15.2): later postings to the entity fail INV-LED-026 except LED_DISSOLUTION. */
  markDissolved(id: Id): void { const e = this.s.entities.get(id); if (!e) throw new Error(`markDissolved: ${id}`); this.s.entities.set(id, { ...e, status: 'DISSOLVED' }); }
  setRail(id: Id, rail: { payFrom?: PayAccountChoice; receiveInto?: PayAccountChoice }): void {
    const e = this.s.entities.get(id); if (!e) throw new Error(`setRail: ${id}`);
    this.s.entities.set(id, { ...e, ...rail });
  }
  setOverdraftLimit(key: string, limit: Money): void { this.s.facts.set(`OVERDRAFT_LIMIT:${key}`, limit); }
  setIntradayLimit(bankId: Id, limit: Money): void { this.s.facts.set(`INTRADAY_CREDIT_LIMIT:${bankId}`, limit); }
  /** 03 §3.5.1: sys -> SYSTEM; hh/frm/row -> ELASTIC; root chr/ali -> PLAYER; else NPC. TODO(T03-16): ownership graph. */
  perimeterOf = (id: Id): Perimeter => {
    const k = kindOfId(id);
    if (k === 'sys') return 'SYSTEM';
    if (k === 'hh' || k === 'frm' || k === 'row') return 'ELASTIC';
    const root = kindOfId(rootOwnerOf(this.entity, id));
    return root === 'chr' || root === 'ali' ? 'PLAYER' : 'NPC';
  };
  registerProcess(p: ScheduledProcess): void { this.processes.push(p); }

  // ───────── reads (committed state only) ─────────
  balance(key: string): Money { return this.s.accounts.get(key)?.balance ?? 0n; }
  qtyOf(key: string): Qty { return this.s.accounts.get(key)?.qty ?? 0n; }
  accounts(): [string, Bal][] { return this.s.accounts.entries().map(([k, v]) => [k, { ...v }]); }
  private payKey(e: LedgerEntity, ccy: Ccy): string {
    if (e.payFrom.kind === 'BANK') return accountKey(e.id, 1010, ccy, e.payFrom.bankId);
    const c = defaultMoneyCode(e.kind);
    return accountKey(e.id, c, ccy, c === 1003 ? 'GENERAL' : undefined);
  }
  private holdOn(key: string): Money {
    let s = 0n;
    for (const h of this.s.holds.values()) if (h.status === 'ACTIVE') for (const p of h.parts) if (p.accountKey === key) s += p.remaining;
    return s;
  }
  private queuedDebit(key: string): Money {
    let s = 0n;
    for (const e of this.queue) if (!e.holdId) for (const p of e.postings) if (p.creditAccount === key) s += p.amount;
    return s;
  }
  private spendable = (key: string): Money => this.balance(key) - this.holdOn(key) - this.queuedDebit(key);
  private lots(entityId: Id, ccy: Ccy): { accountKey: string; releaseTick: Tick; balance: Money }[] {
    const out: { accountKey: string; releaseTick: Tick; balance: Money }[] = [];
    for (const [k, b] of this.s.accounts) {
      const q = parseAccountKey(k);
      if (q && q.entityId === entityId && q.ccy === ccy && q.code === 1001 && q.sub?.startsWith(RESTRICTED_PREFIX) && b.balance > 0n)
        out.push({ accountKey: k, releaseTick: Number(q.sub.split(':')[1]), balance: b.balance });
    }
    return out.sort((a, b) => a.releaseTick - b.releaseTick || (a.accountKey < b.accountKey ? -1 : 1));
  }
  cash(entityId: Id, ccy: Ccy): Money {
    let s = 0n;
    for (const [k, b] of this.s.accounts) { const q = parseAccountKey(k); if (q && q.entityId === entityId && q.ccy === ccy && (q.code === 1001 || q.code === 1002 || q.code === 1003)) s += b.balance; }
    return s;
  }
  /** Unrestricted money on the account the rail pays from, minus holds and this tick's queued debits. TODO(T03-06): multi-account draw order. */
  available(entityId: Id, ccy: Ccy): Money { const e = this.entity(entityId); return e ? this.spendable(this.payKey(e, ccy)) : 0n; }
  availableFor(entityId: Id, ccy: Ccy, purposeCode: string): Money {
    const base = this.available(entityId, ccy);
    return RESTRICTED_OK_CODES.includes(purposeCode) ? base + this.lots(entityId, ccy).reduce((s, l) => s + this.spendable(l.accountKey), 0n) : base;
  }
  position(entityId: Id, assetId: Id): Qty {
    let s = 0n;
    for (const [k, b] of this.s.accounts) { const q = parseAccountKey(k); if (q && q.entityId === entityId && q.sub === assetId) s += b.qty; }
    return s;
  }
  availableQty(entityId: Id, assetId: Id): Qty {
    let held = 0n;
    for (const h of this.s.holds.values()) if (h.status === 'ACTIVE' && h.kind === 'QTY' && h.owner === entityId && h.assetId === assetId) held += h.remaining;
    return this.position(entityId, assetId) - held;
  }
  /** Book NW = Σ ASSET + LIABILITY balances (debit-positive), MEMO excluded. TODO(T03-17): marked NW. */
  netWorth(entityId: Id): Money {
    let s = 0n;
    for (const [k, b] of this.s.accounts) { const q = parseAccountKey(k); if (q && q.entityId === entityId && q.code < 3000) s += b.balance; }
    return s;
  }
  aggregates(ccy: Ccy): { M0: Money; M0_sys: Money; M0_cb: Money; M2: Money; PEM: Money } {
    const a = this.s.accounts; const M0 = computeM0(a, ccy); const M0_sys = computeM0sys(a, ccy);
    return { M0, M0_sys, M0_cb: M0 - M0_sys, M2: computeM2(a, ccy), PEM: computePEM(a, ccy, this.perimeterOf) };
  }
  ownAccountToday(ccy: Ccy): Money { return this.s.today.get(ccy)?.ownAccount ?? 0n; }

  // ───────── writers ─────────
  private rail(): T.RailState {
    return {
      tick: this.s.tick, entity: this.entity, spendable: this.spendable, restrictedLots: (e, c) => this.lots(e, c),
      bookValueOf: (key, qty) => T.bookValue(this.balance(key), this.qtyOf(key), qty), balance: (key) => this.balance(key),
    };
  }
  env(module: string, phase: PhaseId, intentId?: Id): T.TemplateEnv {
    return {
      tick: this.s.tick, catalog: this.catalog, rail: this.rail(), requestedBy: { module, phase, ...(intentId ? { intentId } : {}) },
      // TODO(unit-02): ctx.newId('ent'); a deterministic per-world counter until then.
      newEntryId: () => `ent_${String(++this.s.idCounter).padStart(26, '0')}`,
    };
  }
  /** Writers for one module and phase (G7). Entries are queued; nothing changes until runP13. */
  apiFor(module: string, phase: PhaseId = 'P12', intentId?: Id): { ledger: LedgerApi; holds: HoldApi } {
    const env = (): T.TemplateEnv => this.env(module, phase, intentId);
    const q = (e: Entry): Id => { if (this.inHook) throw new Error('tick-flows hooks get no LedgerApi (Δ8)'); this.queue.push(e); return e.entryId; };
    const mod = Number(module.slice(0, 2));
    const rej = (code: string): Reject => ({ code } as unknown as Reject);
    const withHold = (o?: T.PostOptsExt): T.PostOptsExt | undefined => {
      if (!o?.holdId) return o;
      const h = this.s.holds.get(o.holdId);
      return h && h.status === 'ACTIVE' ? { ...o, fixedSources: h.parts.filter((p) => p.remaining > 0n).map((p) => ({ accountKey: p.accountKey, amount: p.remaining })) } : o;
    };
    const ledger: LedgerApi = {
      pay: (f, t, a, c, k, o) => q(T.tplPay(env(), f, t, a, c, k, withHold(o))),
      swapAsset: (b, s, as, qt, a, c, k, o) => q(T.tplSwapAsset(env(), b, s, as, qt, a, c, k, withHold(o))),
      mint: (t, a, c, k, o) => q(T.tplMint(env(), t, a, c, k, o)),
      burn: (f, a, c, k, o) => q(T.tplBurn(env(), f, a, c, k, withHold(o))),
      elasticIn: (s, t, a, c, k, o) => q(T.tplElasticIn(env(), s, t, a, c, k, o)),
      elasticOut: (f, s, a, c, k, o) => q(T.tplElasticOut(env(), f, s, a, c, k, withHold(o))),
      lend: (b, br, a, c, k, l, o) => q(T.tplLend(env(), b, br, a, c, k, l, o)),
      repay: (br, b, a, c, k, l, o) => q(T.tplRepay(env(), br, b, a, c, k, l, o)),
      cbCredit: (cb, b, a, c, k, o) => q(T.tplCbCredit(env(), cb, b, a, c, k, o)),
      cbCreditUnwind: (b, cb, a, c, k, o) => q(T.tplCbCreditUnwind(env(), b, cb, a, c, k, withHold(o))),
      accrue: (e, a, c, k, d, cr, o) => q(T.tplAccrue(env(), e, a, c, k, d, cr, o)),
      accruePair: (a, b, am, c, k, o) => q(T.tplAccruePair(env(), a, b, am, c, k, o)),
      fx: (a, b, c1, a1, c2, a2, k, o) => q(T.tplFx(env(), a, b, c1, a1, c2, a2, k, o)),
      moveQty: (f, t, as, qt, bv, c, k, o) => q(T.tplMoveQty(env(), f, t, as, qt, bv, c, k, o)),
      reclass: (e, a, c, k, fa, ta, o) => q(T.tplReclass(env(), e, a, c, k, fa, ta, o)),
      compose: (p, sup) => { const en = env(); const b = { env: en, t: T }; return q(T.composeEntries(en, p(b), sup.map((f) => f(b)))); },
      payProRata: (p, h, tot, c, k, o) => q(T.payProRata(env(), p, h, tot, c, k, o)),
      balance: (k) => this.balance(k), cash: (e, c) => this.cash(e, c), available: (e, c) => this.available(e, c),
      availableFor: (e, c, p) => this.availableFor(e, c, p), position: (e, a) => this.position(e, a),
      availableQty: (e, a) => this.availableQty(e, a), netWorth: (e) => this.netWorth(e),
      entryOf: (id) => this.queue.find((e) => e.entryId === id) ?? this.s.log.find((e) => e.entryId === id),
      escrowPlace: (v, a, amt, c, k, id, op) => q(T.tplEscrowPlace(env(), v, a, amt, c, k, id, op)),
      escrowSettle: (id, ta, tv) => { const row = this.s.escrows.get(id); return row ? q(T.tplEscrowSettle(env(), row, ta, tv)) : rej('LED_UNKNOWN_ESCROW'); },
      registerAccrual: (kind, code, a, b, c) => {
        const codes = SETTLEMENT_CODES[kind as AccrualKind];
        if (!codes || !codes.includes(code) || this.catalog.get(code)?.owner !== mod) return rej('LED_NO_SETTLEMENT_CODE');
        if ([a, b].some((x) => ['hh', 'frm', 'row'].includes(kindOfId(x) ?? '') || !this.entity(x))) return rej('LED_NO_SETTLEMENT_CODE'); // elastic flows never accrue
        const accrualId = `acr_${String(++this.s.idCounter).padStart(26, '0')}`;
        this.s.accruals.set(accrualId, { accrualId, kind, code, module: mod, a, b, ccy: c, payable: SETTLEMENT_PAYABLE[kind as AccrualKind], accrued: 0n, settled: 0n });
        return accrualId;
      },
      accrueOn: (id, amt) => {
        const r = this.s.accruals.get(id); if (!r) return rej('LED_UNKNOWN_ACCRUAL');
        const row = this.catalog.get(r.code);
        const e = T.tplAccruePair(env(), r.a, r.b, amt, r.ccy, 'LED_ACCRUAL', { valueLegA: RECEIVABLE, valueLegB: r.payable, accrualId: id,
          income: typeof row?.valueLegB === 'number' ? row.valueLegB : undefined, expense: typeof row?.valueLegA === 'number' ? row.valueLegA : undefined });
        e.meta = { ...(e.meta ?? { parties: [] }), accrual: { id, accrued: amt } };
        return q(e);
      },
      settleAccrual: (id, amt, code) => {
        const r = this.s.accruals.get(id); if (!r) return rej('LED_UNKNOWN_ACCRUAL');
        if (!(SETTLEMENT_CODES[r.kind as AccrualKind] ?? []).includes(code)) return rej('LED_NO_SETTLEMENT_CODE');
        if (this.catalog.get(code)?.owner !== r.module) return rej('LED_NO_SETTLEMENT_CODE');
        const queued = this.queue.reduce((s, e) => s + (e.meta?.accrual?.id === id ? (e.meta.accrual.settled ?? 0n) : 0n), 0n);
        const open = r.accrued - r.settled - queued; const x = amt < open ? amt : open; // E-14: clamped by min()
        if (x <= 0n) return rej('LED_NOTHING_TO_SETTLE');
        const e = T.tplPay(env(), r.b, r.a, x, r.ccy, code, { valueLegA: r.payable, valueLegB: RECEIVABLE, accrualId: id });
        e.meta = { ...(e.meta ?? { parties: [] }), accrual: { id, settled: x } };
        return q(e);
      },
      freshStart: (chr, c, msiNow) => {
        const g = this.s.linkGroups.get(chr) ?? chr; const last = this.s.freshStart.get(g);
        if (last !== undefined && this.s.tick < last + FRESH_START_COOLDOWN_TICKS) return rej('LED_FRESH_START_COOLDOWN');
        const grant = toMoney(5000 * msiNow, c) - this.available(chr, c);
        if (grant <= 0n) return null;
        this.s.freshStart.set(g, this.s.tick); // TODO(unit-14): committed with the grant entry; literal reading: set when granted
        const e = T.tplMint(env(), chr, grant, c, 'ACCT_FRESH_START');
        e.meta = { ...(e.meta ?? { parties: [] }), garnish: { id: chr, amount: grant } };
        return q(e);
      },
      garnishIncome: (chr, income, c) => {
        const out = this.s.garnish.get(chr) ?? 0n; const want = mulRate(income, GARNISH_RATE_E6); const x = want < out ? want : out;
        if (x <= 0n) return null;
        const e = T.tplPay(env(), chr, `gov_${c}`, x, c, 'LAW_GARNISHMENT');
        e.meta = { ...(e.meta ?? { parties: [] }), garnish: { id: chr, amount: -x } };
        return q(e);
      },
    };
    const holds: HoldApi = {
      placeCash: (o, c, a, x, r) => this.placeCash(o, c, a, x, r, undefined),
      placeCashFor: (o, c, a, x, r, p) => this.placeCash(o, c, a, x, r, p),
      placeQty: (o, as, qt, x, r) => {
        if (x < this.s.tick) return { code: 'LED_BAD_EXPIRY' };
        if (!this.entity(o)) return { code: 'LED_UNKNOWN_ENTITY' };
        if (qt <= 0n || this.availableQty(o, as) < qt) return { code: 'LED_INSUFFICIENT_QTY' };
        return this.newHold({ owner: o, kind: 'QTY', assetId: as, amount: qt, parts: [], expiresTick: x, ref: r });
      },
      release: (id) => { const h = this.s.holds.get(id); if (h && h.status === 'ACTIVE') h.status = 'RELEASED'; },
      reduce: (id, by) => {
        const h = this.s.holds.get(id); if (!h || h.status !== 'ACTIVE' || by <= 0n) return;
        let left = by < h.remaining ? by : h.remaining; h.remaining -= left;
        for (let i = h.parts.length - 1; i >= 0 && left > 0n; i--) { const t = h.parts[i].remaining < left ? h.parts[i].remaining : left; h.parts[i].remaining -= t; left -= t; }
        if (h.remaining === 0n) h.status = 'RELEASED';
      },
      get: (id) => { const h = this.s.holds.get(id); return h ? structuredClone(h) : undefined; },
    };
    return { ledger, holds };
  }
  private newHold(h: Omit<Hold, 'holdId' | 'remaining' | 'placedTick' | 'status'>): Id {
    const holdId = `hld_${String(++this.s.idCounter).padStart(26, '0')}`;
    this.s.holds.set(holdId, { ...h, holdId, remaining: h.amount, placedTick: this.s.tick, status: 'ACTIVE' });
    return holdId;
  }
  /** Holds reserve every amount that could fail at P13 (03 §3.3.2 rule 5); restricted lots only for restrictedOk purposes (03#32). */
  private placeCash(owner: Id, ccy: Ccy, amt: Money, expiresTick: Tick, ref: Id, purpose: string | undefined): Id | Reject {
    const e = this.entity(owner);
    if (!e) return { code: 'LED_UNKNOWN_ENTITY' };
    if (expiresTick < this.s.tick) return { code: 'LED_BAD_EXPIRY' };
    if (typeof amt !== 'bigint' || amt <= 0n) return { code: 'LED_INSUFFICIENT_FUNDS' };
    const ok = purpose !== undefined && RESTRICTED_OK_CODES.includes(purpose);
    const lots = this.lots(owner, ccy).map((l) => ({ accountKey: l.accountKey, avail: this.spendable(l.accountKey) }));
    const main = { accountKey: this.payKey(e, ccy), avail: this.spendable(this.payKey(e, ccy)) };
    const restrictedTotal = lots.reduce((s, l) => s + (l.avail > 0n ? l.avail : 0n), 0n);
    const sources = ok ? [...lots, main] : [main];
    const parts: Hold['parts'] = [];
    let left = amt;
    for (const s of sources) { const a = s.avail < left ? s.avail : left; if (a > 0n) { parts.push({ accountKey: s.accountKey, amount: a, remaining: a }); left -= a; } }
    if (left > 0n) return !ok && amt <= main.avail + restrictedTotal ? { code: 'LED_RESTRICTED_FUNDS' } : { code: 'LED_INSUFFICIENT_FUNDS' };
    return this.newHold({ owner, kind: 'CASH', ccy, amount: amt, parts, expiresTick, ref, ...(purpose ? { purposeCode: purpose } : {}) });
  }

  // ───────── P13 ─────────
  /** Test-only access (03#38 corruption; INV-LED-009 negative test). Never used by the ledger itself. */
  testHooks() {
    return { queue: this.queue, accounts: this.s.accounts };
  }

  /** Commit the tick (T03-09 runP13). Idempotent per tick: a rerun for a committed tick posts nothing. Then advances the tick. */
  runP13(tick: Tick = this.s.tick): CommitResult {
    const res: CommitResult = { committed: true, replay: false, safeMode: false, applied: 0, invalid: 0, failedInvariants: [], failures: [] };
    if (tick <= this.s.lastCommitted) return { ...res, replay: true };
    if (tick !== this.s.tick) throw new Error(`runP13: tick ${tick} is not the open tick ${this.s.tick}`);
    const archiveReadsBefore = this.archiveReads;
    // INV-LED-009: committed balances must equal what the last commit wrote (no writer outside applyPosting).
    const outside = this.s.accounts.version !== this.committedVersion;
    // Δ4: scheduled processes keyed by (process, subject, tick), never re-run for a key already posted.
    const newKeys: string[] = [];
    for (const p of this.processes) for (const job of p.run(tick)) {
      const key = `${p.name}|${job.subject}|${tick}`;
      if (this.s.done.has(key)) continue;
      job.post(this.apiFor(p.module, 'P13').ledger); newKeys.push(key);
    }
    this.started = true;
    // Δ14 expiry: a HELD escrow with no case is released in full to the attacker at expiresTick (03's scheduler, key (escrow, tick)).
    for (const e of this.s.escrows.values()) {
      const key = `led.escrow.expire|${e.escrowId}|${tick}`;
      if (e.status === 'HELD' && e.caseId === null && tick >= e.expiresTick && !this.s.done.has(key)) {
        this.queue.push(T.tplEscrowSettle(this.env('03', 'P13'), e, e.amount, 0n)); newKeys.push(key);
      }
    }
    // Restricted-lot release (T03-12 queueReleases): LED_RECLASS of every lot whose window has passed.
    for (const [k, b] of this.s.accounts) {
      if (b.balance <= 0n || !k.includes(`:1001:${RESTRICTED_PREFIX}`)) continue;
      const q = parseAccountKey(k);
      if (q && Number((q.sub as string).split(':')[1]) <= tick)
        this.queue.push(T.reclassKeys(this.env('03', 'P13'), 'LED_RECLASS', k, accountKey(q.entityId, 1001, q.ccy), b.balance, q.ccy));
    }
    // Expire holds (expiresTick < tick).
    const holds = new SortedMap<Id, Hold>(this.s.holds.entries().map(([k, h]) => [k, structuredClone(h)]));
    for (const h of holds.values()) if (h.status === 'ACTIVE' && h.expiresTick < tick) h.status = 'RELEASED';
    // INV-LED-012 first: a non-bigint value must not reach the bigint arithmetic below.
    const prov = INV_LED_012({ entries: this.queue.filter((e) => !e.invalid), post: new SortedMap() } as unknown as CheckView);
    if (prov.length > 0) {
      this.queue = []; this.s.lastCommitted = tick; this.s.tick = tick + 1; this.s.safeMode = true;
      return { ...res, safeMode: true, failures: prov, failedInvariants: ['INV-LED-012'] };
    }
    // Stage all-or-nothing.
    const pre = this.s.accounts;
    const post = new SortedMap<string, Bal>(pre.entries().map(([k, v]) => [k, { ...v }]));
    const valid: Entry[] = []; const invalid: Entry[] = [];
    for (const e of this.queue) {
      if (e.invalid) { invalid.push(e); continue; }
      for (const p of e.postings) applyPosting(post, p);
      valid.push(e);
      if (e.holdId) settleHold(holds.get(e.holdId), e);
    }
    // Registries staged with the entries (led.escrow, accruals, Fresh Start garnish): visible only if the tick commits.
    const escrows = new SortedMap<Id, ConflictEscrow>(this.s.escrows.entries().map(([k, e]) => [k, { ...e }]));
    const accruals = new SortedMap<Id, AccrualRow>(this.s.accruals.entries().map(([k, a]) => [k, { ...a }]));
    const garnish = this.s.garnish.clone();
    for (const e of valid) {
      const m = e.meta;
      if (m?.escrow?.op === 'PLACE') escrows.set(m.escrow.row.escrowId, { ...m.escrow.row });
      if (m?.escrow?.op === 'SETTLE') { const r = escrows.get(m.escrow.escrowId); if (r) r.status = m.escrow.toVictim === 0n ? 'RELEASED' : m.escrow.toAttacker === 0n ? 'CLAWED_BACK' : 'SPLIT'; }
      if (m?.accrual) { const r = accruals.get(m.accrual.id); if (r) { r.accrued += m.accrual.accrued ?? 0n; r.settled += m.accrual.settled ?? 0n; } }
      if (m?.garnish) garnish.set(m.garnish.id, (garnish.get(m.garnish.id) ?? 0n) + m.garnish.amount);
    }
    // Δ10: commit → holdings → control evaluation from committed state (sorted ids) → CONTROL entries → checks → rollDay → hooks.
    const victim = (id: Id): Id | undefined => escrows.get(id)?.victimId;
    const holdPost = foldHoldings(this.s.holdings, valid.flatMap((e) => e.postings), victim);
    const before = (id: Id): SideTag | undefined => this.s.sides.get(id);
    const sidesNext = new SortedMap<Id, SideTag>();
    for (const id of this.s.entities.keys()) { const t = sideOf(this.sideInputs(), id); if (t) sidesNext.set(id, t); }
    const after = (id: Id): SideTag | undefined => sidesNext.get(id);
    const ids = sidesNext.keys();
    const changes = CCYS.flatMap((c) => controlChanges(ids, c, before, after, holdPost));
    const cenv = this.env('03', 'P13');
    for (const ch of changes) {
      const e = T.tplControl(cenv, ch.code, ch.id, ch.amount, ch.ccy, [sideName(ch.before), sideName(ch.after)]);
      for (const p of e.postings) applyPosting(post, p);
      valid.push(e);
    }
    const flows = tickFlowsOf(valid, this.catalog, tick, (c) => computeM0sys(post, c) - computeM0sys(pre, c));
    const anomalies: string[] = [];
    for (const c of CCYS) {
      const r = classify({ ccy: c, entries: valid, catalog: this.catalog, before, after, escrowVictim: victim, holdPre: this.s.holdings, holdPost }, changes);
      (flows.get(c) as TickFlows).sysSide = r.flows; anomalies.push(...r.anomalies);
    }
    const isDayClose = tick % TICKS_PER_DAY === TICKS_PER_DAY - 1;
    const dayIndex = Math.floor(tick / TICKS_PER_DAY);
    const dayAcc = new SortedMap<string, FlowDayArchive>(CCYS.map((c) => {
      const cur = this.s.dayAcc.get(c); return [c, addTick(cur && cur.dayIndex === dayIndex ? cur : emptyArchive(c, dayIndex), flows.get(c) as TickFlows)];
    }));
    const archiveRows: FlowDayArchive[] = [];
    if (isDayClose) for (const c of CCYS) {
      const prev = this.s.archive.get(`${c}:${dayIndex - 1}`) ?? this.lastArchive(c);
      const row = { ...(dayAcc.get(c) as FlowDayArchive), prevHash: prev?.hash ?? '' };
      row.hash = archiveHash(row); archiveRows.push(row);
    }
    const today = this.foldToday(valid, flows);
    const view: CheckView = {
      tick, isDayClose, catalog: this.catalog, entries: valid, pre, post, entity: this.entity, flows,
      facts: { overdraftLimit: (k) => this.s.facts.get(`OVERDRAFT_LIMIT:${k}`) ?? 0n, intradayLimit: (b) => this.s.facts.get(`INTRADAY_CREDIT_LIMIT:${b}`) ?? 0n },
      alarm: { mult: this.params.led_code_alarm_mult, floorMicro: toMoney(this.params.led_code_alarm_floor, 'FDL') },
      ...(isDayClose ? {
        dayEntries: [...this.s.day, ...valid],
        flowsToday: new SortedMap(today.entries().map(([c, t]) => [c, t.byClass])),
        todayByCode: (c: Ccy) => today.get(c)?.byCode ?? new SortedMap(),
        dayHistory: (c: Ccy, code: string) => this.dayHistory(c, code),
      } : {}),
    };
    view.sys = { before, after, ids, holdPost, anomalies, escrowVictim: victim,
      dM0cb: (c) => computeM0(post, c) - computeM0sys(post, c) - (computeM0(pre, c) - computeM0sys(pre, c)) };
    view.escrows = escrows; view.holds = holds; view.accruals = accruals;
    const failures = [...TICK_INVARIANTS, ...SYS_INVARIANTS].flatMap(([, chk]) => chk(view));
    for (const row of archiveRows) {
      const ticks = [...this.s.tickFlows.values().filter((f) => f.ccy === row.ccy && Math.floor(f.tick / TICKS_PER_DAY) === dayIndex), flows.get(row.ccy) as TickFlows];
      failures.push(...INV_LED_017(row, ticks, this.s.archive.get(`${row.ccy}:${dayIndex - 1}`) ?? this.lastArchive(row.ccy)));
    }
    if (outside) failures.unshift({ invariantId: 'INV-LED-009', observed: 'committed balances changed outside the ledger writer', expected: 'balances written only by applyPosting at P13', severity: 'FATAL' });
    const fatal = failures.filter((f) => f.severity === 'FATAL');
    res.failures = failures; res.failedInvariants = fatal.map((f) => f.invariantId).filter((x, i, a) => a.indexOf(x) === i).sort();
    this.queue = [];
    this.s.lastCommitted = tick; this.s.tick = tick + 1;
    if (fatal.length > 0) { // abort: nothing of this tick becomes visible (03#38)
      this.s.safeMode = true; res.safeMode = true;
      if (outside) this.committedVersion = this.s.accounts.version;
      return res;
    }
    this.s.accounts = post; this.s.holds = holds;
    this.s.log.push(...valid, ...invalid);
    this.s.day.push(...valid);
    this.s.today = today;
    for (const k of newKeys) this.s.done.set(k, true);
    for (const f of flows.values()) this.s.tickFlows.set(f.id, f);
    for (const c of CCYS) this.s.tickFlows.delete(`${c}:${tick - this.params.led_tickflows_keep}`);
    this.s.alerts.push(...failures.filter((f) => f.severity === 'ALERT'));
    this.s.escrows = escrows; this.s.accruals = accruals; this.s.garnish = garnish;
    this.s.holdings = holdPost; this.s.sides = sidesNext; this.s.dayAcc = dayAcc;
    for (const ch of changes) if ((ch.before.side === 'S') !== (ch.after.side === 'S') && !this.s.flips.includes(`${tick}|${ch.id}`)) this.s.flips.push(`${tick}|${ch.id}`);
    this.controlAlarms(tick, flows, isDayClose);
    for (const row of archiveRows) this.s.archive.set(row.id, row);
    if (isDayClose) this.rollDay(tick);
    res.failures.push(...this.fireHooks(tick, flows));
    this.committedVersion = this.s.accounts.version;
    res.applied = valid.length; res.invalid = invalid.length;
    if (this.archiveReads !== archiveReadsBefore) throw new Error('P13 read the postings archive (Δ2 cost rule)');
    return res;
  }
  runTicks(n: number): CommitResult[] { const r: CommitResult[] = []; for (let i = 0; i < n; i++) r.push(this.runP13()); return r; }

  private resetToday(): void {
    this.s.today = new SortedMap(CCYS.map((c) => [c, { byClass: new SortedMap(FLOW_CLASSES.map((k) => [k, 0n])), byCode: new SortedMap(), ownAccount: 0n }]));
  }
  /** updateMoneyAfterCommit (T03-11 step 4, Δ2): O(postings this tick), counted per flowLeg posting (PD-5). */
  private foldToday(valid: readonly Entry[], flows: SortedMap<string, TickFlows>): State['today'] {
    const out: State['today'] = new SortedMap();
    for (const [c, t] of this.s.today) {
      const f = flows.get(c) as TickFlows;
      const byClass = new SortedMap<FlowClass, Money>(FLOW_CLASSES.map((k) => [k, (t.byClass.get(k) ?? 0n) + (f.byClass.get(k) ?? 0n)]));
      const byCode = t.byCode.clone();
      for (const [k, a] of f.byCode) byCode.set(k, (byCode.get(k) ?? 0n) + a);
      let own = t.ownAccount;
      // own-account line (03 §3.5.3): M2 change of TRANSFER entries in which a bank is the payer or payee itself.
      for (const e of valid) if (this.catalog.get(e.reason)?.cls === 'TRANSFER' && e.postings.some((p) => [p.debitAccount, p.creditAccount].some((k) => {
        const q = parseAccountKey(k); return !!q && kindOfId(q.entityId) === 'bnk' && q.code >= 4000;
      }))) for (const p of e.postings) if (p.ccy === c) own += postingEffect(p).m2;
      out.set(c, { byClass, byCode, ownAccount: own });
    }
    return out;
  }
  private dayHistory(ccy: Ccy, code: string): Money[] {
    const out: Money[] = [];
    for (const d of this.s.flowDays.values().filter((d) => d.ccy === ccy).sort((a, b) => b.dayIndex - a.dayIndex)) out.push(BigInt(d.byCode[code] ?? '0'));
    return out;
  }
  /** rollDay (T03-11 step 5): FlowDay rows as decimal strings, 364 days kept, "today" reset. TODO(systems): pCross*, gross*, N_a. */
  private rollDay(tick: Tick): void {
    const dayIndex = Math.floor(tick / TICKS_PER_DAY);
    for (const c of CCYS) {
      const t = this.s.today.get(c) as State['today'] extends SortedMap<string, infer V> ? V : never;
      const a = this.aggregates(c);
      const byClass = Object.fromEntries(FLOW_CLASSES.map((k) => [k, String(t.byClass.get(k) ?? 0n)])) as Record<FlowClass, string>;
      const byCode: Record<string, string> = {};
      for (const [k, v] of t.byCode) byCode[k] = String(v);
      this.s.flowDays.set(`${c}:${dayIndex}`, {
        id: `${c}:${dayIndex}`, ccy: c, dayIndex, byClass, byCode, M0: String(a.M0), M0_sys: String(a.M0_sys), M0_cb: String(a.M0_cb),
        M2: String(a.M2), PEM: String(a.PEM), ownAccount: String(t.ownAccount),
      });
      this.s.flowDays.delete(`${c}:${dayIndex - this.params.flowday_keep_days}`);
    }
    this.s.day = []; this.resetToday();
  }

  private lastArchive(c: Ccy): FlowDayArchive | undefined {
    let best: FlowDayArchive | undefined;
    for (const r of this.s.archive.values()) if (r.ccy === c && (!best || r.dayIndex > best.dayIndex)) best = r;
    return best;
  }
  /** Gross-control alarms (§6.5 PROVISIONAL, ALERT only, Δ12): day share over max(1% M0_player at open, floor); flips per entity in 7 days. */
  private controlAlarms(tick: Tick, flows: SortedMap<string, TickFlows>, isDayClose: boolean): void {
    const week = 7 * TICKS_PER_DAY;
    this.s.flips = this.s.flips.filter((f) => Number(f.split('|')[0]) > tick - week);
    const per = new SortedMap<string, number>();
    for (const f of this.s.flips) { const id = f.split('|')[1]; per.set(id, (per.get(id) ?? 0) + 1); }
    for (const [id, n] of per) if (n > this.params.led_control_alarm_flips && this.s.flips.includes(`${tick}|${id}`))
      this.s.alerts.push({ invariantId: 'LED-CONTROL-FLIPS', observed: `${id}: ${n} control changes in 7 game days`, expected: `≤ ${this.params.led_control_alarm_flips}`, severity: 'ALERT' });
    if (!isDayClose) return;
    for (const c of CCYS) {
      const s = (this.s.dayAcc.get(c) as FlowDayArchive).sys;
      const gross = sumMap(s.controlIn) + sumMap(s.controlOut);
      const open = this.s.m0PlayerOpen.get(c) ?? 0n; const floor = toMoney(this.params.led_code_alarm_floor, c);
      const lim = mulRate(open, this.params.led_control_alarm_share_e6); const max = lim > floor ? lim : floor;
      if (gross > max) this.s.alerts.push({ invariantId: 'LED-CONTROL-GROSS', observed: `${c} day gross control ${gross}`, expected: `≤ ${max}`, severity: 'ALERT' });
      let m0p = 0n; for (const [k, m] of this.s.holdings) { const i = k.lastIndexOf('|'); if (k.slice(i + 1) === c && this.s.sides.get(k.slice(0, i))?.side === 'N') m0p += m; }
      this.s.m0PlayerOpen.set(c, m0p);
    }
    void flows;
  }
  /** Δ8 hooks after rollDay: modules sorted, ccys sorted, frozen flows, no LedgerApi, cursor per world; INV-LED-018 on the cursor. */
  private fireHooks(tick: Tick, flows: SortedMap<string, TickFlows>): Failure[] {
    const out: Failure[] = [];
    for (const c of [...CCYS].sort(cmpStr)) {
      const cur = this.s.hookCursor.get(c) ?? tick - 1;
      const replay = tick <= cur;
      if (!replay) {
        const frozen = freezeFlows(flows.get(c) as TickFlows);
        this.inHook = true;
        try { for (const h of this.hooks) h.fn(frozen, { tick, ccy: c }); } finally { this.inHook = false; }
        this.s.hookCursor.set(c, tick);
      }
      out.push(...INV_LED_018(cur, this.s.hookCursor.get(c) as Tick, tick, replay));
    }
    return out;
  }

  // ───────── FlowReader, log, snapshot ─────────
  flowReader(): FlowReader {
    return {
      tickFlows: (c, t) => this.s.tickFlows.get(`${c}:${t}`),
      codeTotal: (c, t, code) => this.s.tickFlows.get(`${c}:${t}`)?.byCode.get(code) ?? 0n,
      dayFlows: (c, d) => this.s.flowDays.get(`${c}:${d}`),
      netFlow: (c, t, h) => { const s = this.s.tickFlows.get(`${c}:${t}`)?.sysSide; return !s ? 0n : h ? (s.byHolder.get(h)?.netFlow ?? 0n) : s.netFlow; },
      netFlowDay: (c, d, h) => { const s = this.s.archive.get(`${c}:${d}`)?.sys; return !s ? 0n : h ? (s.byHolder.get(h)?.netFlow ?? 0n) : s.netFlow; },
      archiveDay: (c, d) => this.s.archive.get(`${c}:${d}`),
    };
  }
  /** The postings archive (committed entry log). Counted for the Δ2 cost test. */
  entryLog(): readonly Entry[] { this.archiveReads++; return this.s.log; }
  /** Snapshot (world state, canonEncode-able). INV-LED-013 is checked on every snapshot: balances = fold of the archive. */
  snapshot(): string {
    const fold = foldBalances(this.s.log);
    const nonzero = (m: Accounts): string => canonEncode(new SortedMap(m.entries().filter(([, b]) => b.balance !== 0n || b.qty !== 0n)));
    if (nonzero(fold) !== nonzero(this.s.accounts)) throw new Error('INV-LED-013: snapshot is not the fold of the postings archive');
    return canonEncode({ ...this.s, holds: this.s.holds, done: this.s.done });
  }
  /** Restore from a structured clone of the state (TODO(unit-02): decode canonEncode snapshots). */
  checkpoint(): State { return cloneState(this.s); }
  restore(st: State): void {
    const cur = this.s.hookCursor; this.s = cloneState(st);
    // Δ8/L19: the cursor never moves back (replay never re-fires hooks) and follows the world tick forward: a restore to a later
    // tick is not a committed tick, so the cursor lands on tick − 1 and the next commit advances it by exactly 1.
    for (const c of CCYS) {
      const t = [cur.get(c), this.s.hookCursor.get(c), this.s.tick - 1].reduce<number>((m, x) => (x !== undefined && x > m ? x : m), -1);
      this.s.hookCursor.set(c, t);
    }
    this.queue = []; this.committedVersion = this.s.accounts.version; }
}

const sideName = (t: SideTag): string => (t.side === 'S' ? 'S' : `${t.cls}${t.tag ? `/${t.tag}` : ''}`);
/** Read-only copy for hooks: maps refuse writes, objects are frozen (Δ8). */
function freezeFlows(f: TickFlows): Readonly<TickFlows> {
  const lock = <K extends string, V>(m: SortedMap<K, V>): SortedMap<K, V> => {
    const c = m.clone(); const no = (): never => { throw new Error('TickFlows passed to a hook are read-only'); };
    Object.defineProperty(c, 'set', { value: no }); Object.defineProperty(c, 'delete', { value: no }); return c;
  };
  const s = f.sysSide;
  return Object.freeze({ ...f, byClass: lock(f.byClass), byCode: lock(f.byCode), ...(s ? { sysSide: Object.freeze({ ...s, faucet: lock(s.faucet), sink: lock(s.sink),
    controlIn: lock(s.controlIn), controlOut: lock(s.controlOut), treasury: lock(s.treasury),
    byHolder: lock(new SortedMap(s.byHolder.entries().map(([k, t]) => [k, Object.freeze({ ...t })]))),
    byRivalTag: lock(new SortedMap(s.byRivalTag.entries().map(([k, t]) => [k, Object.freeze({ ...t })]))) }) } : {}) });
}
/** The only code that changes a balance or qty (INV-LED-009). */
export function applyPosting(a: Accounts, p: { debitAccount: string; creditAccount: string; amount: Money; qty?: Qty }): void {
  const d = a.get(p.debitAccount) ?? { balance: 0n, qty: 0n };
  a.set(p.debitAccount, { balance: d.balance + p.amount, qty: d.qty + (p.qty ?? 0n) });
  const c = a.get(p.creditAccount) ?? { balance: 0n, qty: 0n };
  a.set(p.creditAccount, { balance: c.balance - p.amount, qty: c.qty - (p.qty ?? 0n) });
}
/** INV-LED-013 fold (T03-09 foldBalances). */
export function foldBalances(entries: Iterable<Entry>): Accounts {
  const a: Accounts = new SortedMap();
  for (const e of entries) if (!e.invalid) for (const p of e.postings) applyPosting(a, p);
  return a;
}
function settleHold(h: Hold | undefined, e: Entry): void {
  if (!h || h.status !== 'ACTIVE') return;
  for (const p of e.postings) for (const part of h.parts) if (part.accountKey === p.creditAccount && part.remaining > 0n) {
    const t = part.remaining < p.amount ? part.remaining : p.amount; part.remaining -= t; h.remaining -= t;
  }
  if (h.remaining <= 0n) { h.remaining = 0n; h.status = 'SETTLED'; }
}
function cloneState(s: State): State {
  const m = <K extends string, V>(x: SortedMap<K, V>): SortedMap<K, V> => new SortedMap(x.entries().map(([k, v]) => [k, structuredClone(v)]));
  return {
    ...s, entities: m(s.entities), accounts: m(s.accounts), holds: m(s.holds), facts: m(s.facts), log: structuredClone(s.log), day: structuredClone(s.day),
    tickFlows: new SortedMap(s.tickFlows.entries().map(([k, f]) => [k, { ...f, byClass: f.byClass.clone(), byCode: f.byCode.clone() }])),
    today: new SortedMap(s.today.entries().map(([k, t]) => [k, { byClass: t.byClass.clone(), byCode: t.byCode.clone(), ownAccount: t.ownAccount }])),
    flowDays: m(s.flowDays), done: s.done.clone(), alerts: [...s.alerts],
    // archive rows, dayAcc rows and sysSide are replaced, never mutated, after commit: shared by reference.
    sides: s.sides.clone(), holdings: s.holdings.clone(), roles: s.roles.clone(), dynasty: s.dynasty.clone(), linkGroups: s.linkGroups.clone(),
    escrows: new SortedMap(s.escrows.entries().map(([k, e]) => [k, { ...e }])), accruals: new SortedMap(s.accruals.entries().map(([k, e]) => [k, { ...e }])),
    freshStart: s.freshStart.clone(), garnish: s.garnish.clone(), archive: s.archive.clone(), dayAcc: s.dayAcc.clone(),
    hookCursor: s.hookCursor.clone(), flips: [...s.flips], m0PlayerOpen: s.m0PlayerOpen.clone(),
  };
}
export type { State as LedgerState, EntityKind };
