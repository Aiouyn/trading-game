// Launchpad curve rules (lead-launchpad.md L3, reused constants): integer cents and tokens, rounding in the curve's
// favour, so X·Y never drops below X0·Y0 and the curve's real cash always covers selling everything sold; fees split exactly.
import { describe, expect, it } from "vitest";
import { LP, POOL_FEE_TEXT, curveLeft, feeOf, marketCapCents, poolFee, priceText, quoteBuy, quoteSell, type Curve } from "@/launchpad/rules";
import { CURVE } from "@/launchpad/curve";
import { FEE_BP, exchangeFeeMinor } from "@/shell/contracts/mockFeed";

const k = (c: Curve) => BigInt(c.x) * BigInt(LP.Y0 - c.sold);
const K0 = BigInt(LP.X0) * BigInt(LP.Y0);

describe("Launchpad curve", () => {
  it("starts at the p10 price: $15,000 / 1.073B tokens, market cap about $13,979.50", () => {
    const c = { x: LP.X0, sold: 0 };
    expect(priceText(c)).toBe("$0.00001398");
    expect(marketCapCents(c)).toBe(1_397_949);
  });

  it("a $100 buy: 1% fee ($1.00, 50¢ to the creator), the rest into the curve, tokens rounded down", () => {
    const q = quoteBuy({ x: LP.X0, sold: 0 }, 10_000);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect([q.fee, q.creatorFee, q.net]).toEqual([100, 50, 9_900]);
    expect(q.tokens).toBe(LP.Y0 - Math.ceil(Number(K0) / (LP.X0 + 9_900)));
    expect(q.next).toEqual({ x: LP.X0 + 9_900, sold: q.tokens });
  });

  it("X·Y stays ≥ X0·Y0 and the curve's real cash covers every sale, over many random trades; selling all returns it to X0", () => {
    let c: Curve = { x: LP.X0, sold: 0 };
    let seed = 7;
    const rnd = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 2_000; i++) {
      if (rnd() < 0.6 || c.sold === 0) {
        const q = quoteBuy(c, 100 + Math.floor(rnd() * 200_000));
        if (q.ok) c = q.next;
      } else {
        const q = quoteSell(c, 1 + Math.floor(rnd() * c.sold));
        if (q.ok) { expect(q.gross).toBeLessThanOrEqual(c.x - LP.X0); c = q.next; }
      }
      expect(k(c) >= K0).toBe(true);
      expect(c.x).toBeGreaterThanOrEqual(LP.X0);
    }
    const all = quoteSell(c, c.sold);
    expect(all.ok && all.next).toEqual({ x: LP.X0, sold: 0 });
  });

  it("refuses a buy under $1 and a sale of nothing or more than sold; a buy past the 800M is clipped to the last token (graduation)", () => {
    const c = { x: LP.X0, sold: 0 };
    expect(quoteBuy(c, 99)).toEqual({ ok: false, why: "MIN" });
    expect(quoteSell(c, 1)).toEqual({ ok: false, why: "NONE" });
    expect(curveLeft(c)).toBe(800_000_000);
    // Hand-worked: k = 1,500,000 × 1,073,000,000 = 1,609,500,000,000,000; the curve holds GRAD_Y = 273M tokens once its cash
    // is ceil(k / 273M) = 5,895,605¢, so it needs 4,395,605¢ net. The least outlay s with s − ceil(s/100) ≥ 4,395,605 is
    // 4,440,006¢ (fee 44,401¢, creator 22,200¢); 4,440,005¢ nets one cent short. A $100,000 order pays only that.
    expect(quoteBuy(c, 10_000_000)).toEqual({ ok: true, tokens: 800_000_000, spend: 4_440_006, fee: 44_401, creatorFee: 22_200, net: 4_395_605, next: { x: 5_895_605, sold: 800_000_000 }, graduates: true });
    expect(quoteBuy({ x: 5_895_605, sold: 800_000_000 }, 10_000)).toEqual({ ok: false, why: "CURVE_FULL" });
  });

  it("fee rounds up, the creator's half rounds down", () => {
    expect(feeOf(101)).toEqual({ fee: 2, creator: 1 });
    expect(feeOf(5_000)).toEqual({ fee: 50, creator: 25 });
  });
});

describe("graduated book fee = the Broker's taker fee (one source)", () => {
  it("poolFee is mockFeed's exchange fee at the taker rate, and the copy reads off it", () => {
    for (const n of [0, 1, 3_333, 33_333, 33_334, 50_000, 1_000_000, 4_339_661, 123_456_789]) expect(poolFee(n)).toBe(exchangeFeeMinor(n, FEE_BP.taker));
    expect(poolFee(10_000)).toBe(10); // $100 → 3¢ < min $0.10
    expect(POOL_FEE_TEXT).toBe("0.03% (at least $0.10)");
    expect(LP.X0).toBe(CURVE.X0); expect(LP.Y0).toBe(CURVE.Y0);
  });
});
