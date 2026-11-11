import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BANK_FUNDING_POLICY } from "../../../src/server/banking/funding-policy";
import { BankingEngine, bankingCashTotal, bankingReserves } from "../../../src/server/banking/engine";
import { bankFingerprint, bankWire, canonicalJson } from "../../../src/server/banking/input";
import type { BankCheckpointStore } from "../../../src/server/banking/model";
import { FileBankCheckpointStore } from "../../../src/server/banking/store";
import { bankFrame, bankGenesis, bankMarket, deposit, micro, openDeposit, through, interbankGenesis, interbankDemand } from "./fixtures";

class MemoryStore implements BankCheckpointStore {
  bytes: string | null = null; revision: string | null = null; fail = false;
  async load() { return { revision: this.revision, payload: this.bytes === null ? null : JSON.parse(this.bytes) }; }
  async save(payload: unknown, revision: string | null) {
    if (this.fail) throw new Error("INJECTED_SAVE_FAILURE");
    if (this.revision !== revision) throw new Error("STALE");
    this.bytes = canonicalJson(payload); this.revision = bankFingerprint(payload); return this.revision;
  }
}
const dirs: string[] = [];
async function filePath() { const root = join(process.cwd(), ".data", "banking-tests"); await mkdir(root, { recursive: true }); const dir = await mkdtemp(join(root, "run-")); dirs.push(dir); return join(dir, "bank.json"); }
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const n = (v: string) => BigInt(v);

it("settles funded own-account deposits, same-bank and cross-bank payments without duplicating reserves", async () => {
  const g = bankGenesis(), e = await BankingEngine.open(new MemoryStore(), g), total = bankingCashTotal(e.snapshot());
  await e.advance(0, [bankFrame(0, [openDeposit("o1", "a", "bankA"), openDeposit("o2", "b", "bankA"), openDeposit("o3", "c", "bankB"), deposit("d", "a", 1000)])]);
  const a = bankingReserves(e.snapshot(), "bankA"), b = bankingReserves(e.snapshot(), "bankB");
  await e.advance(1, [bankFrame(1, [{ id: "m1", actor: "alice", kind: "MOVE", from: "a", to: "b", amount: micro(100) }])]);
  expect(bankingReserves(e.snapshot(), "bankA")).toBe(a);
  await e.advance(2, [bankFrame(2, [{ id: "m2", actor: "alice", kind: "MOVE", from: "a", to: "c", amount: micro(200) }])]);
  expect(bankingReserves(e.snapshot(), "bankA")).toBe(a - n(micro(200)));
  expect(bankingReserves(e.snapshot(), "bankB")).toBe(b + n(micro(200)));
  await e.advance(3, [bankFrame(3, [{ id: "w", actor: "alice", kind: "WITHDRAW", depositId: "c", amount: micro(50) }])]);
  expect(e.snapshot().deposits.map((d) => d.cash)).toEqual([n(micro(700)), n(micro(100)), n(micro(150))]);
  expect(bankingCashTotal(e.snapshot())).toBe(total);
  for (const net of e.snapshot().settlements) expect(net.banks.reduce((s, b) => s + b.delta, net.externalDelta)).toBe(BigInt(0));
});
it("refuses foreign source/destination accounts, lack of presence, absent banks and insufficient funds", async () => {
  const e = await BankingEngine.open(new MemoryStore(), bankGenesis());
  const s = await e.advance(0, [bankFrame(0, [openDeposit("a", "aliceA", "bankA"), openDeposit("b", "bobA", "bankA", "SIGHT", "bob"), openDeposit("np", "bobB", "bankB", "SIGHT", "bob"), openDeposit("nb", "bad", "unknown"), deposit("foreign", "aliceA", 1, "bob"), deposit("huge", "bobA", 1001, "bob"), { id: "m", actor: "alice", kind: "MOVE", from: "aliceA", to: "bobA", amount: "1" }])]);
  expect(s.receipts.map((r) => r.reason)).toEqual([null, null, "NO_PRESENCE", "UNKNOWN_BANK", "NOT_OWNER", "FUNDS", "NOT_OWNER"]);
  expect(s.movements).toHaveLength(0);
});
it("rounds daily interest half-even independently at719, not before, and includes weekends", async () => {
  const g = bankGenesis(); g.banks[0].sightRatePpm = 1; g.banks.forEach((b) => { b.enabled = false; });
  const e = await BankingEngine.open(new MemoryStore(), g);
  const f = bankFrame(0, [openDeposit("o1", "a", "bankA"), openDeposit("o2", "b", "bankA"), openDeposit("o3", "c", "bankA"), { id: "d1", actor: "alice", kind: "DEPOSIT", depositId: "a", amount: "182000000" }, { id: "d2", actor: "alice", kind: "DEPOSIT", depositId: "b", amount: "182000000" }, { id: "d3", actor: "alice", kind: "DEPOSIT", depositId: "c", amount: "546000000" }]);
  await e.advance(718, through(718, [f])); expect(e.snapshot().movements.filter((m) => m.kind === "DEPOSIT_INTEREST")).toHaveLength(0);
  await e.advance(719, [bankFrame(719)]);
  expect(e.snapshot().deposits.map((d) => d.cash)).toEqual([BigInt(182000000), BigInt(182000000), BigInt(546000002)]);
  await e.advance(7 * 720 - 1, through(7 * 720 - 1).filter((f) => f.tick > 719));
  expect(e.snapshot().fixings).toHaveLength(7);
  expect(e.snapshot().deposits[2].cash).toBe(BigInt(546000014));
});
it("preserves unfunded interest as a non-cash payable and never spends customer custody", async () => {
  const g = bankGenesis(); g.banks.forEach((b) => { b.enabled = false; });
  const e = await BankingEngine.open(new MemoryStore(), g), total = bankingCashTotal(e.snapshot());
  await e.advance(1439, through(1439, [bankFrame(0, [openDeposit("o", "b", "bankB", "SAVINGS"), deposit("d", "b", 10000)])]));
  expect(e.snapshot().deposits[0].cash).toBe(n(micro(10000)));
  expect(e.snapshot().deposits[0].interestDue).toBe(n(micro(2)));
  expect(e.snapshot().banks[1].cash).toBe(n(micro(10000))); expect(e.snapshot().banks[1].equity).toBe(BigInt(0)); expect(bankingCashTotal(e.snapshot())).toBe(total);
});
it("matches only at29/59/hourly, lends existing bank cash, and matures the following day719", async () => {
  const e = await BankingEngine.open(new MemoryStore(), interbankGenesis()), total = bankingCashTotal(e.snapshot());
  await e.advance(28, [bankFrame(0, interbankDemand())]);
  expect(e.snapshot().loans).toHaveLength(0);
  await e.advance(29, [bankFrame(29)]);
  const l = e.snapshot().loans[0];
  expect(l.funded).toBe(n(micro(25000))); expect(l.originatedTick).toBe(29); expect(l.maturityTick).toBe(1439); expect(l.ratePpm).toBe(500);
  expect(e.snapshot().banks[0].cash).toBe(n(micro(975000))); expect(e.snapshot().banks[1].cash).toBe(n(micro(75000)));
  await e.advance(59, [bankFrame(59)]); expect(e.snapshot().hours.map((h) => h.tick)).toEqual([29, 59]);
  expect(bankingCashTotal(e.snapshot())).toBe(total);
});
it("applies exact PD/fear haircut, 10%-Tier1 exposure cap, and never refills finite offers", async () => {
  const e = await BankingEngine.open(new MemoryStore(), interbankGenesis());
  await e.advance(59, through(59, [bankFrame(0, interbankDemand("b", "bankB", 100_000_000))], () => bankMarket(10000)));
  expect(e.snapshot().loans).toHaveLength(1); expect(e.snapshot().loans[0].funded).toBe(n(micro(50000))); expect(e.snapshot().loans[0].ratePpm).toBe(6500);
  expect(e.snapshot().hours[1].volume).toBe(BigInt(0)); expect(e.snapshot().hours[1].gaps.find((g) => g.bankId === "bankB")!.gap).toBeLessThan(BigInt(0));
  const frozen = await BankingEngine.open(new MemoryStore(), interbankGenesis());
  await frozen.advance(29, through(29, [bankFrame(0, interbankDemand("b", "bankB", 100_000_000))], () => bankMarket(10000, 0, 1_000_000)));
  expect(frozen.snapshot().loans).toHaveLength(0);
});
it("excludes high-risk borrowers and asks above the facility-minus1bp ceiling", async () => {
  for (const m of [bankMarket(20001), { ...bankMarket(10000), policyPpm: 0, mlfrPpm: 100 }]) {
    const e = await BankingEngine.open(new MemoryStore(), interbankGenesis());
    await e.advance(29, through(29, [bankFrame(0, interbankDemand("b", "bankB", 100_000_000))], () => m));
    expect(e.snapshot().loans).toHaveLength(0);
  }
});
it("computes daily volume-weighted ONR and carries the previous spread on a dry day", async () => {
  const g = interbankGenesis(); g.banks[2].enabled = true; g.banks[2].cash = micro(50000);
  const e = await BankingEngine.open(new MemoryStore(), g);
  await e.advance(719, through(719, [bankFrame(0, [...interbankDemand("b", "bankB", 100_000_000), ...interbankDemand("c", "bankC", 100_000_000)])], () => bankMarket(10000)));
  expect(e.snapshot().fixings[0].fallback).toBe(false); expect(e.snapshot().fixings[0].ratePpm).toBe(2500);
  const dry = await BankingEngine.open(new MemoryStore(), bankGenesis());
  await dry.advance(719, through(719, [], () => ({ ...bankMarket(), policyPpm: 7000 })));
  expect(dry.snapshot().fixings[0]).toEqual({ tick: 719, ratePpm: 7000, policyPpm: 7000, volume: BigInt(0), fallback: true });
});
it("records overdue unfunded bank principal rather than taking depositor cash or minting a rescue", async () => {
  const e = await BankingEngine.open(new MemoryStore(), interbankGenesis()), total = bankingCashTotal(e.snapshot());
  await e.advance(1439, through(1439, [bankFrame(0, interbankDemand()), bankFrame(30, [openDeposit("dest", "dest", "bankC", "SIGHT", "company"), { kind: "MOVE", id: "spend", actor: "company", from: "b", to: "dest", amount: micro(75000) }])], (tick) => bankMarket(tick === 29 ? 0 : 1_000_000)));
  const l = e.snapshot().loans[0]; expect(l.status).toBe("OVERDUE"); expect(l.principal).toBe(BigInt(micro(25000))); expect(l.accrued).toBe(BigInt(68682));
  expect(e.snapshot().deposits[0].cash).toBe(n(micro(4_925_000))); expect(e.snapshot().banks[1].cash).toBe(BigInt(0)); expect(bankingCashTotal(e.snapshot())).toBe(total);
});
it("refuses missing hours before changing any cash, including arbitrarily large unsupported jumps", async () => {
  const e = await BankingEngine.open(new MemoryStore(), bankGenesis()), before = e.snapshot();
  await expect(e.advance(719, [bankFrame(0, [openDeposit("o", "b")])])).rejects.toThrow("BANK_MISSING_HOUR");
  await expect(e.advance(Number.MAX_SAFE_INTEGER - 1440, [])).rejects.toThrow("BANK_MISSING_HOUR");
  expect(e.snapshot()).toEqual(before);
});
it("persists/refuses once, canonicalizes reordered fields across restart, and rolls back conflicting ids", async () => {
  const path = await filePath(), g = bankGenesis(); let e = await BankingEngine.open(new FileBankCheckpointStore(path), g);
  const command = deposit("d", "a", 100), f = bankFrame(0, [openDeposit("o", "a", "bankA"), command, deposit("bad", "a", 2_000_000_000)]);
  await e.advance(0, [f]); const accepted = e.snapshot();
  e = await BankingEngine.open(new FileBankCheckpointStore(path), Object.fromEntries(Object.entries(g).reverse())); expect(e.snapshot()).toEqual(accepted);
  const reversed = { market: null, commands: f.commands.map((c) => Object.fromEntries(Object.entries(c as object).reverse())), tick: 0 };
  expect(await e.advance(0, [reversed])).toEqual(accepted);
  await e.advance(1, [bankFrame(1, [Object.fromEntries(Object.entries(command).reverse())])]);
  expect(e.snapshot().receipts).toHaveLength(3); expect(e.snapshot().deposits[0].cash).toBe(n(micro(100)));
  const bytes = await readFile(path, "utf8"), before = e.snapshot();
  await expect(e.advance(2, [bankFrame(2, [{ ...command, amount: micro(101) }])])).rejects.toThrow("BANK_COMMAND_CONFLICT");
  expect(e.snapshot()).toEqual(before); expect(await readFile(path, "utf8")).toBe(bytes);
  await expect(e.advance(1, [bankFrame(0, [])])).rejects.toThrow("BANK_FRAME_CONFLICT");
});
it("publishes nothing on failed persistence, then accepts the same request once; snapshots are defensive", async () => {
  const store = new MemoryStore(), e = await BankingEngine.open(store, bankGenesis()), before = e.snapshot(), bytes = store.bytes;
  store.fail = true; const f = bankFrame(0, [openDeposit("o", "a", "bankA"), deposit("d", "a", 10)]);
  await expect(e.advance(0, [f])).rejects.toThrow("INJECTED_SAVE_FAILURE"); expect(e.snapshot()).toEqual(before); expect(store.bytes).toBe(bytes);
  store.fail = false; const s = await e.advance(0, [f]); s.deposits[0].cash = BigInt(0);
  expect(e.snapshot().deposits[0].cash).toBe(n(micro(10)));
});
it("serializes concurrent facade writes and captures raw request data before awaiting", async () => {
  const e = await BankingEngine.open(new MemoryStore(), bankGenesis());
  const first = e.advance(0, [bankFrame(0, [openDeposit("o", "a", "bankA")])]), raw = bankFrame(1, [deposit("d", "a", 10)]);
  const second = e.advance(1, [raw]); (raw.commands[0] as { amount: string }).amount = micro(999);
  await Promise.all([first, second]); expect(e.snapshot().deposits[0].cash).toBe(n(micro(10)));
});
it("rejects a stale second file owner without overwriting committed cash", async () => {
  const path = await filePath(), g = bankGenesis(), a = await BankingEngine.open(new FileBankCheckpointStore(path), g), b = await BankingEngine.open(new FileBankCheckpointStore(path), g);
  await a.advance(0, [bankFrame(0, [openDeposit("o", "a", "bankA"), deposit("d", "a", 10)])]); const bytes = await readFile(path, "utf8");
  await expect(b.advance(0, [bankFrame(0, [])])).rejects.toThrow("BANK_STALE_STORE"); expect(await readFile(path, "utf8")).toBe(bytes); expect(b.snapshot().tick).toBe(-1);
});
it("proves complete state equality for tick stepping, a jump, and physical restart through multiple days", async () => {
  const g = bankGenesis(), frames = through(2159, [bankFrame(0, [openDeposit("o", "a", "bankA", "SAVINGS"), openDeposit("ob", "b"), deposit("d", "a", 10000), deposit("db", "b", 5_000_000)]), bankFrame(721, [{ id: "move", actor: "alice", kind: "MOVE", from: "a", to: "b", amount: micro(5) }])]);
  const jump = await BankingEngine.open(new MemoryStore(), g); await jump.advance(2159, frames);
  const tick = await BankingEngine.open(new MemoryStore(), g);
  for (let t = 0; t <= 2159; t++) await tick.advance(t, frames.filter((f) => f.tick === t));
  const path = await filePath(); let restart = await BankingEngine.open(new FileBankCheckpointStore(path), g);
  for (const end of [28, 29, 718, 719, 1438, 1439, 2159]) { const start = restart.snapshot().tick; await restart.advance(end, frames.filter((f) => f.tick > start && f.tick <= end)); restart = await BankingEngine.open(new FileBankCheckpointStore(path), g); }
  expect(tick.snapshot()).toEqual(jump.snapshot()); expect(restart.snapshot()).toEqual(jump.snapshot());
  expect(bankingCashTotal(restart.snapshot())).toBe(n(micro(1_001_001_000)));
}, 30_000);


it("seals even financially unused hourly observations in the checkpoint identity", async () => {
  const path = await filePath(), g = bankGenesis(), e = await BankingEngine.open(new FileBankCheckpointStore(path), g);
  await e.advance(29, [bankFrame(29)]);
  const p = JSON.parse(await readFile(path, "utf8")); p.frames[0].market.risks[0].pdPpm = 123;
  await writeFile(path, canonicalJson(p));
  await expect(BankingEngine.open(new FileBankCheckpointStore(path), g)).rejects.toThrow("BANK_CHECKSUM");
});
it("rolls back earlier funded operations when a later command conflicts in the same batch", async () => {
  const store = new MemoryStore(), e = await BankingEngine.open(store, bankGenesis());
  await e.advance(0, [bankFrame(0, [openDeposit("o", "a", "bankA"), deposit("d", "a", 1)])]);
  const before = e.snapshot(), bytes = store.bytes;
  await expect(e.advance(1, [bankFrame(1, [deposit("new", "a", 10), { ...deposit("d", "a", 2) }])])).rejects.toThrow("BANK_COMMAND_CONFLICT");
  expect(e.snapshot()).toEqual(before); expect(store.bytes).toBe(bytes);
});

describe("strict lossless JSON boundary", () => {
  const badValues: [string, () => unknown][] = [["undefined", () => undefined], ["NaN", () => NaN], ["Infinity", () => Infinity], ["negative Infinity", () => -Infinity], ["negative zero", () => -0], ["Date", () => new Date(0)], ["class", () => new (class X {})()], ["Map", () => new Map()], ["Set", () => new Set()], ["function", () => () => 1], ["symbol", () => Symbol("x")], ["bigint", () => BigInt(1)], ["null prototype", () => Object.create(null)]];
  it.each(badValues)("rejects %s nested in raw genesis", async (_name, bad) => { const g = { ...bankGenesis(), injected: bad() }; await expect(BankingEngine.open(new MemoryStore(), g)).rejects.toThrow(); });
  it.each(badValues)("rejects %s nested in raw command without saving", async (_name, bad) => {
    const store = new MemoryStore(), e = await BankingEngine.open(store, bankGenesis()), bytes = store.bytes;
    await expect(e.advance(0, [bankFrame(0, [{ ...deposit("d", "x", 1), amount: bad() }])])).rejects.toThrow(); expect(store.bytes).toBe(bytes); expect(e.snapshot().tick).toBe(-1);
  });
  it.each(["genesis banks", "genesis presence", "frames", "commands", "risks"])("rejects sparse %s arrays", async (where) => {
    const g = bankGenesis(), sparse = new Array(1);
    if (where === "genesis banks") { await expect(BankingEngine.open(new MemoryStore(), { ...g, banks: sparse })).rejects.toThrow(); return; }
    if (where === "genesis presence") { g.clients[0].presence = sparse; await expect(BankingEngine.open(new MemoryStore(), g)).rejects.toThrow(); return; }
    const e = await BankingEngine.open(new MemoryStore(), g);
    const frames = where === "frames" ? sparse : where === "commands" ? [bankFrame(0, sparse)] : [bankFrame(29, [], { ...bankMarket(), risks: sparse })];
    await expect(e.advance(29, frames)).rejects.toThrow(); expect(e.snapshot().tick).toBe(-1);
  });
  it("rejects named array properties, accessors without evaluating them, hidden fields, symbols, cycles and aliases", async () => {
    const g = bankGenesis(), cases: unknown[] = [], named: unknown[] & { extra?: number } = []; named.extra = 1; cases.push(named);
    let calls = 0; cases.push(Object.defineProperty({}, "world", { enumerable: true, get() { calls++; return "x"; } }));
    cases.push(Object.defineProperty({}, "hidden", { value: 1 })); cases.push({ [Symbol("extra")]: 1 });
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic; cases.push(cyclic); const same = {}; cases.push({ a: same, b: same });
    for (const invalid of cases) await expect(BankingEngine.open(new MemoryStore(), { ...g, injected: invalid })).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it.each(["00", "+1", "-1", "1.0", "1e6", " 1", "", "0"])("rejects noncanonical or zero payment money %s", async (amount) => { const e = await BankingEngine.open(new MemoryStore(), bankGenesis()); await expect(e.advance(0, [bankFrame(0, [{ ...deposit("d", "a", 1), amount }])])).rejects.toThrow(); });
  it("rejects unknown nested fields, incomplete risks, off-hour observations, out-of-order/late input and invalid corridors", async () => {
    const e = await BankingEngine.open(new MemoryStore(), bankGenesis());
    for (const raw of [[bankFrame(0, [{ ...openDeposit("o", "a"), fee: 0 }])], [bankFrame(29, [], { ...bankMarket(), risks: [] })], [bankFrame(0, [], bankMarket())], [bankFrame(29, [], null)], [bankFrame(29, [], { ...bankMarket(), dfrPpm: 6000 })], [bankFrame(2), bankFrame(1)]]) await expect(e.advance(29, raw)).rejects.toThrow();
    await e.advance(2, []); await expect(e.advance(3, [bankFrame(1)])).rejects.toThrow("BANK_LATE_INPUT");
  });
  it("rejects malformed/corrupted/unknown-field checkpoints and a mismatched genesis, never resets money", async () => {
    const path = await filePath(), g = bankGenesis(); await BankingEngine.open(new FileBankCheckpointStore(path), g); const bytes = await readFile(path, "utf8"), good = JSON.parse(bytes);
    for (const bad of ["null", "{", canonicalJson({ ...good, extra: 1 }), canonicalJson({ ...good, digest: "0".repeat(64) }), canonicalJson({ ...good, frames: [{ tick: 0, commands: [], market: null, extra: 1 }] })]) {
      await writeFile(path, bad); await expect(BankingEngine.open(new FileBankCheckpointStore(path), g)).rejects.toThrow(); expect(await readFile(path, "utf8")).toBe(bad);
    }
    await writeFile(path, bytes); const changed = bankGenesis(); changed.banks[0].cash = micro(2_000_000);
    await expect(BankingEngine.open(new FileBankCheckpointStore(path), changed)).rejects.toThrow("BANK_GENESIS_MISMATCH");
    expect(await readFile(path, "utf8")).toBe(bytes); expect(bankWire(good)).toEqual(good);
  });
});

it("preserves nonempty Unicode and delimited authoritative ids without a parallel slug restriction", async () => {
  const g = bankGenesis(); g.world = "world:Paris/1"; g.banks[0].id = "bank:Paris/é";
  for (const c of g.clients) c.presence = c.presence.map((id) => id === "bankA" ? "bank:Paris/é" : id);
  const store = new MemoryStore(), e = await BankingEngine.open(store, g);
  await e.advance(0, [bankFrame(0, [openDeposit("cmd:open/é", "deposit:é/1", "bank:Paris/é"), deposit("cmd:pay/é", "deposit:é/1", 1)])]);
  const restarted = await BankingEngine.open(store, g); expect(restarted.snapshot()).toEqual(e.snapshot()); expect(restarted.snapshot().deposits[0].id).toBe("deposit:é/1");
});

it("includes accrued interest in counterparty exposure rather than turning booked income into a fresh credit limit", async () => {
  const e = await BankingEngine.open(new MemoryStore(), interbankGenesis());
  await e.advance(719, through(719, [bankFrame(0, interbankDemand("b", "bankB", 100_000_000))], () => bankMarket(10000)));
  expect(e.snapshot().loans).toHaveLength(1); expect(e.snapshot().loans[0].funded).toBe(BigInt(micro(50000))); expect(e.snapshot().loans[0].accrued).toBe(BigInt(892857));
  expect(e.snapshot().hours.at(-1)!.volume).toBe(BigInt(0));
});


describe("hostile Proxy input boundaries", () => {
  const surfaces = ["root genesis", "nested genesis", "root frames", "root frame", "nested command", "controls", "nested risk", "checkpoint load", "checkpoint save", "nested checkpoint save"];
  const cases = surfaces.flatMap((surface) => [false, true].map((revoked) => ({ surface, revoked })));
  it.each(cases)("rejects $surface Proxy (revoked=$revoked) before reflection/save and across restart", async ({ surface, revoked }) => {
    const path = await filePath(), g = bankGenesis(), file = new FileBankCheckpointStore(path);
    let saves = 0, traps = 0;
    const store: BankCheckpointStore = { load: () => file.load(), save: (payload, revision) => { saves++; return file.save(payload, revision); } };
    const handler: ProxyHandler<object> = {
      getPrototypeOf(target) { traps++; return Reflect.getPrototypeOf(target); },
      ownKeys(target) { traps++; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) { traps++; return Reflect.getOwnPropertyDescriptor(target, key); },
      get(target, key, receiver) { traps++; return Reflect.get(target, key, receiver); },
    };
    const hostile = <T extends object>(value: T): T => {
      const proxy = Proxy.revocable<T>(value, handler); if (revoked) proxy.revoke(); return proxy.proxy;
    };
    let engine = await BankingEngine.open(store, g);
    await engine.advance(0, [bankFrame(0, [openDeposit("initial", "a", "bankA"), deposit("fund", "a", 10)])]);
    for (let restart = 0; restart < 2; restart++) {
      if (restart) engine = await BankingEngine.open(store, g);
      const bytes = await readFile(path, "utf8"), before = engine.snapshot(), priorSaves = saves;
      const loaded = await file.load(), payload = loaded.payload;
      if (!payload || typeof payload !== "object") throw new Error("invalid checkpoint fixture");
      const attempt = async () => {
        if (surface === "root genesis") return BankingEngine.open(store, hostile(g));
        if (surface === "nested genesis") return BankingEngine.open(store, { ...g, banks: g.banks.map((b, i) => i === 0 ? hostile(b) : b) });
        if (surface === "root frames") return engine.advance(1, hostile([bankFrame(1)]));
        if (surface === "root frame") return engine.advance(1, [hostile(bankFrame(1))]);
        if (surface === "nested command") return engine.advance(1, [bankFrame(1, [hostile(openDeposit("bad", "b", "bankA"))])]);
        if (surface === "controls") return engine.advance(29, [bankFrame(29, [], hostile(bankMarket()))]);
        if (surface === "nested risk") {
          const market = bankMarket(); market.risks[0] = hostile(market.risks[0]); return engine.advance(29, [bankFrame(29, [], market)]);
        }
        if (surface === "checkpoint load") return BankingEngine.open({ load: async () => ({ ...loaded, payload: hostile(payload) }), save: store.save }, g);
        if (surface === "checkpoint save") return file.save(hostile(payload), loaded.revision);
        const frames: unknown = Reflect.get(payload, "frames");
        if (!Array.isArray(frames)) throw new Error("invalid frames fixture");
        Reflect.set(payload, "frames", hostile(frames)); return file.save(payload, loaded.revision);
      };
      await expect(attempt()).rejects.toThrow("BANK_JSON_TREE");
      expect(traps).toBe(0); expect(saves).toBe(priorSaves);
      expect(engine.snapshot()).toEqual(before); expect(await readFile(path, "utf8")).toBe(bytes);
      expect((await BankingEngine.open(file, g)).snapshot()).toEqual(before);
    }
    await engine.advance(1, [bankFrame(1, [deposit("valid-after-proxy", "a", 1)])]);
    expect((await BankingEngine.open(file, g)).snapshot()).toEqual(engine.snapshot());
    expect(traps).toBe(0);
  });
  it("rejects a Proxy target tick without invoking traps", async () => {
    let traps = 0;
    const target = new Proxy({}, { get() { traps++; throw new Error("trap invoked"); } });
    const engine = await BankingEngine.open(new MemoryStore(), bankGenesis()), before = engine.snapshot();
    await expect(engine.advance(target, [])).rejects.toThrow("BANK_TICK");
    expect(traps).toBe(0); expect(engine.snapshot()).toEqual(before);
  });
});

it.each([{ reserves: 74999, gap: -1 }, { reserves: 75000, gap: 0 }, { reserves: 75001, gap: 1 }])("applies the 1% reserve plus 0.5% buffer threshold at reserves=$reserves", ({ reserves, gap }) => {
  expect(BANK_FUNDING_POLICY.projectedGap({ reserves: BigInt(micro(reserves)), deposits: BigInt(micro(5_000_000)), incoming: BigInt(0), outgoing: BigInt(0), depositsDue: BigInt(0) })).toBe(BigInt(micro(gap)));
});
it.each([{ reserves: 14, expected: 0 }, { reserves: 15, expected: 0 }, { reserves: 16, expected: 1 }])("caps actual lendable reserves at $expected when reserves=$reserves", ({ reserves, expected }) => {
  expect(BANK_FUNDING_POLICY.lendableReserves({ reserves: BigInt(reserves), outgoing: BigInt(15) })).toBe(BigInt(expected));
});
it("rounds the 1.5% micro-unit reserve target upward", () => {
  expect(BANK_FUNDING_POLICY.projectedGap({ reserves: BigInt(0), deposits: BigInt(1), incoming: BigInt(0), outgoing: BigInt(0), depositsDue: BigInt(0) })).toBe(BigInt(-1));
});

it("projects funded deposit interest as own-account money, not a reserve outflow", () => {
  expect(BANK_FUNDING_POLICY.projectedGap({ reserves: BigInt(2000), deposits: BigInt(100000), incoming: BigInt(0), outgoing: BigInt(0), depositsDue: BigInt(1000) })).toBe(BigInt(485));
});
