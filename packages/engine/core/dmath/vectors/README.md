# dmath reference vectors (T02-02, T02-03)

One file per function: `exp.vec expm1.vec ln.vec log1p.vec log2.vec log10.vec pow.vec tanh.vec sigmoid.vec`, then (T02-03) `sin.vec cos.vec atan.vec atan2.vec erf.vec erfc.vec normCdf.vec normInv.vec lgamma.vec`.

- **Format:** `canonEncode({ fn, inputs, expected })`. `inputs` is an array of argument arrays (`[x]`, or `[x, y]` for `pow`) and `expected` holds one value per input. Every double is stored as its IEEE-754 binary64 bit pattern (u64 `bigint`), so the files round-trip exactly.
- **Expected values:** the reference (`tools/dmath-ref`) rounded correctly, half-even, to binary64. The reference uses a 256-bit-mantissa `BigFloat` on bigint:
  - exp reduces by ln 2 (ln 2 = Σ 1/(k·2^k)) and sums the Taylor series until terms fall below 2^-300.
  - ln is Newton on refExp; pow is refExp(y·refLn(x)).
  - expm1 and log1p use their direct series near 0, so tiny inputs don't lose precision to cancellation.
  - tanh is expm1(2x)/(expm1(2x)+2).
  - sigmoid is 1/(1+e^-x).
  - Ranges whose binary64 value is a constant are returned directly: |x| ≥ 40 for tanh, |x| ≥ 800 for sigmoid.
- **Inputs:** 10,000 per function from a fixed xorshift32 sequence. Seed 20202 is XOR'd with a per-function constant. The inputs are listed edge points (0, ±5e-324, ±1, the domain ends, branch thresholds), then alternate uniform draws over the domain with log-uniform magnitudes of both signs. For ln, log2 and log10 every 4th point sits at 1 ± 10^[-16, -1]. pow uses x log-uniform in [1e-10, 1e10] and y with |y·ln x| ≤ 700; every 8th y is an integer with |y| ≤ 64.
- **golden.sha256:** SHA-256 over the concatenated big-endian bit patterns of the **engine** `dmath` outputs on every vector, in the order above. `exp.test.ts` recomputes it, so any platform or Node difference fails (20B runs it on arm64).

T02-03 references (`ref-trig.ts`, `ref-special.ts`):
  - π comes from Machin's formula in 300-bit fixed point. sin and cos are reduced exactly against it and then summed as Taylor series.
  - atan reduces |x| > 1 to 1/x, shifts by π/6 above tan(π/12), then uses the odd series.
  - erf uses its Maclaurin series for |x| < 3. erfc uses the Laplace continued fraction beyond that, with the term count doubled until two values agree to 2^-280.
  - normCdf is ½·erfc(−x/√2), with the division done in BigFloat.
  - normInv takes 5 Newton steps on the reference normCdf, starting from the engine's AS241 value.
  - lgamma shifts the argument to ≥ 40 and applies Stirling with exact Bernoulli numbers.

Regenerate (vectors + golden; about 5 min, mostly normInv):

```
npx tsx tools/dmath-ref/gen-vectors.ts [count=10000] [seed=20202]
```

Changing dmath intentionally changes `golden.sha256`. Regenerate it and justify the change in the PR. The vector files only change if the reference or the input generator changes.
