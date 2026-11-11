import { cmpStr } from "../../../packages/engine/core/order";
import type { Money } from "../../../packages/engine/core/types";
import { bankFingerprint, bankTick, bankWire, decodeFrames, decodeGenesis, record, strictJson } from "./input";
import type { BankCashMovement, BankCheckpointStore, BankCommand, BankingFrame, BankingGenesis, BankingState, BankSeed, CustodyDeposit, HourlyBankMarket } from "./model";

const PPM = BigInt(1_000_000);
const max0 = (n: bigint): bigint => n > BigInt(0) ? n : BigInt(0);
const min = (...ns: bigint[]): bigint => ns.reduce((a, b) => a < b ? a : b);
function bankHalfEven(n: bigint, denominator: bigint): bigint {
  const q = n / denominator, r = n % denominator;
  return q + (BigInt(2) * r > denominator || (BigInt(2) * r === denominator && q % BigInt(2) !== BigInt(0)) ? BigInt(1) : BigInt(0));
}
const interest = (cash: Money, ratePpm: number): Money => bankHalfEven(cash * BigInt(ratePpm), BigInt(364) * PPM);
const tie = (id: string, tick: number): string => bankFingerprint({ id, tick });
const depositTotal = (s: BankingState, bankId?: string): Money => s.deposits.filter((d) => bankId === undefined || d.bankId === bankId).reduce((n, d) => n + d.cash, BigInt(0));
export function bankingCashTotal(s: BankingState): Money { return [...s.banks, ...s.clients, ...s.deposits].reduce((n, a) => n + a.cash, BigInt(0)); }
export function bankingReserves(s: BankingState, bankId: string): Money { const b = s.banks.find((b) => b.id === bankId); if (!b) throw new Error("BANK_UNKNOWN"); return b.cash + depositTotal(s, bankId); }
function initial(g: BankingGenesis): BankingState {
  return { world: g.world, ccy: g.ccy, tick: -1, banks: structuredClone(g.banks), clients: structuredClone(g.clients), deposits: [], loans: [], receipts: [], movements: [], settlements: [], hours: [], fixings: [] };
}
interface BucketRef { key: string; bankId: string | null; bucket: { cash: Money } }
const bankRef = (b: BankSeed): BucketRef => ({ key: `capital/${b.id}`, bankId: b.id, bucket: b });
const depositRef = (d: CustodyDeposit): BucketRef => ({ key: `deposit/${d.id}`, bankId: d.bankId, bucket: d });
function move(s: BankingState, from: BucketRef, to: BucketRef, amount: Money, kind: BankCashMovement["kind"]): void {
  if (amount < BigInt(0) || from.bucket.cash < amount) throw new Error("BANK_UNFUNDED");
  if (amount === BigInt(0)) return;
  from.bucket.cash -= amount; to.bucket.cash += amount;
  s.movements.push({ tick: s.tick, from: from.key, to: to.key, fromBank: from.bankId, toBank: to.bankId, amount, kind });
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
    else s.deposits.push({ id: c.depositId, bankId: c.bankId, holderId: c.actor, product: c.product, cash: BigInt(0), interestDue: BigInt(0) });
  } else if (c.kind === "MOVE") {
    const from = s.deposits.find((d) => d.id === c.from), to = s.deposits.find((d) => d.id === c.to);
    if (!from || !to) reason = "UNKNOWN_DEPOSIT";
    else if (from.holderId !== c.actor || to.holderId !== c.actor) reason = "NOT_OWNER";
    else if (from.id === to.id) reason = "SAME_DEPOSIT";
    else if (from.cash < c.amount) reason = "FUNDS";
    else move(s, depositRef(from), depositRef(to), c.amount, "MOVE");
  } else {
    const d = s.deposits.find((d) => d.id === c.depositId);
    if (!d) reason = "UNKNOWN_DEPOSIT";
    else if (d.holderId !== c.actor) reason = "NOT_OWNER";
    else {
      const wallet: BucketRef = { key: `cash/${actor.id}`, bankId: null, bucket: actor };
      const from = c.kind === "DEPOSIT" ? wallet : depositRef(d), to = c.kind === "DEPOSIT" ? depositRef(d) : wallet;
      if (from.bucket.cash < c.amount) reason = "FUNDS";
      else move(s, from, to, c.amount, c.kind);
    }
  }
  s.receipts.push({ id: c.id, fingerprint, tick: s.tick, accepted: reason === null, reason });
}
function quote(s: BankingState, d: CustodyDeposit): number { const b = s.banks.find((b) => b.id === d.bankId)!; return d.product === "SIGHT" ? b.sightRatePpm : b.savingsRatePpm; }
function dayClose(s: BankingState): void {
  for (const loan of s.loans) if (loan.status !== "REPAID") loan.accrued += interest(loan.principal, loan.ratePpm);
  for (const loan of [...s.loans].sort((a, b) => cmpStr(tie(a.id, s.tick), tie(b.id, s.tick)))) {
    if (loan.status === "REPAID" || loan.maturityTick > s.tick) continue;
    const borrower = s.banks.find((b) => b.id === loan.borrowerId)!, lender = s.banks.find((b) => b.id === loan.lenderId)!;
    const interestPaid = min(borrower.cash, loan.accrued);
    move(s, bankRef(borrower), bankRef(lender), interestPaid, "INTERBANK_INTEREST"); loan.accrued -= interestPaid;
    const principalPaid = min(borrower.cash, loan.principal);
    move(s, bankRef(borrower), bankRef(lender), principalPaid, "INTERBANK_PRINCIPAL"); loan.principal -= principalPaid;
    loan.status = loan.principal === BigInt(0) && loan.accrued === BigInt(0) ? "REPAID" : "OVERDUE";
  }
  for (const d of s.deposits) d.interestDue += interest(d.cash, quote(s, d));
  for (const d of [...s.deposits].sort((a, b) => cmpStr(tie(a.id, s.tick), tie(b.id, s.tick)))) {
    const bank = s.banks.find((b) => b.id === d.bankId)!, paid = min(bank.cash, d.interestDue);
    move(s, bankRef(bank), depositRef(d), paid, "DEPOSIT_INTEREST"); d.interestDue -= paid;
  }
}
function obligations(s: BankingState, b: BankSeed): { incoming: Money; outgoing: Money; depositsDue: Money } {
  const close = Math.floor(s.tick / 720) * 720 + 719, beforeClose = s.tick % 720 !== 719;
  let incoming = BigInt(0), outgoing = BigInt(0), depositsDue = BigInt(0);
  for (const l of s.loans) if (l.status !== "REPAID" && l.maturityTick <= close) {
    const due = l.principal + l.accrued + (beforeClose ? interest(l.principal, l.ratePpm) : BigInt(0));
    if (l.lenderId === b.id) incoming += due;
    if (l.borrowerId === b.id) outgoing += due;
  }
  for (const d of s.deposits) if (d.bankId === b.id) depositsDue += d.interestDue + (beforeClose ? interest(d.cash, quote(s, d)) : BigInt(0));
  return { incoming, outgoing, depositsDue };
}
function gap(s: BankingState, b: BankSeed): Money {
  const due = obligations(s, b), buffer = (depositTotal(s, b.id) + BigInt(199)) / BigInt(200);
  return b.cash + due.incoming - due.outgoing - due.depositsDue - buffer;
}
function tier1(s: BankingState, b: BankSeed): Money {
  let equity = b.cash - s.deposits.filter((d) => d.bankId === b.id).reduce((n, d) => n + d.interestDue, BigInt(0));
  for (const l of s.loans) {
    if (l.lenderId === b.id) equity += l.principal + l.accrued;
    if (l.borrowerId === b.id) equity -= l.principal + l.accrued;
  }
  return max0(equity);
}
function hourly(s: BankingState, m: HourlyBankMarket): void {
  let volume = BigInt(0);
  const borrowers = s.banks.filter((b) => b.enabled && gap(s, b) < BigInt(0)).sort((a, b) => cmpStr(tie(a.id, s.tick), tie(b.id, s.tick)));
  for (const borrower of borrowers) {
    const pd = BigInt(m.risks.find((r) => r.bankId === borrower.id)!.pdPpm);
    const offers = s.banks.filter((b) => b.enabled && b.id !== borrower.id).map((lender) => {
      const tolerance = BigInt(lender.tolerancePpm) * (BigInt(2) * PPM - BigInt(m.fearPpm));
      const ratePpm = m.dfrPpm + 500 + Number(bankHalfEven(pd * BigInt(600_000) * (PPM + BigInt(2) * BigInt(m.fearPpm)), PPM * PPM));
      return { lender, tolerance, ratePpm };
    }).filter((o) => o.tolerance > BigInt(0) && pd * BigInt(2) * PPM <= o.tolerance && o.ratePpm <= m.mlfrPpm - 100)
      .sort((a, b) => a.ratePpm - b.ratePpm || cmpStr(tie(a.lender.id, s.tick), tie(b.lender.id, s.tick)));
    for (const { lender, tolerance, ratePpm } of offers) {
      const exposure = s.loans.filter((l) => l.lenderId === lender.id && l.borrowerId === borrower.id).reduce((n, l) => n + l.principal + l.accrued, BigInt(0));
      const limit = tier1(s, lender) * (tolerance - pd * BigInt(2) * PPM) / (BigInt(10) * tolerance) - exposure;
      const due = obligations(s, lender), unencumbered = max0(lender.cash - due.outgoing - due.depositsDue);
      const amount = min(max0(-gap(s, borrower)), max0(gap(s, lender)), max0(limit), unencumbered);
      if (amount === BigInt(0)) continue;
      move(s, bankRef(lender), bankRef(borrower), amount, "INTERBANK_DRAW"); volume += amount;
      s.loans.push({ id: bankFingerprint({ tick: s.tick, lenderId: lender.id, borrowerId: borrower.id }), lenderId: lender.id, borrowerId: borrower.id, funded: amount, principal: amount, accrued: BigInt(0), ratePpm, originatedTick: s.tick, maturityTick: (Math.floor(s.tick / 720) + 1) * 720 + 719, status: "OPEN" });
    }
  }
  s.hours.push({ tick: s.tick, volume, gaps: s.banks.map((b) => ({ bankId: b.id, gap: gap(s, b) })) });
}
function fixing(s: BankingState, g: BankingGenesis, m: HourlyBankMarket): void {
  const loans = s.loans.filter((l) => Math.floor(l.originatedTick / 720) === Math.floor(s.tick / 720)), volume = loans.reduce((n, l) => n + l.funded, BigInt(0));
  const previous = s.fixings.at(-1), fallback = volume === BigInt(0) || volume * BigInt(10_000) < depositTotal(s);
  const ratePpm = fallback ? m.policyPpm + (previous?.ratePpm ?? g.initialOnrPpm) - (previous?.policyPpm ?? g.initialPolicyPpm)
    : Number(bankHalfEven(loans.reduce((n, l) => n + l.funded * BigInt(l.ratePpm), BigInt(0)), volume));
  s.fixings.push({ tick: s.tick, ratePpm, policyPpm: m.policyPpm, volume, fallback });
}
function evolve(g: BankingGenesis, before: BankingState, frames: BankingFrame[], target: number): BankingState {
  let prior = before.tick;
  for (const f of frames) { if (f.tick <= prior || f.tick > target) throw new Error("BANK_FRAME_ORDER"); prior = f.tick; }
  const hoursRequired = Math.floor((target + 1) / 30) - Math.floor((before.tick + 1) / 30);
  if (frames.filter((f) => f.market !== null).length !== hoursRequired) throw new Error("BANK_MISSING_HOUR");
  const s = structuredClone(before), cashBefore = bankingCashTotal(before);
  for (const f of frames) {
    s.tick = f.tick;
    const firstMove = s.movements.length;
    for (const c of f.commands) execute(s, c);
    if (f.tick % 720 === 719) dayClose(s);
    if (f.market) hourly(s, f.market);
    if (f.tick % 720 === 719) fixing(s, g, f.market!);
    const changes = new Map(s.banks.map((b) => [b.id, BigInt(0)]));
    let externalDelta = BigInt(0);
    for (const p of s.movements.slice(firstMove)) {
      if (p.fromBank === null) externalDelta -= p.amount; else changes.set(p.fromBank, changes.get(p.fromBank)! - p.amount);
      if (p.toBank === null) externalDelta += p.amount; else changes.set(p.toBank, changes.get(p.toBank)! + p.amount);
    }
    if (s.movements.length > firstMove) s.settlements.push({ tick: f.tick, banks: s.banks.map((b) => ({ bankId: b.id, delta: changes.get(b.id)! })), externalDelta });
    if (bankingCashTotal(s) !== cashBefore || [...s.banks, ...s.clients, ...s.deposits].some((b) => b.cash < BigInt(0)) || [...changes.values()].reduce((a, b) => a + b, externalDelta) !== BigInt(0)) throw new Error("BANK_CONSERVATION");
  }
  s.tick = target;
  return s;
}
function checkpoint(g: BankingGenesis, frames: BankingFrame[], state: BankingState): unknown { return bankWire({ version: 1, genesis: g, frames, targetTick: state.tick, digest: bankFingerprint({ genesis: g, frames, state }) }); }
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
    if (p.version !== 1 || typeof p.digest !== "string" || !/^[0-9a-f]{64}$/.test(p.digest)) throw new Error("BANK_CHECKPOINT");
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
