import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BankingEngine, bankingCashTotal } from "../../src/server/banking/engine";
import { bankFingerprint, bankWire, canonicalJson } from "../../src/server/banking/input";
import type { BankingState } from "../../src/server/banking/model";
import { FileBankCheckpointStore } from "../../src/server/banking/store";
import { bankFrame, bankGenesis, bankMarket, deposit, micro, openDeposit, through } from "../../tests/unit/banking/fixtures";

const usage = `Usage: npx tsx tools/proofs/banking.ts --out <new-directory>
Creates fresh stores, verifies complete tick/jump/restart identity, and reconstructs every cash transfer independently.
The output directory must not exist. Existing evidence is never overwritten.
Examples:
  npx tsx tools/proofs/banking.ts --out /workspace/avalon/evidence/sys-banking/proofs-final
`;
function audit(g: ReturnType<typeof bankGenesis>, s: BankingState) {
  const cash = new Map<string, bigint>(), owners = new Map<string, string | null>();
  for (const b of g.banks) { cash.set(`capital/${b.id}`, BigInt(b.cash)); owners.set(`capital/${b.id}`, b.id); }
  for (const c of g.clients) { cash.set(`cash/${c.id}`, BigInt(c.cash)); owners.set(`cash/${c.id}`, null); }
  for (const d of s.deposits) { cash.set(`deposit/${d.id}`, BigInt(0)); owners.set(`deposit/${d.id}`, d.bankId); }
  const initial = [...cash.values()].reduce((a, b) => a + b, BigInt(0)), nets = new Map<number, Map<string | null, bigint>>(), principal = new Map<string, bigint>();
  for (const m of s.movements) {
    assert(m.amount > BigInt(0)); assert(cash.has(m.from) && cash.has(m.to));
    assert.equal(m.fromBank, owners.get(m.from)); assert.equal(m.toBank, owners.get(m.to));
    assert(cash.get(m.from)! >= m.amount); cash.set(m.from, cash.get(m.from)! - m.amount); cash.set(m.to, cash.get(m.to)! + m.amount);
    assert.equal([...cash.values()].reduce((a, b) => a + b, BigInt(0)), initial);
    const net = nets.get(m.tick) ?? new Map<string | null, bigint>();
    net.set(m.fromBank, (net.get(m.fromBank) ?? BigInt(0)) - m.amount); net.set(m.toBank, (net.get(m.toBank) ?? BigInt(0)) + m.amount); nets.set(m.tick, net);
    if (m.kind === "INTERBANK_DRAW" || m.kind === "INTERBANK_PRINCIPAL") {
      const pair = m.kind === "INTERBANK_DRAW" ? `${m.fromBank}/${m.toBank}` : `${m.toBank}/${m.fromBank}`;
      principal.set(pair, (principal.get(pair) ?? BigInt(0)) + (m.kind === "INTERBANK_DRAW" ? m.amount : -m.amount));
    }
  }
  const expected = new Map<string, bigint>();
  for (const b of s.banks) expected.set(`capital/${b.id}`, b.cash);
  for (const c of s.clients) expected.set(`cash/${c.id}`, c.cash);
  for (const d of s.deposits) expected.set(`deposit/${d.id}`, d.cash);
  assert.deepEqual(cash, expected); assert.equal(bankingCashTotal(s), initial);
  assert.equal(nets.size, s.settlements.length);
  for (const net of s.settlements) {
    const independent = nets.get(net.tick)!;
    assert.equal(net.externalDelta, independent.get(null) ?? BigInt(0));
    for (const b of net.banks) assert.equal(b.delta, independent.get(b.bankId) ?? BigInt(0));
    assert.equal(net.banks.reduce((n, b) => n + b.delta, net.externalDelta), BigInt(0));
  }
  for (const [pair, remaining] of principal) assert.equal(remaining, s.loans.filter((l) => `${l.lenderId}/${l.borrowerId}` === pair).reduce((n, l) => n + l.principal, BigInt(0)));
  return { movementsReconstructed: s.movements.length, settlementTicks: s.settlements.length, loanPairsReconciled: principal.size, initialMicro: initial.toString(), finalMicro: bankingCashTotal(s).toString(), deltaMicro: "0", everyMoveConserved: true, everyBalanceReconciled: true };
}
async function main() {
  if (process.argv.includes("--help")) { console.log(usage); return; }
  if (process.argv.length !== 4 || process.argv[2] !== "--out") { console.error(usage); process.exitCode = 2; return; }
  const out = resolve(process.argv[3]); await mkdir(out);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const results: unknown[] = [];
  async function scenario(id: string, g: ReturnType<typeof bankGenesis>, frames: ReturnType<typeof bankFrame>[], end: number, inspect: (s: BankingState) => void) {
    const dir = join(out, id); await mkdir(dir);
    const open = (name: string) => BankingEngine.open(new FileBankCheckpointStore(join(dir, name + ".store.json")), g);
    const jump = await open("jump"); await jump.advance(end, frames); const expected = jump.snapshot(); inspect(expected);
    const tick = await open("tick"); const byTick = new Map(frames.map((f) => [f.tick, f]));
    for (let t = 0; t <= end; t++) await tick.advance(t, byTick.has(t) ? [byTick.get(t)!] : []);
    assert.deepEqual(tick.snapshot(), expected);
    let restart = await open("restart"), restarts = 0;
    const boundaries = [...new Set([0, 28, 29, 58, 59, 718, 719, 748, 749, 1438, 1439, end].filter((t) => t <= end))].sort((a, b) => a - b);
    for (const target of boundaries) {
      const before = restart.snapshot().tick; await restart.advance(target, frames.filter((f) => f.tick > before && f.tick <= target));
      const accepted = restart.snapshot(); restart = await open("restart"); restarts++; assert.deepEqual(restart.snapshot(), accepted);
    }
    assert.deepEqual(restart.snapshot(), expected);
    const jumpBytes = await readFile(join(dir, "jump.store.json"), "utf8");
    assert.equal(await readFile(join(dir, "tick.store.json"), "utf8"), jumpBytes);
    assert.equal(await readFile(join(dir, "restart.store.json"), "utf8"), jumpBytes);
    const first = frames[0], reordered = { market: first.market, commands: first.commands.map((c) => Object.fromEntries(Object.entries(c as object).reverse())), tick: first.tick };
    const replayed = await restart.advance(end, [reordered]); assert.deepEqual(replayed, expected);
    assert.equal(await readFile(join(dir, "restart.store.json"), "utf8"), jumpBytes);
    const conservation = audit(g, expected);
    await writeFile(join(dir, "state.json"), canonicalJson(bankWire(expected)) + "\n");
    const result = { id, status: "PASS", targetTick: end, fullStateDigest: bankFingerprint(expected), hourlyChecks: expected.hours.length, dailyChecks: expected.fixings.length, physicalRestarts: restarts, tickJumpRestartFullStateEqual: true, checkpointBytesEqual: true, reorderedFieldReplayAcrossRestart: true, conservation };
    await writeFile(join(dir, "RESULT.json"), JSON.stringify(result, null, 2) + "\n"); results.push(result); console.log(id + " PASS");
  }
  const funded = bankGenesis(); funded.banks[1].cash = micro(1000);
  await scenario("deposits-clearing-paid-credit", funded, through(2159, [bankFrame(0, [openDeposit("oa", "a", "bankA", "SAVINGS"), openDeposit("ob", "b"), deposit("da", "a", 10000), deposit("db", "b", 5_000_000), deposit("refused", "a", 2_000_000_000)]), bankFrame(721, [{ id: "m", actor: "alice", kind: "MOVE", from: "a", to: "b", amount: micro(5) }]), bankFrame(1440, [{ id: "w", actor: "alice", kind: "WITHDRAW", depositId: "b", amount: micro(3) }])], (t) => bankMarket(t === 29 ? 0 : 1_000_000)), 2159, (s) => { assert.equal(s.loans[0].status, "REPAID"); assert(s.movements.some((m) => m.kind === "DEPOSIT_INTEREST")); assert(s.receipts.some((r) => r.reason === "FUNDS")); });
  await scenario("unfunded-maturity-no-rescue", bankGenesis(), through(1439, [bankFrame(0, [openDeposit("o", "b"), deposit("d", "b", 5_000_000)])], (t) => bankMarket(t === 29 ? 0 : 1_000_000)), 1439, (s) => { assert.equal(s.loans[0].status, "OVERDUE"); assert.equal(s.loans[0].principal, BigInt(68682)); assert.equal(s.deposits[0].cash, BigInt(micro(5_000_000))); });
  const dry = bankGenesis(); dry.banks.forEach((b) => { b.enabled = false; });
  await scenario("unfunded-deposit-interest", dry, through(1439, [bankFrame(0, [openDeposit("o", "b", "bankB", "SAVINGS"), deposit("d", "b", 10000)])]), 1439, (s) => { assert.equal(s.deposits[0].interestDue, BigInt(micro(2))); assert.equal(s.deposits[0].cash, BigInt(micro(10000))); assert.equal(s.fixings[0].fallback, true); });
  const thin = bankGenesis(); thin.banks[0].cash = micro(10);
  await scenario("finite-credit-exhaustion", thin, through(719, [bankFrame(0, [openDeposit("o", "b"), deposit("d", "b", 100_000_000)])]), 719, (s) => { assert.equal(s.loans[0].funded, BigInt(micro(1))); assert(s.hours.at(-1)!.gaps.find((g) => g.bankId === "bankB")!.gap < BigInt(0)); });
  await scenario("fear-freeze-no-last-resort", bankGenesis(), through(719, [bankFrame(0, [openDeposit("o", "b"), deposit("d", "b", 100_000_000)])], () => bankMarket(10000, 0, 1_000_000)), 719, (s) => { assert.equal(s.loans.length, 0); assert.equal(s.hours.length, 24); });
  const weighted = bankGenesis(); weighted.banks[2].enabled = true;
  await scenario("weighted-overnight-fixing", weighted, through(719, [bankFrame(0, [openDeposit("ob", "b"), openDeposit("oc", "c", "bankC"), deposit("db", "b", 100_000_000), deposit("dc", "c", 100_000_000)])], () => bankMarket(10000)), 719, (s) => { assert.equal(s.fixings[0].ratePpm, 2500); assert.equal(s.fixings[0].fallback, false); });
  const result = { timestamp: execFileSync("date", ["--iso-8601=seconds"], { encoding: "utf8" }).trim(), zone: "Europe/Paris", head, base: "110583b0aa73ece1dc3b856665f3be0405f1acc3", freshStores: true, proofCount: results.length, allPassed: true, results };
  await writeFile(join(out, "RESULT.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ allPassed: true, proofCount: results.length, out }));
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
