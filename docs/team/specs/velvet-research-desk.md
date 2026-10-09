# "Why it moved": analyst and Research Desk screens
Owner: Velvet (screens). Build: Forge (`forge-research-desk.md`: unlock, salary, upkeep). Data: Quant (`explainTrade`, `explainMove(state, assetId, fromDay, toDay)` on the M09 cause vector; prices). Tests: Tape (`tape-research-desk.md`). Rules: ROADMAP, "APPROVED 2026-10-09: Why it moved ladder + Research Desk". Mock: `design/velvet-research-desk-board.png`.

## The feel
Mathis wants the desk to feel like insider access. That comes from privacy and quiet, not from glitter. It is a private room where the facts are laid out properly: a dossier with a case number, one serif memo and clean numbers. No padlocks, no "secret" stamps, no glow, no countdowns. Everything it shows is already over; the screen says so, without fuss.

## Ladder at a glance
| Step | Who | Where | Shows |
|---|---|---|---|
| 1. One line | everyone, day 1 | journal row and trade detail | the sentence from `explainTrade` |
| 2. Analyst | hired, weekly salary | trade detail | the full "Why" waterfall for the player's own trades; Senior tier adds news items with their day, and flow by pool type |
| 3. Research Desk | R3 Operator and up, weekly upkeep | More → Research Desk, and "Study this move" on any asset's chart | the same breakdown for any asset over any closed window |

## 1. Free tier (journal)
- Journal row: line 1 and the sentence stay as in `velvet-trade-journal-replay.md`. The 4 px attribution bar is analyst-only (it is the breakdown in another form), so without an analyst the row is two lines.
- Trade detail without an analyst: replay chart and summary as before, then the sentence in serif 20 px, then one quiet row in `fg-muted`: "Full breakdown: hire an analyst" with a chevron. Shown once per detail view, never as a toast or pop-up, never after a loss specifically.

## 2. Analyst
**Hire card** (More → Analyst, or the row above):
- `.label` "ANALYST", serif 32 px "Someone to read the tape for you."
- Two tier rows: **Junior** "Breaks every closed trade into market, sector, news, company noise and fees." **Senior** "Adds which headline and which day, and the crowd's flow by type." Each shows the weekly salary in mono (Quant's price) and "paid a week ahead at the close".
- Brass button "Hire Junior · $X a week". Below, `small` `fg-faint`: "Paid from cash. Held ad or comeback cash can't pay for this."
- Hired state: the card shows the tier, "Paid through Day 41", and "Let go" (ghost). Letting go: no refund; the confirm sheet says so in one line.
- Analyst leaves (salary not covered): one Wire note, "Your analyst left: the salary wasn't covered." No debt, no modal.

**In trade detail:** the "Why" waterfall from the journal spec (Market, Sector, News, Company noise, Fees and slippage, Realized). Senior adds:
- News row expands to the headlines, each with its day in mono ("Day 33 · Harlow cuts guidance"), tap opens the Wire item.
- A "Flow" row between News and Company noise that expands to pool-type rows (below). Junior folds flow into the other rows exactly as `explainTrade` returns it; the UI never computes its own split.

## 3. Research Desk
**Entry:** More → Research Desk, and a ghost "Study this move" button on an asset's chart when a past range is selected. Below R3, the More entry shows "Research Desk · opens at Operator" in `fg-faint`, no button, no upsell.

**Opening (first time and each visit):** a 1 px brass hairline draws down the left edge (420 ms, the folder spine), then the content rows appear with a 120 ms stagger. Reduced motion: no draw, instant.

**Query bar:** asset picker (ticker + name), and a window: two day chips, "From Day 30" and "To Day 37". Presets: Last closed day, Last week, Last quarter, This chapter. The date picker greys every day after the last closed day; today shows "Session open" in `fg-faint` and can't be picked. Default window: the last closed day.

**The dossier** (one scrolling column, phone first; desktop puts it in the centre column at 640 px max):
1. Header: `.label` "RESEARCH DESK · FILE 0412" (mono, the file number is the query count for this save, flavour only), then serif 40 px "HLCN, Day 30 to Day 37", then the move in mono: "−11.40%", GX alongside: "GX −2.10%".
2. **The memo:** serif 20 px, at most 3 sentences, built from the cause vector templates (Quant), e.g. "The sector did most of it. Trend followers were already full and sold into Day 34's guidance cut. Value funds started buying on Day 36." Facts only, past tense.
3. **The waterfall**, in percentage points of the move, not dollars: Market (GX), Sector, News · n, Flow, Company noise, then **Move**. Same bar style as the journal. Parts sum to the move from `explainMove` (the UI shows Quant's total, never its own sum).
4. **Flow by type** (expanded by default here): one row per pool type with a centred bar (buying right in `gain` 70%, selling left in `loss` 70%) and a share in mono: Value funds, Trend followers, Retail, Pensions, Market makers. "Players" appears only under Quant's threshold rule (below). Flavour line under the block in `fg-faint`: "The crowd by type. Nobody is named."
5. **Headlines in the window**, each with its day; tap opens the Wire item.
6. **Chart strip**: the window's daily bars, the shaded window, news pins. No line extends past the last closed day, and no axis room is left for the future.
7. Footer `small` `fg-faint`: "Closed days only. The desk explains, it doesn't predict." and "Upkeep paid through Day 42".

**Saved reports:** every query is kept in "Files" (a list: file number, asset, window, move). Losing R3 later locks new queries but keeps Files readable (Forge's rule). Locked state: the query bar is replaced by "New files open again at Operator." in `fg-muted`.

## No-leak and no-future rules for the screen
- Flow is pool types only. No named player, account or NPC fund, ever, including Hale & Ward, Pinn Partners and Vetch (they are inside the value and trend pools and stay there).
- **Player flow:** in solo, the player's own flow is shown as its own row, "You", because it's theirs. Online, other players' flow appears as "Players" only when Quant's threshold says enough distinct accounts traded that asset in the window; otherwise it's folded into Retail. The threshold (agreed with Quant) is at least 5 accounts and no single account above 40% of the bucket. It is applied to each closed day on its own, and any day that fails is folded into Retail before the window is summed (Forge's fix), so subtracting overlapping windows can't isolate one account. Shares are rounded to whole percent.
- The window's end is clamped to the last closed day in the UI and in the API; the screen never shows a bar, headline or pool row from an open session.
- No forecast language anywhere: banned words "will", "expect", "likely", "next", "target", "signal", "buy", "sell" (as advice), "opportunity", "undervalued", "should". The memo is past tense only.
- The desk never shows the priced-in band for the future, an event's end, or anything from `worldEventView` beyond what the banner already shows.

## Edge cases
- A window containing a test shock (`shockPrice` or `shockValue`): the row reads "Test shock" and the memo says so (Quant's rule), no invented story.
- A window inside a world event: the banner's elapsed-days language only; never the event's length unless it has ended.
- Window longer than history retention: the chart strip falls back to whatever bars exist; the waterfall stays.
- Asset listed mid-window (player IPOs later): the window starts at listing, with "Listed on Day 33" under the header.
- Not enough cash for upkeep: the desk locks like losing R3, Files stay readable, one Wire note.

## Test ids
`explain-line`, `analyst-row`, `analyst-hire`, `analyst-tier-junior`, `analyst-tier-senior`, `analyst-status`, `why-flow`, `why-news-item`, `desk`, `desk-query-asset`, `desk-from`, `desk-to`, `desk-memo`, `desk-waterfall`, `desk-total`, `desk-flow-<pool>`, `desk-headlines`, `desk-chart`, `desk-files`, `desk-locked`.

## Acceptance
- `desk-to` can't be set later than the last closed day (e2e tries today and a future day; both refused).
- No `desk-flow-*` row text contains a player name, account id or NPC fund name (DOM check against the rival names and the save's account list).
- Waterfall total matches `explainMove` to 0.01 percentage point; the UI does no arithmetic of its own.
- Without an analyst, the trade detail shows the sentence and the hire row, and no attribution bar or waterfall.
- Below R3, no desk query UI exists in the DOM.
- Banned-word grep on the memo templates and all desk strings passes.
- Screenshot sign-off at 1440 and 390: hire card, journal detail with Senior analyst, desk dossier, desk locked.
