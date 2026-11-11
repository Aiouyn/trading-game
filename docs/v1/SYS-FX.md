# Isolated finite spot FX engine

## Status
`src/server/market/fx` is not mounted into the live web runtime. It does not change AuthService balances, Broker, claims, Wire, UI, macro producers, or the previous unmerged sys units. A future integration must transfer wallet ownership into one atomic state, not copy live cash into this engine.

The player-facing engine outcome is finite executable currency conversion, a linked all-or-none cross, retail bank exchange, and an auto-FX funded delivery. No route or UI exposes it yet. This unit is spot settlement, not the full 07 banking/CCP or 06 derivatives system.

## Usage and ownership
Create explicit genesis wallets and bank inventories; open `FxEngine` with `FileFxStore`; call `observe` with consecutive authoritative frames. `preview` runs a copied decision against the latest observation. `snapshot` is private engine state; `view` contains only aggregate displayed levels and informational marks. No HTTP endpoint or authentication adapter is supplied.

One engine owns one path. `observe` copies input before queueing, serializes operations, atomically saves before publishing, and returns a copied snapshot. Equal repeated observations and identical command keys are idempotent. Changed keys, gaps and epochs fail without publishing. A producer must supply the complete frame tape for a batch jump; no missing data is invented.

## Currency and quote conventions
All five currency wallets use integer minor units. Quote rates use1,000,000 quote/base units; all settlement multiplication/division uses BigInt before safe-integer conversion. Prices are never multiplied into a wallet with floating-point arithmetic.

The currency-priority registry derives all10 pairs. Four books exist: EUNFDL, FDLNKR, FDLPYN and FDLSRL. EUNFDL is FDL per EUN; the others are foreign units per FDL. Cross mids are ratios/products of the same four observed legs. Quote-in-PYN display has2 decimals; others4. Display rounding never drives execution.

Frame marks are explicit producer observations or null. There is no live FX producer in the base, so no equity quote is relabeled FX and no genesis FX0 is called live. The producer is responsible for truthful fresh marks, full current control snapshots and sealed commands. A missing mark blocks bank conversions, not otherwise funded limit-book trades. Marks never supply liquidity.

Pure CIP pricing uses `S*exp((z_quote-z_base+basis)*T)`, with basis−40bp*fear² only for FDL quote. The20GD log anchor helper consumes04-owned fair value. Neither helper creates a traded derivative or a competing fair-value model. No carry-return, volatility,5-year tail or population calibration is claimed. UIP0.5 remains04-owned; stale06 prose0.30 is not copied.

## Finite matching and fees
An offer commits a finite amount of the currency its owner will pay at its quote/base limit. Wallet holds are the sum of outstanding payouts plus same-tick auto-delivery reservations. Posting cannot oversubscribe a wallet; only its owner can cancel. Held actors cannot add risk but may cancel their own offers. Maker/taker self matching is excluded.

Rows match by best rate, then prior posted tick, then code-unit ID order. Conversion is fill-or-kill; it may consume several finite rows, but an insufficient book changes no economic state. It is not a full uniform-price batch auction or IOC/partial-order implementation. Standing offers may be posted while closed, but conversion waits for a trading session. Weekend matching is closed under05's calendar; Sunday reopening, holiday depth and fix/reopen auctions need later calendar integration.

Both sides pay0.3bp of FDL notional, minimum10FDL minor units per filled row. Fees go to an explicit FDL fee wallet, never a sink. Maker principal is held, but all future per-fill fees cannot be known at posting: a maker without unheld/received FDL to pay its fee is not executable. Displayed resting depth is not a guaranteed fill. Tiers, levies and message fees remain outside this unit.

Rounding is against the taker. A cross plans the destination leg, funds the bridge from the source leg, and rechecks the destination after the source. Failure discards both legs, all fees and offer consumption. Planning inserts no fake bridge balance. Successful bridge surplus stays FDL. Derived cross mids have no independent price; supplied crossed limit books can still offer genuine, finite profitable trades. This unit does not claim a global no-arbitrage theorem for adversarial crossed quotes.

Current source controls are checked before each leg. Resting offers paying a controlled currency are excluded too. Thus buying into a controlled market need not have executable liquidity. No band clamp, automatic CB defence, refill, credit, loan or funding API exists. Market and auto conversions need LIC2 and an unheld actor; retail bank conversion can serve lower licenses.

## Retail bank exchange
Each configured bank has separate pre-funded inventory and income wallets. A source-base conversion uses the mark bid `spot*(1−0.0025)`; a source-quote conversion buys base at ask `spot*(1+0.0025)`. The ask is not approximated by multiplying the output by0.9975. The target-side difference between fair-mark output and executable output is transferred to bank income; inventory funds the whole gross amount. Missing marks, controls, insufficient source/inventory, and held status reject without changing balances.

These are isolated conversion inventories, not a fabricated deposit liability/reserve ledger. Deposit creation, interest, FX risk capital, bank resolution and insurance belong to the following banking unit.

## Auto-FX and finite delivery
All FX, including auto conversions, executes in6a before any finite asset delivery in6b. Auto converts the shortfall to estimated price*quantity plus0.5%, reserving the funded target cash between phases. Other same-frame commands cannot spend it. Existing unheld target cash avoids another conversion.

A failed FX leg cancels the delivery with FX_LEG_FAILED. After successful FX, inadequate asset stock or an actual price above the reserved buffer cancels only the asset; funded converted money remains. A successful delivery transfers units and actual-price cash, releasing unused target cash. The finite ask is a standalone delivery contract, not the live Broker or a callback allowed to mutate an external store. Its authoritative producer supplies the current asset ask; authorization, taxes, market-order carry and full asset fees are not implemented here.

## Persistence and conservation
A version1 checkpoint stores explicit genesis, the complete validated frame journal, and a SHA256 of reconstructed state. Restart replays the journal and verifies the full state hash. Existing malformed/null/version-mismatched files are rejected and retained, never silently reset. A write uses a new temporary file and rename; failed save does not publish.

Every committed frame checks each currency independently:

    sum(all wallet minor units in ccy) = explicit genesis total in ccy

Assets obey the analogous unit identity, and every hold is funded. Each transfer is a debit and equal same-currency credit; fees and bank income are included. Mark changes alter no cash. Explicit genesis is not permission to duplicate existing live balances during integration.

The journal grows without compaction, and histories are retained. There is no fsync/power-loss guarantee, multiprocess lock, production authorization, retention policy, or durable live clock epoch mapping. These are explicit integration duties, not certified here.

## Verification
`tools/proofs/fx.ts` records its measurement contract, then creates9 fresh stores. It compares full state over a7GD tape with200 additional finite flow intents, per-tick versus full-tape batch, and restarts at posted offers, fees/delivery, cancellation, controls, missing marks and expiry. It independently reconstructs every cash transfer and checks the final wallet ledger. Additional cases exercise rollback after an already-applied first leg loses second-leg fee backing, exhausted cash with no maker/refill, and retained auto-converted cash after asset failure/restart/retry.

The browser smoke tests unchanged Broker orders, candles and Wire in a clean exact-commit worktree with fresh .data. It does not prove policy/FX UI integration. Evidence lives outside git at `/workspace/avalon/evidence/sys-fx/`.
