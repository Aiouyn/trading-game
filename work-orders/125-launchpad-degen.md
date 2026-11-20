# Work order 125: a Launchpad for degens

Read `AGENTS.md`, `src/apps/launchpad/`, `sim/modules/crypto/` and the `/coins` route in `sim/server.ts` (order 118). Round-2 playtest screenshots: `D:/tg-work/playtest/shots/3-launchpad/` (09, 10, 19, 24, 29, 40) and `2-trader/88-portfolio-after-coin.png`.

You own `src/apps/launchpad/` and `sim/modules/crypto/`. Other orders run at the same time (the Broker and Portfolio, the life sim); keep both sides on any rebase conflict.

## Why

Round 2 scored the Launchpad 6/10: it is alive now (launches every hour or two, rugs announced, a crowd reacting to your coin), but:
- **You cannot launch** when 12 of 12 coins are live: one tester waited 4.5 game hours.
- The coin list is below the fold: intro, tape, rug banners and the King card fill the first screen.
- Your own coin was delisted 8 game hours after launch; the token page says it is worth $0.00 while the Portfolio still values it at $59.36.
- A fresh coin's chart said "Couldn't load the chart"; the launch toast shows a raw id ("0080"); Portfolio fills show "coin:me:0069".
- Odd stats: "+101% 1h" while flat for hours; "3 holders · 1457 trades"; 123 holders with a table of 12 and no "top 12" note; +96% 1h on one trade.
- **Coin valuation**: right after a $200 buy the Portfolio showed +$56 unrealised and net worth jumped +$17; a coin buy filled 8.8% above the quote.
- The sell preview shows only tokens: no proceeds, no price impact (a 50% sell crashed the price 48%, seen only after).
- Ledger coin 15m history has long flat bands of identical candles.
- "What people say" is one-line barks; nothing to reply to; no coin description.

## Do

1. **The player can always launch**: the cap applies to the city's launchers, never to the player.
2. **Board first**: the coin cards are on the first screen at 1366x768; the tape, rugs and King are compact.
3. **One value per coin**: a coin is valued the same on the token page, in the Portfolio and in net worth, at what selling it would bring (the pool's sale value), so a buy never shows an instant gain; delisting follows the rules shown on the page and its value is consistent everywhere.
4. **Fills match quotes**: the buy and sell previews show tokens, average price, proceeds or cost and price impact, and the fill matches the preview made at the same moment.
5. **Stats from trades**: 1h change from the price an hour ago (or "new" for younger coins), holder counts from balances, "top N" labelled.
6. **Charts always load**, including a coin launched a minute ago; major-coin history without flat bands.
7. **Voices**: each coin has a short description from its creator; posts are threaded; the player can post and the crowd answers in character.
8. No raw ids anywhere in your apps.

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) on a fresh start at x25 and check with Playwright headless Chrome screenshots at 1366x768 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each: the board on the first screen, a launch while the board is full, your coin's chart at once, a buy whose Portfolio value equals its sale value, a sell preview with proceeds and impact, a post answered by the crowd. `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
