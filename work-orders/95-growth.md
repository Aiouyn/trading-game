# Work order 95: an economy that grows

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/content/goods.txt`, `sim/modules/economy/`, `sim/modules/markets/` and `sim/modules/earnings/`.

You own `sim/content/`, `sim/modules/economy/`, `sim/modules/markets/` and `sim/modules/earnings/`.

## The problem

A broad stock index returns only 3.6% a year in price and 4.5% in total over 10 years, at P/E 8–11. The sim has no productivity growth: output per worker is fixed in `sim/content/goods.txt` and margins are fixed at a 1.2 markup. Real profits are flat, earnings only track nominal GDP (about 3% a year), and the total-return series in `markets/` credits only 0.35 of the payout.

## Do

1. Add slow productivity growth, about 1–2% a year on average, varying by sector (tech fast, utilities slow) and by firm (good and bad managers, investment in machines). Real wages rise with it over the years, and firms that don't keep up lose share.
2. Fix the total-return series so it credits the whole payout, or explain why 0.35 is right.
3. Targets over seeds 1–6, 10 years: real GDP growth about 1.5–3% a year on average, a broad index total return about 6–9% a year with real drawdowns in recessions, a P/E mostly in the 12–20 range, and inflation and unemployment still within work orders 84 and 92's ranges (year 1 calm).
4. Keep the books balanced and the run deterministic.

## Done

Paste per-year GDP growth, productivity, real wages, index level and P/E for seeds 1–6, before and after. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
