# Work order 112: markets you can actually trade

Read `AGENTS.md`, `sim/README.md`, `sim/modules/markets/` (including `bars.ts` from order 110), `sim/modules/crypto/`, `sim/playtest/employer-week-runs.md` and `src/apps/broker/Terminal.tsx` (read only).

You own `sim/modules/markets/`, `sim/modules/crypto/` and the trading parts of `sim/modules/player/` (orders, shorts, stops). Do not touch `src/`.

## Why

Order 110 gave the player a real trading terminal, but the markets behind it are too thin to trade:
- A market sell of 256 Salar shares filled 23; the rest expired.
- Bids vanish after a few fills, so holdings are marked at a fraction of their price.
- `short frm_kestrel_build 5` did not sell: the borrowed shares stayed in the holding.
- At the first month end some shares reprice by up to 14x because the opening price is a placeholder, so every chart starts with a cliff.
- A new world's chart is nearly empty because no history exists before the game starts.
- Stops only exist inside the terminal, so they fire only while it is open.

## Do

1. **Depth**: market makers and the city's investors keep a believable book on every listed share and major coin: a spread and depth that scale with the firm's size and trading volume, refilled through the day. A small firm is still thin, but a few hundred shares trade at a cost, never vanish. Market orders walk the book and say what they filled and at what average price.
2. **Fair marks**: holdings are marked at the last trade or mid price; the sale value stays available as a separate figure.
3. **Shorts work**: borrow, sell into the book, pay the borrow fee, can be squeezed and recalled; cover with a buy.
4. **No opening cliff**: firms open at a price consistent with their profits and the market's valuation, so month one is calm.
5. **History before day one**: pre-roll a deterministic year of daily bars from the same price model, so every chart has a past when the player arrives.
6. **Stop and stop-limit orders in the sim** for shares, coins and futures, held in the order book and triggered on trades, whether or not Quay is open. Expose them through `/act` (`{"kind":"order",...,"type":"stop","stop":...}`) and list them in `/view` with other open orders.
7. Memecoins keep their wild life (launches, pumps, rugs), but can be bought and sold in sizes a $5,000 player would trade.

## Done

Show, on the `arrival` start: a market buy and sell of 300 shares of a mid-sized firm with fill prices, a short opened and covered, a stop that fires during `wait 1m`, and the first month of the index with no cliff. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
