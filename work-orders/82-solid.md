# Work order 82: solid enough to ship

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `app/` (the launcher and `app/build-quay.ts`), `src/server/`, `src/shell/`, `sim/server.ts`. Early access players will play for hours, close the window mid-month, run old saves, and judge us on the first crash.

You own `src/server/`, `src/shell/` data code, `sim/server.ts`, `app/`. Do not change `sim/modules` behaviour.

## Do

1. **Long session**: on the production build (`app/build-quay.ts`, then the launcher), play a sandbox for 10 game-years at the fastest speed with Portfolio, Wire, Messages and Society open. Record the browser's JS heap and the sim server's memory every game-year, the time per game-month, and every console error or warning. Fix leaks (growing lists, intervals, listeners, caches without limits), slow renders, and every error.
2. **Robustness**: kill the sim server mid-month and restart it: Quay says so and recovers, with no lost save beyond the last autosave. Close the browser mid-action and reopen: Continue works. A save made before work orders 67–81 loads, or is refused with one clear sentence. Double-clicks, rapid key presses and two tabs on the same game do not corrupt state.
3. **Speed**: a game-day at the fastest speed must update the screen within 100 ms on this PC; `/view` must stay under 200 KB per tick (send deltas or trim lists if needed).
4. **Errors are human**: every server error reaches the player as one plain sentence with a next step, never a stack trace or "Failed to fetch".

## Done

Paste the per-year memory and speed table before and after, and the list of errors found and fixed. `npx tsc --noEmit` has no errors in `src/`. Commit after `git pull --rebase` (never commit `dist/` or `.next/`), push to v1-build, reply with that and your cost. Then stop. No test suites, no docs.
