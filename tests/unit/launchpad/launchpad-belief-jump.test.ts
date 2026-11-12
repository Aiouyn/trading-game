// Belief multi-day jump ≡ tick-by-tick (GK 26a2be36 ask).
import { describe, expect, it } from "vitest";
import {
  BELIEF, catchUpBelief, updateBelief, type BeliefClaim, type BeliefPathTick,
} from "@/server/broker/belief";
import { targets } from "@/server/broker/pools";
import { HYPE, TICKS_PER_DAY } from "@/server/market/meme";
import type { PoolInputs } from "@/server/market/shockFeed";

const days = 5;
const t0 = 1000;

function scriptPath(): BeliefPathTick[] {
  const path: BeliefPathTick[] = [];
  const moves = [
    { id: "move:1200", tick: 1200, a: 0.12, nw: 0.25 },
    { id: "move:2500", tick: 2500, a: -0.08, nw: 0.18 },
  ];
  for (let t = t0 + 1; t <= t0 + days * TICKS_PER_DAY; t++) {
    const hour = Math.floor(t / 30);
    // H path: rise into pump gate mid-window, then cool
    const age = t - t0;
    let h = HYPE.h0;
    if (age > TICKS_PER_DAY && age < 3 * TICKS_PER_DAY) h = HYPE.h0 + 0.25;
    else if (age >= 3 * TICKS_PER_DAY) h = HYPE.h0 - 0.05;
    const attention = age > TICKS_PER_DAY && age < 3.5 * TICKS_PER_DAY ? 1.4 : 1.0;
    const fear = age > 4 * TICKS_PER_DAY ? 75 : 28;
    const mentions = attention > 1 ? 0.3 : 0;
    path.push({
      tick: t, h, attention, fear, mentions,
      moves: moves.filter((m) => m.tick < t),
    });
    void hour;
  }
  return path;
}

describe("belief multi-day jump ≡ tick-by-tick", () => {
  it("catchUpBelief(path) matches per-tick updateBelief on claims/pump/b", () => {
    const path = scriptPath();
    let claims: BeliefClaim[] = [];
    let pump = 0;
    let bStep = 0;
    for (const step of path) {
      const u = updateBelief(claims, step.tick, step.h, pump, {
        attention: step.attention, fear: step.fear, mentions: step.mentions, moves: step.moves,
      });
      claims = u.claims;
      pump = u.pump;
      bStep = u.b;
    }
    const jumped = catchUpBelief([], 0, path);
    expect(jumped.pump).toBe(pump);
    expect(jumped.b).toBeCloseTo(bStep, 12);
    expect(jumped.claims.map((c) => ({ ...c }))).toEqual(claims.map((c) => ({ ...c })));
    // pump opened then closed across the scripted gates
    expect(pump).toBeGreaterThanOrEqual(1);
    expect(jumped.claims.some((c) => c.id.startsWith("pump:"))).toBe(true);
    expect(jumped.claims.some((c) => c.id === "move:1200")).toBe(true);
    expect(jumped.claims.some((c) => c.id === "move:2500")).toBe(true);
  });

  it("day-chunked catch-up equals one full jump (same seed path)", () => {
    const path = scriptPath();
    const mid = Math.floor(path.length / 2);
    const a = catchUpBelief([], 0, path.slice(0, mid));
    const b = catchUpBelief(a.claims, a.pump, path.slice(mid));
    const full = catchUpBelief([], 0, path);
    expect(b.pump).toBe(full.pump);
    expect(b.b).toBeCloseTo(full.b, 12);
    expect(b.claims).toEqual(full.claims);
  });

  it("same belief → same VALUE/RETAIL/DEGEN targets (fillOnBook inputs)", () => {
    const path = scriptPath();
    const jumped = catchUpBelief([], 0, path);
    const step = (() => {
      let claims: BeliefClaim[] = [];
      let pump = 0;
      let last = { claims, pump, b: 0 };
      for (const s of path) {
        last = updateBelief(claims, s.tick, s.h, pump, {
          attention: s.attention, fear: s.fear, mentions: s.mentions, moves: s.moves,
        });
        claims = last.claims;
        pump = last.pump;
      }
      return last;
    })();
    const inp: PoolInputs = {
      tick: path.at(-1)!.tick, ref: 21_596, lnV: Math.log(21_596 / 1e8),
      r1h: 0.01, r1d: 0.02, vol: 1.9, fear: 28, riskAppetite: 1 - 28 / 50,
      attention: 1.2, newsSign: 1, mentions: 0.2, regime: "EXPANSION",
    };
    expect(targets(inp, HYPE.h0, 0.5, 8, jumped.b)).toEqual(targets(inp, HYPE.h0, 0.5, 8, step.b));
    expect(Math.abs(jumped.b)).toBeGreaterThan(0);
    expect(Math.abs(jumped.b)).toBeLessThanOrEqual(BELIEF.cap);
  });
});
