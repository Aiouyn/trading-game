import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { observed, parseInputs, type CatalogInputs } from "@/server/market/policyRecovery/inputs";
import { advancePolicy, FLASH_PRICE_RECOVERY_PER_DAY, parsePolicyState, proposeMajor, residualHalfLifeDays, residualLog, type PolicyState } from "@/server/market/policyRecovery/engine";
import { FilePolicyStore, PolicyRecoveryEngine } from "@/server/market/policyRecovery/store";
import { firstTickInUtcBand, hourOfTick, isTradingDay, nextUtcBand, ticksOfHour, TICK_MS, tradingHour, utcBandOfTick, utcMsOfTick, UTC_BANDS, type WorldClockAnchor } from "@/server/market/policyRecovery/time";
import { shockHalfLifeDays } from "@/server/market/shockFeed";
import { majorStockShocks } from "@/server/market/crises";
import { TICKS_PER_DAY } from "@/server/market/meme";
import { frame, frames, genesis, scenario } from "../../fixtures/policyRecovery";

const trapCounter = () => {
  const state = { traps: 0 };
  const handler = new Proxy({}, { get() { state.traps++; return () => { state.traps++; throw new Error("TRAP"); }; } });
  return { state, wrap: <T extends object>(v: T): T => new Proxy(v, handler) };
};
const revoked = <T extends object>(v: T): T => { const r = Proxy.revocable(v, {}); r.revoke(); return r.proxy; };

describe("(a) Proxy inputs fail at the boundary on every entry point, with zero traps", () => {
  it("catalog inputs: INVALID_CATALOG_INPUTS, never DataCloneError", async () => {
    const { state, wrap } = trapCounter(), g = genesis(), f = frame(g.hour + 1);
    const nested = () => { const x = frame(g.hour + 1); (x as unknown as Record<string, unknown>).gx = wrap({ ...x.gx }); return x; };
    const calls: (() => unknown)[] = [
      () => parseInputs(wrap(frame(0))), () => parseInputs(nested()), () => parseInputs(revoked(frame(0))), () => parseInputs(wrap(() => 1)),
      () => advancePolicy(g, wrap([f])), () => advancePolicy(g, [wrap(f)]), () => advancePolicy(g, [nested()]), () => advancePolicy(g, [revoked(f)]),
      () => proposeMajor(advancePolicy(g, [f]), { kind: "OIL_SHOCK", origin: "SCHEDULED", severity: 1, precursorDays: 8, contagionDays: 5 }, wrap(f)),
    ];
    for (const call of calls) expect(call).toThrow("INVALID_CATALOG_INPUTS");
    const dir = await mkdtemp(path.join(tmpdir(), "policy-hardening-proxy-"));
    try {
      const engine = await PolicyRecoveryEngine.open(new FilePolicyStore(path.join(dir, "p.json")), g), bytes = await readFile(path.join(dir, "p.json"), "utf8");
      await expect(engine.observe(wrap([f]))).rejects.toThrow("INVALID_CATALOG_INPUTS");
      await expect(engine.observe([wrap(f)])).rejects.toThrow("INVALID_CATALOG_INPUTS");
      await expect(engine.observe([nested()])).rejects.toThrow("INVALID_CATALOG_INPUTS");
      expect(await readFile(path.join(dir, "p.json"), "utf8")).toBe(bytes);
    } finally { await rm(dir, { recursive: true, force: true }); }
    expect(state.traps).toBe(0);
  });
  it("policy state passed to advancePolicy/proposeMajor: INVALID_POLICY_CHECKPOINT before clone or reflection", () => {
    const { state, wrap } = trapCounter(), g = genesis(), f = frame(g.hour + 1), s1 = advancePolicy(g, [f]);
    const p = { kind: "OIL_SHOCK", origin: "SCHEDULED", severity: 1, precursorDays: 8, contagionDays: 5 } as const;
    for (const call of [() => advancePolicy(wrap(g), [f]), () => advancePolicy(revoked(g), [f]), () => proposeMajor(wrap(s1), p, f), () => proposeMajor(revoked(s1), p, f)])
      expect(call).toThrow("INVALID_POLICY_CHECKPOINT");
    expect(state.traps).toBe(0);
  });
});

describe("(b) FLASH_CRASH recovers 70% of the price drawdown in one game day (04:1024)", () => {
  it("solves the module half-life per shock size; shared shockFeed law is unchanged and still 68.886% for −10%", () => {
    for (const severity of [.6, 1, 1.4]) {
      const [shock] = majorStockShocks("FLASH_CRASH", severity), l0 = Math.log(1 + shock!.bp / 10000), h = residualHalfLifeDays("FLASH_CRASH", l0);
      const l1 = l0 * 2 ** (-1 / h);
      expect((Math.exp(l1) - Math.exp(l0)) / (1 - Math.exp(l0))).toBeCloseTo(FLASH_PRICE_RECOVERY_PER_DAY, 12);
    }
    const l0 = Math.log(.9), shared = l0 * 2 ** (-1 / shockHalfLifeDays("FLASH_CRASH"));
    expect((Math.exp(shared) - .9) / .1).toBeCloseTo(.68886161, 8);
    for (const kind of ["OIL_SHOCK", "TRADE_WAR", "STAGFLATION", "EQUITY_BUBBLE_BURST"] as const) expect(residualHalfLifeDays(kind, -.1)).toBe(shockHalfLifeDays(kind));
  });
  it("engine residual: price after 24 game hours has recovered exactly 70% of the crash; replay and restart agree", async () => {
    let s = scenario({ kind: "FLASH_CRASH" }); const e = s.events[0]!;
    s = advancePolicy(s, frames(s.hour + 1, e.triggerHour));
    const g0 = residualLog(s, "GX"), g24 = residualLog(s, "GX", s.hour + 24);
    expect(Math.exp(g0)).toBeCloseTo(.9, 12);
    expect((Math.exp(g24) - Math.exp(g0)) / (1 - Math.exp(g0))).toBeCloseTo(.7, 12);
    expect(parsePolicyState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const tampered = structuredClone(s); tampered.residuals[0]!.halfLifeDays = shockHalfLifeDays("FLASH_CRASH");
    expect(() => parsePolicyState(tampered)).toThrow("INVALID_POLICY_CHECKPOINT");
  });
});

describe("(c) explicit UTC band and hour maps (02:245-246,1024; 04:1007)", () => {
  const launch: WorldClockAnchor = { genesisUtcMs: Date.UTC(2026, 10, 20, 18, 0, 0), reanchors: [] };
  it("maps ticks to UTC at 5 s per tick, applying reanchors from their tick onward", () => {
    expect(TICK_MS).toBe(5000);
    expect(utcMsOfTick(launch, 0)).toBe(launch.genesisUtcMs);
    expect(utcMsOfTick(launch, TICKS_PER_DAY)).toBe(launch.genesisUtcMs + 3600000);
    const re: WorldClockAnchor = { genesisUtcMs: launch.genesisUtcMs, reanchors: [{ atTick: 100, deltaMs: 37000 }, { atTick: 200, deltaMs: 600000 }] };
    expect(utcMsOfTick(re, 99)).toBe(launch.genesisUtcMs + 99 * 5000);
    expect(utcMsOfTick(re, 100)).toBe(launch.genesisUtcMs + 100 * 5000 + 37000);
    expect(utcMsOfTick(re, 200)).toBe(launch.genesisUtcMs + 200 * 5000 + 637000);
    for (const bad of [{ genesisUtcMs: -1, reanchors: [] }, { genesisUtcMs: 1.5, reanchors: [] }, { genesisUtcMs: 0, reanchors: [{ atTick: 5, deltaMs: 1 }, { atTick: 5, deltaMs: 1 }] }, { genesisUtcMs: 0, reanchors: [{ atTick: 5, deltaMs: 0 }] }])
      expect(() => utcMsOfTick(bad, 0)).toThrow("INVALID_CLOCK_ANCHOR");
    expect(() => utcMsOfTick(launch, -1)).toThrow("INVALID_TICK");
  });
  it("assigns the three 8-hour UTC bands and finds the first in-band tick at tick granularity", () => {
    expect(UTC_BANDS.map((b) => [b.fromUtcHour, b.toUtcHour])).toEqual([[0, 8], [8, 16], [16, 24]]);
    expect(utcBandOfTick(launch, 0)).toBe(2);                      // 18:00 UTC
    expect(utcBandOfTick(launch, 6 * TICKS_PER_DAY - 1)).toBe(2);  // 23:59:55
    expect(utcBandOfTick(launch, 6 * TICKS_PER_DAY)).toBe(0);      // 00:00 next UTC day
    expect(firstTickInUtcBand(launch, 0, 2)).toBe(0);
    expect(firstTickInUtcBand(launch, 0, 0)).toBe(6 * TICKS_PER_DAY);
    expect(firstTickInUtcBand(launch, 0, 1)).toBe(14 * TICKS_PER_DAY);
    // A 37 s reanchor shifts the boundary inside a game hour: the answer is a tick, never rounded to an engine hour.
    const re: WorldClockAnchor = { genesisUtcMs: launch.genesisUtcMs, reanchors: [{ atTick: 1, deltaMs: 37000 }] };
    const t = firstTickInUtcBand(re, 0, 0);
    expect(utcBandOfTick(re, t)).toBe(0); expect(utcBandOfTick(re, t - 1)).toBe(2);
    expect(t % 30).not.toBe(0);
    expect([0, 1, 2].map((b) => nextUtcBand(b as 0 | 1 | 2))).toEqual([1, 2, 0]);
  });
  it("maps engine hours to ticks and trading hours (24 x 30 ticks, Mon–Fri)", () => {
    expect(ticksOfHour(0)).toEqual({ first: 0, last: 29 }); expect(ticksOfHour(25)).toEqual({ first: 750, last: 779 });
    for (const t of [0, 29, 30, 719, 720, 12345]) { const h = hourOfTick(t), r = ticksOfHour(h); expect(t >= r.first && t <= r.last).toBe(true); }
    expect([0, 4, 5, 6, 7].map(isTradingDay)).toEqual([true, true, false, false, true]);
    expect(tradingHour(5 * 24 - 1)).toBe(5 * 24 - 1);
    expect(tradingHour(5 * 24)).toBe(5 * 24); expect(tradingHour(7 * 24 - 1)).toBe(5 * 24); expect(tradingHour(7 * 24)).toBe(5 * 24);
    expect(tradingHour(7 * 24 + 1)).toBe(5 * 24 + 1);
  });
});

describe("(d) GX intra-hour high is typed, never faked", () => {
  const withHigh = (f: CatalogInputs, high: number) => { f.gxHigh = observed(high, f.hour, "fixture:intra-hour-high"); return f; };
  it("uses a supplied intra-hour high as the peak; without it the peak is the last print, marked LAST", () => {
    const g = genesis(), h = g.hour + 1;
    const lastOnly = advancePolicy(g, [frame(h, { gx: 10000 }), frame(h + 1, { gx: 10000 })]);
    expect(lastOnly.gxHistory).toEqual([{ hour: h + 1, mark: 10000, basis: "LAST" }]); expect(lastOnly.events).toEqual([]);
    const high = advancePolicy(g, [withHigh(frame(h, { gx: 10000 }), 12500), frame(h + 1, { gx: 10000 })]);
    expect(high.gxHistory[0]).toEqual({ hour: h, mark: 12500, basis: "HIGH" });
    expect(high.events).toHaveLength(1); expect(high.events[0]).toMatchObject({ kind: "EQUITY_BUBBLE_BURST", origin: "EMERGENT" });
    expect(high.residuals).toEqual([]);
  });
  it("rejects a high below the same hour's last print and refuses V2 checkpoints", async () => {
    const g = genesis();
    expect(() => advancePolicy(g, [withHigh(frame(g.hour + 1, { gx: 10000 }), 9999)])).toThrow("INVALID_CATALOG_INPUTS");
    const s = advancePolicy(g, [frame(g.hour + 1)]);
    const v2 = { ...structuredClone(s), v: 2, gxHistory: s.gxHistory.map(({ hour, mark }) => ({ hour, mark })) } as unknown as PolicyState;
    expect(() => parsePolicyState(v2)).toThrow("INVALID_POLICY_CHECKPOINT");
    const dir = await mkdtemp(path.join(tmpdir(), "policy-hardening-v2-")), file = path.join(dir, "v2.json"), bytes = JSON.stringify(v2);
    try {
      await writeFile(file, bytes);
      await expect(new FilePolicyStore(file).load()).rejects.toThrow("INVALID_POLICY_CHECKPOINT");
      expect(await readFile(file, "utf8")).toBe(bytes);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
