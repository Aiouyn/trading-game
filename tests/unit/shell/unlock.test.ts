import { describe, expect, it } from "vitest";
import type { MeChannel } from "@/shell/channels";
import { APP_IDS, RANKS, type AppId, type Rank } from "@/shell/registry";
import { evaluate, moneyAtLeast, type Visibility } from "@/shell/unlock";

// S1-06 (17-AT-31): scripted characters across rank × license × flags × NW × game day.
const me = (o: Partial<MeChannel>): MeChannel => ({
  nw: "5000", todayPct: "0", license: "LIC0", charters: [], flags: [], gameDay: 1, onboardingMin: 60, guest: true, protectionEndsRealMs: null, ...o,
});
const ri = (r: Rank) => RANKS.indexOf(r);

/** Independent oracle written from the 17 §3.2.4 table (not from registry.ts). */
function expected(id: AppId, rank: Rank, lic: number, flags: string[], nw100k: boolean, day: number, guest: boolean): Visibility {
  const lockedIf = (cond: boolean, teaser: boolean): Visibility => (cond ? "unlocked" : teaser ? "locked" : "hidden");
  switch (id) {
    case "risk": return lockedIf(lic >= 2, ri(rank) >= 1);
    case "quantlab": return lockedIf(ri(rank) >= 2, ri(rank) >= 1);
    case "research": return lockedIf(ri(rank) >= 3, ri(rank) >= 2);
    case "company": return lockedIf(ri(rank) >= 2, ri(rank) >= 1);
    case "institutions": return lockedIf(flags.includes("charter.anyAvailable"), ri(rank) >= 3);
    case "ailab": return lockedIf(nw100k, true);
    case "alliance": return lockedIf(day >= 3 || flags.includes("alliance.invited"), false);
    case "contracts": return lockedIf(!guest, true);
    case "api": return lockedIf(flags.includes("api.eligible"), false);
    default: return "unlocked";
  }
}

describe("visibility matrix (S1-06)", () => {
  const FLAGSETS = [[], ["charter.anyAvailable"], ["api.eligible"], ["charter.anyAvailable", "api.eligible"]];
  let cases = 0;
  for (const rank of RANKS) for (let lic = 0; lic <= 2; lic++) for (const flags of FLAGSETS)
    for (const guest of [true, false]) for (const nw100k of [false, true]) for (const day of [1, 3]) {
      cases++;
      it(`${rank} LIC${lic} [${flags}] ${guest ? "guest" : "upgraded"} ${nw100k ? "≥100k" : "<100k"} day${day}`, () => {
        const { vis } = evaluate({ rank: { rank, nextAt: null }, me: me({ license: `LIC${lic}`, flags, guest, nw: nw100k ? "100000" : "99999.99", gameDay: day }) }, new Set());
        for (const id of APP_IDS) expect([id, vis[id]]).toEqual([id, expected(id, rank, lic, flags, nw100k, day, guest)]);
      });
    }
  it("covers the full grid", () => expect(cases).toBe(7 * 3 * 4 * 2 * 2 * 2));
});

describe("stickiness (17 §3.2.4)", () => {
  it("NW unlock never re-locks when NW falls; rank unlocks stay", () => {
    const a = evaluate({ rank: { rank: "R2", nextAt: null }, me: me({ nw: "150000" }) }, new Set());
    expect(a.vis.ailab).toBe("unlocked");
    const b = evaluate({ rank: { rank: "R2", nextAt: null }, me: me({ nw: "20" }) }, a.sticky);
    expect(b.vis.ailab).toBe("unlocked");
    expect(b.vis.quantlab).toBe("unlocked");
  });
  it("a revoked license re-locks Risk", () => {
    const a = evaluate({ rank: { rank: "R2", nextAt: null }, me: me({ license: "LIC2" }) }, new Set());
    expect(a.vis.risk).toBe("unlocked");
    const b = evaluate({ rank: { rank: "R2", nextAt: null }, me: me({ license: "LIC1" }) }, a.sticky);
    expect(b.vis.risk).toBe("locked");
  });
  it("a lost charter re-locks Institutions only when no flag remains", () => {
    const a = evaluate({ rank: { rank: "R3", nextAt: null }, me: me({ charters: ["bank"] }) }, new Set());
    expect(a.vis.institutions).toBe("unlocked");
    const b = evaluate({ rank: { rank: "R3", nextAt: null }, me: me({}) }, a.sticky);
    expect(b.vis.institutions).toBe("locked");
  });
});

describe("moneyAtLeast", () => {
  it.each([["100000", "100000", true], ["99999.99", "100000", false], ["100000.01", "100000", true], ["-5", "0", false], ["-5", "-10", true], ["1000000", "100000", true]])(
    "%s >= %s is %s", (a, b, r) => expect(moneyAtLeast(a, b)).toBe(r));
});
