# Unit: refuse restore while a server holds the store

**Branch:** `eng/infra-rate-limits-backup`  
**Follows:** `920a02ea` (Gatekeeper qualified PASS).  
**Board:** M3-05. A restore that lands on disk and is then overwritten by the running server's memory is a lost restore.

## Goal

`restore` refuses when a live server process holds a store directory. A lock file left by a dead process is stale and does not block restore. Two backups at once cannot publish the same snapshot name or delete each other's staging directory.

## Files

- `src/server/ops/serverLock.ts` — pid lock, stale when `/proc/<pid>` is gone or its start time changed.
- `src/instrumentation.ts` — claims the lock when the Next.js server starts.
- `src/server/ops/dataBackup.ts` — restore checks the lock before replacing directories; backups take their own lock and use unique snapshot names.
- `tests/unit/ops/m3-05-backup.test.ts`
- `docs/v1/ops/backup-restore.md` — the runbook states the refusal, not only the advice to stop.

Locked files stay untouched: `src/server/auth/*`, `src/app/api/auth/*`, `src/server/broker/*`, Wire statement code, `src/server/telemetry/*`.

## Acceptance

1. This note is committed before the product edits.
2. A process that has claimed the server lock makes `restoreDataStore` throw before it changes the live files. The error names the pid.
3. A lock whose pid is dead, or whose `/proc` start time does not match, does not block restore.
4. Two overlapping backups both finish, with different snapshot ids, and both snapshots stay readable.
5. The Next.js server claims the lock from `instrumentation.register` on server start (not during `next build`, which never calls `register`).

## How to verify

1. Start `npm run dev` or `next start` so it writes `.data/.quay-server.lock`.
2. `npx tsx scripts/ops/restore-data.ts --yes` exits 1 and names the server pid. The store files are unchanged.
3. Stop the server. Restore again. It proceeds.
4. Run two `backup-data.ts` processes together. Each prints a different `backup-id`.
