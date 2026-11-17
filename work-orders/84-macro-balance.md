# Work order 84: an economy that settles

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/modules/economy/`, `sim/modules/banking/`.

You own `sim/modules/economy/` and `sim/modules/banking/`.

## The problem

Seed 1 runs CPI inflation of 14.6% in year 4 and then 8–10% for years, with the policy rate at 14–16%. A real central bank with a 2% target brings inflation back within 2–3 years, and a world that stays in a 1970s-style crisis for a decade makes every strategy except cash look broken.

## Do

1. Run `node sim/run.ts --years 10` on seeds 1–6 and print, per year: CPI inflation, policy rate, unemployment, GDP growth and the 10-year bond yield. Find what keeps inflation high (a wage–price loop, money growth, energy pass-through, a policy rule that reacts too slowly or overshoots).
2. Fix the cause, not the symptom. Shocks should still happen (an energy spike, a boom, a recession), but each one ends. Across the six seeds: average inflation 1.5–4%, no year above 12%, policy rate mostly 1–8%, unemployment 3–12%, and at least one recession in about half the worlds.
3. Keep the books balanced and the run deterministic.

## Done

Paste the per-year table for seeds 1–6, before and after. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
