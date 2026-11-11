import { BANK_FUNDING_POLICY } from "./funding-policy";
import { cmpStr } from "../../../packages/engine/core/order";
import type { Money } from "../../../packages/engine/core/types";
import { bankFingerprint, bankTick, bankWire, decodeFrames, decodeGenesis, record, strictJson } from "./input";
import type { BankCheckpointStore, BankCommand, BankingFrame, BankingGenesis, BankingState, BankState, BankDeposit, HourlyBankMarket, BusinessLoan } from "./model";
const PPM = BigInt(1_000_000), ZERO = BigInt(0);
const max0 = (n: bigint): bigint => n > ZERO ? n : ZERO;
const min = (...ns: bigint[]): bigint => ns.reduce((a, b) => a < b ? a : b);
function bankHalfEven(n: bigint, denominator: bigint): bigint {
  const q = n / denominator, r = n % denominator;
  return q + (BigInt(2) * r > denominator || (BigInt(2) * r === denominator && q % BigInt(2) !== ZERO) ? BigInt(1) : ZERO);
}
const interest = (cash: Money, ratePpm: number): Money => bankHalfEven(cash * BigInt(ratePpm), BigInt(364) * PPM);
const tie = (id: string, tick: number): string => bankFingerprint({ id, tick });
const depositTotal = (s: BankingState, bankId?: string): Money => s.deposits.filter((d) => bankId === undefined || d.bankId === bankId).reduce((n, d) => n + d.cash, ZERO);
/** Outside settlement cash plus actual bank reserve assets, never deposit liabilities. */
export function bankingCashTotal(s: BankingState): Money { return [...s.banks, ...s.clients].reduce((n, a) => n + a.cash, ZERO); }
export function bankingDepositMoney(s: BankingState): Money { return s.clients.reduce((n, a) => n + a.cash, depositTotal(s)); }
export function bankingReserves(s: BankingState, bankId: string): Money { const b = s.banks.find((b) => b.id === bankId); if (!b) throw new Error("BANK_UNKNOWN"); return b.cash; }
function initial(g: BankingGenesis): BankingState {
  return { world: g.world, ccy: g.ccy, tick: -1, banks: g.banks.map((b) => ({ ...b, equity: b.cash })), clients: structuredClone(g.clients), businessLoans: [], deposits: [], loans: [], receipts: [], movements: [], settlements: [], hours: [], fixings: [] };
}
const bank = (s: BankingState, id: string) => s.banks.find((b) => b.id === id)!;
const account = (s: BankingState, id: string) => s.deposits.find((d) => d.id === id)!;
function reserveTransfer(s: BankingState, from: BankState, to: BankState, amount: Money, kind: "INTERBANK_DRAW" | "INTERBANK_PRINCIPAL" | "INTERBANK_INTEREST"): void {
  if (amount < ZERO || from.cash < amount) throw new Error("BANK_UNFUNDED");
  if (amount === ZERO) return;
  from.cash -= amount; to.cash += amount;
  s.movements.push({ tick: s.tick, fromBank: from.id, toBank: to.id, amount, kind });
}
function repay(s: BankingState, loan: BusinessLoan, budget: Money): void {
  const d = account(s, loan.depositId), b = bank(s, loan.lenderId);
  let available = min(d.cash, budget);
  const paidInterest = min(available, loan.accrued);
  if (paidInterest > ZERO) {
    d.cash -= paidInterest; loan.accrued -= paidInterest; b.equity += paidInterest; available -= paidInterest;
    s.movements.push({ tick: s.tick, kind: "LOAN_INTEREST", loanId: loan.id, depositId: d.id, bankId: b.id, amount: paidInterest });
  }
  const paidPrincipal = min(available, loan.principal);
  if (paidPrincipal > ZERO) {
    d.cash -= paidPrincipal; loan.principal -= paidPrincipal;
    s.movements.push({ tick: s.tick, kind: "CREDIT_DESTROY", loanId: loan.id, depositId: d.id, bankId: b.id, amount: paidPrincipal });
  }
  if (loan.principal === ZERO && loan.accrued === ZERO) loan.status = "REPAID";
}
function execute(s: BankingState, c: BankCommand): void {
  const fingerprint = bankFingerprint(c), old = s.receipts.find((r) => r.id === c.id);
  if (old) { if (old.fingerprint !== fingerprint) throw new Error("BANK_COMMAND_CONFLICT"); return; }
  const actor = s.clients.find((a) => a.id === c.actor);
  let reason: string | null = null;
  if (c.kind === "LEND") {
    const lender = s.banks.find((b) => b.id === c.actor), d = s.deposits.find((d) => d.id === c.depositId);
    if (!lender || !lender.enabled || lender.equity <= ZERO) reason = "LENDER_INACTIVE";
    else if (!d || d.bankId !== lender.id) reason = "UNKNOWN_DEPOSIT";
    else if (s.clients.find((a) => a.id === d.holderId)?.kind !== "BUSINESS") reason = "CONSUMER_OUT_OF_SCOPE";
    else if (c.maturityTick <= s.tick) reason = "MATURITY";
    else {
      s.businessLoans.push({ id: c.id, lenderId: lender.id, depositId: d.id, principal: c.amount, accrued: ZERO, ratePpm: c.ratePpm, originatedTick: s.tick, maturityTick: c.maturityTick, status: "OPEN" });
      d.cash += c.amount;
      s.movements.push({ tick: s.tick, kind: "CREDIT_CREATE", loanId: c.id, depositId: d.id, bankId: lender.id, amount: c.amount });
    }
  } else if (c.kind === "WRITE_OFF") {
    const loan = s.businessLoans.find((l) => l.id === c.loanId);
    if (!loan || loan.lenderId !== c.actor) reason = "NOT_LENDER";
    else if (loan.status !== "OVERDUE") reason = "NOT_OVERDUE";
    else if (account(s, loan.depositId).cash !== ZERO) reason = "UNAPPLIED_FUNDS";
    else {
      const amount = loan.principal;
      bank(s, loan.lenderId).equity -= amount;
      loan.principal = ZERO; loan.accrued = ZERO; loan.status = "WRITTEN_OFF";
      if (amount > ZERO) s.movements.push({ tick: s.tick, kind: "CREDIT_CHARGEOFF", loanId: loan.id, bankId: loan.lenderId, amount });
    }
  } else if (!actor) reason = "UNKNOWN_ACTOR";
  else if (c.kind === "REPAY") {
    const loan = s.businessLoans.find((l) => l.id === c.loanId);
    if (!loan || account(s, loan.depositId).holderId !== actor.id) reason = "NOT_OWNER";
    else if (loan.status === "WRITTEN_OFF" || loan.status === "REPAID") reason = "CLOSED_LOAN";
    else if (account(s, loan.depositId).cash < c.amount) reason = "FUNDS";
    else repay(s, loan, c.amount);
  } else if (c.kind === "OPEN") {
    if (!s.banks.some((b) => b.id === c.bankId)) reason = "UNKNOWN_BANK";
    else if (!actor.presence.includes(c.bankId)) reason = "NO_PRESENCE";
    else if (s.deposits.some((d) => d.id === c.depositId)) reason = "DEPOSIT_EXISTS";
    else s.deposits.push({ id: c.depositId, bankId: c.bankId, holderId: c.actor, product: c.product, cash: ZERO, interestDue: ZERO });
  } else if (c.kind === "MOVE") {
    const from = s.deposits.find((d) => d.id === c.from), to = s.deposits.find((d) => d.id === c.to);
    if (!from || !to) reason = "UNKNOWN_DEPOSIT";
    else if (from.holderId !== actor.id || to.holderId !== actor.id) reason = "NOT_OWNER";
    else if (from.id === to.id) reason = "SAME_DEPOSIT";
    else if (from.cash < c.amount) reason = "FUNDS";
    else if (from.bankId !== to.bankId && bank(s, from.bankId).cash < c.amount) reason = "RESERVES";
    else {
      from.cash -= c.amount; to.cash += c.amount;
      if (from.bankId !== to.bankId) { bank(s, from.bankId).cash -= c.amount; bank(s, to.bankId).cash += c.amount; }
      s.movements.push({ tick: s.tick, kind: "MOVE", fromDeposit: from.id, toDeposit: to.id, amount: c.amount });
    }
  } else {
    const d = s.deposits.find((d) => d.id === c.depositId);
    if (!d) reason = "UNKNOWN_DEPOSIT";
    else if (d.holderId !== actor.id) reason = "NOT_OWNER";
    else if (c.kind === "DEPOSIT" && actor.cash < c.amount) reason = "FUNDS";
    else if (c.kind === "WITHDRAW" && d.cash < c.amount) reason = "FUNDS";
    else if (c.kind === "WITHDRAW" && bank(s, d.bankId).cash < c.amount) reason = "RESERVES";
    else {
      const delta = c.kind === "DEPOSIT" ? c.amount : -c.amount;
      actor.cash -= delta; bank(s, d.bankId).cash += delta; d.cash += delta;
      s.movements.push({ tick: s.tick, kind: c.kind, clientId: actor.id, bankId: d.bankId, depositId: d.id, amount: c.amount });
    }
  }
  s.receipts.push({ id: c.id, fingerprint, tick: s.tick, accepted: reason === null, reason });
}
function quote(s: BankingState, d: BankDeposit): number { const b = bank(s, d.bankId); return d.product === "SIGHT" ? b.sightRatePpm : b.savingsRatePpm; }
function dayClose(s: BankingState): void {
  for (const loan of s.businessLoans) {
    if (loan.status === "REPAID" || loan.status === "WRITTEN_OFF") continue;
    loan.accrued += interest(loan.principal, loan.ratePpm);
    if (loan.maturityTick <= s.tick) { repay(s, loan, account(s, loan.depositId).cash); if (loan.principal > ZERO || loan.accrued > ZERO) loan.status = "OVERDUE"; }
  }
  for (const loan of s.loans) if (loan.status !== "REPAID") loan.accrued += interest(loan.principal, loan.ratePpm);
  for (const loan of [...s.loans].sort((a, b) => cmpStr(tie(a.id, s.tick), tie(b.id, s.tick)))) {
    if (loan.status === "REPAID" || loan.maturityTick > s.tick) continue;
    const borrower = bank(s, loan.borrowerId), lender = bank(s, loan.lenderId);
    const interestPaid = min(borrower.cash, loan.accrued);
    reserveTransfer(s, borrower, lender, interestPaid, "INTERBANK_INTEREST"); loan.accrued -= interestPaid;
    borrower.equity -= interestPaid; lender.equity += interestPaid;
    const principalPaid = min(borrower.cash, loan.principal);
    reserveTransfer(s, borrower, lender, principalPaid, "INTERBANK_PRINCIPAL"); loan.principal -= principalPaid;
    loan.status = loan.principal === ZERO && loan.accrued === ZERO ? "REPAID" : "OVERDUE";
  }
  for (const d of s.deposits) d.interestDue += interest(d.cash, quote(s, d));
  for (const d of [...s.deposits].sort((a, b) => cmpStr(tie(a.id, s.tick), tie(b.id, s.tick)))) {
    const b = bank(s, d.bankId), paid = min(max0(b.equity), d.interestDue);
    if (paid > ZERO) { b.equity -= paid; d.cash += paid; d.interestDue -= paid; s.movements.push({ tick: s.tick, kind: "DEPOSIT_INTEREST", bankId: b.id, depositId: d.id, amount: paid }); }
  }
}
function obligations(s: BankingState, b: BankState): { incoming: Money; outgoing: Money; depositsDue: Money } {
  const close = Math.floor(s.tick / 720) * 720 + 719, beforeClose = s.tick % 720 !== 719;
  let incoming = ZERO, outgoing = ZERO, depositsDue = ZERO;
  for (const l of s.loans) if (l.status !== "REPAID" && l.maturityTick <= close) {
    const due = l.principal + l.accrued + (beforeClose ? interest(l.principal, l.ratePpm) : ZERO);
    if (l.lenderId === b.id) incoming += due;
    if (l.borrowerId === b.id) outgoing += due;
  }
  for (const d of s.deposits) if (d.bankId === b.id) depositsDue += d.interestDue + (beforeClose ? interest(d.cash, quote(s, d)) : ZERO);
  return { incoming, outgoing, depositsDue: min(max0(b.equity), depositsDue) };
}
function gap(s: BankingState, b: BankState): Money { return BANK_FUNDING_POLICY.projectedGap({ reserves: b.cash, deposits: depositTotal(s, b.id), ...obligations(s, b) }); }
function bookEquity(s: BankingState, b: BankState): Money {
  let equity = b.equity - s.deposits.filter((d) => d.bankId === b.id).reduce((n, d) => n + d.interestDue, ZERO);
  for (const l of s.loans) { if (l.lenderId === b.id) equity += l.accrued; if (l.borrowerId === b.id) equity -= l.accrued; }
  for (const l of s.businessLoans) if (l.lenderId === b.id) equity += l.accrued;
  return equity;
}
const tier1 = (s: BankingState, b: BankState): Money => max0(bookEquity(s, b));
function hourly(s: BankingState, m: HourlyBankMarket): void {
  let volume = ZERO;
  const borrowers = s.banks.filter((b) => b.enabled && gap(s, b) < ZERO).sort((a, b) => cmpStr(tie(a.id, s.tick), tie(b.id, s.tick)));
  for (const borrower of borrowers) {
    const pd = BigInt(m.risks.find((r) => r.bankId === borrower.id)!.pdPpm);
    const offers = s.banks.filter((b) => b.enabled && b.id !== borrower.id).map((lender) => {
      const tolerance = BigInt(lender.tolerancePpm) * (BigInt(2) * PPM - BigInt(m.fearPpm));
      const ratePpm = m.dfrPpm + 500 + Number(bankHalfEven(pd * BigInt(600_000) * (PPM + BigInt(2) * BigInt(m.fearPpm)), PPM * PPM));
      return { lender, tolerance, ratePpm };
    }).filter((o) => o.tolerance > ZERO && pd * BigInt(2) * PPM <= o.tolerance && o.ratePpm <= m.mlfrPpm - 100)
      .sort((a, b) => a.ratePpm - b.ratePpm || cmpStr(tie(a.lender.id, s.tick), tie(b.lender.id, s.tick)));
    for (const { lender, tolerance, ratePpm } of offers) {
      const exposure = s.loans.filter((l) => l.lenderId === lender.id && l.borrowerId === borrower.id).reduce((n, l) => n + l.principal + l.accrued, ZERO);
      const limit = tier1(s, lender) * (tolerance - pd * BigInt(2) * PPM) / (BigInt(10) * tolerance) - exposure;
      const amount = min(max0(-gap(s, borrower)), max0(gap(s, lender)), max0(limit), BANK_FUNDING_POLICY.lendableReserves({ reserves: lender.cash, ...obligations(s, lender) }));
      if (amount === ZERO) continue;
      reserveTransfer(s, lender, borrower, amount, "INTERBANK_DRAW"); volume += amount;
      s.loans.push({ id: bankFingerprint({ tick: s.tick, lenderId: lender.id, borrowerId: borrower.id }), lenderId: lender.id, borrowerId: borrower.id, funded: amount, principal: amount, accrued: ZERO, ratePpm, originatedTick: s.tick, maturityTick: (Math.floor(s.tick / 720) + 1) * 720 + 719, status: "OPEN" });
    }
  }
  s.hours.push({ tick: s.tick, volume, gaps: s.banks.map((b) => ({ bankId: b.id, gap: gap(s, b) })) });
}
function fixing(s: BankingState, g: BankingGenesis, m: HourlyBankMarket): void {
  const loans = s.loans.filter((l) => Math.floor(l.originatedTick / 720) === Math.floor(s.tick / 720)), volume = loans.reduce((n, l) => n + l.funded, ZERO);
  const previous = s.fixings.at(-1), fallback = volume === ZERO || volume * BigInt(10_000) < depositTotal(s);
  const ratePpm = fallback ? m.policyPpm + (previous?.ratePpm ?? g.initialOnrPpm) - (previous?.policyPpm ?? g.initialPolicyPpm)
    : Number(bankHalfEven(loans.reduce((n, l) => n + l.funded * BigInt(l.ratePpm), ZERO), volume));
  s.fixings.push({ tick: s.tick, ratePpm, policyPpm: m.policyPpm, volume, fallback });
}
export function assertBankAccounting(s: BankingState): void {
  for (const b of s.banks) {
    const assets = b.cash + s.businessLoans.filter((l) => l.lenderId === b.id).reduce((n, l) => n + l.principal + l.accrued, ZERO) + s.loans.filter((l) => l.lenderId === b.id).reduce((n, l) => n + l.principal + l.accrued, ZERO);
    const liabilities = depositTotal(s, b.id) + bookEquity(s, b) + s.deposits.filter((d) => d.bankId === b.id).reduce((n, d) => n + d.interestDue, ZERO) + s.loans.filter((l) => l.borrowerId === b.id).reduce((n, l) => n + l.principal + l.accrued, ZERO);
    if (assets !== liabilities) throw new Error("BANK_BALANCE_SHEET");
  }
  if ([...s.banks, ...s.clients, ...s.deposits].some((b) => b.cash < ZERO)) throw new Error("BANK_NEGATIVE_MONEY");
}
function evolve(g: BankingGenesis, before: BankingState, frames: BankingFrame[], target: number): BankingState {
  let prior = before.tick;
  for (const f of frames) { if (f.tick <= prior || f.tick > target) throw new Error("BANK_FRAME_ORDER"); prior = f.tick; }
  const hoursRequired = Math.floor((target + 1) / 30) - Math.floor((before.tick + 1) / 30);
  if (frames.filter((f) => f.market !== null).length !== hoursRequired) throw new Error("BANK_MISSING_HOUR");
  const s = structuredClone(before), base = bankingCashTotal(before);
  for (const f of frames) {
    s.tick = f.tick; const firstMove = s.movements.length;
    const reservesBefore = new Map(s.banks.map((b) => [b.id, b.cash])), clientsBefore = s.clients.reduce((n, c) => n + c.cash, ZERO);
    for (const c of f.commands) execute(s, c);
    if (f.tick % 720 === 719) dayClose(s);
    if (f.market) hourly(s, f.market);
    if (f.tick % 720 === 719) fixing(s, g, f.market!);
    if (s.movements.length > firstMove) s.settlements.push({ tick: f.tick, banks: s.banks.map((b) => ({ bankId: b.id, delta: b.cash - reservesBefore.get(b.id)! })), externalDelta: s.clients.reduce((n, c) => n + c.cash, ZERO) - clientsBefore });
    assertBankAccounting(s);
    if (bankingCashTotal(s) !== base) throw new Error("BANK_BASE_MONEY_CREATION");
  }
  s.tick = target; return s;
}
function checkpoint(g: BankingGenesis, frames: BankingFrame[], state: BankingState): unknown { return bankWire({ version: 2, genesis: g, frames, targetTick: state.tick, digest: bankFingerprint({ genesis: g, frames, state }) }); }
export class BankingEngine {
  private tail: Promise<void> = Promise.resolve();
  private constructor(private readonly store: BankCheckpointStore, private readonly genesis: BankingGenesis, private state: BankingState, private frames: BankingFrame[], private revision: string | null) {}
  static async open(store: BankCheckpointStore, rawGenesis: unknown): Promise<BankingEngine> {
    const g = decodeGenesis(rawGenesis), loaded = await store.load();
    if (loaded.revision === null) {
      if (loaded.payload !== null) throw new Error("BANK_EMPTY_STORE");
      const state = initial(g), revision = await store.save(checkpoint(g, [], state), null);
      return new BankingEngine(store, g, state, [], revision);
    }
    const p = record(strictJson(loaded.payload), ["version", "genesis", "frames", "targetTick", "digest"]);
    if (p.version !== 2 || typeof p.digest !== "string" || !/^[0-9a-f]{64}$/.test(p.digest)) throw new Error("BANK_CHECKPOINT");
    const saved = decodeGenesis(p.genesis);
    if (bankFingerprint(g) !== bankFingerprint(saved)) throw new Error("BANK_GENESIS_MISMATCH");
    const frames = decodeFrames(p.frames, g), target = bankTick(p.targetTick, -1), state = evolve(g, initial(g), frames, target);
    if (bankFingerprint({ genesis: g, frames, state }) !== p.digest) throw new Error("BANK_CHECKSUM");
    return new BankingEngine(store, g, state, frames, loaded.revision);
  }
  snapshot(): BankingState { return structuredClone(this.state); }
  async advance(rawTarget: unknown, rawFrames: unknown): Promise<BankingState> {
    // Decode/copy before waiting: later caller mutation cannot change a queued operation.
    const target = bankTick(rawTarget), incoming = decodeFrames(rawFrames, this.genesis);
    const work = this.tail.then(async () => {
      let previous = -1;
      const fresh: BankingFrame[] = [];
      for (const f of incoming) {
        if (f.tick <= previous || f.tick > target) throw new Error("BANK_FRAME_ORDER"); previous = f.tick;
        const old = this.frames.find((old) => old.tick === f.tick);
        if (old) { if (bankFingerprint(old) !== bankFingerprint(f)) throw new Error("BANK_FRAME_CONFLICT"); }
        else { if (f.tick <= this.state.tick) throw new Error("BANK_LATE_INPUT"); fresh.push(f); }
      }
      if (target <= this.state.tick) { if (fresh.length) throw new Error("BANK_LATE_INPUT"); return this.snapshot(); }
      const state = evolve(this.genesis, this.state, fresh, target), frames = [...this.frames, ...fresh];
      const revision = await this.store.save(checkpoint(this.genesis, frames, state), this.revision);
      this.state = state; this.frames = frames; this.revision = revision;
      return this.snapshot();
    });
    this.tail = work.then(() => {}, () => {});
    return work;
  }
}
