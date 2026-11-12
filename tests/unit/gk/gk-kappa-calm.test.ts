import { describe, expect, it } from "vitest";
import { ShockFeed } from "@/server/market/shockFeed";
import { TICKS_PER_DAY, SESSION_DAYS_PER_YEAR } from "@/server/market/meme";
import { ASSET_BY_ID } from "@/market/catalog";
import { returnStats, dailyLogReturns, targetAnnVol } from "@/server/market/calibration";

describe("GK kappa calm bands", () => {
  it("live empty ShockFeed calm autocorr median in band (no catalog-base κ)", () => {
    const seeds = Array.from({ length: 12 }, (_, i) => 17 + i);
    const acs: number[] = [];
    for (const seed of seeds) {
      const f = new ShockFeed({ seed, empty: true }, { autoStart: false });
      const closes: number[] = [];
      for (let d = 0; d < 60; d++) {
        for (let i = 0; i < TICKS_PER_DAY; i++) f.advance();
        closes.push(Number((f.body("ticker:wl_default") as { rows: Record<string, { last: string }> }).rows.AVB!.last));
      }
      const st = returnStats(dailyLogReturns(closes), SESSION_DAYS_PER_YEAR)!;
      acs.push(st.autocorr1);
    }
    const med = [...acs].sort((a, b) => a - b)[Math.floor(acs.length / 2)]!;
    // eslint-disable-next-line no-console
    console.log("GK_KAPPA_CALM", JSON.stringify({ n: acs.length, medAc: med, seed17: acs[0] }));
    expect(med).toBeGreaterThanOrEqual(-0.05);
    expect(med).toBeLessThanOrEqual(0.05);
    expect(targetAnnVol(ASSET_BY_ID.AVB!.volBp)).toBeGreaterThan(0);
  }, 60_000);
});
