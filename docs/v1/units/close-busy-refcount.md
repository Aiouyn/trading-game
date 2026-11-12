# Card 40 — Close busy is a per-ticket refcount, and a cap reset must not clear it

**When:** 12 Nov 2026, 12:23 Europe/Paris (CET)
**Branch:** `ui/close-busy-refcount`
**Base:** `f8a84f945ea20be273dc4995e891b40534b0ac8c` (card 34 `ui/close-prefill-held` after merging origin/main `705621d6`). No product work in this commit.
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** high (order-ticket path). Docs only this pass; do not build yet. No push.

## Player outcome

Close on a row stays off for as long as that asset still has a ticket mid-Place, even if the player hits the 4-window cap with Close on a different asset, and even if a second Broker for the same asset mounts (or unmounts) while the first is still submitting. A cap miss still clears only the held prefill and shows the existing notice; it does not re-enable Close on the submitting row.

## Grounding

Gatekeeper card 34 `@230bb397` PASS qualified, with two leftover quals in `/workspace/avalon/evidence/launchpad/gatekeeper/230bb397/REVIEW.md` (Q1, Q2) and failing probes in `proof/gk-probe6.test.tsx` (A, B). C and D on that probe already pass and are not this card.

## Quals

### q1 — a cap Close on another asset clears every asset's busy flag

`resetTicketPrefill()` in `src/apps/broker/ticketPrefill.ts:36` also calls `setTicketSubmitting(null)`, which empties the whole per-asset busy set. `src/apps/portfolio/Positions.tsx:111` calls `resetTicketPrefill()` when Close cannot open or reuse a Broker at the cap.

Repro on a flag build, `?replyMs=4000`, 1280: four Brokers including HALC, Place buy 5 HALC, while HALC is still `submitting` press Close on AVB. The cap notice is shown, and HALC Close becomes enabled even though HALC is still mid-Place.

### q2 — there is no per-asset refcount

Busy is a `Set` of asset ids, not a count of ticket instances. `BrokerFrame.tsx:204-205` (was `:186-187` on `230bb397`) does `setTicketSubmitting(assetId, submitting)` and, on cleanup, `setTicketSubmitting(assetId, false)`. A second HALC Broker that mounts mid-Place and then re-runs that cleanup (or a context-less Broker whose picker is moved to HALC) clears HALC's busy flag while the first ticket is still submitting.

## Plan

1. Track submitting as a per-asset refcount keyed by ticket instance, so Close for that asset stays disabled until every mid-Place instance of it has finished or unmounted.
2. `resetTicketPrefill()` clears only the held prefill; it never touches the submitting/busy state.
3. A ticket's layout-effect cleanup decrements only its own instance; it must not zero another ticket's in-flight count for the same asset.

## Fail-first units

Gatekeeper's names, from probe 6 A/B:

1. `cap notice on another asset while HALC is mid-Place: HALC Close stays disabled`
2. `second Broker on the same asset mounts mid-Place: HALC Close stays disabled`

Red on this base (`f8a84f94` / `230bb397` product), green after the fix. Do not write the product change in this commit.

## Out of scope

- Changing the 4-window cap, stealing another ticket, or the derived cap notice.
- Auth-boundary prefill reset (card 34), other than making sure it still must not clear busy.
- Building or pushing this branch in this pass.
