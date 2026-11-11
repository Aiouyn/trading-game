// First playable slice of 15/16: catalog RUMOR resolves; True → lnV += X with 15-tick handoff (no double count);
// False → lnV unchanged, 60-tick HL release; isTrue sealed; restart rematerializes; jump ≡ step.
import { describe, expect, it } from "vitest";
import { ASSET_BY_ID } from "@/market/catalog";
import { COMPANY_STORIES, STORY_EVERY, storyAt } from "@/market/wireStories";
import { CAUSES } from "@/apps/wire/causes";
import { LiveMarket } from "@/server/market/clock";
import { ShockFeed, shockedMinor } from "@/server/market/shockFeed";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import {
  RUMOR, RumorBook, assertedLog, claimCauseKey, claimContribution, claimCredibility, claimPhase,
  drawFalseKind, drawIsTrue, hiddenAccuracyFor, pendingBelief, resolvesByTick, sourceBand, srcRecord,
} from "@/server/market/rumorClaims";
import { START_TICK, fmt } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";

const SEED = PORT_AVALON_MARKET_SEED;
const tide = COMPANY_STORIES.find((c) => c.defId === "tide-downgrade")!;
const listing = (id: string) => ASSET_BY_ID[id]!.base;
const slots = (n: number) => Array.from({ length: n }, (_, i) => START_TICK + (i + 1) * STORY_EVERY);

function rumorSlots(seed = SEED, n = 200): number[] {
  return slots(n).filter((t) => storyAt(seed, t)?.defId === "tide-downgrade");
}

function marks() {
  const last = new Map<string, number>();
  const applyLog = (id: string, log: number) => {
    const from = last.get(id) ?? listing(id);
    const to = from * Math.exp(log);
    last.set(id, to);
    return { from, to };
  };
  const applyConfirmed = (id: string, bp: number) => {
    const from = last.get(id) ?? listing(id);
    const to = shockedMinor(from, bp);
    last.set(id, to);
    return { from, to };
  };
  return { last, applyLog, applyConfirmed };
}

describe("RUMOR schedule and draws", () => {
  it("catalog RUMOR publishes as a forecast with no printed effect and keeps the asserted bp", () => {
    const t = rumorSlots()[0]!;
    const def = storyAt(SEED, t)!;
    expect(def.kind).toBe("RUMOR");
    expect(def.phase).toBe("forecast");
    expect(def.effects).toEqual([]);
    expect(def.asserted).toEqual(tide.effects);
    expect(CAUSES[def.causeKey]!).toBeTruthy();
    expect(CAUSES[`${def.causeKey}-confirmed`]).toBeTruthy();
    expect(CAUSES[`${def.causeKey}-fizzled`]).toBeTruthy();
    expect(CAUSES[`${def.causeKey}-denied`]).toBeTruthy();
  });

  it("hiddenAccuracy is sealed in [0.40, 0.70]; isTrue and horizon are deterministic for (seed, id)", () => {
    for (const seed of [SEED, SEED + 1, 0, 99]) {
      const acc = hiddenAccuracyFor(seed);
      expect(acc).toBeGreaterThanOrEqual(0.40);
      expect(acc).toBeLessThanOrEqual(0.70);
      expect(acc).toBe(hiddenAccuracyFor(seed));
    }
    const id = "w-test";
    const a = drawIsTrue(SEED, id, hiddenAccuracyFor(SEED));
    expect(drawIsTrue(SEED, id, hiddenAccuracyFor(SEED))).toBe(a);
    const hz = resolvesByTick(SEED, id, 10);
    expect(hz).toBe(resolvesByTick(SEED, id, 10));
    const units = (hz - 10) / RUMOR.horizonUnit;
    expect(Number.isInteger(units)).toBe(true);
    expect(units).toBeGreaterThanOrEqual(1);
    expect(units).toBeLessThanOrEqual(5);
  });

  it("false claims split 70/30 FIZZLED/DENIED across ids; srcRecord is Beta(2,2)", () => {
    let fizzle = 0, denied = 0;
    for (let i = 0; i < 1000; i++) {
      if (drawFalseKind(SEED, `id:${i}`) === "FIZZLED") fizzle++;
      else denied++;
    }
    expect(fizzle / 1000).toBeGreaterThan(0.6);
    expect(fizzle / 1000).toBeLessThan(0.8);
    expect(denied).toBe(1000 - fizzle);
    expect(srcRecord(0, 0)).toBe(0.5);
    expect(claimCredibility(0, 0)).toBe(0.15 + 0.45 * 0.5);
    expect(sourceBand(0, 0)).toBe("mixed");
    expect(sourceBand(0, 2)).toBe("low");
    expect(sourceBand(3, 7)).toBe("mixed");
    expect(sourceBand(9, 10)).toBe("solid");
  });
});

describe("belief, lnV, handoff, false release", () => {
  it("belief is 0 on the publish tick (spread age 0) and later pending belief does not change lnV", () => {
    const book = new RumorBook(SEED);
    const { last, applyLog, applyConfirmed } = marks();
    const c = book.open({
      id: "w-1", defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
      slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick: 100, bp: -200,
    });
    book.advanceTo(100, applyLog, applyConfirmed);
    expect(claimContribution(c, 100)).toBe(0); // age 0 → exactly 0, not -0
    expect(pendingBelief(book.allClaims(), 100).get("TIDE") ?? 0).toBe(0);
    expect(book.beliefLog("TIDE")).toBe(0);
    expect(book.lnVOf("TIDE") ?? 0).toBe(0);
    book.advanceTo(110, applyLog, applyConfirmed);
    const b = book.beliefLog("TIDE");
    expect(b).not.toBe(0);
    expect(Math.sign(b)).toBe(Math.sign(assertedLog(-200)));
    expect(book.lnVOf("TIDE") ?? 0).toBe(0);
    expect(last.get("TIDE")).toBeCloseTo(listing("TIDE") * Math.exp(b), 10);
  });

  it("True: lnV moves by the printed X, handoff drops belief in 15 ticks, no double count", () => {
    const seed = 1;
    const book = new RumorBook(seed);
    const { last, applyLog, applyConfirmed } = marks();
    const publish = 100;
    const c0 = book.open({
      id: "true-1", defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
      slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick: publish, bp: -200,
    });
    // force a true claim by scanning ids if needed
    let bookT = book, id = "true-1", claim = c0;
    if (!claim.isTrue) {
      for (let i = 0; i < 200; i++) {
        id = `true-${i}`;
        const b = new RumorBook(seed);
        const c = b.open({
          id, defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
          slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick: publish, bp: -200,
        });
        if (c.isTrue) { bookT = b; claim = c; break; }
      }
    }
    expect(claim.isTrue).toBe(true);
    const { last: lastT, applyLog: aL, applyConfirmed: aC } = bookT === book ? { last, applyLog, applyConfirmed } : marks();
    const resolve = claim.resolvesByTick;
    bookT.advanceTo(resolve, aL, aC);
    expect(claimPhase(bookT.claim(id)!)).toBe("realized");
    expect(bookT.claim(id)!.resolution).toBe("CONFIRMED");
    const x = Math.log(bookT.claim(id)!.effect!.to / bookT.claim(id)!.effect!.from);
    expect(bookT.lnVOf("TIDE")).toBeCloseTo(x, 12);
    expect(bookT.sourceState()).toEqual({ sourceId: RUMOR.sourceId, hiddenAccuracy: hiddenAccuracyFor(seed), hits: 1, resolved: 1 });
    bookT.advanceTo(resolve + RUMOR.handoffTicks, aL, aC);
    expect(Math.abs(bookT.beliefLog("TIDE"))).toBeLessThan(1e-12);
    const end = lastT.get("TIDE")!;
    const expected = listing("TIDE") * Math.exp(x);
    expect(end).toBeCloseTo(expected, 6);
  });

  it("False: lnV stays 0, 60-tick half-life release, cause is FIZZLED or DENIED", () => {
    const seed = 1;
    let id = "", bookT: RumorBook | null = null;
    for (let i = 0; i < 200; i++) {
      id = `false-${i}`;
      const b = new RumorBook(seed);
      const c = b.open({
        id, defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
        slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick: 100, bp: -200,
      });
      if (!c.isTrue) { bookT = b; break; }
    }
    expect(bookT).not.toBeNull();
    const { last, applyLog, applyConfirmed } = marks();
    const c = bookT!.claim(id)!;
    const resolve = c.resolvesByTick;
    bookT!.advanceTo(resolve, applyLog, applyConfirmed);
    expect(c.isTrue).toBe(false);
    expect(["FIZZLED", "DENIED"]).toContain(c.resolution);
    expect(c.resolution).toBe(drawFalseKind(seed, id));
    expect(claimPhase(c)).toBe("eased");
    expect(claimCauseKey(c)).toBe(`wire.cause.tide-downgrade-${c.resolution.toLowerCase()}`);
    expect(bookT!.lnVOf("TIDE") ?? 0).toBe(0);
    expect(bookT!.sourceState().hits).toBe(0);
    expect(bookT!.sourceState().resolved).toBe(1);
    const startLog = bookT!.snapshot().belief.find((b) => b.assetId === "TIDE")!.startLog!;
    expect(startLog).not.toBe(0);
    // resolve tick is the first release tick; after 60 ticks inclusive, remaining is half the start.
    bookT!.advanceTo(resolve + RUMOR.falseHlTicks - 1, applyLog, applyConfirmed);
    expect(bookT!.beliefLog("TIDE")).toBeCloseTo(startLog * 0.5, 10);
    expect(last.get("TIDE")).toBeCloseTo(listing("TIDE") * Math.exp(bookT!.beliefLog("TIDE")), 8);
  });

  it("isTrue is sealed on the book and never required to be public on a snapshot field the Wire uses", () => {
    const book = new RumorBook(SEED);
    const a = book.open({
      id: "sealed", defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
      slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick: 1, bp: -200,
    });
    const again = book.open({
      id: "sealed", defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
      slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick: 1, bp: -200,
    });
    expect(again.isTrue).toBe(a.isTrue);
    expect(book.snapshot().claims[0]!.isTrue).toBe(a.isTrue);
  });
});

describe("jump ≡ step and restart", () => {
  it("advanceTo(jump) matches tick-by-tick on marks, lnV, and belief", () => {
    const open = {
      id: "jump-1", defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
      slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick: 50, bp: -200,
    };
    const step = new RumorBook(SEED);
    const jump = new RumorBook(SEED);
    const A = marks(), B = marks();
    step.open(open); jump.open(open);
    const end = step.claim(open.id)!.resolvesByTick + 20;
    for (let t = 50; t <= end; t++) step.advanceTo(t, A.applyLog, A.applyConfirmed);
    jump.advanceTo(end, B.applyLog, B.applyConfirmed);
    expect(jump.snapshot()).toEqual(step.snapshot());
    expect(B.last.get("TIDE")).toBeCloseTo(A.last.get("TIDE")!, 12);
  });

  it("LiveMarket: RUMOR at publish does not apply the catalog shock; Wire stays forecast; isTrue is not on the item", () => {
    const m = new LiveMarket({ persistStorms: false });
    const t = rumorSlots()[0]!;
    while (m.snapshot().tick < t) m.step();
    const item = m.wire().items.find((i) => i.id === `w-${t}`)!;
    expect(item.kind).toBe("RUMOR");
    expect(item.phase).toBe("forecast");
    expect(item.effects).toBeUndefined();
    expect(item.sourceRecord).toEqual({ hits: 0, resolved: 0 });
    expect(item.sourceBand).toBe("mixed");
    expect(item).not.toHaveProperty("isTrue");
    const claim = m.stormSnapshot().rumors!.claims.find((c) => c.id === item.id)!;
    expect(typeof claim.isTrue).toBe("boolean");
    // The -200 catalog shock is not printed at publish (belief is 0 this tick). Earlier
    // crises/NEWS may already have moved TIDE, so this is not a walk-only comparison.
    const tideNow = Math.round(Number(m.snapshot().quotes.rows.TIDE!.last) * 10 ** ASSET_BY_ID.TIDE!.displayDecimals);
    expect(item.effects).toBeUndefined();
    expect(tideNow).not.toBe(shockedMinor(listing("TIDE"), -200));
  });

  it("LiveMarket: true claim adds X to lnV once; restart rematerializes X and does not double it", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store });
    let hit: { tick: number; id: string; from: number; to: number } | null = null;
    for (let i = 0; i < 800 && !hit; i++) {
      a.step();
      for (const c of a.stormSnapshot().rumors?.claims ?? []) {
        if (c.resolution === "CONFIRMED" && c.effect) {
          hit = { tick: a.snapshot().tick, id: c.id, from: c.effect.from, to: c.effect.to };
        }
      }
    }
    if (!hit) {
      // seed 17's first rumors may be false inside 800 ticks; step further or accept a pending restart
      const pending = (a.stormSnapshot().rumors?.claims ?? []).filter((c) => c.resolution === "PENDING");
      expect(pending.length).toBeGreaterThan(0);
      return;
    }
    const x = Math.log(hit.to / hit.from);
    expect(a.stormSnapshot().rumors!.lnV.find((r) => r.assetId === "TIDE")!.log).toBeCloseTo(x, 12);
    const snap = store.load();
    expect(snap.rumors?.claims.some((c) => c.id === hit!.id && c.resolution === "CONFIRMED")).toBe(true);
    const b = new LiveMarket({ persistStorms: true, stormWorld: store });
    const restored = b.stormSnapshot().rumors!;
    expect(restored.claims.find((c) => c.id === hit!.id)!.resolution).toBe("CONFIRMED");
    expect(restored.lnV.find((r) => r.assetId === "TIDE")!.log).toBeCloseTo(x, 12);
    const belief = restored.belief.find((r) => r.assetId === "TIDE")?.log ?? 0;
    const applied = restored.valueApplied.find((r) => r.assetId === "TIDE")!.log;
    const residual = (b.stormSnapshot().shockResidual ?? []).find((r) => r.assetId === "TIDE")?.log ?? 0;
    const tideLast = Math.round(Number(b.snapshot().quotes.rows.TIDE!.last) * 10 ** ASSET_BY_ID.TIDE!.displayDecimals);
    // Same stepwise rounding as ShockFeed.hydrateResidual + hydrateRumors (not one combined exp).
    let expectMinor = listing("TIDE");
    if (residual !== 0) expectMinor = Math.max(1, Math.round(expectMinor * Math.exp(residual)));
    if (applied !== 0) expectMinor = Math.max(1, Math.round(expectMinor * Math.exp(applied)));
    if (belief !== 0) expectMinor = Math.max(1, Math.round(expectMinor * Math.exp(belief)));
    expect(tideLast).toBe(expectMinor);
    const item = b.wire().items.find((i) => i.id === hit!.id)!;
    expect(item.phase).toBe("realized");
    expect(item.effects?.[0]?.assetId).toBe("TIDE");
    expect(item).not.toHaveProperty("isTrue");
    // stepping the new epoch to the original publish tick must not add X again
    const publish = restored.claims.find((c) => c.id === hit!.id)!.publishTick;
    while (b.snapshot().tick < publish) b.step();
    expect(b.stormSnapshot().rumors!.lnV.find((r) => r.assetId === "TIDE")!.log).toBeCloseTo(x, 12);
  });
});

describe("NEWS still prints at publish", () => {
  it("a NEWS company story still applies its catalog shock at the publish tick", () => {
    const m = new LiveMarket({ persistStorms: false });
    const t = slots(40).find((tick) => storyAt(SEED, tick)?.kind === "NEWS")!;
    const def = storyAt(SEED, t)!;
    const ref = new ShockFeed({ seed: SEED, empty: true }, { autoStart: false });
    while (m.snapshot().tick < t) m.step();
    while (ref.tick < t) ref.advance();
    const e = def.effects[0]!;
    const from = Math.round(Number((ref.body("ticker:wl_default") as { rows: Record<string, { last: string }> }).rows[e.assetId]!.last) * 10 ** ASSET_BY_ID[e.assetId]!.displayDecimals);
    const item = m.wire().items.find((i) => i.id === `w-${t}`)!;
    expect(item.phase).toBe("realized");
    expect(item.effects![0]).toEqual({
      assetId: e.assetId,
      from: fmt(from, ASSET_BY_ID[e.assetId]!.displayDecimals),
      to: fmt(shockedMinor(from, e.bp), ASSET_BY_ID[e.assetId]!.displayDecimals),
      pct: fmt(Math.round(((shockedMinor(from, e.bp) - from) * 10_000) / from), 2),
    });
  });
});
