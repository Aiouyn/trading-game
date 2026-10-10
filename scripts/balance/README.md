# scripts/balance (owner: Tape)

Seeded, headless balance harness. Runs Quant's engine over many seeds and checks the results against the target bands in `bands.ts`.

- Run: `npm run balance` (defaults: 20 seeds x 5 game years at 24 ticks per game day). In PowerShell, pass flags with `npx tsx scripts/balance/run.ts --seeds 20 --years 5 --tpd 24`.
- Writes `balance-out/summary.json` (per-seed stats and every band result) and exits 1 if any band fails.
- Seeds are `tape-01` ... `tape-NN`, so every run is reproducible. Seed `tape-01` is run twice as a determinism check.
- Phase 0 bands (Quant's proposal, adopted by Ledger): realized vol / `expectedVol(def)` (diffusive + jump variance) median per asset in [0.85, 1.4]; GX CAGR median in [0%, 12%]; zero NaN, below-floor or out-of-bounds h; contraction in at least 50% of seeds; buy-and-hold GX beats random monthly picks and 63-day momentum in 10-90% of seeds (no guaranteed edge).
- Strategies have no fees yet (no order book in Phase 0). Phase 3 adds the adversarial bands from vision 03 §16.
- Rare-jump names (V1-PHASE1 F13): `--universe --assets FLUX,AUSD --seeds 75 --first K` runs only their vol-ratio verdict, with the RMS over seeds and its standard error. `--first K` starts at `tape-K`, so a run splits over processes, each with its own `--out`; merge the `perSeed` arrays to get the RMS over all seeds.
- `scripts/balance/rate-var.ts` regenerates the rate-shock variance table in `src/engine/ratevar.ts` (V1-PHASE1 F13); `src/engine/ratevar.test.ts` fails when the table is stale.
- `scripts/balance/huge-money.ts --pensionMax X` runs the whale check at another pension cap; it prints the largest pension move on an account-idle FROG day (V1-PHASE1 F16).