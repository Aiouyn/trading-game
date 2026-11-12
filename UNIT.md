# Card 29 — Signed-in Home hero says Net worth, not “Demo balance”

**When:** 12 Nov 2026, 06:55 Europe/Paris (CET)
**Branch:** `ui/signed-in-hero-copy`
**Base:** `origin/main` `1fd4a6d9cc27a61dfd28ddc6288bf1ecd6ea6f3e` (PR114 after PR111/113)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (copy). Not opening a PR. No push this pass.

## Player outcome

A signed-in player looking at Home sees the same “Net worth” hero the spec describes, not “Demo balance” and not “Starter account: $10,000 (demo placeholder, not a live balance).” Their cash and positions are already described in Account as saved on the server. The main screen should not contradict that, and it should not look like a throwaway demo.

## Grounding

- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:257` — Home widget: “NET WORTH label + rank chip, serif 44 px NW, today’s change, sparkline, rank progress bar.” The label is Net worth. There is no “Demo balance” line and no $10k “not a live balance” disclaimer on this widget.
- Same file :240 — desktop status strip: net worth (mono) with today’s %. Not a “Demo balance” tag.
- Settings › Account already says “Account, cash, and position quantities are saved on the server.” (`src/apps/settings/strings.ts` `accountDisclaimer`; tests in `m1-01-account.test.tsx`). The hero copy is stale relative to that.
- `docs/v1/M1-01-AUTH.md:15` still says mock trading is not a server save and “Account may show starter cash placeholder only.” That note is about Account, and Account has already moved on. It is not a license to label the Home hero a fake balance.
- `docs/v1/REVIEW-LESSONS.md` entry 19: while `/api/auth/me` is held, `isSignedIn()` is false. First paint must not flash “Demo balance” or the $10k disclaimer, and must not invent a signed-in number. Guest chrome (Net worth) is the honest unknown-session path.

## Scope (tiny copy)

- Phone Home widget: the label is `S.netWorth` for signed-in and guest. Remove `phone-demo-disclaimer` (`S.starterPlaceholder`) from the signed-in hero.
- Desktop status strip: drop the signed-in “Demo balance” tag (`strip-demo-tag`). Show today’s % next to NW, as the spec and the guest strip already do.
- Do not retouch the signed-in today slot or the $20k rank bar — that is card 25 (`ui/signed-in-home-today`).
- Do not rewrite Account or M1-01-AUTH.md in this card.

## Acceptance / proof

- Fail-first unit: a signed-in Phone Home / StatusStrip still says “Demo balance” and the starter disclaimer before the fix; after the fix the hero label is “Net worth”, `phone-demo-disclaimer` is absent, and `strip-demo-tag` is absent. The $10,000 starter amount may still appear as the NW figure; it is not captioned as a demo placeholder.
- Auth / first paint: hold `/api/auth/me` — first paint has no “Demo balance”, no “not a live balance” / starter placeholder, and no account handle. After the session resolves signed-in, still no those phrases on the hero or strip.
- Official-flag e2e on fresh `.data` (register a handle) plus production play at 1280 and 390 with screenshots.
- Lint, typecheck, build, check-hooks, unit, ledger-no-dup, route-budget, e2e. No push.
