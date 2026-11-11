// Fail-closed rumor secret (b8257aaf qualification) and mid-pending company denials (05:860, 15:625 STATEMENT).
import { describe, expect, it, vi } from "vitest";
import { ASSET_BY_ID } from "@/market/catalog";
import { parseWireSnapshot } from "@/market/wireSnapshot";
import { LiveMarket } from "@/server/market/clock";
import {
  MissingRumorSecretError, RumorBook, claimContribution, claimCredibility, farmRebuttalScale,
  normalizeRumorSnapshot,
} from "@/server/market/rumorClaims";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import { companyDenialTick, denialItemId } from "@/server/market/rumorFarm";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";
import { CAUSES } from "@/apps/wire/causes";
import { EN, FR } from "@/apps/wire/strings";
import { TICKS_PER_DAY } from "@/server/market/meme";

const SEED = PORT_AVALON_MARKET_SEED;
const SECRET = "gk-claims-statements-test-secret";
const book = (seed = SEED) => new RumorBook(seed, undefined, { secret: SECRET });
const listing = (id: string) => ASSET_BY_ID[id]!.base;

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
    const to = Math.max(1, Math.round((from * (10_000 + bp)) / 10_000));
    last.set(id, to);
    return { from, to };
  };
  return { last, applyLog, applyConfirmed };
}

function openTide(b: RumorBook, id: string, publishTick = 100, bp = -200) {
  return b.open({
    id, defId: "tide-downgrade", assetId: "TIDE", headlineKey: "wire.rumor.downgrade",
    slots: { company: "Tidewater REIT" }, causeKey: "wire.cause.tide-downgrade", publishTick, bp, channel: "desk",
  });
}

describe("fail-closed rumor secret", () => {
  it("a brand-new book with no snapshot generates a 64-hex key; two fresh books differ", () => {
    const a = new RumorBook(SEED);
    const b = new RumorBook(SEED);
    expect(a.rumorSecret()).toMatch(/^[0-9a-f]{64}$/);
    expect(b.rumorSecret()).toMatch(/^[0-9a-f]{64}$/);
    expect(a.rumorSecret()).not.toBe(b.rumorSecret());
  });

  it("refuses to start when a rumors snapshot exists but the secret is missing or empty, and logs a loud error", () => {
    const good = book();
    openTide(good, "tide-missing", 100);
    const snap = good.snapshot();
    const missing = { ...snap, secret: "" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => new RumorBook(SEED, missing as typeof snap)).toThrow(MissingRumorSecretError);
    expect(() => new RumorBook(SEED, { ...snap, secret: undefined as unknown as string })).toThrow(MissingRumorSecretError);
    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0]![0])).toMatch(/\[rumorClaims\].*secret is missing or empty/);
    err.mockRestore();
    // injected test secret still hydrates
    const recovered = new RumorBook(SEED, missing as typeof snap, { secret: SECRET });
    expect(recovered.claim("tide-missing")?.id).toBe("tide-missing");
    expect(recovered.rumorSecret()).toBe(SECRET);
  });

  it("normalizeRumorSnapshot throws on a rumors object without a secret and does not invent a key", () => {
    const snap = book().snapshot();
    const raw = { ...snap, secret: "" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => normalizeRumorSnapshot(raw)).toThrow(MissingRumorSecretError);
    err.mockRestore();
    expect(normalizeRumorSnapshot(undefined)).toBeUndefined();
    expect(normalizeRumorSnapshot(null)).toBeUndefined();
  });

  it("LiveMarket refuses to boot a store whose rumors snapshot has no secret; an empty store still generates a key", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const poisoned = new MemoryStormWorldStore();
    const ok = new LiveMarket({ persistStorms: true, stormWorld: new MemoryStormWorldStore(), rumorSecret: SECRET });
    ok.step();
    const snap = ok.stormSnapshot();
    expect(snap.rumors?.secret).toBe(SECRET);
    poisoned.save({ ...snap, rumors: { ...snap.rumors!, secret: "" } });
    expect(() => new LiveMarket({ persistStorms: true, stormWorld: poisoned })).toThrow(MissingRumorSecretError);
    err.mockRestore();
    const fresh = new LiveMarket({ persistStorms: true, stormWorld: new MemoryStormWorldStore() });
    expect(fresh.stormSnapshot().rumors!.secret).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("company denials", () => {
  it("copy and the 05 rebuttal term exist", () => {
    expect(EN.headlines["wire.statement.denies"]).toContain("{company}");
    expect(FR.headlines["wire.statement.denies"]).toBeTruthy();
    expect(CAUSES["wire.cause.company-denial"]).toBeTruthy();
    expect(claimCredibility(0, 0)).toBe(0.15 + 0.45 * 0.5);
    expect(claimCredibility(0, 0, 0.5)).toBeCloseTo(0.15 + 0.45 * 0.5 - 0.15, 12);
    expect(farmRebuttalScale(0, 0, 0.5)).toBeCloseTo(claimCredibility(0, 0, 0.5) / claimCredibility(0, 0), 12);
  });

  it("a pending desk rumor gets an unverifiable company denial; belief shrinks by the 05 ratio; lnV stays 0; the rumor stays pending", () => {
    const b = book();
    const c0 = openTide(b, "tide-deny", 100);
    const at = companyDenialTick(SEED, c0.id, c0.publishTick, c0.resolvesByTick, "desk");
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThan(c0.publishTick);
    expect(at!).toBeLessThan(c0.resolvesByTick);
    const { last, applyLog, applyConfirmed } = marks();
    b.advanceTo(at! - 1, applyLog, applyConfirmed);
    expect(b.claim(c0.id)!.rebuttal ?? 0).toBe(0);
    const before = b.beliefLog("TIDE");
    expect(before).not.toBe(0);
    const ev = b.advanceTo(at!, applyLog, applyConfirmed);
    expect(ev.some((e) => e.kind === "denied" && e.claim.id === c0.id)).toBe(true);
    const c = b.claim(c0.id)!;
    expect(c.resolution).toBe("PENDING");
    expect(c.rebuttal).toBe(0.5);
    expect(c.deniedAtTick).toBe(at);
    expect(c.cr).toBe(claimCredibility(0, 0, 0.5));
    const want = claimContribution(c, at!);
    expect(b.beliefLog("TIDE")).toBeCloseTo(want, 12);
    expect(Math.abs(b.beliefLog("TIDE"))).toBeLessThan(Math.abs(before));
    expect(b.lnVOf("TIDE") ?? 0).toBe(0);
    b.advanceTo(c.resolvesByTick, applyLog, applyConfirmed);
    const done = b.claim(c0.id)!;
    expect(["CONFIRMED", "FIZZLED", "DENIED"]).toContain(done.resolution);
    if (done.resolution === "CONFIRMED") {
      expect(done.effect).toBeDefined();
      expect(b.lnVOf("TIDE")).not.toBe(0);
    } else {
      expect(done.effect).toBeUndefined();
      expect(b.lnVOf("TIDE") ?? 0).toBe(0);
    }
  });

  it("LiveMarket publishes a STATEMENT denial on the Wire with no isTrue; jump equals step; boot hydration rematerializes one denial", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET });
    let hit: { rumorId: string; denialId: string; tick: number } | null = null;
    const cap = START_TICK + 8 * TICKS_PER_DAY;
    while (a.snapshot().tick < cap && !hit) {
      a.step();
      const items = a.wire().items.filter((i) => i.kind === "STATEMENT" && i.headlineKey === "wire.statement.denies");
      const item = items[0];
      if (item && item.slots?.rumorId) {
        hit = { rumorId: item.slots.rumorId, denialId: item.id, tick: a.snapshot().tick };
      }
    }
    expect(hit).not.toBeNull();
    const item = a.wire().items.find((i) => i.id === hit!.denialId)!;
    expect(item.kind).toBe("STATEMENT");
    expect(item.id).toBe(denialItemId(hit!.rumorId));
    expect(item.slots?.company).toBeTruthy();
    expect(item).not.toHaveProperty("isTrue");
    expect(item.causeKey).toBe("wire.cause.company-denial");
    const rumor = a.wire().items.find((i) => i.id === hit!.rumorId)!;
    expect(rumor.kind).toBe("RUMOR");
    expect(rumor.phase).toBe("forecast");
    const claim = a.stormSnapshot().rumors!.claims.find((c) => c.id === hit!.rumorId)!;
    expect(claim.resolution).toBe("PENDING");
    expect(claim.rebuttal).toBe(0.5);
    expect(JSON.stringify(a.snapshot())).not.toContain(SECRET);
    expect(JSON.stringify(a.wire())).not.toContain(SECRET);
    expect(parseWireSnapshot(a.wire())).not.toBeNull();

    const b = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET });
    expect(b.snapshot().tick).toBe(a.snapshot().tick);
    expect(parseWireSnapshot(b.wire())).not.toBeNull();
    expect(b.wire().items.filter((i) => i.id === hit!.denialId)).toHaveLength(1);
    expect(b.stormSnapshot().rumors!.claims.find((c) => c.id === hit!.rumorId)?.rebuttal).toBe(0.5);
    b.step();
    expect(b.wire().items.filter((i) => i.id === hit!.denialId)).toHaveLength(1);
  });

  it("advanceTo(jump) matches tick-by-tick across a denial", () => {
    const step = book();
    const jump = book();
    const A = marks(), B = marks();
    openTide(step, "tide-jump-d", 80);
    openTide(jump, "tide-jump-d", 80);
    const c = step.claim("tide-jump-d")!;
    const end = c.resolvesByTick + 5;
    for (let t = 80; t <= end; t++) step.advanceTo(t, A.applyLog, A.applyConfirmed);
    jump.advanceTo(end, B.applyLog, B.applyConfirmed);
    expect(jump.snapshot()).toEqual(step.snapshot());
    expect(step.claim("tide-jump-d")!.rebuttal).toBe(0.5);
  });
});
