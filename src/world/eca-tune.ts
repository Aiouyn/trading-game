/**
 * The ECA's tunable detection and penalty knobs (lead-phase6.md 6C, rulings R-6C-2 to R-6C-4). Production runs these defaults.
 * The harness (scripts/eca-harness.ts) sets them for its tuning runs only, so the tuned values are visible in one place and the
 * spec constants (bars, caps, repeat factor, season cap) stay in court.ts and eca.ts.
 */
export const ECA_TUNE = {
  /** surveillance points for a tip-flagged trade of the account's median size (R-6C-3: the size factor is log-shaped on top) */
  tipBase: 44,
  /** the score line for an inquiry (03 §10.2), and the investigation line when the account received a tip */
  inquiryScore: 60,
  /** the insider fine multiple k (R-6C-2): fine = k × gain, with the $1,000 floor and the 35%-of-net-worth cap */
  insiderK: 1.5,
  /** the logistic slope of the tribunal, in evidence points per logit (R-6C-4); 12 was the first pass's hard-coded value */
  tribunalSlope: 12,
};
