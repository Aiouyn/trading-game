# Card 24: the Review estimate refreshes after a reconnect, even on the same or a lower tick (ui/review-stale-after-reconnect)

Written 2026-11-12 03:02 CET. Assigned by Avalon Builder from Gatekeeper's qualification 1 on card 19 (83f2d909).
Evidence: evidence/launchpad/gatekeeper/83f2d909/REVIEW.md, "same-tick restart does not force a new preview".

## Base
83f2d909 (card 19 head). Card 19 is not on origin/main yet: after fetching, origin/main is 5d320e04 and does not contain
83f2d909. Per Gatekeeper's condition (1), the work is developed here, and this unit's commits (UNIT, test, fix) stay
cleanly separable so they can be cherry-picked onto main once card 19 lands.

## Problem
After a real server restart, the live clock goes back to boot tick 27700. Review kept the pre-kill estimate (tick 27700,
42.18) because `reviewStale` (BrokerFrame.tsx:139) is only `computedAtTick < tickerTick`. When a restart lands on the
same tick, or on a lower one, nothing re-prices. Place still filled once at a fresh price, but the player was shown the
old estimate.

## Behaviour (client only; submission, intents, server, engine and card 19's place gating unchanged)
- Broker keeps a reconnect epoch. It goes up once each time `system.connection` turns from "reconnecting" back to
  "live". In the feed, that flip happens inside the adopt of the first good /api/market read, so this is exactly a
  reconnect→live adopt.
- Each estimate records the epoch it was requested in. An estimate from an older epoch counts as stale, the same way an
  older tick does: Review shows "Refreshing estimate…" and Place waits.
- On recovery, the ticket immediately asks again for the current draft. The per-tick preview budget is reset for that
  one request, so the old tick's count cannot hold it back.
- A healthy poll that adopts the same tick does not touch the connection flag. So it does not bump the epoch, does not
  re-request, and does not make the estimate flicker.

## Proof
- Fail-first units in tests/unit/17b/outage-review-reason.test.tsx:
  - Recovery on the same tick: the estimate refreshes (new epoch, Place waits until it lands).
  - Recovery on a lower tick: the estimate refreshes at the lower tick.
  - No flicker: healthy polls that adopt an unchanged tick leave the estimate and computedAtTick untouched, with no new
    preview requests.
- A real SIGKILL and restart (production `next start`, port 33xx, stopped by pid) at desktop 1280 and phone 390. The
  estimate must move from the pre-kill tick and price to the live one, and a double click plus Enter must make exactly
  one order.
- The full preflight with GIT_* unset. A clean e2e with fresh .data on the card 19 set. No push.
