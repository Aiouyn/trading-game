# Isolated meme failure engine

## Status

`src/server/launchpad/failureFarm` is a standalone engine and deterministic failure farm. It is not mounted in the web runtime. Existing Launchpad and Broker stores, routes, UI, claims, and Wire resolution are unchanged. Runtime integration is a later unit in `/workspace/avalon/sys-PLAN.md`.

## State and settlement

`createFarm(seed, wallets)` accepts explicit genesis balances. There is no funding, credit, refill, or reserve-withdrawal command. `commandFarm` returns the next state and a receipt for a paid launch or trade. `advanceFarm` replays consecutive game-hour frames. It rejects missing hours rather than inventing their prices.

The engine calls existing `quote`, `graduationOf`, `listPriceMinor`, and `fillOnBook`. Before graduation, buys specify cents and sells specify tokens. After graduation, both specify tokens. Integer cents, the curve's rounding, graduation fee, finite depth, partial fills, and book commissions retain their base definitions. Listed fills apply their permanent impact to the engine mark after settlement. The caller supplies subsequent authoritative hourly marks.

A new player can launch immediately for 100,000 game cents. The base creator cap, three-live-coin limit, and 24-real-hour launch cooldown remain. NPC wallets can buy their own paid allocation without the player creator cap. No token allocation is granted for free.

For every command and hour, `assertConservation` checks:

```
wallet cash + real curve reserves + book cash + sinks = genesis cash
wallet token holdings + unsold supply or book inventory = 1,000,000,000 per coin
```

Virtual curve cash `LP.X0` is excluded. No pool faucet or DEGEN credit is imported. A delisted token keeps its cash and tokens in those identities.

## Lifecycle rules

The primary source is `export/vision-review/complete/06-ASSET-CLASSES.md:748-762`.

- Hype uses the base `hypeStep` hourly formula, public mentions, player net buy flow, and supplied hype shocks.
- An active NPC launcher sells at most 20% of the preceding hour's actual volume into a rally while hype exceeds 0.4. The sell uses owned tokens and the normal venue. Partial fills count only their executed quantity.
- When hype is below 0.15, a stateless seed, coin, and hour draw abandons an NPC with probability 0.5. Abandonment stops the launcher's activity permanently. Player accounts never abandon automatically.
- Liquidity below 100,000 cents for 168 consecutive game hours delists the coin from `publicCoins`. A curve coin's liquidity is its real curve cash. A graduated coin's liquidity is `liquidity()`: the cash a seller can receive within `max(0.05, 3σ_d)` below the mark (05:560) on the base ladder, capped by book cash. Resting cash reachable only far below the price does not count. The measure moves no money. Exactly 100,000 cents resets the clock. A replenished book resets the clock before death. Death never creates a buyer.
- A `RETAIL` wallet is an NPC retail-pool trader (05:832, meme weight 3.0). Once each game hour, on every graduated coin, it moves toward `3·tanh(N(0,1) + 0.5·tanh(r_1d/σ_d))` ADV, never below zero, by at most 0.45 ADV a game day. Every order goes through the finite book. It never launches, never shorts, and never spends more than its cash. Each coin keeps its last 24 hourly `closes` for r_1d.
- `walletValue` returns zero for delisted holdings. Holders keep their tokens and can sell against remaining reserves. New buys are refused. A new paid launch can restore market activity without reviving an old token or creating cash.

`06:1042-1045` disables player launches and sets a $5M fee. The owner's immediate-launch and $1,000 decision overrides those gates, as recorded in `docs/v1/LAUNCHPAD.md:36-38`. The existing base uses a bonding curve and finite book rather than the NPC Tidepool AMM described in `06:760`. This unit preserves that base path; it does not claim a DeFi venue implementation or automatic Poisson spawning in the live app.

## Creator dump flags

The complete export forbids liquidity withdrawal rugs but does not define sale-based rug thresholds. The base's documented old design of record supplies them: `origin/p10/lp:docs/team/specs/lead-launchpad.md:58-67`.

`rug` is a public, persistent flag when either condition holds:

- The creator sells at least half of their graduation holding during the following 24 game days.
- The creator sells at least 3% of supply during one game day and the mark falls at least 40% from that day's open.

These flags describe actual executed sales. They never confiscate cash, create an automatic player sale, or force the chapter failure percentage. The isolated wallet is the ownership boundary. Linked-owner attribution, Court cases, bans, creator vesting allocations, filings, and Wire items are not implemented here.

## Checkpoints

`parseFarm(unknown)` validates the version, variants, balances, supply, references, and timeline before returning a private copy. `FileFarmStore` writes a temporary file and renames it atomically. Invalid existing JSON is rejected and preserved, even when a genesis state is supplied.

### Input boundary

Checkpoints are format v2 (adds `closes` and the `RETAIL` kind); v1 is rejected and preserved, never migrated. Size limits: 256 units per command/frame string or key, 4,096 per checkpoint string, 16 MiB per checkpoint file (checked before read and before write).

Every caller value passes one strict plain-JSON predicate before acceptance: `failureFarm/json.ts`, whose body is copied verbatim from sys/fx `src/server/market/fx/json.ts:4`. It reads property descriptors only, so no getter, `toJSON`, or Proxy trap runs. It refuses NaN, ±Infinity, −0, `undefined`, functions, symbols, sparse arrays, Dates, boxed primitives, class instances, live or revoked Proxies, accessors, and non-enumerable or symbol keys. `failureFarm/boundary.ts` then requires the exact command, frame, and observation keys and their JSON types. A `null` where a value is required is refused.

- `commandFarm` and `FailureFarmEngine.execute` throw `INVALID_FARM_COMMAND` before a fingerprint, receipt, clone, or save. The probe key stays unused.
- `advanceFarm` and `FailureFarmEngine.advance` throw `INVALID_FARM_FRAME` before any state change.
- `parseFarm`, genesis `open`, and `FileFarmStore.save` throw `BAD_FARM_CHECKPOINT`. `createFarm` throws `BAD_GENESIS`.

Economic validity stays in the engine as persisted refusals: integer amounts, fee, cooldown, and cash. Accepted input therefore equals the saved JSON and the replay fingerprint input. The typed-helper `toJSON` and NaN/null aliases noted by Gatekeeper at c7b31bd5 are now refused.

`FailureFarmEngine` serializes commands and captures their inputs before queueing. A failed save leaves its published state unchanged. Receipts include refusals and survive restart. A key reused with another command returns `IDEMPOTENCY_CONFLICT`.

One engine owns one file path. The adapter does not coordinate multiple processes, authenticate callers, implement quotas, or promise power-loss durability through `fsync`. Receipts remain in the checkpoint for this bounded farm. A production adapter needs ownership, retention limits, input size limits (string and checkpoint size are not capped here), and a long-lived tick mapping. The current web clock starts a new epoch on restart; this engine does not silently attach its durable hour to that clock.

## Proofs

The runner is `tools/proofs/meme-failure-farm.ts`. It uses 24 DEV seeds (17–40) with twelve coins each, all born at hour 0, for a full 1,344-game-day chapter (`20-VERIFICATION-AND-BALANCE.md:11`). Nine coins per seed graduate through paid trades; three remain genuinely thin on their curves. The price path uses the actual base `MemeProcess`, thirty ticks per hourly observation, and committed hype and fill impacts.

`measurement-contract.json` (version 3) is written before the run. It defines "~0" as the spec's death state in `06:762`: liquidity below $1,000 for seven game days, then `DELISTED` and marked at 0 (event `mkt.meme.dead`, `06:1139`). Price cutoffs are reported only as secondary, authored diagnostics. Results are descriptive, not a G3 balance certification. The approximate 90% target in `06:762` is never a death quota. The runner reports misses without tuning. The calibration decision, the pre-registered liquidity and holder rules, and results are in `docs/v1/units/meme-failure-farm.md`.

The unit tests cover executed dump flags and honest negative cases, NPC bounds and abandonment, delisting and retained wallets, finite cash and token supply, strict parsing, failed-save rollback, concurrent replay, a real file restart, and batch jump equivalence. The browser regression checks the unchanged paid launch, two-account curve trade, and reload path on desktop and phone. It does not claim that the isolated lifecycle is visible in the current UI.
