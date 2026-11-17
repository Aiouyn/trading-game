# Work order 97: strategies in a growing economy

Read `AGENTS.md`, `sim/README.md`, `sim/bots/` and `sim/bots/bots-report.md`. Work order 95 (commit f8d18691) added productivity growth and credits the full payout in total return, and work order 96 (commit 230dad1d) made the run about twice as fast.

You own `sim/bots/`.

## Do

1. Re-run the bot report over 6 worlds and 10 years, with at most 3 workers.
2. Compare with the table from work order 85 in `bots-report.md`. Targets: the index about 6–9% a year, value and momentum within a few points of it, the gambler usually ruined, the raider rich in some worlds and ruined in others but never both at once, and the landlord positive in most worlds.
3. If a bot misreads the new numbers (for example the total-return field), fix the bot. If a strategy result looks wrong because of the simulation itself, describe it in one line per problem in the report. Do not change sim modules.

## Done

Paste the new table and the list of problems. Commit the updated `bots-report.md` after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
