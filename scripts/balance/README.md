# scripts/balance (owner: Tape)

Seeded, headless balance harness. Runs Quant's engine over many seeds and checks the results against the target bands in `bands.ts`.

- Run: `npx tsx scripts/balance/run.ts --seeds 20 --years 5` (writes `balance-out/summary.json`, exits 1 if any band fails).
- Bands are design targets from the vision docs and get added only after Quant and Ledger confirm them. Results are always measured, never typed in.
- Phase 0: market stats only. Phase 3 adds the adversarial bands from vision 03 §16.