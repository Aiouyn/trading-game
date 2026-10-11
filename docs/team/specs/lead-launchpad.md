# Launchpad (memecoins), lead spec v1 — Phase 5

Status: lead rulings, binding for Phase 5. Commit this file as `docs/team/specs/lead-launchpad.md`.
Units: 1 game day (gd) = 1 real hour = TPD (720) ticks. Money is game dollars. R1 (Hustler) is $20k peak NW.

## L1. Scope and placement
- World layer: `src/world/launchpad/*` (state, curve, buzz/NPC flow, graduation, rug cases, views). The engine is touched only
  at graduation (a runtime asset through the existing listing path) and by nothing else.
- Client: the Quay app `launchpad` (`src/components/apps/launchpad/*`), made visible in `src/shell/apps.ts`.
- Determinism: one seeded stream per token, `lp:<TICKER>`, plus `lp:world` for launch-independent draws. Snapshot + command
  log replays byte-identical. A world with no launch keeps every existing fingerprint (prices, ecology, Tape).
- No-reveal: other players' holdings are never shown. A token page shows holder buckets (top-10 share of supply, number of
  holders) and the public tape (time, side, size, price) without handles, EXCEPT the creator's own trades, which are public
  and flagged (the creator is a public role, like a founder's filed trades).

## L2. Launch
- Gate: rank R1 or higher; account age at least 3 real days; not under a launch ban (L6).
- Inputs: name (3 to 24 chars), ticker (3 to 5 letters A-Z), one tagline picked from a template list (no free text in V1),
  creator allocation 0 to 5% of supply (chosen at launch, public), optional dev buy (see L3 cap).
- Icon: generated deterministically from the ticker hash (procedural SVG: shape, two palette colours, a glyph). No uploads.
- Fee: $1,000 launch fee (a booked sink). Limits: one launch per account per 24 real hours; at most 3 live (not graduated,
  not dead) tokens per account.
- Names: the moderator template filter (`src/world/launchpad/moderate.ts`, later the Phase 7 moderator role). Normalise
  (case, accents, leetspeak 0>o 1>i 3>e 4>a 5>s 7>t @>a $>s, spacing and punctuation), then refuse: slurs and abuse
  (a blocklist), real crypto names and tickers (BTC, ETH, SOL, DOGE, SHIB, PEPE, BONK-real etc.: a list), real brands and
  public figures (a list), and any existing asset id or name in the world (live or delisted) or a token ticker used in the
  last 30 gd. Fictional names only. Refusals in three parts (what / why / do), en and fr.
- Supply: 1,000,000,000 tokens, fixed. 800M are sold on the curve. The creator allocation (0 to 50M) is minted to the
  creator, locked (L5). The rest of the 200M (150M to 200M) seeds the liquidity pool at graduation (L4).

## L3. Bonding curve (before graduation)
- Constant product on virtual reserves: cash X, tokens Y, X*Y = k. Start X0 = $15,000 (virtual), Y0 = 1,073,000,000.
  Start price X0/Y0 ($0.00001398; start market cap about $14k). The curve sells at most 800M tokens; when it has sold them
  (Y = 273M) the real cash raised is about $43,950 and the price is about $0.000216 (market cap about $216k): graduation.
- A buy of $c (after the fee) gets Y - k/(X + c) tokens; a sell of q tokens pays X - k/(Y + q) (before the fee). The curve
  is its own world account (`lp:curve:<TICKER>`): every fill moves cash between the trader and that account, so the world
  zero-sum holds with no Street term. A sell can always be paid from the real reserve (constant product guarantees it).
- Fee 1% of notional each way: 0.5% to the creator (booked income), 0.5% a sink.
- Slippage: the ticket shows the expected fill, average price, price impact and a max-slippage setting (default 5%); a fill
  worse than the setting is refused (three-part copy).
- Creator cap before graduation: the creator's allocation plus everything the creator buys on the curve is at most 10% of
  supply. Owner-linked accounts (alliances, as in Phase 4) count toward the cap.
- Death: a token with no trade for 24 gd, or whose curve cash is under 2% of the graduation raise for 7 gd after day 3, is
  dead: it leaves the feeds (still listed under the creator and holders), and its curve still pays sellers.

## L4. Graduation
- When the curve has sold its 800M, the token graduates at the end of that tick: graduation fee 1.5% of the raised cash
  (a sink); the rest of the cash plus the LP tokens seed a liquidity book account (`lp:book:<TICKER>`), locked forever (no
  one owns it: no LP rug). The token becomes a runtime crypto asset through the engine's listing path (appendAsset with the
  list-version bump so clients get the def), `assetClass: 'crypto'`, sector 'meme', priced by the engine with the meme
  template of the universe (vol about 1.9 to 2.0, drift -0.15 to -0.25, jumps about 20 a year, wCrypto high: copy the
  parameters from FROG/BONK), `initialPrice` = the last curve price, `sharesOutstanding` = supply.
- Its fills run against the liquidity book account (the company-stock path, as `supplyAccount` + NPC book; a fill the book
  cannot cover is partial, never minted). Holders' curve balances become engine positions in the same tick.
- Ecology: the token gets the retail-heavy pool weights of the meme template. Graduated tokens show in the Broker like any
  crypto and in Launchpad's Graduated tab.

## L5. Anti-rug
- The creator allocation is public and vests: cliff 2 gd after launch, then linear to 14 gd. Locked tokens cannot be sold or
  transferred (reuse `restrictions.ts` lockedQty).
- Every creator sell is a public line on the token page; a creator sell of 1% of supply or more in a day is a Wire item.
- Rug flag: the creator (with owner-linked accounts) sells 50% or more of their holding within 24 gd after graduation, or
  sells 3% of supply or more in one gd while the price falls 40% or more that gd. The flag is public on the token page.
- Suable: a holder who bought in the 7 gd before a flagged dump can file a `rug` case through the Court (`court.ts`, new case
  kind). Damages = the holder's realised loss on the token (FIFO, from the ledger) capped pro rata at the creator's proceeds
  from the dump. Verdict on the existing S5-style fine scale; the creator is banned from launching for 8 weeks. Wrongful
  flags must be rare: honest vesting sells spread over time do not trigger the flag (test it).

## L6. Hype (buzz) and NPC flow
- Each live token has a buzz state B >= 0 (stream `lp:<TICKER>`). At launch B is drawn from a heavy-tailed law (most low,
  a few high). Per tick: B decays (half-life 2 gd); it rises with net player buys (copycat retail, mild); it takes rare
  viral shocks (a jump law tuned so that only a few percent of launches graduate). Buzz items (below) add to B.
- NPC retail trades on the curve each tick: net flow = (buy pressure from B) - (profit taking, which grows with the price's
  rise since the NPC cohort bought and with time). The NPC cohort's token balance is tracked; NPCs never sell tokens they do
  not hold. Over a token's life NPC flow is about net-zero in tokens. The NPC cash used is a booked faucet/sink line
  (`npcRetail` in the economy tallies), so the world identity closes.
- NPC snipers: at launch, a seeded small NPC buy in the first ticks that dumps into early hype (it takes the easy edge so
  players cannot farm it).
- Buzz items (bought by any player for a token, public, shown "Sponsored"): a Quay billboard ($500, +B small, half-life
  6 ticks) and a Wire promo ($2,000, +B medium, half-life 1 gd). They are sinks. Max 3 per token per gd. They must not make
  pump-and-dump +EV (gate L8).
- Rumor items on the Wire for the top trending tokens, from templates (Phase 7 rumor role later).
- Expected shape (gate): at least 70% of launches dead within 7 gd; graduation rate 1% to 5%; a graduated token reaching
  10x its graduation price within 30 gd in at most 0.5% of launches.

## L7. App (Launchpad)
- Tabs: New (fresh launches with the curve progress bar), Trending (1-gd volume), Graduated, Holdings (own tokens,
  locked/unlocked, fees earned), Create (form + creator console: vesting schedule, creator fees, buzz items, rug status).
- Token page: icon, name, ticker, tagline, creator handle, allocation and vesting, curve progress to graduation, price chart
  (ticks), public tape (no handles, creator flagged), holder buckets, buy/sell ticket with the fill preview and slippage,
  the 1% fee shown, the rug flag and "File a case" when eligible.
- Every string through i18n (en and fr). Figures never truncate. Works at the app's minimum window and on phone 390.

## L8. Gates
- `scripts/balance/launchpad.ts`, 200 seeds, each a world with NPC launches at a realistic rate (about 20 a gd) plus bot
  strategies: creator-dump (launch, max allowed buys, buzz items, dump at vest), sniper (buy every launch at its first tick,
  sell at +X% or after N ticks), graduation flipper, buzz pumper, random retail player. Benchmark: buy-and-hold of the GX
  index over the same horizon and the same starting cash.
- Pass: every strategy's mean return minus buy-and-hold is <= 0 at one-sided 95% (CI over seeds), the L6 shape holds, and
  the world money identity closes to the cent each day with the booked sinks (launch fee, curve fee half, graduation fee,
  buzz items) and the `npcRetail` line.
- Vitest: curve math (exact constant product, fees, refusals), vesting, caps, moderation (normalisation cases), graduation
  (positions moved, asset appended, config version bumped, client mirror has the def), rug flag (positive and honest
  negative cases), rug case damages, determinism/replay, no-reveal of the view, snapshot load of an old world.
- Playwright: launch flow, buy and sell on the curve, graduation (admin seam to fill the curve), token in the Broker after
  graduation, layout at the minimum window and on phone, en and fr.

## Amendments v1.1 (lead, after the stage A review and the 50-seed gate)

The 50-seed gate failed with flipper +22.7% and retail +4.6% excess. The cause is structural: NPC buy flow followed a buzz
stock with a 2 gd half-life (persistent, autocorrelated flow, so any follower earns the momentum), and the NPC cohort sold
only at a profit (bags never return, so the NPC side is a net buyer: a faucet to players). Parameter tuning cannot remove it.

- **L6.1 Fast pump, slow bleed (replaces the NPC retail rule).** NPC demand answers buzz ARRIVALS, not the buzz stock: each
  arrival (launch buzz, viral shock, buzz item, copycat response) adds to a pending demand that the NPC cohort buys with a
  half-life of 3 ticks. The cohort then sells at any price as the hype fades: per tick, sell share = capitulation rate times
  (1 - B / B_peak) + a time term, where B_peak is the cohort's running peak buzz since its last arrival; profit taking on top
  as before. Over a token's life NPC flow is net-zero in tokens. The NPC side is not a faucet in expectation: the gate
  reports the `npcRetail` net per token and it must be <= 0 on average (players in aggregate do not drain the NPC side).
- **L6.2 Post-graduation unwind.** The NPC cohort's engine position after graduation is sold into the liquidity book through
  the normal order path (the single impact path) with a half-life of 1 gd.
- **L6.3 Tuning freedom.** Every L6 constant may be tuned (buy half-life 2 to 6 ticks, capitulation, viral law, base buzz,
  sniper size), not only the earlier subset. The L3 curve, the fees and the L4/L5 rules do not change.
- **L8.1 Gate measurement.** The excess is paired per seed (bot return minus GX buy-and-hold on the same seed and horizon),
  CI over seeds. An idle bot must show zero excess. All five strategies must be <= 0 at one-sided 95%. "Dead within 7 gd"
  is measured on launches from day 3 on (earlier launches cannot die before day 10 under L3). Curve holdings are valued at
  liquidation (exit fee and slippage), not at spot, in the gate and in net worth.
- **Deviations ratified.** Sector stays 'crypto' (no 'meme' sector key in the engine; the meme template gives the behaviour).
  Vesting is a world check that counts open sell orders and re-checks at fill. The launch ban is 8 real weeks (1,344 gd).
  Cancel: only before any other account has traded the token, refund 50% of the fee (the other 50% stays a sink).
  NPC launches are ON in the game world (`createGame` for the server and the e2e world), OFF in bare test worlds; the game
  world's fingerprint tests are updated in the commit that turns them on, and that commit says so.
