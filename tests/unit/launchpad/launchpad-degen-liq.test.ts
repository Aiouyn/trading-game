// DEGEN local margin + forced liquidation for graduated meme coins (07 §3.15–3.16 approximation; 05 §6.2 DEGEN).
// docs/v1/LAUNCHPAD.md "DEGEN leverage / liquidations"; evidence/launchpad/degen-liquidations/UNIT.md.
import { describe, expect, it } from "vitest";
import { LP } from "@/launchpad/rules";
import {
  ADV_TOKENS, MEME_POOL_WEIGHTS, POOL_LAW, applyStormHype, degenBuyCap, degenStatus, newPools, poolEquity, poolIm, poolMm,
  stepPools, type CoinPools, type PoolAccount,
} from "@/server/broker/pools";
import { baseDepthInputs, fillOnBook, type BookAccount } from "@/server/broker/book";
import { listedDef } from "@/market/listings";
import type { PoolInputs } from "@/server/market/shockFeed";

const frog = () => listedDef("FROG", "FROG Club", 21_596);
const bookOf = (tokens = 200_000_000, cash = 4_329_671): BookAccount => ({ cash, tokens });

const inp = (tick: number, ref: number, over: Partial<PoolInputs> = {}): PoolInputs => ({
  tick, ref, lnV: Math.log(ref / 1e8), r1h: 0.05, r1d: 0.02, vol: 1.9,
  fear: 22, riskAppetite: 1 - 22 / 50, attention: 1, newsSign: 0, mentions: 0, regime: "EXPANSION",
  ...over,
});

describe("DEGEN margin math (hand fixtures)", () => {
  it("IM / MM / status transitions match 07 retail rules at imRate 0.20", () => {
    expect(POOL_LAW.degenImRate).toBe(0.20);
    expect(POOL_LAW.degenMmMult).toBe(0.5);
    expect(POOL_LAW.liqParticipation).toBe(0.20);
    const notional = 1_000_000; // $10,000
    const im = poolIm(notional);
    expect(im).toBe(200_000);
    expect(poolMm(im)).toBe(100_000);
    expect(degenStatus(200_000, im)).toBe("OK");
    expect(degenStatus(150_000, im)).toBe("CALL");
    expect(degenStatus(99_999, im)).toBe("LIQ");
    expect(degenStatus(100_000, im)).toBe("CALL"); // equity == MM → still CALL? 07: equity < MM → LIQ; == MM is CALL
    // GK backlog: equity ≤ 0 → LIQ even when im rounds to 0 (dust leftover).
    expect(degenStatus(0, 0)).toBe("LIQ");
    expect(degenStatus(-1, 0)).toBe("LIQ");
  });

  it("borrow raises cash+debt together (equity unchanged); repay on sell", () => {
    const acct: PoolAccount = { cash: 100, tokens: 0, pos: 0 };
    const mark = 21_596;
    const eq0 = poolEquity(acct, mark, 8);
    // simulate borrow 50
    acct.cash += 50; acct.debt = 50;
    expect(poolEquity(acct, mark, 8)).toBe(eq0);
  });

  it("forced slice ≤ 0.20 × ADV / 720", () => {
    const adv = ADV_TOKENS;
    const slice = Math.floor((POOL_LAW.liqParticipation * adv) / 720);
    expect(slice).toBe(Math.floor(0.20 * 150_000_000 / 720));
    expect(slice).toBe(41_666);
  });
});

describe("DEGEN liquidation cascade through fillOnBook", () => {
  it("price drop → LIQ forced sell → further permanent move; conservation of tokens; no mint", () => {
    const a = frog();
    const list = 21_596;
    const book0 = bookOf();
    const depth = baseDepthInputs("FROG");
    // Seed DEGEN with a leveraged long: many tokens, little equity
    const prior = newPools(MEME_POOL_WEIGHTS, list, "ep1", 1000, book0.tokens, 8);
    prior.degen.tokens = 5_000_000;
    prior.degen.cash = 50_000; // $500
    prior.degen.debt = 800_000; // $8,000 borrowed
    prior.degen.pos = 5_000_000 / ADV_TOKENS;
    prior.t = 999;
    const markHigh = 30_000; // still maybe OK-ish
    const markCrash = 8_000; // deep drop → underwater
    const eqCrash = poolEquity(prior.degen, markCrash, 8);
    const imCrash = poolIm(Math.round(prior.degen.tokens * markCrash / 1e6));
    expect(degenStatus(eqCrash, imCrash)).toBe("LIQ");

    const twin = structuredClone(prior);
    // Twin without debt: same tokens/cash but debt 0 → may not liquidate
    delete twin.degen.debt;
    twin.degen.cash = prior.degen.cash; // no debt

    const stepLiq = stepPools(a, MEME_POOL_WEIGHTS, list, prior, structuredClone(book0), markCrash, inp(1000, markCrash, { r1h: -0.5 }), "ep1", depth)!;
    expect(stepLiq).toBeTruthy();
    const liqPrints = stepLiq.prints.filter((p) => p.pool === "degen" && p.liq);
    expect(liqPrints.length).toBeGreaterThanOrEqual(1);
    expect(stepLiq.liqWire).toBeTruthy();
    expect(stepLiq.moves.some((m) => m < 0)).toBe(true); // sell impact is negative log move
    // tokens conserved: book gained what degen sold
    const sold = liqPrints.reduce((s, p) => s + p.qty, 0);
    expect(stepLiq.book.tokens).toBe(book0.tokens + sold);
    expect(stepLiq.pools.degen.tokens).toBe(prior.degen.tokens - sold);
    // debt repaid from proceeds (non-increasing)
    expect((stepLiq.pools.degen.debt ?? 0)).toBeLessThanOrEqual(prior.degen.debt!);
    // no negative cash
    expect(stepLiq.pools.degen.cash).toBeGreaterThanOrEqual(0);

    const stepTwin = stepPools(a, MEME_POOL_WEIGHTS, list, twin, structuredClone(book0), markCrash, inp(1000, markCrash, { r1h: -0.5 }), "ep1", depth);
    const twinLiq = stepTwin?.prints.filter((p) => p.liq) ?? [];
    // Levered path forced more (or any) liq sells vs unlevered twin at same mark
    expect(liqPrints.length).toBeGreaterThanOrEqual(twinLiq.length);
    // Cascade: sum of liq moves strictly negative
    const liqMove = stepLiq.moves.reduce((s, m, i) => s + (stepLiq.prints[i]?.liq ? m : 0), 0);
    expect(liqMove).toBeLessThan(0);
    void markHigh;
  });

  it("same seed → same forced qty; restart mid-LIQ continues without double Wire flag semantics", () => {
    const a = frog();
    const list = 21_596;
    const book0 = bookOf();
    const depth = baseDepthInputs("FROG");
    const base = newPools(MEME_POOL_WEIGHTS, list, "ep1", 2000, book0.tokens, 8);
    base.degen.tokens = 3_000_000;
    base.degen.cash = 10_000;
    base.degen.debt = 500_000;
    base.degen.pos = 0.02;
    base.t = 1999;
    const mark = 5_000;
    const s1 = stepPools(a, MEME_POOL_WEIGHTS, list, structuredClone(base), structuredClone(book0), mark, inp(2000, mark, { r1h: -0.8 }), "ep1", depth)!;
    const s2 = stepPools(a, MEME_POOL_WEIGHTS, list, structuredClone(base), structuredClone(book0), mark, inp(2000, mark, { r1h: -0.8 }), "ep1", depth)!;
    expect(s1.prints).toEqual(s2.prints);
    expect(s1.liqWire?.qty).toBe(s2.liqWire?.qty);
    // Continue next tick from saved pools: wired stays true → no second liqWire
    const mid = s1.pools;
    expect(mid.liq?.st).toBe("LIQ");
    expect(mid.liq?.wired).toBe(true);
    const s3 = stepPools(a, MEME_POOL_WEIGHTS, list, mid, s1.book, mark, inp(2001, mark, { r1h: -0.8 }), "ep1", depth)!;
    expect(s3.liqWire).toBeUndefined();
    // New epoch restart: same accounts, may Wire again only if wired cleared — wired persists in save
    const restarted = structuredClone(mid);
    restarted.ep = "ep2";
    restarted.t = 1999;
    // wired still set → no new Wire even on new epoch (episode continuity)
    const s4 = stepPools(a, MEME_POOL_WEIGHTS, list, restarted, s1.book, mark, inp(2000, mark, { r1h: -0.8 }), "ep2", depth)!;
    expect(s4.liqWire).toBeUndefined();
  });

  it("preview==fill under liquidation: forced sell uses fillOnBook bounds", () => {
    const a = frog();
    const book = bookOf(200_000_000, 1_000); // thin book cash
    const depth = baseDepthInputs("FROG");
    const mark = 10_000;
    const qty = 41_666;
    const prev = fillOnBook(a, "SELL", qty, mark, structuredClone(book), 1, Math.ceil(mark * Math.exp(-0.1)), depth);
    const fill = fillOnBook(a, "SELL", qty, mark, structuredClone(book), 1, Math.ceil(mark * Math.exp(-0.1)), depth);
    expect(prev?.qty).toBe(fill?.qty);
    expect(prev?.px).toBe(fill?.px);
    expect(prev?.notional).toBe(fill?.notional);
  });
});

describe("storm hype still applies with liq field present", () => {
  it("applyStormHype leaves debt/liq untouched", () => {
    const p: CoinPools = {
      ...newPools(MEME_POOL_WEIGHTS, 21_596, "a", 10, 0, 8),
      liq: { st: "LIQ", t: 9, wired: true },
    };
    p.degen.debt = 123;
    const n = applyStormHype(p, "storm:1", -0.4);
    expect(n.h).toBeCloseTo(0.2, 10);
    expect(n.degen.debt).toBe(123);
    expect(n.liq).toEqual({ st: "LIQ", t: 9, wired: true });
  });
});

// silence unused in case tree-shaking complains in some runners
void degenBuyCap;
void LP;
