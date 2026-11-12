# Card 37 — Strip the sent Wire statement from the composer after it posts

**When:** 12 Nov 2026, 10:55 Europe/Paris (CET)
**Branch:** `ui/composer-strip-sent`
**Base:** `origin/main` `f8f51ad92273214eafd0a0d06afa4c0b79fabaec` (PR105, eng/broker-idempotency)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** high (the leftover draft can be posted again and spends player money: $500 and a daily slot). Not opening a PR. No push this pass.

## Player outcome

A signed-in player types a statement, hits Post, and can keep typing while the button shows Posting…. Today the composer only clears the box when its text is still exactly what was sent (`Composer.tsx` clears with `cur === sent`). If they append during that wait — type “HALC steady X”, Post, then type “ plus more” — the box keeps “HALC steady X plus more”. Posting that leftover text sends the already-paid statement again, and the player is charged another $500 and another of the three daily slots.

After this card: the composer remembers the exact submitted text. On a successful ack it strips that sent prefix from the box, so “first” → “first more” while sending becomes “more”. If the player edited inside the text so the box no longer starts with what was sent, the box is left as typed. The composer never auto-resends. A leftover that is only whitespace becomes an empty box, not a stray space. On reject or failure the full box is kept, as today, so the player can edit and retry. A second click or Enter on Post while it already shows Posting… does not send a second post.

## Grounding

- `export/vision-review/complete/15-MULTIPLAYER-SOCIAL.md:946` (and `:893`): statements cost $500 and are limited to 3 per game day. A leftover sent prefix in the box would spend both again.
- `src/server/wire/playerStatements.ts:118–120` `sanitizeWireText` NFC-normalizes, collapses whitespace, and `trim()`s. `:363–364` `decidePostText` treats a trim-empty string as `TEXT_EMPTY`. The composer therefore trims leading whitespace of the remainder after a successful strip, and if the remainder is only whitespace the box ends up empty (`""`). This card does not change that server sanitizer, the fee, the daily cap, or the post intent.
- `docs/v1/REVIEW-LESSONS.md` entry 26: a reply must not wipe what the player typed after sending. The current tests keep a *replaced* draft (`"first"` → `"second"`) and still clear an *unchanged* one. They do not catch an append (`"first"` → `"first more"`), which today’s exact-match clear leaves intact — including the already-sent prefix.
- Composer fee copy is “Costs $500 · {n} left today” (`src/apps/wire/strings.ts`). Cash and remaining slots are already exposed on `/api/broker/me` (`cashCents`) and `/api/auth/me` (`remainingToday`).

## Plan

1. Composer remembers the exact submitted text. On ack it strips that sent prefix from the current box (“first” → “first more” while sending → “more”), trimming leading whitespace of the remainder. A whitespace-only remainder leaves the box empty. If the box no longer starts with the sent text (the user edited inside it), leave it as typed. Never auto-resend.
2. On reject or failure keep the full box, as today. No change to charge, daily-slot logic, server, or post intent. A second Post click or Enter while the button shows Posting… is ignored (one charge, one slot).
3. Tests first, then the fix. No auto-resend, no engine or API change.

## Scope

- `src/apps/wire/Composer.tsx` and the Wire composer tests named below. EN/FR copy, fee amounts, and `/api/wire` stay as they are.
- Do not edit `src/server`, `packages/engine`, or any other app.

## Acceptance / proof

- Fail-first unit in `tests/unit/wire/composer-draft-in-flight.test.tsx`: type “first”, Post, type “first more” while sending; after the ack the box shows “more”, and there is no second post and no auto-resend.
- Fail-first unit, edited-inside: type “first”, Post, change the box to something that does not start with “first”; after the ack the full box is left as typed, with no second post and no second charge.
- Fail-first unit: if the remainder after stripping is only whitespace, the box ends up empty (`""`), not a stray space.
- Fail-first unit: on reject or failure the full box is kept, including any text typed while it was sending.
- Fail-first no-flag e2e: type “HALC steady X”, Post, append “ plus more” during Posting…; a double-click or Enter on Post while it shows Posting… still sends exactly one post. After the ack the box shows the remainder; cash (`/api/broker/me` `cashCents`) and the daily slot (`/api/auth/me` `remainingToday` or the composer fee line) are charged exactly once.
- Official-flag e2e on fresh `.data`, plus production play at 1280 and 390 with screenshots and cash before/after under `/workspace/avalon/evidence/composer-strip-sent/` (play scripts live there, not in the worktree).
- Full checks on the exact final head. No push.
