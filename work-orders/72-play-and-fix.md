# Work order 72: play Quay like a new player, and fix what breaks

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `docs/DESIGN.md`, `app/` (work order 70: the launcher builds and starts Quay with the simulation) and `src/server/`, `src/shell/`. Quay is the finished V1 look; you are its first real player.

You own `src/` (apps, shell, components, server adapters). You may add fields to `sim/server.ts` responses, never change simulation behaviour in `sim/modules`.

## Do

1. **Play, with Playwright driving the real game** (one browser at a time, screenshot as you go): a full "First paycheck" run to its end screen as a newcomer who reads only what is on the screen; then a sandbox for two game-years where you take a job, buy shares, take a margin loan, buy a home with a mortgage, answer three letters, lend to a friend, go to a dinner, open an option, and read the "why" of three numbers. Then the same first ten minutes at phone width.
2. **Write down every moment of friction**: a dead button, an action with no feedback, a number with no explanation, a screen that does not say what to do next, a slow response, an error, a layout that breaks, a text that confuses. Keep the list in your reply, not in a file.
3. **Fix them**, most damaging first, in `src/`. Every action gives feedback within a second (pending, done, failed with the reason). Every screen says what you can do next. Nothing is a dead end.
4. Replay the parts you fixed to confirm.

## Done

`npx tsc --noEmit` has no errors in `src/`. Commit after `git pull --rebase`, push to v1-build, reply with the friction list (fixed or not, and why not) and your cost. Then stop. No test suites, no docs.
