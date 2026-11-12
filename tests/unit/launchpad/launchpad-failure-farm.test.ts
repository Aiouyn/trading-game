import { describe, expect, it } from "vitest";
import { createFarm, commandFarm, advanceFarm, cashTotal, publicCoins, walletValue, tokenTotal, assertConservation } from "@/server/launchpad/failureFarm/engine";
import { parseFarm } from "@/server/launchpad/failureFarm/checkpoint";
import { FailureFarmEngine, FileFarmStore, type FarmStore } from "@/server/launchpad/failureFarm/store";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FarmState, FarmFrame, FarmCommand } from "@/server/launchpad/failureFarm/model";
import { Draws } from "@/server/market/meme";
import { LP } from "@/launchpad/rules";

const genesis = () => createFarm("farm-test", [
  { id: "creator", kind: "PLAYER", cash: 10_000_000 },
  { id: "holder", kind: "PLAYER", cash: 20_000_000 },
  { id: "launcher", kind: "NPC", cash: 20_000_000 },
]);
const launch = (s: ReturnType<typeof genesis>, ticker = "GULL", wallet = "creator") => commandFarm(s, {
  kind: "LAUNCH", wallet, key: `launch-${ticker}`, ticker, name: `${ticker} Club`, fee: LP.LAUNCH_FEE, nowMs: 0,
}).state;

describe("isolated failure farm", () => {
  it("allows a new player's immediate launch, charges exactly $1,000 once, and never creates cash", () => {
    const initial = genesis(), state = launch(initial);
    expect(state.wallets.creator?.cash).toBe(9_900_000);
    expect(cashTotal(state)).toBe(initial.initialCash);
    expect(launch(state)).toEqual(state);
    expect(state.coins.GULL?.venue.kind).toBe("CURVE");
  });
  it.each([
    { ticker: "HALC", name: "Gull Club", code: "TICKER_TAKEN" },
    { ticker: "ORCA", name: "Gull Club", code: "TICKER_TAKEN" },
    { ticker: "GULL", name: "hAlCyOn ShIpPiNg", code: "NAME_TAKEN" },
    { ticker: "GULL", name: "halc", code: "NAME_TAKEN" },
  ])("rejects reserved catalog identity $ticker / $name without a fee", ({ ticker, name, code }) => {
    const initial = genesis();
    const result = commandFarm(initial, { kind: "LAUNCH", wallet: "creator", key: "reserved", ticker, name, fee: LP.LAUNCH_FEE, nowMs: 0 });
    expect(result.reply).toEqual({ kind: "REFUSED", code });
    expect(result.state.wallets).toEqual(initial.wallets);
    expect(result.state.coins).toEqual(initial.coins);
    expect(result.state.sink).toBe(initial.sink);
    expect(cashTotal(result.state)).toBe(initial.initialCash);
  });
  it("delists after exactly seven thin days, retains wallet tokens and marks them zero", () => {
    const bought = commandFarm(launch(genesis()), { kind: "TRADE", wallet: "holder", key: "buy", ticker: "GULL", side: "BUY", amount: 50_000 }).state;
    const before = advanceFarm(bought, Array.from({ length: 167 }, (_, i) => ({ hour: i + 1, coins: {} })));
    expect(publicCoins(before)).toHaveLength(1);
    const after = advanceFarm(before, [{ hour: 168, coins: {} }]);
    expect(publicCoins(after)).toHaveLength(0);
    expect(after.wallets.holder?.tokens.GULL).toBeGreaterThan(0);
    expect(walletValue(after, "holder", "GULL")).toBe(0);
    expect(cashTotal(after)).toBe(after.initialCash);
  });
});

const frames = (start: number, end: number): FarmFrame[] => Array.from({ length: end - start }, (_, i) => ({ hour: start + i + 1, coins: {} }));
const buy = (s: FarmState, wallet: string, amount: number, key = `buy-${s.hour}`) => commandFarm(s, { kind: "TRADE", wallet, key, ticker: "GULL", side: "BUY", amount });
function graduated() {
  let s = launch(genesis());
  s = buy(s, "creator", 150_000, "creator-dev-buy").state;
  s = buy(s, "holder", 10_000_000, "graduate").state;
  expect(s.coins.GULL?.venue.kind).toBe("BOOK");
  return s;
}
function sellEachHour(prior: FarmState, wallet: string, count: number, amount: number) {
  let s = prior, sold = 0;
  for (let i = 0; i < count; i++) {
    s = advanceFarm(s, [{ hour: s.hour + 1, coins: {} }]);
    const result = commandFarm(s, { kind: "TRADE", wallet, key: `sell-${s.hour}`, ticker: "GULL", side: "SELL", amount });
    s = result.state;
    if (result.reply.kind === "FILLED") sold += result.reply.qty;
    assertConservation(s);
  }
  return { state: s, sold };
}
describe("failure-farm boundaries and real finite settlement", () => {
  it("reuses curve graduation and book fills, preserves 1B tokens, and cannot sell an unowned token", () => {
    const s = graduated(), before = s.wallets.holder?.tokens.GULL ?? 0;
    expect(tokenTotal(s, "GULL")).toBe(LP.SUPPLY);
    const denied = commandFarm(s, { kind: "TRADE", wallet: "launcher", key: "oversell", ticker: "GULL", side: "SELL", amount: 1 });
    expect(denied.reply).toEqual({ kind: "REFUSED", code: "HELD" });
    const r = sellEachHour(s, "holder", 1, before);
    expect(r.sold).toBeGreaterThan(0); expect(r.sold).toBeLessThan(before);
    expect(cashTotal(r.state)).toBe(s.initialCash);
    expect(tokenTotal(r.state, "GULL")).toBe(LP.SUPPLY);
  });
  it("refusals are economic no-ops; replay conflicts, caps, cooldown and finite cash are enforced", () => {
    const s = launch(genesis());
    const cap = buy(s, "creator", 2_000_000);
    expect(cap.reply).toEqual({ kind: "REFUSED", code: "CREATOR_CAP" });
    expect(cap.state.coins).toEqual(s.coins); expect(cap.state.wallets).toEqual(s.wallets);
    const c = commandFarm(s, { kind: "LAUNCH", wallet: "creator", key: "launch-GULL", ticker: "COVE", name: "Cove Club", fee: LP.LAUNCH_FEE, nowMs: 0 });
    expect(c.reply).toEqual({ kind: "REFUSED", code: "IDEMPOTENCY_CONFLICT" });
    const cd = commandFarm(s, { kind: "LAUNCH", wallet: "creator", key: "cooldown", ticker: "COVE", name: "Cove Club", fee: LP.LAUNCH_FEE, nowMs: 1 });
    expect(cd.reply).toEqual({ kind: "REFUSED", code: "COOLDOWN" });
    const empty = createFarm("poor", [{ id: "newbie", kind: "PLAYER", cash: LP.LAUNCH_FEE - 1 }]);
    expect(commandFarm(empty, { kind: "LAUNCH", wallet: "newbie", key: "launch", ticker: "COVE", name: "Cove Club", fee: LP.LAUNCH_FEE, nowMs: 0 }).reply).toEqual({ kind: "REFUSED", code: "CASH" });
  });
  it("a finite buyer never overspends including fees even on a large requested listed fill", () => {
    let s = graduated();
    // Creator's cash is finite, and a requested buy is priced by the base's actual book law.
    const r = buy(s, "creator", LP.SUPPLY, "large-listed-buy"); s = r.state;
    expect(r.reply.kind).toBe("FILLED"); expect(s.wallets.creator?.cash).toBeGreaterThanOrEqual(0);
    expect(tokenTotal(s, "GULL")).toBe(LP.SUPPLY); expect(cashTotal(s)).toBe(s.initialCash);
  });
  it("equality at $1,000 is not thin; replenishment resets seven-day clock; no market-cap substitute", () => {
    const base = launch(genesis());
    let s = advanceFarm(base, frames(0, 167));
    s = buy(s, "holder", 101_011).state; // exactly 100,000 real cents, excluding virtual X0
    const c = s.coins.GULL!;
    expect(c.venue.kind === "CURVE" ? c.venue.curve.x - LP.X0 : -1).toBe(100_000);
    expect(c.thinSince).toBeNull();
    s = advanceFarm(s, frames(167, 169));
    expect(s.coins.GULL?.discovery.kind).toBe("LIVE");
    const q = s.wallets.holder?.tokens.GULL ?? 0;
    s = commandFarm(s, { kind: "TRADE", wallet: "holder", key: "withdraw-through-sale", ticker: "GULL", side: "SELL", amount: q }).state;
    expect(s.coins.GULL?.thinSince).toBe(169);
    expect(advanceFarm(s, frames(169, 336)).coins.GULL?.discovery.kind).toBe("LIVE");
    expect(advanceFarm(s, frames(169, 337)).coins.GULL?.discovery).toEqual({ kind: "DELISTED", hour: 337 });
  });
  it("dead tokens stay owned and sellable from remaining curve cash but cannot be re-pumped or resurrected", () => {
    let s = buy(launch(genesis()), "holder", 50_000).state;
    s = advanceFarm(s, frames(0, 168));
    const tokens = s.wallets.holder?.tokens.GULL ?? 0;
    expect(tokens).toBeGreaterThan(0); expect(walletValue(s, "holder", "GULL")).toBe(0);
    expect(buy(s, "holder", 20_000, "dead-buy").reply).toEqual({ kind: "REFUSED", code: "DELISTED" });
    const exit = commandFarm(s, { kind: "TRADE", wallet: "holder", key: "dead-exit", ticker: "GULL", side: "SELL", amount: tokens });
    expect(exit.reply.kind).toBe("FILLED"); expect(exit.state.coins.GULL?.discovery.kind).toBe("DELISTED");
    expect(cashTotal(exit.state)).toBe(s.initialCash);
    const recovery = commandFarm(exit.state, { kind: "LAUNCH", wallet: "holder", key: "new-market", ticker: "COVE", name: "Cove Club", fee: LP.LAUNCH_FEE, nowMs: 1 });
    expect(recovery.reply.kind).toBe("LAUNCHED"); expect(publicCoins(recovery.state).map((c) => c.ticker)).toEqual(["COVE"]);
    expect(cashTotal(recovery.state)).toBe(s.initialCash);
  });
  it("creator early-exit flags count executed partial fills, not requested quantities", () => {
    const s = graduated(), g = s.coins.GULL!.venue;
    if (g.kind !== "BOOK") throw new Error("fixture not graduated");
    const once = sellEachHour(s, "creator", 1, s.wallets.creator?.tokens.GULL ?? 0);
    expect(once.sold).toBeLessThan(g.creatorAtGraduation / 2); expect(once.state.coins.GULL?.rug).toBeNull();
    const dumped = sellEachHour(once.state, "creator", 100, 1_000_000);
    expect(dumped.sold + once.sold).toBeGreaterThanOrEqual(g.creatorAtGraduation / 2);
    expect(dumped.state.coins.GULL?.rug?.kind).toBe("EARLY_EXIT");
    const view = JSON.stringify(publicCoins(dumped.state));
    expect(view).not.toContain('"creator"'); expect(view).not.toContain('"holder"');
  });
  it("honest small sales and exits after the 24-day window do not invent a rug flag", () => {
    const s = graduated();
    const slow = sellEachHour(s, "creator", 3, 1_000);
    expect(slow.state.coins.GULL?.rug).toBeNull();
    const late = advanceFarm(s, frames(0, 24 * 24));
    const result = sellEachHour(late, "creator", 100, 1_000_000);
    expect(result.state.coins.GULL?.rug).toBeNull();
  });
  it("daily dump flags require both actual 3% supply sold AND the 40% same-day fall", () => {
    let s = advanceFarm(graduated(), frames(0, 599));
    const startMark = s.coins.GULL!.mark;
    let sold = 0;
    for (let i = 0; i < 24; i++) {
      s = advanceFarm(s, [{ hour: 600 + i, coins: { GULL: { mark: Math.floor(startMark * .5) } } }]);
      const r = commandFarm(s, { kind: "TRADE", wallet: "creator", key: `dump-${i}`, ticker: "GULL", side: "SELL", amount: 3_000_000 });
      s = r.state; if (r.reply.kind === "FILLED") sold += r.reply.qty;
    }
    expect(sold).toBeGreaterThanOrEqual(.03 * LP.SUPPLY);
    expect(s.coins.GULL?.rug?.kind).toBe("DAILY_DUMP");
  });
  it("NPC rally sales are at most 20% actual hourly volume and never more tokens than owned", () => {
    let s = launch(genesis(), "GULL", "launcher");
    s = buy(s, "launcher", 2_000_000).state;
    const was = s.wallets.launcher?.tokens.GULL ?? 0, volume = s.coins.GULL!.hourVolume;
    const next = advanceFarm(s, [{ hour: 1, coins: {} }]);
    const sold = was - (next.wallets.launcher?.tokens.GULL ?? 0);
    expect(sold).toBe(Math.floor(volume * .2)); expect(sold).toBeLessThanOrEqual(was);
    expect(cashTotal(next)).toBe(s.initialCash);
  });
  it("only NPC launchers abandon, with deterministic low-hype hourly draws, and never restart activity", () => {
    let npc = launch(genesis(), "GULL", "launcher");
    npc = advanceFarm(npc, frames(0, 100));
    expect(npc.coins.GULL?.launcher.kind).toBe("NPC_ABANDONED");
    const abandoned = npc.coins.GULL!.launcher;
    const again = advanceFarm(npc, [{ hour: 101, coins: { GULL: { mentions: 1, hypeShock: 1 } } }]);
    expect(again.coins.GULL?.launcher).toEqual(abandoned);
    expect(buy(again, "launcher", 1000, "abandoned-buy").reply).toEqual({ kind: "REFUSED", code: "ABANDONED" });
    const player = advanceFarm(launch(genesis()), frames(0, 100));
    expect(player.coins.GULL?.launcher).toEqual({ kind: "PLAYER" });
    const hot = advanceFarm(launch(genesis(), "GULL", "launcher"), Array.from({ length: 100 }, (_, i) => ({ hour: i + 1, coins: { GULL: { mentions: 1 } } })));
    expect(hot.coins.GULL?.launcher.kind).toBe("NPC_ACTIVE");
  });
  it("batch jump exactly equals per-hour stepping and refuses unobserved gaps or non-endogenous curve marks", () => {
    const s = graduated(), path = frames(0, 200);
    const jumped = advanceFarm(s, path);
    const stepped = path.reduce((state, f) => advanceFarm(state, [f]), s);
    expect(jumped).toEqual(stepped);
    expect(() => advanceFarm(s, [{ hour: 2, coins: {} }])).toThrow("NON_CONSECUTIVE_FRAME");
    expect(() => advanceFarm(launch(genesis()), [{ hour: 1, coins: { GULL: { mark: 1 } } }])).toThrow("BAD_OBSERVATION");
  });
});

describe("failure-farm durable boundary", () => {
  it("strictly parses versions, cash/supply, timelines, references and unexpected fields", () => {
    const s = graduated(); expect(parseFarm(JSON.parse(JSON.stringify(s)))).toEqual(s);
    for (const bad of [{ ...s, v: 1 }, { ...s, v: 3 }, { ...s, surprise: true }, { ...s, sink: s.sink + 1 }, { ...s, hour: -1 }, { ...s, coins: { GULL: { ...s.coins.GULL, creator: "missing" } } }]) {
      expect(() => parseFarm(bad)).toThrow();
    }
    const tampered = structuredClone(s); tampered.wallets.creator!.tokens.GULL!++;
    expect(() => parseFarm(tampered)).toThrow("TOKEN_CONSERVATION");
  });
  it("a fresh real file store restarts byte-equivalent, replays once, and continues identically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "avalon-failure-")), file = join(dir, "farm.json"), store = new FileFarmStore(file);
    const e = await FailureFarmEngine.open(store, graduated());
    await e.advance(frames(0, 80)); const saved = e.snapshot();
    const restarted = await FailureFarmEngine.open(new FileFarmStore(file));
    expect(restarted.snapshot()).toEqual(saved);
    await e.advance(frames(80, 200)); await restarted.advance(frames(80, 200));
    expect(e.snapshot()).toEqual(restarted.snapshot());
    const before = restarted.snapshot();
    expect(await restarted.execute({ kind: "TRADE", wallet: "holder", key: "graduate", ticker: "GULL", side: "BUY", amount: 10_000_000 })).toMatchObject({ kind: "FILLED" });
    expect(restarted.snapshot()).toEqual(before);
    const corrupt = '{"v":99}'; await writeFile(file, corrupt);
    await expect(FailureFarmEngine.open(new FileFarmStore(file), genesis())).rejects.toThrow("BAD_FARM_CHECKPOINT");
    expect(await readFile(file, "utf8")).toBe(corrupt);
  });
  it.each([false, true])("replays reordered launch and trade fields across restart (legacy receipt=%s)", async (legacy) => {
    const dir = await mkdtemp(join(tmpdir(), "avalon-reordered-")), file = join(dir, "farm.json");
    let engine = await FailureFarmEngine.open(new FileFarmStore(file), genesis());
    const commands: FarmCommand[] = [
      { kind: "LAUNCH", wallet: "creator", key: "ordered-launch", ticker: "GULL", name: "Gull Club", fee: LP.LAUNCH_FEE, nowMs: 0 },
      { kind: "TRADE", wallet: "holder", key: "ordered-trade", ticker: "GULL", side: "BUY", amount: 50_000 },
    ];
    for (const cmd of commands) {
      const first = await engine.execute(cmd);
      expect(first.kind).toBe(cmd.kind === "LAUNCH" ? "LAUNCHED" : "FILLED");
      if (legacy) {
        const old = engine.snapshot();
        old.receipts[`${cmd.wallet}:${cmd.key}`]!.fingerprint = JSON.stringify(cmd);
        await new FileFarmStore(file).save(old);
      }
      engine = await FailureFarmEngine.open(new FileFarmStore(file));
      const before = engine.snapshot(), bytes = await readFile(file, "utf8");
      const reordered: FarmCommand = cmd.kind === "LAUNCH"
        ? { nowMs: cmd.nowMs, fee: cmd.fee, name: cmd.name, ticker: cmd.ticker, key: cmd.key, wallet: cmd.wallet, kind: cmd.kind }
        : { amount: cmd.amount, side: cmd.side, ticker: cmd.ticker, key: cmd.key, wallet: cmd.wallet, kind: cmd.kind };
      expect(await engine.execute(reordered)).toEqual(first);
      expect(engine.snapshot()).toEqual(before);
      expect(await readFile(file, "utf8")).toBe(bytes);
      const changed: FarmCommand = cmd.kind === "LAUNCH" ? { ...cmd, name: "Other Club" } : { ...cmd, amount: cmd.amount + 1 };
      expect(await engine.execute(changed)).toEqual({ kind: "REFUSED", code: "IDEMPOTENCY_CONFLICT" });
      expect(engine.snapshot()).toEqual(before);
      expect(await readFile(file, "utf8")).toBe(bytes);
    }
  });
  it("failed save rolls back, concurrent identical launch charges once, and caller mutations cannot leak in", async () => {
    let persisted: FarmState | null = null, fail = false;
    const store: FarmStore = { load: async () => persisted, save: async (s) => { if (fail) throw new Error("disk full"); persisted = structuredClone(s); } };
    const engine = await FailureFarmEngine.open(store, genesis()), before = engine.snapshot();
    const cmd = { kind: "LAUNCH", wallet: "creator", key: "one", ticker: "GULL", name: "Gull Club", fee: LP.LAUNCH_FEE, nowMs: 0 } satisfies Parameters<typeof commandFarm>[1];
    fail = true; await expect(engine.execute(cmd)).rejects.toThrow("disk full"); expect(engine.snapshot()).toEqual(before);
    fail = false; const replies = await Promise.all([engine.execute(cmd), engine.execute(cmd)]);
    expect(replies[0]).toEqual(replies[1]); expect(engine.snapshot().sink).toBe(LP.LAUNCH_FEE);
    const leaked = engine.snapshot(); leaked.wallets.creator!.cash = 0;
    expect(engine.snapshot().wallets.creator?.cash).toBe(9_900_000);
  });
});

describe("adversarial failure paths", () => {
  it("does not flag a sale one token below half the graduation holding, then flags crossing it", () => {
    let s = launch(genesis());
    s = buy(s, "creator", 2_000, "small-dev-buy").state;
    s = buy(s, "holder", 10_000_000, "small-graduate").state;
    const h = s.wallets.creator?.tokens.GULL ?? 0;
    const below = commandFarm(s, { kind: "TRADE", wallet: "creator", key: "below-half", ticker: "GULL", side: "SELL", amount: Math.ceil(h / 2) - 1 });
    expect(below.reply).toMatchObject({ kind: "FILLED", qty: Math.ceil(h / 2) - 1 });
    expect(below.state.coins.GULL?.rug).toBeNull();
    const crossed = commandFarm(below.state, { kind: "TRADE", wallet: "creator", key: "cross-half", ticker: "GULL", side: "SELL", amount: 1_000 });
    expect(crossed.reply.kind).toBe("FILLED"); expect(crossed.state.coins.GULL?.rug?.kind).toBe("EARLY_EXIT");
  });
  it("every random interleaved trade and hour conserves money and supply, including refused orders", () => {
    let s = graduated(); const random = new Draws("failure-farm-conservation-2026");
    for (let i = 0; i < 400; i++) {
      if (i % 3 === 0) s = advanceFarm(s, [{ hour: s.hour + 1, coins: {} }]);
      const wallet = random.uniform() < .5 ? "creator" : "holder", side = random.uniform() < .5 ? "BUY" : "SELL";
      s = commandFarm(s, { kind: "TRADE", wallet, side, amount: 1 + Math.floor(random.uniform() * LP.SUPPLY), ticker: "GULL", key: `random-${i}` }).state;
      expect(cashTotal(s)).toBe(50_000_000); expect(tokenTotal(s, "GULL")).toBe(1_000_000_000);
      expect(Object.values(s.wallets).every((w) => w.cash >= 0 && Object.values(w.tokens).every((q) => q >= 0))).toBe(true);
    }
    expect(parseFarm(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("captures queued commands and frames before the caller can mutate them", async () => {
    let persisted: FarmState | null = null;
    const store: FarmStore = { load: async () => persisted, save: async (s) => { persisted = structuredClone(s); } };
    const engine = await FailureFarmEngine.open(store, launch(genesis()));
    const cmd = { kind: "TRADE", wallet: "holder", key: "capture", ticker: "GULL", side: "BUY", amount: 20_000 } satisfies Parameters<typeof commandFarm>[1];
    const pending = engine.execute(cmd); cmd.amount = 0; expect((await pending).kind).toBe("FILLED");
    const path = [{ hour: 1, coins: {} }]; const advancing = engine.advance(path); path[0]!.hour = 9;
    await advancing; expect(engine.snapshot().hour).toBe(1);
  });
});
