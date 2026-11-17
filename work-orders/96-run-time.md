# Work order 96: where did the speed go

Read `AGENTS.md`, `sim/README.md` and the core files in `sim/`.

You own the core files in `sim/` and `sim/run.ts`. Another agent is changing `economy/`, `markets/`, `earnings/` and `content/` at the same time: in those, make only the smallest change that fixes a hot spot, and keep both sides on any rebase conflict.

## The problem

Order 91 (commit e04cd3f4) reported a game-day at year 10 of about 23 ms, excluding the daily ledger check. Yet `node sim/run.ts --years 10` on an idle PC now takes about 168 s, where it took about 85 s before order 91. That is roughly 47 ms a day.

## Do

1. Time the run at commits 83e1b25d (before 91), e04cd3f4 (91), 1fe27f1e (latest) and at the current head, one run at a time, with the PC otherwise idle. Split each into step time, ledger-check time, folding and compaction time, and stats or printing time.
2. Find what made the full run slower, and fix it. If the daily ledger check is the cost, make it incremental (check only the accounts that changed that day) while still proving the books balance every day.
3. Target: `node sim/run.ts --years 10` in under 80 s on this PC, with the same state hash before and after your change.

## Done

Paste the timing table and the final run line. Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
