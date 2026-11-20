# Work order 128: orders that behave and news that moves markets

Read `AGENTS.md`, `sim/README.md`, the order, short and fill code in `sim/server.ts` and `sim/modules/player/` (trading, `basis.ts`), the exchange and price-formation modules in `sim/modules/` (find where shares are quoted and news reaches prices), `sim/modules/media/` (`paper.ts`), the central bank module, `src/apps/broker/`, `src/components/market/` and `src/apps/wire/`. Read what order 126 just did: `git show 925d5c2a --stat`. Playtest report: `C:/Users/Mathis/PortAvalon-playtest-8827b945/Marco/report-full.md` (build 8827b945, before order 126), screenshots beside it.

You own the order lifecycle in `sim/modules/player/` and `sim/server.ts`, the price reaction to news in the market modules, the central bank's schedule, `src/apps/broker/`, `src/components/market/` and `src/apps/wire/`. Orders 127, 129 and 130 run at the same time; keep both sides on any rebase conflict.

## Why

The trader scored depth 7, polish 4. Order 126 added position lines, shorts as positions, honest margin calls and one ticket. Marco still found:
- **Silent fills.** A stop filled with no notice. Another fill had no price. Covering a short says "Bought 8 Lumen", with no realised P&L.
- **Stops that outlive the position.** After covering, both protective stop buys stayed live, so a spike would have opened a long.
- **Inconsistent session rules.** A limit short above market was rejected ("book would not take the shares"), and a stop short was refused. A market short after hours filled instantly.
- **News barely moves prices.** Confirmed Aegis cuts moved the stock -1%. Oakhaven fell exactly 8% a day as a staircase. A 50bp hike moved the index -0.13%.
- **The central bank day is invisible.** There is no decision time and no preview. The Wire doesn't refresh while it's open, and the decision was found the next morning under profit notes.
- **"Why?" repeats the headline.** "The Daily Herald: The Daily Herald: …", with no causal chain.
- **Chart:**
  - Zoom jumps by itself.
  - The timeframe flips to 1D on symbol change.
  - Off-scale order lines are invisible.
  - The dock opens a second Broker.
  - The Broker reopens on the index, not the last symbol.
- **Stray numbers.** "borrow AMOUNT". A margin loan of "13889%"/"27778%" of a year's income. Tuition shown as "-9.61%". Margin headlines name the player in the third person.

## Do

1. **Every fill speaks.** Every fill, whether market, limit, stop or margin, from any instrument, raises a notice with side, quantity, price and slippage. Closing a position says "Covered" or "Sold" with realised P&L.
2. **Protective orders die with their position** (OCO). A bracket (entry with stop and target) can be set from the ticket. There is a bottom panel of open positions and working orders, with cancel and modify.
3. **One set of session rules**, applied the same to every order type and shown on the ticket: when shares trade, what rests, what fills when. Limit and stop shorts work.
4. **News moves prices like a market.** Confirmed news gaps the stock at the open in proportion to its weight, with noise, follow-through and fades, never a fixed daily step. Rate decisions move the index, banks, rate-sensitive firms and the curve.
5. **A central bank day.**
   - The meeting has a decision time.
   - The morning paper says what is expected.
   - A live headline lands at the time.
   - Markets react in candles.
   - The strip chip opens the story, not a calendar.
   - The Wire updates live while open.
   - News flags sit on the chart where a story about that firm hit.
6. **Why? gives causes**: rumour, then decision, then price, linking the stories involved, never the headline twice.
7. **The chart behaves.**
   - Zoom and timeframe are kept per symbol.
   - Off-scale order and position lines are pinned to the edge with their price.
   - One Broker window, which reopens on the last symbol.
   - The Wire can filter by kind and search.
8. **Numbers in words a trader trusts.** Fix the placeholders and absurd percentages. Margin text speaks to "you".

## Done

Run the game (sim plus `next dev --webpack`, `SIM_PORT` set) at x25 over a central bank day. Check with Playwright headless Chrome screenshots at 1600x900 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`), looking at each one:
- a stop fill notice
- a cover with realised P&L and its stop cancelled
- a limit short resting and filling
- a confirmed-news gap
- the central bank decision landing live, with the index reacting
- a news flag on the chart
- the positions and orders panel

Then `npx tsc --noEmit` clean for your files, then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
