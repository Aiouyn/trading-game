// sys/wire-variety: seeded no-repeat deck and varied magnitudes (playtest e30f6822 / d34).
import { describe, expect, it } from "vitest";
import {
  COMPANY_STORIES, CRISES, STORY_EVERY, STORY_SEVERITY_MAX, STORY_SEVERITY_MIN,
  catalogStoryAt, crisisHits, scaleEffects, storyAt, storySeverity,
} from "@/market/wireStories";
import { LiveMarket } from "@/server/market/clock";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";

const SEED = PORT_AVALON_MARKET_SEED;
const slots = (n: number, from = START_TICK) =>
  Array.from({ length: n }, (_, i) => from + (i + 1) * STORY_EVERY);
// 10 real minutes at a 5 s tick is 120 ticks, 20 story slots.
const TEN_MIN_SLOTS = 20;
const PLAYTEST_TICKS = [27694, 27754, 27814] as const;

describe("no-repeat deck", () => {
  it("the playtest 60-tick Avalon Bank triple is gone, and no company defId repeats at 60 or 72 ticks in a 10-minute window", () => {
    const play = PLAYTEST_TICKS.map((t) => catalogStoryAt(SEED, t));
    expect(play.every((s) => s !== null)).toBe(true);
    expect(new Set(play.map((s) => s!.defId)).size).toBeGreaterThan(1);
    expect(play.every((s) => s!.defId === "avb-earnings")).toBe(false);

    const window = slots(TEN_MIN_SLOTS);
    for (const t of window) {
      const s = storyAt(SEED, t);
      if (!s || s.crisis) continue;
      for (const dt of [60, 72]) {
        const later = storyAt(SEED, t + dt);
        if (!later || later.crisis) continue;
        expect(later.defId, `company ${s.defId} recurred at ${t} and ${t + dt}`).not.toBe(s.defId);
      }
    }
  });

  it("each 16-slot cycle uses every company story and every crisis kind once, with no company defId repeated inside the cycle", () => {
    for (const cycle of [0, 1, 2, 3]) {
      const cycleTicks = Array.from({ length: 16 }, (_, i) => START_TICK + (cycle * 16 + i + 1) * STORY_EVERY);
      const stories = cycleTicks.map((t) => storyAt(SEED, t)!);
      const companies = stories.filter((s) => !s.crisis);
      const crises = stories.filter((s) => s.phase === "forecast" && s.crisis);
      expect(companies.map((s) => s.defId).sort()).toEqual([...COMPANY_STORIES].map((c) => c.defId).sort());
      expect(new Set(companies.map((s) => s.defId)).size).toBe(COMPANY_STORIES.length);
      expect(new Set(crises.map((s) => s.crisis)).size).toBe(CRISES.length);
    }
  });

  it("a watch is still a no-effect forecast and the outcome two slots later is the same crisis", () => {
    for (const t of slots(16 * 4)) {
      const s = storyAt(SEED, t)!;
      if (s.kind !== "WORLD_EVENT" || s.phase !== "forecast") continue;
      expect(s.effects).toEqual([]);
      const out = storyAt(SEED, t + 2 * STORY_EVERY)!;
      expect(out.crisis).toBe(s.crisis);
      expect(storyAt(SEED, t + STORY_EVERY)!.crisis).toBeUndefined();
    }
    expect(crisisHits(SEED, 0, 0)).toBe(crisisHits(SEED, 0, 0));
  });
});

describe("varied magnitudes", () => {
  it("severity stays in the macro 0.6–1.4 band and is deterministic per seed and key", () => {
    const a = storySeverity(SEED, "100");
    expect(a).toBeGreaterThanOrEqual(STORY_SEVERITY_MIN);
    expect(a).toBeLessThan(STORY_SEVERITY_MAX);
    expect(storySeverity(SEED, "100")).toBe(a);
    expect(storySeverity(SEED + 1, "100")).not.toBe(a);
  });

  it("scaleEffects keeps sign, stays non-zero, and tracks catalog bp × severity", () => {
    expect(scaleEffects([{ assetId: "AVB", bp: 200 }], 0.6)).toEqual([{ assetId: "AVB", bp: 120 }]);
    expect(scaleEffects([{ assetId: "AVB", bp: 200 }], 1.4)).toEqual([{ assetId: "AVB", bp: 280 }]);
    expect(scaleEffects([{ assetId: "AVB", bp: -1 }], 0.6)).toEqual([{ assetId: "AVB", bp: -1 }]);
  });

  it("two appearances of the same company or crisis hit do not all share the catalog constant, but the same tick is stable", () => {
    const byDef = new Map<string, number[]>();
    for (const t of slots(16 * 8)) {
      const s = storyAt(SEED, t)!;
      expect(storyAt(SEED, t)).toEqual(storyAt(SEED, t));
      const effects = s.effects.length ? s.effects : (s.asserted ?? []);
      if (!effects.length) continue;
      const key = s.defId;
      const bp = effects[0]!.bp;
      const list = byDef.get(key) ?? [];
      list.push(bp);
      byDef.set(key, list);
    }
    const varying = [...byDef.values()].filter((bps) => new Set(bps).size > 1);
    expect(varying.length).toBeGreaterThan(0);
    // Official-seed company catalog constants are not the only published sizes.
    const avb = byDef.get("avb-earnings");
    if (avb && avb.length > 1) expect(avb.every((bp) => bp === 200)).toBe(false);
  });
});

describe("determinism, grid, and restart", () => {
  it("storyAt stays null at and before START_TICK and off-grid; a different seed differs; hash-only (no quote stream)", () => {
    expect(storyAt(SEED, START_TICK)).toBeNull();
    expect(storyAt(SEED, START_TICK + 1)).toBeNull();
    expect(storyAt(SEED, START_TICK + STORY_EVERY)).not.toBeNull();
    const a = slots(32).map((t) => storyAt(SEED, t)!.defId);
    const b = slots(32).map((t) => storyAt(SEED + 1, t)!.defId);
    expect(a).not.toEqual(b);
    expect(slots(8).map((t) => storyAt(SEED, t))).toEqual(slots(8).map((t) => catalogStoryAt(SEED, t)));
  });

  it("two clocks with one seed match tick-by-tick on stories and quotes", () => {
    const secret = "wire-variety-secret";
    const a = new LiveMarket({ seed: SEED, stormWorld: new MemoryStormWorldStore(), rumorSecret: secret, persistStorms: false });
    const b = new LiveMarket({ seed: SEED, stormWorld: new MemoryStormWorldStore(), rumorSecret: secret, persistStorms: false });
    const mid = START_TICK + 40;
    while (a.snapshot().tick < mid) { a.step(); b.step(); }
    expect(b.snapshot().tick).toBe(a.snapshot().tick);
    expect(b.snapshot().quotes).toEqual(a.snapshot().quotes);
    expect(b.wire().items.map((i) => ({ id: i.id, causeEventIds: i.causeEventIds, effects: i.effects }))).toEqual(
      a.wire().items.map((i) => ({ id: i.id, causeEventIds: i.causeEventIds, effects: i.effects })),
    );
  });
});
