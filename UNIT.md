# Card 26: empty Portfolio does not send a new player to unbuilt Businesses

Written 12 Nov 2026, 06:41 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

A new player's Portfolio Overview empty state says “Your money is all cash. Broker or Businesses are good first stops.” (`17-UX` :856, Studio 2026-10-28). In V1, Businesses is out of scope (`docs/v1/V1-BOARD.md` Out) and `built:false`, so opening it shows only “Coming later”. That is a dead end in the first ten minutes.

This card replaces the size-chip candidate (shortlist #2). Size chips need client maths on cash and last, which BR-4-03 forbids, and the server does not publish buying-power shares. See `/workspace/avalon/evidence/ticket-size-chips/SKIPPED.md`.

Player outcome: the empty Overview still starts with “Your money is all cash.” and points only at Broker, a built V1 first stop. It does not name Businesses (or Entreprises). Positions empty body is unchanged.

Front-end only: Portfolio Overview copy (EN + FR) and the tests that pinned the old Studio line. No engine, no registry, no hiding of the Businesses tile (that is a later shroud card).

## Exact base, branch, and identity

- Branch `ui/empty-cash-no-businesses`, worktree `/workspace/avalon/ui-empty-cash-no-businesses`.
- Base `origin/main` `98939480a24654f729a260de4c3ad0b9f5693f9a` (current tip; the brief's `d2875ef3` is an ancestor). The empty-state string already lives here. PR105 is not required.
- Verify Forge (trading-game bot) `<forge@trading-game.local>` as author and committer. Unset every `GIT_*` variable for npm-test and Git. No push.

## Grounding and sketch

`Overview` renders `t.emptyCash` in `data-testid=pf-empty` when there are no positions. PF-A unit and e2e assert the current two-stop sentence. Positions `emptyBody` is the shared prefix and must stay a prefix of `emptyCash`.

1. Chosen: EN “Your money is all cash. Broker is a good first stop.” FR “Tout votre argent est en liquidités. Le Courtier est un bon point de départ.” Same voice as the Studio line, Businesses dropped. Banned-advice words from 17 §3.20 are not introduced.
2. Rejected: deleting the second sentence (loses the first-stop pointer). Rejected: linking to Launchpad or City (not the first-trade path).

Auth-loading (REVIEW-LESSONS 19): this is copy inside Portfolio once the app body is shown. The card does not branch on `isSignedIn`. Existing load/skeleton behaviour is unchanged. A signed-out or loading Portfolio is already the demo/guest or a skeleton; the new sentence must not appear as a fake account state.

## Acceptance and proof plan

- Fail-first unit: PF-A tests and a guard that `emptyCash` does not contain “Businesses” / “Entreprises”, and equals the new EN/FR lines. Fails on this base.
- Overview empty render and PF-A e2e use the new sentence. Positions `emptyBody` remains a prefix.
- Official checks with `GIT_*` unset. Affected e2e in a clean scratch worktree with fresh `.data`. Play-through on a production build, desktop 1280 and phone 390, screenshots of the empty Overview. Evidence under `/workspace/avalon/evidence/empty-cash-no-businesses/`. No push.
