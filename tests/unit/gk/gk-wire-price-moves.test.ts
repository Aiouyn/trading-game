import { afterEach, describe, expect, it } from "vitest";
import { storyAt, STORY_EVERY, CRISES } from "@/market/wireStories";
import { START_TICK, FEED_TICK_MS } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";
import { TICKS_PER_DAY } from "@/server/market/meme";
import { resetListingsForTests } from "@/market/listings";

afterEach(() => resetListingsForTests());
const SEED = PORT_AVALON_MARKET_SEED;

describe("GK Wire price-moving frequency (V1 M1-09)", () => {
  it("first game day + ~10 wall minutes: company and demo crisis effects both move prices", () => {
    const tenMinTicks = Math.ceil((10 * 60 * 1000) / FEED_TICK_MS);
    let companyFx = 0, crisisFx = 0, crisisStories = 0, companyStories = 0;
    let crisisHitEmpty = 0;
    for (let t = START_TICK; t < START_TICK + TICKS_PER_DAY; t++) {
      const s = storyAt(SEED, t);
      if (!s) continue;
      const isCrisis = Boolean(s.crisis);
      if (isCrisis) crisisStories++; else companyStories++;
      if ((s.effects ?? []).length) {
        if (isCrisis) crisisFx++; else companyFx++;
      } else if (isCrisis && s.phase === "realized") crisisHitEmpty++;
    }
    let companyFx10 = 0, crisisFx10 = 0;
    for (let t = START_TICK; t < START_TICK + tenMinTicks; t++) {
      const s = storyAt(SEED, t);
      if (!s) continue;
      if ((s.effects ?? []).length) {
        if (s.crisis) crisisFx10++; else companyFx10++;
      }
    }
    // eslint-disable-next-line no-console
    console.log("GK_WIRE_FREQ", JSON.stringify({
      STORY_EVERY, FEED_TICK_MS, tenMinTicks,
      day: { companyStories, crisisStories, companyFx, crisisFx, crisisHitEmpty },
      tenMin: { companyFx10, crisisFx10 },
      crisesCatalogStillHasHitBp: CRISES.some((c) => c.hit.length > 0),
    }));
    expect(companyFx).toBeGreaterThan(0);
    expect(crisisFx).toBeGreaterThan(0);
    expect(crisisHitEmpty).toBe(0);
    expect(companyFx10).toBeGreaterThan(0);
    expect(crisisFx10).toBeGreaterThan(0);
  });
});
