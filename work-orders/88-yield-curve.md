# Work order 88: a believable yield curve

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/bonds/` and how `sim/modules/economy/` sets the policy rate (work order 84, commit d9d94f7b, just rebalanced inflation).

You own `sim/modules/bonds/`. Work order 85 is editing `markets/`, `corporate/` and `property/` at the same time: do not touch those.

## The problem

With inflation around 3% and a policy rate of 5–7%, the 10-year yield sits at 8–15%. That is a term premium of 3–8 points, so long bonds are absurdly cheap and the curve is steep in every year.

## Do

1. Print, per year on seeds 1–6, the policy rate, inflation, and the 2y, 5y, 10y and 30y yields, plus the corporate bond spreads by rating.
2. Price the curve as expected future policy rates plus a modest term premium (about 0–1.5 points at 10 years, higher when inflation is volatile). The curve should invert before some recessions, steepen as rates are cut, and the 10y should mostly sit within about 1.5 points of the policy rate. Spreads should widen in downturns and for weaker issuers, with defaults when they happen.
3. Bond prices, coupons and accrued interest stay consistent with the yields. Keep the books balanced and the run deterministic.

## Done

Paste the per-year table for seeds 1–6, before and after. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
