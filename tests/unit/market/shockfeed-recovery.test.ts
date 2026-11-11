import { describe, expect, it } from "vitest";
import { ASSETS } from "@/market/catalog";
import { TICKS_PER_DAY } from "@/server/market/meme";
import {
  FLASH_LOG_HALF_LIFE_DAYS,
  FLASH_PRICE_RECOVERY_PER_DAY,
  ShockFeed,
  equityErpTickLog,
  flashCrashHalfLifeDays,
  shockHalfLifeDays,
} from "@/server/market/shockFeed";
import { STORM_KINDS } from "@/server/market/storms";
import { MAJOR_KINDS_V1, RIPPLE_KINDS, majorStockShocks } from "@/server/market/crises";
import type { AccountId } from "@/server/auth/types";
import { buildPlayerPrivate } from "@/server/player/privateState";

const lastOf = (f: ShockFeed, id: string) => f.assets.get(id)!.last;
const priceRecovery = (l0: number, l1: number) => (Math.exp(l1) - Math.exp(l0)) / (1 - Math.exp(l0));
const SEVERITIES = [0.6, 1, 1.4] as const;

describe("sys/shockfeed-recovery: FLASH_CRASH recovers 70% of the price drawdown in one game day (04:1024)", () => {
  it("solves the half-life per shock size; the kind-table constant stays the log-space law", () => {
    expect(shockHalfLifeDays("FLASH_CRASH")).toBe(FLASH_LOG_HALF_LIFE_DAYS);
    expect(FLASH_LOG_HALF_LIFE_DAYS).toBe(1 / Math.log2(1 / 0.3));
    const legacy = Math.log(0.9) * 2 ** (-1 / shockHalfLifeDays("FLASH_CRASH"));
    expect((Math.exp(legacy) - 0.9) / 0.1).toBeCloseTo(0.68886161, 8);
    for (const severity of SEVERITIES) {
      const [shock] = majorStockShocks("FLASH_CRASH", severity);
      const l0 = Math.log(1 + shock!.bp / 10_000);
      const l1 = l0 * 2 ** (-1 / flashCrashHalfLifeDays(l0));
      expect(Math.abs(priceRecovery(l0, l1) - FLASH_PRICE_RECOVERY_PER_DAY)).toBeLessThan(1e-9);
      expect(shockHalfLifeDays("FLASH_CRASH", l0)).toBe(flashCrashHalfLifeDays(l0));
    }
  });

  it("three session sizes hit 70% residual-implied price recovery at one game day, within 1e-9", () => {
    for (const severity of SEVERITIES) {
      const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
      const [shock] = majorStockShocks("FLASH_CRASH", severity);
      const hit = feed.applyShock(shock!.assetId, shock!.bp, shockHalfLifeDays("FLASH_CRASH"));
      expect(hit).not.toBeNull();
      const { from, to } = hit!;
      expect(to).toBe(Math.max(1, Math.round((from * (10_000 + shock!.bp)) / 10_000)));
      const l0 = Math.log(to / from);
      feed.catchUpDecay(TICKS_PER_DAY);
      const residual = feed.residualSnapshot().find((r) => r.assetId === shock!.assetId);
      expect(residual).toBeDefined();
      expect(Math.abs(priceRecovery(l0, residual!.log) - FLASH_PRICE_RECOVERY_PER_DAY)).toBeLessThan(1e-9);
      // Printed mark, net of the ERP actually printed this day. Per-tick residual+ERP rounding on GX is a few minors over 720 ticks; stated tolerance is 5 minor units.
      const leftover = feed.erpSnapshot().find((r) => r.assetId === shock!.assetId)?.log ?? 0;
      const printedErp = equityErpTickLog() * TICKS_PER_DAY - leftover;
      const markNetOfErp = lastOf(feed, shock!.assetId) / Math.exp(printedErp);
      const implied = from * Math.exp(residual!.log);
      expect(Math.abs(markNetOfErp - implied)).toBeLessThanOrEqual(5);
    }
  });

  it("the trigger print is unchanged; only the FLASH residual k changes", () => {
    const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const hit = feed.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"));
    expect(hit).toEqual({ from: 420015, to: 378014 });
    const l0 = Math.log(hit!.to / hit!.from);
    const row = feed.residualSnapshot().find((r) => r.assetId === "GX")!;
    expect(row.log).toBe(l0);
    expect(row.k).not.toBe(1 - Math.pow(2, -1 / (FLASH_LOG_HALF_LIFE_DAYS * TICKS_PER_DAY)));
    expect(row.k).toBe(1 - Math.pow(2, -1 / (flashCrashHalfLifeDays(l0) * TICKS_PER_DAY)));
  });

  it("every non-FLASH kind keeps its half-life and residual k under the kind-table constant", () => {
    const kinds = [...STORM_KINDS, ...MAJOR_KINDS_V1, ...RIPPLE_KINDS, "BANKING_PANIC", "CREDIT_CRUNCH", "UNKNOWN_KIND"];
    for (const kind of kinds) {
      if (kind === "FLASH_CRASH") continue;
      const days = shockHalfLifeDays(kind);
      const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
      const hit = feed.applyShock("AVB", -500, days);
      expect(hit).not.toBeNull();
      const k = feed.residualSnapshot().find((r) => r.assetId === "AVB")!.k;
      expect(days).toBe(shockHalfLifeDays(kind));
      expect(k).toBe(1 - Math.pow(2, -1 / (days * TICKS_PER_DAY)));
    }
  });

  it("restart mid-recovery and catchUpDecay jump equal tick-by-tick advanceDecay", () => {
    const tick = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const jump = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    tick.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"));
    jump.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"));
    for (let i = 0; i < 200; i++) tick.advanceDecay();
    const midRes = tick.residualSnapshot();
    const midErp = tick.erpSnapshot();
    const midMinors = new Map([...tick.assets].map(([id, s]) => [id, s.last]));

    const restarted = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    for (const def of ASSETS) {
      const dst = restarted.assets.get(def.assetId), mid = midMinors.get(def.assetId);
      if (dst && mid != null) dst.last = mid;
    }
    restarted.hydrateResidual(midRes, false);
    restarted.hydrateErp(midErp);
    expect(restarted.residualSnapshot()).toEqual(midRes);
    expect(restarted.erpSnapshot()).toEqual(midErp);
    expect(lastOf(restarted, "GX")).toBe(lastOf(tick, "GX"));

    const rest = TICKS_PER_DAY - 200;
    for (let i = 0; i < rest; i++) tick.advanceDecay();
    jump.catchUpDecay(TICKS_PER_DAY);
    for (let i = 0; i < rest; i++) restarted.advanceDecay();
    expect(tick.residualSnapshot()).toEqual(jump.residualSnapshot());
    expect(tick.erpSnapshot()).toEqual(jump.erpSnapshot());
    expect(lastOf(tick, "GX")).toBe(lastOf(jump, "GX"));
    expect(restarted.residualSnapshot()).toEqual(tick.residualSnapshot());
    expect(restarted.erpSnapshot()).toEqual(tick.erpSnapshot());
    expect(lastOf(restarted, "GX")).toBe(lastOf(tick, "GX"));
  });

  it("the same seed and forced crash are deterministic, and cash is untouched", () => {
    const cash = 1_000_000;
    const player = buildPlayerPrivate("acct_flash" as AccountId, { cashCents: cash, positions: {}, openOrders: {} });
    const run = () => {
      const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
      feed.applyShock("GX", -1000, shockHalfLifeDays("FLASH_CRASH"));
      feed.catchUpDecay(TICKS_PER_DAY);
      return { last: lastOf(feed, "GX"), residual: feed.residualSnapshot(), erp: feed.erpSnapshot() };
    };
    expect(run()).toEqual(run());
    expect(player.cashCents).toBe(cash);
    expect(buildPlayerPrivate("acct_flash" as AccountId, { cashCents: cash, positions: {}, openOrders: {} })).toEqual(player);
  });
});
