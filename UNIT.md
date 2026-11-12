# Card 19: say "Connection lost · retrying" early, stop showing "After hours", explain a disabled Review (ui/outage-reconnecting)

Written 2026-11-12 02:05 CET. Assigned by Avalon Builder (playtest #4, outage). The first draft of this unit was ecd9bd24
on the old stack (abf14e57). Under Builder's base rule it is rewritten here on the lowest branch that already has the
code it touches. The archived stack attempt is on local branch ui/outage-reconnecting-on-abf14e57 (ecd9bd24, 3e200da4,
a6f65c64), not pushed.

## Base: origin/main 24f67e0a
main already has everything this card touches: the signed-in /api/market poll in MockFeed (`authoritativeQuotes`,
`SERVER_QUOTE_POLL_MS` 1 s), `applySignedInDemo` (where the feed is created), `channels.system.connection`, MarketPhase's
"Reconnecting…" label (StatusStrip and PhoneHome pass it through), LoadState, PhoneBanners, the Broker ticket
(BrokerFrame, SimpleTicket) and the EN/FR shell and broker string tables. Neither PR105 (eng/broker-idempotency) nor the
old stack is needed.

## Problem on main
After a mid-session server kill, a signed-in player sees nothing for about 11 s. `pullServerQuotes` ignores a failed
read ("keep the last snapshot"), and `system.connection` is only ever written by the `?conn=` test hook. Quotes go stale
only when the channel watchdog fires. Until then the header keeps saying "After hours" or "Market open", and Review
order, once disabled as stale, gives no reason. The poll fires every 1 s for the whole outage, with no backoff.

## Behaviour (client feed and UI only; src only, no engine, no server)
1. Signal. When a signed-in /api/market read fails after quotes were adopted (network error, non-2xx, or a body that
   cannot be adopted), the feed reports "reconnecting". `applySignedInDemo` copies that into
   `channels.system.connection`, ignoring a feed that has since been swapped out. The next successful adopt sets it back
   to "live". A failure before the first adopt does not set the flag.
2. Backoff. The healthy cadence stays `SERVER_QUOTE_POLL_MS` (1 s). The brief says 5 s, but 5 s is the price tick
   `FEED_TICK_MS`; this is flagged as a caveat. After the n-th failure in a row, the next read waits
   min(15 s, 1 s·2^(n-1)) with ±20 % jitter, clamped to 15 s. A success resets the count, so the next outage starts again
   at about 1 s. `retryDelayMs(failures, random)` is pure and takes an injectable random. The poll becomes a
   self-scheduling timeout with at most one read in flight, and it stops on stop() or unsubscribe.
3. Presentation.
   - Notice: the existing LoadState slot (desktop pill under the strip, phone banner, alerts-sheet row) reads
     "Connection lost · retrying…" (FR "Connexion perdue · nouvel essai…"). It is `role="alert"` and has no Retry button.
     Priority: offline, then load error (which keeps its Retry), then connection lost.
   - Header: MarketPhase already shows "Reconnecting… · Port Avalon" from the flag. StatusStrip and PhoneHome are not
     edited.
   - Broker: Review order and Place order are disabled while reconnecting. A visible reason sits next to Review
     (`br-review-reason`, linked with aria-describedby), in EN and FR. A stale-only reason covers the case where the
     watchdog has marked prices stale. Order-type and time-in-force controls are not touched, nor are the Portfolio
     Orders list, nav.css safe-area, notices.css .qs-bottom or layout.tsx meta.

## Gatekeeper proof additions
(a) A ticket already in Review before the outage cannot be placed while reconnecting. After recovery, Review re-prices
    from fresh data (a preview at the new tick) and one Place makes exactly one order.
(b) The notice clears by itself after the restart, with no refresh.
(c) The backoff resets after a success: the first retry of the next blip comes after about 1 s, not 15 s.
(d) The guest view does not change: the guest feed never sets the flag, nothing shows the notice, and the shell visuals
    match base and head.

## Acceptance and evidence
- Fail-first units, each logged red on base and green on head: the backoff schedule and jitter bounds; the feed's flag
  transitions and gaps, including the reset; the notice copy in EN and FR; the Review/Place gating and reason, including
  (a); the guest feed and guest shell, for (d).
- Real kill: a production `next start` on a 33xx port, at desktop 1280 and phone 390 and 320. Kill the server with
  SIGKILL. The notice must appear within about 2 s, the header must not show a market phase, and Review must show its
  reason. Log the /api/market timestamps both on the network and in the page, along with renderer stalls. Restart the
  server on the same port: the app must recover without a reload (b), and a second blip must retry after about 1 s (c).
  A guest tab stays unchanged throughout (d). Take screenshots at every stage. Stop the server by pid only.
- Preflight on the head, with GIT_* unset: lint, typecheck, a build with no flags, npm test, /broker bytes (215 KB gz),
  plus check-hooks and ledger-no-dup where main has them. Run a clean e2e on fresh .data, with the visual suite on both
  base and head. Delete the scratch worktree. No push.
