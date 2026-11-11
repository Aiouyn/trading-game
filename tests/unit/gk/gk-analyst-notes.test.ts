// Free-tier T1 NPC analyst notes (16:557): one daily public NEWS item under a research-house outlet (15:828 / 15:827), existing 05 belief path.
import { describe, expect, it } from "vitest";
import { ASSET_BY_ID } from "@/market/catalog";
import { parseWireSnapshot } from "@/market/wireSnapshot";
import { LiveMarket } from "@/server/market/clock";
import {
  ANALYST, ANALYST_ROSTER, analystAccuracy, analystClaimId, analystOutletId, isAnalystPublishTick, isAnalystSourceId, planAnalystNote,
} from "@/server/market/analystNotes";
import { RumorBook, claimContribution } from "@/server/market/rumorClaims";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import { START_TICK } from "@/shell/contracts/mockFeed";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";
import { CAUSES } from "@/apps/wire/causes";
import { EN, FR } from "@/apps/wire/strings";

const SEED = PORT_AVALON_MARKET_SEED;
const SECRET = "gk-analyst-notes-test-secret";
const FIRST = 27760;
const book = () => new RumorBook(SEED, undefined, { secret: SECRET });
const clock = (store?: MemoryStormWorldStore) => new LiveMarket({
  persistStorms: !!store,
  stormWorld: store,
  rumorSecret: SECRET,
});
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

describe("T1 analyst note schedule and copy", () => {
  it("copy exists in EN, FR, and causes", () => {
    expect(EN.headlines["wire.news.analyst-note"]).toContain("{house}");
    expect(EN.headlines["wire.news.analyst-note"]).toContain("{claim}");
    expect(EN.headlines["wire.news.analyst-note"]).not.toContain("{analyst}");
    expect(FR.headlines["wire.news.analyst-note"]).toBeTruthy();
    expect(FR.headlines["wire.news.analyst-note"]).not.toContain("{analyst}");
    expect(CAUSES["wire.cause.analyst-note"]).toBeTruthy();
    expect(CAUSES["wire.cause.analyst-note-confirmed"]).toBeTruthy();
    expect(CAUSES["wire.cause.analyst-note-fizzled"]).toBeTruthy();
    expect(CAUSES["wire.cause.analyst-note-denied"]).toBeTruthy();
  });

  it("publishes only on slot 400 at or after START_TICK+21; seed 17's first tick is 27760", () => {
    expect(ANALYST.slot).toBe(400);
    expect(ANALYST.firstTick).toBe(START_TICK + 21);
    expect(isAnalystPublishTick(START_TICK)).toBe(false);
    expect(isAnalystPublishTick(27720)).toBe(false);
    expect(isAnalystPublishTick(FIRST)).toBe(true);
    expect(planAnalystNote(SEED, START_TICK)).toBeNull();
    expect(planAnalystNote(SEED, 27720)).toBeNull();
    const d = planAnalystNote(SEED, FIRST);
    expect(d).toBeTruthy();
    expect(d!.id).toBe(analystClaimId(FIRST));
    expect(d!.id).toMatch(/^w-a-\d+$/);
    expect(ANALYST_ROSTER.some((r) => r.assetId === d!.assetId && r.sourceId === d!.sourceId)).toBe(true);
    expect(isAnalystSourceId(d!.sourceId)).toBe(true);
    expect(d!.slots.rumorId).toBe(d!.id);
    expect(d!.slots.house).toBeTruthy();
    expect(d!.outletId).toBe(analystOutletId(d!.house));
    expect(d!.slots.analyst).toBeUndefined();
    expect(planAnalystNote(SEED, FIRST)).toEqual(d);
    const otherSeeds = [SEED + 1, SEED + 7, SEED + 99];
    expect(otherSeeds.some((s) => {
      const o = planAnalystNote(s, FIRST);
      return o && (o.assetId !== d!.assetId || o.factKind !== d!.factKind);
    })).toBe(true);
  });

  it("T1 hidden accuracy is HMAC-sealed in [0.40, 0.55] and changes with the secret", () => {
    const id = "an-TECH";
    const a = analystAccuracy(SEED, id, SECRET);
    const b = analystAccuracy(SEED, id, `${SECRET}-b`);
    expect(a).toBeGreaterThanOrEqual(0.40);
    expect(a).toBeLessThanOrEqual(0.55);
    expect(b).toBeGreaterThanOrEqual(0.40);
    expect(b).toBeLessThanOrEqual(0.55);
    expect(a).not.toBe(b);
    expect(analystAccuracy(SEED, id, SECRET)).toBe(a);
  });
});

describe("T1 analyst notes as a 05 claim", () => {
  it("the book opens one note at 27760, not in the M1-05 window, and does not open a second that day", () => {
    const b = book();
    expect(b.openAnalystDue(START_TICK)).toEqual([]);
    expect(b.openAnalystDue(27720)).toEqual([]);
    const opened = b.openAnalystDue(FIRST);
    expect(opened).toHaveLength(1);
    expect(opened[0]!.id).toBe(analystClaimId(FIRST));
    expect(opened[0]!.channel).toBe("analyst");
    expect(opened[0]!.publishTick).toBe(FIRST);
    expect(opened[0]!.resolution).toBe("PENDING");
    expect(b.openAnalystDue(FIRST)[0]!.id).toBe(opened[0]!.id);
    expect(b.allClaims().filter((c) => c.channel === "analyst")).toHaveLength(1);
    const src = b.sourceOf(opened[0]!.sourceId);
    expect(src.sourceId).toBe(opened[0]!.sourceId);
    expect(src.hiddenAccuracy).toBeGreaterThanOrEqual(0.40);
    expect(src.hiddenAccuracy).toBeLessThanOrEqual(0.55);
    expect(b.sourceState().sourceId).toBe("wire-desk");
    expect(b.analystSources()).toHaveLength(ANALYST_ROSTER.length);
  });

  it("pending 05 belief can be non-zero after publish; jump equals step; company denials do not fire; resolve credits the analyst", () => {
    const d = planAnalystNote(SEED, FIRST)!;
    const step = book();
    const jump = book();
    const A = marks(), B = marks();
    const claim0 = step.openAnalystDue(FIRST)[0]!;
    jump.openAnalystDue(FIRST);
    const end = claim0.resolvesByTick;
    for (let t = FIRST; t <= end; t++) step.advanceTo(t, A.applyLog, A.applyConfirmed);
    jump.advanceTo(end, B.applyLog, B.applyConfirmed);
    expect(jump.snapshot()).toEqual(step.snapshot());
    const c = step.claim(d.id)!;
    expect(c.deniedAtTick).toBeUndefined();
    expect(c.rebuttal ?? 0).toBe(0);
    expect(c.resolution === "CONFIRMED" || c.resolution === "FIZZLED" || c.resolution === "DENIED").toBe(true);
    const src = step.sourceOf(c.sourceId);
    expect(src.sourceId).toBe(d.sourceId);
    expect(src.resolved).toBe(1);
    expect(src.hits).toBe(c.resolution === "CONFIRMED" ? 1 : 0);
    expect(step.sourceState().resolved).toBe(0);
    // mid-pending belief was on the 05 path (recompute at publish+30 against the opened claim's cr)
    const mid = book();
    const midMarks = marks();
    mid.openAnalystDue(FIRST);
    mid.advanceTo(FIRST + 30, midMarks.applyLog, midMarks.applyConfirmed);
    const pending = mid.claim(d.id)!;
    expect(pending.resolution).toBe("PENDING");
    expect(claimContribution(pending, FIRST + 30)).not.toBe(0);
    expect(mid.beliefLog(d.assetId)).not.toBe(0);
  });

  it("LiveMarket shows NEWS on the Wire at 27760 under the research-house outlet, no personal byline, no effects, and no denial; t0–27720 stay empty of notes", () => {
    const m = clock();
    expect(m.snapshot().tick).toBe(START_TICK);
    expect(m.wire().items.some((i) => i.id.startsWith("w-a-"))).toBe(false);
    const draft = planAnalystNote(SEED, FIRST)!;
    while (m.snapshot().tick < 27720) m.step();
    expect(m.snapshot().tick).toBe(27720);
    expect(m.wire().items.some((i) => i.id.startsWith("w-a-"))).toBe(false);
    const quotesAt20 = m.snapshot().quotes;
    const ref = clock();
    while (ref.snapshot().tick < 27720) ref.step();
    expect(m.snapshot().quotes).toEqual(ref.snapshot().quotes);
    while (m.snapshot().tick < FIRST) m.step();
    expect(m.snapshot().tick).toBe(FIRST);
    const rows = m.wire().items.filter((i) => i.id.startsWith("w-a-"));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe(analystClaimId(FIRST));
    expect(row.kind).toBe("NEWS");
    expect(row.headlineKey).toBe("wire.news.analyst-note");
    expect(row.tick).toBe(FIRST);
    expect(row.phase).toBe("forecast");
    expect(row.causeKey).toBe("wire.cause.analyst-note");
    expect(row.effects).toBeUndefined();
    expect(row.slots?.analyst).toBeUndefined();
    expect(row.slots?.house).toBe(draft.house);
    expect(row.outletId).toBe(draft.outletId);
    expect(row.outletId).toBe(analystOutletId(draft.house));
    expect(row).not.toHaveProperty("authorId");
    expect(row.slots?.rumorId).toBe(row.id);
    expect(row.entities.some((e) => e.id === draft.assetId && e.kind === "asset")).toBe(true);
    expect(row.entities.some((e) => e.id === draft.outletId && e.kind === "outlet" && e.label === draft.house)).toBe(true);
    expect(row.entities.some((e) => e.kind === "actor")).toBe(false);
    expect(row.entities.some((e) => e.label === draft.analyst)).toBe(false);
    expect(row.sourceRecord).toEqual({ hits: 0, resolved: 0 });
    expect(row.sourceBand).toBeTruthy();
    expect(m.wire().items.some((i) => i.id.startsWith("w-d-") && i.slots?.rumorId === row.id)).toBe(false);
    expect(parseWireSnapshot(m.wire())).toEqual(m.wire());
    expect(m.wire().items.filter((i) => i.id.startsWith("w-a-"))).toHaveLength(1);
    m.wire();
    expect(m.wire().items.filter((i) => i.id.startsWith("w-a-"))).toHaveLength(1);

    const stepped = clock();
    const twin = clock();
    while (stepped.snapshot().tick < FIRST + 5) {
      stepped.step();
      twin.step();
    }
    expect(stepped.snapshot()).toEqual(twin.snapshot());
    expect(stepped.wire().items).toEqual(twin.wire().items);
    expect(quotesAt20).toEqual(ref.snapshot().quotes);
  });

  it("boot hydration rematerializes the same note and no second copy; resolve stamps the Wire row", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET });
    while (a.snapshot().tick < FIRST) a.step();
    const id = analystClaimId(FIRST);
    expect(a.wire().items.filter((i) => i.id === id)).toHaveLength(1);
    const saved = a.wire().items.find((i) => i.id === id)!;
    const b = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET });
    expect(b.snapshot().tick).toBe(FIRST);
    expect(b.wire().items.filter((i) => i.id === id)).toHaveLength(1);
    expect(parseWireSnapshot(b.wire())).not.toBeNull();
    const again = b.wire().items.find((i) => i.id === id)!;
    expect(again.kind).toBe("NEWS");
    expect(again.headlineKey).toBe(saved.headlineKey);
    expect(again.slots).toEqual(saved.slots);
    expect(again.entities).toEqual(saved.entities);
    expect(b.stormSnapshot().rumors!.claims.find((c) => c.id === id)?.channel).toBe("analyst");
    // Mid-run resume starts a new epoch for catalog NEWS (as today); do not claim full quote identity.
    b.step();
    expect(b.wire().items.filter((i) => i.id === id)).toHaveLength(1);

    const resolved = clock();
    const due = planAnalystNote(SEED, FIRST)!;
    const bookDue = book();
    bookDue.openAnalystDue(FIRST);
    const until = bookDue.claim(due.id)!.resolvesByTick;
    while (resolved.snapshot().tick < until) resolved.step();
    const row = resolved.wire().items.find((i) => i.id === due.id)!;
    const claim = resolved.stormSnapshot().rumors!.claims.find((c) => c.id === due.id)!;
    expect(claim.resolution).not.toBe("PENDING");
    expect(row.causeKey).toBe(
      claim.resolution === "CONFIRMED" ? "wire.cause.analyst-note-confirmed"
        : claim.resolution === "FIZZLED" ? "wire.cause.analyst-note-fizzled"
          : "wire.cause.analyst-note-denied",
    );
    expect(row.phase).toBe(claim.resolution === "CONFIRMED" ? "realized" : "eased");
    expect(row.sourceRecord?.resolved).toBeGreaterThanOrEqual(1);
  });
});
