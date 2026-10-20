// Pure template builders (T03-06 rail, T03-07 templates). They return data only; nothing is applied until P13 (E3).
import { accountKey, cbMirrorCode, cbkId, defaultMoneyCode, SYS_ID } from './accounts';
import { ESCROW_ONLY_CODES, RESTRICTED_FAUCETS, RESTRICTED_OK_CODES, type ReasonCatalog, type TemplateId } from './catalog';
import { allocate, divRoundHalfEven, type Ccy, type Id, type Money, type Qty, type Tick } from './money';
import { restrictedSub } from './accounts';
import { SortedMap } from './det';
import { ACCRUAL_LEGS, appraisalPairOk, LEG_POLICY, resolveLeg } from './legpolicy';
import type { ConflictEscrow, Entry, LedgerEntity, Posting } from './types';

export interface PostOpts { refs?: Id[]; holdId?: Id; valueLegA?: number; valueLegB?: number; sub?: string; memo?: string; accrualId?: Id }
export interface PostOptsExt extends PostOpts {
  qty?: Qty; assetId?: Id; assetAcct?: number;
  assetAcctFrom?: number; // giver's account when it is an issuance account (e.g. 2600 issued securities): no book/gain legs
  fixedSources?: { accountKey: string; amount: Money }[];
}
export interface RailState {
  tick: Tick;
  entity(id: Id): LedgerEntity | undefined;
  spendable(accountKey: string): Money;
  /** 1001 RESTRICTED:* subs with balance > 0n, FIFO (releaseTick, key). */
  restrictedLots(entityId: Id, ccy: Ccy): readonly { accountKey: string; releaseTick: Tick; balance: Money }[];
  bookValueOf(accountKey: string, qty: Qty): Money;
  balance(accountKey: string): Money;
}
export interface TemplateEnv {
  tick: Tick; catalog: ReasonCatalog; rail: RailState;
  requestedBy: Entry['requestedBy'];
  newEntryId(): Id;
}

type Draft = Omit<Posting, 'tick' | 'entryId' | 'postingSeq' | 'refs'>;
const dr = (debitAccount: string, creditAccount: string, amount: Money, ccy: Ccy, reason: string, x: Partial<Draft> = {}): Draft =>
  ({ debitAccount, creditAccount, amount, ccy, reason, ...x });

// Fallback value legs, used only when catalog v2 legA/legB is not an account code ('@ASSET', '@', '-', or a derived row: TODO(systems)).
const DEFAULT_LEG = { payerExpense: 5000, payeeIncome: 4000, mintIncome: 4110, elasticExpense: 5200 } as const;
/** Thrown inside a template when a leg breaks legPolicy; `guard` turns it into the invalid entry (templates stay pure). */
class LegFail { constructor(readonly entry: Entry) {} }
/**
 * Value-leg account under legpolicy.csv (E-11): `given` (PostOpts override or positional arg) checked against the code's policy,
 * else the catalog default, else the template fallback. Breaches throw LegFail -> INV-LED-007 leg_missing / leg_mismatch.
 */
function leg(env: TemplateEnv, tpl: TemplateId, code: string, side: 'A' | 'B', given: number | undefined, fallback: number | null, sysEntity = false): number {
  const r = resolveLeg(code, side, given, sysEntity);
  if ('err' in r) throw new LegFail(invalidEntry(env, tpl, code, 'INV-LED-007', `${r.err} ${side} observed=${given ?? '-'}`, `expected=${r.expected}`));
  const a = r.acct ?? fallback;
  if (a === null) throw new LegFail(invalidEntry(env, tpl, code, 'INV-LED-007', `leg_missing ${side}`, 'a value leg'));
  return a;
}
function valueLeg(env: TemplateEnv, code: string, side: 'A' | 'B', o: PostOpts | undefined, fallback: number, tpl: TemplateId = 'PAY'): number {
  return leg(env, tpl, code, side, side === 'A' ? o?.valueLegA : o?.valueLegB, fallback);
}
/** MINT payee leg = catalog legA (T03-02 legend); legB is NONE for MINT rows, so a valueLegB override is rejected by legPolicy. */
function mintLeg(env: TemplateEnv, code: string, o: PostOpts | undefined): number {
  if (o?.valueLegB !== undefined) leg(env, 'MINT', code, 'B', o.valueLegB, null);
  return valueLeg(env, code, 'A', o, DEFAULT_LEG.mintIncome, 'MINT');
}
/** Wraps a template so a LegFail becomes its invalid entry. */
function guard<A extends unknown[]>(f: (...a: A) => Entry): (...a: A) => Entry {
  return (...a: A): Entry => { try { return f(...a); } catch (x) { if (x instanceof LegFail) return x.entry; throw x; } };
}

// ───────────── rail (T03-06) ─────────────
function moneyKey(e: LedgerEntity, ccy: Ccy): { key: string; holder: Id; code: 1001 | 1002 | 1003 } {
  const code = defaultMoneyCode(e.kind);
  return { key: accountKey(e.id, code, ccy, code === 1003 ? 'GENERAL' : undefined), holder: e.id, code };
}
function cbSide(holder: Id, code: 1001 | 1002 | 1003, ccy: Ccy): string {
  return accountKey(cbkId(ccy), cbMirrorCode(code), ccy, holder);
}
const isCb = (id: Id, ccy: Ccy): boolean => id === cbkId(ccy);

/** Paying sources: hold parts (fixed) first, then FIFO restricted lots when the code allows them, then the default account. */
export function payingSources(rail: RailState, payer: LedgerEntity, ccy: Ccy, amount: Money, restrictedOk: boolean,
  fixed?: readonly { accountKey: string; amount: Money }[]): { accountKey: string; amount: Money }[] {
  const out: { accountKey: string; amount: Money }[] = [];
  let left = amount;
  for (const f of fixed ?? []) { const a = f.amount < left ? f.amount : left; if (a > 0n) { out.push({ accountKey: f.accountKey, amount: a }); left -= a; } }
  if (restrictedOk && !fixed) for (const lot of rail.restrictedLots(payer.id, ccy)) {
    const s = rail.spendable(lot.accountKey); const a = s < left ? s : left;
    if (a > 0n) { out.push({ accountKey: lot.accountKey, amount: a }); left -= a; }
  }
  if (left > 0n) {
    const def = payer.payFrom.kind === 'BANK' ? accountKey(payer.id, 1010, ccy, payer.payFrom.bankId) : moneyKey(payer, ccy).key;
    out.push({ accountKey: def, amount: left }); // shortfall: the default account takes the remainder; INV-LED-008 decides at P13
  }
  return out;
}

/** Cash leg payer -> payee for `amount` (03 §3.3.4 rows). The payer-side cash posting comes first. */
export function cashLeg(rail: RailState, payer: LedgerEntity, payee: LedgerEntity, amount: Money, ccy: Ccy, reason: string,
  o: { restrictedOk: boolean; fixedSources?: readonly { accountKey: string; amount: Money }[]; payeeKey?: string; settlementOnly?: boolean }): Draft[] {
  const out: Draft[] = [];
  const sources = isCb(payer.id, ccy) ? [{ accountKey: '', amount }] : payingSources(rail, payer, ccy, amount, o.restrictedOk, o.fixedSources);
  for (const src of sources) {
    const a = src.amount;
    let fromHolder = payer.id; let fromKey = src.accountKey; let fromCode: 1001 | 1002 | 1003 = defaultMoneyCode(payer.kind);
    const srcDeposit = src.accountKey.split(':')[1] === '1010' ? src.accountKey.split(':')[2] : undefined;
    const payeeDepositBank = !o.payeeKey && !o.settlementOnly && payee.receiveInto.kind === 'BANK' ? payee.receiveInto.bankId : undefined;
    if (srcDeposit) {
      out.push(dr(accountKey(srcDeposit, 2100, ccy, payer.id), src.accountKey, a, ccy, reason));
      if (payeeDepositBank === srcDeposit) { out.push(dr(accountKey(payee.id, 1010, ccy, srcDeposit), accountKey(srcDeposit, 2100, ccy, payee.id), a, ccy, reason)); continue; }
      if (payee.id === srcDeposit) continue; // the bank collects from its own depositor: deposit extinguished (own-account flow)
      const bank = rail.entity(srcDeposit);
      fromHolder = srcDeposit; fromCode = 1002; fromKey = bank ? moneyKey(bank, ccy).key : accountKey(srcDeposit, 1002, ccy);
    } else if (src.accountKey.split(':')[1] === '1001') fromCode = 1001;
    let toHolder = payee.id; let toKey: string; let toCode: 1001 | 1002 | 1003;
    const tail: Draft[] = [];
    if (payeeDepositBank) {
      const bank = rail.entity(payeeDepositBank);
      toHolder = payeeDepositBank; toCode = 1002; toKey = bank ? moneyKey(bank, ccy).key : accountKey(payeeDepositBank, 1002, ccy);
      tail.push(dr(accountKey(payee.id, 1010, ccy, payeeDepositBank), accountKey(payeeDepositBank, 2100, ccy, payee.id), a, ccy, reason));
    } else { const m = moneyKey(payee, ccy); toKey = o.payeeKey ?? m.key; toCode = m.code; }
    if (toHolder !== fromHolder) {
      if (isCb(fromHolder, ccy)) out.push(dr(toKey, cbSide(toHolder, toCode, ccy), a, ccy, reason));
      else if (isCb(toHolder, ccy)) out.push(dr(cbSide(fromHolder, fromCode, ccy), fromKey, a, ccy, reason));
      else {
        out.push(dr(toKey, fromKey, a, ccy, reason));
        out.push(dr(cbSide(fromHolder, fromCode, ccy), cbSide(toHolder, toCode, ccy), a, ccy, reason));
      }
    }
    out.push(...tail);
  }
  return out;
}

// ───────────── entry assembly ─────────────
export function invalidEntry(env: TemplateEnv, tpl: TemplateId, code: string, invariantId: string, observed: string, expected: string): Entry {
  return { entryId: env.newEntryId(), tick: env.tick, template: tpl, reason: code, postings: [], requestedBy: env.requestedBy, invalid: { invariantId, observed, expected } };
}
/** catalog v2 `sector` column: an ELASTIC_IN/OUT code may only use its listed elastic sectors (PR #3 review F5). */
function sectorCheck(env: TemplateEnv, tpl: TemplateId, code: string, sector: Id | undefined): Entry | null {
  if (sector === undefined) return null;
  const allowed = env.catalog.get(code)?.elasticSectors ?? [];
  const k = sector.split('_')[0];
  return allowed.includes(k) ? null : invalidEntry(env, tpl, code, 'INV-LED-002', `sector ${k} for ${code}`, `one of ${allowed.join(',') || '(none)'}`);
}
/** Prologue checks (INV-LED-002 / -007 eagerly). Returns an invalid entry, or null when the request may be built. */
function prologue(env: TemplateEnv, tpl: TemplateId, code: string, amounts: readonly bigint[], ids: readonly Id[]): Entry | null {
  const alias = env.catalog.resolveAlias(code);
  if (alias) return invalidEntry(env, tpl, code, 'INV-LED-002', `alias=${code}`, `post the canonical code ${alias}`);
  const row = env.catalog.get(code);
  if (!row) return invalidEntry(env, tpl, code, 'INV-LED-002', `unknown code ${code}`, 'a registered reason code');
  if (!row.allowedTemplates.includes(tpl)) return invalidEntry(env, tpl, code, 'INV-LED-002', `template ${tpl}`, `one of ${row.allowedTemplates.join(',')}`);
  const mod = Number(env.requestedBy.module.slice(0, 2));
  if (!env.catalog.mayRequest(code, mod)) return invalidEntry(env, tpl, code, 'INV-LED-002', `module ${env.requestedBy.module}`, `owner ${row.owner}`);
  for (const a of amounts) if (typeof a !== 'bigint' || a <= 0n) return invalidEntry(env, tpl, code, 'INV-LED-007', `amount ${String(a)}`, '> 0n bigint');
  for (const id of ids) {
    const e = env.rail.entity(id);
    if (!e || (e.status === 'DISSOLVED' && code !== 'LED_DISSOLUTION'))
      return invalidEntry(env, tpl, code, 'INV-LED-026', `unknown_entity ${id}${e ? ' (DISSOLVED)' : ''}`, 'a registered, not dissolved entity (E-15.2)');
  }
  return null;
}
/** Marks flowLeg (Δ5): the given index, else the first posting of each (reason, ccy, legId) group. */
function finish(env: TemplateEnv, tpl: TemplateId, code: string, drafts: Draft[], o: PostOptsExt | undefined,
  headline: Entry['headline'], meta: Entry['meta'], flowIdx?: number): Entry {
  const entryId = env.newEntryId();
  const seen: Record<string, true> = {};
  const postings = drafts.map((d, i): Posting => {
    const p: Posting = { ...d, tick: env.tick, entryId, postingSeq: i, refs: [...(o?.refs ?? [])] };
    delete p.flowLeg;
    const leg = legKey(p);
    if (flowIdx === undefined ? !seen[leg] : i === flowIdx) p.flowLeg = true;
    seen[leg] = true;
    return p;
  });
  const e: Entry = { entryId, tick: env.tick, template: tpl, reason: code, postings, requestedBy: env.requestedBy, headline, meta };
  if (o?.holdId) e.holdId = o.holdId;
  return e;
}
/** An economic leg (spec §2.5 PD-5): postings of one reason code in one currency; payProRata parts carry their own legId. */
export const legKey = (p: Posting): string => `${p.reason}|${p.ccy}|${p.legOf?.legId ?? ''}`;

const ent = (env: TemplateEnv, id: Id): LedgerEntity => env.rail.entity(id) as LedgerEntity;
const rOk = (code: string): boolean => RESTRICTED_OK_CODES.includes(code);

// ───────────── G7 templates ─────────────
/** PAY. E-14: a payable/receivable leg (settlement pair) is allowed only with o.accrualId (settleAccrual) and is keyed by it. */
function tplPay_(env: TemplateEnv, from: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'PAY', code, [amt], [from, to]); if (bad) return bad;
  const A = valueLeg(env, code, 'A', o, DEFAULT_LEG.payerExpense); const B = valueLeg(env, code, 'B', o, DEFAULT_LEG.payeeIncome);
  if (!o?.accrualId && (ACCRUAL_LEGS.includes(A) || ACCRUAL_LEGS.includes(B))) return invalidEntry(env, 'PAY', code, 'INV-LED-007', `leg_mismatch ${A}/${B} without an accrual`, 'catalog legs (settlement pair only via settleAccrual)');
  const d = cashLeg(env.rail, ent(env, from), ent(env, to), amt, ccy, code, { restrictedOk: rOk(code), fixedSources: o?.fixedSources });
  const sub = (x: number): string | undefined => (ACCRUAL_LEGS.includes(x) ? o?.accrualId : undefined);
  d.push(dr(accountKey(from, A, ccy, sub(A)), accountKey(to, B, ccy, sub(B)), amt, ccy, code));
  return finish(env, 'PAY', code, d, o, { amount: amt, ccy, counterpartyId: to }, { parties: [from, to] });
}

/** SWAP_ASSET (E-11): A = buyer's account, B = seller's account per legPolicy; o.valueLegA/B (aliases assetAcct / assetAcctFrom). */
function tplSwapAsset_(env: TemplateEnv, buyer: Id, seller: Id, assetId: Id, qty: Qty, amt: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'SWAP_ASSET', code, [amt, qty], [buyer, seller]); if (bad) return bad;
  const A = leg(env, 'SWAP_ASSET', code, 'A', o?.valueLegA ?? o?.assetAcct, null);
  const B = leg(env, 'SWAP_ASSET', code, 'B', o?.valueLegB ?? o?.assetAcctFrom, null);
  const d = cashLeg(env.rail, ent(env, buyer), ent(env, seller), amt, ccy, code, { restrictedOk: rOk(code), fixedSources: o?.fixedSources });
  const bk = accountKey(buyer, A, ccy, assetId); const sk = accountKey(seller, B, ccy, assetId);
  // An issuer account on the seller side (code ≥ 2000): issuance, no book value or gain legs.
  const book = B >= 2000 ? amt : env.rail.bookValueOf(sk, qty);
  d.push(dr(bk, sk, book, ccy, code, { qty, assetId }));
  if (amt > book) d.push(dr(bk, accountKey(seller, 4060, ccy), amt - book, ccy, code)); // TODO(systems): 4090/5190 for non-financial assets
  if (amt < book) d.push(dr(accountKey(seller, 5160, ccy), bk, book - amt, ccy, code));
  return finish(env, 'SWAP_ASSET', code, d.filter((x) => x.amount !== 0n || x.qty !== undefined), o, { amount: amt, ccy, counterpartyId: seller }, { parties: [buyer, seller] });
}

function issue(env: TemplateEnv, tpl: 'MINT' | 'ELASTIC_IN', to: Id, amt: Money, ccy: Ccy, code: string, o: PostOptsExt | undefined, sector?: Id): Entry {
  const bad = prologue(env, tpl, code, [amt], sector ? [sector, to, cbkId(ccy), SYS_ID] : [to, cbkId(ccy), SYS_ID]) ?? sectorCheck(env, tpl, code, sector); if (bad) return bad;
  const tag = RESTRICTED_FAUCETS[code];
  const payeeKey = tag ? accountKey(to, 1001, ccy, restrictedSub(env.tick + RESTRICTED_WINDOW_TICKS, tag)) : undefined;
  const d = cashLeg(env.rail, ent(env, cbkId(ccy)), ent(env, to), amt, ccy, code, { restrictedOk: false, payeeKey });
  const flowIdx = d.length;
  d.push(dr(accountKey(cbkId(ccy), 1910, ccy), accountKey(SYS_ID, 2900, ccy), amt, ccy, code));
  if (sector) {
    d.push(dr(accountKey(SYS_ID, 2909, ccy, sector), accountKey(sector, 1009, ccy), amt, ccy, code));
    d.push(dr(accountKey(sector, valueLeg(env, code, 'A', o, DEFAULT_LEG.elasticExpense), ccy), accountKey(to, valueLeg(env, code, 'B', o, DEFAULT_LEG.payeeIncome), ccy), amt, ccy, code));
  } else d.push(dr(accountKey(SYS_ID, 5900, ccy, code), accountKey(to, mintLeg(env, code, o), ccy), amt, ccy, code));
  return finish(env, tpl, code, d, o, { amount: amt, ccy, counterpartyId: to }, { parties: sector ? [sector, to] : [to] }, flowIdx);
}
const tplMint_ = (env: TemplateEnv, to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry => issue(env, 'MINT', to, amt, ccy, code, o);
const tplElasticIn_ = (env: TemplateEnv, sector: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry =>
  issue(env, 'ELASTIC_IN', to, amt, ccy, code, o, sector);

function destroy(env: TemplateEnv, tpl: 'BURN' | 'ELASTIC_OUT', from: Id, amt: Money, ccy: Ccy, code: string, o: PostOptsExt | undefined, sector?: Id): Entry {
  const bad = prologue(env, tpl, code, [amt], sector ? [sector, from, cbkId(ccy), SYS_ID] : [from, cbkId(ccy), SYS_ID]) ?? sectorCheck(env, tpl, code, sector); if (bad) return bad;
  const d = cashLeg(env.rail, ent(env, from), ent(env, cbkId(ccy)), amt, ccy, code, { restrictedOk: rOk(code), fixedSources: o?.fixedSources });
  const flowIdx = d.length;
  d.push(dr(accountKey(SYS_ID, 2900, ccy), accountKey(cbkId(ccy), 1910, ccy), amt, ccy, code));
  if (sector) {
    d.push(dr(accountKey(sector, 1009, ccy), accountKey(SYS_ID, 2909, ccy, sector), amt, ccy, code));
    d.push(dr(accountKey(from, valueLeg(env, code, 'A', o, DEFAULT_LEG.elasticExpense), ccy), accountKey(sector, valueLeg(env, code, 'B', o, DEFAULT_LEG.payeeIncome), ccy), amt, ccy, code));
  } else d.push(dr(accountKey(from, valueLeg(env, code, 'A', o, DEFAULT_LEG.payerExpense), ccy), accountKey(SYS_ID, 4900, ccy, code), amt, ccy, code));
  return finish(env, tpl, code, d, o, { amount: amt, ccy }, { parties: sector ? [from, sector] : [from] }, flowIdx);
}
const tplBurn_ = (env: TemplateEnv, from: Id, amt: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry => destroy(env, 'BURN', from, amt, ccy, code, o);
const tplElasticOut_ = (env: TemplateEnv, from: Id, sector: Id, amt: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry =>
  destroy(env, 'ELASTIC_OUT', from, amt, ccy, code, o, sector);

/** Commercial credit: the deposit is created at the lending bank (03 §3.5.4). */
function tplLend_(env: TemplateEnv, bank: Id, borrower: Id, amt: Money, ccy: Ccy, code: string, loanId: Id, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'LEND', code, [amt], [bank, borrower]); if (bad) return bad;
  return finish(env, 'LEND', code, [
    dr(accountKey(borrower, 1010, ccy, bank), accountKey(bank, 2100, ccy, borrower), amt, ccy, code),
    dr(accountKey(bank, valueLeg(env, code, 'A', o, 1300), ccy, loanId), accountKey(borrower, valueLeg(env, code, 'B', o, 2200), ccy, loanId), amt, ccy, code),
  ], o, { amount: amt, ccy, counterpartyId: borrower }, { parties: [bank, borrower], borrowerId: borrower });
}
/** TODO(T03-06 rail): repayment is drawn from the borrower's deposit at the lending bank only. */
function tplRepay_(env: TemplateEnv, borrower: Id, bank: Id, principal: Money, ccy: Ccy, code: string, loanId: Id, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'REPAY', code, [principal], [bank, borrower]); if (bad) return bad;
  return finish(env, 'REPAY', code, [
    dr(accountKey(bank, 2100, ccy, borrower), accountKey(borrower, 1010, ccy, bank), principal, ccy, code),
    dr(accountKey(borrower, valueLeg(env, code, 'A', o, 2200), ccy, loanId), accountKey(bank, valueLeg(env, code, 'B', o, 1300), ccy, loanId), principal, ccy, code),
  ], o, { amount: principal, ccy, counterpartyId: bank }, { parties: [borrower, bank], borrowerId: borrower });
}

/** Central-bank credit: settlement cash or reserves are issued (ISSUE_CB); the cb takes a claim or the asset (03#7). */
function tplCbCredit_(env: TemplateEnv, cb: Id, cpty: Id, amt: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'CB_CREDIT', code, [amt], [cb, cpty]); if (bad) return bad;
  const d = cashLeg(env.rail, ent(env, cb), ent(env, cpty), amt, ccy, code, { restrictedOk: false, settlementOnly: true });
  if (o?.assetId && o.qty) {
    const acct = leg(env, 'CB_CREDIT', code, 'A', o.valueLegA ?? o.assetAcct, 1520); const sk = accountKey(cpty, acct, ccy, o.assetId); const ck = accountKey(cb, acct, ccy, o.assetId);
    const book = env.rail.bookValueOf(sk, o.qty);
    d.push(dr(ck, sk, book, ccy, code, { qty: o.qty, assetId: o.assetId }));
    if (amt > book) d.push(dr(ck, accountKey(cpty, 4060, ccy), amt - book, ccy, code));
    if (amt < book) d.push(dr(accountKey(cpty, 5160, ccy), ck, book - amt, ccy, code));
  } else d.push(dr(accountKey(cb, valueLeg(env, code, 'A', o, 1301), ccy, cpty), accountKey(cpty, valueLeg(env, code, 'B', o, 2201), ccy, cb), amt, ccy, code));
  return finish(env, 'CB_CREDIT', code, d.filter((x) => x.amount !== 0n || x.qty !== undefined), o, { amount: amt, ccy, counterpartyId: cpty }, { parties: [cb, cpty], borrowerId: cpty });
}
function tplCbCreditUnwind_(env: TemplateEnv, cpty: Id, cb: Id, amt: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'CB_CREDIT_UNWIND', code, [amt], [cb, cpty]); if (bad) return bad;
  const p = ent(env, cpty);
  const d = cashLeg(env.rail, { ...p, payFrom: { kind: 'CASH' } }, ent(env, cb), amt, ccy, code, { restrictedOk: false, fixedSources: o?.fixedSources });
  if (o?.assetId && o.qty) {
    const acct = leg(env, 'CB_CREDIT_UNWIND', code, 'A', o.valueLegA ?? o.assetAcct, 1520);
    d.push(dr(accountKey(cpty, acct, ccy, o.assetId), accountKey(cb, acct, ccy, o.assetId), amt, ccy, code, { qty: o.qty, assetId: o.assetId }));
  } else d.push(dr(accountKey(cpty, valueLeg(env, code, 'A', o, 2201), ccy, cb), accountKey(cb, valueLeg(env, code, 'B', o, 1301), ccy, cpty), amt, ccy, code));
  return finish(env, 'CB_CREDIT_UNWIND', code, d, o, { amount: amt, ccy, counterpartyId: cb }, { parties: [cpty, cb], borrowerId: cpty });
}

/**
 * Negative amounts swap sides (03 §8 edge 18), only for legpolicy negative_swap=Y codes. The legs are checked as passed (drAcct = A,
 * crAcct = B), before the swap (T03-07:76). LED_APPRAISAL: only the 4 card shapes, and a 3400 debit never takes the surplus below 0.
 */
function tplAccrue_(env: TemplateEnv, e: Id, amt: Money, ccy: Ccy, code: string, drAcct: number, crAcct: number, o?: PostOptsExt): Entry {
  const neg = amt < 0n; const a = neg ? -amt : amt;
  const bad = prologue(env, 'ACCRUE', code, [a], [e]); if (bad) return bad;
  const A = leg(env, 'ACCRUE', code, 'A', drAcct, drAcct); const B = leg(env, 'ACCRUE', code, 'B', crAcct, crAcct);
  if (neg && LEG_POLICY.get(code)?.negSwap === false) return invalidEntry(env, 'ACCRUE', code, 'INV-LED-007', `negative amount ${amt}`, 'negative_swap=Y code');
  const D = accountKey(e, A, ccy, o?.sub); const C = accountKey(e, B, ccy, o?.sub);
  const [d, c] = neg ? [C, D] : [D, C];
  if (code === 'LED_APPRAISAL') {
    const dc = Number(d.split(':')[1]); const cc = Number(c.split(':')[1]);
    if (!appraisalPairOk(dc, cc)) return invalidEntry(env, 'ACCRUE', code, 'INV-LED-007', `leg_mismatch pair ${dc}/${cc}`, 'asset/4070 | 5170/asset | asset/3400 | 3400/asset');
    const surplus = -env.rail.balance(accountKey(e, 3400, ccy, o?.sub)); // credit balance
    if (dc === 3400 && a > surplus) return invalidEntry(env, 'ACCRUE', code, 'INV-LED-007', `appr.surplus ${surplus} - ${a} < 0`, 'appr.surplus ≥ 0');
  }
  return finish(env, 'ACCRUE', code, [dr(d, c, a, ccy, code)], o, { amount: a, ccy }, { parties: [e] });
}
/** ACCRUE_PAIR: Dr a:A:<sub> / Cr a:income ; Dr b:expense / Cr b:B:<sub>. A, B per legPolicy (o.valueLegA/B); income/expense via o.memo-free defaults. */
function tplAccruePair_(env: TemplateEnv, a: Id, b: Id, amt: Money, ccy: Ccy, code: string, o?: PostOptsExt & { income?: number; expense?: number }): Entry {
  const bad = prologue(env, 'ACCRUE_PAIR', code, [amt], [a, b]); if (bad) return bad;
  const A = leg(env, 'ACCRUE_PAIR', code, 'A', o?.valueLegA, null); const B = leg(env, 'ACCRUE_PAIR', code, 'B', o?.valueLegB, null);
  const sub = o?.accrualId ?? o?.sub;
  return finish(env, 'ACCRUE_PAIR', code, [
    dr(accountKey(a, A, ccy, sub ?? b), accountKey(a, o?.income ?? DEFAULT_LEG.payeeIncome, ccy), amt, ccy, code),
    dr(accountKey(b, o?.expense ?? DEFAULT_LEG.payerExpense, ccy), accountKey(b, B, ccy, sub ?? a), amt, ccy, code),
  ], o, { amount: amt, ccy, counterpartyId: b }, { parties: [a, b] });
}
/** a pays amt1 of ccy1 to b; b pays amt2 of ccy2 to a; each entity balances per currency through 3800 (03#8). */
function tplFx_(env: TemplateEnv, a: Id, b: Id, ccy1: Ccy, amt1: Money, ccy2: Ccy, amt2: Money, code: string, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'FX', code, [amt1, amt2], [a, b]); if (bad) return bad;
  const A = ent(env, a); const B = ent(env, b);
  const d = [
    ...cashLeg(env.rail, A, B, amt1, ccy1, code, { restrictedOk: rOk(code) }),
    dr(accountKey(a, 3800, ccy1), accountKey(b, 3800, ccy1), amt1, ccy1, code),
    ...cashLeg(env.rail, B, A, amt2, ccy2, code, { restrictedOk: rOk(code) }),
    dr(accountKey(b, 3800, ccy2), accountKey(a, 3800, ccy2), amt2, ccy2, code),
  ];
  return finish(env, 'FX', code, d, o, { amount: amt1, ccy: ccy1, counterpartyId: b }, { parties: [a, b] });
}
/** TODO(systems): value legs per code; defaults to 5000 / 4000 at book value. */
function tplMoveQty_(env: TemplateEnv, from: Id, to: Id, assetId: Id, qty: Qty, bookValue: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'MOVE_QTY', code, [qty, bookValue], [from, to]); if (bad) return bad;
  const acct = o?.assetAcct ?? 1500;
  return finish(env, 'MOVE_QTY', code, [
    dr(accountKey(to, acct, ccy, assetId), accountKey(from, acct, ccy, assetId), bookValue, ccy, code, { qty, assetId }),
    dr(accountKey(from, valueLeg(env, code, 'A', o, DEFAULT_LEG.payerExpense), ccy), accountKey(to, valueLeg(env, code, 'B', o, DEFAULT_LEG.payeeIncome), ccy), bookValue, ccy, code),
  ], o, { amount: bookValue, ccy, counterpartyId: to }, { parties: [from, to] });
}
/** E-11: toAcct (debit) = leg A, fromAcct (credit) = leg B. NONE rows (EQ_SPLIT, LED_DISSOLUTION): the positional args are the qty
 *  accounts, not value legs; any valueLegA/B override is rejected. */
function tplReclass_(env: TemplateEnv, e: Id, amt: Money, ccy: Ccy, code: string, fromAcct: number, toAcct: number, o?: PostOptsExt): Entry {
  const none = LEG_POLICY.get(code)?.A.policy === 'NONE';
  const sys = e === SYS_ID;
  const A = leg(env, 'RECLASS', code, 'A', none ? o?.valueLegA : toAcct, toAcct, sys);
  const B = leg(env, 'RECLASS', code, 'B', none ? o?.valueLegB : fromAcct, fromAcct, sys);
  return reclassKeys(env, code, accountKey(e, B, ccy, o?.sub), accountKey(e, A, ccy), amt, ccy, o);
}
/** RECLASS between two keys of one entity (used for restricted-lot release: RESTRICTED sub -> 1001). */
export function reclassKeys(env: TemplateEnv, code: string, fromKey: string, toKey: string, amt: Money, ccy: Ccy, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'RECLASS', code, [amt], [fromKey.split(':')[0]]); if (bad) return bad;
  return finish(env, 'RECLASS', code, [dr(toKey, fromKey, amt, ccy, code)], o, { amount: amt, ccy }, { parties: [fromKey.split(':')[0]] });
}

/** One entry; postings renumbered; every leg keeps its own reason (PD-5). Invalid if any part is invalid. */
export function composeEntries(_env: TemplateEnv, primary: Entry, supporting: readonly Entry[]): Entry {
  const bad = [primary, ...supporting].find((e) => e.invalid);
  if (bad) return { ...primary, postings: [], invalid: bad.invalid };
  const esc = supporting.find((e) => ESCROW_ONLY_CODES.includes(e.reason)); // E-12 layer 1: never a supporting leg
  if (esc) return { ...primary, postings: [], invalid: { invariantId: 'INV-LED-002', observed: `supporting leg ${esc.reason}`, expected: 'escrow-only codes post via escrowPlace only' } };
  const postings = [primary, ...supporting].flatMap((e) => e.postings)
    .map((p, i) => ({ ...p, entryId: primary.entryId, postingSeq: i }));
  const parties = [primary, ...supporting].flatMap((e) => e.meta?.parties ?? []).filter((x, i, a) => a.indexOf(x) === i);
  return { ...primary, postings, meta: { ...primary.meta, parties } };
}

/** Pro-rata split (T03-07 :67): one entry, allocate() inside, zero parts skipped, payer pays exactly total (E4). */
function payProRata_(env: TemplateEnv, payer: Id, holders: SortedMap<Id, bigint>, total: Money, ccy: Ccy, code: string, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'PAY', code, [total], [payer, ...holders.keys()]); if (bad) return bad;
  const parts = allocate(total, holders);
  const d: Draft[] = [];
  for (const [h, amt] of parts) {
    if (amt === 0n) continue;
    const legOf = { legId: h, side: 'A' as const };
    for (const x of cashLeg(env.rail, ent(env, payer), ent(env, h), amt, ccy, code, { restrictedOk: rOk(code) })) d.push({ ...x, legOf });
    d.push(dr(accountKey(payer, valueLeg(env, code, 'A', o, DEFAULT_LEG.payerExpense), ccy), accountKey(h, valueLeg(env, code, 'B', o, DEFAULT_LEG.payeeIncome), ccy), amt, ccy, code, { legOf }));
  }
  return finish(env, 'PAY', code, d, o, { amount: total, ccy }, { parties: [payer, ...holders.keys()] });
}

/** T03-12 / spec §6.5: 72 real hours of 5 s ticks. */
export const RESTRICTED_WINDOW_TICKS = 51_840;
/** Seller book value of qty: balance × qty / accountQty, half-even (T03-07 TemplateEnv.bookValueOf). */
export function bookValue(balance: Money, accountQty: Qty, qty: Qty): Money {
  return accountQty === 0n ? 0n : divRoundHalfEven(balance * qty, accountQty);
}

/** I2 (T03-06): every entity nets to 0n per currency over non-MEMO accounts. */
export function isBalancedPerEntity(postings: readonly { debitAccount: string; creditAccount: string; amount: Money; ccy: Ccy }[]): boolean {
  const net = new SortedMap<string, Money>();
  for (const p of postings) for (const [k, d] of [[p.debitAccount, p.amount], [p.creditAccount, -p.amount]] as const) {
    if (k.split(':')[1].startsWith('9')) continue;
    const key = `${k.split(':')[0]}|${p.ccy}`;
    net.set(key, (net.get(key) ?? 0n) + d);
  }
  return net.values().every((v) => v === 0n);
}

// Public templates: LegFail (legPolicy breach) becomes the invalid entry.
export const tplPay = guard(tplPay_); export const tplSwapAsset = guard(tplSwapAsset_);
export const tplMint = guard(tplMint_); export const tplElasticIn = guard(tplElasticIn_);
export const tplBurn = guard(tplBurn_); export const tplElasticOut = guard(tplElasticOut_);
export const tplLend = guard(tplLend_); export const tplRepay = guard(tplRepay_);
export const tplCbCredit = guard(tplCbCredit_); export const tplCbCreditUnwind = guard(tplCbCreditUnwind_);
export const tplAccrue = guard(tplAccrue_); export const tplAccruePair = guard(tplAccruePair_);
export const tplFx = guard(tplFx_); export const tplMoveQty = guard(tplMoveQty_);
export const tplReclass = guard(tplReclass_); export const payProRata = guard(payProRata_);

// ───────────── Δ14 conflict escrow (spec §6.11; errata E-5, E-10, E-12) ─────────────
/** 7 real days × 17,280 ticks per real day (§6.5, OD-4). */
export const CONFLICT_ESCROW_TICKS = 120_960;
/** The court entity that holds conflict escrows (TODO(unit-13): the real court id). */
export const ESCROW_COURT = 'crt_COURT';
export const escrowKey = (escrowId: Id, ccy: Ccy): string => accountKey(ESCROW_COURT, 1001, ccy, `ESCROW:${escrowId}`);
/** escrowPlace: rail victim -> crt:1001:ESCROW:<id>; Dr victim:1070:<id> / Cr crt:2160:<id> (E-10 legs). E-12 layer 4: an op ref is required. */
export function tplEscrowPlace(env: TemplateEnv, victim: Id, attacker: Id, amt: Money, ccy: Ccy, code: string, escrowId: Id, opId: Id | undefined, o?: PostOptsExt): Entry {
  const bad = prologue(env, 'ESCROW_PLACE', code, [amt], [victim, attacker, ESCROW_COURT]); if (bad) return bad;
  if (!opId) return invalidEntry(env, 'ESCROW_PLACE', code, 'INV-LED-002', `${code} without an op ref`, 'a SEALED ops.loot_posted / C03 op id (E-12 layer 4)');
  const A = leg(env, 'ESCROW_PLACE', code, 'A', o?.valueLegA, 1070); const B = leg(env, 'ESCROW_PLACE', code, 'B', o?.valueLegB, 2160);
  const d = cashLeg(env.rail, ent(env, victim), ent(env, ESCROW_COURT), amt, ccy, code, { restrictedOk: false, payeeKey: escrowKey(escrowId, ccy) });
  d.push(dr(accountKey(victim, A, ccy, escrowId), accountKey(ESCROW_COURT, B, ccy, escrowId), amt, ccy, code));
  const row: ConflictEscrow = { escrowId, victimId: victim, attackerId: attacker, opId, code, ccy, amount: amt, placedTick: env.tick,
    expiresTick: env.tick + CONFLICT_ESCROW_TICKS, caseId: null, status: 'HELD' };
  return finish(env, 'ESCROW_PLACE', code, d, { ...o, refs: [...(o?.refs ?? []), opId, escrowId] }, { amount: amt, ccy, counterpartyId: ESCROW_COURT },
    { parties: [victim, attacker], escrow: { op: 'PLACE', row } });
}
/**
 * escrowSettle: release toAttacker (ESCROW_CONFLICT_RELEASE: the P&L legs of the original code, victim Dr legA / Cr 1070, attacker
 * Cr 4190 per E-10) and claw back toVictim (ESCROW_CONFLICT_CLAWBACK: 1070 against the victim's cash, no P&L). Sum = the escrowed amount.
 */
export function tplEscrowSettle(env: TemplateEnv, row: ConflictEscrow, toAttacker: Money, toVictim: Money, o?: PostOptsExt): Entry {
  const code = toAttacker > 0n ? 'ESCROW_CONFLICT_RELEASE' : 'ESCROW_CONFLICT_CLAWBACK';
  const bad = prologue(env, 'ESCROW_SETTLE', code, [toAttacker + toVictim], [row.victimId, row.attackerId, ESCROW_COURT]); if (bad) return bad;
  if (toAttacker < 0n || toVictim < 0n || toAttacker + toVictim !== row.amount || row.status !== 'HELD')
    return invalidEntry(env, 'ESCROW_SETTLE', code, 'INV-LED-007', `settle ${toAttacker}+${toVictim} of ${row.escrowId} (${row.status})`, `HELD, parts sum to ${row.amount}`);
  const { ccy, escrowId } = row; const court = ent(env, ESCROW_COURT); const fixed = (a: Money) => [{ accountKey: escrowKey(escrowId, ccy), amount: a }];
  const d: Draft[] = [];
  const pnl = row.code === 'CONFLICT_CASH_LOOT' ? 5140 : 5230; // E-10 note: the OPS_LOOT_CASH / OPS_RANSOM P&L legs move to release
  if (toAttacker > 0n) {
    const c = 'ESCROW_CONFLICT_RELEASE';
    d.push(...cashLeg(env.rail, court, ent(env, row.attackerId), toAttacker, ccy, c, { restrictedOk: false, fixedSources: fixed(toAttacker), settlementOnly: true }));
    d.push(dr(accountKey(ESCROW_COURT, 2160, ccy, escrowId), accountKey(row.attackerId, 4190, ccy), toAttacker, ccy, c));
    d.push(dr(accountKey(row.victimId, pnl, ccy), accountKey(row.victimId, 1070, ccy, escrowId), toAttacker, ccy, c));
  }
  if (toVictim > 0n) {
    const c = 'ESCROW_CONFLICT_CLAWBACK';
    d.push(...cashLeg(env.rail, court, ent(env, row.victimId), toVictim, ccy, c, { restrictedOk: false, fixedSources: fixed(toVictim), settlementOnly: true }));
    d.push(dr(accountKey(ESCROW_COURT, 2160, ccy, escrowId), accountKey(row.victimId, 1070, ccy, escrowId), toVictim, ccy, c));
  }
  return finish(env, 'ESCROW_SETTLE', code, d, { ...o, refs: [...(o?.refs ?? []), row.opId, escrowId] }, { amount: row.amount, ccy },
    { parties: [row.victimId, row.attackerId], escrow: { op: 'SETTLE', escrowId, toAttacker, toVictim } });
}
/** Δ9/Δ13 CONTROL_RECLASS MEMO entry: Dr sys:9811:<e> / Cr sys:9812:<e> (LED_CONTROL_IN, LED_HOLDER_RECLASS), mirrored for LED_CONTROL_OUT. */
export function tplControl(env: TemplateEnv, code: 'LED_CONTROL_IN' | 'LED_CONTROL_OUT' | 'LED_HOLDER_RECLASS', e: Id, amt: Money, ccy: Ccy, refs: Id[]): Entry {
  const a = accountKey(SYS_ID, 9811, ccy, e); const b = accountKey(SYS_ID, 9812, ccy, e);
  return finish(env, 'CONTROL_RECLASS', code, [code === 'LED_CONTROL_OUT' ? dr(b, a, amt, ccy, code) : dr(a, b, amt, ccy, code)], { refs }, { amount: amt, ccy }, { parties: [e] });
}
