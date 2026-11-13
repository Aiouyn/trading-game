# Work order 19: twice as fast, same world

You may change the internals of any module and the kernel, but nothing a run produces may change: `node sim/run.ts --years 2 --seed 1` must print the same state hash before and after your work (with `SIM_POP=20000` and with `SIM_POP=200000`), and save and reload must still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`). Run `git pull --rebase` often: other agents are adding modules at the same time, so measure the hash on the current tip before you change anything, and re-measure after each rebase. Read `AGENTS.md` and `sim/README.md` first.

## Why

The goal is hundreds of thousands of people. At 200,000 people one simulated year takes 33 seconds now (it was 14 before the last two waves added modules). A 100-year world history at 500,000 people should take minutes, not hours.

## Build

1. Profile first: `SIM_POP=200000 node --cpu-prof sim/run.ts --years 1 --seed 1`, then read the profile. Today the top costs are social (conversations, `bumpPair`, news reactions `react`/`reactUnaware`/`forHolders`), property (`monthEnd`: `collectRent`, `shiftAll`, `cheapest`), the economy's day close, and ledger name lookups (`netWorth`, `balance`, `st`).
2. Typical wins: replace string actor names with ledger slots in loops over people or parcels; replace whole-population scans done per event with indexes kept up to date (who lives where, vacant parcels by rent, holders by stock); avoid allocating arrays and strings inside daily loops; keep data that is read together side by side in typed arrays.
3. Any cache must live in the saved state (`w.state`), or be rebuilt identically after a reload, or be cleared before the day ends. Module-level variables that carry world data break save and reload.

## Done

At 200,000 people, 2 years with all modules take under 40 seconds (about 18 seconds a year), with the same hashes as before your work and save and reload still matching. Commit after `git pull --rebase`, push, and reply with the before and after timings, the hashes, the top ten costs before and after, and your cost. Then stop.
