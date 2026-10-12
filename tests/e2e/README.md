# tests/e2e

Playwright specs against the real multiplayer stack. `playwright.config.ts` starts, for the main projects:

- a **fresh world server** on port 8797 (`test-results/world-e2e`, 1-second ticks, 3 days of warmup history, admin token `e2e-admin` so specs can grant money), and
- a **web app** on port 3200, started with `TG_WORLD_PORT` pointing at that world.

The web app is built once with no world baked in (the world's port is read when the server starts, `TG_WORLD_PORT`, so one build serves every world). Do not set `NEXT_PUBLIC_WORLD_URL` for the e2e build: a baked URL would win over the run-time port.

Projects: `desktop` (1440×900), the shell viewports `desktop-1920`, `desktop-1000` and `desktop-900`, and `phone` (390×844, touch). Run with `npm run e2e`.

**Close projects.** The time-advancing specs (`closeCard`, `shops`, `exchangeFunds`, `exchangeIpo`, `comeback`, `worldEvents`, `sixdAuctionBid`, `phase7Text`) run as sixteen projects, `close-<name>` (desktop) and `close-<name>-phone`, each with **its own web app and its own world**, so they run in parallel and never advance a world another spec reads. The port plan is in `worlds.ts`: close project k (0 to 15) serves the web app on `E2E_PORT + 100 + k` and the world on `E2E_WORLD_PORT + 100 + k`. They have no dependency on the main projects.

`E2E_BUILD_CMD` replaces the production build step (default `npm run build`). Where Turbopack cannot run, for example on a `node_modules` junction, use `E2E_BUILD_CMD="npx next build --webpack" npm run e2e`.

Environment for the config (all optional):

- `E2E_PORT` / `E2E_WORLD_PORT`: the main web app and world (3200 / 8797). Close pairs are offset from these.
- `E2E_OUT_DIR`: the output folder (default `test-results`); the world data sits inside it.
- `E2E_SCOPE`: `all` (default), `main` (the shared-world projects) or `close` (the close projects; needs `E2E_BUILD_CMD`).
- `E2E_PROJECTS`: a comma list of projects to define; only their servers start.

The e2e world lifts its per-IP account limit (`REGISTER_LIMIT=2000`; the server default is 20 an hour), because every test registers its own guest.

## Sharded runs (cloud VM)

`scripts/cloud/e2e-shards.sh` runs the whole suite in about the time of its slowest shard:

```
scripts/cloud/e2e-shards.sh                 # build once, 4 shards x 4 workers, the close run (16 workers) in parallel
scripts/cloud/e2e-shards.sh --rerun-failed  # after a run: re-run each failed test alone, --workers=1
```

- The build runs once (Turbopack, with `--webpack` as the fallback). Each shard is `npx playwright test --shard=i/N` with its own web app (`--web-base` + i) and world (`--world-base` + i) and its own output folder, `test-results/shards/shard-i`. The close run has its own web apps and worlds (see above).
- Options: `--shards`, `--workers`, `--close-workers`, `--web-base` (3500), `--world-base` (9040), `--out`, `--grep RE`, `--projects`, `--close-projects`, `--no-close`, `--no-build`, and spec files or regexes as positional arguments. A local proof of the plumbing: `scripts/cloud/e2e-shards.sh --no-build --shards 2 --workers 2 --web-base 3440 --world-base 8980 --close-projects close-card,close-card-phone --close-workers 2 tests/e2e/core.spec.ts tests/e2e/closeCard.spec.ts`.
- The summary (`<out>/summary.json`, printed at the end) sums the JSON reports of the shards and the close run: passed, failed, did not run (a test with no result at all), skipped and flaky, and lists each failed test. The exit status is 1 when anything failed, did not run, or left no report.
- `--rerun-failed` re-runs each failed test of the last run once, alone, with one worker and a fresh world. It prints `TIMING-ONLY` (passes alone) or `REAL` (fails alone), and writes the list to `<out>/rerun.txt`. Exit status 1 if any test is `REAL`.
- Logs: `<out>/shard-i.log`, `<out>/close.log`, `<out>/build.log`. Stop a run with Ctrl+C; the servers stop with it.

- `core.spec.ts`: cold open, the core loop (join, 20% first-trade cap, fill, reload keeps everything), buying a business.
- `screens.spec.ts`: every screen opens without console errors or horizontal overflow (after a grant unlocks the Lab and Security), chat, and the late-game flow (option chain, AI research).
- `phone.spec.ts` (phone project only): the home screen and the R0 hardware, full-screen apps with Back and a deep link's chevron, the Recent sheet (hold, tap, swipe, Home, Escape), a Broker ticket kept through a Recent close, the OS-update ceremony (skip, Escape, Keep going), and the `?e2e` hooks (grant, idle, shock).
- Proof screenshots go to `test-results/proof/<project>-<name>.png`.
- Selectors are `data-testid` or roles, never CSS classes. Shared helpers live in `helpers.ts`.
