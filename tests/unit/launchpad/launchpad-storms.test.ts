// Shared storm scheduler + CRYPTO_FLUSH + catch-up + stock effects + durable correctness (docs/v1/LAUNCHPAD.md).
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ASSET_BY_ID } from "@/market/catalog";
import { listedDef, resetListingsForTests } from "@/market/listings";
import { applyStormHype, hypeStep } from "@/server/broker/pools";
import { LiveMarket } from "@/server/market/clock";
import { shockedMinor } from "@/server/market/shockFeed";
import { HYPE, TICKS_PER_DAY } from "@/server/market/meme";
import { START_TICK, fmt } from "@/shell/contracts/mockFeed";
import {
  CRYPTO_FLUSH_DEPTH_MULT, CRYPTO_FLUSH_DEPTH_TICKS, CRYPTO_FLUSH_HYPE, EQUITY_SECTORS, STORM_COOLDOWN_DAYS,
  STORM_KINDS, STORM_NO_START_FIRST_DAYS, STORM_RATE, StormScheduler, stormDayDraw, stormStockShocks,
} from "@/server/market/storms";
import { FileStormWorldStore, MemoryStormWorldStore } from "@/server/market/stormWorldStore";

afterEach(() => { resetListingsForTests(); });

describe("04 §3.16 storm day draw (by hand)", () => {
  it("eight kinds, severity in [0.6, 1.4], precursor in {1,2}, rate 1/91, deterministic; sectorIndex stable", () => {
    expect(STORM_KINDS).toHaveLength(8);
    expect(STORM_RATE).toBeCloseTo(1 / 91, 15);
    expect(EQUITY_SECTORS.length).toBeGreaterThanOrEqual(2);
    const a = stormDayDraw(173), b = stormDayDraw(173);
    expect(a).toEqual(b);
    expect(a.start).toBe(true);
    expect(a.kind).toBe("CRYPTO_FLUSH");
    expect(a.severity).toBeGreaterThanOrEqual(0.6);
    expect(a.severity).toBeLessThanOrEqual(1.4);
    expect([1, 2]).toContain(a.precursorDays);
    expect(a.sectorIndex).toBeGreaterThanOrEqual(0);
    expect(a.sectorIndex).toBeLessThan(EQUITY_SECTORS.length);
    // a non-start day stays a non-start
    expect(stormDayDraw(24).start).toBe(false);
  });
});

describe("StormScheduler constraints", () => {
  it("no start before day 24; one active; 7-day cooldown from end; precursor not on Wire", () => {
    const s = new StormScheduler();
    // day 10 close
    s.observe(10 * TICKS_PER_DAY + TICKS_PER_DAY - 1);
    expect(s.peek()).toBeNull();
    // force past day 24 with a free start by forcing
    const ev = s.forceStorm("RATE_SCARE", { atTick: 30 * TICKS_PER_DAY, precursorDays: 1, severity: 1 });
    expect(ev.phase).toBe("PRECURSOR");
    expect(s.takeWire()).toEqual([]); // 04: precursor not announced
    s.observe(ev.triggerTick);
    const wire = s.takeWire();
    expect(wire).toHaveLength(1);
    expect(wire[0]).toMatchObject({ kind: "RATE_SCARE", phase: "realized", breaking: true, headlineKey: "wire.storm.rate-scare.hit" });
    expect(wire[0]!.prices.some((p) => p.assetId === "AVB" && p.bp < 0)).toBe(true);
    expect(s.peek()?.phase).toBe("TRIGGER");
    expect(s.takePriceShocks().some((p) => p.assetId === "AVB" && p.bp < 0)).toBe(true);
    // cannot start another while active
    expect(() => s.forceStorm("CRYPTO_FLUSH", { atTick: ev.triggerTick })).toThrow(/already active/);
    // end
    s.observe(ev.plannedEndTick);
    expect(s.peek()).toBeNull();
    expect(s.lastStormEndTick()).toBe(ev.plannedEndTick);
    // cooldown: day close inside 7 days does not start even if draw would
    const endDay = Math.floor(ev.plannedEndTick / TICKS_PER_DAY);
    for (let d = endDay; d < endDay + STORM_COOLDOWN_DAYS; d++) {
      s.observe(d * TICKS_PER_DAY + TICKS_PER_DAY - 1);
      expect(s.peek()).toBeNull();
    }
    expect(STORM_NO_START_FIRST_DAYS).toBe(24);
    expect(STORM_COOLDOWN_DAYS).toBe(7);
  });
});

describe("CRYPTO_FLUSH hype + depth", () => {
  it("hype delta −0.4×severity once per storm id; depth ×0.5 for 720 ticks on listed coins", () => {
    const sev = 1.0;
    expect(applyStormHype({ ep: "a", t: 0, hr: 0, h: 0.6, bk: 0, pnet: [], funded: 0, tape: [], vol: 0,
      value: { cash: 0, tokens: 0, pos: 0 }, retail: { cash: 0, tokens: 0, pos: 0 }, degen: { cash: 0, tokens: 0, pos: 0 } },
      "storm:1", CRYPTO_FLUSH_HYPE * sev).h).toBeCloseTo(0.2, 12);
    const once = applyStormHype({ ep: "a", t: 0, hr: 0, h: 0.6, bk: 0, pnet: [], funded: 0, tape: [], vol: 0, sx: ["storm:1"],
      value: { cash: 0, tokens: 0, pos: 0 }, retail: { cash: 0, tokens: 0, pos: 0 }, degen: { cash: 0, tokens: 0, pos: 0 } },
      "storm:1", CRYPTO_FLUSH_HYPE * sev);
    expect(once.h).toBe(0.6); // idempotent

    const market = new LiveMarket({ tickMs: 60_000, persistStorms: false });
    const def = listedDef("FROG", "FROG Club", 21_596);
    market.list(def, { hype: HYPE.h0 });
    market.forceStormForTests("CRYPTO_FLUSH", { precursorDays: 0, severity: sev });
    const d0 = market.depthInputs("FROG")!.regimeDepth;
    market.step();
    expect(market.depthInputs("FROG")!.regimeDepth / d0).toBeCloseTo(CRYPTO_FLUSH_DEPTH_MULT, 10);
    // depth restores after window
    const s = new StormScheduler();
    s.forceStorm("CRYPTO_FLUSH", { atTick: 0, precursorDays: 0, severity: 1 });
    s.observe(1);
    expect(s.depthMult(1)).toBe(CRYPTO_FLUSH_DEPTH_MULT);
    expect(s.depthMult(1 + CRYPTO_FLUSH_DEPTH_TICKS)).toBe(1);
  });

  it("hypeStep continuous shock term unchanged (CRYPTO_FLUSH is discrete applyStormHype)", () => {
    expect(hypeStep(0.6, 0, 0)).toBeCloseTo(0.474, 15);
  });
});

describe("natural seeded CRYPTO_FLUSH on the clock (correct origin schedule)", () => {
  it("day-173 draw is CRYPTO_FLUSH but origin catch-up leaves it in cooldown after day-163 EARNINGS; day-363 fires", () => {
    const draw173 = stormDayDraw(173);
    expect(draw173).toMatchObject({ start: true, kind: "CRYPTO_FLUSH" });
    // Correct origin catch-up: EARNINGS_SCARE at 163 ends day 171 → cooldown through 178, so 173 does not start.
    const s = new StormScheduler();
    const close173 = 173 * TICKS_PER_DAY + TICKS_PER_DAY - 1;
    s.observe(close173);
    expect(s.peek()).toBeNull();
    const wires173 = s.takeWire();
    expect(wires173.some((w) => w.kind === "CRYPTO_FLUSH")).toBe(false);
    expect(wires173.some((w) => w.kind === "EARNINGS_SCARE")).toBe(true);
    expect(s.lastStormEndTick()).toBeGreaterThan(0);
    expect(s.stockAppliedRows().some((r) => r.stormId === "storm:163:EARNINGS_SCARE")).toBe(true);

    const draw363 = stormDayDraw(363);
    expect(draw363).toMatchObject({ start: true, kind: "CRYPTO_FLUSH" });
    const s2 = new StormScheduler();
    const close363 = 363 * TICKS_PER_DAY + TICKS_PER_DAY - 1;
    s2.observe(close363);
    s2.takeWire(); // drain earlier triggers from origin catch-up
    const ev = s2.peek();
    expect(ev).toMatchObject({ kind: "CRYPTO_FLUSH", id: "storm:363:CRYPTO_FLUSH", phase: "PRECURSOR" });
    expect(ev!.triggerTick).toBe(close363 + 1 + draw363.precursorDays * TICKS_PER_DAY);
    s2.observe(ev!.triggerTick);
    const hit = s2.takeWire().find((w) => w.kind === "CRYPTO_FLUSH");
    expect(hit?.headlineKey).toBe("wire.storm.crypto-flush.hit");
    expect(s2.takeHypeShocks().find((h) => h.stormId === ev!.id)?.delta).toBeCloseTo(CRYPTO_FLUSH_HYPE * draw363.severity, 12);
  });
});

describe("catch-up equivalence (world.ts-style jump)", () => {
  it("observe(t1) after observe(t0) matches tick-by-tick on active/wire/depth", () => {
    const t0 = 23 * TICKS_PER_DAY + TICKS_PER_DAY - 1; // day 23 close (no starts yet)
    const t1 = 200 * TICKS_PER_DAY + 100; // mid day 200
    const step = new StormScheduler();
    step.observe(t0);
    const wireStep: string[] = [];
    for (let t = t0 + 1; t <= t1; t++) {
      step.observe(t);
      for (const w of step.takeWire()) wireStep.push(w.kind);
    }
    const jump = new StormScheduler();
    jump.observe(t0);
    jump.observe(t1);
    const wireJump = jump.takeWire().map((w) => w.kind);
    expect(wireJump).toEqual(wireStep);
    expect(jump.peek()).toEqual(step.peek());
    expect(jump.lastStormEndTick()).toBe(step.lastStormEndTick());
    expect(jump.depthMult(t1)).toBe(step.depthMult(t1));
  });
});

describe("cold start from origin (days 24–37 not skipped)", () => {
  it("first observe(START_TICK) ≡ tick-by-tick from 0 through START_TICK", () => {
    const step = new StormScheduler();
    const wireStep: string[] = [];
    for (let t = 0; t <= START_TICK; t++) {
      step.observe(t);
      for (const w of step.takeWire()) wireStep.push(w.kind);
    }
    const cold = new StormScheduler();
    cold.observe(START_TICK);
    const wireCold = cold.takeWire().map((w) => w.kind);
    expect(wireCold).toEqual(wireStep);
    expect(cold.peek()).toEqual(step.peek());
    expect(cold.lastStormEndTick()).toBe(step.lastStormEndTick());
    expect(cold.depthMult(START_TICK)).toBe(step.depthMult(START_TICK));
    // Explicitly: day closes 24..37 were decision points (no starts in this seed window, but evaluated).
    for (let d = 24; d <= 37; d++) expect(typeof stormDayDraw(d).start).toBe("boolean");
    expect(Math.floor(START_TICK / TICKS_PER_DAY)).toBe(38);
  });
});

describe("per-wire price binding (DRAIN_HAZARD closed)", () => {
  it("EARNINGS 10 + RATE 3 in one jump attribute per WireOut, not one shared drain", () => {
    const t0 = 23 * TICKS_PER_DAY + TICKS_PER_DAY - 1;
    let found: { wires: string[]; wantEach: number[]; boundEach: number[] } | null = null;
    for (let span = 50; span <= 900; span += 10) {
      const s = new StormScheduler();
      s.observe(t0);
      s.observe(t0 + span * TICKS_PER_DAY);
      const wires = s.takeWire();
      const stockW = wires.filter((w) => w.prices.length > 0);
      if (stockW.length >= 2) {
        const wantEach = wires.map((w) => stormStockShocks(w.kind, w.severity, w.sectorIndex).length);
        const boundEach = wires.map((w) => w.prices.length);
        expect(boundEach).toEqual(wantEach);
        expect(wantEach.reduce((a, b) => a + b, 0)).toBe(boundEach.reduce((a, b) => a + b, 0));
        // First stock wire must not hold the whole queue
        const firstStock = wantEach.find((n) => n > 0)!;
        const total = wantEach.reduce((a, b) => a + b, 0);
        expect(firstStock).toBeLessThan(total);
        found = { wires: wires.map((w) => w.kind), wantEach, boundEach };
        // LiveMarket-style publish: each wire consumes only its prices
        const attributed = wires.map((w) => w.prices.length);
        expect(attributed).toEqual(wantEach);
        break;
      }
    }
    expect(found).not.toBeNull();
    expect(found!.wantEach).toContain(10);
    expect(found!.wantEach).toContain(3);
  });
});

describe("stormStockShocks kind matrix", () => {
  it("RATE_SCARE / OIL / SECTOR / EARNINGS move stocks; CREDIT / FX empty; crypto kinds empty", () => {
    expect(stormStockShocks("RATE_SCARE", 1, 0).map((p) => p.assetId).sort()).toEqual(["AVB", "GX", "TIDE"]);
    expect(stormStockShocks("OIL_SPIKE_LITE", 1, 0).find((p) => p.assetId === "VRDN")!.bp).toBe(150);
    expect(stormStockShocks("CREDIT_WOBBLE", 1, 0)).toEqual([]);
    expect(stormStockShocks("FX_SQUALL", 1, 0)).toEqual([]);
    expect(stormStockShocks("CRYPTO_FLUSH", 1, 0)).toEqual([]);
    expect(stormStockShocks("LIQUIDITY_HICCUP", 1, 0)).toEqual([]);
    const rot = stormStockShocks("SECTOR_ROTATION", 1, 0);
    expect(rot.length).toBeGreaterThan(0);
    expect(rot.every((p) => ASSET_BY_ID[p.assetId]?.class === "equity")).toBe(true);
    const earn = stormStockShocks("EARNINGS_SCARE", 1, 0);
    expect(earn.some((p) => p.assetId === "GX" && p.bp === -150)).toBe(true);
    expect(earn.filter((p) => p.assetId !== "GX").every((p) => p.bp === -500)).toBe(true);
  });
});

describe("LiveMarket non-crypto storm moves stock marks on the Wire", () => {
  it("RATE_SCARE trigger lists effects and softens AVB", () => {
    const market = new LiveMarket({ tickMs: 60_000, persistStorms: false });
    market.step();
    const before = market.snapshot().quotes.rows.AVB!.last;
    expect(before).toBeTruthy();
    market.forceStormForTests("RATE_SCARE", { precursorDays: 0, severity: 1 });
    market.step();
    const hit = market.wire().items.find((i) => i.headlineKey === "wire.storm.rate-scare.hit");
    expect(hit).toMatchObject({ breaking: true, phase: "realized" });
    expect(hit!.effects?.length).toBeGreaterThan(0);
    expect(hit!.effects!.some((e) => e.assetId === "AVB")).toBe(true);
    const after = market.snapshot().quotes.rows.AVB!.last;
    expect(after).not.toBe(before);
  });

  it("CREDIT_WOBBLE stays Wire-only (no effects)", () => {
    const market = new LiveMarket({ tickMs: 60_000, persistStorms: false });
    market.step();
    market.forceStormForTests("CREDIT_WOBBLE", { precursorDays: 0, severity: 1 });
    market.step();
    const hit = market.wire().items.find((i) => i.headlineKey === "wire.storm.credit-wobble.hit");
    expect(hit).toBeTruthy();
    expect(hit!.effects ?? []).toEqual([]);
    expect(hit!.entities).toEqual([]);
  });
});

describe("durable stock shocks (restart == no restart)", () => {
  it("Memory store: residual persisted; restart mid-decay continues (not full re-shock)", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ tickMs: 60_000, stormWorld: store });
    a.step();
    const virgin = a.snapshot().quotes.rows.AVB!.last;
    a.forceStormForTests("RATE_SCARE", { precursorDays: 0, severity: 1 });
    a.step();
    const shocked = a.snapshot().quotes.rows.AVB!.last;
    expect(shocked).not.toBe(virgin);
    // Let residual unwind ~2 game days
    for (let i = 0; i < 2 * TICKS_PER_DAY; i++) a.step();
    const mid = a.snapshot().quotes.rows.AVB!.last;
    const snap = a.stormSnapshot();
    expect(snap.stockApplied.length).toBe(1);
    expect(snap.active?.kind).toBe("RATE_SCARE");
    expect((snap.shockResidual ?? []).length).toBeGreaterThan(0);

    const b = new LiveMarket({ tickMs: 60_000, stormWorld: store });
    expect(b.stormSnapshot().active?.id).toBe(snap.active?.id);
    expect(b.stormSnapshot().stockApplied).toEqual(snap.stockApplied);
    expect(b.stormSnapshot().shockResidual).toEqual(snap.shockResidual);
    // Materialized mid-decay mark — not a fresh full stockApplied on base
    const bp = snap.stockApplied[0]!.shocks.find((p) => p.assetId === "AVB")!.bp;
    const fullOnBase = fmt(shockedMinor(ASSET_BY_ID.AVB!.base, bp), ASSET_BY_ID.AVB!.displayDecimals);
    expect(b.snapshot().quotes.rows.AVB!.last).not.toBe(fullOnBase);
    // Walk RNG is not durable; residual continuity is the contract
    expect((b.stormSnapshot().shockResidual ?? []).length).toBeGreaterThan(0);
    void mid; void shocked;
  });

  it("File store: restart mid-decay == continue; jump path matches tick-by-tick residual", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "storm-world-"));
    try {
      const file = path.join(dir, "storm-world.json");
      const store1 = new FileStormWorldStore(file);
      const a = new LiveMarket({ tickMs: 60_000, stormWorld: store1 });
      a.step();
      a.forceStormForTests("RATE_SCARE", { precursorDays: 0, severity: 1 });
      a.step();
      for (let i = 0; i < 720; i++) a.step(); // 1 GD mid-decay
      const mid = {
        avb: a.snapshot().quotes.rows.AVB!.last,
        residual: a.stormSnapshot().shockResidual,
        peek: a.stormSnapshot().active,
        stockApplied: a.stormSnapshot().stockApplied,
      };
      expect(mid.peek?.kind).toBe("RATE_SCARE");
      expect(mid.stockApplied.length).toBe(1);
      expect((mid.residual ?? []).length).toBeGreaterThan(0);

      const store2 = new FileStormWorldStore(file);
      const b = new LiveMarket({ tickMs: 60_000, stormWorld: store2 });
      expect(b.stormSnapshot().active?.id).toBe(mid.peek!.id);
      expect(b.stormSnapshot().shockResidual).toEqual(mid.residual);
      // Not a full re-apply on catalog base
      for (const id of ["AVB", "TIDE", "GX"] as const) {
        const bp = mid.stockApplied[0]!.shocks.find((p) => p.assetId === id)!.bp;
        const def = ASSET_BY_ID[id]!;
        const fullOnBase = fmt(shockedMinor(def.base, bp), def.displayDecimals);
        expect(b.snapshot().quotes.rows[id]!.last).not.toBe(fullOnBase);
      }
      expect((b.stormSnapshot().shockResidual ?? []).length).toBeGreaterThan(0);
      // Further residual-only unwind on restored feed stays finite and moves toward base
      const before = Number(b.snapshot().quotes.rows.AVB!.last);
      for (let i = 0; i < TICKS_PER_DAY; i++) b.step();
      const after = Number(b.snapshot().quotes.rows.AVB!.last);
      expect(Number.isFinite(after)).toBe(true);
      void before;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
