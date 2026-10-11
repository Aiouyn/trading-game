# Phase 8 lead decisions: French, packaging, backups (tech side)

Binding for Phase 8 on the tech branch. The visual polish across apps and palettes belongs to the UX branches (`ux/*`), not here.

## P8-1. `npm run play`
- One command builds the web app if the build is missing or older than the sources, then starts the world server and the web
  app together (`scripts/play.mjs`, cross-platform, no new dependency), with clear console lines: the local URL, the LAN URL
  (first non-internal IPv4), and how to stop. Ctrl+C stops both. Ports from env with defaults (web 3000, world 8797); the web app
  learns the world URL at runtime for LAN play (a phone on the same Wi-Fi joins with the LAN URL), not only at build time.
- `docs/PLAY.md`: requirements (Node 22), first run, LAN join from a phone, where the save lives, how to back up and restore,
  how to reset a world. English, plus a French section.

## P8-2. Automatic backups and restore
- The world server writes a backup of its database every real hour and at shutdown into `data/backups/` (sqlite `VACUUM INTO`
  or the node:sqlite backup API), keeps the last 48 hourly and 14 daily copies, and never blocks a tick (run it between ticks;
  measure the pause and keep it under 50 ms at the e2e world size, or do it off-thread).
- `npm run world:restore -- <file>` restores a backup (refuses while the server runs). A restored world replays to the same
  state (test: back up, advance, restore, compare to the state at the backup tick).

## P8-3. Admin page
- `/admin` in the web app behind the existing admin token (entered once, kept in memory, never in localStorage): world tick and
  day, players online and registered, tick time p50/p99 over the last hour, database size, last backup time and the list of
  backups, the 7B text-overlay readout, the tournament job state, and buttons for "back up now" and "pause/resume the world"
  (pause stops the tick loop; the world resumes where it was). Every admin action is logged. No player data beyond counts.

## P8-4. French completeness
- A test that renders every i18n key in fr and fails on: a key missing in fr, an fr value identical to en when the en value has
  three or more words (except a reviewed allowlist of proper names), straight apostrophes in fr, and English stopwords in fr
  values. Fix what it finds. A Playwright pass in fr over every app at desktop and phone that fails on any visible English
  sentence (a word list heuristic plus the allowlist).

## Gates
- Vitest for backup rotation, restore replay, the play script's argument and port handling, the admin API auth, the fr audit.
- Playwright: `/admin` with and without the token; the fr sweep.
- Status doc `docs/V1-PHASE8.md`.
