# Card 35 — Wire empty states explain the wait and recover a filter

**When:** 12 Nov 2026, 09:41 Europe/Paris (CET)
**Branch:** `ui/wire-empty-recovery`
**Base:** `origin/main` `1c74fdb4d4c440fb4757fd13b2b935619c99eaef` (PR121, card 30)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (Wire copy + navigation). Not opening a PR. No push this pass.

## Player outcome

A signed-in player who opens Wire in the first ten minutes currently sees a live All feed that is empty, labelled only “Nothing in this filter yet.” That sentence is wrong on All, and there is no next step. A guest (or anyone) who picks an empty filter such as Verdicts sees the same line even when All still has stories, with no way to return to the whole feed.

After this card: a signed-in All-empty feed keeps that existing label, adds a short honest wait line (stories appear as events happen; Broker can be opened meanwhile), and offers Open Broker. An empty selected filter offers Show all stories, which resets to All and focuses the All chip. Guests do not get the live-world wait line. The buttons only open Broker or reset the filter. No pre-fill, no submit, no invented story.

## Grounding

Observed on this tip, official production build, fresh `.data`, 1280 and 390: after creating an account, `/wire` All is live and empty with only “Nothing in this filter yet.” Guest demo All has four stories; Verdicts, Purchases, Milestones, World events, and Statements show the same empty line and no recovery. Evidence: `/workspace/avalon/evidence/card35-play/shots/signed-{desktop-1280,phone-390}-05-wire-all.png` and `guest-desktop-1280-06-wire-verdicts.png`.

- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:479` — EmptyState is “one serif line + one suggested action”; never a blank panel.
- Same file `:908` — WIR-01 empty filter copy “Nothing in this filter yet.” Keep that label on the existing `wire-empty` hook.
- `docs/v1/V1-BOARD.md` M2-01 (30s clarity + 2-min first trade) and M2-04 (Broker + Portfolio + Wire at ~390px). Phone dock is already those three apps (card 30).
- `export/vision-review/complete/18-ONBOARDING-ACADEMY.md:175` — first-trade path goes through a Wire story then Broker; the guide must not invent a headline (18 `:131`, `:133`).
- `docs/v1/REVIEW-LESSONS.md` entry 19: while `/api/auth/me` is held, the signed-in wait line and Open Broker must not flash in (and no guest-only claim either). The unknown-session path shows a muted skeleton in the help slot.

This card does not edit `PhoneHome.tsx`, `nav.css`, Portfolio Overview/Positions, Settings, or Broker ticket/frame files, so it will not collide with cards 31–34 or the queued PR105-stack UI cards.

## Scope

- Wire feed empty panel only (new Wire-local help copy, EN + FR). Existing `t.empty` / `data-testid=wire-empty` stays.
- Open Broker calls the existing shell `open("broker")`. Show all stories only sets the filter to All and focuses that chip.
- Loading, denied, error, stale, breaking strip, story order, and detail navigation stay as they are.
- An older `ui/wire-first-step` branch sketched this on a stale base and wrote a root `UNIT.md`; this card is rebuilt off current main with the note in `docs/v1/units/`.

## Acceptance / proof

- Fail-first unit: on this base, an empty signed-in All feed has no wait line and no Open Broker; an empty Verdicts filter has no Show all stories; while `/api/auth/me` is held, those controls are absent and a muted help skeleton is shown. After the fix they appear as specified, guest All-empty still has no live-world wait line, and Show all focuses the All radio.
- Official-flag e2e on fresh `.data` (including a hold of `/api/auth/me`), plus production play at 1280 and 390 with screenshots under `/workspace/avalon/evidence/wire-empty-recovery/` (play scripts live there, not in the worktree).
- Full checks on the exact final head (`/broker` < 215 KB gz). No push.
