import { describe, expect, it } from "vitest";
import { ASSETS } from "@/market/catalog";
import { GET } from "@/app/api/world/route";
import { MockFeed } from "@/shell/contracts/mockFeed";

describe("M1-04 canonical catalog", () => {
  it("has 10–20 unique fictional assets with valid metadata and unchanged HALC mark", () => {
    expect(ASSETS.length).toBeGreaterThanOrEqual(10);
    expect(ASSETS.length).toBeLessThanOrEqual(20);
    expect(new Set(ASSETS.map(a => a.assetId)).size).toBe(ASSETS.length);
    expect(ASSETS.find(a => a.assetId === "HALC")?.base).toBe(4218);
    for (const a of ASSETS) {
      expect(a.assetId).toMatch(/^[A-Z][A-Z0-9]+$/);
      expect(a.ticker).toBe(a.assetId);
      expect(a.name.length).toBeGreaterThan(3);
      expect(a.base).toBeGreaterThan(0);
      expect(Number.isSafeInteger(a.base)).toBe(true);
      expect(a.ccy).toBe("FDL");
      expect(a.sector).toBeTruthy();
      expect(a.bloc).toBeTruthy();
    }
  });
  it("world catalog is account independent and all entries resolve through Broker detail/preview/chart", async () => {
    const body = await (await GET()).json();
    expect(body.catalog).toEqual(ASSETS);
    expect(await (await GET()).json()).toEqual(body);
    const feed = new MockFeed({}, { autoStart: false });
    for (const a of body.catalog) {
      expect(feed.assetDetail(a.assetId)?.name).toBe(a.name);
      expect(feed.preview({ assetId: a.assetId, side: "BUY", type: "market", qty: "1", tif: "day" }).valid).toBe(true);
      expect(feed.candleHistory({ assetId: a.assetId, res: "tick", from: 1, to: 10 }).bars.length).toBeGreaterThan(0);
    }
  });
  it("fixed seed yields identical marks through several ticks (demo, not authoritative live ticks)", () => {
    const a = new MockFeed({ seed: 17 }, { autoStart: false });
    const b = new MockFeed({ seed: 17 }, { autoStart: false });
    for (let tick = 0; tick < 5; tick++) {
      expect(a.body("ticker:wl_default")).toEqual(b.body("ticker:wl_default"));
      a.advance(); b.advance();
    }
  });
});
