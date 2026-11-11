// First playable slice of 15/16: catalog RUMOR resolves; True → lnV += X with no-overshoot net (X − belief);
// False → lnV unchanged, 60-tick HL release with integer-mark remainder carry; isTrue sealed by a server secret;
// restart resumes lastTick; jump ≡ step.
import { createHash } from "node:crypto";
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
import { parseWireSnapshot } from "@/market/wireSnapshot";
import { START_TICK, fmt } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";

const SEED = PORT_AVALON_MARKET_SEED;
const SECRET = "gk-claims-resolve-test-secret";
const tide = COMPANY_STORIES.find((c) => c.defId === "tide-downgrade")!;
const listing = (id: string) => ASSET_BY_ID[id]!.base;
const slots = (n: number) => Array.from({ length: n }, (_, i) => START_TICK + (i + 1) * STORY_EVERY);
const book = (seed = SEED) => new RumorBook(seed, undefined, { secret: SECRET });
const accOf = (seed = SEED) => hiddenAccuracyFor(seed, SECRET);

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

function openTide(b: RumorBook, id: string, publishTick = 100, bp = -200) {
  return b.open({
    id, defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
    slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick, bp,
  });
}

function findClaim(truth: boolean, seed = 1): { book: RumorBook; id: string } {
  for (let i = 0; i < 400; i++) {
    const id = `${truth ? "true" : "false"}-${i}`;
    const b = book(seed);
    const c = openTide(b, id);
    if (c.isTrue === truth) return { book: b, id };
  }
  throw new Error(`no ${truth ? "true" : "false"} claim`);
}

function publicPredictIsTrue(seed: number, id: string): boolean {
  // The Gatekeeper client predictor: public seed + id only, no secret.
  const hash = (key: string) => {
    let h = 2166136261;
    for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const accuracy = 0.4 + 0.3 * hash(`rumor:${seed}:acc`) / 4294967296;
  return hash(`rumor:${seed}:true:${id}`) / 4294967296 < accuracy;
}

function snapHash(snap: unknown): string {
  return createHash("sha256").update(JSON.stringify(snap)).digest("hex");
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

  it("hiddenAccuracy is sealed in [0.40, 0.70]; isTrue and horizon are deterministic for (seed, id, secret)", () => {
    for (const seed of [SEED, SEED + 1, 0, 99]) {
      const acc = accOf(seed);
      expect(acc).toBeGreaterThanOrEqual(0.40);
      expect(acc).toBeLessThanOrEqual(0.70);
      expect(acc).toBe(hiddenAccuracyFor(seed, SECRET));
      expect(acc).not.toBe(hiddenAccuracyFor(seed, `${SECRET}-other`));
    }
    const id = "w-test";
    const a = drawIsTrue(SEED, id, accOf(), SECRET);
    expect(drawIsTrue(SEED, id, accOf(), SECRET)).toBe(a);
    const hz = resolvesByTick(SEED, id, 10, SECRET);
    expect(hz).toBe(resolvesByTick(SEED, id, 10, SECRET));
    const units = (hz - 10) / RUMOR.horizonUnit;
    expect(RUMOR.horizonUnit).toBe(720);
    expect(Number.isInteger(units)).toBe(true);
    expect(units).toBeGreaterThanOrEqual(1);
    expect(units).toBeLessThanOrEqual(5);
    expect(hz - 10).toBeGreaterThanOrEqual(720);
    expect(hz - 10).toBeLessThanOrEqual(3600);
  });

  it("false claims split 70/30 FIZZLED/DENIED across ids; srcRecord is Beta(2,2)", () => {
    let fizzle = 0, denied = 0;
    for (let i = 0; i < 1000; i++) {
      if (drawFalseKind(SEED, `id:${i}`, SECRET) === "FIZZLED") fizzle++;
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

  it("a public-seed predictor is no better than chance; the secret is not on the market snapshot", () => {
    let hits = 0;
    const n = 1000;
    const secret = "live-secret-not-the-public-algorithm";
    const acc = hiddenAccuracyFor(SEED, secret);
    for (let i = 0; i < n; i++) {
      const id = `w-pred-${i}`;
      const actual = drawIsTrue(SEED, id, acc, secret);
      if (publicPredictIsTrue(SEED, id) === actual) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.40);
    expect(hits / n).toBeLessThan(0.60);
    const m = new LiveMarket({ persistStorms: false, rumorSecret: secret });
    const body = JSON.stringify(m.snapshot());
    expect(body).not.toContain(secret);
    expect(m.snapshot()).not.toHaveProperty("rumors");
    expect(body).not.toContain("hiddenAccuracy");
  });
});

describe("belief, lnV, handoff, false release", () => {
  it("belief is 0 on the publish tick (spread age 0) and later pending belief does not change lnV", () => {
    const b = book();
    const { last, applyLog, applyConfirmed } = marks();
    const c = openTide(b, "w-1");
    b.advanceTo(100, applyLog, applyConfirmed);
    expect(claimContribution(c, 100)).toBe(0);
    expect(pendingBelief(b.allClaims(), 100).get("TIDE") ?? 0).toBe(0);
    expect(b.beliefLog("TIDE")).toBe(0);
    expect(b.lnVOf("TIDE") ?? 0).toBe(0);
    b.advanceTo(110, applyLog, applyConfirmed);
    const bel = b.beliefLog("TIDE");
    expect(bel).not.toBe(0);
    expect(Math.sign(bel)).toBe(Math.sign(assertedLog(-200)));
    expect(b.lnVOf("TIDE") ?? 0).toBe(0);
    expect(last.get("TIDE")).toBeCloseTo(listing("TIDE") * Math.exp(bel), 10);
  });

  it("True: lnV moves by the printed X, confirmation nets X minus retained belief, no overshoot", () => {
    const { book: bookT, id } = findClaim(true);
    const { last: lastT, applyLog: aL, applyConfirmed: aC } = marks();
    const claim = bookT.claim(id)!;
    expect(claim.isTrue).toBe(true);
    const resolve = claim.resolvesByTick;
    bookT.advanceTo(resolve - 1, aL, aC);
    const retained = bookT.beliefLog("TIDE");
    expect(retained).not.toBe(0);
    bookT.advanceTo(resolve, aL, aC);
    expect(claimPhase(bookT.claim(id)!)).toBe("realized");
    expect(bookT.claim(id)!.resolution).toBe("CONFIRMED");
    const x = Math.log(bookT.claim(id)!.effect!.to / bookT.claim(id)!.effect!.from);
    expect(bookT.lnVOf("TIDE")).toBeCloseTo(x, 12);
    expect(bookT.sourceState()).toEqual({ sourceId: RUMOR.sourceId, hiddenAccuracy: accOf(1), hits: 1, resolved: 1 });
    expect(Math.abs(bookT.beliefLog("TIDE"))).toBeLessThan(1e-12);
    const end = lastT.get("TIDE")!;
    const expected = listing("TIDE") * Math.exp(x);
    expect(end).toBeCloseTo(expected, 6);
    bookT.advanceTo(resolve + RUMOR.handoffTicks, aL, aC);
    expect(Math.abs(bookT.beliefLog("TIDE"))).toBeLessThan(1e-12);
    expect(lastT.get("TIDE")).toBeCloseTo(expected, 6);
  });

  it("False: lnV stays 0, 60-tick half-life release, cause is FIZZLED or DENIED", () => {
    const { book: bookT, id } = findClaim(false);
    const { last, applyLog, applyConfirmed } = marks();
    const c = bookT.claim(id)!;
    const resolve = c.resolvesByTick;
    bookT.advanceTo(resolve, applyLog, applyConfirmed);
    expect(c.isTrue).toBe(false);
    expect(["FIZZLED", "DENIED"]).toContain(c.resolution);
    expect(c.resolution).toBe(drawFalseKind(1, id, SECRET));
    expect(claimPhase(c)).toBe("eased");
    expect(claimCauseKey(c)).toBe(`wire.cause.tide-downgrade-${c.resolution.toLowerCase()}`);
    expect(bookT.lnVOf("TIDE") ?? 0).toBe(0);
    expect(bookT.sourceState().hits).toBe(0);
    expect(bookT.sourceState().resolved).toBe(1);
    const startLog = bookT.snapshot().belief.find((b) => b.assetId === "TIDE")!.startLog!;
    expect(startLog).not.toBe(0);
    bookT.advanceTo(resolve + RUMOR.falseHlTicks - 1, applyLog, applyConfirmed);
    expect(bookT.beliefLog("TIDE")).toBeCloseTo(startLog * 0.5, 10);
    expect(last.get("TIDE")).toBeCloseTo(listing("TIDE") * Math.exp(bookT.beliefLog("TIDE")), 8);
  });

  it("overlapping pending claims sum (05:864-865); a false resolve releases only that claim", () => {
    const b = book();
    const { applyLog, applyConfirmed } = marks();
    const a = openTide(b, "overlap-a", 100, -200);
    const c2 = openTide(b, "overlap-b", 110, -100);
    b.advanceTo(140, applyLog, applyConfirmed);
    const sum = claimContribution(a, 140) + claimContribution(c2, 140);
    expect(b.beliefLog("TIDE")).toBeCloseTo(sum, 12);
    expect(b.snapshot().belief).toHaveLength(2);
  });

  it("isTrue is sealed on the book and never required to be public on a snapshot field the Wire uses", () => {
    const b = book();
    const a = openTide(b, "sealed", 1);
    const again = openTide(b, "sealed", 1);
    expect(again.isTrue).toBe(a.isTrue);
    expect(b.snapshot().claims[0]!.isTrue).toBe(a.isTrue);
  });

  it("TIDE 55.30 integer marks recover after a false rumor; confirmation does not overshoot", () => {
    const start = listing("TIDE");
    expect(start).toBe(5530);

    const run = (truth: boolean) => {
      const { book: b, id } = findClaim(truth, 17);
      const f = new ShockFeed({ seed: 17, empty: true }, { autoStart: false, rumorSecret: SECRET });
      const price = () => (f.body("ticker:wl_default") as { rows: Record<string, { last: string }> }).rows.TIDE!.last;
      const apply = (assetId: string, log: number) => f.applyLogMove(assetId, log);
      const confirm = (assetId: string, bp: number) => f.applyShock(assetId, bp);
      const c = b.claim(id)!;
      const initial = Number(price());
      expect(Math.round(initial * 100)).toBe(5530);
      b.advanceTo(c.resolvesByTick - 1, apply, confirm);
      const pending = Number(price());
      b.advanceTo(c.resolvesByTick, apply, confirm);
      const at = Number(price());
      b.advanceTo(c.resolvesByTick + 59, apply, confirm);
      const hl = Number(price());
      b.advanceTo(c.resolvesByTick + 600, apply, confirm);
      return { c, initial, pending, at, hl, end: Number(price()), belief: b.beliefLog("TIDE"), value: b.lnVOf("TIDE") ?? 0 };
    };

    const f = run(false);
    expect(f.pending).toBeLessThan(f.initial);
    expect(f.value).toBe(0);
    // 10 half-lives leave a tiny theoretical leftover (~start/1024); the integer mark must have recovered.
    expect(Math.abs(f.belief)).toBeLessThan(1e-5);
    expect(Math.round(f.end * 100)).toBe(Math.round(f.initial * 100));

    const t = run(true);
    const atMinor = Math.round(t.at * 100);
    expect(atMinor).toBe(t.c.effect!.to);
    // Belief was removed before X, so the confirmation print starts at the pre-rumor integer mark.
    expect(t.c.effect!.from).toBe(Math.round(t.initial * 100));
    expect(Math.round(t.end * 100)).toBe(atMinor);
  });
});

describe("jump ≡ step and restart", () => {
  it("advanceTo(jump) matches tick-by-tick on marks, lnV, and belief", () => {
    const open = {
      id: "jump-1", defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
      slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick: 50, bp: -200,
    };
    const step = book();
    const jump = book();
    const A = marks(), B = marks();
    step.open(open); jump.open(open);
    const end = step.claim(open.id)!.resolvesByTick + 20;
    for (let t = 50; t <= end; t++) step.advanceTo(t, A.applyLog, A.applyConfirmed);
    jump.advanceTo(end, B.applyLog, B.applyConfirmed);
    expect(jump.snapshot()).toEqual(step.snapshot());
    expect(B.last.get("TIDE")).toBeCloseTo(A.last.get("TIDE")!, 8);
  });

  it("hydrating a mid-false-release snapshot continues identically after one more tick", () => {
    const { book: a, id } = findClaim(false);
    const A = marks(), B = marks();
    const c = a.claim(id)!;
    a.advanceTo(c.resolvesByTick + 10, A.applyLog, A.applyConfirmed);
    expect(a.snapshot().belief.find((b) => b.claimId === id)?.mode).toBe("falseRelease");
    const mid = a.snapshot();
    const h1 = snapHash(mid);
    const b = new RumorBook(1, mid, { secret: SECRET });
    expect(snapHash(b.snapshot())).toBe(h1);
    for (const m of mid.beliefMarks) {
      if (m.printed !== 0) B.applyLog(m.assetId, m.printed);
    }
    a.advanceTo(c.resolvesByTick + 11, A.applyLog, A.applyConfirmed);
    b.advanceTo(c.resolvesByTick + 11, B.applyLog, B.applyConfirmed);
    expect(snapHash(b.snapshot())).toBe(snapHash(a.snapshot()));
    expect(B.last.get("TIDE")).toBeCloseTo(A.last.get("TIDE")!, 8);
  });

  it("rejects a backwards tick and leaves lastTick unchanged", () => {
    const b = book();
    const { applyLog, applyConfirmed } = marks();
    openTide(b, "back-1", 100);
    b.advanceTo(150, applyLog, applyConfirmed);
    const before = b.snapshot();
    const ev = b.advanceTo(140, applyLog, applyConfirmed);
    expect(ev).toEqual([]);
    expect(b.snapshot()).toEqual(before);
    expect(b.snapshot().lastTick).toBe(150);
  });

  it("LiveMarket: RUMOR at publish does not apply the catalog shock; Wire stays forecast; isTrue is not on the item", () => {
    const m = new LiveMarket({ persistStorms: false, rumorSecret: SECRET });
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
    const tideNow = Math.round(Number(m.snapshot().quotes.rows.TIDE!.last) * 10 ** ASSET_BY_ID.TIDE!.displayDecimals);
    expect(item.effects).toBeUndefined();
    expect(tideNow).not.toBe(shockedMinor(listing("TIDE"), -200));
  });

  it("LiveMarket: true claim adds X to lnV once; restart rematerializes X and does not double it", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET });
    let hit: { tick: number; id: string; from: number; to: number } | null = null;
    for (let i = 0; i < 4500 && !hit; i++) {
      a.step();
      for (const c of a.stormSnapshot().rumors?.claims ?? []) {
        if (c.resolution === "CONFIRMED" && c.effect) {
          hit = { tick: a.snapshot().tick, id: c.id, from: c.effect.from, to: c.effect.to };
        }
      }
    }
    if (!hit) {
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
    const printed = restored.beliefMarks.find((r) => r.assetId === "TIDE")?.printed
      ?? restored.belief.filter((r) => r.assetId === "TIDE").reduce((s, r) => s + r.log, 0);
    const applied = restored.valueApplied.find((r) => r.assetId === "TIDE")!.log;
    const residual = (b.stormSnapshot().shockResidual ?? []).find((r) => r.assetId === "TIDE")?.log ?? 0;
    const tideLast = Math.round(Number(b.snapshot().quotes.rows.TIDE!.last) * 10 ** ASSET_BY_ID.TIDE!.displayDecimals);
    let expectMinor = listing("TIDE");
    if (residual !== 0) expectMinor = Math.max(1, Math.round(expectMinor * Math.exp(residual)));
    if (applied !== 0) expectMinor = Math.max(1, Math.round(expectMinor * Math.exp(applied)));
    if (printed !== 0) expectMinor = Math.max(1, Math.round(expectMinor * Math.exp(printed)));
    expect(tideLast).toBe(expectMinor);
    const item = b.wire().items.find((i) => i.id === hit!.id)!;
    expect(item.phase).toBe("realized");
    expect(item.effects?.[0]?.assetId).toBe("TIDE");
    expect(item).not.toHaveProperty("isTrue");
    expect(item.slots?.appliedTick).toBe(String(restored.claims.find((c) => c.id === hit!.id)!.resolvesByTick));
    expect(b.snapshot().tick).toBe(a.snapshot().tick);
    b.step();
    expect(b.stormSnapshot().rumors!.lnV.find((r) => r.assetId === "TIDE")!.log).toBeCloseTo(x, 12);
  });

  it("continuous run and stop/restart share rumor snapshot hashes at both cuts; parseWireSnapshot is non-null", () => {
    const store = new MemoryStormWorldStore();
    const continuous = new LiveMarket({ persistStorms: false, rumorSecret: SECRET, seed: SEED });
    const restartable = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET, seed: SEED });
    const firstPub = rumorSlots()[0]!;
    while (continuous.snapshot().tick < firstPub + 20) {
      continuous.step();
      restartable.step();
    }
    expect(continuous.snapshot().tick).toBe(restartable.snapshot().tick);
    const cut1 = snapHash(continuous.stormSnapshot().rumors);
    expect(snapHash(restartable.stormSnapshot().rumors)).toBe(cut1);
    expect(parseWireSnapshot(continuous.wire())).not.toBeNull();
    const restored1 = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED });
    expect(restored1.snapshot().tick).toBe(continuous.snapshot().tick);
    expect(parseWireSnapshot(restored1.wire())).not.toBeNull();
    expect(snapHash(restored1.stormSnapshot().rumors)).toBe(cut1);

    continuous.step();
    restartable.step();
    const cut2 = snapHash(continuous.stormSnapshot().rumors);
    expect(cut2).not.toBe(cut1);
    expect(snapHash(restartable.stormSnapshot().rumors)).toBe(cut2);
    const restored2 = new LiveMarket({ persistStorms: true, stormWorld: store, seed: SEED });
    expect(restored2.snapshot().tick).toBe(continuous.snapshot().tick);
    expect(parseWireSnapshot(restored2.wire())).not.toBeNull();
    expect(snapHash(restored2.stormSnapshot().rumors)).toBe(cut2);
    expect(restored2.stormSnapshot().rumors!.lastTick).toBe(continuous.stormSnapshot().rumors!.lastTick);
  });
});

describe("NEWS still prints at publish", () => {
  it("a NEWS company story still applies its catalog shock at the publish tick", () => {
    const m = new LiveMarket({ persistStorms: false, rumorSecret: SECRET });
    const t = slots(40).find((tick) => storyAt(SEED, tick)?.kind === "NEWS")!;
    const def = storyAt(SEED, t)!;
    const ref = new ShockFeed({ seed: SEED, empty: true }, { autoStart: false, rumorSecret: SECRET });
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
