// MAJOR + ripples + Crisis Week (docs/v1/LAUNCHPAD.md; 04 §3.16).
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resetListingsForTests } from "@/market/listings";
import { LiveMarket } from "@/server/market/clock";
import { TICKS_PER_DAY } from "@/server/market/meme";
import {
  CrisisBook, CRISIS_WEEK_DAYS, CRISIS_WEEK_MAJOR_MULT, GAME_DAYS_PER_CHAPTER, MACRO_MAJOR_BASE_RATE,
  MACRO_MAJOR_MIN_GAP_DAYS, MACRO_RIPPLE_RATE, MAJOR_KINDS_V1, constraintsAllowMajor, crisisWeekChapterDraw,
  eventsDayDraw, majorStockShocks, poissonInverse, rippleStockShocks,
} from "@/server/market/crises";
import { StormScheduler } from "@/server/market/storms";
import { FileStormWorldStore } from "@/server/market/stormWorldStore";
import { degenStatus } from "@/server/broker/pools";

afterEach(() => { resetListingsForTests(); });

describe("04 §3.16 major/ripple draws (by hand)", () => {
  it("six V1 majors, ripple rate 1/7, deterministic events day draw", () => {
    expect(MAJOR_KINDS_V1).toHaveLength(6);
    expect(MACRO_MAJOR_BASE_RATE).toBeCloseTo(3.6e-4, 12);
    expect(MACRO_RIPPLE_RATE).toBeCloseTo(1 / 7, 12);
    expect(MACRO_MAJOR_MIN_GAP_DAYS).toBe(504);
    expect(GAME_DAYS_PER_CHAPTER).toBe(1344);
    expect(CRISIS_WEEK_DAYS).toBe(168);
    expect(CRISIS_WEEK_MAJOR_MULT).toBe(1.5);
    const a = eventsDayDraw(200), b = eventsDayDraw(200);
    expect(a).toEqual(b);
    expect(poissonInverse(0, 1 / 7)).toBe(0);
  });

  it("constraints: ACTIVE / GAP / FIRST_24 / FINAL_48", () => {
    const D = TICKS_PER_DAY;
    const c0 = 0, cEnd = GAME_DAYS_PER_CHAPTER * D;
    expect(constraintsAllowMajor({
      activeMajor: true, lastMajorTriggerTick: null, plannedTriggerTick: 100 * D,
      dayCloseTick: 50 * D - 1, chapterStartTick: c0, chapterEndTick: cEnd, playerSuppressUntil: null,
    }).reason).toBe("ACTIVE");
    expect(constraintsAllowMajor({
      activeMajor: false, lastMajorTriggerTick: 100 * D, plannedTriggerTick: 100 * D + 100 * D,
      dayCloseTick: 200 * D - 1, chapterStartTick: c0, chapterEndTick: cEnd, playerSuppressUntil: null,
    }).reason).toBe("GAP");
    expect(constraintsAllowMajor({
      activeMajor: false, lastMajorTriggerTick: null, plannedTriggerTick: 10 * D,
      dayCloseTick: 5 * D - 1, chapterStartTick: c0, chapterEndTick: cEnd, playerSuppressUntil: null,
    }).reason).toBe("FIRST_24");
    expect(constraintsAllowMajor({
      activeMajor: false, lastMajorTriggerTick: null,
      plannedTriggerTick: cEnd - 10 * D, dayCloseTick: cEnd - 30 * D - 1,
      chapterStartTick: c0, chapterEndTick: cEnd, playerSuppressUntil: null,
    }).reason).toBe("FINAL_48");
    expect(constraintsAllowMajor({
      activeMajor: false, lastMajorTriggerTick: null, plannedTriggerTick: 100 * D,
      dayCloseTick: 50 * D - 1, chapterStartTick: c0, chapterEndTick: cEnd, playerSuppressUntil: null,
    }).ok).toBe(true);
  });

  it("stock proxies: bubble / oil / flash / trade / stagflation move marks; winter empty; sector ripple moves", () => {
    expect(majorStockShocks("EQUITY_BUBBLE_BURST", 1).some((p) => p.assetId === "GX" && p.bp < 0)).toBe(true);
    expect(majorStockShocks("OIL_SHOCK", 1).some((p) => p.assetId === "VRDN" && p.bp > 0)).toBe(true);
    expect(majorStockShocks("FLASH_CRASH", 1)[0]).toMatchObject({ assetId: "GX" });
    expect(majorStockShocks("CRYPTO_WINTER", 1)).toEqual([]);
    expect(majorStockShocks("TRADE_WAR", 1).some((p) => p.bp < 0)).toBe(true);
    expect(majorStockShocks("STAGFLATION", 1).some((p) => p.assetId === "AVB" && p.bp < 0)).toBe(true);
    const rip = rippleStockShocks("SECTOR_SHOCK", -1, 0.05, 0);
    expect(rip.length).toBeGreaterThan(0);
    expect(rip.every((p) => p.bp === -500)).toBe(true);
    expect(rippleStockShocks("LOCAL_BOOM", 1, 0.05, 0)).toEqual([]);
  });
});

describe("StormScheduler majors + crisisTerm", () => {
  it("force major → Wire at trigger, crisisTerm 1 in TRIGGER/CONTAGION, 0.5 for storm-only", () => {
    const s = new StormScheduler();
    expect(s.crisisTerm()).toBe(0);
    // Warm past cold-start so natural ripples from day 0..N are not mixed into the force-major Wire.
    s.observe(100 * TICKS_PER_DAY);
    s.takeCrisisWire();
    s.takeWire();
    const ev = s.forceMajor("OIL_SHOCK", { atTick: 100 * TICKS_PER_DAY, precursorDays: 0, severity: 1, contagionDays: 5 });
    expect(ev.phase).toBe("PRECURSOR");
    expect(s.takeCrisisWire()).toEqual([]);
    s.observe(ev.triggerTick);
    const wire = s.takeCrisisWire().filter((w) => w.tier === "MAJOR");
    expect(wire).toHaveLength(1);
    expect(wire[0]).toMatchObject({
      tier: "MAJOR", kind: "OIL_SHOCK", breaking: true, headlineKey: "wire.major.oil-shock.hit",
    });
    expect(wire[0]!.prices.some((p) => p.assetId === "VRDN" && p.bp > 0)).toBe(true);
    expect(s.crisisTerm()).toBe(1); // TRIGGER
    s.observe(ev.contagionStartTick);
    expect(s.peekMajor()?.phase).toBe("CONTAGION");
    expect(s.crisisTerm()).toBe(1);
    s.observe(ev.plannedEndTick);
    expect(s.peekMajor()).toBeNull();
    // A natural/CW storm may be active after the long catch-up; major contribution must be gone (not 1).
    expect(s.crisisTerm()).not.toBe(1);

    const s2 = new StormScheduler();
    s2.observe(40 * TICKS_PER_DAY);
    s2.takeCrisisWire();
    s2.forceStorm("RATE_SCARE", { atTick: 40 * TICKS_PER_DAY, precursorDays: 0, severity: 1 });
    s2.observe(40 * TICKS_PER_DAY + 1);
    expect(s2.crisisTerm()).toBe(0.5);
  });

  it("catch-up jump equals tick-by-tick for a forced major", () => {
    const mk = () => {
      const s = new StormScheduler();
      s.observe(50 * TICKS_PER_DAY);
      s.takeCrisisWire();
      s.forceMajor("FLASH_CRASH", { atTick: 50 * TICKS_PER_DAY, precursorDays: 0, contagionDays: 5, severity: 1 });
      return s;
    };
    const jump = mk();
    jump.observe(50 * TICKS_PER_DAY + 1 + 10 * TICKS_PER_DAY);
    const step = mk();
    for (let t = 50 * TICKS_PER_DAY + 1; t <= 50 * TICKS_PER_DAY + 1 + 10 * TICKS_PER_DAY; t++) step.observe(t);
    expect(jump.peekMajor()?.phase).toEqual(step.peekMajor()?.phase);
    expect(jump.crisisTerm()).toBe(step.crisisTerm());
    expect(jump.stockAppliedIds().has("major:force:FLASH_CRASH:" + (50 * TICKS_PER_DAY))).toBe(true);
  });
});

describe("Crisis Week chapter draw", () => {
  it("deterministic; p≈0.6 over many chapters; announce wire when observed", () => {
    let yes = 0;
    for (let ch = 0; ch < 200; ch++) if (crisisWeekChapterDraw(ch).yes) yes++;
    expect(yes / 200).toBeGreaterThan(0.45);
    expect(yes / 200).toBeLessThan(0.75);
    expect(crisisWeekChapterDraw(3)).toEqual(crisisWeekChapterDraw(3));

    // Force a book with a known week and observe the announce tick.
    const book = new CrisisBook();
    book.crisisWeek = {
      announcedTick: 120 * TICKS_PER_DAY,
      startTick: 168 * TICKS_PER_DAY,
      endTick: (168 + 168) * TICKS_PER_DAY,
      themeKey: "storm-season",
    };
    book.crisisWeekChapter = 0;
    book.crisisWeekUsedThisChapter = true;
    book.advancePhases(120 * TICKS_PER_DAY);
    const w = book.takeWire();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ tier: "CRISIS_WEEK", headlineKey: "wire.crisis-week.announced.storm-season", breaking: true });
  });
});

describe("LiveMarket major → Wire + Fear + restart", () => {
  it("force OIL_SHOCK posts Wire, moves VRDN, raises Fear via crisisTerm 1; file restart is idempotent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "avalon-major-"));
    try {
      const calm = new LiveMarket({ tickMs: 1_000_000, persistStorms: false });
      for (let i = 0; i < 32; i++) calm.step();
      const calmF = calm.snapshot().fear!;

      const store = new FileStormWorldStore(path.join(dir, "storm-world.json"));
      const market = new LiveMarket({ tickMs: 1_000_000, persistStorms: true, stormWorld: store });
      const vrdn0 = Number(market.snapshot().quotes.rows.VRDN!.last);

      market.forceMajorForTests("OIL_SHOCK", { precursorDays: 0, severity: 1, contagionDays: 5 });
      market.step(); // trigger
      const wire = market.wire();
      const hit = wire.items.find((i) => (i.causeEventIds ?? []).some((id) => id.includes("OIL_SHOCK")));
      expect(hit).toBeTruthy();
      expect(hit!.breaking).toBe(true);
      expect(hit!.effects?.some((e) => e.assetId === "VRDN")).toBe(true);
      expect(market.stormSnapshot().crises?.activeMajor?.phase).toBe("TRIGGER");
      const vrdn1 = Number(market.snapshot().quotes.rows.VRDN!.last);
      expect(vrdn1).toBeGreaterThan(vrdn0);

      for (let i = 0; i < 32; i++) market.step();
      const stormF = market.snapshot().fear!;
      expect(stormF).toBeGreaterThan(calmF);

      const vrdnMid = Number(market.snapshot().quotes.rows.VRDN!.last);
      expect(market.stormSnapshot().crises?.activeMajor?.kind).toBe("OIL_SHOCK");

      const market2 = new LiveMarket({ tickMs: 1_000_000, persistStorms: true, stormWorld: store });
      expect(market2.stormSnapshot().crises?.activeMajor?.kind).toBe("OIL_SHOCK");
      expect(["TRIGGER", "CONTAGION"]).toContain(market2.stormSnapshot().crises?.activeMajor?.phase);
      // Restored stockApplied: VRDN already includes the major shock; one step must not restack +80%.
      market2.step();
      const vrdn2 = Number(market2.snapshot().quotes.rows.VRDN!.last);
      expect(Math.abs(vrdn2 - vrdnMid) / vrdnMid).toBeLessThan(0.05);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("DEGEN dust LIQ (same unit)", () => {
  it("equity ≤ 0 → LIQ even when im == 0", () => {
    expect(degenStatus(0, 0)).toBe("LIQ");
    expect(degenStatus(-50, 0)).toBe("LIQ");
  });
});
