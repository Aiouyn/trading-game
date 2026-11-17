# Work order 92: a city that opens in balance

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/worldgen.ts`, `sim/modules/economy/` and `sim/modules/labour/`.

You own `sim/worldgen.ts`, `sim/modules/economy/` and `sim/modules/labour/`. Work order 91 (sim speed) may also touch these files: keep both sides on any rebase conflict and do not undo its performance changes.

## The problem

Every new world opens out of balance. In its first month 58 firms miss their sales plan and cut about 400 jobs, and unemployment jumps from 6.6% to 9.7% by day 29. Year 1 then starts with unemployment at 8–11% on every seed and the bank cutting rates. A new player's first headlines are mass layoffs before they have done anything.

## Do

1. Find the mismatch: opening staff, inventory and sales plans against the demand the households actually have in month one (wages, savings, prices, the stimulus that work order 84 ended).
2. Generate the world already near its steady state: firms staffed and stocked for the demand they will see, unemployment at about 4–6%, inflation near 2%, and the policy rate near neutral. Shocks and recessions still come later on their own.
3. Across seeds 1–6, month 1 should show no wave of layoffs, and year 1 should have unemployment at 4–7% and inflation at 1–3%. Years 2–10 should keep the variety from work order 84.
4. Keep the books balanced and the run deterministic.

## Done

Paste per-month unemployment, inflation and layoffs for year 1, and the per-year table for seeds 1–6, before and after. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
