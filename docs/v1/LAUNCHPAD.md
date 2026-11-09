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

**As built.** Server: `recordPoint` (src/server/launchpad/state.ts) appends {tick, atMs, side, tokens, cents, x, sold} to `coin.hist` inside the trade's commit (LaunchpadService.trade, same lock and persist as cash, holdings, cost basis and tape); a launch saves `hist = {since: launch time, dropped: 0, pts: []}`; LP.HIST_KEEP = 500; `parseLaunchpad` checks every point and that the newest equals the coin's curve. GET /api/launchpad/history (src/app/api/launchpad/history/route.ts, LaunchpadService.history) reads under the same lock with no session; the board view (GET /api/launchpad) is unchanged and does not carry the history. Client: src/apps/launchpad/history.ts (parse, model, step geometry, pure) and HistoryChart.tsx (React.lazy chunk inside the lazy Launchpad app): step line held to the next trade, buy/sell volume bars, price and volume scales as text beside the plot, a focusable plot with arrow/Home/End readout (aria-live), a "Show as a table" equivalent, loading/error + Retry/"not updated" (offline: "not live") states, latest-request-wins and a ticker check on every reply. It renders below the ticket, so a review and Confirm are always above it. Tests: tests/unit/launchpad/launchpad-history.test.ts (server, legacy, bound, privacy, restart, parse) and launchpad-history-ui.test.tsx (late reply, keyboard, table, stale/offline, Retry).

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
9. Limit orders: in this unit a listed coin takes market orders only. As built, a limit (or stop) on a listed coin is
   refused MKT_MARKET_ONLY before anything is held, with its own copy ("Listed coins take market orders only." / FR); the
   ticket's preview says the same and Review stays disabled. A market order the book cannot fill at all is refused
   MKT_NO_LIQUIDITY ("The coin's book can't fill any of this order now."). The resting-limit sweep would have to move the
   book inside the cross-ledger sweep commit, which is the next step and is tracked, not faked.

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

**As built (additions found by the plain journey, same unit).**
- Candles from the listing tick: LiveMarket.onList runs after a new listing and the candle recorder samples the new asset
  at that tick (only assets with no bars yet), so a Broker fill in the listing tick has its bar and its volume (before,
  it was dropped until the next clock step). Unit: launchpad-graduation "Broker: market fills…" (bar at the listing tick,
  v = 200,000,000); journey: 2 bars, volume 2,000,000 = the two Broker fills.
- Crossing buyer's result: a selected coin that graduates stays selected, shown as its Graduated panel, and the crossing
  buy's result ("…GULL graduated and is listed in the Broker. Your tokens are a Broker position now.") stays on screen
  there (before, the curve panel unmounted on the reload and took the message with it). An open curve review of another
  player gives way to the Graduated panel the same way (no Confirm on a graduated coin; the server refuses GRADUATED).
- Wealth valuation: positions are valued through one value callback (src/market/valuation.ts centsOf, used by the
  client feed and the board), price decimals converted to cents once.
- Guest after sign-out: the guest demo refuses a dp-8 asset (MKT_UNKNOWN_ASSET); listing for guests stays out of scope.

### Signed-in server-sync loading boundary (same L4 unit, S1-20; recorded before code)

Why: the listing code and the cents conversions L4 needs (plus explicit market-only and no-liquidity copy) cost about
340 B gz of Broker first-load JS. Base leaves 30 B under the unchanged 220160 limit. The evidence is in
evidence/launchpad/budget-l4/BUDGET.md. Lazy-loading one parser was shown not to help: its shared schema dependency only
moves chunk. The boundary below moves the signed-in feed's whole network half instead, which a guest never runs.

Boundary: `src/shell/contracts/serverSync.ts` (new, loaded by dynamic import). It holds every signed-in-only network
step of MockFeed: the /api/market poll and snapshot adoption (with L4 listing adoption), the live candle pull and the
candle history doors, the Wire pull and adoption, the /api/broker/me pull and ledger adoption (offline `me` snapshot
save), and the order door's POSTs (idempotency key, retries, offline / unknown outcome). It also carries the state only
those steps use: pull flags, ledger epoch, Wire epoch and tick. MockFeed keeps the channel transport, the bodies, the
guest demo, preview, and every flag an eager path reads (quotesAdopted, ledgerAdopted, wireAdopted, server candles,
quoteSync timer). serverSync.ts parses with the same strict parsers, unchanged.

Acceptance (all must hold):
1. Guests: no serverSync chunk is requested; the guest demo is byte-identical (same frames, same fills).
2. First live quote: the first /api/market request starts when the first quote, `me` or `news` subscription starts, in
   parallel with the chunk, not after it. Channels stay `loading` until validated server data arrives, as before. There
   is no constructor-book flash.
3. One poller per feed. The interval stays in MockFeed, and stop() / feed swap clears it. A step that waited for the chunk
   checks, when the chunk arrives, that the feed still wants it (subscription present, not stopped), so a feed replaced
   during the load starts nothing.
4. Failed chunk load: nothing cached. The next step (interval tick, Retry, resync) imports again. Meanwhile quotes and `me`
   error only where nothing was shown yet (as a failed read does today), `news` errors likewise, and an order is
   refused as not sent (IntentNotSentOffline: nothing left the page).
5. Auth switch / logout during the load: the old feed's late steps cannot write the new account's ledger anywhere
   visible. The offline snapshot write stays refused unless the account is current (unchanged guard), and the old feed
   has no subscribers.
6. Offline: an order is never sent while offline (unchanged knownOffline check, now also covered when the chunk
   cannot load). The offline screen and snapshot read do not depend on the chunk.
7. Existing contracts validated as before (parseMarketSnapshot, parseBrokerLedger, parseBrokerIntentReply,
   parseWireSnapshot, candle checks). No schema is relaxed, and no private data is cached by the service worker.
8. S1-20 ≤ 220160 on the hooks build, measured once on the proposed boundary from the real module graph.

Blast radius: src/shell/contracts/mockFeed.ts (signed-in methods move out; some members lose `private` so the
boundary module can reach them, documented), the new serverSync.ts, and listings adoption (now called from
serverSync). Callers: useChannel (adoptedServerTick, unchanged), history.ts / PriceChart (serverCandleHistory /
serverCandleChanges, still on the feed, now async through the boundary), and orders.ts (orderDoor, same error classes).
Tests that drive the signed-in feed synchronously (m1-05 adopt*, m1-06, m1-07, m1-08, m1-09, M2-05 offline) must await
the boundary where they used microtask flushes. New targeted tests: auth switch / logout during the load, failed import
then retry, immediate Broker readiness (parallel first read), duplicate mount (one poller), guest (no chunk), offline
order while the chunk cannot load.

As built (head recorded in evidence/launchpad/README.md):
- Boundary exactly as above: serverSync.ts holds the moved methods verbatim (feed members as `this.f.X`), type-only
  imports of the feed, so the feed module is never shared with the lazy chunk. MockFeed.serverSync() imports it once per
  feed; a rejected import clears the cached promise. `srv(step, failed, still)` runs a step only if `still()` when the
  chunk arrives: `has(ch)` for `me`, `news` and candle subscriptions, `quoteSync !== null` for the poll. startQuoteSync
  starts the first /api/market fetch before the chunk and hands that response to the first pullServerQuotes. The order
  door's POST goes through the half; a failed load throws IntentNotSentOffline before anything is sent.
- S1-20 measured once on the proposed boundary (hooks build, real module graph): 218644 ≤ 220160 (1516 under; base
  e946ac83 is 220130, the previous head c5dac328 was 220472). The half is a lazy chunk not requested on /broker first
  load (budget-l4/boundary/). The later Launchpad/candles commits do not touch Broker first load; the final head's S1-20
  e2e is in evidence/launchpad/e2e-hooks-<head>/.
- Tests: tests/unit/shell/server-sync-boundary.test.ts (guest loads nothing; first read before the chunk and reused;
  duplicate mount = one poller; swap during the load runs nothing; failed import then Retry; order with an unloadable
  half is not sent; known offline still sends nothing). Mutations checked: removing the still-check, keeping a failed
  import, or not reusing the first read each fail a test. Test readiness (corrected after GK NO-GO B2 at 4c8d4fbe): the half's load is real
  module I/O, not a timer, so a fixed fake-clock step never waits for it; whether it had loaded depended on the runner's
  transform cache (a lone file cold failed, the full suite warm passed: m1-06:372 3/3 on a clean archive). Every test
  that drives a signed-in feed on fake time now awaits the explicit readiness `serverHalfLoaded(feed)`
  (tests/unit/helpers/serverHalf.ts: the feed's own memoized `serverSync()` promise) before its first clock step: m1-06,
  m1-08 portfolio, m1-09 Wire, m2-01 goal guide, m1-01 feed swap, m2-03 board, the Broker chart helper (m1-07), and
  (found by the clean-archive cold per-file scan at b0b6fc7a) m1-01 signed-in overview, m1-01 account/demo boundary,
  m1-01 auth chrome and the m1-08 header strip; m1-05 already awaited it. The static preloads are removed. No
  assertion, delay, retry or skip changed.


### Book liquidity path, order types and template factors (GK NO-GO B3 at 4c8d4fbe; recorded before code)

**Approved source, exact.** lead-launchpad.md L4 (origin/p10/lp): "Its fills run against the liquidity book account (the
company-stock path, as `supplyAccount` + NPC book; a fill the book cannot cover is partial, never minted)." "Ecology:
the token gets the retail-heavy pool weights of the meme template. Graduated tokens show in the Broker like any crypto
and in Launchpad's Graduated tab." Its code: graduate.ts lists the token with the template def (FROG) and
`supplyAccount: bookId, bookCashBound: true`; trading.ts clearOrders, for an asset with a supply account: "a company
stock's fills run against its NPC book only: a book the state does not hold means no float, so nothing fills; a buy takes
only the float the book holds"; "a bounded book (a Launchpad token, lead-launchpad.md L4) pays for a sell only from the
cash it holds: the fill is cut to what the book can pay, and the order waits when it cannot pay for any (the book is
never in overdraft, nothing is minted)"; the limit is checked against the fill price; routeToSupply books the opposite
side and the commission to the book. So "supplyAccount + NPC book" is one account: the book is the coin's NPC book and
its only counterparty (no other NPC depth exists on this path in p10 either). L6.2 (the NPC cohort's unwind into the
book) is a separate item, not this one.

**Premise corrected.** 4c8d4fbe filled at the bare mark, market only, fee to the sink, and called the rest a base
limit. The p10 path prices every book fill and lets every order type of the engine work against the book. The base
engine does have the primitives (resting day limits with held cash/units, cancel, the per-tick sweep), so "market only"
was not a product rule.

**Mapping onto this base (minimum, existing primitives).**
1. Fill price (p10 tickPrice / halfSpread / impact / marginalImpact, constants copied): mid = the server mark; buy at
   mid × (1 + h + m), sell at mid × (1 − h − m), floored at 0; h = FROG spreadBps 90 / 2 / 1e4 (volScale 1: this base
   has no regime or GARCH); m = the marginal impact of the fill's notional at mid over the coin's decayed same-side flow
   (half-life 360 ticks), impact(n) = impactY 0.8 × σ_daily × √(n / advNotional), σ_daily = the coin's vol / √252,
   advNotional = FROG's 400e6 (graduate.ts copies it). Integer minor units: a buy price rounds up, a sale down (the book
   never pays more than the law). Permanent impact (permanentImpactShare 0.5): after the commit, the coin's path moves by
   sign × log1p(f(before + n) − f(before)), f = 0.5 × impact.
2. Per-tick cap (maxAdvPerTick 3 × advNotional per side per tick, shared by every account): what fills this tick
   counts against it; the rest waits (a limit) or is not filled (a market order).
3. Bounds (bookCashBound): a buy takes at most the book's tokens; a sale is cut to what the book's cash pays at the
   fill price (up to 4 re-pricings, then cut until it pays); nothing is minted, the book is never below 0.
4. Commission: the Broker's exchange fee (this base's one fee schedule, taker 3 bp, min $0.10, as for every asset),
   paid to the book (routeToSupply), not to the sink. Σ player cash + curves' cash + books' cash + sinks stays constant.
5. Order types "like any crypto" = like any asset of this base's server door: market and limit, day tif; stop types are
   refused MKT_ORDER_TYPE_UNSUPPORTED for every asset (the base door has none). MKT_MARKET_ONLY is removed.
   - Market: fills now what bounds 2–3 allow at the priced fill (partial, its fill qty in the ledger); nothing fillable
     now is MKT_NO_LIQUIDITY. A base market order never rests (every asset), so the unfilled part is not kept; a limit is
     the order that waits for the book.
   - Limit: at placement it fills like a market order if the priced fill is within the limit; the rest (or all) rests
     WORKING/PARTIAL with the base reservation (a buy holds remaining × limit + fee in cents, a sale holds its units).
     Each server tick the sweep fills resting coin orders against the book, oldest first across all accounts (placed
     tick, order id), priced and bounded as above, within the limit; a partial fill keeps the rest working. Cancel
     releases the hold (base door). Day tif: no server expiry for any asset in this base (unchanged).
6. Template factors (p10 sim.ts shock, FROG loadings through normalizeLoadings: wMarket 0.25, wSector 0, wCrypto 0.75,
   idio √(1 − 0.625)): the coin's diffusive shock is 0.25 zM + 0.75 zC + idio × t₄. zM = the base index GX's own tick
   step standardized to unit variance (its uniform walk: step / last / (volBp / 1e4 / √3)), 0 when GX did not step; zC =
   one standard normal per tick from a new world stream `lp:crypto` shared by every listed coin. GX and every existing
   asset are read, never redrawn: their paths stay byte-identical. cycleBeta and regime terms are 0 here (no regimes).

**Genuine contradiction (owner product decision, not implemented as a stand-in).** L4: "the token gets the retail-heavy
pool weights of the meme template." In p10 there is no per-asset pool weight: ecology.ts sizes four global pools
(POOL_SIZES value 15, trend 1, retail 4.5, pension 7.5) for every asset, and graduate.ts sets none (it copies the FROG
def). This base has no ecology model at all. Minimum decision: either (a) the L4 ecology line is satisfied by the
template parameters copied above and has no separate effect in this base, or (b) an ecology port (pools) is a separate
unit. Nothing is built for it here.

**Acceptance (before code; tests named in the as-built note).**
1. Multi-holder: a large sale fills only what the book's cash pays at the priced fill (worse than the mark by spread +
   impact), the next holder's market sale gets MKT_NO_LIQUIDITY or a partial, and its limit sale rests and fills on a
   later sweep after a buy brings cash to the book.
2. Limit: placement review/preview valid for a listed coin; marketable part fills, the rest rests with the right hold
   (dp-8 limit converted to cents); partial sweep fill; cancel releases the hold; a buy never fills above its limit.
3. Conservation: tokens Σ positions + book = supply; cash Σ ledgers + books + sinks constant; the book never below 0.
4. Price law exact on a hand fixture (h, m, rounding); the cap binds on a fixture; permanent impact moves the mark only
   after a successful save.
5. Factors deterministic per seed; existing assets byte-identical with and without a listed coin; two listed coins
   share zC.
6. Rollback (failed save leaves ledger, book, flow and mark unchanged), replay by key, restart (book, flow, resting
   orders survive; sweep resumes), old saves without `flow` load, public reads never carry positions or orders.

**As built (B3, same unit).**
- src/server/broker/book.ts: the price law (BOOK_LAW constants from p10 DEFAULT_TRADING + FROG), `fillOnBook` (cap,
  tokens / cash bounds with the 4 re-pricings, then one cut at the best sale price so a cut always converges, limit
  check, fee to the book, flow update, permanent move). Pure; hand-worked in tests/unit/launchpad/
  launchpad-book-liquidity.test.ts "book price law" and launchpad-graduation's fixture header (an independent
  re-computation reproduced every number).
- execution.ts: placeListed takes market and limit (day); the base sweep skips listed coins; `sweepListed` sweeps every
  resting listed order across accounts oldest first; holds convert dp-8 limits to cents (reservedCashCents).
  MKT_MARKET_ONLY is gone (strings, preview, server).
- auth service: the book's `flow` is saved on the coin (LpCoin.flow, strict parse, absent on older saves) and written with
  the book through one check (`withBooks`); `updateOwnLedgerWithBook` runs the fill's `saved` step (the permanent price
  move) only after the persist succeeds, still in the lock; `sweepPrivateStates` takes the listed phase (ledgers and
  books in the same persist, rolled back together).
- Clock: ShockFeed draws the `lp:crypto` factor every tick and reads GX's walk step; MemeProcess.step(zM, zC) and
  shift(move); LiveMarket.impactListed. The path stays not durable (a restart starts it again, M1-05 rule).
- Client: the ticket previews a listed coin's limit like any limit; its estimate adds the 45 bp half spread (the server
  adds the size impact); MKT_NO_LIQUIDITY copy says a limit can wait.
- Measured, not assumed: with FROG's advNotional ($400M) the impact of the book's whole $43k is about 10 bp, so an
  oversized sale still empties the book's cash at about 0.6% under the mark (spread + impact), as in p10. The bound is
  the book (never minted, never overdrawn); the next holder's market sale is partial or MKT_NO_LIQUIDITY and its limit
  waits for buyers. A $0.10 minimum fee on a sale the book can only pay a few cents for nets the seller nothing; that is
  the base fee schedule, unchanged.

### Graduated-coin trader pools (L4 "retail-heavy pool weights", owner pt106u/pt107u; recorded before code)

**Owner decision.** pt106u keeps the feature (build, not defer); pt107u names the source: the documented complete game,
export/vision-review/complete/. The ecology contradiction above is resolved by it, not by p10 (whose pools are global).

**Source, exact.** 05 §6.2: "Each pool is a stylized population of NPC traders with a target position `pos*` (ADV units)
per asset and an order per tick `o = clamp(speed × (pos* − pos), ±rate / ticksPerDay)` sent as an IOC limit at
`lnRef_{N−1} ± (s + allowance)`, where `allowance = 2s` ... Every pool reads only state published at the end of tick N−1
... Pool positions decay toward zero off-book with half-life `PARAM.mkt_pool_pos_hl_days (10)` game days ...
`poolWeights` in `MarketSpec` scales each pool per asset (class defaults below). Pool sizes scale with ADV." Meme class
rows: VALUE `pos* = −capV × tanh(G / g0)`, g0 = 1.0 × σ_d × √5, soft capacity × 1/(1 + 3|pos|), rate 0.9, "crypto 0.5,
meme 0.2"; RETAIL "noise N(0, 1) per hour + 0.5 × tanh(r_1d / σ_d) (chasing) + attention (16 newsworthiness) + 0.3 ×
dip-buying in EXPANSION; × (1 + 2 × |b| / 0.1) when belief is active", rate 0.15, "crypto (1.0), meme (3.0)"; DEGEN
"`pos* = (1 + 2H) × tanh(r_1h / σ_h)`", rate 0.4, classes "crypto alts, meme, perps". TREND, PENSION, CARRY, HEDGER,
ARB, RATES_RV, MANDATE, OPT_HEDGE, CB, TSY do not list meme. 05 §3.3.6 Meme turnover 0.1500 (daily share of size).
T05-14: "capV = 1 ADV (the pool weight scales it)". 06 §3.11.3 hype, per token per game hour: "dH = a · (m + f − H) · dt_h
− b · H · dt_h + shock", m = Wire mentions of the token, f = "clamp(net player buy volume over 24 game hours /
circulating market cap · 20, 0, 1)", a = 0.15, b = 0.06 (MEME). 06 §3.11.4: a new meme token's H₀ = 0.6. p10 L6: "NPCs
never sell tokens they do not hold"; "The NPC cash used is a booked faucet/sink line ... so the world identity closes."

**Dependencies traced to this base.** Present and used: the coin's mark path and permanent impact (B3), its template vol
(σ_d = vol/√252, σ_h = σ_d/√24), the book fill law, the server clock (720 ticks a game day, 30 an hour), player fills on
the book. Absent here (no such system exists for any asset): 16 newsworthiness/attention, 04 regimes (EXPANSION), 05
§6.3 beliefs, 06 hype shocks (news templates, Media campaigns), Wire stories naming a coin (the story catalog is fixed
assets), 07/06 margin and perps (DEGEN liquidations). Those terms are 0 (belief multiplier 1) because their inputs do not
exist, and they are listed as remaining, not as implemented.

**Mapping (minimum, on the B3 book path).**
1. Weights: MEME {VALUE 0.2, RETAIL 3.0, DEGEN 1.0}. DEGEN lists meme with no number; the table's unnumbered classes take
   the default weight 1.0 (reading of the table). A weighted pool is the same population × w: target w·pos*, rate cap
   w·rate.
2. ADV = turnover 0.15 × the coin's supply 1,000,000,000 = 150,000,000 tokens a game day. pos is in ADV units.
3. lnV = the template path without flow impacts (the coin's log mark minus the sum of applied permanent impacts), so
   G = lnRef − lnV is the price's flow-made gap (05: "the rest of every value move becomes a gap G").
4. Per server tick N, once (saved epoch + tick), after the player resting-order sweep, in the order VALUE, RETAIL, DEGEN:
   pos decays by 0.5^(Δticks/7200) (tracking position only); o = clamp(speed × (w·pos* − pos), ±w·rate/720) (VALUE then
   × 1/(1+3|pos|)); qty = trunc(|o| × ADV); an IOC limit at floor(P_{N−1}·e^{3s}) (buy) or ceil(P_{N−1}·e^{−3s}) (sale),
   s = the book's half spread; filled by `fillOnBook` against the book at the tick's mark (same spread, impact, cap,
   fee to the book, cash/token bounds); pos += ±qty/ADV. **speed = 1 per tick: implementation choice** (05 leaves it
   undefined; with 1 the documented rate cap is the binding limit; no tuning).
5. Inputs read at the end of N−1: P_{N−1}, r_1h = ln(P_{N−1}/P_{N−31}), r_1d = ln(P_{N−1}/P_{N−721}) from the clock's
   marks of this coin (a lookback the clock has not yet covered since listing or a restart reads 0). RETAIL noise: one
   N(0,1) per game hour from stream `lp:<T>:retail:<hour>`. H: H₀ 0.6, one update per game hour with m = 0 and shock 0,
   f from the player net buy volume of the last 24 game hours (book token change between pool steps × P, hourly
   buckets, this clock epoch) over (supply − book tokens) × P.
6. Accounts: each pool is an explicit NPC account {cash cents, tokens} saved on the coin. Created once on the first pool
   step after graduation, funded from the booked NPC line `funded` = Σ round(w × ADV × listing price) (cash enough for w
   ADV at the listing price, T05-14 capV; implementation choice), tokens 0. A pool never sells tokens it does not hold,
   never buys past its cash, never borrows; decay moves only pos, never tokens or cash. No token is minted.
7. Public: the Launchpad view's graduated coin carries the pools (cash, tokens, pos), H, funded and the last 20 NPC prints
   (tick, pool, side, qty, price); pool fills count in the Broker candles' volume. Nothing private is added.

**Acceptance (before code).**
1. Observable: after a player graduates a coin, the server's pools trade it on the clock's ticks (real fills against the
   book, candle volume = player + NPC fills), the Launchpad Graduated panel shows each pool's holdings and its recent
   prints, and players' market, limit, sweep and cancel keep working alongside.
2. Hand math: one tick's VALUE, RETAIL and DEGEN orders (targets, clamps, soft capacity, qty, limits, fills, pos) match an
   independent computation; H's hourly update and f match by hand.
3. Weights by behavior: the same world with MEME weights vs weights {VALUE 0.5, RETAIL 1.0, DEGEN 1.0} (the crypto row)
   gives about 3× the RETAIL volume while the cap binds and a lower VALUE response to the same gap.
4. Conservation every tick of a random interleave: tokens Σ positions + book + pools = 1e9; cash Σ ledgers + curves +
   books + pools + sinks = start cash + funded; no account below 0; pools never sell more than they hold.
5. Exactly once: two sweeps at one tick act once; a failed save rolls ledgers, books, pools and marks back and the next
   tick acts; restart (new epoch) keeps the pools' accounts and pos and acts again; an old save without pools loads and
   is funded once; determinism: the same seed and inputs give byte-identical pools.
6. Existing assets' paths and every B3 test unchanged; GET routes read only; no private field in any public read.

**As built (same unit).**
- src/server/broker/pools.ts: MEME_POOL_WEIGHTS {value 0.2, retail 3.0, degen 1.0} (CRYPTO row for comparison only),
  POOL_LAW (rates 0.9 / 0.15 / 0.4 ADV a day, half-life 7,200 ticks, turnover 0.15, g0 1.0, soft 3, limit 3 half
  spreads, hype a 0.15 b 0.06 H₀ 0.6 ×20, speed 1 = implementation choice), ADV_TOKENS 150,000,000, `fundingOf`,
  `newPools`, `retailNoise`, `targets`, `hypeStep`/`hypeF`, `stepPools` (pure). Token amounts are rounded to 1e-6 then
  truncated (a float's last bit never drops a whole token). A pool sale whose fee exceeds its proceeds and its cash is
  skipped (the players' rule). An idle tick writes nothing (the decay composes over the gap).
- Clock: MemeProcess tracks the applied permanent moves (`lnV()` = log mark − their sum); ShockFeed keeps each listed
  coin's last 721 end-of-tick marks and lnV in memory and serves `poolInputs` (P_{N−1}, lnV_{N−1}, r_1h, r_1d, vol);
  LiveMarket.poolInputs.
- BrokerService.sweep: after the players' resting orders (oldest first, unchanged), each graduated coin's pools step on
  the same tick's quote; their fills go through `fillOnBook`, their books, pools and the players' ledgers commit in the
  one persist of `sweepPrivateStates` (rolled back together on a failed save; the permanent moves only after the save);
  their prints count in the candles' volume (fill ids `npc_<epoch>_<tick>_<coin>_<pool>`).
- Saved: LpCoin.pools (strict parse: 12 keys, accounts {cash, tokens, pos}, bounded tape and window); the load-time
  supply check adds the pools' tokens. Public: the Launchpad view's `grad.npc` {h, funded, vol, pools, tape}; the
  Graduated panel shows "Simulated traders" (weights, each pool's holdings and cash, funding, tokens traded, hype, the
  last prints). No private field is added; GET routes stay read-only.
- Tests: tests/unit/launchpad/launchpad-pools.test.ts (hand ticks reproduced by evidence/launchpad/tools/hand_pools.py,
  hype by hand, weights by behavior, the world with players and a random interleave of concurrent requests and ticks,
  exactly once with a failed save, restart and tamper, public read-only, determinism). The B3 tests' conservation
  helpers now count the pools (supply + book + pools tokens; cash identity less the booked funding).

**Remaining full-vision systems (not built here; the L4 requirement is not waived by this list).**
1. RETAIL attention (16 newsworthiness), dip-buying (04 regimes, EXPANSION) and the belief multiplier (05 §6.3): no such
   systems exist in this base for any asset; the terms read 0 / ×1.
2. Hype: m (Wire mentions of the coin: the story catalog names only fixed assets) and shocks (16 news templates, 09
   Media campaigns) read 0; hype's price effects (06 §3.11.3 drift bonus c·H, vol × (1 + 2H), "05 applies") are not
   applied to the coin's path (that changes B3's template path; a 05/06 price-process item). H drives DEGEN here.
3. DEGEN's liquidation flow (07 margin, 06 perps) and TREND/ARB for crypto (meme is not listed for them).
4. The 05 NPC market maker (§3.4/§6.1): in this base the coin's book is its only counterparty (B3), so the pools trade it.
5. 05's off-book decay hands inventory to "background holders"; none exist here and tokens cannot vanish, so the decay is
   on `pos` only and the pools' holdings are bounded by their finite funded cash and what they bought.
6. 20 calibration (stylized facts) and the L8 balance gate. Disclosed risk for it: the pools start with cash and no
   tokens, so early NPC flow can only buy (a pool sells only what it bought), and every pool trade pays the base fee
   (min $0.10) to the book.
7. Durability limits shared with the path (M1-05 rule): the marks the pools read and the 24-hour player-flow window
   restart with the clock (r_1h/r_1d read 0 until the new clock has an hour/day); a tick the sweep did not reach is not
   replayed (the next tick acts once, decaying over the gap).

### Graduated-coin trader inputs: Wire events, attention, regime and hype on the price (same L4 unit; recorded before code)

**Why.** GK fc6d72dc: the pools' accounting PASSES, but the product is PARTIAL. RETAIL's attention, dip-buying and belief
terms read 0, hype has no news input and no price effect (with no players buying, H decays toward 0 in about 3 game
days), and DEGEN never trades in a run with a flat price. This step wires the documented inputs that this base can back
with real committed events and state, and fixes one form error (T05-14 RETAIL `pos* = tanh(signal)`).

**Player outcome (observable).** After a coin graduates:
- The Wire publishes the listing: "GULL lists in the Broker after graduating".
- On that game day the coin's NPC traders trade larger slices (attention ×1.15). The Simulated traders panel shows what
  each pool read: regime, Fear Index, attention, news sign, mentions, hype, and the path's vol and drift multipliers.
- A Wire crisis that moves the GX index (bank or tech hit) moves the coin in the same tick through its market loading.
  The coin is listed in that story's effects, and its candle shows the move.
- A move of 15% or 30% from the day's open is published as a Wire item on the coin. That item raises attention, gives
  retail a news sign, and feeds hype mentions.
- Hype now widens the coin's vol (× (1 + 2H)) and adds to the log drift (3.0·H per 364-day game year, i.e. 3.0·H/364 a game day; an annualized log-drift contribution, not a
  guaranteed or compounded return). DEGEN, which chases the coin's 1-hour
  return scaled by (1 + 2H), trades both ways on the real path. It buys only with its own cash, sells only what it holds,
  and shows "no fill" truthfully when the book is empty.

**Sources, exact (definitions and units).**
- **05 §3.14.1 (l.656–658), ADV:** `ADV_units = turnover × size × (1 + mkt_adv_fear_k (0.01) × max(0, F − 20)) ×
  attention × regimeTurnover`.
  - `attention = 1 + min(1, Σ newsworthiness of today's items on the asset)` (16).
  - `regimeTurnover` = 1.0 / 1.1 / 1.3 / 1.1 for EXPANSION / OVERHEATING / CONTRACTION / RECOVERY.
  - 05 §6.2: "Pool sizes scale with ADV."
- **T05-14 RETAIL:** `signal = n_h + 0.5 tanh(r_1d/σ_d) + newsSign × (attention − 1) + 0.3 × [EXPANSION] ×
  tanh(max(0, −r_1d/σ_d))`, then `× (1 + 2|b|/0.1)` when a belief is active, then `pos* = tanh(signal)`.
- **T05-14 DEGEN:** `× (1 + 2|b|/0.1)` when a belief is active.
- **16 §3.6.2, newsworthiness:** `nw = base_kind × magnitude × reach × novelty × (1 + 0.5·telegraphBonus) × outletFit`.
  - reach 0.3 for a single company.
  - novelty `1 − 0.5^(game days since the last item on the same subject and kind)`.
  - Publish when `nw ≥ news_publish_threshold 0.05`.
  - §3.6.1 source events include "05 halts and large moves", "launches … IPOs".
  - 22 §10.9 base weights: IPO 0.5 ("filing, pricing, first trade"), CRYPTO_INCIDENT 0.55.
- **05 §3.9.2:** large-move levels `mkt_halt_l1 15%` and `l2 30%` vs the previous official close, "each level triggers at
  most once per day". Crypto does not halt (§3.9.1/3), so here they are news levels only.
- **06 §3.11.3, hype:** `m` = "normalized social mentions (16 Wire mentions of the token, 0–1)". `drift_bonus = c · H`,
  c = 3.0 per game year (MEME). `vol_multiplier = 1 + 2H` ("05 applies").
- **05 §3.3:** `σ_ann,eff = sigmaV × 1.15 × √h × m_reg × m_event × m_hype`.
- **05 §3.3.5:** the regime table. A global asset such as crypto uses 04's global regime.
  - EXPANSION: vol 0.90, jump intensity × 0.8, down-probability −0.05.
  - CONTRACTION: 1.45, × 1.6, +0.15.
  - OVERHEATING: 1.05, × 1.0, +0.05.
  - RECOVERY: 1.15, × 1.2, 0.
  - On a change, the multipliers move linearly over 5 trading days.
- **05 §3.3, factor jumps:** "04's crisis hooks deliver factor jumps J_k. Each asset applies X += L_k × (σ_ann,asset /
  σ_ref,k) × J_k".
- **04 §3.3.1–2, regimes:**
  - Base chain and probabilities: EXP→OVH 0.80 / CON 0.20; OVH→CON 0.85 / EXP 0.15; CON→REC 1.00; REC→EXP 0.90 /
    CON 0.10.
  - Mean / minimum days: EXP 819 / 182, OVH 273 / 63, CON 273 / 91, REC 273 / 91.
  - λ = 1/(mean − min). M = exp(Σ w·clamp(z, −2, 3)). Transition when u < 1 − e^(−H), then a second draw picks the target.
  - Genesis EXPANSION (22 §4.12, prehistory "regime EXPANSION throughout").
- **04 §3.14.1, Fear Index:** hourly `F_raw = 100σ(−1.2 + 3(rv21_GX − 0.16)/0.16 + 2(csi − 1) + 2.5 FSI + crisisTerm +
  0.8(T − 50)/50 + 0.5(hack − 50)/50 + 2 max(0, −r_GX,today)/0.03 − 0.5 r_GX,63d/0.10)`.
  - Update: `F ← F + (F_raw − F)(1 − 2^(−1/2))`, genesis 22.
  - Genesis input values (T04-15): rv 0.16, csi 1, returns 0, tension 30, hack 0.
  - "Missing inputs hold their last value" (§3.14.5). The regime's fear z = (F − 50)/20.

**Dependencies traced to this base.**

*Present, used:*
- The GX index walk (volBp 6, so σ_GX = 6e-4/√3 × √(720 × 252) ≈ 0.147 a year), its day closes and today's return.
- The Wire's fixed crisis stories and their realized GX effects (bank −100 bp, tech −150 bp).
- The coin's path, marks and listing.
- The saved pools, with H and the player net-flow window.

*Absent, with the reason:*
- **The Wire crises are not 04 majors.** They are a demo schedule, one every 48 ticks, which breaks 04's limits (one
  major active, 504 days apart). So their `crisisTerm` and `fear_add` are not applied: applying them would pin F at 100.
  They reach the coin only through their real GX move (the factor jump and r_GX,today).
- **Missing inputs:** csi, FSI, tension and hack rate have no 06/07/12/16 source here, so they hold their genesis values.
- **The other regime z keys** (credit, valuation, curve, inflation, house, oil, fiscal, contagion, policy, overheat,
  trade, stimulus) have no 04/07/10 state here, so they hold 0.
- **Belief (05 §6.3).** A belief needs a claim on the asset. The documented sources are:
  - 15 player Wire posts with a structured claim: a social system this brief excludes.
  - 16 rumors, whose subjects must be real pending events; none exists for a coin here.
  - 16 analyst notes: the information tiers, not built.
  - 22 PUMP_CLAIM (+0.10, "player posts, meme spawns"): a player-launched coin is not an NPC meme spawn, and asserting it
    at graduation would be unbacked promotion.

  So no claim on a coin exists, and b = 0 is the inactive case, not a stand-in. The overlay math is built with its first
  claim source. Remaining.
- **Hype `shock` (06: "from news templates (16) and Media-business campaigns (09)").** The only sized ones are 04's
  CRYPTO_FLUSH storm (hype −0.4) and the CRYPTO_WINTER major (hype → 0). Neither is in the live crisis set, and campaigns
  are promotional (excluded). Shock = 0 until 04's storm/major scheduler exists. Remaining.
- **Not applied, and why:**
  - The 1.15 vol scale: it compensates for partial value printing, and this path prints fully.
  - GARCH h and m_event: no crypto crisis hook here.
  - The print shares newsPrint/valuePrint: they belong to 05's maker/lnB model, which is the market-maker step, still
    remaining.

**Mapping (implementation choices marked).**
1. **World inputs, owned by the clock.** New src/server/market/world.ts plays 04's role in this base.
   - Fear F: hourly, from GX.
   - Global regime: a daily 04 step. Each game day draws two uniforms from its own stream `macro:global:regime:<day>`.
   - Both replay from the clock's first tick on a restart, like the stories (M1-05 rule).
2. **Coin news, owned by the clock's Wire.**
   - **Listing.** On a fresh graduation (not a restart relist), an IPO-kind item: magnitude 1 (IMPLEMENTATION CHOICE: a
     listing is the whole first-trade event). nw = 0.5 × 1 × 0.3 × novelty.
   - **Large moves.** Checked at each tick on the published end of N−1 (16: publishTick = eventTick + 1): a move of 15%
     or 30% from the day's open, each level at most once a game day. Kind CRYPTO_INCIDENT 0.55 (IMPLEMENTATION CHOICE: the
     22 table authors no row for 05 moves, and this is its crypto event row). magnitude = min(1, |move| / 0.30) (as built: the simple return from the day's open, the same unit as the 15% / 30% levels).
   - Published only when nw ≥ 0.05.
   - `attention = 1 + min(1, Σ nw today)`. `newsSign = sign(Σ sign·nw today)`, where the listing's sign is 0.
     `m = min(1, Σ nw over the last 24 game hours)` (IMPLEMENTATION CHOICE: the normalization).
   - Items stay in memory with the Wire (a restart publishes no stale listing).
3. **Factor jump on a coin.** When a story's realized effect moves GX by J (log), each listed coin's path moves by
   `wMarket (0.25) × σ_coin,eff / σ_GX × J`, as a value move (lnV moves with it, so no VALUE gap). The coin is added to the
   story's effects.
4. **Path.** Each tick uses `σ = vol × m_reg × (1 + 2H)`, `μ = drift + 3.0·H` (the hype term per 364-day game year, 00 GAME_DAYS_PER_GAME_YEAR, applied as 3.0·H/(720 × 364) a
   tick; the template's drift and vol keep their inherited 252 basis), jump rate × the regime multiplier, and up
   probability 0.5 − the regime's down shift. A regime change blends linearly over 5 × 720 ticks.
   - H is the saved pools' hype. The sweep pushes it to the clock only after its save (a failed save pushes nothing).
   - A relist after a restart carries the saved H. A fresh listing starts at H₀ 0.6.
5. **Pools.** ADV_t = 0.15 × 1e9 × (1 + 0.01 max(0, F − 20)) × attention × regimeTurnover, at N−1.
   - The cap is w × rate × ADV_t / 720 tokens, and pos moves by qty / ADV_t.
   - RETAIL takes the T05-14 signal through tanh. DEGEN and RETAIL use belief ×1 (inactive, see above).
   - Hype takes the Wire mentions m. Shock stays 0.
   - The inputs each step read are saved on the coin's pools (public) and shown in the panel.
   - Funding is unchanged (once, at the base ADV).
6. **Unchanged.** Every existing asset's path and story, the book fill law, the fee, the funding, the save atomicity, the
   exactly-once rule, and GET read-only.

**Acceptance (this step).**
1. **Hand fixtures from the source formulas:**
   - nw and attention for the listing and for a large move.
   - The F step and the regime step: no move before the minimum days; a forced hazard picks by P_BASE.
   - The RETAIL tanh signal with and without the dip and news terms.
   - The path step with H on vs off on the same draws; the factor jump size.
   - ADV_t and the cap (107,812 tokens/tick at attention 1.15, vs 93,750).
2. **Event → hype → target/price → executed volume:** a listing day vs no news; a GX story moving the coin; DEGEN buying
   on a positive 1-hour return and selling what it holds; DEGEN reporting no fill on an empty book.
3. **Kept:** the cash identity, supply 1e9, the random interleave of concurrent requests and ticks, failed-save rollback
   (no hype pushed), restart (saved H relisted, no repeated listing item, regime/F replay), and determinism.
4. **Real plain UI:** the Wire shows the listing item and a crisis whose effects include the coin; the panel shows the
   inputs; candles carry the move; 390/520, account switch, wealth, restart.
5. **Remaining (not claimed):**
   - belief claims;
   - hype shocks (04 storms/majors, 09 campaigns);
   - 04's full Fear Index inputs and majors;
   - the 05 market maker (lnB, square-root ladder, the 06 meme half-spread 1–3% and impactY 1.2 vs the B3 45 bp/0.8, print
     shares);
   - DEGEN liquidations (07/06);
   - 20 calibration and the L8 gate.

**As built (this step; verified by tests and the evidence under evidence/launchpad/).**
- src/server/market/world.ts: `WorldInputs` (F hourly from GX, regime daily on `macro:global:regime:<day>`, 5-day blend),
  `regimeStep`, `fearRaw`, `stepFear`, the 05 §3.3.5 / §3.14.1 tables. The clock observes it once per tick, before the
  path step, on GX's end-of-N−1 mark. A restarted clock starts again at START_TICK, so F and the regime replay.
- src/server/market/coinNews.ts: `CoinNews` per listed coin (listing, 15% / 30% moves, nw, novelty, threshold) and its
  inputs (attention, newsSign, mentions). In memory with the Wire.
- src/server/market/meme.ts: `HYPE` constants; `MemeProcess.step(zM, zC, {hype, reg})` with σ × m_reg × (1 + 2H),
  μ + 3.0·H, the regime's jump rate and down shift, the same draws in the same order whatever the inputs; `jump()` for
  factor jumps.
- src/server/market/shockFeed.ts / clock.ts: hype per coin (H₀ on a fresh listing, the saved H on a relist; set only by
  the sweep's `saved()`), `announceListing` (once per coin per clock), `factorJump` on every story whose realized effect
  moves GX (the coin is appended to the story's effects), coin news Wire items (`wire.news.coinListed`, `coinUp`,
  `coinDown`, citing `lp-grad:<T>` / `mkt-move:<T>:<day>:<level>`, kind NEWS, phase realized, with cause copy).
- src/server/broker/pools.ts: `advTokens(inp)` (ADV_t) for the caps and positions; RETAIL `tanh(…)` with the news and
  EXPANSION dip terms; `hypeStep(h, m, f)`; the inputs read saved as `pools.w` (strictly parsed: 5 keys in range).
  Funding unchanged (once, at the base ADV: the explicit one-time NPC faucet, 13,605,480¢ per coin).
- src/server/launchpad/service.ts + App.tsx: the panel line `lp-npc-inputs` (regime, F, attention, news, mentions, vol
  multiplier, drift), from the saved values (public NPC state only).
- Wire strings EN/FR and causes (lazy chunk).
- Tests: tests/unit/launchpad/launchpad-trader-inputs.test.ts (hand fixtures; independent check
  evidence/launchpad/tools/hand_trader_inputs.py) and launchpad-pools.test.ts (the event chain on the clock, hype pushed
  only after a save, DEGEN trading in the world, restart with the saved H and no repeated listing item, public view).
- Belief, hype shock, the market maker (spread / impactY / print shares), DEGEN liquidations and calibration stay
  remaining, as listed in Acceptance 5.

**Correction after GK NO-GO B1 at 5d450211 (hype drift units).** 06:755 gives c per game year and 00:161 sets a game year at
364 game days. 5d450211 applied c·H on the template's 252-day DT, so its daily hype drift was c·H/252: 44.4% too strong
(H = 0.6: 0.714% vs 0.495% a game day). The fix: the hype term alone uses DT_GAME_YEAR = 1/(720 × 364), so it adds c·H/364 a
game day. The template's own drift, its vol and the pools' σ_d keep their inherited 252 basis (accepted earlier; backlog vs
05:262 crypto Dy 364, unchanged here). The panel and this doc call it an annualized log-drift contribution, not a return.

### Graduated-coin maker/depth prerequisite: source and acceptance before implementation

Smallest player outcome: player market/limit orders and NPC orders share the same finite, depth-sensitive executable
maker; a lower D changes ladder prices/quantities, not the ownership of reserves. Preview and fills use one bound quote
state. No storm producer is included.

Sources: 05 §3.4.2–7 (log-price ladder, Fear/regime/side depth, signed daily tally, transient half-life 15 ticks,
inventory skew and 12% layoff); §3.5 (one clearing price per asset/tick); §3.6/§3.8 (limits and validation);
06 §3.21 and 05 §3.4.6 (meme base HALF-spread 1–3%, not a full spread), 05 §3.3.6 (meme Y 1.2, turnover 0.15).

Acceptance: source-derived grid/lot fixtures for ladder inversion, Fear/regime/inventory D and half-spread, signed-flow
permanent/transient impact and day close; bound-state preview/fill agreement; shared player/NPC execution and priority;
finite cash/holdings, all 1B tokens owned, no new faucet; concurrency, rollback/retry/replay/restart and read-only GETs;
plain-preview buy/sell/resting limit/NPC and affected mobile UI. Existing 45bp/0.8 pricing is not waived.

Source conflict found before executable edits: 05 §3.4.5/§3.13 says the logical maker is not a ledger entity, its layoff
has no posting, and NPC-pool/maker fills have no postings (lines 364, 415–417, 650). In contrast 03 §6.2 (line 1588)
requires NPC liquidity-provider cash/inventory rebalancing against row using LP_REFILL_FROM_ROW, LP_SWEEP_TO_ROW and
LP_INVENTORY_* postings. Neither statement defines a finite token/cash backing for 05's always-available ladder after
inventory exhaustion. This app currently accounts for those same NPC fills and all 1B tokens with a finite book.

Proposed conservative reconciliation: retain the existing finite book as the actual settlement counterparty; cap the
executable ladder by its owned tokens/cash without mint, credit or refill; keep 05's inv/skew/layoff as a separate
signed flow-risk diagnostic (decaying inv transfers no actual tokens or cash). Report exhausted liquidity explicitly.
This preserves the owner's conservation constraint, but deliberately does NOT implement 05's unbounded last-resort
availability or 03's row-refill economics. A full-spec implementation cannot truthfully claim both those semantics and
the finite-book semantics at once. That assessment preceded the owner-bounded finite-book authorization below; the full backing conflict remains open.

**Owner-bounded implementation: finite-book depth execution (not the full maker).** The existing funded book remains
settlement backing. There is no credit, refill, new funding or mint. Source 05 depth/spread/ladder/skew math applies to
player and NPC execution through the same pure fill function. Base half-spread is a disclosed midpoint 2% of 06's
1–3% interval; Y=1.2; quantities are tokens (ADV=0.15×1B with existing attention/Fear/regime multipliers), not the
inherited $400M constant. Execution σ_d uses effective annual vol/√364; inherited template/target time bases do not
change. Fear spread multiplier 1+1.5F/100; D=max(0.2,(1−0.6F/100)×regimeDepth×invSide); invCap=0.5 ADV and skew=−s×
clamp(inv/0.5,−1,1). inv is a separate signed flow-risk statistic, initialized zero for legacy books; no diagnostic
layoff transfers assets. Resource limits remain executable liquidity limits. The source conflict above stays open.

The bounded execution retains synchronous orders and oldest-first resting-limit sweeps; it does not claim the full
uniform-price cross-player auction, lnB/value-print/transient engine, off-book layoff or row backing. Within a tick,
each side consumes a common cumulative log-price ladder; fill price is the endpoint on the minor-unit grid. Limits
and tick bands invert that ladder to whole tokens, never execute past the limit, and can partially fill. Permanent
impact uses the source signed daily net tally (φ=0.5), with observed depth averaged across elapsed ticks; opposite
flow cancels. This is one impact, applied only after persistence. Previews dry-run the exact decision read-only on
current authoritative book/ledger/quote state; matching bound states must give identical fills. Later state can differ.

Additional acceptance: half-depth raises the square-root term by √2, not by deleting reserves; price-grid/fee/finite-cash
bounds; positive/negative flow statistics do not mint or erase tokens; failed persist/replay changes neither stats nor
path; source-derived fixtures and actual player/NPC/limit/mobile/restart evidence. Event scheduling and an inert event
hook are excluded. Neutral GARCH/event/crowding terms are conditional on their absent active sources, not full-spec claims.

The executable-quantity preview row is an estimate at its labeled server tick, not a guaranteed reserved quote.
Market residual cancels; a limit residual rests subject to its existing cash/token hold. The tick reference and
per-side consumed tokens are frozen through the tick (including its price-grid band), so splitting an order cannot
reset the ladder. Legacy six-field dollar flow is readable but starts fresh token statistics on its first new fill.
New flow statistics are strictly validated and saved with the same book; they never substitute for holdings.
