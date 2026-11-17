# Work order 62: Quay life apps

Read `AGENTS.md` (including the Next.js block: read `node_modules/next/dist/docs/` before touching routing), `sim/README.md`, `docs/DIRECTION.md` (surface rule: words first, numbers on hover, "why?" on every number), `docs/DESIGN.md` (Ink & Brass) and how work order 59 wired Quay to the simulation (`src/server/`, `src/shell/`, `src/apps/broker`). Quay is the V1 look: build in its components, tokens and window system, at desktop and phone width. Data comes from `sim/server.ts` (`/view`, `/panel`, `/act`, `/explain`, `/firm`, `/person`); you may add fields to its responses, never change simulation behaviour. Register new apps in `src/shell/registry.ts` and `src/shell/appModules.ts`; other agents add theirs at the same time, so keep every entry when you rebase. Every action goes through `/act` with the same commands the text game uses.

You own `src/apps/profile`, `src/apps/estate`, `src/apps/messages`, `src/apps/academy`, and a new `src/apps/health`.

## Build

1. **Profile**: you as a person: age, job, the six stats as words with trend arrows and the dollars on hover, each with its "why", choices with their costs and cooldowns (holiday, clinic, overtime, donate, lawyer), and your life story so far (the chronicle export).
2. **Estate and family**: spouse, children and their schooling, the family tree, your will, heirs and the dynasty score; marry, have a child, write the will, hand over to an heir.
3. **Messages and contacts**: every contact with the relationship as a sentence ("Kela trusts you; you work together"), what they have told you, talk, ask, tip off a journalist; rumours you have heard and who told you.
4. **Health**: your health, hospital visits, medical debt, epidemics in the city.
5. **Academy**: the tutorial steps from `view().tutorial` as an unobtrusive checklist with one hint at a time, and the `help` topics, searchable.

## Done

`npm run dev`, start a scenario, use each app for its main action, and it shows the result from the simulation. `npx tsc --noEmit` passes. Commit after `git pull --rebase`, push to v1-build, reply with one screenshot per app saved under `docs/design/quay-<app>.png` and your cost. Then stop. No test suites, no docs.
