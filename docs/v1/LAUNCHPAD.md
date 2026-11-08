# Launchpad: first playable loop (owner-restored)
Restored at the owner's explicit request. Code: src/launchpad/rules.ts (shared curve rules), src/server/launchpad/* (server rules, saved section), src/app/api/launchpad/* (routes), src/apps/launchpad/* (lazy app).

## What was inspected
- Base: no launchpad code, app id or route. tests/unit/shell/registry.test.ts pins "launchpad" as a removed legacy app id (V3 17 §2.2 union). V3 06 §3.20 specifies player tokens as "disabled at launch" ($5M fee, R4). V1-BOARD has no Launchpad card. The owner has explicitly asked to restore the feature, so this unit adds it back and records the deviation from those V3 lines.
- Old design of record: origin/p10/lp (and p10/integration, p10/chart, p10/fix, p10/fill, same files): docs/team/specs/lead-launchpad.md (L1–L8 + amendments v1.1/v1.2), src/world/launchpad/constants.ts (LP), curve.ts, launch.ts, moderate.ts, plus app components. Built on a different world engine (src/world/*, the court, buzz/NPC cohorts, graduation through the engine listing path) that does not exist on this base. Not merged; definitions reused.
- sim/memecoin-v3 and docs/MEMECOIN-AUDIT/PRICE-CADENCE: NPC price-action research only (out of scope).
- Active worktrees and branches: none is building a launchpad.

## Reused definitions (p10 LP / lead-launchpad L2, L3)
- Curve: constant product on virtual reserves X0 = $15,000 and Y0 = 1,073,000,000 tokens. A buy gets Y − k/(X + net); a sell pays X − k/(Y + q). Supply 1,000,000,000; 800M sold on the curve (graduation at Y = 273M).
- Fee 1% of notional each way, half to the creator, half a sink. Launch fee $1,000 of game money (owner decision 2026-11-08, replacing p10 R-10-6's $100; see Owner decisions). Ticket default max slippage 5%; a worse fill is refused.
- Limits: one launch per account per 24 real hours; at most 3 live tokens per account. Creator's holding before graduation is at most 10% of supply.
- Ticker 3–5 letters A–Z; name 3–24 characters. A tagline is picked from a template list (no free text, L2 V1). Fictional names only: refuse catalog tickers and names, existing coin tickers, and a short list of real crypto tickers.
- Public tape without handles; the creator's trades are flagged (L1 no-reveal). Other players' holdings are never shown.

## Budget
Guest first-load JS (S1-20 hooks build) does not grow: the registry row, name, glyph and lazy entry are offset by removing seven unused shell strings (S.marketOpen, layouts, more, settingsPalette, settingsMotion, settingsTransparency, accountSavedDemo). The app body, its CSS and the curve rules load only when Launchpad opens.

## Smallest observable outcome
A signed-in player A opens Launchpad, fills in name, ticker and tagline, and reviews the launch. The review shows the $1,000 fee, A's cash after, and that it is fictional game money. On confirm the coin is listed for everyone. Player B (another account) sees it in the list, opens it, and reviews a buy: dollars in, estimated tokens, fee, average price, price impact, cash after. B confirms. B's cash goes down and B holds the tokens. A's cash goes up by the creator half of the fee. The coin's price, sold count and public tape move. B can then review and sell, and receives cash minus the fee. Everything is server-authoritative, persists across refresh and server restart, and stays isolated per account.

## Acceptance
1. Server owns identity, validation, cash effects, idempotency and concurrency. Launch and trade commit inside the auth service lock in one persist, together with the player ledgers. A failed save publishes nothing and changes no cash (memory rolls back). An idempotency key replays its first reply; reusing a key for a different request is 409.
2. Money is integer cents, tokens are integer, curve math uses BigInt and rounds in the curve's favour (k never decreases; the curve's real cash X − X0 always covers sells). Spendable cash = cash − cash held by working Broker buy limits. No free money: total player cash + curve real cash + booked sink is conserved by every operation (unit test).
3. Refusals carry a reason and change nothing: bad name/ticker, taken or real ticker, cooldown, 3 live tokens, not enough cash, curve full (graduation not in this build), over the creator cap, slippage worse than the reviewed fill, selling more than held, unknown coin.
4. Read routes are pure (GET /api/launchpad never writes). Public view: coins, curve state, public tape (no handles; creator flag). Signed-in callers also get only their OWN holdings and spendable cash.
5. Restart: coins, holdings, tape and cash survive a server restart. A Launchpad section that cannot be parsed is kept verbatim, never dropped; Launchpad then reads "unavailable" and refuses writes.
6. UI: lazy app (no first-load growth beyond the registry row; S1-20 hooks ≤ 215 KB and route-budget plain ≤ 215 KB still pass; thresholds unchanged). Review then confirm for every money action, no automatic orders. Copy: fictional coins, game money only, prices move only when players trade in this build, most coins lose value, no guaranteed profit. Guests can browse and are asked to sign in to launch or trade. Works with keyboard, at 390 and 520, and desktop.
7. Proof: plain production preview at the exact head. A signs up → launches → B signs up → finds it → buys → sells → refresh → account switch → server restart. Ledger and Launchpad values compared with the server API. 390 and 520 layouts, keyboard.

## Deliberate deviations (to record for Gatekeeper / owner)
- The p10 launch gates "rank R1 or higher" and "account age ≥ 3 real days" are not enforced: approved by the owner on 2026-11-08 (see Owner decisions).
- App id "launchpad" is added back to the registry (the V3 17 union listed it as legacy-removed).

## Owner decisions
- 2026-11-08, answered directly by the owner in the gate-choice widget ("immediatly, with the 1000 game-money fee, I prefer"): new accounts can launch immediately, with no rank R1 gate and no 3-day account-age gate; the launch fee is $1,000 of game money (`LP.LAUNCH_FEE` = 100,000 cents), not the old $100. Every other limit is unchanged: 24 h cooldown, 3 live coins per creator, 1% trade fee (half to the creator), 5% slippage limit, creator cap. This approves the feature parameters only, not a merge or deploy.
- The fee is debited once, in the launch's single persist, from spendable cash only (cash held by working Broker buy limits is never spent) and goes to the sink. A stale review that sends another fee is refused (FEE_CHANGED). History saved under the $100 fee is kept as saved: coins, holdings, cost basis, sink and receipts are not re-charged or reinterpreted, and an old receipt replays its old reply.

## Remaining steps (not in this unit, recorded rather than omitted)
- Graduation (L4): see the Graduation section below (corrected after Gatekeeper NO-GO B1 at 6ac2b3b1).
- Creator allocation and vesting (L5; the allocation is fixed at 0 here). Rug flag and cases (L5).
- Buzz/hype, NPC retail, snipers and death (L6): prices move only when players trade.
- Buzz items, candles and timeframes (a per-trade price/volume history chart exists, see below), market-cap axis, Trending/Graduated tabs, holder buckets, replies, icons (L7). Moderation beyond the minimal fictional-name checks. The balance gate (L8).
- French copy.

## Coins in account wealth (same unit, before Gatekeeper)
- One valuation (lead-launchpad L8.1, "valued at liquidation (exit fee and slippage), not at spot, in the gate and in net worth"): `liquidationCents(curve, qty)` in src/launchpad/rules.ts = `quoteSell(curve, qty).pay`, what selling the whole holding alone, now, would pay after the 1% fee and the curve's price impact (0 when too small to sell). It is an indicative estimate, not a quote: each holder's estimate assumes they sell first, other trades move the curve, and a real sale is bounded by its own review's 5% floor. Copy says so (Portfolio and Launchpad).
- Cost basis: `costs[account][ticker]` in the saved Launchpad section (cents spent, fees included); a sell removes the sold share pro rata; selling all clears it. Parsed strictly: costs must mirror holdings exactly. P&L = value − cost, both from the server.
- Counted once: NW = cash (reserved cash stays inside it) + Broker positions at the server mark + Σ coin value. The creator's fee share is cash only; the sink and the curves' reserves belong to nobody.
- Read in one locked step with the cash ledger: `AuthService.readOwnLedger` (GET /api/broker/me) and `updateOwnLedger` (Broker order/cancel replies) return the ledger and the caller's own coin rows together; `readStandings` gives the board each account's coin total only. The board still sends only handle, NW and rank.
- Client: the strict Broker ledger schema has `coins` (`{ticker, qty, value, cost}`, integer cents); the signed-in feed adds Σ value to `me.nw` (Portfolio hero, header NW, goal) and passes the rows to Portfolio's separate "Launchpad coins" block (≈ value, cost, P&L). A malformed coin row refuses the whole ledger (NW unavailable, never cash-only).
- Launchpad section unavailable (quarantined for repair): Broker ledger, Broker order/cancel and the board answer 503 LAUNCHPAD_UNAVAILABLE before any write, rather than state a cash-only wealth.
- Offline snapshot: own coins {ticker, qty, cost} are allowlisted and listed on offline.html ("Launchpad coins"); no value (market data). A record without the coins key is refused.
- Budget: S1-20 stays ≤ 215.0 KB (threshold unchanged). Offsets were dead copy only: Broker `haltedHelp` (never shown) and `orderKind` (duplicate of `kindDay`), and the Launchpad glyph drawn as one path. Portfolio's coin copy lives in Overview.tsx (lazy) since portfolio/strings.ts is on the Broker route's first load.

## Coin price / volume history (next unit, recorded before any code change)
Inspected first: old p10 (origin/p10/chart: LaunchChart.tsx wraps the full Broker PriceChart with drawing tools and studies; CandleChart.tsx folds world-engine tick/minute/hour bars produced by NPC flow that does not exist here), lead-launchpad L7 ("price chart (ticks)"), this base's Broker chart (src/components/market: lightweight-charts plot, a separate lazy chunk, fed by server quote candles on the market clock) and the saved Launchpad section (each coin keeps only its last 20 tape prints, with no price on them). Nothing records a coin's price over time today, so the history is new, minimal and recorded by the trade itself. The Broker chart stack is not copied (its candles, studies, drawings and live merge are keyed to market assets and the market candle store); the Launchpad draws its own small SVG step chart inside its already lazy app, with no new dependency.

**Smallest observable outcome.** A player selects a coin and sees its recorded trade timeline: one point per executed trade, the price after that trade and that trade's volume, starting from the launch price. When anyone buys or sells, the saved history gains exactly one point, the chart shows it on the next read, and it is the same after a reload and a server restart. A replayed request, a refused trade or a failed save adds no point.

**Definitions (labelled in the UI).**
- Price = the curve's spot price after the trade, x / (Y0 − sold), the same number the coin row and panel already call "Price" (priceText). Not the trade's average execution price, and not the liquidation estimate used for net worth.
- Volume = the game dollars of that trade as on the public tape: paid on a buy (fee included), received on a sell (after the fee).
- The x axis is trade order (one step per trade, oldest left), with each trade's time in the readout and table. Nothing is interpolated, smoothed, seeded or invented; with no trades the chart shows only the launch price.

**Acceptance.**
1. Recording: the trade commit appends one point {tick, atMs, side, tokens, cents, x, sold} to the coin's saved history in the same persist as the cash, holdings and tape (memory rolls back on a failed save, so no point is published before its trade is saved). Replay and refusal add nothing. A launch starts an empty, complete history. Server trade, fee and wealth rules are otherwise unchanged.
2. Bounded: at most LP.HIST_KEEP points per coin; older points are dropped with a saved `dropped` count and the UI says so. Parsed strictly (bad history quarantines the section like any other bad Launchpad data; the last point must equal the coin's curve).
3. Legacy: a coin saved before history existed has none. Its first trade afterwards starts the history from that trade (or from the launch when it had never traded) and the UI says earlier trades are not charted. Never back-filled.
4. Read: GET /api/launchpad/history?ticker=XXX is public, read-only (no session refresh, no save) and returns only the curve points above: no account ids, handles, order ids, receipts, creator flag or holdings. Unknown coin 404, bad ticker 400, unavailable section 503.
5. UI (lazy, no first-load growth, S1-20 thresholds unchanged): price and volume scales labelled at desktop, 520 and 390; a keyboard readout (arrow keys, Home/End) and a table equivalent; loading, error with Retry, "not updated" when a refresh fails or the device is offline (last saved history kept, labelled), empty state. A late reply for another coin or account is dropped. The chart sits below the ticket so it never covers a review or Confirm.
6. Proof: plain exact-head preview, readiness checked once: A creates, B buys and sells; chart points equal the saved history and tape (price and volume), readout and table, reload, coin A→B switch, server restart, 390 and 520. Automated checks are kept apart from any human look.

Out of this unit: candles and timeframes, market-cap axis, Trending/Graduated tabs, buzz, NPC flow, graduation, vesting, court, social.

**As built.** Server: `recordPoint` (src/server/launchpad/state.ts) appends {tick, atMs, side, tokens, cents, x, sold} to `coin.hist` inside the trade's commit (LaunchpadService.trade, same lock and persist as cash, holdings, cost basis and tape); a launch saves `hist = {since: launch time, dropped: 0, pts: []}`; LP.HIST_KEEP = 500; `parseLaunchpad` checks every point and that the newest equals the coin's curve. GET /api/launchpad/history (src/app/api/launchpad/history/route.ts, LaunchpadService.history) reads under the same lock with no session; the board view (GET /api/launchpad) is unchanged and does not carry the history. Client: src/apps/launchpad/history.ts (parse, model, step geometry, pure) and History.tsx (React.lazy chunk inside the lazy Launchpad app): step line held to the next trade, buy/sell volume bars, price and volume scales as text beside the plot, a focusable plot with arrow/Home/End readout (aria-live), a "Show as a table" equivalent, loading/error + Retry/"not updated" (offline: "not live") states, latest-request-wins and a ticker check on every reply. It renders below the ticket, so a review and Confirm are always above it. Tests: tests/unit/launchpad/launchpad-history.test.ts (server, legacy, bound, privacy, restart, parse) and launchpad-history-ui.test.tsx (late reply, keyboard, table, stale/offline, Retry).

## Graduation (L4) — corrected after Gatekeeper NO-GO B1 at 6ac2b3b1, recorded before any code change

**Why corrected.** 6ac2b3b1 kept a graduated coin trading inside the Launchpad against a constant-product book. That is not
L4: lead-launchpad.md L4 (origin/p10/lp docs/team/specs/lead-launchpad.md, and its code origin/p10/lp
src/world/launchpad/graduate.ts) makes the token a runtime crypto asset through the engine's listing path, priced by the
engine with the meme template, filled against the liquidity book account, with the holders' balances turned into engine
positions in the same tick, shown in the Broker and in Launchpad's Graduated tab. "Unsupported in this base" meant "not
built". The stand-in, its MODE_CHANGED/pool review and its acceptance items are withdrawn; the stand-in was never an
owner decision.

**What is reused unchanged from 6ac2b3b1** (GK safety PASS): the trigger (a buy reaching the last token is clipped to the
tokens left, the buyer pays only for what fills, the review says so first), the fee (raise R = curve cash − X0; fee =
round(1.5% × R), a sink), the seed (book = R − fee cash and 200,000,000 tokens, allocation 0; nobody owns it), "once" in
the crossing buy's own commit, MAX_LIVE counting live coins only, the curve fee rules before graduation.

**This base's engine (inspected).** One authoritative server clock (src/server/market/clock.ts LiveMarket → ShockFeed →
MockFeed): 720 ticks a game day, seeded per-asset streams (assetRandom keeps the first eight assets' stream untouched),
quotes in `ticker:wl_default`, candles sampled from it (src/server/market/candles.ts), the Broker door
(src/server/broker/execution.ts) filling at the server mark with NPC liquidity, the catalog a compile-time list
(src/market/catalog.ts, mirrored to clients). Nothing could add an asset at run time.

**L4 mapped onto it (the listing journey of this unit).**
1. Listing path: a runtime `appendAsset` (src/market/listings.ts) adds one def to the catalog (ASSETS, ASSET_BY_ID, the
   default watchlist) and bumps the list version; the clock gives it its own state and stream. The market snapshot carries
   `listVersion` and the listed defs, so clients get the def (L4 "list-version bump so clients get the def"); /api/world's
   catalog includes it. Def: assetId = ticker = the coin's ticker, its name, class `crypto`, sector `Crypto` (v1.1
   ratified: no 'meme' sector key), ccy FDL, licence LIC1, qty in whole tokens, price in 8 decimals (the curve's last price
   is about $0.000216; cents cannot carry it), initial price = the last curve price (x/273M, rounded to 1e-8 $),
   sharesOutstanding = the supply (1B; the book plus the holders' positions).
2. Price: the meme template of p10's universe (FROG; graduate.ts draws vol = 1.9 + 0.1u and drift = −(0.15 + 0.1u) from the
   token's own stream) stepped by p10's per-tick law: dt = 1/(720 × 252); diffusive log step (μ − σ²/2)dt + σ√dt·t₄ (unit
   variance Student-t, ν = 4, p10 config); Kou jumps at FROG's 20 a year (up with p 0.5, log size exponential with mean
   0.25 up, 0.22 down); floor 1e-7 $. Own stream `lp:<TICKER>`, so every existing asset's fingerprint is unchanged.
   GENUINE GAP (reported, not substituted): this base has no factor model, regime, GARCH, value pull or ecology, so the
   template's wMarket/wCrypto co-movement and L4's "retail-heavy pool weights" have nothing to attach to; the whole
   variance is idiosyncratic here. Fills do not move the price (this base's Broker has no impact model).
3. Fills: Broker market orders on the coin fill at the server mark against the book account (`coin.book` {cash, tokens}
   in the Launchpad save, nobody's ledger): a buy takes tokens out of the book and pays it the notional; a sell gives it
   tokens and is paid from the book's cash. What the book cannot cover fills partly, never minted; nothing fillable is
   refused. Fee: the Broker's exchange fee (taker 3 bp, min $0.10), a sink, as for every Broker fill. Ledger, book and fee
   commit in one persist under the auth lock, replayed by the Broker's own idempotency key. Limit orders on a listed coin:
   see item 9.
4. Positions in the same tick: in the crossing buy's commit every holder's Launchpad balance becomes a Broker position
   (qty, avgCost = their saved cost basis ÷ qty, fees included) and leaves the Launchpad holdings; the Launchpad has no
   market for the coin afterwards (a Launchpad trade on it is refused GRADUATED, pointing to the Broker). Tokens: Σ
   positions + book tokens = 1B, checked when the save loads. Cash: Σ player cash + live curves' real cash + books' cash
   + sinks (Launchpad sink + Broker fees) is unchanged by every step.
5. Discovery: the Broker watchlist shows the coin like any asset (quote, chart, ticket, positions); Launchpad gets a
   Graduated tab (graduated coins: raise, fee, book, Broker price, "Open in Broker").
6. Wealth: positions are valued like any Broker position (qty × server mark, price decimals converted to cents once, in
   src/market/valuation.ts), so Portfolio, the header and the board agree; the Launchpad adds no value for a graduated
   coin (its holdings moved), so nothing counts twice.
7. Candles and feed: the clock's quote feed and candle recorder include the listed coin from its listing tick; Broker fills
   add candle volume like any fill. The Launchpad price history ends at its labelled graduation step.
8. Restart: the save holds the graduation, the book and the positions; at start the server lists every graduated coin
   again before serving quotes. As for every asset in this base, a restart starts the clock's seeded path again
   (documented M1-05 rule), so the coin's price path restarts from its listing price.
9. Limit orders: in this unit a listed coin takes market orders only (a limit is refused MKT_ORDER_TYPE_UNSUPPORTED before
   anything is held): the resting-limit sweep would have to move the book inside the cross-ledger sweep commit, which is
   the next step and is tracked, not faked.

**Acceptance.**
1. Threshold: the crossing buy is clipped and its review says so; status/progress are truthful before.
2. Once and atomic: one persist clips the buy, books the fee, seeds the book, moves every holder's balance to a position
   and marks the coin graduated; replay returns the first reply; a concurrent second crossing buy sees the graduated coin
   and is refused GRADUATED; a failed save leaves the coin live, no position granted, no listing, nothing charged.
3. Listing: after the commit (and after a restart) the clock quotes the coin, the snapshot carries its def and list version,
   /api/world's catalog has it, candles sample it; the existing assets' prices are byte-identical to a world without it.
4. Broker: market buy and sell fill at the mark against the book, partial when the book cannot cover, never minted; fee
   to the sink; idempotent by key; refusals change nothing; failed save rolls back ledger and book together.
5. Conservation of cash and tokens across launch, curve trades, graduation and Broker fills (item 4 of the mapping).
6. Wealth coherent before/after: before = cash + Launchpad liquidation value; after = cash + position at the mark; Portfolio,
   header and board agree; no double count; history labels curve → graduation, the Broker chart from the listing on.
7. Reads read-only and private-payload safe: listing defs, book and quotes are public; positions only in the owner's
   ledger; no holder ids in any public read.
8. Old saves: a base-format save (no graduation) loads unchanged. A 6ac2b3b1 stand-in save with a graduated coin (holdings
   still on the Launchpad, book trades in its history) is refused as unloadable (503, preserved verbatim), never converted
   silently: that format was never merged or shipped.
9. Proof: unit tests with hand-worked fixtures; plain exact-head preview with the real UI and organic fresh accounts (as
   6ac2b3b1): launch, curve buys to graduation, the coin in the Broker and the Graduated tab, Broker review + buy + sell,
   positions/Portfolio/header/board, candles/feed, reload, restart, account isolation, 390/520 + keyboard.

**Not in this unit (tracked).** Limit orders on listed coins (book-bound sweep); the NPC cohort's unwind (L6.2; this base has
no NPC cohort); the graduation Wire item and creator notice; vesting (L5.1, allocation 0); ecology/factor loadings (no such
model here); death (L3); listing for the signed-out guest demo (guests run a local demo market).
