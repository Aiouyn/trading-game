# Work order 90: plans that fit the person

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `sim/modules/circle/plans.ts`, `src/apps/diary/`, and the screenshots `docs/design/quay-diary*.png` (work order 87, commit aca0039b).

You own `sim/modules/circle/` and `src/apps/diary/`. Other agents are editing `sim/server.ts`, `src/shell/`, `sim/modules/media/`, `markets/`, `corporate/` and `property/`: do not touch those. Run Quay with `next dev --webpack`.

## Fix

1. **Costs fit the life**: a player with $1,291 is asked to pay $400 for leaving drinks. Price each plan from the place and the player's means: a pint at the office tap costs a pint, a dinner costs what that restaurant costs, a gala ticket is expensive and only offered once the player can afford it. Friends with less money pick cheaper places, and rich contacts pick dearer ones. A player who can't afford something is invited somewhere cheaper, or offered "I'll get this one" by a friend.
2. **Diary entries read like a diary**: show the cost once, not "$400.00 It costs $400.00". Name links use the Quay tokens, not browser blue. City dates such as earnings season don't get a "Who comes: The listed firms" line: show only the lines that mean something for that kind of entry. Truncated banner text ends cleanly, at a word.
3. **Variety**: a sociable player's month should mix friends, family, work and the city, rather than the same three names at every dinner.
4. Keep the books balanced and the run deterministic.

## Done

New screenshots over the old `docs/design/quay-diary*.png` files, desktop and phone. `npx tsc --noEmit` has no errors in `src/`, and `node sim/run.ts --years 10` shows "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
