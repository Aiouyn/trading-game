import { describe, expect, it } from "vitest";
import { ASSET_BY_ID } from "@/market/catalog";
import { DEMO_CRISIS_HALF_LIFE_DAYS, ShockFeed, halfLifeK, shockedMinor } from "@/server/market/shockFeed";
import { TICKS_PER_DAY } from "@/server/market/meme";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import { LiveMarket } from "@/server/market/clock";

const lastOf = (f: ShockFeed, id = "AVB") =>
  Number((f.body("ticker:wl_default") as { rows: Record<string, { last: string }> }).rows[id]!.last);

describe("GK residual mid-decay durability", () => {
  it("LiveMarket restart mid-decay restores residual rows and does not full-reapply stockApplied on base", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ tickMs: 60_000, stormWorld: store, persistStorms: true });
    a.step();
    a.forceStormForTests("RATE_SCARE", { precursorDays: 0, severity: 1 });
    a.step();
    const after = Number(a.snapshot().quotes.rows.AVB!.last);
    for (let i = 0; i < 10 * TICKS_PER_DAY; i++) a.step();
    const decayed = Number(a.snapshot().quotes.rows.AVB!.last);
    const residual = a.stormSnapshot().shockResidual ?? [];
    expect(residual.length).toBeGreaterThan(0);

    const b = new LiveMarket({ tickMs: 60_000, stormWorld: store, persistStorms: true });
    const restored = Number(b.snapshot().quotes.rows.AVB!.last);
    const bp = a.stormSnapshot().stockApplied[0]!.shocks.find((p) => p.assetId === "AVB")!.bp;
    const fullOnBase = shockedMinor(ASSET_BY_ID.AVB!.base, bp) / 10 ** ASSET_BY_ID.AVB!.displayDecimals;
    // eslint-disable-next-line no-console
    console.log("GK_RES_MID", JSON.stringify({
      after, decayed, restored, fullOnBase, residualN: residual.length,
      residualRestored: b.stormSnapshot().shockResidual,
      demoHL: DEMO_CRISIS_HALF_LIFE_DAYS, k30: halfLifeK(30),
    }));
    expect(Math.abs(decayed - after)).toBeGreaterThan(0);
    expect(b.stormSnapshot().shockResidual).toEqual(residual);
    expect(Math.abs(restored - fullOnBase)).toBeGreaterThan(0.5);
  });

  it("restart mid-decay on copied marks (no rematerialize) == continuing decay", () => {
    const a = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    a.applyShock("AVB", -500, 30);
    for (let i = 0; i < 200; i++) a.advanceDecay();
    const midLast = lastOf(a);
    const midRes = a.residualSnapshot();
    expect(midRes.length).toBeGreaterThan(0);

    // Continue on A
    for (let i = 0; i < 500; i++) a.advanceDecay();

    // Restart: fresh feed, copy mid-decay last, hydrate residual without rematerializing
    const b = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const s = b.assets.get("AVB")!;
    s.last = Math.round(midLast * 10 ** ASSET_BY_ID.AVB!.displayDecimals);
    b.hydrateResidual(midRes, false);
    expect(lastOf(b)).toBe(midLast);
    expect(b.residualSnapshot()).toEqual(midRes);
    for (let i = 0; i < 500; i++) b.advanceDecay();
    expect(b.residualSnapshot()).toEqual(a.residualSnapshot());
    expect(lastOf(b)).toBe(lastOf(a));
  });

  it("jump catchUpDecay == tick-by-tick advanceDecay (residual + ERP, no walk)", () => {
    const tick = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const jump = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    tick.applyShock("AVB", -500, 30);
    jump.applyShock("AVB", -500, 30);
    const n = 2 * TICKS_PER_DAY; // two game days
    for (let i = 0; i < n; i++) tick.advanceDecay();
    jump.catchUpDecay(n);
    const tickLast = lastOf(tick);
    const jumpLast = lastOf(jump);
    const tickRes = tick.residualSnapshot();
    const jumpRes = jump.residualSnapshot();
    // eslint-disable-next-line no-console
    console.log("GK_RES_JUMP", JSON.stringify({ n, tickLast, jumpLast, dLast: jumpLast - tickLast, tickRes, jumpRes }));
    expect(jumpRes).toEqual(tickRes);
    expect(jumpLast).toBe(tickLast);
  });
});
