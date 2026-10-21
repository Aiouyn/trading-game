import { describe, expect, it } from "vitest";
import type { MeChannel, RankChannel } from "@/shell/channels";
import { RANK_THRESHOLDS } from "@/shell/mockChannels";
import { APP_IDS, RANKS, type AppId, type Rank } from "@/shell/registry";
import { evaluate, moneyAtLeast, nextRankTarget, type Visibility } from "@/shell/unlock";

// S1-06 (17-AT-31): scripted characters across rank × license × flags × NW × game day.
const me = (o: Partial<MeChannel>): MeChannel => ({
  nw: "5000", todayPct: "0", todayChg: "0", license: "LIC0", charters: [], flags: [], onboardingMin: 60, onboardingDone: true, guest: true, protectionEndsRealMs: null, myPlaces: [], ...o,
});
const ri = (r: Rank) => RANKS.indexOf(r);
const rk = (rank: Rank): RankChannel => ({ rank, thresholds: [...RANK_THRESHOLDS], nextAt: null, shellsEarned: [] });

/** Independent oracle written from the 17 §3.2.4 table (not from registry.ts). */
function expected(id: AppId, rank: Rank, lic: number, flags: string[], nw100k: boolean, guest: boolean): Visibility {
  const lockedIf = (cond: boolean, teaser: boolean): Visibility => (cond ? "unlocked" : teaser ? "locked" : "hidden");
  switch (id) {
    case "risk": return lockedIf(lic >= 2, ri(rank) >= 1);
    case "quantlab": return lockedIf(ri(rank) >= 2, ri(rank) >= 1);
    case "research": return lockedIf(ri(rank) >= 3, ri(rank) >= 2);
    case "company": return lockedIf(ri(rank) >= 2, ri(rank) >= 1);
    case "institutions": return lockedIf(flags.includes("charter.anyAvailable"), ri(rank) >= 3);
    case "ailab": return lockedIf(nw100k, true);
    case "alliance": return lockedIf(flags.includes("character.day3") || flags.includes("alliance.invited"), false);
    case "contracts": return lockedIf(!guest, true);
    case "api": return lockedIf(flags.includes("api.eligible"), false);
    default: return "unlocked";
  }
}

describe("visibility matrix (S1-06)", () => {
  // Game day 3 arrives as the server flag character.day3 (never derived on the client).
  const FLAGSETS = [[], ["charter.anyAvailable"], ["api.eligible"], ["charter.anyAvailable", "api.eligible"], ["character.day3"], ["alliance.invited"], ["character.day3", "api.eligible"]];
  let cases = 0;
  for (const rank of RANKS) for (let lic = 0; lic <= 2; lic++) for (const flags of FLAGSETS)
    for (const guest of [true, false]) for (const nw100k of [false, true]) {
      cases++;
      it(`${rank} LIC${lic} [${flags}] ${guest ? "guest" : "upgraded"} ${nw100k ? "≥100k" : "<100k"}`, () => {
        const { vis } = evaluate({ rank: rk(rank), me: me({ license: `LIC${lic}`, flags, guest, nw: nw100k ? "100000" : "99999.99" }) }, new Set());
        for (const id of APP_IDS) expect([id, vis[id]]).toEqual([id, expected(id, rank, lic, flags, nw100k, guest)]);
      });
    }
  it("covers the full grid", () => expect(cases).toBe(7 * 3 * 7 * 2 * 2));
});

describe("stickiness (17 §3.2.4)", () => {
  it("NW unlock never re-locks when NW falls; rank unlocks stay", () => {
    const a = evaluate({ rank: rk("R2"), me: me({ nw: "150000" }) }, new Set());
    expect(a.vis.ailab).toBe("unlocked");
    const b = evaluate({ rank: rk("R2"), me: me({ nw: "20" }) }, a.sticky);
    expect(b.vis.ailab).toBe("unlocked");
    expect(b.vis.quantlab).toBe("unlocked");
  });
  it("a revoked license re-locks Risk", () => {
    const a = evaluate({ rank: rk("R2"), me: me({ license: "LIC2" }) }, new Set());
    expect(a.vis.risk).toBe("unlocked");
    const b = evaluate({ rank: rk("R2"), me: me({ license: "LIC1" }) }, a.sticky);
    expect(b.vis.risk).toBe("locked");
  });
  it("a lost charter re-locks Institutions only when no flag remains", () => {
    const a = evaluate({ rank: rk("R3"), me: me({ charters: ["bank"] }) }, new Set());
    expect(a.vis.institutions).toBe("unlocked");
    const b = evaluate({ rank: rk("R3"), me: me({}) }, a.sticky);
    expect(b.vis.institutions).toBe("locked");
  });
});

describe("moneyAtLeast", () => {
  it.each([["100000", "100000", true], ["99999.99", "100000", false], ["100000.01", "100000", true], ["-5", "0", false], ["-5", "-10", true], ["1000000", "100000", true]])(
    "%s >= %s is %s", (a, b, r) => expect(moneyAtLeast(a, b)).toBe(r));
});

describe("AI Lab teaser (PR #2 answer 5)", () => {
  it("hidden before onboarding 7:30, locked from 7:30 or when onboarding is done; no rank rule", () => {
    const at = (onboardingMin: number, onboardingDone: boolean, rank: Rank) =>
      evaluate({ rank: rk(rank), me: me({ onboardingMin, onboardingDone }) }, new Set()).vis.ailab;
    expect(at(7, false, "R0")).toBe("hidden");
    expect(at(7, false, "R4")).toBe("hidden");
    expect(at(7.5, false, "R0")).toBe("locked");
    expect(at(2, true, "R0")).toBe("locked");
  });
});

describe("Alliance day 3 comes from the server (PR #2 answer 7)", () => {
  it("no flag → hidden, whatever the client clock says", () => {
    expect(evaluate({ rank: rk("R3"), me: me({}) }, new Set()).vis.alliance).toBe("hidden");
    expect(evaluate({ rank: rk("R3"), me: me({ flags: ["character.day3"] }) }, new Set()).vis.alliance).toBe("unlocked");
  });
});

describe("rank widget target from rank.thresholds (B2)", () => {
  it.each([["R0", "R1", "20000"], ["R1", "R2", "250000"], ["R2", "R3", "5000000"], ["R3", "R4", "100000000"], ["R4", "R5", "2000000000"]] as const)(
    "%s → next %s at %s", (r, next, at) => expect(nextRankTarget(rk(r))).toEqual({ rank: next, at }));
  it("R5 has no NW target (R6 is not NW-only)", () => expect(nextRankTarget(rk("R5"))).toBeNull());
  it("reads the channel, not a constant", () => expect(nextRankTarget({ rank: "R1", thresholds: ["1", "2"], nextAt: null, shellsEarned: [] })).toEqual({ rank: "R2", at: "2" }));
});
