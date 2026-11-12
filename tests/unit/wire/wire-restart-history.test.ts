// b3 (gatekeeper 20c3bb69 REVIEW.md:37/:47): a server restart must not wipe the Wire. The clock keeps its stories only in
// memory (LiveMarket.stories, src/server/market/clock.ts); on boot restoreStormWorld() replaces them with
// rebuildRumorStories() (rumor/farm/analyst/denial rows only) and seedBootHistory() returns early on any resumed tick,
// so every catalog story, crisis/storm row and coin-news row published before the restart is gone.
// These are the root-cause-seam units: a clock restarted on the same persisted store must list the same Wire rows the
// player saw before the restart (bounded by STORY_KEEP), and keep publishing exactly as an uninterrupted clock does.
import { describe, expect, it } from "vitest";
import { LiveMarket } from "@/server/market/clock";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import { STORY_EVERY, STORY_KEEP } from "@/market/wireStories";
import type { WireItem } from "@/shell/contracts/channels";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";

const SEED = PORT_AVALON_MARKET_SEED;
const SECRET = "wire-restart-history-secret";
const stepTo = (m: LiveMarket, tick: number) => { while (m.snapshot().tick < tick) m.step(); };
/** What a player reads on a row: identity, text, cause and the shown move. */
const shown = (i: WireItem) => ({ id: i.id, tick: i.tick, kind: i.kind, headlineKey: i.headlineKey, slots: i.slots, causeEventIds: i.causeEventIds, causeKey: i.causeKey, phase: i.phase });
const isCatalog = (i: WireItem) => /^w-\d+$/.test(i.id) || i.id.startsWith("w-h-");

describe("b3: Wire history survives a server restart (same persisted store)", () => {
  it("a restarted clock lists every row published before the restart (ids, ticks, text, cause)", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET, seed: SEED });
    stepTo(a, START_TICK + 20 * STORY_EVERY); // ~20 catalog stories, as in the gatekeeper repro
    const before = a.wire().items;
    expect(before.filter(isCatalog).length).toBeGreaterThanOrEqual(20);
    const b = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED }); // the restart
    expect(b.snapshot().tick).toBe(a.snapshot().tick);
    const after = b.wire().items;
    const missing = before.filter((x) => !after.some((y) => y.id === x.id)).map((x) => `${x.id}@${x.tick}`);
    expect(missing, `rows lost on restart: ${missing.join(", ")}`).toEqual([]);
    expect(after.map(shown)).toEqual(before.map(shown));
  });

  it("the price move a realized story showed before the restart is the one it shows after (no recomputed effects)", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET, seed: SEED });
    stepTo(a, START_TICK + 20 * STORY_EVERY);
    const moved = a.wire().items.filter((i) => i.effects?.length);
    expect(moved.length).toBeGreaterThan(0);
    const b = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED });
    const byId = new Map(b.wire().items.map((i) => [i.id, i]));
    for (const m of moved) expect(byId.get(m.id)?.effects, `effects of ${m.id}`).toEqual(m.effects);
  });

  it("restart then continue: the Wire equals an uninterrupted clock's rows at the same tick (ids), bounded by STORY_KEEP", () => {
    const store = new MemoryStormWorldStore();
    const control = new LiveMarket({ persistStorms: true, stormWorld: new MemoryStormWorldStore(), rumorSecret: SECRET, seed: SEED });
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET, seed: SEED });
    const cut = START_TICK + 20 * STORY_EVERY;
    stepTo(control, cut); stepTo(a, cut);
    const b = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED });
    const end = cut + 50 * STORY_EVERY; // past STORY_KEEP's worth of catalog slots from START_TICK
    stepTo(control, end); stepTo(b, end);
    const ids = (m: LiveMarket) => m.wire().items.filter(isCatalog).map((i) => i.id);
    expect(ids(b)).toEqual(ids(control));
    expect(b.wire().items.length).toBeLessThanOrEqual(STORY_KEEP + 20); // held rumors may exceed the window (retainStories)
  });

  it("two restarts in a row (a crash loop) keep the same rows; a read never writes the store", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET, seed: SEED });
    stepTo(a, START_TICK + 12 * STORY_EVERY);
    const want = a.wire().items.map((i) => i.id);
    const b = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED });
    const saved = JSON.stringify(store.load());
    b.wire(); b.wire();
    expect(JSON.stringify(store.load())).toBe(saved); // REVIEW-LESSONS 20: reads do not persist
    const c = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED });
    expect(c.wire().items.map((i) => i.id)).toEqual(want);
  });
});

describe("b3: bounds and prices", () => {
  it("STORY_KEEP bound: after a long run the restored Wire equals the live window and stays within the retain bound", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET, seed: SEED });
    stepTo(a, START_TICK + 3 * STORY_KEEP * STORY_EVERY); // three windows: plenty of rows trimmed
    const live = a.wire().items;
    expect(live.filter((i) => /^w-\d+$/.test(i.id)).length).toBeLessThanOrEqual(STORY_KEEP);
    const b = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED });
    expect(b.wire().items.map((i) => i.id)).toEqual(live.map((i) => i.id));
    expect(b.wire().items.length).toBe(live.length);
  });

  it("prices: a restart with the Wire restored gives byte-identical quotes and storm state to a restart without it (main's boot)", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET, seed: SEED });
    stepTo(a, START_TICK + 20 * STORY_EVERY);
    const saved = store.load() as unknown as Record<string, unknown>;
    expect(saved.wire, "no wire in the saved snapshot").toBeDefined();
    const stripped = new MemoryStormWorldStore();
    const noWire = { ...saved }; delete noWire.wire;
    stripped.save(noWire as never);
    const withWire = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED });
    const mainBoot = new LiveMarket({ persistStorms: true, stormWorld: stripped, seed: SEED });
    const same = () => {
      expect(JSON.stringify(withWire.snapshot())).toBe(JSON.stringify(mainBoot.snapshot()));
      expect(JSON.stringify(withWire.stormSnapshot())).toBe(JSON.stringify(mainBoot.stormSnapshot()));
    };
    same();
    for (let i = 0; i < 60; i++) { withWire.step(); mainBoot.step(); }
    same();
  });
});
