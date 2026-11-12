// Documented CALIBRATION bands (20 §3.7 / 05 / 06) — assert reachable; report structural misses.
// Heavy live walks (12×60 GD GX, 8-seed calm ShockFeed, FROG events-on) are precomputed in
// fixtures/calibration-unit.json by the same runners (liveGxPath, calmFeedCloses, frogEventCloses).
// Regen: npx tsx --tsconfig tsconfig.json tools/ci/regen-calibration-fixture.ts
// Full 60-seed CAGR table remains a proof / GK-DELTA run, as before.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CRYPTO_DAYS_PER_YEAR, DAYS_PER_YEAR, SESSION_DAYS_PER_YEAR,
} from "@/server/market/meme";
import {
  CALIBRATION_UNIT_PARAMS,
  calmFeedCloses,
  liveGxPath,
  runCalibration,
  targetAnnVol,
  type CalibrationFixture,
} from "@/server/market/calibration";
import { HALF_SPREAD } from "@/server/broker/book";

const FIXTURE_PATH = path.join(__dirname, "fixtures/calibration-unit.json");

function loadFixture(): CalibrationFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as CalibrationFixture;
}

describe("day-count reconcile (05 §3.3.1 / 20)", () => {
  it("session Dy=260, crypto Dy=364, meme SDE DT keeps inherited 252", () => {
    expect(SESSION_DAYS_PER_YEAR).toBe(260);
    expect(CRYPTO_DAYS_PER_YEAR).toBe(364);
    expect(DAYS_PER_YEAR).toBe(252);
  });
});

describe("calibration bands (deterministic)", () => {
  it("reachable bands PASS; index_cagr is PASS or honest MISS; structural REPORT", () => {
    const fixture = loadFixture();
    expect(fixture.params).toEqual(CALIBRATION_UNIT_PARAMS);
    expect(fixture.gxPaths).toHaveLength(CALIBRATION_UNIT_PARAMS.cagrSeeds);
    expect(fixture.calm).toHaveLength(CALIBRATION_UNIT_PARAMS.calmSeeds * 3);

    const report = runCalibration({ ...CALIBRATION_UNIT_PARAMS, fixture });
    const by = Object.fromEntries(report.rows.map((r) => [r.band, r]));

    expect(by["MKT.vol_ratio (calm)"]!.status).toBe("PASS");
    expect(by["MKT.autocorr (calm)"]!.status).toBe("PASS");
    expect(by["MAC.storm_rate"]!.status).toBe("PASS");
    expect(by["MEME.half_spread"]!.status).toBe("PASS");
    expect(by["Dy.rv21_session"]!.status).toBe("PASS");
    expect(by["Dy.crypto_sigma_d"]!.status).toBe("PASS");

    expect(by["MKT.kurtosis (calm median)"]!.status).toBe("REPORT");
    expect(by["MKT.vol_cluster (calm median)"]!.status).toBe("REPORT");
    expect(by["MEME.vol_ratio (events on)"]!.status).toBe("REPORT");

    const cagr = by["MKT.index_cagr (events on, 60 GD)"]!;
    expect(["PASS", "MISS"]).toContain(cagr.status);
    // Never soft-hide an out-of-band CAGR as REPORT
    expect(cagr.status).not.toBe("REPORT");

    const unexpected = report.rows.filter((r) => r.status === "MISS" && !r.band.startsWith("MKT.index_cagr"));
    expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([]);

    expect(HALF_SPREAD).toBeCloseTo(0.02, 12);
    expect(targetAnnVol(6, 260)).toBeGreaterThan(0.1);
    expect(report.digestNote).toMatch(/digest/i);
    expect(report.seeds.length).toBe(12);

    // Integrity: one live CAGR seed and one calm walk must still match the fixture exactly.
    const gx0 = fixture.gxPaths[0]!;
    expect(liveGxPath(gx0.seed, gx0.days)).toEqual(gx0);
    const calm0 = fixture.calm.find((p) => p.assetId === "GX" && p.seed === fixture.params.seed)!;
    expect(calmFeedCloses(calm0.assetId, calm0.seed, calm0.closes.length)).toEqual(calm0.closes);
  }, 30_000);
});
