// Systems ruling E-64: acct:entitlements parser (mirrors GET /api/v1/me/entitlements) and owned shells.
import { describe, expect, it } from "vitest";
import { ownedShells, parseEntitlements } from "@/shell/channels";
import { mockEntitlements } from "@/shell/mockChannels";

const item = (itemId: string, extra: Record<string, unknown> = {}) => ({
  itemId, slot: "SHELL_STYLE", source: "purchase", labelPurchased: "Purchased", grantedAt: "2026-10-01T12:00:00Z", ...extra,
});

describe("E-64 acct:entitlements", () => {
  it("accepts a valid, sorted, unique list and picks SHELL_STYLE items as owned shells", () => {
    const e = parseEntitlements({ items: [item("cos_shell_brass"), item("cos_shell_glass"), item("emote_wave", { slot: "EMOTE" })] });
    expect(ownedShells(e)).toEqual(["cos_shell_brass", "cos_shell_glass"]);
    expect(parseEntitlements({ items: [] }).items).toEqual([]);
  });
  it("owned shells are SHELL_STYLE items with a cos_shell_ id only", () => {
    const e = parseEntitlements({ items: [item("cos_shell_glass"), item("glass"), item("shell_brass")] });
    expect(ownedShells(e)).toEqual(["cos_shell_glass"]);
  });
  it("the ?owned= mock (dev / e2e builds) grants only well-formed cos_shell_ ids", () => {
    const ids = (q: string) => mockEntitlements(new URLSearchParams(q)).items.map((i) => i.itemId);
    expect(ids("owned=cos_shell_glass,glass,cos_shell_Brass,cos_shell_,cos_shell_a-b,../x,cos_shell_brass")).toEqual(["cos_shell_brass", "cos_shell_glass"]);
    expect(ids("")).toEqual([]);
  });
  it.each(["itemId", "slot", "source", "labelPurchased", "grantedAt"])("rejects a missing %s", (k) => {
    const it0: Record<string, unknown> = item("cos_shell_glass");
    delete it0[k];
    expect(() => parseEntitlements({ items: [it0] })).toThrow(/missing/);
  });
  it.each(["2026-10-01", "2026-10-01T12:00:00+02:00", "yesterday", "2026-13-40T99:00:00Z"])("rejects grantedAt %s", (g) => {
    expect(() => parseEntitlements({ items: [item("cos_shell_glass", { grantedAt: g })] })).toThrow(/grantedAt/);
  });
  it("rejects unsorted and duplicate itemIds", () => {
    expect(() => parseEntitlements({ items: [item("cos_shell_glass"), item("cos_shell_brass")] })).toThrow(/sorted/);
    expect(() => parseEntitlements({ items: [item("cos_shell_glass"), item("cos_shell_glass")] })).toThrow(/duplicate/);
  });
  it.each(["accountId", "entitlementId", "purchaseId", "price", "priceCents"])("rejects forbidden field %s", (k) => {
    expect(() => parseEntitlements({ items: [item("cos_shell_glass", { [k]: "x" })] })).toThrow(/forbidden/);
  });
  it("rejects a missing items array and unknown fields", () => {
    expect(() => parseEntitlements({})).toThrow();
    expect(() => parseEntitlements({ items: [], accountId: "a" })).toThrow();
    expect(() => parseEntitlements({ items: [item("cos_shell_glass", { colour: "x" })] })).toThrow(/unexpected/);
  });
});
