# Launchpad: first playable loop (owner-restored)
Restored at the owner's explicit request. Code: src/launchpad/rules.ts (shared curve rules), src/server/launchpad/* (server rules, saved section), src/app/api/launchpad/* (routes), src/apps/launchpad/* (lazy app).

## What was inspected
- Base: no launchpad code, app id or route. tests/unit/shell/registry.test.ts pins "launchpad" as a removed legacy app id (V3 17 §2.2 union). V3 06 §3.20 specifies player tokens as "disabled at launch" ($5M fee, R4). V1-BOARD has no Launchpad card. The owner has explicitly asked to restore the feature, so this unit adds it back and records the deviation from those V3 lines.
- Old design of record: origin/p10/lp (and p10/integration, p10/chart, p10/fix, p10/fill, same files): docs/team/specs/lead-launchpad.md (L1–L8 + amendments v1.1/v1.2), src/world/launchpad/constants.ts (LP), curve.ts, launch.ts, moderate.ts, plus app components. Built on a different world engine (src/world/*, the court, buzz/NPC cohorts, graduation through the engine listing path) that does not exist on this base. Not merged; definitions reused.
- sim/memecoin-v3 and docs/MEMECOIN-AUDIT/PRICE-CADENCE: NPC price-action research only (out of scope).
- Active worktrees and branches: none is building a launchpad.

## Reused definitions (p10 LP / lead-launchpad L2, L3)
- Curve: constant product on virtual reserves X0 = $15,000 and Y0 = 1,073,000,000 tokens. A buy gets Y − k/(X + net); a sell pays X − k/(Y + q). Supply 1,000,000,000; 800M sold on the curve (graduation at Y = 273M).
- Fee 1% of notional each way, half to the creator, half a sink. Launch fee $100 (R-10-6). Ticket default max slippage 5%; a worse fill is refused.
- Limits: one launch per account per 24 real hours; at most 3 live tokens per account. Creator's holding before graduation is at most 10% of supply.
- Ticker 3–5 letters A–Z; name 3–24 characters. A tagline is picked from a template list (no free text, L2 V1). Fictional names only: refuse catalog tickers and names, existing coin tickers, and a short list of real crypto tickers.
- Public tape without handles; the creator's trades are flagged (L1 no-reveal). Other players' holdings are never shown.

## Budget
Guest first-load JS (S1-20 hooks build) does not grow: the registry row, name, glyph and lazy entry are offset by removing seven unused shell strings (S.marketOpen, layouts, more, settingsPalette, settingsMotion, settingsTransparency, accountSavedDemo). The app body, its CSS and the curve rules load only when Launchpad opens.

## Smallest observable outcome
A signed-in player A opens Launchpad, fills in name, ticker and tagline, and reviews the launch. The review shows the $100 fee, A's cash after, and that it is fictional game money. On confirm the coin is listed for everyone. Player B (another account) sees it in the list, opens it, and reviews a buy: dollars in, estimated tokens, fee, average price, price impact, cash after. B confirms. B's cash goes down and B holds the tokens. A's cash goes up by the creator half of the fee. The coin's price, sold count and public tape move. B can then review and sell, and receives cash minus the fee. Everything is server-authoritative, persists across refresh and server restart, and stays isolated per account.

## Acceptance
1. Server owns identity, validation, cash effects, idempotency and concurrency. Launch and trade commit inside the auth service lock in one persist, together with the player ledgers. A failed save publishes nothing and changes no cash (memory rolls back). An idempotency key replays its first reply; reusing a key for a different request is 409.
2. Money is integer cents, tokens are integer, curve math uses BigInt and rounds in the curve's favour (k never decreases; the curve's real cash X − X0 always covers sells). Spendable cash = cash − cash held by working Broker buy limits. No free money: total player cash + curve real cash + booked sink is conserved by every operation (unit test).
3. Refusals carry a reason and change nothing: bad name/ticker, taken or real ticker, cooldown, 3 live tokens, not enough cash, curve full (graduation not in this build), over the creator cap, slippage worse than the reviewed fill, selling more than held, unknown coin.
4. Read routes are pure (GET /api/launchpad never writes). Public view: coins, curve state, public tape (no handles; creator flag). Signed-in callers also get only their OWN holdings and spendable cash.
5. Restart: coins, holdings, tape and cash survive a server restart. A Launchpad section that cannot be parsed is kept verbatim, never dropped; Launchpad then reads "unavailable" and refuses writes.
6. UI: lazy app (no first-load growth beyond the registry row; S1-20 hooks ≤ 215 KB and route-budget plain ≤ 215 KB still pass; thresholds unchanged). Review then confirm for every money action, no automatic orders. Copy: fictional coins, game money only, prices move only when players trade in this build, most coins lose value, no guaranteed profit. Guests can browse and are asked to sign in to launch or trade. Works with keyboard, at 390 and 520, and desktop.
7. Proof: plain production preview at the exact head. A signs up → launches → B signs up → finds it → buys → sells → refresh → account switch → server restart. Ledger and Launchpad values compared with the server API. 390 and 520 layouts, keyboard.

## Deliberate deviations (to record for Gatekeeper / owner)
- The p10 launch gates "rank R1 or higher" and "account age ≥ 3 real days" are NOT enforced. On this base, signed-in accounts have no server-side rank progression (they start at R0), so with the gates nobody could ever launch. A first journey would also be impossible. Recorded as an owner decision.
- App id "launchpad" is added back to the registry (the V3 17 union listed it as legacy-removed).

## Remaining steps (not in this unit, recorded rather than omitted)
- Graduation to an engine asset and liquidity book (L4). The curve stops accepting buys at its 800M cap ("curve full").
- Creator allocation and vesting (L5; the allocation is fixed at 0 here). Rug flag and cases (L5).
- Buzz/hype, NPC retail, snipers and death (L6): prices move only when players trade.
- Buzz items, candles/chart, Trending/Graduated tabs, holder buckets, replies, icons (L7). Moderation beyond the minimal fictional-name checks. The balance gate (L8).
- Coin holdings in net worth, Portfolio and the leaderboard (L8.1 values at liquidation). Until then Launchpad says holdings are not counted.
- French copy.
