# Isolated policy and recovery engine

## Status

`src/server/market/policyRecovery` is a new engine, not a replacement for the live `CrisisBook`.
No existing runtime, auth store, Broker, UI, claims, or Wire code changes in this unit.
The app still uses the base's six uniform major draws until a coordinated integration unit mounts this engine.

The engine has a real read-only adapter, not fabricated live macro data.
`captureLiveCatalog(market, auth)` runs inside `AuthService.readLaunchpad(null, callback)`.
The synchronous callback reads one clock tick and one committed Launchpad state.
No timer step or async commit can interleave inside that callback.

## Live inputs and missing sources

Each reading is `LIVE` with `observedHour`, `source`, and `value`, or `MISSING` with a reason.
A live reading from an older hour is stale. It cannot enable a draw or a calm day.
A future observation, malformed value, or future emergency record fails parsing.
The boundary accepts only dense, plain JSON trees and exact declared fields at every nesting level.
It rejects unknown fields, non-finite numbers, negative zero, undefined, functions, Dates, class instances,
cycles, sparse arrays, symbols, hidden properties and accessors before copying or saving inputs.

The adapter reads these actual owners:

| Field | Source |
|---|---|
| Fear and internal regime | `LiveMarket.worldView()` |
| GX mark | `LiveMarket.snapshot().quotes.rows.GX` |
| Crisis Week active | `LiveMarket.stormSnapshot().crises.crisisWeek` |
| Crypto hype | Mean of current `LiveMarket.hypeOf` values for every committed graduated coin |
| Graduated count, cash backing, pool count, liquidation count | Locked Launchpad book and pool state |

An empty crypto cohort has missing hype, not hype zero.
If any graduated coin lacks a clock listing, the aggregate hype is missing.
The mean is unweighted because the export does not define aggregate weights.
The adapter never includes private holdings, account IDs, sessions, or receipts.
The internal regime does not reach `publicPolicy`.

FSI, credit defaults, bank capital, GDP shares, valuation z, sovereign hazard, reserve cover, housing, inflation, geopolitics,
stablecoin backing, AI, underwriting, repo leverage, and CB emergency records are missing on this base.
DEGEN liquidation counts are not bank defaults or FSI.
GX returns are not valuation z.
At every supplied game hour, the engine checks the current GX mark against observed hourly peaks within the last 21 trading days (04:1036), not just closes.
A persisted monotone deque retains candidate peaks with their actual observation hour; weekdays advance the 24-hour trading clock and weekends pause it.
A peak exactly 21 trading days old remains eligible; it expires at the next trading hour. Observed peaks on weekends are not silently discarded.
The saved crash latch prevents a duplicate label after restart.

The adapter does not import the previous unmerged failure-farm branch.
That engine's delisting and abandonment aggregates need a later coordinated input adapter.

## Catalog and schedule

`catalogDecisions` describes all 15 major kinds in `complete/04-MACRO-CENTRAL-BANKS-SOVEREIGNS.md:1015-1029`.
The registry owns kind order and predicates.
A ready candidate has weight `base * exp(clamp(vulnerability, -3, 4))`, as in the reference `crisisCatalog.ts:160-161`.
The crypto stablecoin-only path uses vulnerability zero when hype is missing, matching the reference's nullable-hype rule.
The missing hype reading remains missing.

Only the six existing V1 proxy kinds can enter a scheduled draw.
Other definitions report `UNSUPPORTED` even when explicit test inputs satisfy their predicates.
`CYBER_PANDEMIC` is emergent-only.
The engine does not schedule a crisis whose economic target engine does not exist.

`majorHazard` uses `3.6e-4 * sum(executable weights) / 3`, multiplied by 1.5 during an observed Crisis Week.
Missing Crisis Week state blocks an automatic draw rather than assuming the week is inactive.
Per-day streams use `sys:policy:<seed>:<day>` and do not consume the live storm streams.

The scheduler enforces one active major, a 504-day trigger gap, first-24 and final-48 chapter gates, and player-caused suppression.
These rules come from `04:991-1008`.
`proposeMajor` is an explicit test or trusted-producer function that bypasses the onset draw, not eligibility or scheduled constraints.
It is not an HTTP endpoint.
Emergent proposals ignore those scheduled gates, attach to an active event, and create no extra trigger shock.
This follows `04:1036`.

Time is consecutive game hours, with 24 hours per day and 30 ticks per hour.
Scheduled precursors last 8 to 16 days. TRIGGER lasts exactly 24 hours. Contagion lasts 5 to 30 days.
The current engine has no durable tick-to-UTC map and does not implement UTC-band snapping.
It preserves the base's trigger price proxies, not the full macro precursor or downstream target machinery.

## Responses and recovery

`04:1033` makes policy depend on an actual response, not a scheduled promise.
The primary TRIGGER phase remains one day.
`policyStartedHour` reports the first actual response immediately, even during TRIGGER.
The primary phase becomes POLICY during contagion when a response has fired.

Two response kinds execute local cash transfers:

- OIL_SHOCK uses configured ENERGY_SUBSIDY programs.
- TRADE_WAR uses configured FISCAL_SUPPORT programs.

A program debits its source wallet and credits its recipient in the same state transition.
It pays at most its limit and the source's remaining cash.
Zero available cash records `EXHAUSTED`, not `FIRED` or POLICY.
Each event attempts each configured program once.
A restart or repeated observation cannot pay again.
A supplied, fresh, already-published CB emergency can mark policy without pretending that this module executed a rate cut.
Other banking policies remain unimplemented. Crypto has no CB backstop, per `04:1018`.

RECOVERY starts at the end of contagion, independent of whether any policy response could fire.
A calm day needs 24 fresh hourly observations with Fear strictly below 40 and FSI strictly below 0.3.
One missing or stressed hour invalidates the entire trading day.
Ten consecutive calm trading days end the event.
Weekends add no calm days. The default calendar is Monday through Friday, with holidays off.
This is stricter than the reference's daily closing-print check.
Missing FSI on the live base cannot fake calm. The 180-game-day maximum still ends the event with reason `TIMEOUT`.
`publicPolicy` exposes that reason, not a claim that timed-out markets are healthy.

Each scheduled trigger creates event-specific log-price residuals using the existing proxy shocks and half-life law.
`residualLog` evaluates each residual from its original hour, including after ENDED.
It never merges different decay schedules or changes cash.
Emergent labels add no residual.
No projected mark guarantees an executable counterparty or a profitable trade.

## Money and persistence

`createPolicyState` accepts explicit genesis allocations.
There is no funding, loan, refill, withdrawal, or market-maker command.
Every transition checks this identity with an integer sum:

```
sum(wallet cents) = genesis cents
```

The isolated wallets are not a second copy of live AuthService balances.
A future runtime integration must move treasury ownership atomically before allocating these wallets.
This unit does not grant money to live accounts or refill a live book.
The existing base's NPC funding and DEGEN credit are not imported or certified by this proof.

`PolicyRecoveryEngine` copies inputs before queueing, serializes observations, and saves before publishing.
Equal repeated observations are idempotent. Conflicting repeats, hourly gaps, and epoch changes fail without mutation.
`FilePolicyStore` validates version, exact variants/fields, plain JSON, cash, identities, times, program receipts, residuals and hourly peak ordering/window.
The checkpoint is now **V2** because the GX history contains hourly candidates rather than V1 closing prints.
V1 checkpoints are explicitly rejected, not silently upgraded: missing historical intraday peaks cannot be reconstructed honestly. This isolated engine is not mounted.
It writes a temporary file then renames it. A corrupt existing file is rejected and retained, never reset from genesis.

One engine owns one path. There is no multiprocess coordination, fsync guarantee, production authorization, quota system, or history-retention policy.
The current live clock changes epoch on process restart. Mounting needs an explicit durable hour mapping, not a silent continuation with a new epoch.

## Proof artifacts

`tools/proofs/policy-recovery.ts` writes the measurement contract before its measurements.
The runner creates fresh stores for an oil response, missing-FSI timeout, flash recovery, a saved GX crash latch, and the natural weighted schedule.
It compares full state for restart and hourly versus batch replay.
The live fixture uses real AuthService, LaunchpadService, BrokerService, and LiveMarket instances.
It proves capture is read-only and changes with paid graduation, clock hype, and an actual finite-book trade.

The growth comparison isolates the existing ERP-only component for 260 game days.
It is not a full stochastic price run, a cost-adjusted return, or a balance certification.
The inherited FLASH_CRASH half-life recovers 70% of the log gap in a game day.
The runner reports the corresponding price-drawdown recovery separately, about 68.89%, rather than claiming it met a 70% price target.
No parameter changes force that target.

The clean-worktree browser run covers the unchanged live quotes, orders, candles, and Wire paths.
It does not claim that the new policy phases are visible in the UI.
