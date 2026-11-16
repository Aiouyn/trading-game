# Work order 56: one double-click to play

Read `AGENTS.md` and `sim/README.md` first. You own a new top-level folder `app/`, and may add a `--world <name>` option and a world-cache read to `sim/worldgen.ts`. Do not change modules, `ui/` or `sim/server.ts` (another agent owns them; you start it, nothing more).

## What to build

1. **Windows launcher** `app/Play Port Avalon.cmd` (and `app/play.sh` for Linux/macOS): finds a usable Node (22.6 or newer; uses `--experimental-strip-types` when below 22.18), or tells the player in one sentence where to get it; starts `node sim/server.ts`; opens the default browser on the game; closes the server when the window closes.
2. **Instant start.** Pre-generated worlds so a new game does not wait for 100 years of history: a script `app/make-worlds.ts` builds 6 worlds (seeds 1 to 6, the default population) into `app/worlds/`, and the server is told about them through an environment variable `PA_WORLDS` that the launcher sets. Do not commit the worlds if any file is above 50 MB; instead make the launcher build them on first run with a progress line.
3. **A portable zip.** `app/build-zip.ts` produces `dist/PortAvalon-win64.zip` containing the repo files the game needs (`sim/`, `ui/`, `app/`, a README of 10 lines) and the official Node for Windows x64 fetched from nodejs.org at build time, so the zip runs on a PC with no Node installed.

## Done

On this Windows machine, double-clicking `app/Play Port Avalon.cmd` opens the game in the browser; the zip builds and, unpacked into an empty folder, starts the same way. Commit after `git pull --rebase` (never commit `dist/`), push to v1-build, reply with the zip size, start-up time to the title screen and your cost. Then stop. No test suites, no docs beyond the 10-line README.
