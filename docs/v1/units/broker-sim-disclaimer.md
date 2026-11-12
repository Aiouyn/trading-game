Moved from UNIT.md on 12 Nov 2026 (Europe/Paris) per Builder's rule.

# Card 28 — Broker footer: “Simulated market. Not financial advice.”

**When:** 12 Nov 2026, 06:51 Europe/Paris (CET)
**Branch:** `ui/broker-sim-disclaimer`
**Base:** `origin/main` `98939480a24654f729a260de4c3ad0b9f5693f9a` (PR111 + PR113)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (copy). Not opening a PR. No push this pass.

## Why this card, not phone-dock Messages

Shortlist #4 was the phone dock's dead Messages slot (`17-UX` :259). Card 28 was to be that slot only if Wire/messages **inbox** data already exists on main. It does not:

- No `src/apps/messages`, no inbox/DM files, no messages channel or API on `origin/main` `98939480`.
- Wire exists (news feed + composer). That is not an inbox. Building a Messages body would invent data.
- Replacing the slot with Boards is a real gap, but it is not "messages data exists"; this UNIT does not do that swap.

So Messages is skipped (note at `/workspace/avalon/evidence/phone-dock-messages/SKIPPED.md`). The next real, already-grounded player-facing gap on the same shortlist is the Broker footer disclaimer (`17-UX` :707): the footer is missing, and a new player can take the ticket as a real-market tool.

## Player outcome

The Broker window carries the line “Simulated market. Not financial advice.” in the footer, on both phone and desktop, so the first ticket is visibly a game, not advice.

## Grounding

- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:707` — that exact sentence “sits in the Broker footer and the Settings › About page”.
- Settings › About already has a close pair (`disclaimerGame` / `disclaimerAdvice`) in different words. This card does not rewrite About; it adds the specified Broker footer line.
- `docs/v1/REVIEW-LESSONS.md` entry 19: the footer is static copy, not a number. It must not appear in a way that invents session or money data. On the ticket skeleton (`data-state=loading`) it may be absent (the frame is not the live ticket yet) or present as the same static sentence — never with a fake quote or cash figure beside it. Test the held-`/api/auth/me` path so the line does not depend on signed-in.

## Scope

- One footer line on the live Broker ticket (Trade view; also About, so the window still says it when the ticket column is swapped).
- EN exact spec wording. FR equivalent, same meaning.
- `data-testid="br-disclaimer"`.
- No order, preview, or submit changes. No Settings rewrite.

## Acceptance / proof

- Fail-first unit: mount the live HALC ticket; no `br-disclaimer` before the fix; after the fix, the exact English sentence is there (and FR when locale is `fr`).
- While auth `/api/auth/me` is held, a live (or guest) ticket still shows the same static line, or the loading frame shows no invented numbers next to it.
- Official-flag e2e on fresh `.data` plus production play at 1280 and 390, with screenshots, on `/broker?asset=HALC` (and phone Broker).
- Lint, typecheck, build, check-hooks, unit, ledger-no-dup, route-budget (`/broker` headroom is tight), e2e. No push.
