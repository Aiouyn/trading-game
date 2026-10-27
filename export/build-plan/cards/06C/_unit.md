# Unit 06C — Crypto and DeFi (stage S2)

Purpose: the crypto side of module 06. Launch tokens and wrappers, three chains with one deterministic block per tick (hash order, no MEV, EIP-1559-style burned gas), wallets and exchange custody, issuance and staking, fundamentals and the hype process, NPC meme coins, Tidepool constant-product and stableswap pools, Cascade range pools, Quill oracle, Ferro/Harbor lending with keeper liquidations, the three stablecoin mechanisms, Arc Bridge and Keystone, NPC venue arbitrage and crypto actors, and player-launched tokens built in full behind `player_tokens_enabled = false` (L10, R34). Package `packages/engine/assets/crypto`, ModuleDef `id '06C'`, module `'06'`, depends on 05 and 06A. Also owns the module-wide assembly entry `packages/engine/assets/index.ts`, the posting audit and the 06 benchmark.

## Tasks (build order)
1. T06C-01 Schema, genesis, chains, block engine, gas, wallets, issuance, staking, custody
2. T06C-02 Protocols, Tidepool CP and stableswap pools, LP tokens, TWAP
3. T06C-03 Fundamentals, hype, meme coins
4. T06C-04 Cascade range pools
5. T06C-05 Oracle, lending, keepers, no atomic composition
6. T06C-06 Stablecoins (fiat, CDP, algorithmic)
7. T06C-07 Bridges, Keystone, NPC venue arbitrage and actors
8. T06C-08 Player-launched tokens (flag off)
9. T06C-09 Views, assembly, posting audit (06#45), benchmark (06#46)

## Internal DAG
01 → 02 → {03, 04, 05}; 01, 02, 03, 05 → 06; 01, 02, 04, 05 → 07; 01, 02, 03 → 08; all → 09 (also T06A-17/18, T06B-11).

## Exports to other units
- `createCryptoModule(ports)`, `createAssetModules(ports)` (06A, 06B, 06C and the composed instrument port for 05); LP_TOKEN valuer; port extension members `hype`, `otherVenueLnP`, `oraclePrice` (06B perps), CRYPTO preTradeGate branch; `StablePorts` (07 deposit haircut and repo, 16 wind-down and attestation shocks).

## Acceptance tests by task
T06C-01: 24, 25 · T06C-02: 26 · T06C-04: 27 · T06C-05: 28, 29, 30 · T06C-06: 31, 32 · T06C-07: 33 · T06C-08: 44 · T06C-09: 45, 46.

## Registry gaps and unit decisions
- RNG: 06 §3.11.4 names `rng('meme', tick)`, absent from 02's registry; gap `ast.meme` requested, meanwhile meme spawns draw `ast.crypto_hype` with key `MEME_SPAWN`. `ast.depeg` and `ast.oracle` are registered but undrawn: stable statuses must change only for a cause (06#31) and the oracle rule is a deterministic median.
- Reason codes: no SINK code for the token launch fee (`CRY_TOKEN_LAUNCH_FEE` requested; required before the flag is turned on); `DEFI_NETWORK_FEE` is SINK but gas is a token burn (needs a burn template); `CRY_TOKEN_MINT` is NC but changes token quantity (needs a mint template). T06C-09's audit carries these as explicit allowances.
- Params: `ast_auc_supply`, `ast_gusd_reserve_mix` are owner-table rows (†) read as constants.
- Decisions: AUC daily issuance `i0 = (18M − genesis)/(2 × 1,344)` halving per chapter (22 authors no figure); adoption index normalized to 0 at genesis; first LP deposit locks 1,000 micro-units; same-block borrow+repay on one market rejected (`AST_SAME_BLOCK`) to enforce §3.12.11; NPC LPs redeposit when fear < 0.4 (hysteresis); stablecoin status uses no RNG.
- R34 applied: all conditions (LIC4, R4, no S4 in 8 real weeks, account ≥ 30 real days, FINTECH ≥ 3, era ≥ 2, LiveOps flag) are checked together; 16's inputs default to closed.
