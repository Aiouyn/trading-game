// 05 §6.3 belief overlay for graduated meme coins: synthetic claims from Wire moves + PUMP_CLAIM,
// RETAIL/DEGEN amplify, VALUE gap includes b, fillOnBook path, restart persistence, conservation.
import { describe, expect, it } from "vitest";
import { listedDef } from "@/market/listings";
import {
  BELIEF, beliefAmplify, claimContribution, moveAsserted, sumBelief, updateBelief, type BeliefClaim,
} from "@/server/broker/belief";
import { MEME_POOL_WEIGHTS, newPools, stepPools, targets } from "@/server/broker/pools";
import { baseDepthInputs, type BookAccount } from "@/server/broker/book";
import type { PoolInputs } from "@/server/market/shockFeed";
import { HYPE, TICKS_PER_DAY } from "@/server/market/meme";
import { LP } from "@/launchpad/rules";

const a = listedDef("FROG", "FROG Club", 21_596);
const book0 = (): BookAccount => ({ cash: 4_329_671, tokens: 200_000_000 });
const depth = baseDepthInputs("FROG");
const lnV = Math.log(21_596 / 1e8);
const quiet = (tick: number, extra: Partial<PoolInputs> = {}): PoolInputs => ({
  tick, ref: 21_596, lnV, r1h: 0.01, r1d: 0.02, vol: 1.9,
  fear: 22, riskAppetite: 1 - 22 / 50, attention: 1, newsSign: 0, mentions: 0, regime: "EXPANSION",
  ...extra,
});

describe("05 §6.3 belief math (by hand)", () => {
  it("move assertedMove is sign × min(|ln(to/from)|, 0.15)", () => {
    // ln(1.2)≈0.182 > 0.15 → capped
    expect(moveAsserted(1, 10_000, 12_000)).toBeCloseTo(0.15, 12);
    expect(moveAsserted(-1, 10_000, 9_200)).toBeCloseTo(-Math.log(10_000 / 9_200), 12); // |ln| < 0.15
    expect(moveAsserted(1, 10_000, 20_000)).toBeCloseTo(0.15, 12);
    expect(moveAsserted(0, 10_000, 12_000)).toBe(0);
  });

  it("b_c rises over ~30 ticks then decays with 5 GD half-life; sum clamps ±0.5", () => {
    const c: BeliefClaim = { id: "move:100", a: 0.15, cr: 1, reach: 1, t0: 100 };
    expect(claimContribution(c, 100)).toBeCloseTo(0, 12);
    expect(claimContribution(c, 100 + BELIEF.spreadTicks)).toBeGreaterThan(0.09);
    const atHl = claimContribution(c, 100 + BELIEF.hlTicks);
    const atSpread = claimContribution(c, 100 + BELIEF.spreadTicks);
    // after one half-life from t0, decay=0.5; spread nearly 1 for age>>30
    expect(atHl).toBeLessThan(atSpread);
    const fat: BeliefClaim[] = [
      { id: "a", a: 0.5, cr: 1, reach: 1, t0: 0 },
      { id: "b", a: 0.5, cr: 1, reach: 1, t0: 0 },
    ];
    expect(sumBelief(fat, 1000)).toBe(0.5);
    // single claim at full spread still decays; clamp hits only when Σ exceeds the cap
    expect(sumBelief([{ id: "n", a: -0.5, cr: 1, reach: 1, t0: 0 }], 60)).toBeCloseTo(
      claimContribution({ id: "n", a: -0.5, cr: 1, reach: 1, t0: 0 }, 60), 12,
    );
    expect(sumBelief(fat, 60)).toBe(0.5);
  });

  it("pump claim opens on H/attention/Fear gates and closes on H/F/attention", () => {
    const open = updateBelief([], 500, HYPE.h0 + 0.2, 0, { attention: 1.3, fear: 30, mentions: 0.2 });
    expect(open.pump).toBe(1);
    expect(open.claims.some((c) => c.id === "pump:1" && !c.closed)).toBe(true);
    // at t0 spread factor is 0; after 30 ticks b_c is live
    const aged = updateBelief(open.claims, 500 + BELIEF.spreadTicks, HYPE.h0 + 0.2, open.pump, { attention: 1.3, fear: 30, mentions: 0.2 });
    expect(aged.b).toBeGreaterThan(0);

    // same inputs: idempotent (no second pump)
    const again = updateBelief(aged.claims, 531, HYPE.h0 + 0.2, aged.pump, { attention: 1.3, fear: 30, mentions: 0.2 });
    expect(again.pump).toBe(1);
    expect(again.claims.filter((c) => c.id.startsWith("pump:")).length).toBe(1);

    const closed = updateBelief(again.claims, 532, HYPE.h0 - 0.01, again.pump, { attention: 1, fear: 80, mentions: 0 });
    expect(closed.claims.find((c) => c.id === "pump:1")?.closed).toBe(true);
  });

  it("Wire move seed opens one claim by id; same id never doubles", () => {
    const moves = [{ id: "move:200", tick: 200, a: 0.1, nw: 0.11 }];
    const u1 = updateBelief([], 201, 0.6, 0, { attention: 1.2, fear: 22, mentions: 0.1, moves });
    expect(u1.claims.some((c) => c.id === "move:200")).toBe(true);
    const u2 = updateBelief(u1.claims, 202, 0.6, 0, { attention: 1.2, fear: 22, mentions: 0.1, moves });
    expect(u2.claims.filter((c) => c.id === "move:200").length).toBe(1);
  });

  it("amplify is 1 at b=0 and 1+2|b|/0.1 when active", () => {
    expect(beliefAmplify(0)).toBe(1);
    expect(beliefAmplify(0.05)).toBeCloseTo(1 + 2 * 0.05 / 0.1, 12);
  });
});

describe("belief drives NPC targets and fillOnBook flow", () => {
  it("bullish b raises |RETAIL/DEGEN| vs twin and flips VALUE toward sell (gap includes +b)", () => {
    const inp = quiet(1000, { r1h: 0.02, r1d: 0.03, attention: 1.2, newsSign: 1 });
    const z = 0;
    const t0 = targets(inp, 0.6, z, 8, 0);
    const tB = targets(inp, 0.6, z, 8, 0.1);
    expect(Math.abs(tB.retail)).toBeGreaterThan(Math.abs(t0.retail));
    expect(Math.abs(tB.degen)).toBeGreaterThan(Math.abs(t0.degen));
    // VALUE: G = ln(ref)+b-lnV → larger positive G → more negative target (sell)
    expect(tB.value).toBeLessThan(t0.value);
  });

  it("same book+seed: belief twin produces different NPC flow/price vs b=0 path", () => {
    // Claim published 100 ticks ago so spread≈1 − e^{−100/30} is material.
    const moves = [{ id: "move:900", tick: 900, a: 0.12, nw: 0.25 }];
    const inpB = quiet(1000, { attention: 1.5, newsSign: 1, mentions: 0.4, moves, r1h: 0.05, r1d: 0.08 });
    const inp0 = quiet(1000, { attention: 1.5, newsSign: 1, mentions: 0.4, r1h: 0.05, r1d: 0.08 });
    const prior = newPools(MEME_POOL_WEIGHTS, 21_596, "ep1", 1000, book0().tokens, 8);
    prior.h = HYPE.h0;
    prior.t = 999;
    const pB = structuredClone(prior);
    const p0 = structuredClone(prior);
    const sB = stepPools(a, MEME_POOL_WEIGHTS, 21_596, pB, book0(), 21_596, inpB, "ep1", depth)!;
    const s0 = stepPools(a, MEME_POOL_WEIGHTS, 21_596, p0, book0(), 21_596, inp0, "ep1", depth)!;
    expect(Math.abs(sB.pools.w?.b ?? 0)).toBeGreaterThan(0.01);
    expect(Math.abs(s0.pools.w?.b ?? 0)).toBeLessThan(1e-9);
    const volB = sB.prints.reduce((s, p) => s + p.qty, 0);
    const vol0 = s0.prints.reduce((s, p) => s + p.qty, 0);
    const moveB = sB.moves.reduce((s, m) => s + m, 0);
    const move0 = s0.moves.reduce((s, m) => s + m, 0);
    expect(volB !== vol0 || moveB !== move0 || (sB.pools.w?.b ?? 0) !== (s0.pools.w?.b ?? 0)).toBe(true);
  });

  it("conservation: supply tokens + book tokens unchanged net of prints; no mint", () => {
    const moves = [{ id: "move:910", tick: 910, a: -0.1, nw: 0.15 }];
    const inp = quiet(1000, { attention: 1.5, newsSign: -1, mentions: 0.4, moves, r1h: -0.04, r1d: -0.06 });
    const prior = newPools(MEME_POOL_WEIGHTS, 21_596, "ep1", 1000, book0().tokens, 8);
    prior.t = 999;
    prior.retail = { ...prior.retail, tokens: 1_000_000 };
    prior.value = { ...prior.value, tokens: 500_000 };
    prior.degen = { ...prior.degen, tokens: 2_000_000 };
    const book: BookAccount = { cash: 4_329_671, tokens: LP.SUPPLY - 1_000_000 - 500_000 - 2_000_000 };
    const before = prior.value.tokens + prior.retail.tokens + prior.degen.tokens + book.tokens;
    const step = stepPools(a, MEME_POOL_WEIGHTS, 21_596, prior, book, 21_596, inp, "ep1", depth)!;
    const after = step.pools.value.tokens + step.pools.retail.tokens + step.pools.degen.tokens + step.book.tokens;
    expect(after).toBe(before);
    expect(after).toBe(LP.SUPPLY);
    expect(step.pools.value.cash).toBeGreaterThanOrEqual(0);
    expect(step.pools.retail.cash).toBeGreaterThanOrEqual(0);
    expect(step.pools.degen.cash).toBeGreaterThanOrEqual(0);
  });

  it("restart: claims + b restore; same next tick without double-open", () => {
    const moves = [{ id: "move:920", tick: 920, a: 0.1, nw: 0.18 }];
    const inp = quiet(1000, {
      attention: 1.35, newsSign: 1, mentions: 0.25, moves,
      // force pump too
    });
    const prior = newPools(MEME_POOL_WEIGHTS, 21_596, "ep1", 1000, book0().tokens, 8);
    prior.h = HYPE.h0 + 0.2;
    prior.t = 999;
    const s1 = stepPools(a, MEME_POOL_WEIGHTS, 21_596, prior, book0(), 21_596, inp, "ep1", depth)!;
    expect((s1.pools.cl ?? []).length).toBeGreaterThan(0);
    const b1 = s1.pools.w!.b;
    // simulate restart: clone saved pools, same tick already acted → null; next tick continues
    const saved = structuredClone(s1.pools);
    expect(stepPools(a, MEME_POOL_WEIGHTS, 21_596, saved, s1.book, 21_596, inp, "ep1", depth)).toBeNull();
    const inp2 = quiet(1001, { attention: 1.35, newsSign: 1, mentions: 0.25, moves });
    const s2 = stepPools(a, MEME_POOL_WEIGHTS, 21_596, saved, s1.book, 21_596, inp2, "ep1", depth)!;
    expect(s2.pools.cl!.filter((c) => c.id === "move:920").length).toBe(1);
    expect(s2.pools.pu ?? 0).toBe(saved.pu ?? 0);
    // belief still finite and continuous
    expect(Number.isFinite(s2.pools.w!.b)).toBe(true);
    expect(Math.abs(s2.pools.w!.b)).toBeLessThanOrEqual(0.5);
    expect(b1).not.toBe(0);
  });
});
