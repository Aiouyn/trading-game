# Port Avalon

Port Avalon is a multiplayer finance tycoon in one persistent world. Players start with $5,000 and a cracked phone. They trade
183 fictional assets, build businesses in 13 sectors, buy property in six cities, train AI models, rival other players and
climb from Broke to Dynasty. One game day is one real hour, and the world keeps running while players are away. All
companies, cities, currencies and people are fictional. There is no real money and no financial advice.

## Play

```bash
npm install
npm run play
```

Node 22.13 or newer is required. The first run builds the web app (a minute or two), then starts the world server and the web app. The console prints where to open the game:

- This computer: `http://localhost:3000`
- A phone on the same Wi-Fi: `http://<your-LAN-address>:3000`. The phone needs no setup.

Ctrl+C stops both. The world saves and makes a backup on the way out. Options: `npm run play -- --build` (always rebuild),
`--no-build` (never build) and `--help`. The ports come from `PLAY_WEB_PORT` (3000) and `PLAY_WORLD_PORT` (8797). Details are in
[docs/PLAY.md](docs/PLAY.md).

For development, `npm run dev:all` runs the world server on port 8787 and the Next.js dev server on port 3000. `npm run world`
and `npm run dev` run them separately. The save is in `./world-data`; delete that folder for a new world.

## Admin

1. Set `ADMIN_TOKEN` in the environment before the world starts. `npm run play` passes its environment on. For example,
   PowerShell: `$env:ADMIN_TOKEN = "<long random token>"; npm run play`. Bash: `ADMIN_TOKEN="<token>" npm run play`.
2. Open `/admin` (for example `http://localhost:3000/admin`) and type the token. The page keeps it in memory only.

The page shows the tick and day, players online and registered, tick times, the database size, the backups on disk and the
recent admin actions. It has two buttons: back up now, and pause or resume the world. With no `ADMIN_TOKEN` set, the admin API
refuses every request.

A token also unlocks dev and test endpoints under `/api/admin/`. They can grant cash, advance time and seed events. Keep the
world port on a network you trust.

## Backups and restore

- The world writes a backup every real hour and one at shutdown, into `world-data/backups/`. Each file is a copy taken between
  ticks, and its name carries the tick.
- The folder keeps the newest 48 backups, plus the newest backup of each of the last 14 UTC days.
- To restore, stop the world (Ctrl+C in the `npm run play` window), then run:

  ```bash
  npm run world:restore -- world-data/backups/<file>.db
  ```

  The command refuses while a world is running. It keeps the replaced database as `world.db.before-restore-<time>` in the same
  folder. Start again with `npm run play`.

## Languages

The game is in English and French. Choose the language in Settings. A sweep checks the French in the default app views; deeper
views are covered by unit tests only. The [V1 overview](docs/V1.md#known-limits) lists the open items, including English text
still in some notices.

## Checks

```bash
npm run typecheck        # next typegen, then tsc --noEmit
npm run lint             # eslint
npm test                 # vitest run (unit and integration tests)
npm run e2e              # Playwright, desktop (1440 x 900) and phone (390 x 844) projects
scripts/cloud/e2e-shards.sh [options] [spec files or regexes...]   # sharded e2e run (bash; --help for options; --rerun-failed)
npm run balance          # engine calibration bands; the default (24 ticks a game day) is a smoke run
npm run balance:shops    # shop payback bands by management style and tier
npm run sim              # headless simulation
npx tsx scripts/ecology/gates.ts full --seeds 60 --tpd 720   # ecology gates, release run (not in package.json)
npx tsx scripts/balance/wealth.ts bot <name> 120 <style>     # wealth curve for one management style (see the script header)
```

The load gate (not in package.json) runs the world at the production tick, 5 s. Start a fresh world, then run the client. The exit
code is the gate: all 4,000 clients welcomed, tick fan-out p99 under 2.5 s, and tick overrun p99 under 0.5 s. Repeat it three times.

```bash
PORT=8919 DATA_DIR=./load-data TICK_MS=5000 WARMUP_DAYS=1 REGISTER_LIMIT=100000 npx tsx server/index.ts
WINDOW_ALIGN=60 NEED_PUBLIC=2 node scripts/load/socket-load.mjs http://localhost:8919 4000 330
```

The window is 330 seconds and holds the public ticks 780 and 840. The 1 s stress run is reported, not gated
(`scripts/load/socket-load.mjs` header).

Counts. On `f5115ee`: Vitest, 282 test files and 2,626 tests (4 expected failures: the recorded FAIL gates). Playwright, the
final sharded run on the VM (`scripts/cloud/e2e-shards.sh`, 5 min): 438 passed, 6 failed, 0 did not run; all 6 pass when
run alone (`--rerun-failed`: timing only, 0 real).
The balance and ecology gates are not re-run for this README. Their last recorded results are in
[docs/V1-PHASE1.md](docs/V1-PHASE1.md) (sections 3g to 3o), [docs/V1-PHASE4.md](docs/V1-PHASE4.md) (O-19) and
[docs/V1-PHASE9.md](docs/V1-PHASE9.md) (9B.4 and 9C.4).

## Where things are

- [docs/V1.md](docs/V1.md): what V1 is, its systems, the locked decisions, the key numbers and the known limits.
- [docs/PLAY.md](docs/PLAY.md): playing on your computer and your LAN, backups and restore.
- `docs/V1-PHASE*.md`: the phase records. [docs/V1-ACCEPTANCE.md](docs/V1-ACCEPTANCE.md) is the acceptance matrix.
  [docs/V1-PRIVACY.md](docs/V1-PRIVACY.md) says what the world shows to other players.
- [docs/ENGINE.md](docs/ENGINE.md) (market model), [docs/DESIGN.md](docs/DESIGN.md) (visual system) and
  [docs/MASTER-BIBLE.md](docs/MASTER-BIBLE.md) (the design bible).
