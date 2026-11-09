// Shared storm scheduler + CRYPTO_FLUSH + catch-up + non-crypto stock effects (docs/v1/LAUNCHPAD.md).
import { afterEach, describe, expect, it } from "vitest";
import { ASSET_BY_ID } from "@/market/catalog";
import { listedDef, resetListingsForTests } from "@/market/listings";
import { applyStormHype, hypeStep } from "@/server/broker/pools";
import { LiveMarket } from "@/server/market/clock";
import { HYPE, TICKS_PER_DAY } from "@/server/market/meme";
import {
  CRYPTO_FLUSH_DEPTH_MULT, CRYPTO_FLUSH_DEPTH_TICKS, CRYPTO_FLUSH_HYPE, EQUITY_SECTORS, STORM_COOLDOWN_DAYS,
  STORM_KINDS, STORM_NO_START_FIRST_DAYS, STORM_RATE, StormScheduler, stormDayDraw, stormStockShocks,
} from "@/server/market/storms";

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

    const market = new LiveMarket({ tickMs: 60_000 });
    const def = listedDef("FROG", "FROG Club", 21_596);
    market.list(def, { hype: HYPE.h0 });
    const tick0 = market.snapshot().tick;
    const before = market.depthInputs("FROG")!.regimeDepth;
    market.forceStormForTests("CRYPTO_FLUSH", { precursorDays: 0, severity: sev });
    // force at current tick → triggerTick = tick+1; one step reaches it and observes
    market.step();
    expect(market.snapshot().tick).toBe(tick0 + 1);
    const shocks = market.takeStormHype();
    expect(shocks).toHaveLength(1);
    expect(shocks[0]!.delta).toBeCloseTo(CRYPTO_FLUSH_HYPE * sev, 12);
    const wire = market.wire();
    const hit = wire.items.find((i) => i.headlineKey === "wire.storm.crypto-flush.hit");
    expect(hit).toMatchObject({ breaking: true, phase: "realized", kind: "WORLD_EVENT" });
    expect(hit!.entities.some((e) => e.id === "FROG")).toBe(true);
    expect(market.depthInputs("FROG")!.regimeDepth).toBeCloseTo(before * CRYPTO_FLUSH_DEPTH_MULT, 12);
    // depth window: still active now; gone after 720 ticks from trigger
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

describe("natural day-173 CRYPTO_FLUSH on the clock (seeded schedule)", () => {
  it("day-close 173 starts CRYPTO_FLUSH with the fixture draw; trigger publishes after precursor days", () => {
    const draw = stormDayDraw(173);
    expect(draw).toMatchObject({ start: true, kind: "CRYPTO_FLUSH" });
    const s = new StormScheduler();
    // reach day 173 close without prior storms
    const close = 173 * TICKS_PER_DAY + TICKS_PER_DAY - 1;
    s.observe(close);
    const ev = s.peek();
    expect(ev).toMatchObject({ kind: "CRYPTO_FLUSH", id: "storm:173:CRYPTO_FLUSH", phase: "PRECURSOR" });
    expect(ev!.triggerTick).toBe(close + 1 + draw.precursorDays * TICKS_PER_DAY);
    expect(ev!.severity).toBeCloseTo(draw.severity, 12);
    s.observe(ev!.triggerTick);
    expect(s.takeWire()[0]?.headlineKey).toBe("wire.storm.crypto-flush.hit");
    expect(s.takeHypeShocks()[0]?.delta).toBeCloseTo(CRYPTO_FLUSH_HYPE * draw.severity, 12);
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
    const market = new LiveMarket({ tickMs: 60_000 });
    // warm one step so quotes exist
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
    const market = new LiveMarket({ tickMs: 60_000 });
    market.step();
    market.forceStormForTests("CREDIT_WOBBLE", { precursorDays: 0, severity: 1 });
    market.step();
    const hit = market.wire().items.find((i) => i.headlineKey === "wire.storm.credit-wobble.hit");
    expect(hit).toBeTruthy();
    expect(hit!.effects ?? []).toEqual([]);
    expect(hit!.entities).toEqual([]);
  });
});
