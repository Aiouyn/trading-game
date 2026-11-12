# M1-08 phone status-bar net-worth chip test

**When:** 12 Nov 2026, 18:24 Europe/Paris (CET)
**Branch:** `ui/m108-chip-test`
**Base:** `origin/main` `e7d2fc41dda2c442d650501ffd0325cfc59e7bfe` (PR #142, eng/infra-spend-guard)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (tests only). Front-end lane. No product-code change. No push this pass. `UNIT.md` was not changed.

## Player outcome

No product change. The phone status-bar net-worth chip already formats with `MoneyText` `ctx="chip"`, which abbreviates from $10,000.00 (`shouldAbbreviate` in `src/components/ui/money.ts`) and keeps the full value on the `.money` node's `title` (and in `aria-label` via `speakMoney`). The M1-08 phone e2e compared that chip's visible text to the server's full valuation (`$10k` against `$10,000.58`), so it failed whenever net worth after the buy was $10,000 or more. Desktop `stripMatches` already reads `title ?? textContent` and does not have this bug.

## Grounding

- `/workspace/avalon/evidence/close-busy-refcount/ci-fix/REPORT.md`: CI run 43215986596, phone `tests/e2e/17b/M1-08-portfolio.spec.ts:275`, chip `$10k` vs valuation `$10,000.58`. Pre-existing on main; not caused by card 40.
- `src/components/shell/MoneyText.tsx`: `title={abbreviated ? full : undefined}`; `aria-label={speakMoney(...)}`.
- `src/components/shell/PhoneHome.tsx` status-bar chip: `ctx="chip"`. The outer `.sb-nw` `title` is the "Saved net worth" label, not the amount.
- `docs/v1/REVIEW-LESSONS.md` 6 (real values, never a hardcoded stand-in) and 8 (fail first).

## Plan

- Keep product code unchanged: the chip already exposes the full value.
- Change the phone assertion so it checks the visible text against `compactMoneyText` (the same formatter the chip uses) and the full amount against the `.money` `title` when present, otherwise `textContent`. A wrong number still fails: `$10,099.99` and `$10,000.58` both render `$10k`, but their titles differ.
- Extract that comparison as a helper and unit-test it for amounts under and at/over $10,000, including the case where the abbreviation matches a different amount. The live market is not pinned to a seed, so the e2e cannot land net worth at $10,000 or more deterministically.

## Acceptance / proof

- A unit test of the comparison helper fails the old visible-text-equals-full-valuation check at $10,000.58, passes the new check under $10k and at/over $10k, and rejects a wrong amount whose abbreviated text matches.
- M1-08 e2e on a fresh `.data` (desktop + phone) passes on the final head.
- `head-checks.sh`, `npm run test:formal-money`, and `npx tsx tools/verify/port-avalon.ts run` pass on the final head. No push.
