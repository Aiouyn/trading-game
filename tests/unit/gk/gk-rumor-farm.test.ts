// 20-author / 8-a-day farm: sealed accuracies, 16:566 credibility-weighted belief, Wire record, jump ≡ step, restart.
import { describe, expect, it } from "vitest";
import { ASSET_BY_ID } from "@/market/catalog";
import { LiveMarket } from "@/server/market/clock";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import { RUMOR, RumorBook, farmContribution } from "@/server/market/rumorClaims";
import { shockedMinor } from "@/server/market/shockFeed";
import { parseWireSnapshot } from "@/market/wireSnapshot";
import {
  FARM_AUTHOR_NAMES, FARM_EQUITIES, dayCloseTick, farmAccuracy, farmBand, farmCred, farmImpulse,
  farmUnit, isDayClose, isFarmSourceId, planFarmDay,
} from "@/server/market/rumorFarm";
import { isAnalystSourceId } from "@/server/market/analystNotes";
import { TICKS_PER_DAY } from "@/server/market/meme";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";
import { CAUSES } from "@/apps/wire/causes";
import { EN, FR } from "@/apps/wire/strings";

const SEED = PORT_AVALON_MARKET_SEED;
const SECRET = "gk-claims-authors-test-secret";
const book = (seed = SEED) => new RumorBook(seed, undefined, { secret: SECRET });
const firstClose = (() => {
  let t = START_TICK;
  while (!isDayClose(t)) t++;
  return t;
})();
const firstFarmDay = Math.floor(firstClose / TICKS_PER_DAY) + 1;

describe("farm authors and day book", () => {
  it("creates 20 authors with sealed accuracies in [0.40, 0.70] and distinct names", () => {
    const b = book();
    const src = b.farmSources();
    expect(src).toHaveLength(20);
    expect(new Set(src.map((s) => s.sourceId)).size).toBe(20);
    expect(new Set(src.map((s) => s.nameKey)).size).toBe(20);
    expect(src.map((s) => s.nameKey)).toEqual([...FARM_AUTHOR_NAMES]);
    for (const s of src) {
      expect(s.hiddenAccuracy).toBeGreaterThanOrEqual(0.40);
      expect(s.hiddenAccuracy).toBeLessThanOrEqual(0.70);
      expect(s.hiddenAccuracy).toBe(farmAccuracy(SEED, s.sourceId, SECRET));
      // Sealed accuracy is HMAC, not a secret-prefixed FNV/farmUnit key.
      expect(s.hiddenAccuracy).not.toBe(0.40 + 0.30 * farmUnit(`farm:${SECRET}:${SEED}:acc:${s.sourceId}`));
      expect(s.hits).toBe(0);
      expect(s.resolved).toBe(0);
    }
    expect(b.farmSources().map((s) => s.hiddenAccuracy)).toEqual(book().farmSources().map((s) => s.hiddenAccuracy));
    expect(b.farmSources().map((s) => s.hiddenAccuracy)).not.toEqual(book(SEED + 1).farmSources().map((s) => s.hiddenAccuracy));
  });

  it("plans exactly 8 rumors for a game day, distinct authors and catalog equities, not on the catalog story grid when it can avoid it", () => {
    const plan = planFarmDay(SEED, firstFarmDay);
    expect(plan).toHaveLength(8);
    expect(new Set(plan.map((d) => d.sourceId)).size).toBe(8);
    expect(new Set(plan.map((d) => d.assetId)).size).toBe(8);
    expect(new Set(plan.map((d) => d.publishTick)).size).toBe(8);
    const dayStart = firstFarmDay * TICKS_PER_DAY;
    for (const d of plan) {
      expect(d.publishTick).toBeGreaterThanOrEqual(dayStart);
      expect(d.publishTick).toBeLessThan(dayStart + TICKS_PER_DAY);
      expect(FARM_EQUITIES).toContain(d.assetId);
      expect(d.publishTick).toBeGreaterThan(firstClose);
    }
    expect(planFarmDay(SEED, firstFarmDay)).toEqual(plan);
    expect(planFarmDay(SEED + 1, firstFarmDay).map((d) => d.id + d.sourceId + d.publishTick))
      .not.toEqual(plan.map((d) => d.id + d.sourceId + d.publishTick));
  });

  it("E-56 credBand and 16:566 impulse: 0/0 is mixed and zero impulse; low and solid cutoffs hold", () => {
    expect(farmCred(0, 0)).toBe(0.5);
    expect(farmImpulse(0.15, 0, 0)).toBe(0);
    expect(farmBand(0, 0)).toBe("mixed");
    expect(farmBand(0, 2)).toBe("mixed"); // (0+5)/(2+10)=0.417, not the fixture raw-ratio "low"
    expect(farmBand(0, 20)).toBe("low"); // 5/30 ≈ 0.167
    expect(farmBand(9, 10)).toBe("solid"); // 14/20 = 0.70
    expect(farmImpulse(0.15, 9, 10)).toBeCloseTo(0.5 * (2 * 0.7 - 1) * 0.15, 12);
    expect(EN.headlines["wire.rumor.hears"]).toContain("{source}");
    expect(FR.headlines["wire.rumor.hears"]).toBeTruthy();
    expect(CAUSES["wire.cause.farm-rumor"]).toBeTruthy();
    expect(CAUSES["wire.cause.farm-rumor-confirmed"]).toBeTruthy();
  });
});

describe("farm belief, lnV, conservation", () => {
  it("a fresh author does not move the mark; a high-cred author does, and lnV stays 0 while pending", () => {
    const b = book();
    const plan = planFarmDay(SEED, firstFarmDay);
    const d = plan[0]!;
    // force a resolved record on this author, then open a second pending rumor
    const src = b.sourceOf(d.sourceId);
    expect(farmImpulse(d.assertedMove, src.hits, src.resolved)).toBe(0);
    const marks = new Map<string, number>();
    const applyLog = (id: string, log: number) => {
      const from = marks.get(id) ?? ASSET_BY_ID[id]!.base;
      const to = from * Math.exp(log);
      marks.set(id, to);
      return { from, to };
    };
    b.openFromDraft(d);
    const pub = d.publishTick;
    b.advanceTo(pub + 10, applyLog);
    expect(b.beliefLog(d.assetId)).toBe(0);
    expect(b.lnVOf(d.assetId) ?? 0).toBe(0);
    expect(marks.get(d.assetId) ?? ASSET_BY_ID[d.assetId]!.base).toBe(ASSET_BY_ID[d.assetId]!.base);
  });

  it("after a true resolve, the author's record updates and a later pending rumor moves the mark; false does not move lnV", () => {
    const b = book();
    const last = new Map<string, number>();
    const applyLog = (id: string, log: number) => {
      const from = last.get(id) ?? ASSET_BY_ID[id]!.base;
      const to = from * Math.exp(log);
      last.set(id, to);
      return { from, to };
    };
    const applyConfirmed = (id: string, bp: number) => {
      const from = last.get(id) ?? ASSET_BY_ID[id]!.base;
      const to = Math.max(1, Math.round((from * (10_000 + bp)) / 10_000));
      last.set(id, to);
      return { from, to };
    };
    // Hunt a true draft by scanning days, or open a crafted true claim for a known author.
    let hit: { id: string; sourceId: string; assetId: string; resolve: number } | null = null;
    for (let day = firstFarmDay; day < firstFarmDay + 40 && !hit; day++) {
      for (const d of planFarmDay(SEED, day)) {
        const c = b.openFromDraft(d);
        if (c.isTrue) {
          hit = { id: c.id, sourceId: d.sourceId, assetId: d.assetId, resolve: c.resolvesByTick };
          break;
        }
      }
    }
    expect(hit).not.toBeNull();
    b.advanceTo(hit!.resolve, applyLog, applyConfirmed);
    const c = b.claim(hit!.id)!;
    expect(c.resolution).toBe("CONFIRMED");
    expect(b.sourceOf(hit!.sourceId).hits).toBeGreaterThanOrEqual(1);
    expect(b.sourceOf(hit!.sourceId).resolved).toBeGreaterThanOrEqual(1);
    expect(b.lnVOf(hit!.assetId) ?? 0).not.toBe(0);
    const lnV = b.lnVOf(hit!.assetId)!;
    b.advanceTo(hit!.resolve + 15, applyLog, applyConfirmed);
    expect(b.lnVOf(hit!.assetId)).toBe(lnV); // confirmation net does not change lnV later
  });

  it("farm confirm: retained belief releases linearly over 15 ticks; lnV is the fact-only X", () => {
    // Opening all 40 days into the live book made advanceTo walk every tick across 320
    // pending claims and timed out at 5s on CI. Planning is cheap (~40ms): pick the same
    // claim from a probe book, then open only rumors that can publish before the handoff ends.
    const probe = book();
    const drafts = [];
    for (let day = firstFarmDay; day < firstFarmDay + 40; day++) {
      for (const d of planFarmDay(SEED, day)) drafts.push(d);
    }
    for (const d of drafts) probe.openFromDraft(d);
    const farm = probe.allClaims().filter((c) => c.channel === "farm").sort((a, c) => a.resolvesByTick - c.resolvesByTick);
    const hits = new Map<string, number>();
    let chosen: (typeof farm)[number] | null = null;
    for (const c of farm) {
      const prior = hits.get(c.sourceId ?? "") ?? 0;
      if (c.isTrue && prior >= 1) { chosen = c; break; }
      if (c.isTrue) hits.set(c.sourceId ?? "", prior + 1);
    }
    expect(chosen).not.toBeNull();
    const cutoff = chosen!.resolvesByTick + RUMOR.handoffTicks;
    const b = book();
    for (const d of drafts) {
      if (d.publishTick <= cutoff) b.openFromDraft(d);
    }
    const last = new Map<string, number>();
    const listing = (id: string) => ASSET_BY_ID[id]!.base;
    const applyLog = (id: string, log: number) => {
      const from = last.get(id) ?? listing(id);
      const to = Math.max(1, Math.round(from * Math.exp(log)));
      last.set(id, to);
      return { from, to };
    };
    const applyConfirmed = (id: string, bp: number) => {
      const from = last.get(id) ?? listing(id);
      const to = shockedMinor(from, bp);
      last.set(id, to);
      return { from, to };
    };
    const resolve = chosen!.resolvesByTick;
    b.advanceTo(resolve - 1, applyLog, applyConfirmed);
    const pending = b.snapshot().belief.find((p) => p.claimId === chosen!.id);
    expect(pending?.mode).toBe("pending");
    expect(pending!.log).not.toBe(0);
    // startLog is the pending farm overlay at the resolve tick. Use the live claim
    // (denials may have set rebuttal); a probe copy would compute a different impulse.
    const live = b.claim(chosen!.id)!;
    const src = b.sourceOf(live.sourceId);
    const wantStart = farmContribution(live, resolve, src.hits, src.resolved);
    b.advanceTo(resolve, applyLog, applyConfirmed);
    const claim = b.claim(chosen!.id)!;
    expect(claim.resolution).toBe("CONFIRMED");
    const from = claim.effect!.from, toX = claim.effect!.to;
    expect(toX).toBe(shockedMinor(from, claim.bp));
    expect(b.lnVOf(chosen!.assetId)).toBeCloseTo(Math.log(toX / from), 12);
    const hand = b.snapshot().belief.find((p) => p.claimId === chosen!.id);
    expect(hand?.mode).toBe("handoff");
    const start = hand!.startLog!;
    expect(start).toBeCloseTo(wantStart, 12);
    expect(hand!.ticksLeft).toBe(RUMOR.handoffTicks - 1);
    expect(hand!.log).toBeCloseTo(start * ((RUMOR.handoffTicks - 1) / RUMOR.handoffTicks), 10);
    const lnV = b.lnVOf(chosen!.assetId)!;
    for (let k = 1; k <= RUMOR.handoffTicks; k++) {
      b.advanceTo(resolve + k, applyLog, applyConfirmed);
      const left = RUMOR.handoffTicks - 1 - k;
      const pos = b.snapshot().belief.find((p) => p.claimId === chosen!.id);
      if (left <= 0) expect(pos).toBeUndefined();
      else {
        expect(pos?.mode).toBe("handoff");
        expect(pos!.ticksLeft).toBe(left);
        expect(pos!.log).toBeCloseTo(start * (left / RUMOR.handoffTicks), 10);
      }
      expect(b.lnVOf(chosen!.assetId)).toBe(lnV);
    }
  }, 15_000);

});

describe("LiveMarket farm publish, jump, restart", () => {
  it("after the first day close, the clock publishes 8 farm rumors the next day with author name and record, not isTrue", () => {
    const m = new LiveMarket({ persistStorms: false, rumorSecret: SECRET });
    const plan = planFarmDay(SEED, firstFarmDay);
    const firstPub = Math.min(...plan.map((d) => d.publishTick));
    const lastPub = Math.max(...plan.map((d) => d.publishTick));
    while (m.snapshot().tick < firstPub) m.step();
    const first = m.wire().items.find((i) => i.id === plan.find((d) => d.publishTick === firstPub)!.id)!;
    expect(first.kind).toBe("RUMOR");
    expect(first.phase).toBe("forecast");
    expect(first.slots?.source).toBeTruthy();
    expect(first.sourceRecord).toEqual({ hits: 0, resolved: 0 });
    expect(first.sourceBand).toBe("mixed");
    expect(first).not.toHaveProperty("isTrue");
    expect(first.entities.some((e) => e.kind === "actor")).toBe(true);
    while (m.snapshot().tick < lastPub) m.step();
    const items = m.wire().items.filter((i) => i.id.startsWith("w-r-"));
    expect(items).toHaveLength(8);
    for (const it of items) {
      expect(it.kind).toBe("RUMOR");
      expect(["forecast", "realized", "eased"]).toContain(it.phase);
      expect(it.slots?.source).toBeTruthy();
      expect(it).not.toHaveProperty("isTrue");
      expect(it.entities.some((e) => e.kind === "actor")).toBe(true);
      const def = plan.find((d) => d.id === it.id)!;
      expect(it.slots?.source).toBe(def.sourceName);
      expect(it.tick).toBe(def.publishTick);
      expect(it.sourceRecord).toBeDefined();
    }
    // catalog desk path still exists in the book alongside the farm
    const srcs = m.stormSnapshot().rumors!.sources ?? [];
    expect(srcs.filter((s) => isFarmSourceId(s.sourceId))).toHaveLength(20);
    expect(srcs.filter((s) => isAnalystSourceId(s.sourceId))).toHaveLength(8);
  });

  it("advanceTo(jump) matches tick-by-tick across a day close and a resolve", () => {
    const peek = book();
    let end = firstClose + TICKS_PER_DAY + 80;
    for (const d of planFarmDay(SEED, firstFarmDay)) {
      end = Math.max(end, peek.openFromDraft(d).resolvesByTick + 20);
    }
    const step = book();
    const jump = book();
    const noop = () => ({ from: 1, to: 1 });
    for (let t = START_TICK; t <= end; t++) step.advanceTo(t, noop, noop);
    jump.advanceTo(end, noop, noop);
    expect(jump.snapshot()).toEqual(step.snapshot());
    const farm = jump.allClaims().filter((c) => c.channel === "farm");
    expect(farm.filter((c) => c.publishTick <= firstClose + TICKS_PER_DAY).length).toBe(8);
    expect(farm.some((c) => c.resolution !== "PENDING")).toBe(true);
  });

  it("boot hydration rematerializes farm lnV and does not double-apply X; parseWireSnapshot is non-null", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET });
    let hit: { id: string; log: number } | null = null;
    const cap = firstClose + 8 * TICKS_PER_DAY;
    while (a.snapshot().tick < cap && !hit) {
      a.step();
      for (const c of a.stormSnapshot().rumors?.claims ?? []) {
        if (c.channel === "farm" && c.resolution === "CONFIRMED" && c.effect) {
          hit = { id: c.id, log: Math.log(c.effect.to / c.effect.from) };
        }
      }
    }
    expect(hit).not.toBeNull();
    const before = a.stormSnapshot().rumors!;
    const x = before.lnV.reduce((s, r) => s + r.log, 0);
    const b = new LiveMarket({ persistStorms: true, stormWorld: store });
    const after = b.stormSnapshot().rumors!;
    expect(after.claims.find((c) => c.id === hit!.id)?.resolution).toBe("CONFIRMED");
    expect((after.sources ?? []).filter((s) => isFarmSourceId(s.sourceId))).toHaveLength(20);
    expect((after.sources ?? []).filter((s) => isAnalystSourceId(s.sourceId))).toHaveLength(8);
    expect(after.lnV.reduce((s, r) => s + r.log, 0)).toBeCloseTo(x, 12);
    expect(b.snapshot().tick).toBe(a.snapshot().tick);
    expect(parseWireSnapshot(b.wire())).not.toBeNull();
    b.step();
    expect(b.stormSnapshot().rumors!.lnV.reduce((s, r) => s + r.log, 0)).toBeCloseTo(x, 12);
  });

  it("sign accuracy of the farm over many days sits in [0.50, 0.60]", () => {
    const b = book();
    let n = 0, hits = 0;
    for (let day = firstFarmDay; day < firstFarmDay + 200; day++) {
      for (const d of planFarmDay(SEED, day)) {
        const c = b.openFromDraft(d);
        n++;
        if (c.isTrue) hits++;
      }
    }
    const acc = hits / n;
    expect(n).toBe(200 * 8);
    expect(acc).toBeGreaterThanOrEqual(0.50);
    expect(acc).toBeLessThanOrEqual(0.60);
  });
});

describe("first day is quiet until the close (M1-09 window)", () => {
  it("no farm rumor is published before the first day close after START_TICK", () => {
    const m = new LiveMarket({ persistStorms: false, rumorSecret: SECRET });
    while (m.snapshot().tick < firstClose) m.step();
    expect(m.wire().items.some((i) => i.id.startsWith("w-r-"))).toBe(false);
    expect(dayCloseTick(Math.floor(firstClose / TICKS_PER_DAY))).toBe(firstClose);
  });
});
