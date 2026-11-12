import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { advanceFarm, cashTotal, commandFarm, createFarm, liquidity, liquidityBand, publicCoins, RETAIL_LAW, FAILURE_LAW } from "@/server/launchpad/failureFarm/engine";
import { parseFarm } from "@/server/launchpad/failureFarm/checkpoint";
import { FARM_LIMITS } from "@/server/launchpad/failureFarm/boundary";
import { FailureFarmEngine, FileFarmStore } from "@/server/launchpad/failureFarm/store";
import type { FarmFrame, FarmState } from "@/server/launchpad/failureFarm/model";
import { LP } from "@/launchpad/rules";

// Pre-registered rules: docs/v1/units/meme-failure-farm.md "Premise attack".
const world = (retail = false) => {
  let s = createFarm("premise", [
    { id: "creator", kind: "PLAYER", cash: 10_000_000 }, { id: "holder", kind: "PLAYER", cash: 20_000_000 },
    ...(retail ? [{ id: "pool", kind: "RETAIL" as const, cash: 300_000_000 }] : []),
  ]);
  s = commandFarm(s, { kind: "LAUNCH", wallet: "creator", key: "launch", ticker: "GULL", name: "Gull Club", fee: LP.LAUNCH_FEE, nowMs: 0 }).state;
  if (retail) s = commandFarm(s, { kind: "TRADE", wallet: "pool", key: "seed-buy", ticker: "GULL", side: "BUY", amount: 3_000_000 }).state;
  s = commandFarm(s, { kind: "TRADE", wallet: "holder", key: "graduate", ticker: "GULL", side: "BUY", amount: 10_000_000 }).state;
  expect(s.coins.GULL!.venue.kind).toBe("BOOK");
  return s;
};
const listed = (s: FarmState) => { const v = s.coins.GULL!.venue; if (v.kind !== "BOOK") throw new Error("not book"); return v; };
const path = (from: number, to: number, mark?: number): FarmFrame[] =>
  Array.from({ length: to - from }, (_, i) => ({ hour: from + i + 1, coins: (mark === undefined ? {} : { GULL: { mark } }) as FarmFrame["coins"] }));

describe("Rule A: finite-book liquidity is bid depth within max(0.05, 3 sigma_d) of the mark", () => {
  it("uses the daily settlement band, wider than the per-tick band, and counts the capped book cash at listing", () => {
    const s = world(), band = liquidityBand("GULL");
    expect(band).toBeGreaterThan(0.29); expect(band).toBeLessThan(0.32); expect(band).toBeGreaterThan(0.04);
    expect(liquidity(s.coins.GULL!)).toBe(listed(s).book.cash);
    expect(publicCoins(s)[0]!.liquidityCents).toBe(listed(s).book.cash);
  });
  it("a collapsed mark leaves resting cash unreachable: thin, then delisted after exactly 7 days, with no cash moved", () => {
    const s0 = world(), collapsed = Math.max(1, Math.floor(listed(s0).listedPrice * 0.004));
    const s1 = advanceFarm(s0, path(0, 1, collapsed));
    expect(listed(s1).book.cash).toBe(listed(s0).book.cash);
    expect(listed(s1).book.cash).toBeGreaterThan(FAILURE_LAW.liquidityCents);
    expect(liquidity(s1.coins.GULL!)).toBeLessThan(FAILURE_LAW.liquidityCents);
    expect(s1.coins.GULL!.thinSince).toBe(1);
    const before = advanceFarm(s1, path(1, 168, collapsed));
    expect(before.coins.GULL!.discovery.kind).toBe("LIVE");
    const dead = advanceFarm(before, path(168, 169, collapsed));
    expect(dead.coins.GULL!.discovery).toEqual({ kind: "DELISTED", hour: 169 });
    expect(cashTotal(dead)).toBe(cashTotal(s0)); expect(listed(dead).book.cash).toBe(listed(s0).book.cash);
    expect(dead.wallets.holder!.tokens.GULL).toBe(s0.wallets.holder!.tokens.GULL);
    expect(parseFarm(JSON.parse(JSON.stringify(dead)))).toEqual(dead);
  });
  it("a price recovery inside the window restores near-price depth and resets the clock", () => {
    const s0 = world(), listing = listed(s0).listedPrice;
    const thin = advanceFarm(s0, path(0, 100, Math.floor(listing * 0.004)));
    expect(thin.coins.GULL!.thinSince).toBe(1);
    const back = advanceFarm(thin, path(100, 101, listing));
    expect(back.coins.GULL!.thinSince).toBeNull();
    expect(advanceFarm(back, path(101, 300, listing)).coins.GULL!.discovery.kind).toBe("LIVE");
  });
});

describe("Rule B: RETAIL holders act through the real book, spot-only and rate-capped", () => {
  it("trades every so often, never more than the hourly cap, never short, never over its cash, conserving money", () => {
    let s = world(true);
    const cap = Math.floor(RETAIL_LAW.weight * RETAIL_LAW.rate / 24 * RETAIL_LAW.adv), total = cashTotal(s);
    let trades = 0;
    for (let hour = 1; hour <= 96; hour++) {
      const prev = s.wallets.pool!;
      s = advanceFarm(s, [{ hour, coins: {} }]);
      const now = s.wallets.pool!, delta = (now.tokens.GULL ?? 0) - (prev.tokens.GULL ?? 0);
      expect(Math.abs(delta)).toBeLessThanOrEqual(cap);
      expect(now.cash).toBeGreaterThanOrEqual(0); expect(now.tokens.GULL ?? 0).toBeGreaterThanOrEqual(0);
      if (delta !== 0) trades++;
      expect(cashTotal(s)).toBe(total);
    }
    expect(trades).toBeGreaterThan(10);
  });
  it("is deterministic: a batch jump equals hourly stepping and a real file restart continues identically", async () => {
    const s0 = world(true), frames = path(0, 120);
    const jumped = advanceFarm(s0, frames), stepped = frames.reduce((s, f) => advanceFarm(s, [f]), s0);
    expect(jumped).toEqual(stepped);
    const dir = await mkdtemp(join(tmpdir(), "avalon-farm-premise-"));
    try {
      const file = join(dir, "farm.json"), a = await FailureFarmEngine.open(new FileFarmStore(file), s0);
      await a.advance(path(0, 50));
      const b = await FailureFarmEngine.open(new FileFarmStore(file));
      await b.advance(path(50, 120));
      expect(b.snapshot()).toEqual(jumped);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("never launches and never trades a curve coin", () => {
    let s = createFarm("premise-curve", [{ id: "creator", kind: "PLAYER", cash: 10_000_000 }, { id: "pool", kind: "RETAIL", cash: 10_000_000 }]);
    expect(commandFarm(s, { kind: "LAUNCH", wallet: "pool", key: "l", ticker: "TERN", name: "Tern Club", fee: LP.LAUNCH_FEE, nowMs: 0 }).reply).toEqual({ kind: "REFUSED", code: "BAD_LAUNCH" });
    s = commandFarm(s, { kind: "LAUNCH", wallet: "creator", key: "l", ticker: "GULL", name: "Gull Club", fee: LP.LAUNCH_FEE, nowMs: 0 }).state;
    const after = advanceFarm(s, path(0, 48));
    expect(after.wallets.pool).toEqual(s.wallets.pool);
  });
});

describe("input size limits", () => {
  const trade = { kind: "TRADE", wallet: "holder", key: "k", ticker: "GULL", side: "BUY", amount: 1 };
  it("refuses command and frame strings or keys over 256 units before any receipt", () => {
    const s = world();
    expect(() => commandFarm(s, { ...trade, key: "k".repeat(FARM_LIMITS.inputString + 1) })).toThrow("INVALID_FARM_COMMAND");
    expect(() => commandFarm(s, { ...trade, key: "k".repeat(FARM_LIMITS.inputString) })).not.toThrow();
    expect(() => advanceFarm(s, [{ hour: 1, coins: { ["G".repeat(FARM_LIMITS.inputString + 1)]: {} } }])).toThrow("INVALID_FARM_FRAME");
  });
  it("rejects a 2 MB name on size before the name rules, without a BAD_NAME receipt or a save", async () => {
    const dir = await mkdtemp(join(tmpdir(), "avalon-farm-premise-"));
    try {
      const file = join(dir, "farm.json"), engine = await FailureFarmEngine.open(new FileFarmStore(file), world()), bytes = await readFile(file, "utf8");
      const huge = { kind: "LAUNCH", wallet: "holder", key: "huge", ticker: "TERN", name: "N".repeat(2 * 1024 * 1024), fee: LP.LAUNCH_FEE, nowMs: 0 };
      expect(() => commandFarm(engine.snapshot(), huge)).toThrow("INVALID_FARM_COMMAND");
      await expect(engine.execute(huge)).rejects.toThrow("INVALID_FARM_COMMAND");
      expect(engine.snapshot().receipts["holder:huge"]).toBeUndefined();
      expect(await readFile(file, "utf8")).toBe(bytes);
      // The same key with an ordinary over-long (but bounded) name reaches the name rules as a persisted refusal.
      expect(await engine.execute({ ...huge, name: "N".repeat(200) })).toEqual({ kind: "REFUSED", code: "BAD_NAME" });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("refuses checkpoint strings over 4,096 units", () => {
    const s = world();
    expect(() => parseFarm({ ...s, coins: { GULL: { ...s.coins.GULL!, name: "n".repeat(FARM_LIMITS.checkpointString + 1) } } })).toThrow("BAD_FARM_CHECKPOINT");
  });
  it("refuses to save over 16 MiB or to read an oversized file, leaving bytes unchanged", async () => {
    const dir = await mkdtemp(join(tmpdir(), "avalon-farm-premise-"));
    try {
      const file = join(dir, "farm.json"), s = world();
      await FailureFarmEngine.open(new FileFarmStore(file), s);
      const bytes = await readFile(file, "utf8");
      const big = structuredClone(s);
      for (let i = 0; i < 4_200; i++) big.receipts[`holder:r${i}`] = { fingerprint: "x".repeat(4_000), reply: { kind: "REFUSED", code: "BAD_AMOUNT" } };
      expect(() => parseFarm(big)).not.toThrow();
      await expect(new FileFarmStore(file).save(big)).rejects.toThrow("BAD_FARM_CHECKPOINT");
      expect(await readFile(file, "utf8")).toBe(bytes);
      const oversized = bytes + " ".repeat(FARM_LIMITS.checkpointBytes + 1 - Buffer.byteLength(bytes));
      await writeFile(file, oversized);
      await expect(FailureFarmEngine.open(new FileFarmStore(file))).rejects.toThrow("BAD_FARM_CHECKPOINT");
      expect((await readFile(file, "utf8")).length).toBe(oversized.length);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("rejects a v1 checkpoint without migrating it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "avalon-farm-premise-"));
    try {
      const file = join(dir, "farm.json"), s = world();
      const coin: Record<string, unknown> = { ...s.coins.GULL! }; delete coin.closes;
      const text = JSON.stringify({ ...s, v: 1, coins: { GULL: coin } });
      await writeFile(file, text);
      await expect(FailureFarmEngine.open(new FileFarmStore(file), createFarm("x", [{ id: "a", kind: "PLAYER", cash: 1 }]))).rejects.toThrow("BAD_FARM_CHECKPOINT");
      expect(await readFile(file, "utf8")).toBe(text);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
