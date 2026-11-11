# Backup and restore (M3-05)

The authoritative store is the on-disk tree the single server process writes:

| What | Default path | Override |
|---|---|---|
| Players, sessions, cash, positions, open orders, Launchpad, Wire posts | `.data/auth/store.json` | `QUAY_AUTH_DATA_DIR` (directory; file is `store.json`) |
| World / storm / rumor bookkeeping | `.data/market/storm-world.json` | `QUAY_STORM_DATA_DIR` |
| Telemetry log and anon-id secret | `.data/telemetry/` | `QUAY_TELEMETRY_DIR` |

`QUAY_DATA_DIR` (default `.data`) is the backup root. It is not read by the game server. Point the three server variables at children of that root, or leave them unset for the defaults above. A server directory that sits outside `QUAY_DATA_DIR` is copied as its own root and restored to the same path.

Snapshots go to `QUAY_BACKUP_DIR` (default `.data-backups`, gitignored). That directory must not be inside the live store. Each snapshot is staged as `.partial-*` and renamed into place only when the copy and manifest are written. Mode is `0700` on directories and `0600` on files. Snapshots contain password hashes, session token hashes, and the telemetry secret. Keep them on the same machine as the store. Do not commit them and do not upload them to a new paid host from this runbook.

## How often

Run a backup before the first invited session of the day and after the last session. Keep 7 (`QUAY_BACKUP_KEEP`, default 7), which is a week of daily snapshots. This repo does not schedule the job and does not provision storage. While the server is running, `store.json` and `storm-world.json` can move independently. Stop the server before a backup you may need to restore.

## Backup

```sh
npx tsx scripts/ops/backup-data.ts --dry-run
npx tsx scripts/ops/backup-data.ts
```

A second run writes another snapshot. It does not modify the live store. On a host volume:

```sh
export QUAY_DATA_DIR=/var/avalon/data
export QUAY_AUTH_DATA_DIR=/var/avalon/data/auth
export QUAY_STORM_DATA_DIR=/var/avalon/data/market
export QUAY_TELEMETRY_DIR=/var/avalon/data/telemetry
export QUAY_BACKUP_DIR=/var/avalon/backups
export QUAY_BACKUP_KEEP=7
npx tsx scripts/ops/backup-data.ts
```

Start the server with the same `QUAY_AUTH_DATA_DIR`, `QUAY_STORM_DATA_DIR`, and `QUAY_TELEMETRY_DIR`. Stdout names the snapshot:

```text
backup-id: 20261111T231501123Z
backup-dir: /var/avalon/backups/20261111T231501123Z
files: 3
```

## Restore

Stop the server. Preview, then replace:

```sh
npx tsx scripts/ops/restore-data.ts --dry-run
npx tsx scripts/ops/restore-data.ts --yes
npx tsx scripts/ops/restore-data.ts --yes --id 20261111T231501123Z
```

Without `--yes` the script exits 2 and writes nothing. A hash mismatch or a path that leaves the snapshot exits 1 and leaves the live store as it was. `--dry-run` never writes, even with `--yes`.

## Verify

1. Start the server against the same data directories.
2. Sign in as two players whose cash, positions, and open orders you noted before the backup. Each screen shows only that player's book.
3. Cash, positions, and open orders match the notes. A player does not see the other player's positions.
4. `GET /api/world` still reports the Port Avalon world.
5. The automated proof is `tests/unit/ops/m3-05-backup.test.ts`: seed two ledgers and a storm-world tick, back up, delete the store, restore, and read both ledgers back on a new `AuthService`.
