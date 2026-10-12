# V1 Phase 8: status

Scope: Phase 8 as set in `docs/team/specs/lead-phase8.md` (binding). This file holds section 8A, the tech track (P8-1 play,
P8-2 backups and restore, P8-3 admin page). Section 8B below is the French completeness track (P8-4), merged from `p8/b`.
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
- `tests/e2e/admin.spec.ts` (4): the token prompt refuses a wrong token and stores nothing; the API refuses without the token; with the
  token, the readouts show, back up now writes a backup, pause holds the tick and resume restarts it, and the actions are listed; in
  French the prompt and the readouts read in French and the visible text has no English sentence.

### 8A.3 Deviations (reasoned)

- **Backup folder.** The lead spec names `data/backups/`. The backups go to `DATA_DIR/backups`, which is `world-data/backups` by
  default, so one `DATA_DIR` holds the whole save (the `.gitignore` already covers `world-data/`).
- **No forced snapshot before a backup.** The first version saved a snapshot and used `VACUUM INTO`: 120 to 130 ms at the e2e size and
  300 to 400 ms at the default size (see 8A.4). The backup now checkpoints the write-ahead log and copies the file (4 to 15 ms). The
  copy holds the last snapshot and the commands since; its name carries its tick, and the restore steps the world forward to that tick
  with no commands (there are none after it) and saves a snapshot there. The restore test is the proof.
- **Ctrl+C on Windows (verified).** A console Ctrl+C reaches the world server and the web app together (they share the console), and the world saves and writes its shutdown backup before it exits. Run on this machine: `npm run play` started hidden on ports 3411 and 8811 with its own data folder, a Ctrl+C was sent to its console, and both servers exited; the folder held `world-…-t45360-shutdown.db` (held 23.3 ms, 34 MB at the default size) and no `world.lock`, and the database checkpoint left no `-wal` file. The play script itself does not send signals on Windows (`process.kill` there is a hard kill). If only the play script is stopped (not the console), its 30 s fallback ends the children with a hard kill, which can leave `world.lock` behind; the next start and `world:restore` treat a dead process id in the lock as stale, so this is safe to recover from, but it skips the shutdown backup.
- **Lock.** A second world on the same folder now refuses to start (`world.lock` holds the running process id). This protects the
  replay from a second writer; a stale lock from a crash is ignored.
- **Root layout is per request.** `connection()` in the root layout makes the app render per request (it was static). The cost is
  small for a local server; it is what lets the world port come from the environment at run time.
- **Admin page language.** The page is in English and French like the rest (P8-4): every string is an `admin.*` key, the page reads the player's saved language (`tg-prefs`), and a French test checks the visible text for English sentences. The action log's details carry no English prose (`tick N`, `name · pause X ms`); a failed backup's message is the server's own error text.
- **Tick time.** Measured in the tick (the same timer as the existing slow-tick log); the window is the last hour, at most 1000 ticks.

### 8A.4 Measurements

Backup pause, held between ticks (the time the world waits for the backup), measured in the test harness on this machine:

| World size | Copy with forced snapshot (first design) | VACUUM INTO only | Checkpoint and file copy (shipped) |
|---|---|---|---|
| 3 warmup days (e2e), file about 15 MB | 120 to 180 ms | 45 to 52 ms | 4 to 10 ms |
| 63 warmup days (default), file about 32 MB | 300 to 420 ms | 80 to 85 ms | 9 to 15 ms |

The world is the same size class as the e2e world (3 days, 24 players at boot in the smoke run). The snapshot inside the first
design is the cost; the copy alone is the rest.

### 8A.5 Gates (this pass, after the merge of `p8/b` and the admin fixes)

- `npx next typegen && npx tsc --noEmit`: exit 0.
- eslint on the touched TypeScript and TSX files (admin page, admin API, admin spec, play, backup, restore): 0 errors, 0 warnings.
- Full vitest (`npx vitest run --maxWorkers=3`): 230 files passed, 2 skipped; 2297 tests passed, 70 skipped, 21 todo.
- Playwright (`E2E_PORT=3332 E2E_WORLD_PORT=8929 E2E_BUILD_CMD="npx next build --webpack" npx playwright test tests/e2e/admin.spec.ts tests/e2e/frSweep.spec.ts --workers=1 --no-deps`): 10 passed, the admin spec (4) and the French sweep (1) on desktop and phone.
- Ctrl+C on Windows: run by hand, see 8A.3.
- Determinism: no change to the game's stepping, commands or stored state; the restore test compares the state after replay and after 40 more ticks with the live world.

## 8B. French completeness (P8-4)

**Goal.** A player who picks French sees French everywhere: no key missing in fr, no English sentence left on a screen.

**What was built**
- `src/i18n/frAudit.ts`: the shared audit data (reviewed allowlist of keys, English stopwords, fictional-name allowlist for the sweep, and the line heuristic).
- `src/i18n/fr-audit.test.ts` (vitest): fails on a key missing in fr or fr keys that en lacks; an fr value identical to en at three or more words (except the allowlist); straight apostrophes in fr (the copy uses ’); English stopwords in fr values. A stale allowlist entry also fails.
- `tests/e2e/frSweep.spec.ts` (Playwright, `desktop` 1440x900 and `phone` 390x844): switches to French, opens every app in `APP_IDS`, reads the visible text, and fails on any line with three or more words and an English stopword, unless it contains an allowlisted name or command.

**What the audit found and what changed**
- 415 fr values used a straight apostrophe. All now use ’.
- The sweep found about 210 distinct English sentences on the default app views. They came from content tables that were never translated: business blurbs and sector blurbs, upgrades and business event titles, lifestyle item blurbs, perks and names, licenses, property types, cities and districts, the asset universe (stocks, crypto, commodities, forex, bonds, property funds), AI research names and blurbs, data sources, achievement names and texts, hourly contracts, and rank unlocks.
- Those tables are now read through i18n keys (`biz.blurb.<id>`, `asset.blurb.<id>`, `ach.name.<id>`, `contract.text.<id>`, `ai.name.<id>` and so on), with English in en.json and French in fr.json. The English values equal the content text, so English screens are unchanged.
- Server-made lines (welcome, rank up, achievement unlocked, the Wire's achievement and milestone lines) now carry message descriptors (`msg`), so the Wire, the inbox and the bell read in the viewer's language. The English `text` is unchanged.
- The Phase 7 `ENGLISH_STORY` checks and the fr-specific e2e specs were not changed.

**Kept English on purpose (allowlist or fictional names)**
- Fictional proper names: business names, product and item names are kept only where they are brand-like; "Bank of Port Avalon" is allowlisted in the sweep (`FR_SWEEP_NAMES`). The four sponsor and company names and the `npm run world` command are in `FR_AUDIT_ALLOWLIST`.

**Coverage limits**
- The sweep reads the default view of each app. Deeper views (other tabs, long lists below the fold, error toasts) are covered only by the audit test and by the content keys, not by the sweep.

**Gates (this track)**
- `npx next typegen && npx tsc --noEmit`: 0 errors.
- `npx vitest run --maxWorkers=3` (full): 229 files passed, 2 skipped; 2292 tests passed.
- `eslint` on every touched file: 0 errors, 0 warnings.
- `npx playwright test tests/e2e/frSweep.spec.ts --project=desktop --project=phone --no-deps`: passed.
- Determinism and replays: no engine or simulation code changed; the only world change adds a `msg` descriptor to notification lines, and the English text stays identical.

**Review repairs (round 2)**
- NPC chat (blocking 1): the 30 engine chatter lines in `src/world/npc.ts` were English in French play. The table now lives in `src/world/text/npcChat.ts`, and the stored chat text is unchanged (saves and replays are the same). The screen translates a stored NPC line through `npc.chat.<style>.<n>` (en.json and fr.json), matched on the English template with `{a}` as the stock. Player lines are never translated. `npcChat.test.ts` checks that every template has its key in both locales and that each stored line maps back to its key.
- NPC bios (blocking 2): `Social.tsx` shows an NPC bio through `npc.bio.<playerId>` (24 keys, en equal to the bio the engine stores). Player bios are shown as typed.
- Cyber notify (blocking 3): the "defenses blocked" line at `src/world/cyber.ts:412` now carries `msg: { key: 'security.msg.blocked' }`, the key the Wire and bell already read.
- French spacing (item 4): every space before `: ; ! ? %` and inside `« »` in fr.json is now a no-break space (U+00A0), so "1 %" and "Ventes forcées en {asset} :" do not wrap apart. The en values are unchanged.
- Sweep coverage (item 5): the Playwright sweep still reads the default app views. The world chat and the NPC bio sit behind the chat tab and the profile modal, so they are guarded by `npcChat.test.ts` and the audit test, not by the sweep. Reasoned deviation: the sweep is not extended to those views in this round.

**Gates (round 2)**
- `npx next typegen && npx tsc --noEmit`: 0 errors. `eslint` on the touched files: 0.
- `npx vitest run --maxWorkers=3` (full): 228 files passed, 2 skipped; 2273 tests passed, 70 skipped.
