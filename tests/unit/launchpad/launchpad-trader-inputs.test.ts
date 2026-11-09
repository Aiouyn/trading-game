// Graduated-coin trader inputs by hand (docs/v1/LAUNCHPAD.md "Graduated-coin trader inputs"): 16 coin news →
// attention / news sign / mentions; 04 Fear Index and regime; 06 hype on the path; 05 §3.14.1 ADV and T05-14 RETAIL;
// 05 §3.3 factor jumps from the Wire's index stories. Inactive vs active inputs on the same draws.
import { afterEach, describe, expect, it } from "vitest";
import { ASSET_BY_ID } from "@/market/catalog";
import { listedDef, resetListingsForTests } from "@/market/listings";
import { MEME_POOL_WEIGHTS, advTokens, hypeStep, newPools, retailNoise, stepPools, targets } from "@/server/broker/pools";
import { LiveMarket } from "@/server/market/clock";
import { CoinNews, novelty } from "@/server/market/coinNews";
import { DAYS_PER_YEAR, DT, HYPE, MEME_TEMPLATE, MemeProcess, NEUTRAL_PATH, TICKS_PER_DAY, memeParams } from "@/server/market/meme";
import type { PoolInputs } from "@/server/market/shockFeed";
import { FEAR_HELD, REGIME_MULTS, WorldInputs, fearRaw, fearRawGx, regimeStep, riskAppetite, stepFear, type Regime } from "@/server/market/world";

const coin = listedDef("FROG", "FROG Club", 21_596);
const { vol, drift } = memeParams("FROG");
const sd = vol / Math.sqrt(DAYS_PER_YEAR);
const lnRef = Math.log(21_596 / 1e8);
const QUIET = { regime: "EXPANSION" as Regime, fear: 20, riskAppetite: 1 - 20 / 50, attention: 1, newsSign: 0 as -1 | 0 | 1, mentions: 0 };
const inputs = (tick: number, r1h: number | null, r1d: number | null, w: Partial<typeof QUIET> = {}): PoolInputs =>
  ({ tick, ref: 21_596, lnV: lnRef, r1h, r1d, vol, ...QUIET, ...w });

describe("16 coin news → attention, news sign, mentions (by hand)", () => {
  it("a listing (IPO 0.5 × 1 × reach 0.3 = 0.15) and a +20% move (0.55 × 0.2/0.3 × 0.3 = 0.11), read from the next tick", () => {
    const n = new CoinNews();
    expect(n.observe(100, 10_000)).toBeNull(); // the first observation opens the day
    const l = n.listing(101, 10_000)!;
    expect(l.nw).toBeCloseTo(0.15, 15);
    expect(n.inputs(101)).toEqual({ attention: 1, newsSign: 0, mentions: 0 }); // published at 101: read from 102
    expect(n.inputs(102)).toEqual({ attention: 1.15, newsSign: 0, mentions: 0.15 });
    const m = n.observe(102, 12_000)!; // N−1's mark 20% over the day's open: the 15% level
    expect(m).toMatchObject({ kind: "move", sign: 1, level: 0.15, from: 10_000, to: 12_000 });
    expect(m.nw).toBeCloseTo(0.55 * (0.2 / 0.3) * 0.3, 15);
    const i = n.inputs(103);
    expect(i.attention).toBeCloseTo(1.26, 15);
    expect(i.newsSign).toBe(1);
    expect(i.mentions).toBeCloseTo(0.26, 15);
    expect(n.observe(103, 12_100)).toBeNull(); // the 15% level fires once a day
    // the 30% level the same day: novelty 1 − 0.5^(2/720) ≈ 0.0019 → nw below the 0.05 threshold: not published
    expect(novelty(104, 102)).toBeCloseTo(1 - Math.pow(0.5, 2 / TICKS_PER_DAY), 15);
    expect(n.observe(104, 13_500)).toBeNull();
    // the next game day: attention counts today's items only; mentions keep the last 24 game hours
    const next = n.inputs(TICKS_PER_DAY + 1);
    expect(next.attention).toBe(1);
    expect(next.mentions).toBeCloseTo(0.26, 15);
    expect(n.inputs(102 + TICKS_PER_DAY + 1).mentions).toBe(0);
  });
  it("a fall publishes a down item with sign −1 (a 'bad news' day for RETAIL)", () => {
    const n = new CoinNews();
    n.observe(10, 10_000);
    const d = n.observe(11, 8_400)!;
    expect(d).toMatchObject({ sign: -1, level: 0.15 });
    expect(n.inputs(12).newsSign).toBe(-1);
  });
});

describe("04 Fear Index and global regime (by hand)", () => {
  it("F_raw at the genesis inputs is 100σ(−2.02); a −3% index day adds 2 to z; F steps a 2-hour half-life an hour", () => {
    const sig = (x: number) => 100 / (1 + Math.exp(-x));
    // genesis held: csi 1, fsi 0, crisisTerm 0, tension 30, hack 0 → z = −1.2 − 0.32 − 0.5 = −2.02
    expect(fearRawGx({ rv21: 0.16, rToday: 0, r63: 0 })).toBeCloseTo(sig(-1.2 - 0.32 - 0.5), 12);
    expect(fearRawGx({ rv21: 0.16, rToday: -0.03, r63: 0 })).toBeCloseTo(sig(-2.02 + 2), 12);
    expect(fearRawGx({ rv21: 0.32, rToday: 0, r63: 0 })).toBeCloseTo(sig(-2.02 + 3), 12);
    expect(stepFear(22, 12)).toBeCloseTo(22 + (12 - 22) * (1 - Math.pow(2, -0.5)), 15);
    expect(riskAppetite(75)).toBe(-0.5);
    const w = new WorldInputs();
    w.observe(0, 420_015);
    w.observe(29, 420_015);
    expect(w.fear).toBe(22); // no game hour passed
    w.observe(30, 420_015);
    expect(w.fear).toBeCloseTo(stepFear(22, fearRawGx({ rv21: 0.16, rToday: 0, r63: 0 })), 15);
    expect(w.view().riskAppetite).toBeCloseTo(riskAppetite(w.fear), 15);
  });
  it("T04-15 engine worked numbers: neutral (T=50,H=50) raw 23.147522; storm example raw 94.409994; crisisTerm 0.5 moves z by +0.5", () => {
    const NEUTRAL = { rv21Gx: 0.16, creditSpreadIdx: 1, fsi: 0, crisisTerm: 0, tension: 50, hackRate: 50, gxReturnToday: 0, gxReturn63d: 0 };
    const STORM = { rv21Gx: 0.24, creditSpreadIdx: 1.1, fsi: 0.3, crisisTerm: 0.5, tension: 60, hackRate: 50, gxReturnToday: -0.01, gxReturn63d: -0.05 };
    expect(fearRaw(NEUTRAL)).toBeCloseTo(23.147522, 6);
    expect(fearRaw(STORM)).toBeCloseTo(94.409994, 6);
    expect(stepFear(22, fearRaw(STORM))).toBeCloseTo(43.208396, 6);
    const z = (x: typeof NEUTRAL) => Math.log(fearRaw(x) / (100 - fearRaw(x)));
    expect(z({ ...NEUTRAL, crisisTerm: 0.5 }) - z(NEUTRAL)).toBeCloseTo(0.5, 9);
    expect(FEAR_HELD).toEqual({ creditSpreadIdx: 1, fsi: 0, tension: 30, hackRate: 0 });
  });
  it("regime: none before the minimum length; hazard λΣP·M; the fear z tilts the target pick", () => {
    expect(regimeStep("EXPANSION", 181, 0, 0, 0)).toBe("EXPANSION");
    const p = 1 - Math.exp(-1 / (819 - 182));
    expect(regimeStep("EXPANSION", 200, 0, p * 0.99, 0.6)).toBe("OVERHEATING");
    expect(regimeStep("EXPANSION", 200, 0, p * 1.01, 0.6)).toBe("EXPANSION");
    // z = 3: CONTRACTION's weight 0.2 e^{1.2}; OVERHEATING's share 0.8 / (0.8 + 0.664) = 0.546 → u2 0.6 now picks CONTRACTION
    expect(regimeStep("EXPANSION", 200, 3, 0, 0.6)).toBe("CONTRACTION");
    expect(regimeStep("CONTRACTION", 91, -2, 0, 0.99)).toBe("RECOVERY");
  });
});

describe("06 hype on the path (same draws, active vs neutral)", () => {
  it("H = 0.6 in EXPANSION: σ × 0.9 × 2.2 and μ + 1.8 a game year on the same shock", () => {
    const a = new MemeProcess("FROG", 21_596, 8), b = new MemeProcess("FROG", 21_596, 8), c = new MemeProcess("FROG", 21_596, 8);
    const l0 = a.lnV();
    const act = { hype: 0.6, reg: REGIME_MULTS.EXPANSION };
    a.step(0.5, -0.3, NEUTRAL_PATH); b.step(0.5, -0.3, act); c.step(0.5, -0.3, NEUTRAL_PATH);
    expect(c.lnV()).toBe(a.lnV()); // deterministic
    const shock = (a.lnV() - l0 - (drift - 0.5 * vol * vol) * DT) / (vol * Math.sqrt(DT));
    const s = vol * 0.9 * 2.2;
    // template drift and vol on their inherited 252 basis (DT); the hype term per 364-day game year (06:755, 00:161)
    expect(b.lnV() - l0).toBeCloseTo((drift - 0.5 * s * s) * DT + (3.0 * 0.6) / (720 * 364) + s * Math.sqrt(DT) * shock, 12);
    expect(b.sigmaEff(act)).toBeCloseTo(vol * 1.98, 12);
    // the inputs never change the stream: 50 more steps, the neutral path still equals a path that never saw hype
    for (let i = 0; i < 50; i++) { a.step(0.1, 0.1, NEUTRAL_PATH); b.step(0.1, 0.1, act); c.step(0.1, 0.1, NEUTRAL_PATH); }
    expect(c.lnV()).toBe(a.lnV());
    expect(b.lnV()).not.toBe(a.lnV());
  });
  it("hype drift units (GK B1 at 5d450211): same RNG, same vol, H 0.6 vs 0: c·H/(720·364) a tick, c·H/364 a game day, 1.8 a 364-day game year", () => {
    // same draws and the same σ for both (regime vol and the 1 + 2H vol factor held equal), so the log difference is the
    // hype drift term alone
    const reg = REGIME_MULTS.EXPANSION;
    const on = new MemeProcess("FROG", 21_596, 8), off = new MemeProcess("FROG", 21_596, 8);
    const perTick: number[] = [];
    for (let i = 0; i < 720; i++) {
      const a0 = on.lnV(), b0 = off.lnV();
      on.step(0.2, -0.1, { hype: 0.6, reg: { ...reg, vol: reg.vol } });
      // off: H = 0 but its vol factor raised to (1 + 2 × 0.6) through the regime vol, so σ is identical
      off.step(0.2, -0.1, { hype: 0, reg: { ...reg, vol: reg.vol * 2.2 } });
      perTick.push((on.lnV() - a0) - (off.lnV() - b0));
    }
    for (const d of perTick) expect(d).toBeCloseTo((3.0 * 0.6) / (720 * 364), 14);
    const day = perTick.reduce((t, d) => t + d, 0);
    expect(day).toBeCloseTo((3.0 * 0.6) / 364, 12); // 0.004945… a game day (5d450211 gave 0.007142…, ×1.444)
    expect(day).toBeCloseTo(0.004945054945054945, 12);
    expect(day * 364).toBeCloseTo(1.8, 10); // an annualized log-drift contribution of 1.8, not a +180% return
  });
  it("hype by hand: m = 0.15 slows the decay (0.4965 vs 0.474 an hour); with no input H decays (×0.79 an hour)", () => {
    expect(hypeStep(0.6, 0.15, 0)).toBeCloseTo(0.6 + 0.15 * (0.15 - 0.6) - 0.06 * 0.6, 15);
    expect(hypeStep(0.6, 0, 0)).toBeCloseTo(0.474, 15);
    expect(hypeStep(1, 1, 1)).toBe(1); // 1.09 clamped to [0, 1]
    expect(hypeStep(0, 0, 0)).toBe(0);
    expect(HYPE).toMatchObject({ a: 0.15, b: 0.06, h0: 0.6, c: 3.0, volK: 2 });
  });
});

describe("05 §3.14.1 ADV and T05-14 RETAIL in the pools (by hand)", () => {
  const T = 921 * 30; // RETAIL's noise +1.66: its weighted target is past its cap, so its order is the cap
  const retailQty = (w: Partial<typeof QUIET>) => {
    const s = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, undefined, { cash: 4_329_671, tokens: 200_000_000 }, 21_600, inputs(T, 0.004, 0.02, w), "e1")!;
    const r = s.prints.find((x) => x.pool === "retail")!;
    return { s, qty: r.qty };
  };
  it("ADV_t = 150M × (1 + 0.01 max(0, F − 20)) × attention × regimeTurnover; RETAIL's cap is 3 × 0.15/720 of it", () => {
    expect(advTokens(QUIET)).toBe(150_000_000);
    expect(retailQty({}).qty).toBe(93_750);
    expect(retailQty({ attention: 1.15 }).qty).toBe(107_812); // 0.000625 × 172.5M
    expect(retailQty({ fear: 40 }).qty).toBe(112_500); // × 1.2
    expect(retailQty({ regime: "CONTRACTION" }).qty).toBe(121_875); // × 1.3
    // cash identity: the book gains exactly what the pools paid
    const { s } = retailQty({ attention: 1.15 });
    const paid = (["value", "retail", "degen"] as const).reduce((t, k) => t + (newPools(MEME_POOL_WEIGHTS, 21_596, "e1", T, 200_000_000)[k].cash - s.pools[k].cash), 0);
    expect(s.book.cash - 4_329_671).toBe(paid);
    expect(paid).toBe(4_556); // finite depth: s=.0266, D=.9548, Y=1.2, sigmaDaily=vol/√364
    expect(s.pools.w).toEqual({ rg: "EXPANSION", f: 20, att: 1.15, ns: 0, m: 0, b: 0 });
  });
  it("RETAIL = tanh(n_h + 0.5 tanh(r1d/σd) + newsSign(attention − 1) + 0.3 [EXPANSION] tanh(max(0, −r1d/σd)))", () => {
    const z = retailNoise("FROG", 922);
    const t = (w: Partial<typeof QUIET>, r1d: number | null) => targets(inputs(922 * 30, null, r1d, w), 0.6, z).retail;
    expect(t({}, null)).toBeCloseTo(Math.tanh(z), 15);
    expect(t({ newsSign: 1, attention: 2 }, null)).toBeCloseTo(Math.tanh(z + 1), 15);
    expect(t({ newsSign: -1, attention: 1.26 }, null)).toBeCloseTo(Math.tanh(z - 0.26), 15);
    // a 2σ down day: dip-buying in EXPANSION only
    expect(t({}, -2 * sd)).toBeCloseTo(Math.tanh(z + 0.5 * Math.tanh(-2) + 0.3 * Math.tanh(2)), 15);
    expect(t({ regime: "CONTRACTION" }, -2 * sd)).toBeCloseTo(Math.tanh(z + 0.5 * Math.tanh(-2)), 15);
  });
  it("inactive vs active: in a quiet hour RETAIL (noise −0.39, holding nothing) sends nothing; good news makes it buy", () => {
    const T2 = 922 * 30, book = { cash: 4_329_671, tokens: 200_000_000 };
    const quiet = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, undefined, book, 21_600, inputs(T2, null, null), "e1");
    expect((quiet?.prints ?? []).filter((p) => p.pool === "retail")).toEqual([]);
    const news = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, undefined, book, 21_600, inputs(T2, null, null, { newsSign: 1, attention: 1.5 }), "e1")!;
    expect(news.prints.find((p) => p.pool === "retail")).toMatchObject({ side: "BUY" });
  });
  it("DEGEN: buys on a rising hour scaled by 1 + 2H; with an empty book it gets nothing and pays nothing", () => {
    const ok = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, undefined, { cash: 4_329_671, tokens: 200_000_000 }, 21_600, inputs(T, 0.004, null), "e1")!;
    expect(ok.prints.find((p) => p.pool === "degen")).toMatchObject({ side: "BUY" });
    const dry = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, undefined, { cash: 4_329_671, tokens: 0 }, 21_600, inputs(T, 0.004, null), "e1")!;
    expect(dry.prints).toEqual([]);
    expect(dry.pools.degen.cash).toBe(3_239_400);
    expect(targets(inputs(T, 0.004, null), 0, 0).degen * 2.2).toBeCloseTo(targets(inputs(T, 0.004, null), 0.6, 0).degen, 15);
  });
});

describe("on the clock: Wire items name the coin; index stories move it (05 §3.3 factor jumps)", () => {
  afterEach(() => { resetListingsForTests(); });
  it("a fresh graduation publishes one listing item citing it; a relist (restart) publishes none; the pools read it", () => {
    const m = new LiveMarket();
    m.list(coin, { announce: true });
    m.list(coin, { announce: true }); // once per coin on this clock
    const items = m.wire().items.filter((i) => i.headlineKey === "wire.news.coinListed");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "NEWS", slots: { coin: "FROG" }, causeEventIds: ["lp-grad:FROG"], causeKey: "wire.cause.coin-listed" });
    expect(items[0]!.phase).toBeUndefined(); // no "Price effect" section: the item moves no price itself
    m.step();
    expect(m.poolInputs("FROG")).toMatchObject({ attention: 1.15, newsSign: 0, mentions: 0.15, regime: "EXPANSION" });
    resetListingsForTests();
    const r = new LiveMarket();
    r.list(coin, { hype: 0.31 });
    expect(r.wire().items.some((i) => i.headlineKey === "wire.news.coinListed")).toBe(false);
    expect(r.hypeOf("FROG")).toBe(0.31); // the saved H, not H₀
  });
  it("a large move is news at the next tick (up item, move slot), and RETAIL reads good news and more attention", () => {
    const m = new LiveMarket();
    m.list(coin);
    m.step();
    m.impactListed("FROG", Math.log(1.25)); // a fill's permanent move: +25% from the day's open
    m.step();
    const up = m.wire().items.find((i) => i.headlineKey === "wire.news.coinUp")!;
    expect(up).toMatchObject({ slots: { coin: "FROG" }, causeKey: "wire.cause.coin-move" });
    expect(Number(up.slots!.move)).toBeGreaterThanOrEqual(15);
    m.step();
    const i = m.poolInputs("FROG")!;
    expect(i.newsSign).toBe(1);
    expect(i.attention).toBeGreaterThan(1);
  });
  it("an index story moves the coin by wMarket × σ_eff/σ_GX × J, listed in the story's effects", () => {
    const m = new LiveMarket();
    m.list(coin);
    let found: { gx: { from: string; to: string }; frog: { from: string; to: string } } | null = null;
    for (let i = 0; i < 3000 && !found; i++) {
      m.step();
      const it = m.wire().items.filter((x) => x.tick === m.snapshot().tick && x.kind !== "NEWS").at(-1);
      const gx = it?.effects?.find((e) => e.assetId === "GX"), frog = it?.effects?.find((e) => e.assetId === "FROG");
      if (gx) { expect(frog).toBeDefined(); found = { gx, frog: frog! }; }
    }
    expect(found).not.toBeNull();
    const sGX = (ASSET_BY_ID.GX!.volBp / 10_000 / Math.sqrt(3)) * Math.sqrt(TICKS_PER_DAY * DAYS_PER_YEAR);
    const J = Math.log(Number(found!.gx.to) / Number(found!.gx.from));
    const want = MEME_TEMPLATE.wMarket * (vol * REGIME_MULTS[m.worldView().regime].vol * (1 + 2 * 0.6) / sGX) * J;
    expect(Math.log(Number(found!.frog.to) / Number(found!.frog.from))).toBeCloseTo(want, 3); // marks in whole 1e-8 $
    expect(Math.abs(want)).toBeGreaterThan(Math.abs(J)); // the coin's vol is far above the index's
  });
});
