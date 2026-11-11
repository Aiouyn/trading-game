import {bankMove,addBankDeposit,addInterbank,context} from "../../views";
import { BANK_FUNDING_POLICY } from "./funding-policy";
import { cmpStr } from "../../../../../packages/engine/core/order";
import type { Money } from "../../../../../packages/engine/core/types";
import { bankFingerprint } from "./input";
import type { BankCommand, BankingGenesis, BankingState, BankState, BankDeposit, HourlyBankMarket } from "./model";
const PPM = BigInt(1_000_000), ZERO = BigInt(0);
const max0 = (n: bigint): bigint => n > ZERO ? n : ZERO;
const min = (...ns: bigint[]): bigint => ns.reduce((a, b) => a < b ? a : b);
function bankHalfEven(n: bigint, denominator: bigint): bigint {
  const q = n / denominator, r = n % denominator;
  return q + (BigInt(2) * r > denominator || (BigInt(2) * r === denominator && q % BigInt(2) !== ZERO) ? BigInt(1) : ZERO);
}
const interest = (cash: Money, ratePpm: number): Money => bankHalfEven(cash * BigInt(ratePpm), BigInt(364) * PPM);
const tie = (id: string, tick: number): string => bankFingerprint({ id, tick });
const depositTotal = (s: BankingState, bankId?: string): Money => context(s).root.accounts.filter((a) => a.bankId !== null && (bankId === undefined || a.bankId === bankId)).reduce((n, a) => n + a.lots.reduce((m, l) => m + l.amount, ZERO), ZERO);
/** Outside settlement cash plus actual bank reserve assets, never deposit liabilities. */
export function bankingCashTotal(s: BankingState): Money { return [...s.banks, ...s.clients].reduce((n, a) => n + a.cash, ZERO); }
export function bankingDepositMoney(s: BankingState): Money { return s.clients.reduce((n, a) => n + a.cash, depositTotal(s)); }
export function bankingReserves(s: BankingState, bankId: string): Money { const b = s.banks.find((b) => b.id === bankId); if (!b) throw new Error("BANK_UNKNOWN"); return b.cash; }
const bank = (s: BankingState, id: string) => s.banks.find((b) => b.id === id)!;
function reserveTransfer(s: BankingState, from: BankState, to: BankState, amount: Money, kind: "INTERBANK_DRAW" | "INTERBANK_PRINCIPAL" | "INTERBANK_INTEREST"): void {
  if (amount < ZERO || from.cash < amount) throw new Error("BANK_UNFUNDED");
  if (amount === ZERO) return;
  from.cash -= amount; to.cash += amount;
  s.movements.push({ tick: s.tick, fromBank: from.id, toBank: to.id, amount, kind });
}
function transferDeposits(s: BankingState, from: BankDeposit, to: BankDeposit, amount: Money, kind: "MOVE" | "PAY"): void {
  bankMove(s,from,to,amount);
  s.movements.push({ tick: s.tick, kind, fromDeposit: from.id, toDeposit: to.id, amount });
}
function execute(s: BankingState, c: BankCommand): void {
  const fingerprint = bankFingerprint(c), old = s.receipts.find((r) => r.id === c.id);
  if (old) { if (old.fingerprint !== fingerprint) throw new Error("BANK_COMMAND_CONFLICT"); return; }
  const actor = s.clients.find((a) => a.id === c.actor);
  let reason: string | null = null;
  if (!actor) reason = "UNKNOWN_ACTOR";
  else if (c.kind === "OPEN") {
    if (!s.banks.some((b) => b.id === c.bankId)) reason = "UNKNOWN_BANK";
    else if (!actor.presence.includes(c.bankId)) reason = "NO_PRESENCE";
    else if (s.deposits.some((d) => d.id === c.depositId)) reason = "DEPOSIT_EXISTS";
    else addBankDeposit(s,{ id: c.depositId, bankId: c.bankId, holderId: c.actor, product: c.product, cash: ZERO, interestDue: ZERO });
  } else if (c.kind === "MOVE" || c.kind === "PAY") {
    const from = s.deposits.find((d) => d.id === c.from), to = s.deposits.find((d) => d.id === c.to);
    if (!from || !to) reason = "UNKNOWN_DEPOSIT";
    else if (from.holderId !== actor.id || (c.kind === "MOVE" && to.holderId !== actor.id)) reason = "NOT_OWNER";
    else if (c.kind === "PAY" && actor.kind !== "BUSINESS") reason = "BUSINESS_ONLY";
    else if (from.id === to.id) reason = "SAME_DEPOSIT";
    else if (from.cash < c.amount) reason = "FUNDS";
    else if (from.bankId !== to.bankId && bank(s, from.bankId).cash < c.amount) reason = "RESERVES";
    else {
      transferDeposits(s, from, to, c.amount, c.kind);
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
      if(delta>ZERO)bankMove(s,actor,d,delta);else bankMove(s,d,actor,-delta);
      s.movements.push({ tick: s.tick, kind: c.kind, clientId: actor.id, bankId: d.bankId, depositId: d.id, amount: c.amount });
    }
  }
  s.receipts.push({ id: c.id, fingerprint, tick: s.tick, accepted: reason === null, reason });
}
function quote(s: BankingState, d: BankDeposit): number { const b = bank(s, d.bankId); return d.product === "SIGHT" ? b.sightRatePpm : b.savingsRatePpm; }
function dayClose(s: BankingState): void {
  for (const loan of s.loans) if (loan.status !== "REPAID") loan.accrued += interest(loan.principal, loan.ratePpm);
  for (const loan of [...s.loans].sort((a, b) => cmpStr(tie(a.id, s.tick), tie(b.id, s.tick)))) {
    if (loan.status === "REPAID" || loan.maturityTick > s.tick) continue;
    const borrower = bank(s, loan.borrowerId), lender = bank(s, loan.lenderId);
    const interestPaid = min(borrower.cash, loan.accrued);
    reserveTransfer(s, borrower, lender, interestPaid, "INTERBANK_INTEREST"); loan.accrued -= interestPaid;
    
    const principalPaid = min(borrower.cash, loan.principal);
    reserveTransfer(s, borrower, lender, principalPaid, "INTERBANK_PRINCIPAL"); loan.principal -= principalPaid;
    loan.status = loan.principal === ZERO && loan.accrued === ZERO ? "REPAID" : "OVERDUE";
  }
  for (const d of s.deposits) d.interestDue += interest(d.cash, quote(s, d));
  for (const d of [...s.deposits].sort((a, b) => cmpStr(tie(a.id, s.tick), tie(b.id, s.tick)))) {
    const b = bank(s, d.bankId), paid = min(max0(b.equity), d.interestDue);
    if (paid > ZERO) { d.cash += paid; d.interestDue -= paid; s.movements.push({ tick: s.tick, kind: "DEPOSIT_INTEREST", bankId: b.id, depositId: d.id, amount: paid }); }
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
function bookEquity(s:BankingState,b:BankState):Money{return b.equity;}
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
      addInterbank(s,{ id: bankFingerprint({ tick: s.tick, lenderId: lender.id, borrowerId: borrower.id }), lenderId: lender.id, borrowerId: borrower.id, funded: amount, principal: amount, accrued: ZERO, ratePpm, originatedTick: s.tick, maturityTick: (Math.floor(s.tick / 720) + 1) * 720 + 719, status: "OPEN" });
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
export { execute as bankingCommand, dayClose as bankingDay, hourly as bankingHour, fixing as bankingFixing };
