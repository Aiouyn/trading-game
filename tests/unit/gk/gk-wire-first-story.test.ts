// Fresh-world Wire history at START_TICK: readable catalog stories, no new shocks (V1-BOARD M2-01, 18-AT-06).
import { describe, expect, it } from "vitest";
import { CAUSES } from "@/apps/wire/causes";
import { EN } from "@/apps/wire/strings";
import { ASSET_BY_ID } from "@/market/catalog";
import { parseWireSnapshot } from "@/market/wireSnapshot";
import {
  STORY_EVERY, bootHistory, catalogStoryAt, historyItemId, storyAt,
} from "@/market/wireStories";
import { LiveMarket } from "@/server/market/clock";
import { ShockFeed } from "@/server/market/shockFeed";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";

const SEED = PORT_AVALON_MARKET_SEED;
const firstLive = START_TICK + STORY_EVERY;

describe("catalog grid vs live storyAt", () => {
  it("storyAt stays null at and before START_TICK; the live first story is unchanged", () => {
    expect(storyAt(SEED, START_TICK)).toBeNull();
    expect(storyAt(SEED, START_TICK - STORY_EVERY)).toBeNull();
    expect(catalogStoryAt(SEED, START_TICK)).not.toBeNull();
    expect(catalogStoryAt(SEED, START_TICK + 1)).toBeNull();
    expect(storyAt(SEED, firstLive)).toEqual(catalogStoryAt(SEED, firstLive));
    expect(storyAt(SEED, firstLive)!.defId).toBe("orca-trial");
  });

  it("bootHistory returns 1–2 lookback catalog stories at or before START_TICK, preferring realized NEWS", () => {
    const rows = bootHistory(SEED, START_TICK);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeLessThanOrEqual(2);
    expect(rows).toEqual(bootHistory(SEED, START_TICK));
    for (const { tick, def } of rows) {
      expect(tick).toBeLessThanOrEqual(START_TICK);
      expect(START_TICK - tick).toBeLessThanOrEqual(720);
      expect(def).toEqual(catalogStoryAt(SEED, tick));
      expect(def.assets.length).toBeGreaterThan(0);
      expect(EN.headlines[def.headlineKey], def.headlineKey).toBeDefined();
      expect(CAUSES[def.causeKey], def.causeKey).toBeDefined();
    }
    expect(rows.filter((r) => r.def.kind === "NEWS" && r.def.phase === "realized").length).toBeGreaterThan(0);
    const other = bootHistory(SEED + 1, START_TICK);
    expect(other.map((r) => r.def.defId).join()).not.toBe(rows.map((r) => r.def.defId).join());
  });
});

describe("LiveMarket seeds history at t0 without moving marks", () => {
  it("a fresh clock's Wire has the history rows immediately; quotes match an unshocked walk; reads do not add or move", () => {
    const market = new LiveMarket({ seed: SEED });
    const ref = new ShockFeed({ seed: SEED, empty: true }, { autoStart: false, startTick: START_TICK });
    expect(market.snapshot().tick).toBe(START_TICK);
    const w = market.wire();
    const hist = w.items.filter((i) => i.id.startsWith("w-h-"));
    const want = bootHistory(SEED, START_TICK);
    expect(hist.map((i) => i.id)).toEqual(want.map((r) => historyItemId(r.tick)));
    expect(hist.length).toBeGreaterThanOrEqual(1);
    for (const [n, item] of hist.entries()) {
      const { tick, def } = want[n]!;
      expect(item.tick).toBe(tick);
      expect(item.kind).toBe(def.kind);
      expect(item.headlineKey).toBe(def.headlineKey);
      expect(item.causeKey).toBe(def.causeKey);
      expect(item.causeEventIds).toEqual([def.defId]);
      expect(item.entities.map((e) => e.id)).toEqual(def.assets);
      expect(ASSET_BY_ID[item.entities[0]!.id]).toBeDefined();
      expect(item.effects).toBeUndefined();
      expect(item.phase).toBeUndefined();
      expect(item).not.toHaveProperty("isTrue");
    }
    expect(parseWireSnapshot(w)).toEqual(w);
    expect(market.snapshot().quotes).toEqual(ref.body("ticker:wl_default"));
    const before = market.snapshot();
    const wire = market.wire();
    for (let n = 0; n < 5; n++) { market.snapshot(); market.wire(); }
    expect(market.snapshot()).toEqual(before);
    expect(market.wire()).toEqual(wire);
  });

  it("the first live story still publishes at START_TICK+6 with its catalog effect, once; history remains", () => {
    const market = new LiveMarket({ seed: SEED });
    const ref = new ShockFeed({ seed: SEED, empty: true }, { autoStart: false, startTick: START_TICK });
    const histIds = market.wire().items.filter((i) => i.id.startsWith("w-h-")).map((i) => i.id);
    while (market.snapshot().tick < firstLive) {
      market.step();
      ref.advance();
      const def = storyAt(SEED, ref.tick);
      if (def) {
        for (const e of def.effects) ref.applyShock(e.assetId, e.bp);
        if (def.kind === "RUMOR") {
          const a = (def.asserted ?? def.effects)[0];
          if (a) {
            ref.openRumor({
              id: `w-${ref.tick}`, defId: def.defId, assetId: a.assetId, headlineKey: def.headlineKey,
              slots: { ...def.slots }, causeKey: def.causeKey, publishTick: ref.tick, bp: a.bp,
            });
          }
        }
      }
      ref.advanceRumors(ref.tick);
    }
    expect(market.snapshot().tick).toBe(firstLive);
    const live = market.wire().items.find((i) => i.id === `w-${firstLive}`)!;
    expect(live).toBeDefined();
    expect(live.tick).toBe(firstLive);
    expect(live.causeEventIds).toEqual([storyAt(SEED, firstLive)!.defId]);
    expect(live.effects?.length).toBeGreaterThan(0);
    expect(market.snapshot().quotes).toEqual(ref.body("ticker:wl_default"));
    expect(histIds.every((id) => market.wire().items.some((i) => i.id === id))).toBe(true);
  });

  it("same seed replays the same history; a later-tick resume does not re-seed; hydrate at START_TICK is idempotent", () => {
    const a = new LiveMarket({ seed: SEED });
    const b = new LiveMarket({ seed: SEED });
    expect(a.wire().items.filter((i) => i.id.startsWith("w-h-"))).toEqual(b.wire().items.filter((i) => i.id.startsWith("w-h-")));
    const store = new MemoryStormWorldStore();
    const first = new LiveMarket({ seed: SEED, stormWorld: store, rumorSecret: "gk-wire-first-story-secret" });
    const ids = first.wire().items.filter((i) => i.id.startsWith("w-h-")).map((i) => i.id);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    const quotes = first.snapshot().quotes;
    const again = new LiveMarket({ seed: SEED, stormWorld: store, rumorSecret: "gk-wire-first-story-secret" });
    expect(again.snapshot().tick).toBe(START_TICK);
    expect(again.wire().items.filter((i) => i.id.startsWith("w-h-")).map((i) => i.id)).toEqual(ids);
    expect(again.snapshot().quotes).toEqual(quotes);
    expect(parseWireSnapshot(again.wire())).not.toBeNull();
    // mid-run resume does not inject a second copy at a later tick
    first.step();
    const mid = new LiveMarket({ seed: SEED, stormWorld: store, rumorSecret: "gk-wire-first-story-secret" });
    expect(mid.snapshot().tick).toBeGreaterThan(START_TICK);
    expect(mid.wire().items.filter((i) => i.id.startsWith("w-h-"))).toEqual([]);
  });
});
