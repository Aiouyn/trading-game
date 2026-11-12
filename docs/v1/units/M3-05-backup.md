# Unit: atomic rotated backups of the .data store

**Branch:** `eng/infra-rate-limits-backup`  
**Base:** `81b5b144`, plus the rate-limit commit on this branch.  
**Board:** M3-05. Invited players need a backup that can be restored to the same cash, positions, orders, sessions, and world.

## Goal

Copy the authoritative on-disk store to a snapshot that appears only after the copy is complete, keep a fixed number of snapshots, and restore one snapshot so two players' ledgers and the storm-world file come back unchanged. No paid host and no new service. The same scripts run against a local `.data` or against paths given by env.

## Files

- `src/server/ops/dataBackup.ts` — copy, hash, rename, rotate, restore.
- `scripts/ops/backup-data.ts` and `scripts/ops/restore-data.ts` — non-interactive CLIs.
- `tests/unit/ops/m3-05-backup.test.ts` — seed, backup, wipe, restore, isolation.
- `docs/v1/ops/backup-restore.md` — runbook.
- `.gitignore` — `.data-backups/`.

The server's own stores stay as they are (`QUAY_AUTH_DATA_DIR`, `QUAY_STORM_DATA_DIR`, `QUAY_TELEMETRY_DIR`). This unit only reads those paths.

## Acceptance

1. This note exists before the product edits in the same unit.
2. A backup is a directory renamed into place. A crash mid-copy leaves `.partial-*`, which restore ignores.
3. `QUAY_BACKUP_KEEP` (default 7) drops older snapshots after a successful backup. The live store is not modified by a backup.
4. Restore checks every file's sha256 before replacing anything. A mismatch leaves the live store as it was.
5. Restore without `--yes` does not write. `--dry-run` prints the plan and does not write.
6. Round trip: two accounts with different cash, positions, and open orders, plus a storm-world `lastTick`, survive backup → delete the store → restore. Each session still reads only its own ledger. A second account's positions are not on the first.
7. An auth or storm directory set outside `QUAY_DATA_DIR` is included and restored to that same path.

## How to verify by hand

Follow `docs/v1/ops/backup-restore.md`. Short form: stop the server, `npx tsx scripts/ops/backup-data.ts`, note two players' cash, delete or damage `.data`, `npx tsx scripts/ops/restore-data.ts --yes`, start the server, sign in as each player, and confirm cash, positions, and orders match.
