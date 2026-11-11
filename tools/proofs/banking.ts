import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BankingEngine } from "../../src/server/banking/engine";
import { bankFingerprint, bankWire, canonicalJson, decodeGenesis } from "../../src/server/banking/input";
import { auditBanking } from "./banking-audit";
import type { BankingState } from "../../src/server/banking/model";
import { FileBankCheckpointStore } from "../../src/server/banking/store";
import { bankFrame, bankGenesis, bankMarket, deposit, micro, openDeposit, through, interbankGenesis, interbankDemand } from "../../tests/unit/banking/fixtures";

const usage = `Usage: npx tsx tools/proofs/banking.ts --out <new-directory>
Creates fresh stores, verifies complete tick/jump/restart identity, and reconstructs every cash transfer independently.
The output directory must not exist. Existing evidence is never overwritten.
Examples:
  npx tsx tools/proofs/banking.ts --out /workspace/avalon/evidence/sys-banking/proofs-final
`;
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
    const conservation = auditBanking(decodeGenesis(g), expected);
    await writeFile(join(dir, "state.json"), canonicalJson(bankWire(expected)) + "\n");
    const result = { id, status: "PASS", targetTick: end, fullStateDigest: bankFingerprint(expected), hourlyChecks: expected.hours.length, dailyChecks: expected.fixings.length, physicalRestarts: restarts, tickJumpRestartFullStateEqual: true, checkpointBytesEqual: true, reorderedFieldReplayAcrossRestart: true, conservation };
    await writeFile(join(dir, "RESULT.json"), JSON.stringify(result, null, 2) + "\n"); results.push(result); console.log(id + " PASS");
  }
  const lend = (id: string, depositId: string, amount: number, ratePpm = 0) => ({ kind: "LEND", id, actor: "bankA", depositId, amount: micro(amount), ratePpm, maturityTick: 719 });
  const repaid = bankGenesis(); repaid.clients[2].cash = micro(10);
  await scenario("credit-create-and-repay", repaid, through(749, [bankFrame(0, [openDeposit("open", "business", "bankA", "SIGHT", "company"), deposit("fund", "business", 10, "company"), lend("loan", "business", 1000, 36400)]), bankFrame(1, [{ kind: "REPAY", id: "partial", actor: "company", loanId: "loan", amount: micro(400) }])]), 749, (s) => { assert.equal(s.businessLoans[0].status, "REPAID"); assert(s.movements.some((m) => m.kind === "CREDIT_CREATE")); assert(s.movements.some((m) => m.kind === "CREDIT_DESTROY")); });
  await scenario("default-writeoff-no-deposit-destruction", bankGenesis(), through(749, [bankFrame(0, [openDeposit("open", "business", "bankA", "SIGHT", "company"), openDeposit("other", "other", "bankB", "SIGHT", "alice"), lend("loan", "business", 1000)]), bankFrame(1, [{ kind: "PAY", id: "circulate", actor: "company", from: "business", to: "other", amount: micro(1000) }]), bankFrame(720, [{ kind: "WRITE_OFF", id: "writeoff", actor: "bankA", loanId: "loan" }])]), 749, (s) => { assert.equal(s.businessLoans[0].status, "WRITTEN_OFF"); assert.equal(s.deposits.find((d) => d.id === "other")!.cash, BigInt(micro(1000))); });
  await scenario("reserve-liquidity-no-cb", bankGenesis(), through(59, [bankFrame(0, [openDeposit("open", "business", "bankA", "SIGHT", "company"), lend("loan", "business", 2_000_000), { kind: "WITHDRAW", id: "dry", actor: "company", depositId: "business", amount: micro(2_000_000) }])]), 59, (s) => { assert.equal(s.receipts.at(-1)!.reason, "RESERVES"); });
  await scenario("spec-reserve-gap", bankGenesis(), through(59, [bankFrame(0, [openDeposit("open", "b"), deposit("deposit", "b", 5_000_000)])]), 59, (s) => { assert.equal(s.loans.length, 0); assert.equal(s.hours[0].gaps.find((g) => g.bankId === "bankB")!.gap, BigInt(micro(4_925_000))); });
  await scenario("interbank-fear-freeze", interbankGenesis(), through(719, [bankFrame(0, interbankDemand("b", "bankB", 100_000_000))], () => bankMarket(10000, 0, 1_000_000)), 719, (s) => { assert.equal(s.loans.length, 0); assert.equal(s.hours.length, 24); });
  const weighted = interbankGenesis(); weighted.banks[2].enabled = true; weighted.banks[2].cash = micro(50000);
  await scenario("weighted-interbank-fixing", weighted, through(719, [bankFrame(0, [...interbankDemand("b", "bankB", 100_000_000), ...interbankDemand("c", "bankC", 100_000_000)])], () => bankMarket(10000)), 719, (s) => { assert.equal(s.fixings[0].ratePpm, 2500); assert.equal(s.fixings[0].fallback, false); });
  const result = { timestamp: execFileSync("date", ["--iso-8601=seconds"], { encoding: "utf8" }).trim(), zone: "Europe/Paris", head, base: "110583b0aa73ece1dc3b856665f3be0405f1acc3", freshStores: true, proofCount: results.length, allPassed: true, results };
  await writeFile(join(out, "RESULT.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ allPassed: true, proofCount: results.length, out }));
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
