# Work order 105: fix what the five players hit (sim)

Read `AGENTS.md`, `sim/README.md`, `sim/playtest/employer-week-runs.md` and the modules named below.

You own `sim/` (any module, `sim/server.ts`, `sim/play.ts`). Another agent is editing `src/` at the same time; do not touch it.

## Do

Fix each, with the cause, not a patch over the symptom:

1. **Trades the player never ordered.** `earnings/` `tradeInside` picks the player as a desk member and books insider trades and options to them. The player only acts through commands; exclude every player seat from automatic trading anywhere it can happen.
2. **The employer's own print disappears from news**: the newest-24 facts are crowded out by price closes. Keep the player's own firm, holdings and stakes in the feed first.
3. **Owner messages read as totals**: "buys 2988 shares" while the player holds 570; "13 workers paid $727.51" is one worker's week. Say what the player bought and holds, and what the payroll really is.
4. **`protect` does not stop layoffs** at the player's own firm. A chair's promise should hold for the firm's own cuts while the firm can pay; if it cannot, the event says so and counts as breaking the promise.
5. **Net worth and the sheet disagree** after a block buy (marked at ~$2.37 on a thin market against a $47 price). Value a controlling block at no less than a fair fraction of the market price, and show in `/view` both the market value and what a sale would fetch.
6. **Margin rates jumped from ~8.5% to 13.8% within a week** with no cause shown. Trace it; if it is real, say why in the loan line and the event.
7. **Unexplained 4-for-1 share count changes** at Cornerstone and Urbana with a ~23% value fall. Trace it; a split must not change value and must make news.
8. **The scenario goal is checked only at month end**, and the win says "A year has closed" on day 4. Check goals daily and word the win correctly.
9. **`quote` shows bid above ask.** Fix it.
10. **Server and bank fields**: `topHolders` sends `shares` while Quay reads `qty` (send both); `bankPanel` says margin limit $0 while the credit view says ~$23k (one source of truth); credit lines labelled "consumer loans"; add the haircut per product to `/view`; reveals with `pxAfter` 0.
11. **`owner` as a command alias** in `sim/play.ts`.

Then play `employer-week` once yourself through `sim/play.ts` as a cautious saver and once as a climber, and check none of the above shows up.

## Done

One line per fix saying the cause. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
