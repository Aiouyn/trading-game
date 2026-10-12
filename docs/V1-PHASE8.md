# V1 Phase 8: status

Scope: Phase 8 as set in `docs/team/specs/lead-phase8.md` (binding). This file holds section 8A, the tech track (P8-1 play,
P8-2 backups and restore, P8-3 admin page). P8-4 (the French completeness audit) is a separate track and is not in this section.
Branch: `p8/a`, worktree `.claude/worktrees/p8-a`. Status words as in `docs/V1-PHASE7.md`: **Done**, **Partial**, **Not built**,
**Deferred**, **Decided**.

## 8A. Play, backups, admin (P8-1 to P8-3)

### 8A.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| `npm run play` (P8-1) | **Done** | Builds the web app when the build is missing or older than its sources (`--build`, `--no-build`), then starts the world server and the web app, prints this computer's address and the LAN address, Ctrl+C stops both. Ports `PLAY_WEB_PORT` (3000) and `PLAY_WORLD_PORT` (8797). | `scripts/play.mjs`, `scripts/play.test.ts`, `package.json` |
| Runtime world URL (P8-1) | **Done** | The root layout reads `TG_WORLD_PORT` per request (`connection()`) and renders it for the page; the client uses the page's own host and that port. `NEXT_PUBLIC_WORLD_URL` still wins when set (e2e). A phone on the LAN joins with the LAN address, with no rebuild. | `src/app/layout.tsx`, `src/net/client.ts` |
| `docs/PLAY.md` (P8-1) | **Done** | Requirements, first run, LAN join, where the save lives, backup and restore, reset. English and French. | `docs/PLAY.md` |
| Hourly and shutdown backups (P8-2) | **Done** | A copy of `world.db` every real hour and at shutdown, between ticks, into `DATA_DIR/backups`. Rotation: the newest 48, and the newest of each of the last 14 UTC days. The name carries the tick. | `server/backup.ts`, `server/index.ts` |
| Measured pause (P8-2) | **Done** | Checkpoint and file copy: 4 to 10 ms at the e2e size, 9 to 15 ms at the default size (63 warmup days). See 8A.4. | `server/backup.ts` (`copyDatabase`) |
| `npm run world:restore -- <file>` (P8-2) | **Done** | Refuses while a world holds the folder's lock; moves the current database aside (`world.db.before-restore-<time>`), copies the backup in, steps the restored world to the backup's tick and saves it there. | `server/restore.ts`, `scripts/world-restore.ts`, `server/lock.ts` |
| Restore replay test (P8-2) | **Done** | Back up at a tick with a player's join in the log, advance, restore; the restored world equals the backup state at its tick, and after 40 more ticks equals the live world. | `server/backup.test.ts` |
| `/admin` page (P8-3) | **Done** | The admin token typed once, kept in page memory only. Readouts: world tick and day, players online and registered (counts), tick time p50 and p99 over the last hour, database size, last backup and the list, the 7B text readout, the tournament job state, recent admin actions. Buttons: back up now, pause and resume the world. | `src/app/admin/page.tsx` |
| Admin API (P8-3) | **Done** | `GET /api/admin/status`, `POST /api/admin/backup`, `POST /api/admin/pause` with `{ "paused": bool }`. Bearer token checked in constant time; with no `ADMIN_TOKEN` the API answers 403 to everyone. | `server/admin.ts`, `server/index.ts` |
| Pause and resume (P8-3) | **Done** | The tick loop stops; the tick and state are kept; resume goes on from that tick. | `server/host.ts` (`pause`, `resume`) |
| Action log (P8-3) | **Done** | Each backup, pause and resume is logged to the console and appended to `DATA_DIR/admin.log`, and the last 50 show on the page. | `server/admin.ts` (`AdminLog`) |

### 8A.2 Guards

- `scripts/play.test.ts` (10): argument parsing, the two build flags together, unknown options, ports from the environment and their
  defaults, refused ports (not a number, out of range, equal), build staleness, the LAN address (first external IPv4), the banner,
  `--help` and bad arguments exit without starting anything.
- `server/backup.test.ts` (10): backup names round-trip, rotation keeps the newest 48 and the newest of the last 14 days (30 days of
  hourly files), rotation removes the rest from a real folder, the lock (a live holder blocks, a dead one is stale), the restore
  replay (back up, advance, restore, same state at the tick and after 40 more ticks), the replaced database is kept aside, the
  refusal while running, a non-world file and the live database are refused, the backup reports its pause, and the restore command's
  exit codes.
- `server/admin.test.ts` (8): the bearer check, 403 without the token (and with an empty admin token), the readout carries counts and
  no player name, the tick percentiles and the one-hour window, back up now (file, log, readout), pause and resume (checked body, logged,
  405 on the wrong method), and a paused world holds its tick and resumes from it.
- `tests/e2e/admin.spec.ts` (3): the token prompt refuses a wrong token and stores nothing; the API refuses without the token; with the
  token, the readouts show, back up now writes a backup, pause holds the tick and resume restarts it, and the actions are listed.

### 8A.3 Deviations (reasoned)

- **Backup folder.** The lead spec names `data/backups/`. The backups go to `DATA_DIR/backups`, which is `world-data/backups` by
  default, so one `DATA_DIR` holds the whole save (the `.gitignore` already covers `world-data/`).
- **No forced snapshot before a backup.** The first version saved a snapshot and used `VACUUM INTO`: 120 to 130 ms at the e2e size and
  300 to 400 ms at the default size (see 8A.4). The backup now checkpoints the write-ahead log and copies the file (4 to 15 ms). The
  copy holds the last snapshot and the commands since; its name carries its tick, and the restore steps the world forward to that tick
  with no commands (there are none after it) and saves a snapshot there. The restore test is the proof.
- **Ctrl+C on Windows.** Windows sends Ctrl+C to the console's processes, so the world server and the web app each receive it and stop
  themselves (the world saves and backs up). The play script does not send signals on Windows (`process.kill` there is a hard kill). This
  session could not send a console Ctrl+C to a process started from Git Bash, so the play script was smoke-tested (both servers answered,
  the page carried the world port) and stopped with `taskkill /F /T` on its own process tree. The graceful path is covered by the
  world server's own SIGINT handler and the backup test, not by a console run.
- **Lock.** A second world on the same folder now refuses to start (`world.lock` holds the running process id). This protects the
  replay from a second writer; a stale lock from a crash is ignored.
- **Root layout is per request.** `connection()` in the root layout makes the app render per request (it was static). The cost is
  small for a local server; it is what lets the world port come from the environment at run time.
- **Admin page language.** English only: an operator tool, not part of the player's game (the P8-4 audit covers the player apps).
- **Tick time.** Measured in the tick (the same timer as the existing slow-tick log); the window is the last hour, at most 1000 ticks.

### 8A.4 Measurements

Backup pause, held between ticks (the time the world waits for the backup), measured in the test harness on this machine:

| World size | Copy with forced snapshot (first design) | VACUUM INTO only | Checkpoint and file copy (shipped) |
|---|---|---|---|
| 3 warmup days (e2e), file about 15 MB | 120 to 180 ms | 45 to 52 ms | 4 to 10 ms |
| 63 warmup days (default), file about 32 MB | 300 to 420 ms | 80 to 85 ms | 9 to 15 ms |

The world is the same size class as the e2e world (3 days, 24 players at boot in the smoke run). The snapshot inside the first
design is the cost; the copy alone is the rest.

### 8A.5 Gates (this pass)

- `npx next typegen` and `npx tsc --noEmit`: exit 0.
- eslint on the touched TypeScript and TSX files: 0 errors, 0 warnings.
- Vitest on the touched suites (`scripts/play.test.ts`, `server/backup.test.ts`, `server/admin.test.ts`): pass. The full vitest run is in the
  final commit message.
- Playwright: `tests/e2e/admin.spec.ts` on the desktop project (run on ports 3332 and 8929 with `E2E_BUILD_CMD="npx next build --webpack"`):
  see the commit message for the result.
- Determinism: no change to the game's stepping, commands or stored state; the restore test compares the state after replay and
  after 40 more ticks with the live world.
