# Work order 53: speed, round 4

Read `AGENTS.md` and `sim/README.md` first. You may change any module, but only for speed: the world must come out identical.

## The problem

At 200,000 people a simulated year takes about 26 seconds; the target is 18. The README says about a quarter of the time is social (conversations, news reactions) and a sixth is property (monthly rent, moves).

## What to do

1. **Measure the state hashes first**, on the current tip, before you change anything: `SIM_POP=200000 node sim/run.ts --years 2 --seed 1` and `--seed 2`, and `node sim/run.ts --years 10 --seed 1` at the default population. Record each final state hash. Re-check them after every `git pull --rebase`: other agents change behaviour, so re-measure on their tip before comparing.
2. **Profile** with `node --cpu-prof` at 200,000 people for 2 years and rank the top 15 functions by self time.
3. **Fix the biggest costs structurally**: work only on people involved in something (the Dwarf Fortress rule in the README), no per-person objects, Maps or closures in daily loops, no scans of all people where an index or a list of active people would do, and daily work that only needs to run weekly or monthly moved there only if the hashes stay identical.
4. Update the Scale table in `sim/README.md` with the new numbers.

## Targets

200,000 people at 18 seconds per simulated year or less, measured over 2 years; identical state hashes on all three runs; memory no higher than now.

## Done

Books balanced every day; identical hashes; commit after `git pull --rebase`, push to v1-build, and reply with the before and after seconds per year, the profile's top 5 before and after, and your cost. Then stop.
