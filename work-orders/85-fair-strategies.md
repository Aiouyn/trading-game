# Work order 85: strategies that make sense

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`, `sim/bots/` and `sim/bots-report.md` if present.

You own `sim/bots/`, `sim/modules/corporate/`, `sim/modules/property/` and `sim/modules/markets/`. Work order 84 changes `economy/` and `banking/` at the same time: do not touch those.

## The problem

In the last bot run (3 worlds, 10 years), the raider showed a 10x median while going bankrupt in all 3 worlds, which cannot both be true. The gambler also went bankrupt in all 3, and the landlord lost 8.8% a year before the latest housing fix. A player who copies any sensible real-world strategy should get a believable result.

## Do

1. Run the bot report with at most 3 workers. Find out why the raider's numbers contradict each other (a reporting bug, net worth counted wrongly after bankruptcy, a takeover that creates value from nothing) and fix the real cause.
2. Re-run the landlord after the housing fix (commit 3885fb55). A careful landlord with modest leverage should roughly match inflation plus rent yield, and a heavily leveraged one should sometimes be wiped out.
3. Targets over 6 worlds: the index about 5–9% a year, value and momentum within a few points of it, the gambler usually ruined, the raider rich in some worlds and ruined in others but never both at once, and the landlord positive in most worlds.
4. Keep the books balanced and the run deterministic.

## Done

Paste the bot table before and after. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
