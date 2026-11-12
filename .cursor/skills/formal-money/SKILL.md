---
name: formal-money
description: "Check Port Avalon money conservation, one-time fees, share supply, and Broker order idempotency under replay. Use when editing packages/engine/ledger or src/server/broker (order, fill, fee, cash, idempotency), or when a change can create cash, charge a fee twice, mint shares, or apply one idempotency key twice."
---

# Formal money check

A test checks the cases someone wrote down. This check generates orders, fills, mints, burns, and replays and requires the money identities below to hold for every generated case inside the bounds.

TypeScript has no verifier that runs on these files. The check executes the real functions with fast-check (root `fast-check` 3.23.2, and the same major in `packages/engine/ledger`). A TLA+ model would describe a different program and would miss `centsOf` rounding and `applyPosting`, which is where a bad cent appears. Do not replace this with a hand model of the fee.

## What a pass means

Four sentences, one each:

- **Conservation.** Account balances in the engine ledger sum to 0, and M0_sys moves only when the tick minted or burned that amount. On a listed coin, player cash plus the book cash is unchanged, because the fee stays in the book (`src/server/broker/book.ts`). On a catalog name such as HALC, the player's cash moves by exactly the share notional and one fee; the NPC who takes the other side is not an account.
- **One fee.** A ledger trade posts one `MKT_EXCHANGE_FEE` flow leg for the fee that was asked, and the buyer's, seller's, and exchange's cash move by `-(price+fee)`, `+price`, and `+fee`. A Broker fill's `fee` equals `exchangeFeeMinor(notional, taker)` once, and the cash move uses that fee once. Maker and taker are the same rate here: `feeOf` always uses the taker basis points.
- **Supply.** A ledger trade moves qty from the seller to the buyer and the sum of that asset's qty stays 0. A listed fill moves tokens between the player and the book and that sum stays constant. A catalog fill changes the player's qty by that fill's qty only.
- **One order per key.** The same idempotency key is one journal row, the same intent, the same fills, and the same cash, including after `parsePlayerPrivateRow` drops the last-50 receipt ring and keeps `idempotency`. A different request with that key throws `IDEMPOTENCY_CONFLICT` and writes nothing.

Harm if one of these breaks: a player is credited cash or shares the books did not take from anyone, or a retry after a restart fills the order again.

## Run

From the repo root, with root dependencies and `packages/engine/ledger` dependencies installed (`npm ci` in each):

```bash
npm run test:formal-money
```

That runs `packages/engine/ledger/test/formal-money.test.ts` with the ledger package's vitest, then `tests/formal/money-broker.test.ts` with `vitest.formal.config.mts`. fast-check seeds are `20261112`. Ledger: 40 runs. Catalog orders: 50 runs of up to 10 steps. Listed book: 40 runs of up to 8 fills. Plus the 51-key restart, the resting-limit sweep, and the two-player book. The run is well under two minutes. CI runs this as `npm run test:formal-money` in `.github/workflows/ci.yml` after `npm ci` in `packages/engine/ledger`. `npm test` does not include `tests/formal`.

## When a change touches the covered code

Covered sources:

- `packages/engine/ledger/src/world.ts` — `applyPosting`, `runP13`, `cash`, `position`, `accountsOfAsset`, `aggregates`
- `packages/engine/ledger/src/templates.ts` — `tplMint`, `tplBurn`, `tplPay`, `tplSwapAsset`, `composeEntries`
- `packages/engine/ledger/src/money.ts` — `divRoundHalfEven` (balance units are bigint minor units of 1e6)
- `src/server/broker/execution.ts` — `decidePlace`, `decideCancel`, `sweepLedger`, `sweepListed`, `bookFill`, `placeFingerprint`
- `src/server/broker/book.ts` — `fillOnBook`, `feeOf`
- `src/server/broker/service.ts` — `place` and `sweep` commit those decisions; the check calls the pure functions the service commits
- `src/server/player/privateState.ts` — `buildPlayerPrivate`, `parsePlayerPrivateRow` (the restart load)
- `src/shell/contracts/mockFeed.ts` — `exchangeFeeMinor`, `FEE_BP`, `nextLot`
- `src/market/valuation.ts` — `centsOf`

`sync_commit` is the commit at which this check was last confirmed to describe those files. Move it forward only after you have read the diff of the covered files, updated the check so it still describes them, rerun `npm run test:formal-money`, and seen each property fail on a scratch break (below) before you restore the product code.

```
sync_commit: f8f51ad92273214eafd0a0d06afa4c0b79fabaec
```

`f8f51ad92273214eafd0a0d06afa4c0b79fabaec` is the product tree this check was written against (`origin/main` at the Broker idempotency merge). The commit that adds the check does not change those sources. After that commit, set `sync_commit` to it once the run above has passed on that commit. If a later commit edits a covered file and does not move `sync_commit`, the check can still pass while describing code that is gone. Run `/maintain-formal-verification-skill`.

## How to tell a bug from a stale check

Read the failure sentence. It names cash, a fill id, an idempotency key, or an account.

- The product sources did not change, and the sentence shows cash or qty moving by something other than one notional and one fee, a second journal row for one key, or a balance sum other than 0. That is a bug. Leave the check failing. Do not loosen a bound or drop a case to make it green. Write down the seed and the step in the failure.
- A covered file changed on purpose (a new fee rate, a new account code, a wider idempotency journal). Update the check to call the new function, keep the same identities, rerun, and do the scratch break. Then move `sync_commit`.
- A catalog fill (HALC and the other names in `src/market/catalog.ts`) changes player cash by the notional. That is the NPC trade, not a leak. The leak is a residual on top of `signedNotional + fee`. Do not add a fake NPC cash account to force the sums to match.
- `MKT_INSUFFICIENT_BP`, `MKT_NO_LOCATE`, and `MKT_NO_LIQUIDITY` leave cash, qty, and the book unchanged and store one reject. That is not a failed identity.
- A second sweep at the same mark may fill a different resting order. It must not fill an order it already removed.

## Scratch break

The check is not real until it fails when the code is wrong. On a scratch tree, do one of these, run `npm run test:formal-money`, see the failure, then restore the file. Do not commit the scratch. These three were run once when the check was added, then restored:

- Ledger: in `applyPosting`, skip the credit side so only the debit is added. The mint tick fails with `tick 0: expected [ … ] to deeply equal []` (`runP13` reports invariant failures and does not keep the one-sided posting).
- Broker: in `bookFill` (`execution.ts`), subtract `2 * fee` on a buy. `fillGap` fails: `cash 5000000 -> 4994980, fills explain …`.
- Idempotency: make `replayOf` return null. The 51-key test fails: `replay.replayed` is false.

## What this does not cover

- NPC cash and NPC inventory for catalog names. They are not accounts.
- Pools, hype, and storms in `src/server/broker/pools.ts`. The book check stops at `fillOnBook` and the player ledger.
- The HTTP routes. They call `BrokerService.place`, which calls `decidePlace` inside the auth lock. The check calls `decidePlace` and then `buildPlayerPrivate`, which is the persist boundary `commitOwn` uses. It does not open a socket.
- A journal that was never saved. Old rows with only the last-50 receipts replay those 50 keys. The check's restart drops the ring and keeps `idempotency`. Losing the journal on save is a bug; model it by deleting `idempotency` and watching the first of 51 keys fill again.
- Maker/taker fee splits, taxes, and any fee that is not `exchangeFeeMinor` at `FEE_BP.taker` or the single `MKT_EXCHANGE_FEE` leg on a composed trade.
- More than 8 listed fills or 10 catalog steps in one generated case, quantities above the bounds in the tests, or notionals that are not safe integers. `decidePlace` rejects those as `MKT_BAD_QTY` / `MKT_BAD_PRICE` before a fill.
