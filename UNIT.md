# Card 17: the analytics consent prompt must not cover app content

Written 12 Nov 2026, 02:06 Europe/Paris (CET), before any implementation on this base. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

Original UNIT commit on the expiry lineage: `3d78d24b903a22a274590a3b66fd21b20214ae67` (12 Nov 2026, 01:56 Europe/Paris (CET)). Restacked onto a lower base that already has the same prompt; this commit is the UNIT for the new base (lesson: a restack gets a new author date — the original SHA is recorded here).

## Value and scope

Playtest e30f6822, shots `d35_A_portfolio_overview.png` and `p13b_phone_B_wire_item.png`. The first-launch consent card ("Share anonymous usage analytics to help improve Quay? Accept / Decline") is `position: fixed` at `bottom: var(--sp-8)` (phone: plus `--hit-touch`). It floats over app content: on desktop 1440 it covers the bottom of the Portfolio window (Cash · FDL is clipped) and shelf tiles; on phone 390 it sits over the Wire item and the bottom chrome.

This prompt was introduced in `90a06e79` (telemetry Gatekeeper follow-up). It is not on `origin/main` @ `24f67e0a`. It is present, and byte-identical in the files this card touches, on `origin/eng/broker-idempotency` @ `7aaefce8df2fbc92cc181ae3fc804ecd32fd48b1` (PR105, 16 commits over a divergent main). That is the lowest candidate that already has the UI this card fixes. The older expiry HEAD `a7460c78` has the same prompt but is a higher, separate lineage — do not base here.

The prompt must never cover app content. Dock it into reserved space (above the 52 px desktop shelf / above the phone bottom row) and keep it compact, at desktop 1280 and 1440 and phone 390 and 320. Its bottom inset is `max(var(--sa-bottom, 0px), env(safe-area-inset-bottom))` — this base may not define `--sa-bottom`, so the 0px fallback matters. Keep it honest: the question stays readable, Accept and Decline stay equal-weight, and it is easy to dismiss (a dismiss control that only hides the prompt for this visit, without writing a consent value). Presentation only: do not change `setTelemetryConsent`, the consent API, telemetry events, or when the prompt is offered (`needsTelemetryConsentPrompt`, `ConsentBoot`, the lazy chunk, `?telemetry_consent=1`).

Do not edit `nav.css` safe-area rules, `notices.css` `.qs-bottom`, or `layout.tsx` meta (card 10). Stay off the ticket's order-type/TIF logic, the engine, Boards, guest Home, the rank label, Settings/sign-up, and deep links.

## Exact base, branch, and identity

- Branch `ui/consent-no-cover`, worktree `/workspace/avalon/ui-consent-no-cover`.
- Base `7aaefce8df2fbc92cc181ae3fc804ecd32fd48b1` (`origin/eng/broker-idempotency`).
- Verify Forge (trading-game bot) `<forge@trading-game.local>` as author and committer. Unset every `GIT_*` variable for npm-test and Git. No push.

## Grounding and sketch

`ConsentPrompt` / `consent.css` today: a 320 px card, `z-index: var(--z-chrome)`, anchored to the viewport bottom. The desktop work area already stops above `--shelf-h` (52 px); the card is taller than the remaining shelf band, so it overlaps windows. The phone card is similarly taller than the offset above the dock.

1. Chosen: a compact strip docked into reserved space. Desktop: a bar immediately above the shelf, and `workArea`'s bottom reserve grows by the strip height so windows shrink instead of sitting under it. Phone: the same strip in layout above the bottom row (flex, not a viewport-fixed overlay over `.phone-appbody`). Bottom inset `max(var(--sa-bottom, 0px), env(safe-area-inset-bottom))`. Accept and Decline stay the same two equal chips; add a dismiss control that only calls the existing `onDone()` (no `setTelemetryConsent`). Copy unchanged.
2. Rejected: shrinking the typography until the card fits inside the 52 px shelf (unreadable, and it would still cover shelf tiles). Rejected: a blocking modal. Rejected: changing consent storage or when the prompt appears.

## Acceptance and proof plan

- Reproduce d35 (Portfolio) and p13b (phone Wire item) on this base, with before-shots, at 1280, 1440, 390, and 320.
- After the fix, the prompt's box does not intersect `win-portfolio` / other desktop windows, the shelf tiles, `.phone-appbody` / the Wire item, or the phone bottom row. Cash · FDL and "Open in Broker" stay visible.
- Accept and Decline remain equal-weight, both ≥ 44 px on phone, and still persist as today's e2e already checks. Dismiss hides the prompt without writing `quay.telemetry.consent`. Existing `tests/e2e/17b/telemetry-consent.spec.ts` stays green.
- Fail-first unit or component test of the reserved/docked layout, plus a fail-first e2e on those four viewports that the prompt and app content do not overlap.
- Official checks with `GIT_*` unset. Report `/broker` first-load gz bytes on this HEAD versus this base (`7aaefce8`), against this branch's own budget. One clean e2e in a scratch worktree with fresh `.data` (new spec + `telemetry-consent.spec.ts`). Evidence under `/workspace/avalon/evidence/ui-consent-no-cover/`. No push.
