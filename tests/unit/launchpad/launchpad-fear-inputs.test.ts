// Fear Index full inputs (docs/v1/LAUNCHPAD.md / UNIT fear-inputs): 04 §3.14.1 crisisTerm from storms,
// depth/NPC consume F, market snapshot exposes F+RA, durable world restart.
import { afterEach, describe, expect, it } from "vitest";
import { depthQuote } from "@/server/broker/book";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import { MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import { TICKS_PER_HOUR } from "@/server/market/meme";
import { crisisTermFromStorm, fearRawGx, riskAppetite, stepFear, WorldInputs } from "@/server/market/world";
import { START_TICK } from "@/shell/contracts/mockFeed";

afterEach(() => { setLiveMarketForTests(undefined); });

describe("04 §3.14.1 crisisTerm from storms", () => {
  it("crisisTerm is 0.5 while a storm is active (PRECURSOR or TRIGGER), else 0; majors unbuilt → never 1", () => {
    expect(crisisTermFromStorm(false)).toBe(0);
    expect(crisisTermFromStorm(true)).toBe(0.5);
    const store = new MemoryStormWorldStore();
    const m = new LiveMarket({ tickMs: 1_000_000, persistStorms: true, stormWorld: store });
    setLiveMarketForTests(m);
    expect(m.stormSnapshot().active).toBeNull();
    m.forceStormForTests("RATE_SCARE", { severity: 1, precursorDays: 0 });
    expect(m.stormSnapshot().active).not.toBeNull();
    expect(crisisTermFromStorm(m.stormSnapshot().active !== null)).toBe(0.5);
  });

  it("an active storm raises F vs a calm twin after one game hour; depth widens / thins with F", () => {
    const calm = new WorldInputs();
    const storm = new WorldInputs();
    const gx = 420_015;
    calm.observe(0, gx); storm.observe(0, gx, 0.5);
    calm.observe(TICKS_PER_HOUR, gx); storm.observe(TICKS_PER_HOUR, gx, 0.5);
    // Genesis held tension/hack pull raw below 22; crisisTerm 0.5 raises raw vs calm (F_storm > F_calm).
    expect(storm.fear).toBeGreaterThan(calm.fear);
    const wantStorm = stepFear(22, fearRawGx({ rv21: 0.16, rToday: 0, r63: 0, crisisTerm: 0.5 }));
    const wantCalm = stepFear(22, fearRawGx({ rv21: 0.16, rToday: 0, r63: 0, crisisTerm: 0 }));
    expect(storm.fear).toBeCloseTo(wantStorm, 12);
    expect(calm.fear).toBeCloseTo(wantCalm, 12);
    const dCalm = depthQuote(1e8, { fear: calm.fear, regimeDepth: 1.1, adv: 150e6, sigmaDaily: 0.1 }, 0, "BUY");
    const dStorm = depthQuote(1e8, { fear: storm.fear, regimeDepth: 1.1, adv: 150e6, sigmaDaily: 0.1 }, 0, "BUY");
    expect(dStorm.s).toBeGreaterThan(dCalm.s);
    expect(dStorm.d).toBeLessThan(dCalm.d);
  });
});

describe("macro.fear on market snapshot + durable Fear restart", () => {
  it("snapshot includes fear and riskAppetite; storm F > calm twin; restart restores F", () => {
    const calmStore = new MemoryStormWorldStore();
    const calm = new LiveMarket({ tickMs: 1_000_000, persistStorms: true, stormWorld: calmStore });
    for (let i = 0; i < TICKS_PER_HOUR + 2; i++) calm.step();
    const calmF = calm.snapshot().fear!;

    const store = new MemoryStormWorldStore();
    const m = new LiveMarket({ tickMs: 1_000_000, persistStorms: true, stormWorld: store });
    setLiveMarketForTests(m);
    m.forceStormForTests("CREDIT_WOBBLE", { severity: 1, precursorDays: 0 });
    for (let i = 0; i < TICKS_PER_HOUR + 2; i++) m.step();
    const before = m.snapshot();
    expect(before.fear).toBeDefined();
    expect(before.riskAppetite).toBeCloseTo(riskAppetite(before.fear!), 12);
    expect(before.fear!).toBeGreaterThan(calmF);
    const F = before.fear!;
    const snap = store.load();
    expect(snap.world?.fear).toBeCloseTo(F, 10);
    expect(snap.active).not.toBeNull();

    const m2 = new LiveMarket({ tickMs: 1_000_000, persistStorms: true, stormWorld: store });
    setLiveMarketForTests(m2);
    const after = m2.snapshot();
    expect(after.fear).toBeCloseTo(F, 10);
    expect(after.riskAppetite).toBeCloseTo(riskAppetite(F), 12);
    expect(m2.stormSnapshot().active).not.toBeNull();
    expect(after.tick).toBe(START_TICK);
  });
});
