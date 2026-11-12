# Card 39 — Place stays disabled after an outage until the new-epoch estimate lands

**When:** 12 Nov 2026, 11:08 Europe/Paris (CET)
**Branch:** `ui/estimate-epoch-test`
**Base:** `origin/main` `f8f51ad92273214eafd0a0d06afa4c0b79fabaec` (PR #105, eng/broker-idempotency)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (tests only). Not opening a PR. No push this pass.

## Player outcome

No product change. Card 24 already bumps a reconnect epoch when `system.connection` flips from reconnecting back to live, records that epoch on each estimate, and treats `est.epoch < epoch` as stale the same way an older tick is stale, so Place waits and Review says "Refreshing estimate…". That epoch clause at `BrokerFrame.tsx:203` has no fail-first test of its own. The existing card 24 units wait until the re-asked estimate has landed, then assert Place is enabled; they do not hold the new preview and show that Place stays off in the gap, including when the adopted tick is the same as the estimate already on screen (`computedAtTick < tickerTick` is false, so only the epoch clause keeps Place disabled).

## Grounding

- Avalon Builder, after PR #105 landed: "BrokerFrame.tsx:203 `est.epoch < epoch` has no fail-first test: add an outage unit expecting Place disabled until the re-asked estimate lands. tests-only, low tier."
- `docs/v1/units/review-stale-after-reconnect.md` (card 24) and `tests/unit/17b/outage-review-reason.test.tsx`.
- `docs/v1/REVIEW-LESSONS.md` 8 (fail first).

## Plan

Add one outage unit: a ticket in Review, reconnect that adopts the same tick, hold the re-asked preview so it has not landed yet. Place is disabled (old estimate, same tick, older epoch). When the new-epoch estimate lands, Place is enabled. No product code changes.

## Acceptance / proof

- The new unit fails first when the epoch check is temporarily removed from a scratch copy of `BrokerFrame.tsx` (same-tick stale path would keep Place enabled while the re-ask is in flight), and passes with the guard intact. The mutation is not committed. Both logs live under `/workspace/avalon/evidence/estimate-epoch-test/`.
- Lint, typecheck, build, check-hooks, unit, ledger-no-dup, route-budget. No push.
