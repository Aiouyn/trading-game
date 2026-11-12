import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { advanceFarm, commandFarm, createFarm } from "@/server/launchpad/failureFarm/engine";
import { parseFarm } from "@/server/launchpad/failureFarm/checkpoint";
import { FailureFarmEngine, FileFarmStore } from "@/server/launchpad/failureFarm/store";
import type { FarmState } from "@/server/launchpad/failureFarm/model";
import { LP } from "@/launchpad/rules";

// Accepted value == saved JSON == replay identity: every non-plain-JSON or unknown-field input is refused before
// clone, fingerprint, receipt or save, without running a getter, toJSON or Proxy trap, and survives a real restart.
let calls = 0;
const counted = <T extends object>(target: T): T => new Proxy(target, Object.fromEntries(
  (["get", "set", "has", "ownKeys", "getOwnPropertyDescriptor", "getPrototypeOf", "setPrototypeOf", "defineProperty", "deleteProperty", "isExtensible", "preventExtensions"] as const)
    .map((trap) => [trap, (...args: unknown[]) => { calls++; return (Reflect[trap] as (...a: unknown[]) => unknown)(...args); }])) as ProxyHandler<T>);
const revoked = <T extends object>(target: T): T => { const r = Proxy.revocable(target, {}); r.revoke(); return r.proxy; };
const getter = <T extends object>(base: T, key: string, value: unknown) => Object.defineProperty({ ...base }, key, { enumerable: true, get() { calls++; return value; } });
const toJson = (value: unknown) => ({ toJSON() { calls++; return value; } });
class Boxed { constructor(readonly v: number) {} toJSON() { calls++; return this.v; } }
class CommandClass { kind = "TRADE"; wallet = "holder"; key = "probe"; ticker = "GULL"; side = "BUY"; amount = 50_000; }

const trade = () => ({ kind: "TRADE", wallet: "holder", key: "probe", ticker: "GULL", side: "BUY", amount: 50_000 });
const launchCmd = () => ({ kind: "LAUNCH", wallet: "holder", key: "probe", ticker: "TERN", name: "Tern Club", fee: LP.LAUNCH_FEE, nowMs: 0 });
const world = (): FarmState => {
  const s = createFarm("boundary", [{ id: "creator", kind: "PLAYER", cash: 10_000_000 }, { id: "holder", kind: "PLAYER", cash: 20_000_000 }]);
  return commandFarm(s, { kind: "LAUNCH", wallet: "creator", key: "launch", ticker: "GULL", name: "Gull Club", fee: LP.LAUNCH_FEE, nowMs: 0 }).state;
};
async function durable(state: FarmState) {
  const dir = await mkdtemp(join(tmpdir(), "avalon-farm-boundary-")), file = join(dir, "farm.json");
  const engine = await FailureFarmEngine.open(new FileFarmStore(file), state);
  return { dir, file, engine, bytes: await readFile(file, "utf8") };
}

const BAD_COMMANDS: [string, () => unknown][] = [
  ["NaN amount", () => ({ ...trade(), amount: NaN })],
  ["Infinity amount", () => ({ ...trade(), amount: Infinity })],
  ["-Infinity fee", () => ({ ...launchCmd(), fee: -Infinity })],
  ["negative zero amount", () => ({ ...trade(), amount: -0 })],
  ["null where amount is required", () => ({ ...trade(), amount: null })],
  ["null where name is required", () => ({ ...launchCmd(), name: null })],
  ["missing amount", () => { const rest: Record<string, unknown> = trade(); delete rest.amount; return rest; }],
  ["undefined amount", () => ({ ...trade(), amount: undefined })],
  ["own toJSON on the command", () => ({ ...trade(), toJSON: () => { calls++; return trade(); } })],
  ["toJSON object as name", () => ({ ...launchCmd(), name: toJson("Tern Club") })],
  ["class instance with toJSON as amount", () => ({ ...trade(), amount: new Boxed(50_000) })],
  ["boxed Number amount", () => ({ ...trade(), amount: new Number(50_000) })],
  ["Date nowMs", () => ({ ...launchCmd(), nowMs: new Date(0) })],
  ["function amount", () => ({ ...trade(), amount: () => 50_000 })],
  ["getter amount", () => getter(trade(), "amount", 50_000)],
  ["root Proxy", () => counted(trade())],
  ["nested Proxy amount", () => ({ ...trade(), amount: counted({ v: 1 }) })],
  ["revoked root Proxy", () => revoked(trade())],
  ["revoked nested Proxy", () => ({ ...launchCmd(), name: revoked({}) })],
  ["sparse array amount", () => ({ ...trade(), amount: new Array(1) })],
  ["class instance command", () => new CommandClass()],
  ["unknown field", () => ({ ...trade(), memo: "x" })],
  ["unknown symbol field", () => ({ ...trade(), [Symbol("memo")]: 1 })],
  ["non-enumerable extra field", () => Object.defineProperty(trade(), "memo", { value: 1, enumerable: false })],
  ["unknown side", () => ({ ...trade(), side: "HOLD" })],
];

describe("failure-farm strict JSON command boundary", () => {
  it.each(BAD_COMMANDS)("rejects %s before receipt/save, unchanged across restart, then accepts the valid key", async (_label, bad) => {
    const { dir, file, engine, bytes } = await durable(world());
    try {
      const before = engine.snapshot();
      calls = 0;
      expect(() => commandFarm(before, bad())).toThrow("INVALID_FARM_COMMAND");
      await expect(engine.execute(bad())).rejects.toThrow("INVALID_FARM_COMMAND");
      expect(calls).toBe(0);
      expect(engine.snapshot()).toEqual(before);
      expect(await readFile(file, "utf8")).toBe(bytes);
      const restarted = await FailureFarmEngine.open(new FileFarmStore(file));
      expect(restarted.snapshot()).toEqual(before);
      // No receipt was stored under the probe key: the valid request is fresh, then replays exactly once.
      const first = await restarted.execute(trade());
      expect(first.kind).toBe("FILLED");
      const after = await readFile(file, "utf8"), again = await FailureFarmEngine.open(new FileFarmStore(file));
      expect(await again.execute(trade())).toEqual(first);
      expect(await readFile(file, "utf8")).toBe(after);
      expect(JSON.parse(after)).toEqual(again.snapshot());
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("closes the typed-helper aliases: toJSON name and NaN/null amounts no longer replay saved receipts", () => {
    let s = world();
    const saved = commandFarm(s, { kind: "LAUNCH", wallet: "holder", key: "alias", ticker: "TERN", name: "Tern Club", fee: LP.LAUNCH_FEE, nowMs: 0 });
    expect(saved.reply).toEqual({ kind: "LAUNCHED", ticker: "TERN" });
    s = saved.state;
    class Named { toJSON() { return "Tern Club"; } }
    expect(() => commandFarm(s, { kind: "LAUNCH", wallet: "holder", key: "alias", ticker: "TERN", name: new Named(), fee: LP.LAUNCH_FEE, nowMs: 0 })).toThrow("INVALID_FARM_COMMAND");
    const refusal = commandFarm(s, { ...trade(), key: "bad-amount", amount: 1.5 });
    expect(refusal.reply).toEqual({ kind: "REFUSED", code: "BAD_AMOUNT" });
    for (const amount of [NaN, null]) expect(() => commandFarm(refusal.state, { ...trade(), key: "bad-amount", amount })).toThrow("INVALID_FARM_COMMAND");
  });
});

const frame = () => ({ hour: 1, coins: { GULL: { mentions: 0.5 } } });
const BAD_FRAMES: [string, () => unknown][] = [
  ["sparse frame array", () => new Array(1)],
  ["sparse hole after a valid frame", () => { const a: unknown[] = [frame()]; a.length = 2; return a; }],
  ["NaN mentions", () => [{ hour: 1, coins: { GULL: { mentions: NaN } } }]],
  ["Infinity hypeShock", () => [{ hour: 1, coins: { GULL: { hypeShock: Infinity } } }]],
  ["null where a present mark is required", () => [{ hour: 1, coins: { GULL: { mark: null } } }]],
  ["null coins", () => [{ hour: 1, coins: null }]],
  ["undefined hour", () => [{ hour: undefined, coins: {} }]],
  ["Date hour", () => [{ hour: new Date(1), coins: {} }]],
  ["toJSON frame", () => [toJson(frame())]],
  ["getter hour", () => [getter({ coins: {} }, "hour", 1)]],
  ["root Proxy frames", () => counted([frame()])],
  ["nested Proxy observation", () => [{ hour: 1, coins: { GULL: counted({ mentions: 0.5 }) } }]],
  ["revoked Proxy coins", () => [{ hour: 1, coins: revoked({}) }]],
  ["class instance observation", () => [{ hour: 1, coins: { GULL: new Boxed(1) } }]],
  ["function mentions", () => [{ hour: 1, coins: { GULL: { mentions: () => 0.5 } } }]],
  ["unknown frame field", () => [{ ...frame(), note: "x" }]],
  ["unknown observation field", () => [{ hour: 1, coins: { GULL: { mentions: 0.5, volume: 1 } } }]],
];

describe("failure-farm strict JSON frame boundary", () => {
  it.each(BAD_FRAMES)("rejects %s before advancing or saving, unchanged across restart", async (_label, bad) => {
    const { dir, file, engine, bytes } = await durable(world());
    try {
      const before = engine.snapshot();
      calls = 0;
      expect(() => advanceFarm(before, bad())).toThrow("INVALID_FARM_FRAME");
      await expect(engine.advance(bad())).rejects.toThrow("INVALID_FARM_FRAME");
      expect(calls).toBe(0);
      expect(engine.snapshot()).toEqual(before);
      expect(await readFile(file, "utf8")).toBe(bytes);
      const restarted = await FailureFarmEngine.open(new FileFarmStore(file));
      expect(restarted.snapshot()).toEqual(before);
      await restarted.advance([frame()]);
      const again = await FailureFarmEngine.open(new FileFarmStore(file));
      expect(again.snapshot()).toEqual(restarted.snapshot());
      expect(again.snapshot().hour).toBe(1);
      expect(again.snapshot()).toEqual(advanceFarm(before, [frame()]));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

const BAD_CHECKPOINTS: [string, (s: FarmState) => unknown][] = [
  ["NaN sink", (s) => ({ ...s, sink: NaN })],
  ["Infinity wallet cash", (s) => ({ ...s, wallets: { ...s.wallets, holder: { ...s.wallets.holder!, cash: Infinity } } })],
  ["null where wallet cash is required", (s) => ({ ...s, wallets: { ...s.wallets, holder: { ...s.wallets.holder!, cash: null } } })],
  ["sparse playerNet", (s) => ({ ...s, coins: { GULL: { ...s.coins.GULL!, playerNet: new Array(1) } } })],
  ["Date lastLaunchAtMs", (s) => ({ ...s, wallets: { ...s.wallets, creator: { ...s.wallets.creator!, lastLaunchAtMs: new Date(0) } } })],
  ["getter hour", (s) => getter(s, "hour", 0)],
  ["toJSON root", (s) => ({ ...s, toJSON: () => { calls++; return s; } })],
  ["root Proxy", (s) => counted(structuredClone(s))],
  ["nested Proxy wallets", (s) => ({ ...s, wallets: counted(structuredClone(s.wallets)) })],
  ["revoked Proxy coins", (s) => ({ ...s, coins: revoked({}) })],
  ["class instance coin", (s) => ({ ...s, coins: { GULL: Object.assign(new (class Coin {})(), s.coins.GULL) } })],
  ["unknown nested field", (s) => ({ ...s, wallets: { ...s.wallets, holder: { ...s.wallets.holder!, note: "x" } } })],
];

describe("failure-farm strict JSON checkpoint/genesis boundary", () => {
  it.each(BAD_CHECKPOINTS)("refuses %s as genesis or save without creating or changing a file", async (_label, corrupt) => {
    const dir = await mkdtemp(join(tmpdir(), "avalon-farm-boundary-"));
    try {
      const file = join(dir, "farm.json"), valid = world();
      calls = 0;
      expect(() => parseFarm(corrupt(valid))).toThrow("BAD_FARM_CHECKPOINT");
      await expect(FailureFarmEngine.open(new FileFarmStore(file), corrupt(valid) as FarmState)).rejects.toThrow("BAD_FARM_CHECKPOINT");
      await expect(readFile(file, "utf8")).rejects.toThrow("ENOENT");
      const engine = await FailureFarmEngine.open(new FileFarmStore(file), valid), bytes = await readFile(file, "utf8");
      await expect(new FileFarmStore(file).save(corrupt(valid) as FarmState)).rejects.toThrow("BAD_FARM_CHECKPOINT");
      expect(calls).toBe(0);
      expect(await readFile(file, "utf8")).toBe(bytes);
      expect((await FailureFarmEngine.open(new FileFarmStore(file))).snapshot()).toEqual(engine.snapshot());
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("refuses non-plain or unknown-field genesis wallets", () => {
    const ok = { id: "a", kind: "PLAYER", cash: 1 } as const;
    calls = 0;
    for (const wallets of [[{ ...ok, cash: NaN }], [{ ...ok, extra: 1 }], [counted({ ...ok })], counted([ok]), new Array(1), [getter({ id: "a", kind: "PLAYER" }, "cash", 1)], [{ ...ok, cash: null }]]) {
      expect(() => createFarm("g", wallets as never)).toThrow("BAD_GENESIS");
    }
    expect(calls).toBe(0);
  });
});
