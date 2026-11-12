# Card 25: signed-in phone Home shows today's change and progress to $20,000

Written 12 Nov 2026, 06:31 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

A signed-in player on phone Home sees their saved net worth, but the today slot is replaced by “Your trades, cash and positions are saved on the server.” (`S.demoTradingNote`), and `next = signedIn ? null` hides the rank progress bar. The guest Home already shows today's change, a sparkline, and “Next: {rank} · {nw} / {target}”. V1 M2-02 is “grow $10k” with a visible NW target; 17 §3.2.3 says the phone Home widget is NET WORTH, today's change, sparkline, and the rank progress bar (“Next: Mogul · $412.9k / $5M”). For a new signed-in account that target is Hustler at $20,000 (RANK_THRESHOLDS[0], starter rank R0).

Player outcome: after signing in, phone Home shows today's change (and percent) from the live `me` channel, and the next-rank bar toward $20,000, using the same presentation as the guest widget. The saved-account note can stay as muted context under the hero; it must not occupy the today slot.

Front-end only. Do not change `/api/auth/me`, rank thresholds, or `me.todayChg` / `me.todayPct` sources. Do not invent a sparkline series: the existing Sparkline stub is a flat dashed no-data line (`17-UX` :441); it may be shown honestly, never with made-up points.

## Exact base, branch, and identity

- Branch `ui/signed-in-home-today`, worktree `/workspace/avalon/ui-signed-in-home-today`.
- Base `origin/main` `98939480a24654f729a260de4c3ad0b9f5693f9a` (fetched this turn). The brief named `d2875ef3`; main has since taken PR111 (card 19) and PR113. Phone Home's signed-in widget already lives on this tip. PR105 (`f62bc63b`) adds a later first-trade guide on the same file and is not needed for this behaviour.
- Verify Forge (trading-game bot) `<forge@trading-game.local>` as author and committer. Unset every `GIT_*` variable for npm-test and Git. No push.

## Grounding and sketch

`isSignedIn` is true only for `auth.status === "signed_in"`. The today row and `next` are branched on that flag, so a signed-in player loses the live change and the $20k bar. `applySignedInDemo` already seeds starter rank R0 and `todayChg` / `todayPct` (then the server `me` channel updates them).

1. Chosen: when `signed_in`, render today's change the same way as the guest row (`MoneyText` + `PctText` from `me.todayChg` / `me.todayPct`), and compute `next` with `nextRankTarget(rank)` for signed-in too. Keep the starter / saved-account copy out of the today slot.
2. Rejected: inventing sparkline points. Rejected: pulling card 23's unknown-session skeleton into this card — different behaviour, already queued. This card only adds signed-in rows inside the `signed_in` branch, so they do not appear while `auth.status === "loading"`.
3. Auth-loading check (REVIEW-LESSONS 19): hold `/api/auth/me` and assert first paint has no account handle, no signed-in today-from-starter, and no “Next: Hustler” bar. Guest today/rank may still flash until card 23; that is out of scope here and must not regress further.

## Acceptance and proof plan

- Fail-first unit: a signed-in PhoneHome (starter channels, known `todayChg` / `todayPct`, rank R0) shows those exact today figures in `data-testid=today`, and `rank-next` names Hustler with the live NW and $20,000. The today slot is not only `demoTradingNote`. The same test fails on this base.
- Guest end state unchanged: canned today change and “Next: Owner / Mogul” still match existing `phone.spec` cases.
- Loading: hold `/api/auth/me`; first paint has no `account-chip-home` and no Hustler rank-next from a signed-in session.
- Play-through: production build, desktop 1280 and phone 390, signed-in Home screenshots. Official checks with `GIT_*` unset. Affected e2e in a clean scratch worktree with fresh `.data`. Evidence under `/workspace/avalon/evidence/signed-in-home-today/`. No push.
