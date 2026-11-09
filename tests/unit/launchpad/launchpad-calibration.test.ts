// Documented CALIBRATION bands (20 §3.7 / 05 / 06) — assert reachable; report structural misses.
import { describe, expect, it } from "vitest";
import {
  CRYPTO_DAYS_PER_YEAR, DAYS_PER_YEAR, SESSION_DAYS_PER_YEAR,
} from "@/server/market/meme";
import { runCalibration, targetAnnVol } from "@/server/market/calibration";
import { HALF_SPREAD } from "@/server/broker/book";

describe("day-count reconcile (05 §3.3.1 / 20)", () => {
  it("session Dy=260, crypto Dy=364, meme SDE DT keeps inherited 252", () => {
    expect(SESSION_DAYS_PER_YEAR).toBe(260);
    expect(CRYPTO_DAYS_PER_YEAR).toBe(364);
    expect(DAYS_PER_YEAR).toBe(252);
  });
});

describe("calibration bands (deterministic)", () => {
  it("reachable bands PASS; structural misses are REPORT (not invented)", () => {
    const report = runCalibration({ days: 260, seed: 17 });
    const by = Object.fromEntries(report.rows.map((r) => [r.band, r]));

    expect(by["MKT.vol_ratio (calm)"]!.status).toBe("PASS");
    expect(by["MKT.autocorr (calm)"]!.status).toBe("PASS");
    expect(by["MAC.storm_rate"]!.status).toBe("PASS");
    expect(by["MEME.half_spread"]!.status).toBe("PASS");
    expect(by["Dy.rv21_session"]!.status).toBe("PASS");
    expect(by["Dy.crypto_sigma_d"]!.status).toBe("PASS");

    // Structural: do not invent a 05 equity GARCH/Student-t process this unit
    expect(by["MKT.kurtosis (calm median)"]!.status).toBe("REPORT");
    expect(by["MKT.vol_cluster (calm median)"]!.status).toBe("REPORT");

    // No hard FAIL invent: MISS only if a reachable band broke
    const misses = report.rows.filter((r) => r.status === "MISS");
    expect(misses, JSON.stringify(misses, null, 2)).toEqual([]);

    expect(HALF_SPREAD).toBeCloseTo(0.02, 12);
    expect(targetAnnVol(6, 260)).toBeGreaterThan(0.1);
    expect(report.digestNote).toMatch(/fc1359d1/);
  });
});
