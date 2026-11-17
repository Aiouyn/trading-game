# Work order 63: Quay world apps

Read `AGENTS.md` (including the Next.js block: read `node_modules/next/dist/docs/` before touching routing), `sim/README.md`, `docs/DIRECTION.md` (surface rule: words first, numbers on hover, "why?" on every number), `docs/DESIGN.md` (Ink & Brass) and how work order 59 wired Quay to the simulation (`src/server/`, `src/shell/`, `src/apps/broker`). Quay is the V1 look: build in its components, tokens and window system, at desktop and phone width. Data comes from `sim/server.ts` (`/view`, `/panel`, `/act`, `/explain`, `/firm`, `/person`); you may add fields to its responses, never change simulation behaviour. Register new apps in `src/shell/registry.ts` and `src/shell/appModules.ts`; other agents add theirs at the same time, so keep every entry when you rebase. Every action goes through `/act` with the same commands the text game uses.

You own `src/apps/city`, `src/city/`, `src/apps/civic`, `src/apps/legal`, `src/apps/institutions`, `src/apps/wire`.

## Build

1. **City**: the existing district view (`src/apps/city`, `src/city/`) on the simulation's real districts, parcels, homes, firms' plants and the port; click a parcel for who owns and lives there.
2. **Institutions (the economy)**: unemployment, inflation, policy rate, GDP, the yield curve, the exchange rate and the power price, each with a chart and "why"; the central bank's last decision with its reasons.
3. **Civic**: parties, politicians, polls, the next election, the government's taxes and spending; donate, vote.
4. **Legal**: open investigations and trials, the regulator's people, your own record, a lawyer.
5. **Wire**: filters (you, contacts, holdings, city, markets), and each item opens its cause chain.

## Done

`npm run dev`, start a scenario, use each app for its main action, and it shows the result from the simulation. `npx tsc --noEmit` passes. Commit after `git pull --rebase`, push to v1-build, reply with one screenshot per app saved under `docs/design/quay-<app>.png` and your cost. Then stop. No test suites, no docs.
