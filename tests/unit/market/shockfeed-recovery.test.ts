import { describe, expect, it } from "vitest";
import { ASSET_BY_ID, ASSETS } from "@/market/catalog";
import { TICKS_PER_DAY } from "@/server/market/meme";
import {
  FLASH_LOG_HALF_LIFE_DAYS,
  FLASH_PRICE_RECOVERY_PER_DAY,
  ShockFeed,
  equityErpTickLog,
  flashCrashHalfLifeDays,
  isFlashResidualK,
  shockHalfLifeDays,
} from "@/server/market/shockFeed";
import { STORM_KINDS } from "@/server/market/storms";
import { MAJOR_KINDS_V1, RIPPLE_KINDS, majorStockShocks } from "@/server/market/crises";
import type { AccountId } from "@/server/auth/types";
import { buildPlayerPrivate } from "@/server/player/privateState";
import { decidePlace, notionalCents, reservedCashCents, sweepLedger, type IdSource, type ServerQuote } from "@/server/broker/execution";
import { feeOf } from "@/server/broker/book";
import { fmt } from "@/shell/contracts/mockFeed";

const lastOf = (f: ShockFeed, id: string) => f.assets.get(id)!.last;
const priceRecovery = (l0: number, l1: number) => (Math.exp(l1) - Math.exp(l0)) / (1 - Math.exp(l0));
const SEVERITIES = [0.6, 1, 1.4] as const;
const SMALL_BPS = [-1, -10, -50] as const;
const flashDays = () => shockHalfLifeDays("FLASH_CRASH");

/** last · exp(erp leftover) should match from · exp(remaining residual) · exp(μ t), within 1 minor. */
function markReconstructs(feed: ShockFeed, assetId: string, from: number, residualLog: number, ticks: number): number {
  const leftover = feed.erpSnapshot().find((r) => r.assetId === assetId)?.log ?? 0;
  const implied = from * Math.exp(residualLog) * Math.exp(equityErpTickLog() * ticks);
  return lastOf(feed, assetId) * Math.exp(leftover) - implied;
}

function quoteOf(feed: ShockFeed): ServerQuote {
  return {
    tick: feed.tick,
    last: (id) => {
      const s = feed.assets.get(id);
      return s && s.last > 0 ? s.last : null;
    },
    tradable: (id) => feed.assets.has(id),
  };
}

const ids = (): IdSource => { let n = 0; return { next: (kind) => `${kind}_${++n}` }; };

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
      const hit = feed.applyShock(shock!.assetId, shock!.bp, flashDays());
      expect(hit).not.toBeNull();
      const { from, to } = hit!;
      expect(to).toBe(Math.max(1, Math.round((from * (10_000 + shock!.bp)) / 10_000)));
      const l0 = Math.log(to / from);
      feed.catchUpDecay(TICKS_PER_DAY);
      const residual = feed.residualSnapshot().find((r) => r.assetId === shock!.assetId);
      expect(residual).toBeDefined();
      expect(Math.abs(priceRecovery(l0, residual!.log) - FLASH_PRICE_RECOVERY_PER_DAY)).toBeLessThan(1e-9);
      expect(Math.abs(markReconstructs(feed, shock!.assetId, from, residual!.log, TICKS_PER_DAY))).toBeLessThanOrEqual(1);
    }
  });

  it("small and huge isolated shocks also reconstruct the printed mark within 1 minor at one game day", () => {
    for (const bp of [...SMALL_BPS, -3000, -5000, -8000]) {
      const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
      const hit = feed.applyShock("GX", bp, flashDays());
      expect(hit).not.toBeNull();
      const l0 = Math.log(hit!.to / hit!.from);
      feed.catchUpDecay(TICKS_PER_DAY);
      const residual = feed.residualSnapshot().find((r) => r.assetId === "GX")!;
      expect(Math.abs(priceRecovery(l0, residual.log) - FLASH_PRICE_RECOVERY_PER_DAY)).toBeLessThan(1e-9);
      expect(Math.abs(markReconstructs(feed, "GX", hit!.from, residual.log, TICKS_PER_DAY))).toBeLessThanOrEqual(1);
    }
  });

  it("a single official flash does not plateau ~201 minors short after the residual dies, and serial flashes do not stack that shortfall", () => {
    const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const first = feed.applyShock("GX", -1000, flashDays())!;
    feed.catchUpDecay(10 * TICKS_PER_DAY);
    const leftover = feed.erpSnapshot().find((r) => r.assetId === "GX")?.log ?? 0;
    const implied = first.from * Math.exp(equityErpTickLog() * 10 * TICKS_PER_DAY);
    expect(Math.abs(lastOf(feed, "GX") * Math.exp(leftover) - implied)).toBeLessThanOrEqual(2);
    expect(Math.abs(lastOf(feed, "GX") * Math.exp(leftover) - first.from * Math.exp(equityErpTickLog() * 10 * TICKS_PER_DAY))).toBeLessThanOrEqual(2);

    const origin = first.from;
    let ticks = 0;
    const serial = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    for (let i = 0; i < 5; i++) {
      serial.applyShock("GX", -1000, flashDays());
      serial.catchUpDecay(10 * TICKS_PER_DAY);
      ticks += 10 * TICKS_PER_DAY;
      const acc = serial.erpSnapshot().find((r) => r.assetId === "GX")?.log ?? 0;
      const target = origin * Math.exp(equityErpTickLog() * ticks);
      expect(Math.abs(lastOf(serial, "GX") * Math.exp(acc) - target)).toBeLessThanOrEqual(2);
    }
  });

  it("the trigger print is unchanged; only the FLASH residual k changes", () => {
    const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const hit = feed.applyShock("GX", -1000, flashDays());
    expect(hit).toEqual({ from: 420015, to: 378014 });
    const l0 = Math.log(hit!.to / hit!.from);
    const row = feed.residualSnapshot().find((r) => r.assetId === "GX")!;
    expect(row.log).toBe(l0);
    expect(row.k).not.toBe(1 - Math.pow(2, -1 / (FLASH_LOG_HALF_LIFE_DAYS * TICKS_PER_DAY)));
    expect(row.k).toBe(1 - Math.pow(2, -1 / (flashCrashHalfLifeDays(l0) * TICKS_PER_DAY)));
    expect(isFlashResidualK(row.k)).toBe(true);
    expect(isFlashResidualK(1 - Math.pow(2, -1 / (30 * TICKS_PER_DAY)))).toBe(false);
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
      expect(isFlashResidualK(k)).toBe(false);
    }
  });

  it("overlapping flashes each recover 70% of their own price drawdown on their own schedule (04:1033)", () => {
    // Second flash at mid-recovery (tick 360). Each component is measured 1 GD after *its* start.
    const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const first = feed.applyShock("GX", -1000, flashDays())!;
    const l1 = Math.log(first.to / first.from);
    feed.catchUpDecay(360);
    const midRows = feed.residualSnapshot().filter((r) => r.assetId === "GX");
    expect(midRows).toHaveLength(1);
    const second = feed.applyShock("GX", -500, flashDays())!;
    const l2 = Math.log(second.to / second.from);
    expect(feed.residualSnapshot().filter((r) => r.assetId === "GX")).toHaveLength(2);
    feed.catchUpDecay(TICKS_PER_DAY - 360);
    const atFirstDay = feed.residualSnapshot().filter((r) => r.assetId === "GX");
    const firstAtOwnDay = atFirstDay.find((r) => Math.abs(r.k - midRows[0]!.k) < 1e-18)!;
    expect(Math.abs(priceRecovery(l1, firstAtOwnDay.log) - FLASH_PRICE_RECOVERY_PER_DAY)).toBeLessThan(1e-9);
    feed.catchUpDecay(360);
    const atSecondDay = feed.residualSnapshot().filter((r) => r.assetId === "GX");
    const secondRow = atSecondDay.find((r) => Math.abs(r.k - firstAtOwnDay.k) >= 1e-18)!;
    expect(Math.abs(priceRecovery(l2, secondRow.log) - FLASH_PRICE_RECOVERY_PER_DAY)).toBeLessThan(1e-9);
  });

  it("two same-tick flashes each keep the isolated 70% law on their own row", () => {
    const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const a = feed.applyShock("GX", -1000, flashDays())!;
    const b = feed.applyShock("GX", -1000, flashDays())!;
    const la = Math.log(a.to / a.from), lb = Math.log(b.to / b.from);
    expect(feed.residualSnapshot().filter((r) => r.assetId === "GX")).toHaveLength(2);
    feed.catchUpDecay(TICKS_PER_DAY);
    const rows = feed.residualSnapshot().filter((r) => r.assetId === "GX");
    expect(rows).toHaveLength(2);
    expect(Math.abs(priceRecovery(la, rows[0]!.log) - FLASH_PRICE_RECOVERY_PER_DAY)).toBeLessThan(1e-9);
    expect(Math.abs(priceRecovery(lb, rows[1]!.log) - FLASH_PRICE_RECOVERY_PER_DAY)).toBeLessThan(1e-9);
  });

  it("restart mid-recovery and catchUpDecay jump equal tick-by-tick advanceDecay", () => {
    const tick = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const jump = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    tick.applyShock("GX", -1000, flashDays());
    jump.applyShock("GX", -1000, flashDays());
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

  it("a player with resting catalog limits that fill through a flash recovery conserves cash+NPC+fees", () => {
    const feed = new ShockFeed({ seed: 17, empty: true }, { autoStart: false });
    const avb = ASSET_BY_ID.AVB!;
    const pre = lastOf(feed, "AVB");
    const src = ids();
    const rec0 = buildPlayerPrivate("acct_flash" as AccountId, {
      cashCents: 5_000_000,
      positions: { AVB: { assetId: "AVB", qty: "200", avgCost: fmt(pre, avb.displayDecimals) } },
      openOrders: {},
    });
    // Resting buy below the pre-shock mark so it is not marketable now, but fills at the crash.
    const buyLimit = Math.round(pre * 0.93);
    const placedBuy = decidePlace(rec0, "key-buy-01", {
      assetId: "AVB", side: "BUY", type: "limit", qty: "200", limit: fmt(buyLimit, avb.displayDecimals), tif: "day",
    }, quoteOf(feed), src);
    expect(placedBuy.result.status).toBe("ACCEPTED");
    let rec = buildPlayerPrivate("acct_flash" as AccountId, placedBuy.next);
    const genesis = rec.cashCents;
    let npc = 0, fees = 0;
    const account = (ledger: typeof rec, label: string) => {
      const fills = ledger.fills ?? [];
      const prev = rec.fills ?? [];
      for (const f of fills.slice(prev.length)) {
        const px = Math.round(Number(f.price) * 10 ** avb.displayDecimals);
        const qty = Number(f.qty);
        const notional = notionalCents(avb, f.side, qty, px);
        const fee = feeOf(notional);
        fees += fee;
        npc += f.side === "BUY" ? notional : -notional;
      }
      rec = ledger;
      expect(rec.cashCents + npc + fees, label).toBe(genesis);
    };

    const crash = feed.applyShock("AVB", -1000, flashDays())!;
    expect(crash.to).toBeLessThan(buyLimit);
    const afterCrash = sweepLedger(rec, quoteOf(feed), src);
    expect(afterCrash, "buy should fill at the crash").not.toBeNull();
    account(buildPlayerPrivate("acct_flash" as AccountId, afterCrash!), "after crash buy");
    expect((rec.fills ?? []).some((f) => f.side === "BUY")).toBe(true);

    // Resting sell in the recovery path, placed after the crash so it is not immediately marketable.
    const sellLimit = crash.to + Math.round(0.7 * (crash.from - crash.to) * 0.8);
    expect(lastOf(feed, "AVB")).toBeLessThan(sellLimit);
    const placedSell = decidePlace(rec, "key-sell-01", {
      assetId: "AVB", side: "SELL", type: "limit", qty: "200", limit: fmt(sellLimit, avb.displayDecimals), tif: "day",
    }, quoteOf(feed), src);
    expect(placedSell.result.status).toBe("ACCEPTED");
    rec = buildPlayerPrivate("acct_flash" as AccountId, placedSell.next);
    expect(rec.cashCents + npc + fees).toBe(genesis);

    let sold = false;
    for (let i = 0; i < TICKS_PER_DAY; i++) {
      feed.advanceDecay();
      const swept = sweepLedger(rec, quoteOf(feed), src);
      if (swept) {
        account(buildPlayerPrivate("acct_flash" as AccountId, swept), `sell fill at tick ${i}`);
        sold = true;
        break;
      }
    }
    expect(sold, "sell should fill during the 1-GD recovery").toBe(true);
    expect(rec.cashCents + npc + fees).toBe(genesis);
    expect(reservedCashCents(rec) + rec.cashCents).toBeGreaterThan(0);
  });
});
