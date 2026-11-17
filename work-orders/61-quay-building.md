# Work order 61: Quay building apps (Wall Street Raider territory)

Read `AGENTS.md` (including the Next.js block: read `node_modules/next/dist/docs/` before touching routing), `sim/README.md`, `docs/DIRECTION.md` (surface rule: words first, numbers on hover, "why?" on every number), `docs/DESIGN.md` (Ink & Brass) and how work order 59 wired Quay to the simulation (`src/server/`, `src/shell/`, `src/apps/broker`). Quay is the V1 look: build in its components, tokens and window system, at desktop and phone width. Data comes from `sim/server.ts` (`/view`, `/panel`, `/act`, `/explain`, `/firm`, `/person`); you may add fields to its responses, never change simulation behaviour. Register new apps in `src/shell/registry.ts` and `src/shell/appModules.ts`; other agents add theirs at the same time, so keep every entry when you rebase. Every action goes through `/act` with the same commands the text game uses.

You own `src/apps/businesses`, `src/apps/company`, `src/apps/property`, `src/apps/bank`, `src/apps/funds`, `src/apps/insurance`.

## Build

1. **Businesses**: every firm in the city (sector, size, owner, chief, profit, listed or not), with a firm page (accounts, staff, plants, suppliers, holders, board) and the actions: found a firm, bid for a firm (friendly or hostile), buy a division.
2. **Company**: the firms you run or control: set strategy (prices, hiring, investment, dividends), appoint a chief, take it public, sit on boards, defend against a bid.
3. **Property**: homes for sale and to let on a district list, your homes, bid, sell, let, move, mortgage.
4. **Bank & Credit**: your deposits and loans, borrow and repay, the margin account with its real limit, interest, and the bank's own health.
5. **Funds** (invest in the city's funds) and **Insurance** (insure a home or a firm, see claims).

## Done

`npm run dev`, start a scenario, use each app for its main action, and it shows the result from the simulation. `npx tsc --noEmit` passes. Commit after `git pull --rebase`, push to v1-build, reply with one screenshot per app saved under `docs/design/quay-<app>.png` and your cost. Then stop. No test suites, no docs.
