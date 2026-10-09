# Small items: benchmark ghost, priced-in bands, shortcut sheet, copy confirmations
Owner: Velvet.

## Benchmark ghost on the net worth chart (M08)
- A second line, 1.5 px, `fg-faint`, dashed 4/4, no area fill, drawn under the player's brass line.
- Right-axis label: a small `fg-faint` tag with the ghost's value; no price-line glow.
- Under the chart, one mono line: `Equal-weight basket since your day 1: $5,412.80 (+8.26%)`. The player's own number is above it already; no "you beat / you trail" wording.
- Toggle: a chip "Basket" on the chart's range row, on by default. Private to the player.

## Priced-in bands on the Wire (M07, from `wire().band`)
Chips after a news headline, 10.5 px uppercase, 1 px border, no fill:
| Band | Text | Color |
|---|---|---|
| Early | `EARLY` | `brass` |
| Mid | `MID` | `fg-muted` |
| Late | `LATE` | `fg-faint` |
| Done | no chip | — |
Tooltip: "How much of this news the price has shown so far." Never a %, never "buy" or "still time".

## Keyboard shortcut sheet (M10)
`?` opens a centered `ink-1` card, 480 px, two columns, keys as 22 px mono keycaps (`ink-3` fill, `fg` text, 4 px radius), action in `fg-muted`:
`B` Buy · `S` Sell · `1`–`4` Size 10 / 25 / 50 / Max · `Enter` Confirm · `Esc` Cancel or close · `Space` Pause or resume · `/` Find an asset · `?` This sheet.
A footer line: "Nothing executes without Enter." The first time a desktop player opens the ticket with the mouse, a one-time `fg-faint` hint under the button: "Tip: B, S and Enter work too." Hidden on touch devices.

## Copy confirmations
- **C9 business names:** Quant's Phase 0 set is approved for copy: Corner Cart, Phone Repair, Night Clean, Courier Bikes. All fictional, short, and they read well in the ticket and on cards.
- **C1 minute-4 rival:** settled by Quant's spec (Hale & Ward at $7,000). The board marks it with "Next up".
