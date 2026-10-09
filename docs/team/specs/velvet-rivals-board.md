# Rivals board and fund identities (M12)
Owner: Velvet (identities and screen). Build: Forge. Data: Quant `specs/quant-npc-funds.md`. **Mathis's no-leak rule applies:** the board shows names and equity only. No style tags, no holdings, no trade logs, no rebalance dates, no strategy taglines. Mock: `design/velvet-phase1-board-b.png` (panel 3).

## Identities
Monochrome marks only: each rival is told apart by shape, never by a semantic color (gain, loss, warn and info stay reserved for meaning). Marks are 28 px, 1 px `fg-muted` stroke inside a 36 px `ink-2` rounded square. The player's own mark is the brass monogram.

| Engine id | Display name | Mark | Flavor line (no strategy) |
|---|---|---|---|
| `hale` | Hale & Ward | Serif ampersand | "Port Avalon, since 1974." |
| `pinn` | Pinn Partners | Three ascending dots | "Two partners and a very long table." |
| `vetch` | Vetch | A broken V | "Nobody has met Vetch." |

Flavor lines are about who they are, never how they trade. The style names (value, momentum, degen) stay in engine and test code only.

## The board
Lives at Market → "Rivals" (phone: a segment on the Wire tab; desktop: a side-column card under the watchlist, expandable).
- Header: serif "Rivals", and `.label` "NET WORTH · LIVE".
- Rows sorted by net worth: rank number (mono `fg-faint`), mark, name, net worth (mono), change since the player's day 1 (signed, colored), and a 1W sparkline of **net worth only** (`fg-muted`).
- The player's row: brass left hairline, brass monogram, "You". If a rival is directly above the player: a small brass chip on that row, "Next up · $1,240 ahead".
- Passing a rival: a 420 ms row swap and a Wire line "You passed Hale & Ward." on the player's screen only.

## Profile card (tap a row)
Name, mark, flavor line, net worth, change since your day 1, a 1Q net worth chart, and "Days ahead / behind of you". **Nothing else.** No holdings, sectors, trade count or turnover, because together those reveal a style.

## Edge cases
- A rival's net worth drops below the player's: rows swap; no celebration beyond the Wire line.
- Before the player's first trade, the board still shows (it's the minute-4 hook: Hale & Ward at $7,000 is the reachable first rival, which settles conflict C1).
- Online phase (M38): real players appear only through the public boards rules; the same no-leak limit applies.

## Test ids
`rivals-board`, `rival-row-<id>`, `rival-next-up`, `rival-profile`, `you-row`.

## Acceptance
- DOM check: no rival element contains a ticker, a style word (value, momentum, degen, crypto) or a rebalance date.
- Ranks match Quant's rival equity to the cent each tick.
- Screenshot sign-off at 1440 and 390.
