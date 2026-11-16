# Work order 59: Quay runs on the simulation

The V1 look is the Quay shell in `src/` (Next.js): the desktop with movable windows and the dock, the phone home screen with app tiles, the palettes in Settings (Ink & Brass is the default, Broadsheet, Phosphor and Riviera stay as options). Today Quay runs on the old November engine in `src/server/`. The world is now `sim/`. This order connects them, so that every later screen order builds on real data.

Read `AGENTS.md` (including the Next.js block: this Next version differs from your training data, read `node_modules/next/dist/docs/` before touching routing or server code), `sim/README.md`, `docs/DIRECTION.md`, `docs/DESIGN.md` (Ink & Brass), and `sim/server.ts` (its JSON API: `/scenarios`, `/start`, `/load`, `/continue`, `/view`, `/panel?name=`, `/act`, `/explain/<id>`, `/firm/<key>`, `/person/<i>`, `/events`, `/save`, `/speed`).

You own `src/server/`, `src/app/api/`, `src/shell/` (channels, store, registry, loader) and the three existing app bodies `src/apps/broker`, `src/apps/portfolio`, `src/apps/wire`. Do not change `sim/` except to add a field to a `sim/server.ts` response when Quay needs data the simulation already has.

## What to build

1. **One process for the player.** `npm run dev` (and `npm run start`) also starts `sim/server.ts` on an internal port, and the Next API routes call it. Quay's own server engine, auth, accounts, alliances, telemetry and the demo balance are not used in V1: single-player, local, no sign-in. Remove them from the request path (leave the files, don't delete history).
2. **Channels from the simulation.** `clock` from the sim day and speed; `me` from the player's view (net worth, today's change, the six stats with their dollars); `rank` from net worth thresholds (keep the names Broke → Dynasty); live updates through `/events` instead of polling.
3. **A start.** Quay opens on the scenario choice (scenarios, sandbox, continue, load, challenge code) in Quay's own look, with the history being written as the world is generated, then lands on the desktop.
4. **Broker, Portfolio and Wire on real data.** Broker trades every listed stock through `/act` (prices, the order book, the player's order states, fills), Portfolio shows the player's real balance sheet (shares, bonds, futures, options, coins, property, loans), and the Wire is the simulation's news and the player's story, where every item opens its cause chain from `/explain`.
5. **Time in the top bar.** Pause, 1 day, 1 week, 1 month, with auto-pause on the events `sim/server.ts` already flags.

## Done

`npm run dev`, open the page: choose "First paycheck", the desktop opens, buy a share in Broker, it appears in Portfolio at the simulation's price, skip a month, a Wire item opens its "why". `npx tsc --noEmit` passes for `src/`. `node sim/run.ts --years 3` still prints "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, reply with how to start it, 3 screenshots (desktop, phone width, the scenario choice) saved under `docs/design/quay-sim-*.png`, and your cost. Then stop. No test suites, no docs.
