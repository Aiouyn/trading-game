// Launchpad curve rules (lead-launchpad.md L3, reused constants): integer cents and tokens, rounding in the curve's
// favour, so X·Y never drops below X0·Y0 and the curve's real cash always covers selling everything sold; fees split exactly.
import { describe, expect, it } from "vitest";
import { LP, curveLeft, feeOf, marketCapCents, priceText, quoteBuy, quoteSell, type Curve } from "@/launchpad/rules";

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

  it("refuses a buy under $1, a sale of nothing or more than sold, and a buy past the 800M curve (graduation is not built)", () => {
    const c = { x: LP.X0, sold: 0 };
    expect(quoteBuy(c, 99)).toEqual({ ok: false, why: "MIN" });
    expect(quoteSell(c, 1)).toEqual({ ok: false, why: "NONE" });
    expect(quoteBuy(c, 10_000_000)).toEqual({ ok: false, why: "CURVE_FULL" });
    expect(curveLeft(c)).toBe(800_000_000);
  });

  it("fee rounds up, the creator's half rounds down", () => {
    expect(feeOf(101)).toEqual({ fee: 2, creator: 1 });
    expect(feeOf(5_000)).toEqual({ fee: 50, creator: 25 });
  });
});
