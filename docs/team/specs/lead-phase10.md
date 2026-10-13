# Phase 10 lead rulings: the realism pass (after the v1 hands-on evaluation)

Source: `docs/V1-EVALUATION.md` and the user's own play notes (2026-10-13). Goal: everything a player touches behaves like
its real-world equivalent. Split with the UX fork (agreed): this file covers the tech side. The UX fork owns the shell, window
behaviour, symbol switching in place, multi-symbol layouts, the positions counter and toasts.

## R-10-1 Fills (supersedes R-9-1c)
- The quote is mid +- half the spread. A market order fills at the quote's side plus ITS OWN impact only:
  I(own + q) - I(own), where own is the same account's same-direction filled quantity in that asset, decaying with a 360-tick
  half-life (one account cannot dodge impact by clipping). Other accounts' flow moves the mid (permanent impact) and so shows
  in the quote; it is never a hidden cost on someone else's fill.
- The ticket's estimate calls the same function on the same state, so the preview equals the fill except for the mid's move to
  the next tick (the batch-auction tick stays). The ticket shows est. fill, spread cost, impact cost and fee as separate lines,
  and "fills at the next tick (up to 5 s)". The round-trip and break-even lines are fixed (no double count).
- Gates: the clip gate (720 clips against 1 order, single account, any window start) <= 1.5; a probe shows a $1k large-cap
  market buy within 3 bps of the quote; worlds without player orders keep their fingerprints.

## R-10-2 Spreads and fees by class (real retail references)
- Full spread at normal volatility: large-cap stocks 1 to 3 bps; mid caps 5 to 10; small caps 20 to 40; indices and ETFs 1;
  bond funds 1 to 3; FX majors 0.5 to 1, crosses 2 to 4; crypto majors 2 to 5; alts 10 to 20; memecoins 50 to 150;
  commodities 2 to 5. Spreads widen with the volatility regime (existing volScale) and in halts.
- Fees: stocks and ETFs $0.005 a share, min $1, max 1% of value (IBKR-like); crypto 0.10% taker; FX $2 per $100k (0.2 bps);
  bonds 2 bps; commodities 2 bps; options $0.65 a contract. Fees stay a booked sink.
- Re-run every gate the change can move (ecology, clip, wealth smoke, Launchpad uses its own curve fee and is unchanged).

## R-10-3 Price precision
Each asset has a tick size and display precision: FX 5 decimals (4 for JPY-like pairs, i.e. 3 dp), stocks 2, crypto by
magnitude (4 significant digits under $1), memecoins in DEX subscript-zero notation (0.0₅4123). Every price on every
screen (ticket, watchlist, chart axis, tape, positions) uses it.

## R-10-4 Fractional shares
Stocks and ETFs trade in 0.0001-share steps. Size chips size off buying power and never round to zero; a disabled primary
button always says why.

## R-10-5 A TradingView-grade chart
- Timeframes 1m 3m 5m 15m 30m 1h 2h 4h 1D 1W 1M, independent of the visible range, built from game-time ticks, buckets aligned
  to the game clock, the forming candle live. Range presets only move the view.
- Axes: drag the price axis to scale (done in ux/price-axis), drag the time axis, wheel zoom, double-click reset; auto, log
  and % scale toggles at the bottom right; crosshair with price and time labels; the indicator popover closes on Escape and
  does not swallow the next click.
- Drawing toolbar on the left: cursor and cross; trend line, ray, extended line, horizontal line, horizontal ray, vertical line,
  parallel channel; rectangle, ellipse; Fibonacci retracement (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, plus 1.272 and 1.618
  extensions); price range, date range, date and price range; long position, short position; text, arrow, brush. Magnet mode
  (snap to OHLC), lock, hide all, delete all, undo and redo, an object properties panel (colour, width, style, text),
  keyboard shortcuts as in TradingView (Alt+T, Alt+H, Alt+F, Alt+L, Alt+S, Esc).
- Drawings live in time and price coordinates, per player and per symbol, saved on the server (private, never in another
  player's view), capped in number and size.
- The long and short position tools: entry, take-profit and stop-loss handles plus a time-extent handle; the panel shows
  R:R, distance, risk in $ and in % of equity (both editable, synced), the quantity from the stop distance with the asset's
  own point value, spread and fees, and net P&L at TP and SL. Right-click or Enter: place it as a market, limit or stop entry
  with TP and SL attached as a bracket (the engine's ocoGroup brackets).
- Orders and positions on the chart: entry, TP and SL lines with labels (qty, live P&L on the position line, a close button);
  dragging a pending line or a TP/SL line modifies the real order; the chart reflects the order book state at once.
- The chart reads the active symbol from the Broker; it never opens windows itself (the UX fork owns symbol switching).

## R-10-6 Launchpad like pump.fun
- Board: a grid of cards (generated image, name, ticker, creator handle, market cap in USD, bonding-curve %, reply count,
  time since the last trade), a "king of the hill" banner (the top token by curve progress below graduation), a live
  trades bar ("handle bought $X of TICKER"), sorts (bump order by last trade, market cap, created, replies), search.
- Token page: header (image, name, ticker, market cap in USD, creator, created ago, description); a candle chart on the shared
  chart engine with a price or market-cap axis and timeframes; a trades table (short anonymous trader id, the creator
  marked, buy or sell, USD amount, token amount, time); a replies thread (players post short moderated text; NPC replies from
  the text layer's templates, fictional handles); bonding curve progress ("$X in the curve, graduates at $Y market cap");
  holder distribution (top 20, anonymous ids, the bonding curve and the dev marked); the trade panel with quick buys in $
  (10, 50, 100, 500, max), sells in % (25, 50, 75, 100), slippage, "you receive", fees.
- Create: generated image variants to pick from (no uploads), name, ticker, a description up to 140 characters through the
  moderation filter, the existing template tagline as the subtitle. Launch fee $100 (was $1,000); re-run the Launchpad
  held-out gate with it (lead runs it on the VM); if it fails, the fee goes back up in steps.
- Data fixes: graduated tokens show the engine's live price and market cap everywhere; holder counts include the NPC
  cohorts as anonymous holders; tape amounts in USD; the cooldown and age refusals fill their {hours}; slippage limits shown at
  the precision typed.

## R-10-7 Realism fixes elsewhere
- Returns: the day change is against the prior close's equity; "since you arrived" is against net invested capital (start
  cash plus external cash in, less out), on the Portfolio, the day close and the top strip alike.
- Legal: fee, counsel and total on separate lines; never a negative "cash after"; File disabled below the evidence minimum
  with the reason in Legal.
- Company: receivables days by product type (consumer near 1, B2B 30), the ledger line named "receivables build-up".
- French: rank and licence names, number formats in generated text, no English leaks (an audit test fails on any).
- Rivals: a ladder of fictional rival funds per rank band, so the board always shows rivals near the player.
- Auctions: the week's lots are drawn per rank band; a lot shows its minimum rank.
- Research Desk: a monthly subscription with a one-week trial instead of $55k up front.
- Wire: no verbatim quote reused across two firms in a week.

## R-10-1b Splitting across accounts (lead, after the 10A track)
Measured on p10/fill: a $2M HLCN buy costs 5.55 bps of temporary impact in one account, 2.33 across 10 accounts, 1.32 across
100. Accepted: it needs alt accounts (R-9-2, a recorded V1 limit), the permanent part still moves the mid for everyone, and
linked accounts (the collusion graph) remain visible to surveillance. Real markets have the same property across brokers.
