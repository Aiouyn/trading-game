# Work order 74: work and options in Quay

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `docs/DESIGN.md`, `src/server/`, `src/shell/`, and work order 73 with the career commands and `career` field it added to `sim/server.ts` (`jobs`, `apply`, `quit`, `ask raise`, `study`; options listed from day 1).

You own a new `src/apps/careers` (register it in `src/shell/registry.ts` and `appModules.ts`; keep every entry when you rebase), the options part of `src/apps/broker`, and the interrupt list in the shell. Do not change `sim/modules`.

## Build

1. **Careers app**: your job, wage, tenure and performance with a "why"; open positions grouped by role with your chance in words; apply with one click and see the pending answer; ask for a raise; quit with a confirmation that shows what you lose; study with cost and time. Letters from employers appear here too.
2. **Options in Broker**: a chain view (strike rows, call and put columns, bid and ask, expiry tabs), a payoff diagram for the chosen contract before you buy, your open contracts with value and days left, and close.
3. **Requests that wait on you**: an invitation or a loan request with a deadline shows in the top bar and, if from family or a close friend, pauses time like the other interrupts.
4. Desktop and phone.

## Done

Play a sandbox: change job once, ask for a raise, buy a call from the chain, see its payoff, close it. `npx tsc --noEmit` has no errors in `src/`. Screenshots `docs/design/quay-careers.png` and `docs/design/quay-options.png`. Commit after `git pull --rebase`, push to v1-build, reply with paths and cost. Then stop. No test suites, no docs.
