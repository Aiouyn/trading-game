# Daily close card: "The Close" (M07)
Owner: Velvet (spec). Build: Forge. Data: Quant `dayClose(state, playerId)`. Tokens and rules: `docs/DESIGN.md`. Mock: `design/velvet-phase1-board-a.png` (panel 1).

## What it is
At each game-day close the player gets one small front page, styled like the evening edition of a financial paper: the day's P&L as the headline, the best and worst position, and the one real story that moved *their* money. It gives every session a clean ending and a reason to read the Wire.

## Data (all from `dayClose`, nothing computed in the UI)
`{ day, nwOpen, nwClose, pnl, pnlPct, gxPct, best?: {assetId, pct, usd}, worst?: {assetId, pct, usd}, story?: {headlineId, text, usdImpact, assetId, pricedInBand}, event?: {kind, dayN} }`

## Layout
- Phone: bottom sheet, 88% height, 20 px radius top. Desktop: centered card 520 × auto, `ink-1`, `shadow-brass` off.
- **Masthead** (`label`, centered, between two hairlines): `THE PORT AVALON CLOSE · DAY 12`. The player's name in `fg-muted` small under it.
- **Headline** (Instrument Serif, `hero` 40 px, 2 lines max): "Up $212.40 today." / "Down $86.10 today." / "A flat day." (|pnl| < $1). The amount uses the signed number rules; the sentence stays `fg`, not red or green. Under it in mono `small`: `+0.44% · GX +0.12%`, each number colored by its sign.
- **Two columns**, label + mono: BEST `HLCN +3.20% · +$41.10`, WORST `ASTR −2.05% · −$18.40`. With one position, only BEST shows ("Only holding"). With none: one line, "Cash day. GX moved +0.12%."
- **The story** (card inside the card, `ink-2`): type tag (`EARNINGS`, `MACRO`…), the headline in serif 20 px, then one line: "+$84.20 on your HLCN." and the priced-in band chip (§ small-items). If an event is running: a second line "Day 3 of the crash." (no end date, ever).
- **Footer:** text button **Share** (left), brass button **Done** (right).
- Later (M17): one luck-vs-skill line under the columns, `fg-muted`.

## When it shows
- At the game-day close tick, queued behind a rank-up (rank-up always first) and behind the world-event takeover. Never while an order is pending: it waits for the fill.
- **Only for a day the player was present for.** If `advance` or time away skipped several days, show only the latest close; the rest go to the history list. Returning after time away: While You Were Away replaces it.
- At 4× or 20× speed it shows as a 34 px toast "Day 12 closed · +$212.40" for 4 s; tap opens the card. This keeps it from nagging at speed.
- Weekends: no card.
- History: Portfolio → "Closes" list, newest first, each row reopens the card.

## Motion
Sheet up 420 ms `ease-out`. The headline amount rolls from 0 over 600 ms (the only roll in the card). Columns fade in with a 120 ms stagger. Reduced motion: no roll, no stagger.

## Share (opt-in only, per Mathis's no-leak rule)
Nothing is shared unless the player taps **Share**. The share sheet defaults to **P&L only**: masthead, headline amount and %, GX %, wordmark. A toggle "Include tickers and story" (off by default, not remembered between shares) adds BEST, WORST and the story. Output: a 1080 × 1350 PNG, download only in Phase 0. Never cash, holdings size, qty or order history.

## Voice
Report, never advise. Banned: "should", "consider", "buy", "sell", "opportunity". The headline is a fact, not a cheer: no "Great day!".

## Test ids
`close-card`, `close-headline`, `close-best`, `close-worst`, `close-story`, `close-share`, `close-done`, `close-toast`, `closes-history`.

## Acceptance
- Numbers equal `dayClose` and portfolio math to the cent (Tape's 30 seeded days).
- One card per present game day, never two stacked, never over a pending order or a rank-up.
- At 20× speed only the toast appears.
- Screenshot sign-off at 1440 and 390 (Velvet).
