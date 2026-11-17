# Work order 65: simulation fixes from the playtests

Read `AGENTS.md`, `sim/README.md` and every `sim/playtest/agent-*.md`. You own `sim/modules/player/` and `sim/modules/banking/`. Do not change `src/` or `ui/`.

## Fix

1. A margin account opened with `borrow` reports a lending limit of $0.00 for a player who holds collateral. Find the cause and fix it: the limit is what the collateral would fetch, less a haircut.
2. The weekly story repeats routine lines (the weekly wage, the same firm cutting jobs twice): fold repeats into one line per month and rank by money at stake for the player.
3. `why cash` and `why <number>` explain the player's own number (their wage, their purchase), never a stranger's.
4. Every other bug in the three agent playtests that still reproduces after `git pull`: reproduce it with a script first, then fix it at its cause.

## Done

`node sim/run.ts --years 10` prints "Books balanced every day"; save and reload match. Commit after `git pull --rebase`, push to v1-build, reply with each fix's before and after script output and your cost. Then stop.
