import assert from "node:assert/strict";
import type { BankingGenesis, BankingState } from "../../src/server/banking/model";
/** Independent reconstruction: never calls the engine's balance-sheet checker or money-total helpers. */
export function auditBanking(g: BankingGenesis, s: BankingState) {
  const zero = BigInt(0), reserves = new Map(g.banks.map((b) => [b.id, b.cash])), equity = new Map(reserves);
  const wallets = new Map(g.clients.map((c) => [c.id, c.cash])), deposits = new Map(s.deposits.map((d) => [d.id, zero]));
  const loans = new Map(s.businessLoans.map((l) => [l.id, zero])), interbank = new Map<string, bigint>();
  const sum = (m: Map<string, bigint>) => [...m.values()].reduce((n, x) => n + x, zero);
  const base = sum(reserves) + sum(wallets), initialM2 = sum(wallets);
  let created = zero, repaid = zero, writtenOff = zero, ownFlows = zero;
  const nets = new Map<number, Map<string | null, bigint>>();
  const change = (m: Map<string, bigint>, k: string, amount: bigint) => { assert(m.has(k)); m.set(k, m.get(k)! + amount); };
  const deposit = (id: string) => s.deposits.find((d) => d.id === id)!;
  const pair = (a: string, b: string) => JSON.stringify([a, b]);
  function check() {
    assert.equal(sum(reserves) + sum(wallets), base, "no base money creation");
    assert.equal(sum(wallets) + sum(deposits), initialM2 + created - repaid + ownFlows, "03:972 M2 reconciliation");
    for (const b of g.banks) {
      const d = s.deposits.filter((d) => d.bankId === b.id).reduce((n, d) => n + deposits.get(d.id)!, zero);
      const l = s.businessLoans.filter((l) => l.lenderId === b.id).reduce((n, l) => n + loans.get(l.id)!, zero);
      let incoming = zero, outgoing = zero;
      for (const other of g.banks) { incoming += interbank.get(pair(b.id, other.id)) ?? zero; outgoing += interbank.get(pair(other.id, b.id)) ?? zero; }
      assert.equal(reserves.get(b.id)! + l + incoming, d + equity.get(b.id)! + outgoing, "bank assets == liabilities + equity");
    }
    for (const m of [reserves, wallets, deposits, loans, interbank]) for (const v of m.values()) assert(v >= zero, "no negative money/principal");
  }
  check();
  for (const m of s.movements) {
    assert(m.amount > zero); const a = m.amount, beforeM2 = sum(wallets) + sum(deposits);
    const reservesBefore = new Map(reserves), walletsBefore = sum(wallets);
    switch (m.kind) {
      case "DEPOSIT": change(wallets, m.clientId, -a); change(reserves, m.bankId, a); change(deposits, m.depositId, a); break;
      case "WITHDRAW": change(wallets, m.clientId, a); change(reserves, m.bankId, -a); change(deposits, m.depositId, -a); break;
      case "MOVE": {
        const from = deposit(m.fromDeposit), to = deposit(m.toDeposit);
        change(deposits, from.id, -a); change(deposits, to.id, a);
        if (from.bankId !== to.bankId) { change(reserves, from.bankId, -a); change(reserves, to.bankId, a); }
        break;
      }
      case "DEPOSIT_INTEREST": change(equity, m.bankId, -a); change(deposits, m.depositId, a); ownFlows += a; break;
      case "LOAN_INTEREST": change(equity, m.bankId, a); change(deposits, m.depositId, -a); ownFlows -= a; break;
      case "CREDIT_CREATE": change(loans, m.loanId, a); change(deposits, m.depositId, a); created += a; break;
      case "CREDIT_DESTROY": change(loans, m.loanId, -a); change(deposits, m.depositId, -a); repaid += a; break;
      case "CREDIT_CHARGEOFF":
        change(loans, m.loanId, -a); change(equity, m.bankId, -a); writtenOff += a;
        assert.equal(sum(wallets) + sum(deposits), beforeM2, "07:460 charge-off never burns circulated deposits"); break;
      case "INTERBANK_DRAW": case "INTERBANK_PRINCIPAL": case "INTERBANK_INTEREST": {
        change(reserves, m.fromBank, -a); change(reserves, m.toBank, a);
        if (m.kind === "INTERBANK_INTEREST") { change(equity, m.fromBank, -a); change(equity, m.toBank, a); }
        else {
          const key = m.kind === "INTERBANK_DRAW" ? pair(m.fromBank, m.toBank) : pair(m.toBank, m.fromBank);
          interbank.set(key, (interbank.get(key) ?? zero) + (m.kind === "INTERBANK_DRAW" ? a : -a));
        }
        break;
      }
      default: { const unreachable: never = m; throw new Error(String(unreachable)); }
    }
    check();
    const net = nets.get(m.tick) ?? new Map<string | null, bigint>();
    for (const [id, value] of reserves) net.set(id, (net.get(id) ?? zero) + value - reservesBefore.get(id)!);
    net.set(null, (net.get(null) ?? zero) + sum(wallets) - walletsBefore); nets.set(m.tick, net);
  }
  assert.deepEqual(reserves, new Map(s.banks.map((b) => [b.id, b.cash])));
  assert.deepEqual(equity, new Map(s.banks.map((b) => [b.id, b.equity])));
  assert.deepEqual(wallets, new Map(s.clients.map((c) => [c.id, c.cash])));
  assert.deepEqual(deposits, new Map(s.deposits.map((d) => [d.id, d.cash])));
  assert.deepEqual(loans, new Map(s.businessLoans.map((l) => [l.id, l.principal])));
  for (const [key, value] of interbank) assert.equal(value, s.loans.filter((l) => pair(l.lenderId, l.borrowerId) === key).reduce((n, l) => n + l.principal, zero));
  assert.equal(s.settlements.length, nets.size);
  for (const net of s.settlements) {
    const reconstructed = nets.get(net.tick)!;
    assert.equal(net.externalDelta, reconstructed.get(null));
    for (const b of net.banks) assert.equal(b.delta, reconstructed.get(b.bankId));
    assert.equal(net.banks.reduce((n, b) => n + b.delta, net.externalDelta), zero);
  }
  return { everyPostingReconstructed: true, everyPostingBalanceSheetChecked: true, baseMoneyMicro: base.toString(), baseMoneyDeltaMicro: "0", creditCreatedMicro: created.toString(), principalDestroyedMicro: repaid.toString(), principalWrittenOffMicro: writtenOff.toString(), bankOwnAccountFlowsMicro: ownFlows.toString(), broadMoneyMicro: (sum(wallets) + sum(deposits)).toString(), broadMoneyIdentityResidualMicro: "0", chargeoffDoesNotBurnDeposits: true, identity: "deposits + equity + interbank borrowing = reserves + business loans + interbank lending" };
}
