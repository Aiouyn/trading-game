# Work order 76: second play-through of everything

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `docs/DESIGN.md`, `src/server/`, `src/shell/`. Since the last play-through, the game gained: a living circle (letters, loans, dinners, rivals, allies) with Messages and People apps; careers (jobs, apply, raise, quit, study) with a Careers app; an option chain with payoff; margin calls, forced sales and personal bankruptcy through a court; six retuned scenarios.

You own `src/`. You may add fields to `sim/server.ts` responses, never change simulation behaviour in `sim/modules`.

## Do

1. **Play with Playwright, one browser at a time.** Every one of the six scenarios for its first ten game-minutes (pick each from the title screen). Then one sandbox for three game-years, played as a reckless trader on margin until a margin call and a bankruptcy happen, and one as a careful saver who changes jobs, studies, answers every letter for a year and buys a home.
2. **Friction list**: anything that confuses, does nothing, gives no feedback, hides a cause, breaks at 390 px, or makes the world feel dead (long stretches where nothing on screen changes, letters you cannot find, people you cannot reach).
3. **Fix** in `src/`, worst first. The margin call, the forced sale and the bankruptcy must be impossible to miss and fully explained (what was sold, at what price, why, what you owe, what you can still do). The scenario end screens must tell the story of the run.
4. Replay what you fixed.

## Done

`npx tsc --noEmit` has no errors in `src/`. Commit after `git pull --rebase`, push to v1-build, reply with the friction list (fixed, or why not, and any simulation gap you found for the next order) and your cost. Then stop. No test suites, no docs.
