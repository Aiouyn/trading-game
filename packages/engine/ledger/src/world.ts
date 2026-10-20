// Ledger runtime for one world (T03-08/T03-09/T03-11/T03-12 subset): queue, holds, P13 commit, aggregates, FlowReader.
// All state lives on the instance (Δ11 spirit); nothing is process-global.
import { accountKey, cbkId, defaultMoneyCode, kindOfId, parseAccountKey, RESTRICTED_PREFIX, SYS_ID } from './accounts';
import { FLOW_CLASSES, RESTRICTED_OK_CODES, type FlowClass, ReasonCatalog } from './catalog';
import { canonEncode, SortedMap } from './det';
import {
  computeM0, computeM0sys, computeM2, computePEM, INV_LED_012, postingEffect, TICK_INVARIANTS, tickFlowsOf,
  type Accounts, type Bal, type CheckView, type Failure, type TickFlows,
} from './invariants';
import { CCYS, toMoney, type Ccy, type Id, type Money, type Qty, type Tick } from './money';
import { DEFAULT_PARAMS, IntentEnvelope, rootOwnerOf, type Params } from './stubs';
import * as T from './templates';
import type { Entry, EntityKind, Hold, LedgerEntity, PayAccountChoice, Perimeter, PhaseId, Reject } from './types';

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
}

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
    };
    this.resetToday();
    this.registerEntity({ id: SYS_ID });
    for (const c of CCYS) this.registerEntity({ id: cbkId(c), reportingCcy: c });
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
    return spec.id;
  }
  entity = (id: Id): LedgerEntity | undefined => this.s.entities.get(id);
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
      bookValueOf: (key, qty) => T.bookValue(this.balance(key), this.qtyOf(key), qty),
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
    const q = (e: Entry): Id => { this.queue.push(e); return e.entryId; };
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
    const flows = tickFlowsOf(valid, this.catalog, tick, (c) => computeM0sys(post, c) - computeM0sys(pre, c));
    const isDayClose = tick % TICKS_PER_DAY === TICKS_PER_DAY - 1;
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
    const failures = TICK_INVARIANTS.flatMap(([, chk]) => chk(view));
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
    if (isDayClose) this.rollDay(tick);
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

  // ───────── FlowReader, log, snapshot ─────────
  flowReader(): FlowReader {
    return {
      tickFlows: (c, t) => this.s.tickFlows.get(`${c}:${t}`),
      codeTotal: (c, t, code) => this.s.tickFlows.get(`${c}:${t}`)?.byCode.get(code) ?? 0n,
      dayFlows: (c, d) => this.s.flowDays.get(`${c}:${d}`),
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
  restore(st: State): void { this.s = cloneState(st); this.queue = []; this.committedVersion = this.s.accounts.version; }
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
  };
}
export type { State as LedgerState, EntityKind };
