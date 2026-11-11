# Offline margin and CCP cash waterfall

This is an isolated, default-off kernel, not a V1 feature. See `UNIT.md` for exact spec citations, deliberate limits and before-mount requirements. No runtime, route, UI or environment flag imports it.

## Owned state

`src/server/margin-ccp/engine.ts` owns explicitly seeded FDL cash wallets, member margin, service default funds and SITG, funded recovery calls and their loss receipts. `model.ts` defines the contracts. `boundary.ts` validates raw JSON and canonicalizes fingerprints. `store.ts` owns durable CAS checkpoints. `liquidation.ts` only plans readonly next-tick, finite-participation fair-value instructions; it does not fill a book or own positions.

Opening the engine requires a literal offline `true` opt-in; otherwise it rejects before touching the store. Supply complete certified facts for every tick to `advance(target, frames)`. Posting cash occurs after that tick's margin test, so relief first applies at the next margin test. Retrying reordered object fields is idempotent; arrays retain meaningful order.

Every cash payment debits an existing owned bucket. Close-out loss claims are readonly producer contracts, not claims15/16. They must balance and refer to service members. The waterfall cannot cross services or use escrow. Assessments are commitments until actually paid from member wallets; variation gains are haircut only after real net settlement funding. Loss amounts, unpaid claims and owner-loss instructions are liabilities, not minted cash. Exhausted capital remains visibly deficient.

## Before mounting

V1 permission is required (`docs/v1/V1-BOARD.md:82,84`). Also required: authenticated risk/mark and complete close-out producers; execution/position owners for actual finite fills and funded 1% penalties; full porting/hedging/auction and tear-up executors; weekly Cover-2/member qualification; funded fees/capital recapitalization and regulatory reopening; bank/deposit/credit reconciliation. No loan or business engine is introduced.

Only MEMBER_HOUSE, cash FDL, LD/OTC/CDS/REPO are supported. Retail/client margin, ClearingDebt, collateral/FX, CRY/ADL, ESC and owner-bank recapitalization are excluded. The existing DEGEN engine remains its own owner and is untouched. There is no last-resort buyer, lender or cash rescue.

## Verify

- `npx vitest run tests/unit/margin-ccp/margin-ccp.test.ts`
- `npx tsx tools/proofs/sys-margin-ccp.ts <new-output-directory>`

The proof requires new physical stores and compares full state plus canonical checkpoint bytes for jump, tick/chunk and restart execution. Its independent audit reconstructs cash buckets from opening balances and transfers, including real waterfall exhaustion, overlapping caps and unpaid claims. It is a correctness artifact, not a throughput benchmark.
