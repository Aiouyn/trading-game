/** Bounded extraction of core/dmath/exp.ts:18-22,29-53,183-187.
 * The web's ES2017 target cannot import its BigInt-literal bit helpers.
 * Here z is provably in [-16,8], so 2**k is exact normal power-of-two scaling.
 * Keep operation order identical to core exp; no host-libm Math.exp dependency.
 */
export function liquiditySigmoid(x: number): number {
    if (!Number.isFinite(x) || x < -16 || x > 8)
        throw new Error("LIQUIDITY_SIGMOID_DOMAIN");
    const v = x >= 0 ? -x : x, ln2 = .6931471805599453, k0 = Math.floor(v / ln2 + .5), k = k0 - v / ln2 === .5 && k0 % 2 !== 0 ? k0 - 1 : k0;
    const hi = v - k * .6931471803691238, lo = k * 1.9082149292705877e-10, r = hi - lo;
    const coeff = [.5, .16666666666666666, .041666666666666664, .008333333333333333, .001388888888888889, .0001984126984126984, .0000248015873015873, .0000027557319223985893, 2.755731922398589e-7, 2.505210838544172e-8, 2.08767569878681e-9, 1.6059043836821613e-10];
    let p = coeff[11];
    for (let i = 10; i >= 0; i--)
        p = p * r + coeff[i];
    const t = r * r * p, s = 1 + hi, e1 = (1 - s) + hi, e = (s + ((e1 - lo) + t)) * 2 ** k;
    return x >= 0 ? 1 / (1 + e) : e / (1 + e);
}
