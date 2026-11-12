// sys/wire-variety: seeded no-repeat deck and varied magnitudes (playtest e30f6822 / d34).
import { describe, expect, it, vi } from "vitest";
import {
  COMPANY_STORIES, CRISES, STORY_EVERY, STORY_SEVERITY_MAX, STORY_SEVERITY_MIN,
  catalogStoryAt, crisisHits, scaleEffects, shuffledIndices, storyAt, storySeverity,
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

const CYCLE_SLOTS = 16;
const cycleTicks = (cycle: number) =>
  Array.from({ length: CYCLE_SLOTS }, (_, i) => START_TICK + (cycle * CYCLE_SLOTS + i + 1) * STORY_EVERY);
const companyIds = (cycle: number, seed = SEED) =>
  cycleTicks(cycle).map((t) => storyAt(seed, t)!).filter((s) => !s.crisis).map((s) => s.defId);
const crisisKinds = (cycle: number, seed = SEED) =>
  cycleTicks(cycle).map((t) => storyAt(seed, t)!).filter((s) => s.phase === "forecast" && s.crisis).map((s) => s.crisis);

describe("per-cycle reshuffle", () => {
  it("consecutive cycles are not identical, and the deck does not seam-repeat at the boundary", () => {
    const windowCycles = 32;
    for (let c = 0; c < windowCycles; c++) {
      const next = c + 1;
      expect(companyIds(next), `company deck cycle ${c} == ${next}`).not.toEqual(companyIds(c));
      expect(crisisKinds(next), `crisis deck cycle ${c} == ${next}`).not.toEqual(crisisKinds(c));
      const co = companyIds(c), co2 = companyIds(next);
      expect(co2[0], `company boundary ${c}->${next}`).not.toBe(co[co.length - 1]);
      const cr = crisisKinds(c), cr2 = crisisKinds(next);
      expect(cr2[0], `crisis boundary ${c}->${next}`).not.toBe(cr[cr.length - 1]);
    }
  });

  it("a 10k-tick window has no defId-sequence period <= 72 ticks and no identical consecutive cycles", () => {
    const tickSpan = 10_000;
    const nSlots = Math.floor(tickSpan / STORY_EVERY);
    const ids = slots(nSlots).map((t) => storyAt(SEED, t)!.defId);
    const maxPeriodSlots = 72 / STORY_EVERY;
    for (let p = 1; p <= maxPeriodSlots; p++) {
      let periodic = true;
      for (let i = 0; i + p < ids.length; i++) {
        if (ids[i] !== ids[i + p]) { periodic = false; break; }
      }
      expect(periodic, `defId sequence periodic at ${p * STORY_EVERY} ticks`).toBe(false);
    }
    const nCycles = Math.floor(nSlots / CYCLE_SLOTS);
    for (let c = 0; c < nCycles - 1; c++) {
      expect(companyIds(c + 1), `identical company cycle ${c}`).not.toEqual(companyIds(c));
      expect(crisisKinds(c + 1), `identical crisis cycle ${c}`).not.toEqual(crisisKinds(c));
    }
  });

  it("a cold module jumping straight to cycle k yields the same deck as a separate module walking from cycle 0", async () => {
    // Each import below is a fresh module instance with an empty deck memo, so the jump is really cold
    // (Gatekeeper note on 82576f02: the old version walked first and warmed the memo it then "jumped" with).
    const fresh = async () => { vi.resetModules(); return import("@/market/wireStories"); };
    const ids = (m: typeof import("@/market/wireStories"), seed: number, cycle: number) => {
      const stories = cycleTicks(cycle).map((t) => m.storyAt(seed, t)!);
      return {
        co: stories.filter((s) => !s.crisis).map((s) => s.defId),
        cr: stories.filter((s) => s.phase === "forecast" && s.crisis).map((s) => s.crisis),
      };
    };
    const ks = [0, 1, 7, 40, 450];
    for (const seed of [SEED, 18, 21]) {
      const walker = await fresh();
      const walked = new Map<number, ReturnType<typeof ids>>();
      for (let c = 0; c <= Math.max(...ks); c++) walked.set(c, ids(walker, seed, c));
      for (const k of ks) {
        const jumper = await fresh();
        expect(ids(jumper, seed, k), `seed ${seed} cold jump to cycle ${k}`).toEqual(walked.get(k));
      }
    }
    vi.resetModules();
  });

  it("catalogStoryAt can jump to a far cycle on several seeds without throwing", () => {
    // live 60-GD calibration walks well past the 10k-tick / 10-minute windows.
    for (const seed of [SEED, SEED + 1, 21, 27, 30, 31]) {
      for (const cycle of [0, 1, 85, 144, 166, 200, 366, 400]) {
        const t = START_TICK + (cycle * CYCLE_SLOTS + 1) * STORY_EVERY;
        expect(() => catalogStoryAt(seed, t), `seed ${seed} cycle ${cycle}`).not.toThrow();
        expect(catalogStoryAt(seed, t)?.defId).toBeTruthy();
      }
    }
  });

  it("company defId does not recur at 60 or 72 ticks across a long window of cycles", () => {
    const nSlots = 16 * 40;
    const window = slots(nSlots);
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
});

// Gatekeeper B1 on 82576f02: the per-cycle reshuffle let the same company headline return 24/36/48
// ticks apart and the same crisis 48 ticks apart. Floors: company 84 ticks (7 real minutes, above the
// 60/72-tick playtest repeats), crisis 72 (main's rotation; 96 is infeasible for 4 crises).
const COMPANY_FLOOR = 84;
const CRISIS_FLOOR = 72;
const GAP_SEEDS = [SEED, 7, 18, 21, 27, 31, 42, 100];

function minGaps(seed: number, tickSpan: number) {
  const lastCo = new Map<string, number>(), lastCr = new Map<string, number>();
  let company = Infinity, crisis = Infinity;
  for (const t of slots(Math.floor(tickSpan / STORY_EVERY))) {
    const s = storyAt(seed, t)!;
    if (!s.crisis) {
      const p = lastCo.get(s.defId);
      if (p !== undefined) company = Math.min(company, t - p);
      lastCo.set(s.defId, t);
    } else if (s.phase === "forecast") {
      const p = lastCr.get(s.crisis);
      if (p !== undefined) crisis = Math.min(crisis, t - p);
      lastCr.set(s.crisis, t);
    }
  }
  return { company, crisis };
}

describe("minimum same-headline gap", () => {
  it(`over 10k ticks on several seeds, a company headline never returns within ${COMPANY_FLOOR} ticks and a crisis within ${CRISIS_FLOOR}`, () => {
    for (const seed of GAP_SEEDS) {
      const gaps = minGaps(seed, 10_000);
      expect(gaps.company, `seed ${seed} min company gap`).toBeGreaterThanOrEqual(COMPANY_FLOOR);
      expect(gaps.crisis, `seed ${seed} min crisis gap`).toBeGreaterThanOrEqual(CRISIS_FLOOR);
    }
  });

  it("the official seed's first 10 Wire minutes (ticks 27706-27814) show no same-company pair closer than the floor", () => {
    // Played on 82576f02: halc-volumes 27778/27802 and orca-trial 27790/27814 on one Wire screen.
    // 108 ticks is longer than one 96-tick deck, so a company may appear twice; never closer than the floor.
    const seen = new Map<string, number>();
    for (let t = 27706; t <= 27814; t += STORY_EVERY) {
      const s = storyAt(SEED, t);
      if (!s || s.crisis) continue;
      const before = seen.get(s.defId);
      if (before !== undefined) expect(t - before, `${s.defId} at ${before} and ${t}`).toBeGreaterThanOrEqual(COMPANY_FLOOR);
      seen.set(s.defId, t);
    }
  });

  it("a legal deck is always found: 24 seeds walked over 60 game days keep both floors", () => {
    // 60 GD = 43,200 ticks = 450 cycles, the calibration horizon. pickCycleOrder throws if no deck fits.
    for (let seed = 1; seed <= 24; seed++) {
      const gaps = minGaps(seed, 60 * 720);
      expect(gaps.company, `seed ${seed}`).toBeGreaterThanOrEqual(COMPANY_FLOOR);
      expect(gaps.crisis, `seed ${seed}`).toBeGreaterThanOrEqual(CRISIS_FLOOR);
    }
  }, 60_000);
});

describe("shuffle reachability", () => {
  // Gatekeeper q1 on 82576f02: hash % (i + 1) on FNV-1a low bits reached 12/24 crisis orders and ~3.9%
  // of company decks. With 100k uniform draws over 8! = 40,320 decks the expected share is
  // 1 - e^(-100000/40320) = 91.6% (measured 91.5-91.6% on seeds 17/18/21/42); 90% leaves margin.
  it("10k keys reach all 24 crisis orders and 100k keys reach at least 90% of company decks", () => {
    for (const seed of [SEED, 18, 21, 42]) {
      const crisis = new Set<string>();
      for (let k = 0; k < 10_000; k++) crisis.add(shuffledIndices(CRISES.length, seed, `order:${k}`).join());
      expect(crisis.size, `seed ${seed} crisis orders`).toBe(24);
      const company = new Set<string>();
      for (let k = 0; k < 100_000; k++) company.add(shuffledIndices(COMPANY_STORIES.length, seed, `co:${k}`).join());
      expect(company.size / 40_320, `seed ${seed} company deck share`).toBeGreaterThanOrEqual(0.9);
    }
  }, 60_000);
});

// Gatekeeper q2 on a8c597ab: Halcyon and Avalon Bank shared wire.news.earningsBeat 12 ticks
// apart (seed 17, 27802 / 27814). A company floor of 84 does not cover two companies with the
// same headline key. The 300-seed x 2000-cycle throw scan and the cold catalogStoryAt budget
// at cycle 10k live in tools/proofs/wire-variety.ts (a <3s wall-clock unit flakes under the
// ~194-worker vitest pool; see sys-PLAN 18:12).
describe("cross-company headline keys", () => {
  it("seed 17 ticks 27802 and 27814 do not share a headline key", () => {
    const a = storyAt(SEED, 27802)!;
    const b = storyAt(SEED, 27814)!;
    expect(a, "27802").toBeTruthy();
    expect(b, "27814").toBeTruthy();
    expect(a.headlineKey, `${a.defId} @27802 and ${b.defId} @27814`).not.toBe(b.headlineKey);
  });

  it(`over 10k ticks on several seeds, the same headline key does not recur within ${COMPANY_FLOOR} ticks across companies`, () => {
    for (const seed of GAP_SEEDS) {
      const last = new Map<string, { tick: number; defId: string }>();
      let min = Infinity;
      for (const t of slots(Math.floor(10_000 / STORY_EVERY))) {
        const s = storyAt(seed, t)!;
        if (s.crisis) continue;
        const prev = last.get(s.headlineKey);
        if (prev !== undefined && prev.defId !== s.defId) min = Math.min(min, t - prev.tick);
        last.set(s.headlineKey, { tick: t, defId: s.defId });
      }
      expect(min, `seed ${seed} min cross-company key gap`).toBeGreaterThanOrEqual(COMPANY_FLOOR);
    }
  });
});
