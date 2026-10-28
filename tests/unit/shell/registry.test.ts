import { describe, expect, expectTypeOf, it } from "vitest";
import { APP_IDS, APPS, REGISTRY, type AppId } from "@/shell/registry";
import { APP_NAMES } from "@/shell/strings";

// S1-05: the 32 ids of 17 §2.2 in the §2 table order, plus each row of the table.
const TABLE: [AppId, string, string, string, number, number, number][] = [
  ["broker", "Broker", "trade", "always", 720, 420, 4], ["portfolio", "Portfolio", "trade", "always", 520, 220, 1],
  ["wire", "Wire", "trade", "always", 360, 280, 1], ["messages", "Messages", "trade", "always", 420, 300, 1],
  ["markets", "Markets", "trade", "always", 420, 300, 1], ["risk", "Risk", "trade", "license", 420, 300, 1],
  ["quantlab", "Quant Lab", "trade", "rank", 420, 300, 1], ["research", "Research Desk", "trade", "rank", 420, 300, 1],
  ["businesses", "Businesses", "build", "always", 420, 300, 1], ["company", "Company", "build", "rank", 420, 300, 1],
  ["property", "Property", "build", "always", 420, 300, 1], ["city", "City", "build", "always", 560, 400, 1],
  ["bank", "Bank & Credit", "build", "always", 420, 300, 1], ["funds", "Funds", "build", "always", 420, 300, 1],
  ["insurance", "Insurance", "build", "always", 420, 300, 1], ["institutions", "Institutions", "build", "anyOf", 420, 300, 1],
  ["ailab", "AI Lab", "shadow", "nw", 420, 300, 1], ["security", "Security", "shadow", "always", 420, 300, 1],
  ["legal", "Legal & Court", "shadow", "always", 420, 300, 1], ["estate", "Estate", "me", "always", 420, 300, 1],
  ["boards", "Boards", "world", "always", 420, 300, 1], ["profile", "Profile", "me", "always", 420, 300, 1],
  ["alliance", "Alliance", "world", "anyOf", 420, 300, 1], ["contracts", "Contracts", "world", "flag", 420, 300, 1],
  ["auctions", "Auctions", "world", "always", 420, 300, 1], ["civic", "Civic", "world", "always", 560, 400, 1],
  ["academy", "Academy", "me", "always", 420, 300, 1], ["help", "Help", "me", "always", 420, 300, 1],
  ["atelier", "Atelier", "me", "always", 420, 300, 1], ["settings", "Settings", "me", "always", 420, 300, 1],
  ["replay", "Replay", "world", "always", 420, 300, 2], ["api", "API", "trade", "flag", 420, 300, 1],
];

describe("registry (S1-05)", () => {
  it("AppId union equals APP_IDS (type test)", () => {
    expectTypeOf<(typeof APP_IDS)[number]>().toEqualTypeOf<AppId>();
  });
  it("APP_IDS is the 32 ids in §2 order", () => {
    expect(APP_IDS).toHaveLength(32);
    expect([...APP_IDS]).toEqual(TABLE.map((r) => r[0]));
    expect(REGISTRY.map((a) => a.id)).toEqual([...APP_IDS]);
  });
  it.each(TABLE)("%s matches the §2 table", (id, name, group, unlock, minW, minH, max) => {
    const a = APPS[id];
    expect(APP_NAMES[id]).toBe(name);
    expect(a.nameKey).toBe(`app.${id}.name`);
    expect(a.group).toBe(group);
    expect(a.unlock.kind).toBe(unlock);
    expect([a.minW, a.minH, a.maxInstances]).toEqual([minW, minH, max]);
    expect(a.built).toBe(["broker", "settings", "portfolio", "wire"].includes(id)); // 17B CH-00 flips portfolio/wire; UI card 4 (BRK-A) flips Broker
  });
  it("Broker narrow form is 480; no legacy apps exist", () => {
    expect(APPS.broker.narrowMinW).toBe(480);
    for (const legacy of ["boutique", "exchange", "launchpad", "calendar", "learn"]) {
      expect((APP_IDS as readonly string[]).includes(legacy)).toBe(false);
    }
  });
  it("teasers match the §2 table", () => {
    expect(APPS.risk.teaser).toEqual({ kind: "fromRank", rank: "R1" });
    expect(APPS.quantlab.teaser).toEqual({ kind: "fromRank", rank: "R1" });
    expect(APPS.research.teaser).toEqual({ kind: "fromRank", rank: "R2" });
    expect(APPS.company.teaser).toEqual({ kind: "fromRank", rank: "R1" });
    expect(APPS.institutions.teaser).toEqual({ kind: "fromRank", rank: "R3" });
    expect(APPS.ailab.teaser).toEqual({ kind: "fromOnboarding", atMin: 7.5 });
    expect(APPS.ailab.lockHint).toBe("The Lab opens at $100k");
    expect(APPS.contracts.lockHint).toBe("Create an account to sign contracts");
    expect(APPS.alliance.teaser.kind).toBe("none");
    expect(APPS.api.teaser.kind).toBe("none");
  });
});
