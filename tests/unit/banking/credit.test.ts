import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { BankingEngine, bankingCashTotal, bankingReserves, bankingDepositMoney } from "../../../src/server/banking/engine";
import { decodeGenesis } from "../../../src/server/banking/input";
import { auditBanking } from "../../../tools/proofs/banking-audit";
import { FileBankCheckpointStore } from "../../../src/server/banking/store";
import { bankFrame, bankGenesis, micro, openDeposit, through, deposit } from "./fixtures";
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "bank-credit-")); dirs.push(dir);
  const file = join(dir, "bank.json"), g = bankGenesis(), store = new FileBankCheckpointStore(file);
  return { g, file, store, engine: await BankingEngine.open(store, g) };
}
const lend = (id = "loan", amount = 1000, maturityTick = 719) => ({ kind: "LEND", id, actor: "bankA", depositId: "business", amount: micro(amount), ratePpm: 0, maturityTick });
it("creates a business loan deposit without creating reserves", async () => {
  const { engine, store, g } = await setup(), before = engine.snapshot(), base = bankingCashTotal(before), reserves = bankingReserves(before, "bankA");
  await engine.advance(0, [bankFrame(0, [openDeposit("open-business", "business", "bankA", "SIGHT", "company"), lend()])]);
  expect(engine.snapshot().receipts.at(-1)?.accepted).toBe(true);
  expect(engine.snapshot().deposits.find((d) => d.id === "business")?.cash).toBe(BigInt(micro(1000)));
  expect(bankingReserves(engine.snapshot(), "bankA")).toBe(reserves);
  expect(bankingCashTotal(engine.snapshot())).toBe(base);
  expect((await BankingEngine.open(store, g)).snapshot()).toEqual(engine.snapshot());
});

it("destroys repaid principal, transfers interest, and preserves the equity-corrected identity", async () => {
  const { g, store, engine } = await setup();
  await engine.advance(0, [bankFrame(0, [openDeposit("open-business", "business", "bankA", "SIGHT", "company"), { ...lend(), ratePpm: 36400 }])]);
  await engine.advance(1, [bankFrame(1, [{ kind: "REPAY", id: "partial", actor: "company", loanId: "loan", amount: micro(400) }])]);
  expect(engine.snapshot().businessLoans[0].principal).toBe(BigInt(micro(600)));
  // A real settlement-cash deposit funds interest, not another money-creation operation.
  const funded = bankGenesis(); funded.clients[2].cash = micro(1);
  const secondPath = join(dirs[0], "paid.json"), paidStore = new FileBankCheckpointStore(secondPath);
  const paid = await BankingEngine.open(paidStore, funded);
  await paid.advance(719, through(719, [bankFrame(0, [openDeposit("o", "business", "bankA", "SIGHT", "company"), deposit("fund", "business", 1, "company"), { ...lend(), ratePpm: 36400 }])]));
  expect(paid.snapshot().businessLoans[0].status).toBe("REPAID");
  expect(paid.snapshot().businessLoans[0].principal).toBe(BigInt(0));
  expect(paid.snapshot().banks[0].equity).toBe(BigInt(micro(1_000_000)) + BigInt(100000));
  expect(auditBanking(decodeGenesis(funded), paid.snapshot()).principalDestroyedMicro).toBe(micro(1000));
  expect((await BankingEngine.open(paidStore, funded)).snapshot()).toEqual(paid.snapshot());
  expect((await BankingEngine.open(store, g)).snapshot()).toEqual(engine.snapshot());
});
it("writes off an overdue loan against equity without destroying circulated deposits", async () => {
  const { g, store, engine } = await setup();
  await engine.advance(719, through(719, [bankFrame(0, [openDeposit("o", "business", "bankA", "SIGHT", "company"), openDeposit("other", "other", "bankB", "SIGHT", "company"), lend()]), bankFrame(1, [{ kind: "MOVE", id: "spend", actor: "company", from: "business", to: "other", amount: micro(1000) }])]));
  expect(engine.snapshot().businessLoans[0].status).toBe("OVERDUE");
  const money = bankingDepositMoney(engine.snapshot()), reserves = bankingCashTotal(engine.snapshot());
  await engine.advance(720, [bankFrame(720, [{ kind: "WRITE_OFF", id: "loss", actor: "bankA", loanId: "loan" }])]);
  expect(engine.snapshot().businessLoans[0]).toMatchObject({ status: "WRITTEN_OFF", principal: BigInt(0) });
  expect(engine.snapshot().banks[0].equity).toBe(BigInt(micro(999000)));
  expect(bankingDepositMoney(engine.snapshot())).toBe(money); expect(bankingCashTotal(engine.snapshot())).toBe(reserves);
  const audit = auditBanking(decodeGenesis(g), engine.snapshot()); expect(audit.principalWrittenOffMicro).toBe(micro(1000));
  expect((await BankingEngine.open(store, g)).snapshot()).toEqual(engine.snapshot());
});
it("keeps consumer credit, unauthorized repayment/writeoff and reserve minting out of scope", async () => {
  const { engine } = await setup();
  await engine.advance(0, [bankFrame(0, [openDeposit("person", "person", "bankA"), { ...lend("consumer"), depositId: "person" }, openDeposit("o", "business", "bankA", "SIGHT", "company"), { ...lend("wrong-bank"), actor: "alice" }, lend(), { kind: "REPAY", id: "foreign-repay", actor: "bob", loanId: "loan", amount: micro(1) }, { kind: "WRITE_OFF", id: "foreign-loss", actor: "bankB", loanId: "loan" }, { kind: "WRITE_OFF", id: "early-loss", actor: "bankA", loanId: "loan" }])]);
  expect(engine.snapshot().receipts.map((r) => r.reason)).toEqual([null, "CONSUMER_OUT_OF_SCOPE", null, "LENDER_INACTIVE", null, "NOT_OWNER", "NOT_LENDER", "NOT_OVERDUE"]);
  await engine.advance(1, [bankFrame(1, [lend("large", 2_000_000), { kind: "WITHDRAW", id: "dry", actor: "company", depositId: "business", amount: micro(2_000_000) }])]);
  expect(engine.snapshot().receipts.at(-1)?.reason).toBe("RESERVES");
});
it("replays a reordered credit command once and rolls back a later conflicting batch", async () => {
  const { engine, store, g, file } = await setup();
  await engine.advance(0, [bankFrame(0, [openDeposit("o", "business", "bankA", "SIGHT", "company"), lend()])]);
  const restarted = await BankingEngine.open(store, g);
  await restarted.advance(1, [bankFrame(1, [Object.fromEntries(Object.entries(lend()).reverse())])]);
  expect(restarted.snapshot().movements.filter((m) => m.kind === "CREDIT_CREATE")).toHaveLength(1);
  const before = restarted.snapshot(), bytes = await readFile(file, "utf8");
  await expect(restarted.advance(2, [bankFrame(2, [lend("new", 10), lend("loan", 1001)])])).rejects.toThrow("BANK_COMMAND_CONFLICT");
  expect(restarted.snapshot()).toEqual(before); expect(await readFile(file, "utf8")).toBe(bytes);
});
it("publishes no credit-created money on a failed save and retries exactly once", async () => {
  const { g, file, store, engine } = await setup(); await engine.advance(0, [bankFrame(0, [openDeposit("o", "business", "bankA", "SIGHT", "company")])]);
  let fail = true;
  const writer = await BankingEngine.open({ load: () => store.load(), save: (p, r) => { if (fail) throw new Error("credit save failure"); return store.save(p, r); } }, g);
  const before = writer.snapshot(), bytes = await readFile(file, "utf8"), f = [bankFrame(1, [lend()])];
  await expect(writer.advance(1, f)).rejects.toThrow("credit save failure");
  expect(writer.snapshot()).toEqual(before); expect(await readFile(file, "utf8")).toBe(bytes);
  fail = false; await writer.advance(1, f); expect(writer.snapshot().movements.filter((m) => m.kind === "CREDIT_CREATE")).toHaveLength(1);
  expect((await BankingEngine.open(store, g)).snapshot()).toEqual(writer.snapshot());
});
it("has the spec +4925000 reserve gap and no spurious 25000 interbank loan", async () => {
  const { engine } = await setup();
  await engine.advance(29, through(29, [bankFrame(0, [openDeposit("o", "b"), deposit("d", "b", 5_000_000)])]));
  expect(engine.snapshot().hours[0].gaps.find((r) => r.bankId === "bankB")?.gap).toBe(BigInt(micro(4_925_000)));
  expect(engine.snapshot().loans).toHaveLength(0);
});

it("rejects and preserves custody v1 journals rather than silently reinterpreting money", async () => {
  const { file, g, store } = await setup(), loaded = await store.load();
  if (!loaded.payload || typeof loaded.payload !== "object") throw new Error("invalid checkpoint fixture");
  Reflect.set(loaded.payload, "version", 1);
  await store.save(loaded.payload, loaded.revision); const bytes = await readFile(file, "utf8");
  await expect(BankingEngine.open(store, g)).rejects.toThrow("BANK_CHECKPOINT");
  expect(await readFile(file, "utf8")).toBe(bytes);
});
