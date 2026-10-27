import { describe, expect, it } from "vitest";
import { urlOf } from "@/shell/back";
import { applyLayout, layoutFits, TRADE_MIN_VW } from "@/shell/layouts";
import { GUTTER } from "@/shell/wm";

const area = (vw: number) => ({ x: GUTTER, y: 48, w: vw - 2 * GUTTER, h: 780 });

describe("17A T4 §3: Trade layout below 1264", () => {
  it("is not offered at 1263 and is at 1264 with Broker ≥ 720 and Portfolio ≥ 520", () => {
    expect(TRADE_MIN_VW).toBe(1264);
    expect(layoutFits("trade", area(1263))).toBe(false);
    expect(layoutFits("trade", area(1264))).toBe(true);
    const w = applyLayout("trade", area(1264), () => true);
    expect(w.find((x) => x.app === "broker")!.w).toBeGreaterThanOrEqual(720);
    expect(w.find((x) => x.app === "portfolio")!.w).toBeGreaterThanOrEqual(520);
  });
  it("a new account below 1264 gets Broker alone", () => {
    expect(applyLayout("trade", area(1263), () => true).map((w) => w.app)).toEqual(["broker"]);
  });
});

describe("17A T4 §2/§5: URL of the focused window", () => {
  it("maps windows and phone screens to deep links", () => {
    expect(urlOf(null)).toBe("/");
    expect(urlOf({ app: "wire" })).toBe("/wire");
    expect(urlOf({ app: "broker", context: "HALC" })).toBe("/broker?asset=HALC");
    expect(urlOf({ app: "portfolio" }, "journal")).toBe("/portfolio/journal");
  });
});
