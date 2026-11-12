# M1-05 sameBook reconnect flake

Written 2026-11-12. `UNIT.md` was not changed.

## Symptom

`tests/e2e/17b/M1-05-live-ticks.spec.ts` (the reconnect `sameBook` at the offline/online step) fails about one run in three on a loaded CI e2e. The thrown line is the two accounts not settling on one server book. A captured failure (GitHub Actions run 43193324536, desktop, 20.1s, the same length as a pass):

`the two accounts did not settle on one server book (A 27702 B 27704 server 27704)`

Player A is the browser that was set offline for 6.5s. A was live on a book two ticks behind B and behind `GET /api/market`. B matched the server. This is not a slow quote scan straddling the 5s clock: the run was not longer than a pass.

## What local repeats did

Unmodified tree, production `next start` on port 3100, `taskset -c 0,1`, `--project=desktop --repeat-each=10 --workers=2`:

- Before the fix: **10 passed**, 0 failed (2.3m).
- Same command with a busy loop pinned to each of those two cores, `--repeat-each=6`: **6 passed**, 0 failed (1.5m).

A quiet box does not keep a `/api/market` read in flight across `setOffline`, so the race rarely opens. The CI failure and the unit test below are the reproduction of the race.

After the fix, the same 10-repeat command: **10 passed**, 0 failed (2.1m).

## Root cause (product)

Coming back online, `openChannel` calls `feed.resync`. For a signed-in ticker that does two things at once:

1. It replays the last adopted snap. The Broker's `data-state` goes back to `live` at the pre-outage tick. `sameBook` only reads quotes once that attribute is `live`, so it samples the stale book immediately.
2. It asks `pullServerQuotes` for a fresh `GET /api/market`. If a read is already in flight (the poll that was out across the offline window), that call returns without reading. The in-flight attempt then either fails and arms the backoff, or resolves with the book from when it was issued (here, 27702). Nothing replaces it until the backoff or the next 1s poll. Six immediate `sameBook` passes all see A on 27702 and B on 27704.

A guest feed is different: its local clock keeps moving while offline, so replaying the snap is the current book. Signed-in quotes are not.

## Fix

- Online uses `reconnect`, not `resync`, for a signed-in feed. The cached ticker snap is not replayed. The channel stays `stale` (Broker not `live`) until the fresh read's frame arrives, which is what `uiQuotes` already waits for.
- `pullServerQuotes` keeps a one-deep follow-up, the same shape as the ledger pull. A body from the read that was already in flight is not adopted once that follow-up is waiting, so the pre-outage book cannot become the live book. The follow-up runs as soon as the in-flight attempt settles, not after the backoff.

Seq-gap `resync` still replays a snap. That path is what realigns the channel sequence, and it is not the offline/online path.

## Proof

- `tests/unit/shell/outage-backoff.test.ts`, describe "reconnect does not publish the pre-outage book". Both tests failed on the unmodified feed (`expected 'live' to be 'stale'` right after online, with the replacement read not issued). They pass after the fix: a stale in-flight body is not published, a failed in-flight read retries at once, and the channel goes live on the post-outage tick.
- The repeat counts above.
