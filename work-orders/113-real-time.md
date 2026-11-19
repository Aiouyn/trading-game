# Work order 113: one real hour is one day

Read `AGENTS.md`, `sim/README.md`, `sim/server.ts` (the `Speed` type, `daysFor`, the run loop), `sim/kernel/`, `sim/modules/markets/` (including `bars.ts`), `sim/modules/crypto/`, `src/shell/simSession.ts` and the Quay clock and speed controls in `src/shell/` and `src/components/shell/`.

You own the clock and run loop in `sim/server.ts`, a new intraday clock in `sim/kernel/` or `sim/modules/markets/`, the intraday parts of `markets/` and `crypto/`, and the time controls in `src/shell/` and `src/components/shell/`. Order 115 edits `src/shell/desk.ts` and `src/apps/launchpad/` at the same time; keep both sides on any rebase conflict.

## Why, in the owner's words

"Currently we pass day by day. That's not how it should happen. One real world hour should represent one day in the game. And there needs to be multiples of time: times 1, times 2, times 5, times 10, times 25."

## Do

1. **A continuous game clock**: day plus hour and minute. At x1, one game day (24 game hours) passes in one real hour, so one game minute is 2.5 real seconds. Speeds: pause, x1, x2, x5, x10, x25. The server runs the clock itself while the game is unpaused; Quay shows the time (for example "Tue 14 Mar, 10:42") and the speed buttons.
2. **Markets live through the day**: the exchange opens 09:30 to 16:00 on weekdays, with prices, trades and order books moving every game minute. Crypto and memecoins trade around the clock. Each instrument's minute path is deterministic from the seed and the player's actions, and agrees with the daily close the economy produces (or the daily step moves to the close of trading). Keep at least five game days of 1-minute bars per instrument in bounded memory, and expose them through `/history?instr=...&tf=1m` (and 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M, aggregated in the sim).
3. **The rest of life keeps its rhythm**: wages, rent, news, earnings, meetings and bar evenings happen at sensible hours (news in the morning, earnings before the open or after the close, bars in the evening). Going out or a course takes the evening; the clock jumps over the time spent, the same as sleeping.
4. **Quay follows live**: `/view` and a light tick feed (time, prices of what is on screen, fills, news) update the screen several times a game hour without re-reading the whole view every tick.
5. **Pause on what matters**: the game pauses itself on a margin call, a fill the player asked to be told about, or a message from someone they know, as it does now.
6. Keep `sim/run.ts` and `sim/play.ts` working as they are (headless runs step whole days), with "Books balanced every day", and keep the 10-year run under 100 s.

## Done

Show the clock running at x1 and x25 for a few real minutes on an `arrival` start: the time advancing, 1-minute bars arriving for a share during the session and for a coin at night, and one fill during the day. Check Quay's clock and speed buttons. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
