# Work order 70: one double-click opens Quay

Read `AGENTS.md` (including the Next.js block: read `node_modules/next/dist/docs/` on standalone output and production builds before you change any config), `docs/DIRECTION.md`, work order 56 and everything in `app/`. Today `app/Play Port Avalon.cmd` starts `sim/server.ts` and opens the plain `ui/`. The game the player must see is Quay (`src/`), which reads `sim/server.ts` through `src/server/`.

You own `app/`, `next.config.*` (only what a production build needs) and a new `dist/` that is never committed. Do not change `src/apps`, `sim/modules`.

## Build

1. **Production Quay.** A script `app/build-quay.ts` runs `next build` (with `output: 'standalone'` if the docs allow it on this version) so the player never waits for a dev compile. Measure memory: if the build needs more than 4 GB, say so and use the lowest-memory option the docs give. Run only one build at a time.
2. **The launcher starts both.** `app/Play Port Avalon.cmd` and `app/play.sh` start `sim/server.ts` and the built Quay on free local ports, wait for both, open the browser on Quay, show one line of progress, and stop both when the window closes. If no Quay build exists, the launcher builds it once with a progress line. The plain `ui/` stays reachable at a second URL for now.
3. **The zip.** `app/build-zip.ts` adds the standalone Quay build (and its static files) to `dist/PortAvalon-win64.zip` with the bundled Node, so an empty Windows folder with no Node or npm runs the full game. Keep the zip under 250 MB; report its size.
4. **First run is fast.** Pre-built worlds as in work order 56; the title screen of Quay appears within 10 seconds of the double-click on this PC once built.

## Done

Double-click `app/Play Port Avalon.cmd`: Quay opens, a new "First paycheck" game starts, one trade goes through. Unzip into an empty folder on D: and do the same. Delete the unzipped copy and any build cache you created outside the repo. Commit after `git pull --rebase` (never commit `dist/` or `.next/`), push to v1-build, reply with the zip size, build memory peak, start-up time and your cost. Then stop. No test suites, no docs beyond the README.
