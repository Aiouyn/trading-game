# Work order 60: Quay trading apps

Read `AGENTS.md` (including the Next.js block: read `node_modules/next/dist/docs/` before touching routing), `sim/README.md`, `docs/DIRECTION.md` (surface rule: words first, numbers on hover, "why?" on every number), `docs/DESIGN.md` (Ink & Brass) and how work order 59 wired Quay to the simulation (`src/server/`, `src/shell/`, `src/apps/broker`). Quay is the V1 look: build in its components, tokens and window system, at desktop and phone width. Data comes from `sim/server.ts` (`/view`, `/panel`, `/act`, `/explain`, `/firm`, `/person`); you may add fields to its responses, never change simulation behaviour. Register new apps in `src/shell/registry.ts` and `src/shell/appModules.ts`; other agents add theirs at the same time, so keep every entry when you rebase. Every action goes through `/act` with the same commands the text game uses.

You own `src/apps/markets`, `src/apps/broker`, `src/apps/portfolio`, `src/apps/risk`.

## Build

1. **Markets**: a board of every listed stock (last, change, volume, P/E, sparkline, your position), sortable, with sector filters; a stock page with a price chart (daily closes), the order book, profit, staff, top holders, the latest news and "why did it move".
2. **Broker for every asset**: stocks, government bonds (by maturity, with the yield curve), commodity futures, options (chain by strike and month, calls and puts, write with margin), crypto and memecoins, and foreign currency. One ticket shape, a preview of cost and margin, order states.
3. **Portfolio**: every position across asset classes with P&L, loans and margin used, a net-worth chart over time, and fills.
4. **Risk** (when margin is open): margin used against the limit, the distance to a margin call, and the positions that would be sold first.

## Done

`npm run dev`, start a scenario, use each app for its main action, and it shows the result from the simulation. `npx tsc --noEmit` passes. Commit after `git pull --rebase`, push to v1-build, reply with one screenshot per app saved under `docs/design/quay-<app>.png` and your cost. Then stop. No test suites, no docs.
