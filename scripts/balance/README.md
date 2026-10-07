# scripts/balance (owner: Tape)

Seeded, headless balance harness. Runs Quant's engine over many seeds and checks the results against the target bands in `bands.ts`.

- Run: `npm run balance` (defaults: 20 seeds x 5 game years at 24 ticks per game day). In PowerShell, pass flags with `npx tsx scripts/balance/run.ts --seeds 20 --years 5 --tpd 24`.
- Writes `balance-out/summary.json` (per-seed stats and every band result) and exits 1 if any band fails.
- Seeds are `tape-01` ... `tape-NN`, so every run is reproducible. Seed `tape-01` is run twice as a determinism check.
- Phase 0 bands (Quant's proposal, adopted by Ledger): realized vol / `expectedVol(def)` (diffusive + jump variance) median per asset in [0.85, 1.4]; GX CAGR median in [0%, 12%]; zero NaN, below-floor or out-of-bounds h; contraction in at least 50% of seeds; buy-and-hold GX beats random monthly picks and 63-day momentum in 10-90% of seeds (no guaranteed edge).
- Strategies have no fees yet (no order book in Phase 0). Phase 3 adds the adversarial bands from vision 03 §16.