// T0 A/B verdict (Producer's ruling on #60): medians of the same-job samples, this branch <= 1.1 x main.
// A pure module so a unit test pins "median, not mean" (QA follow-up on card 2).
export const RATIO_MAX = 1.1;

/** Middle sample of an odd-sized set (the A/B takes 5 per arm). */
export function median(xs: number[]): number {
  if (xs.length % 2 !== 1) throw new Error(`median needs an odd sample count, got ${xs.length}`);
  return [...xs].sort((a, b) => a - b)[(xs.length - 1) / 2];
}

export function abVerdict(main: number[], pr: number[]) {
  const mMain = median(main), mPr = median(pr);
  const limit = Math.round(mMain * RATIO_MAX * 10) / 10;
  return { mMain, mPr, limit, ratio: mPr / mMain, pass: mPr <= limit };
}
