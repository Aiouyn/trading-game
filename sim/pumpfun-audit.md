# Pump.fun curve audit: sandbox core.ts vs real (2026-10-17)

## PART 1: Comparison table

USD conversions use SOL = $103.95, the 2026-10-16 close (ChartExchange, https://chartexchange.com/symbol/crypto-solusd/historical/; Yahoo shows $103.53, Scrypt $103.71). I round this to **$104**. Our sandbox was built with an assumed SOL of ~$179.

Sources:
- [G] Global account snapshot in pump-fun/pump-public-docs: https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md. This is the official repo, but it is a snapshot: I did **not** read the live Solscan account `4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf` (https://solscan.io/account/4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf#accountData).
- [F] https://pump.fun/docs/fees, official, "Last Updated: 17 October 2026", read directly.
- [B] https://pump.fun/docs/bonding-curve, official; only the search excerpt was read.
- [D] DeepWiki on the pump-public-docs migration: https://deepwiki.com/pump-fun/pump-public-docs/7.3-migration-to-amm. Second-hand.
- [C] Derived by me from [G] with the constant-product formula. The arithmetic is exact.
- [K] Our corpus, refs-real/corpus/cache/trades-00000.parquet (2026-06-05 to 06-11, 32,857 mints, "pumpdev" feed).

| Parameter | Ours (core.ts, CURVE_S=0.357) | Pump.fun real | Source / status |
|---|---|---|---|
| Curve formula | x·y=k on virtual reserves | x·y=k on virtual reserves (Uniswap V2 style, synthetic reserves) | [G][B], verified (docs) |
| Initial virtual quote reserve | $5,355 (15,000×0.357), ≈29.9 SOL at $179 / 51.5 SOL at $104 | **30 SOL** (30,000,000,000 lamports) | [G], verified (docs snapshot) |
| Initial virtual token reserve | 1,073,000,000 | **1,073,000,000** (1.073e15 raw, 6 decimals) | [G], verified |
| Initial real token reserve (sold on curve) | 800,000,000 (Y0−GRAD_Y) | **793,100,000** | [G], verified |
| Total supply | 1,000,000,000 | **1,000,000,000** | [G], verified |
| Tokens left for pool | 200,000,000 | **206,900,000** | [G] supply−real; [D] |
| Virtual tokens at graduation | 273,000,000 | **279,900,000** | [C] |
| Graduation trigger | curve y reaches GRAD_Y | `complete=true` when real_token_reserves==0, at the end of a buy; then a permissionless `migrate` | [G], verified |
| Quote raised at graduation | $15,692 (≈87.7 SOL at $179) | **≈85.005 SOL** (≈$8,840 at $104) | [C]; [D] says "~85 SOL", second-hand agreement |
| Start market cap (1B × price) | **$4,991** | **27.96 SOL ≈ $2,908** | [C]; [K]: median first-trade mcap 28.7 SOL, p25 27.96, which matches |
| Graduation market cap | **$77,096** | **410.9 SOL ≈ $42,730** | [C] |
| Graduation multiple (grad mcap / start mcap) | **15.45×** | **14.70×** ((1073/279.9)²) | [C] |
| Curve trading fee | 1% (half creator, half sink) | **1.25%**: creator 0.30%, protocol 0.95%, LP 0% | [F], verified 2026-10-17. Note: [G] still shows fee_basis_points=100 (1%), so the snapshot is stale on fees |
| Fee history | — | 1% protocol until May 2025; creator fee for all coins from **2025-05-13** [F]; now 1.25% total [F]. The exact date of the change to 1.25% was not found | [F] partial |
| Platform (app) fee | none | **+0.45%** (0.40% with a referral) on trades from the web/mobile app, **from 2026-10-17**. Not charged via Terminal or third-party interfaces | [F], verified |
| Migration fee | 1.5% of raised cash ($235) | **0.015 SOL flat** (pool_migration_fee 15,000,001 lamports), taken from the curve | [F][G], verified |
| Post-graduation venue | x·y=k pool, 1% fee | **PumpSwap** canonical pool; LP tokens **burnt**; pool owned by the protocol | [G][B], verified |
| Venue history | — | Before about March 2025 the old `withdraw` instruction migrated to **Raydium** off-chain (now disabled) | [G] says the withdraw instruction is deprecated; the Raydium-era 6 SOL fee and the ~March 2025 date are second-hand and unverified |
| Pool starting reserves | 200M tokens + raised×0.985 ($15.46k) | **206.9M tokens + ≈84.99 SOL** (85.005 − 0.015); pool mcap ≈410.8 SOL, continuous with the curve | [C][D] |
| Pool fee | 1% flat | **Tiered by mcap in SOL**: 1.25% at 0–420 SOL (cr .30/pr .93/LP .02), 1.20% at 420–1470, falling stepwise to 0.30% at 98,240+ SOL | [F], verified |

### Verdict
- The **0.357× thin curve** sized the start by USD (~$5k at SOL $179). Real Pump.fun sizes it in **SOL**: 30 SOL virtual. At today's $104 that is about a **$2.9k** start and a **$42.7k** graduation. To keep 30 SOL at $104 in game dollars, S = 3,120/15,000 = **0.208**.
- The **15.45× multiple is close but wrong**. The real multiple is **14.70×**, because the curve sells 793.1M tokens, not 800M.
- **Fees are too low** on the curve: 1% vs 1.25%. The pool fee is low near graduation (1% vs 1.25%) and high above 420 SOL (1% vs 1.2% falling to 0.3%).
- The **migration fee is about 150× too large**: 1.5% of the raise vs 0.015 SOL.
- **Corpus caveat [K]:** start mcap matches (28 SOL). This shard cannot verify graduation. Its `curve_pct_depleted` is exactly v_sol/85 SOL, and its "100%" coins (147) peak at a median of only 83 SOL mcap, not 411. The feed's reserve fields are therefore not the on-chain reserves past the start. I am not inferring graduation numbers from it.

## PART 2: Code changes (sandbox only, no commits)
- **New `sim/core-pf.ts`:** `PFCoin extends Coin`, with the real values. 30 SOL virtual × SOL_USD (default $104), 1.073B virtual tokens, 793.1M real tokens, curve fee 1.25%. Migration takes 0.015 SOL flat. The pool gets 206.9M tokens plus the raised cash (fully real, d≈1). The pool fee is tiered by mcap in SOL, per [F]. Trade, clip and taper mechanics are unchanged.
- **Self-check:** start mcap 27.96 SOL ($2,908). Graduation at 410.88 SOL. The pool holds 84.99 SOL and 206.9M tokens. All match [C].
- **New `sim/core-sel.ts`:** `CURVE=pf` selects PFCoin; anything else keeps the old core.ts Coin. `OBS.ts` now imports Coin from core-sel (a one-line change). `obs-run.ts` imports CURVE and prints `curve` in the METRICS line. Backups of both originals are in /tmp/*.bak. The old path is otherwise untouched, and core.ts itself is not edited.

## PART 3: v13.2 METRICS, N=600, same knobs (obs-knobs.json)
Commands: `CURVE_S=0.357 N=600 METRICS=1 bun obs-run.ts lib` vs `CURVE=pf N=600 METRICS=1 bun obs-run.ts lib`

| Metric | old (0.357) | pf | target |
|---|---|---|---|
| grad % | 4.5% | **11.2%** | 0.5–3% |
| btt | 0.320 | **0.211** | ≤0.35 |
| 5s-move p95 after 5 min (`p95_5m`) | 0.035 | **0.077** | ~0.19 |
| p99 | 0.068 | 0.166 | — |
| random bot $/trade | −4.33 | −2.85 | <0 |
| buy-all at minute 5: hit rate / $/trade | 0.39 / −6.60 | 0.013 / −31.69 | — |
| clue bot: hit rate / $/trade | 0.463 / +0.24 | **0.024 / −27.83** | modest edge |
| clue bot, B-only clues | 0.527 / +0.75 | 0.024 / −25.94 | — |
| pump-and-dump median $ | 377 | 296 | — |
| tiny-B shiller median $ | +14.8 | **−50.1** | ≤0 |
| dead by day 7 | 0.18 | 0.148 | — |
| labels (rug/quick/grind/trend/run) | 22/359/196/20/3 | 22/103/455/18/2 | — |
| serial-dumper rep at end | 0.41 | 0.37 | decays |

Reading: the knobs are in game dollars, so the real curve (~$8.8k raise vs $15.7k) makes graduation about 2.5× easier: grad goes to 11%. Moves are bigger (p95 doubles, toward 0.19), btt improves, and shilling a tiny-B coin now loses money. The clue bot's edge is **gone**. Its hit rate falls to 2% and buy-all-at-5m also craters, so the $50 bots likely pay the extra fees plus slippage on a thinner $2.9k-start curve. The knobs need recalibrating for pf (crowd size/size_mult scaled by ~0.56 = 8.84k/15.7k is the first guess). These numbers are not tuned.
