# Trade journal and trade replay (M09)
Owner: Velvet (spec). Build: Forge. Data: Quant `explainTrade(state, tradeId)`. Mock: `design/velvet-phase1-board-a.png` (panel 2).

## Where it lives
Portfolio → segmented control `Positions · Journal · Orders`. The journal lists **closed** trades only (each sell that closes lots is one entry, FIFO). Open positions never appear.

## Journal row
- Line 1: ticker (sans 600), `Long · 6 days held` in `fg-muted`, realized P&L right-aligned in mono, signed and colored.
- Line 2: the one generated sentence from `explainTrade` in `fg-muted` `small`, e.g. "Most of this loss came from the sector, not the company." One line, ellipsis.
- Line 3 (only with a hired analyst, see `velvet-research-desk.md`): a 4 px **attribution bar** split by part size: market, sector, news, company noise, fees. Gain parts use `gain` at 70%, loss parts `loss` at 70%, fees always `fg-faint`. No labels in the row.
- |P&L| < $1 shows "About even" instead of an amount.

## Trade detail (tap a row)
Phone: full-screen push. Desktop: the right side column swaps to it, the chart area shows the replay.

1. **Header:** ticker, side, `Bought Day 4 · Sold Day 10`, realized P&L in serif `title`.
2. **Replay chart** (lightweight-charts, line mode): the price from 20% of the holding time before entry to 20% after exit.
   - Entry: brass ▲ marker with qty label. Exit: brass ▼. Multiple fills each get a marker.
   - Average cost: dashed `fg-faint` horizontal line between entry and exit only.
   - News pins: 6 px `info` dots on the line at each headline id from the news part; tap shows the headline.
   - The held window is shaded `brass` at 6%.
   - **If held to now:** a dashed `fg-faint` continuation from exit to today, ending in a small label "If held: +$31.20". Shown as a fact, colored by sign, no comment.
   - **Play:** a round button bottom-left draws the line from entry to exit over 4 s (markers pop in as reached, 120 ms scale). A scrubber under the chart moves through the window. Reduced motion: no play button, scrubber only.
3. **Why** (only with a hired analyst; without one, the detail shows the sentence and a "Full breakdown: hire an analyst" row) (waterfall, 5 rows + total): Market (GX), Sector, News (count of headlines), Company noise, Fees and slippage, then **Realized**. Each row: label, a bar from the running total, mono amount. Parts must sum to Realized (Quant guarantees within $0.01; the UI shows the total from `explainTrade`, never its own sum).
4. **The sentence**, serif 20 px, under the waterfall.

## Voice
Explains, never judges or advises. Allowed: "came from", "the market fell", "fees took". Banned: "mistake", "you should have", "lucky", "smart". Luck vs skill has its own report (M17).

## Edge cases
- Partial sells: each one is its own entry; markers show all fills of that lot range.
- A trade spanning a world event: the event band (see world events spec) also shows on the replay.
- Trades from before history retention (`MAX_DAILY_BARS`): replay falls back to daily bars; if none, the chart hides and the waterfall stays.
- Crypto fractional qty shows 4 decimals.

## Test ids
`journal`, `journal-row-<id>`, `journal-detail`, `replay-chart`, `replay-play`, `replay-scrub`, `if-held`, `why-waterfall`, `why-total`.

## Acceptance
- Waterfall total equals the order history's realized P&L for that trade to the cent.
- Replay renders from saved history plus fills only (no new storage).
- Screenshot sign-off at 1440 and 390, including a loss, a gain, and an "about even" entry.
