# Work order 75: numbers a banker would believe

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`. The writing pass printed headlines like "For Q1, The Daily Herald, the media firm, made $464 million" and "Titan Machine Works near $12,000,000" for a month, in a city of 5,000 people where a month's profit is usually near $300,000. Numbers like these break the feeling of a real economy.

You own `sim/modules/economy/`, `sim/modules/earnings/` and `sim/modules/corporate/`. Change behaviour only where a number is wrong at its cause; keep every other module as it is.

## Do

1. **An audit script** `sim/audit.ts`: run 20 years at the default population over 5 seeds (one at a time) and print, per year, the distribution (p1, p50, p99, max) of firm monthly profit, revenue, payroll, share price, price-to-earnings, wages, rents, home prices, household net worth, bank capital ratios, and GDP per head. Flag anything more than 20 times the median of its kind, and any series that grows faster than nominal GDP for 5 years running.
2. **Fix every flag at its cause**: a unit error (cents and dollars), a double count, a missing cost, a runaway feedback, a reporting bug in the headline. Explain each in one sentence.
3. Rerun and paste the before and after flags.

## Done

`node sim/run.ts --years 10` prints "Books balanced every day"; save and reload match. Commit after `git pull --rebase`, push to v1-build, reply with the before and after flags and your cost. Then stop.
