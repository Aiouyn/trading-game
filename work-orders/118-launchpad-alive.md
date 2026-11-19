# Work order 118: a Launchpad you can watch

Read `AGENTS.md`, `src/apps/launchpad/`, `sim/modules/crypto/` (order 116: minute launches, pools, tape, rugs), the `/history` and `/view` routes in `sim/server.ts`, and the first version's board on `origin/ui/lp-firstver-board` and `p10/lp` for reference. Playtest screenshots: `D:/tg-work/playtest/shots/3-launchpad/` (16, 17, 21, 33, 37, 38).

You own `src/apps/launchpad/` and the coin read routes and coin economics in `sim/modules/crypto/`. Other orders run at the same time; keep both sides on any rebase conflict.

## Why

The sim behind the Launchpad is alive (seven coins in three days, crowds pumping the player's coin 5x), but the playtester scored the screen 3.5/10:
- The board never refreshes: after 3 game days at x25 it still said "No coin is live yet, 0 / 6" while seven coins existed; then it showed "7 / 6". Prices, market caps and the king of the hill sit frozen for 100+ game minutes.
- The token chart is one giant block candle on a stale axis (0.0100-0.0120 while the price is 0.048); "Ticks" says "No trades recorded yet" beside a full tape.
- Market cap, holders, raised and bought-out stay fixed while the price moves; Holders says "no trade yet" next to dozens of trades; a coin shows $0.000387 with a $5,092 cap.
- "What people say" is only generated gossip; trades are stamped "today" with no time; no rug is ever visible on the board.
- Launching costs a $1,500 seed (30% of a $5,000 start) while city launchers seed far less, and net worth drops $1,100 on click with no preview.
- The buy box asks for "Cents to spend".

## Do

1. **Live board**: new launches, prices, market caps, bumps and the king of the hill update as the clock runs at any speed, without reopening the app. The live count never exceeds its cap; dead and rugged coins show as such, and a rug is visible when it happens.
2. **The first version's token chart**, fed from `/history?tf=1m` and up: 1m, 5m, 15m, 1h candles with volume, live forming candle, right axis on the real price.
3. **Consistent stats**: price, market cap, holders, raised and bought-out computed from the same pool state on every refresh; the holder list matches the tape.
4. **Real voices**: replies on a coin come from the real people who trade it (their handle, what they did, short lines in character), the creator posts too; every trade has a game time.
5. **Fair launch**: the player chooses the starting buy (small allowed, the same range city launchers use); the form shows what the launch costs and what net worth will read just after.
6. Dollars in every input.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) on an arrival start at x25 for a game day and check with Playwright headless Chrome screenshots (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each: launches appearing without reload, a token page chart through a pump, a rug on the board, your own launch with a $100 starting buy. `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
