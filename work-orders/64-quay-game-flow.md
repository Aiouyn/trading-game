# Work order 64: the game around the apps

Read `AGENTS.md` (including the Next.js block: read `node_modules/next/dist/docs/` before touching routing), `sim/README.md`, `docs/DIRECTION.md` (surface rule: words first, numbers on hover, "why?" on every number), `docs/DESIGN.md` (Ink & Brass) and how work order 59 wired Quay to the simulation (`src/server/`, `src/shell/`, `src/apps/broker`). Quay is the V1 look: build in its components, tokens and window system, at desktop and phone width. Data comes from `sim/server.ts`; you may add fields to its responses, never change simulation behaviour. Other agents are building apps in `src/apps/*` at the same time and registering them in `src/shell/registry.ts` and `src/shell/appModules.ts`: keep every entry when you rebase.

You own `src/components/shell`, the pages and layout in `src/app/`, and the shell's top bar, dock, launcher and notifications.

## Build

1. **The goal is always visible**: the scenario goal, progress and time left in the top bar; a milestone toast at each quarter of the goal.
2. **Interrupts that matter**: margin call, a takeover bid for your firm, arrest, a death in the family, a strike at your employer, scenario milestones: a modal that pauses time, shows the event, its "why" and the actions you can take.
3. **End screens**: win and loss with the score, the story of your run in five lines with their causes, the challenge code to share, and play again.
4. **First minute**: on a new game the desktop opens with Portfolio, Wire and Academy laid out, and one line telling the player what to do first.
5. **Phone**: the home screen tiles come from the registry, every built app opens full screen at 390 px wide, and the dock holds Broker, Portfolio, Wire, Messages.
6. **Command bar (Ctrl K)**: search apps, tickers, people and firms, and type any text-game command directly.

## Done

`npm run dev`, play "First paycheck" to its end screen, with one interrupt seen on the way. `npx tsc --noEmit` passes. Commit after `git pull --rebase`, push to v1-build, reply with screenshots of the top bar with the goal, an interrupt, and an end screen saved under `docs/design/quay-flow-*.png`, and your cost. Then stop. No test suites, no docs.
