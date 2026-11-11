# Card 10: standalone safe-area so phone chrome stays clear of the notch

Written 12 Nov 2026, 00:14 Europe/Paris (CET), before any implementation. This is the only file changed by the first commit. Timestamp taken from `date` on the box (Europe/Paris).

## Value and scope

Audit of the Leaderboard screen and the phone/PWA feel (manifest, standalone, safe-area insets, tap targets, installability) at phone 390 and desktop 1280, for a brand-new player's first 10 minutes.

The single biggest friction is not the board copy. A signed-out Boards view on phone and desktop already says "Sign in to see the Port Avalon net worth board" with a Sign-in control. The board fits at 390 with no horizontal overflow, and phone Sign in meets the 44 px coarse target. Those are fine to leave.

The friction is what happens when that player installs Quay and runs it standalone on a notched phone. The viewport meta is only `width=device-width, initial-scale=1` (src/app/layout.tsx, confirmed in the served document). There is no `viewport-fit=cover`, no `apple-mobile-web-app-status-bar-style`, and the 44 px `.statusbar` has no `env(safe-area-inset-top)`. `.edge-bar` already pads `env(safe-area-inset-bottom)`, and several app sheets do the same, but without `viewport-fit=cover` those env values stay 0 on iOS standalone, so the padding never appears. Audit measurements at 390×844: status bar at y=0 height 44, padding-top 0; edge bar at y=808 height 36, padding-bottom 0; the Home mark sits in the last 36 px of the screen. A 47 px notch overlay covers the Quay mark, the clock, and the compact net worth; a 34 px home-indicator overlay covers the edge-bar mark used to go Home. That is every phone screen in the first ten minutes, including Boards.

Desktop 1280 is unchanged by this (no phone chrome, no notch). Boards on desktop is a normal window with the same signed-out prompt.

Choose this fix only. Defer a PNG apple-touch-icon (PWA.md already records that iOS Safari may snapshot the page because it ignores the SVG manifest icon). Do not add an in-app install prompt (docs/v1/PWA.md: installing is the browser's own UI). Do not restyle the leaderboard, the guest landing, the Portfolio empty state, or the Wire-to-Broker hand-off (card 9). Do not touch Builder's goal/guide or Wire-story work, or anything in packages/engine, market ticks, claims, storms, or FX. Do not touch the Broker ticket's order-type or time-in-force controls (Stop, Stop limit, GTC) or their tests — another team is rebuilding those.

## Exact base, branch, and identity

- Branch `ui/pwa-safe-area`, worktree `/workspace/avalon/ui-pwa-safe-area`.
- Base `abf14e57f719689e1a94a65223c6f24ab71a6ae0`, the published `ui/broker-about-return` head. The live `ui-broker-about-return` worktree was not used; another worker was already committing on top of it. The change is chrome/viewport, so it should rebase cleanly onto a later card-8 fix. Not based on `110583b0` so the first-10-minutes audit sees the current UI stack.
- Verify Forge (trading-game bot) `<forge@trading-game.local>` as author and committer. Remove every `GIT_*` variable from manual npm-test and Git subprocesses. Before every commit inspect `log -3` and all new commits, and check for stray init or tracked.txt fixture changes. Never skip hooks.
- Local checkout only. No cloud, push, PR, deploy, or external handoff. Scratch integration merges are evidence only.

## Grounding and sketch

docs/v1/PWA.md already ships `/manifest.webmanifest` with `display: "standalone"` and a dark theme-color. 17 §3.19 asks for an installable shell. 17 §3.2.3 sizes the phone status bar at 44 px and the edge bar as the Home gesture; those 44 px targets have to remain fully tappable once the webview draws under the notch and the home indicator.

Two local shapes were compared:

1. Chosen: set `viewportFit: "cover"` on the existing Next viewport export (so the served meta becomes `viewport-fit=cover` and `env(safe-area-inset-*)` can be non-zero in standalone). Set `appleWebApp` metadata so iOS uses a black-translucent status bar on the dark shell, which is what makes the top inset real instead of an opaque system bar. Grow `.statusbar` by `env(safe-area-inset-top)` with matching padding-top, and honor left/right insets on that bar. Leave `.edge-bar`'s existing bottom inset in place so it starts working once cover is on. When insets are 0 (Playwright default, desktop, in-browser Safari), the status bar stays 44 px and existing phone e2e that assert that height keep passing.
2. Rejected: only adding `viewport-fit=cover` and hoping existing CSS is enough. That would fix the bottom only after cover is on, and would make the top worse: the 44 px bar would slide under the notch. Also rejected: a new install prompt, a new icon set, or a leaderboard rewrite, which are either forbidden or smaller than this chrome collision.

## Acceptance and proof plan

- The served viewport meta includes `viewport-fit=cover`. Theme-color and the existing standalone manifest stay as they are.
- The document advertises a black-translucent iOS web-app status bar. Quay still does not show its own install prompt or listen for `beforeinstallprompt`.
- `.statusbar` total height is `44px + env(safe-area-inset-top)`, with that inset as padding-top, so the 44×44 Quay mark, the clock, and the compact net worth sit below the system status area. Left and right insets are honored on that bar. `.edge-bar` keeps its existing bottom inset. App bar stays immediately under the status bar and does not need its own top inset.
- At zero insets, measured status bar height remains 44 px (S1-13 and the other phone chrome e2e stay valid). No horizontal overflow at 390. Desktop 1280 chrome and the Boards window are visually unchanged.
- Fail-first tests: a unit test that reads the viewport export / `layout.tsx` and `nav.css` and, on the current base, fails because `viewport-fit=cover` and the status-bar top inset are absent; then the same test passes. An e2e (or the same unit, if the served meta is awkward in unit) that the rendered viewport meta contains `viewport-fit=cover`. Do not weaken existing tests or broadly regenerate golden images.
- Evidence shots: phone 390 and desktop 1280, home and Boards, before and after. Phone "after" also includes a clearly labelled simulated 47 px / 34 px inset overlay or CSS stand-in, because Playwright does not fill `env(safe-area-inset-*)`. Paths under `/workspace/avalon/evidence/ui-pwa-safe-area/`.
- Freeze final HEAD before final proof. Run lint, typecheck, ordinary production build, check-hooks, ledger map-no-dup, and npm test with all `GIT_*` unset. Unchanged `/broker` route-budget ≤ 220,160 bytes; report the number.
- Clean e2e once in a scratch worktree with fresh `.data`, using `/workspace/avalon/evidence/tools/scratch-e2e.py`. Affected cohort: phone chrome (`tests/e2e/shell/phone.spec.ts` and related 17a phone tests as needed) plus PWA/manifest and M2-03 leaderboard. Existing Chromium in `~/.cache/ms-playwright` only; no apt or `--with-deps`. Ports 3300–3399 only, never 3199. Delete the scratch worktree afterwards.
- Do not edit Broker ticket order-type or time-in-force UI or tests. Do not edit engine or card-9 surfaces. Report SHA, exact base, UNIT-first, all checks, bytes, screenshots, and qualifications (local Node 24 vs CI 22; no real-device install). Do not push.

## Addendum 4 (Gatekeeper, after 814816a9 qualified): landscape sides, Recent bottom, theme status bar, Apple capable meta

Written 12 Nov 2026, 00:55 Europe/Paris (CET), before any fix. Timestamp taken from `date` on the box (Europe/Paris). This addendum is the only change in this commit.

Gatekeeper qualified 814816a9 (code PASS) with four reachable findings. Evidence: `/workspace/avalon/evidence/launchpad/gatekeeper/814816a9/` (`shots/insets/head-phone-land700-home-overlay.png`, `shots/insets/head-phone-390-recent-overlay.png`, `shots/insets/head-phone-390-broadsheet-sim.png`, REVIEW.md).

1. Landscape 700×390, 47 px left/right stand-in (width kept < 768 so phone chrome stays on): `.phone-home` (`nav.css`, previously 16 px padding) lets Sign in and the side tiles run under the insets; the sticky trade-bar *background* does too (the FAB already clears via its padding). Acceptance: add left/right `env(safe-area-inset-*)` to `.phone-home`, the app bodies (`.phone-appbody`, including the Wire `padding: 0` override), and make the trade-bar box itself clear the sides. Use `max(existing padding, env())` so zero-inset layouts stay pixel-identical. The trade-bar is inside the app body, so app-body side insets pull the bar's border box (not only the FAB) to `max(16px, env())`; the bar's current `max(0, env() - 16px)` side padding would then over-inset the FAB and must become 0 (already 0 at zero insets). Also honour left/right on `.bottom-row` and `.appbar` so the dock tiles and Back do not sit under a landscape notch; both use `max(existing, env())` and are unchanged at zero insets.

2. `'Nothing open yet.'` sits in the 34 px home-indicator zone because `.qs-bottom` (`notices.css`) has no bottom inset (`shots/insets/head-phone-390-recent-overlay.png`). Acceptance: `.qs-bottom` gets `padding-bottom: env(safe-area-inset-bottom)`. The Recent empty-state line then sits above the 34 px zone. `.br-phone-order .qs-body` already used `max(16px, env(bottom))`; once the parent sheet carries the inset, that bottom padding becomes `16px` only, so the ticket is not double-padded. At zero insets the sheet padding is 0 and the body stays 16 px.

3. `black-translucent` on Broadsheet (`tokens.css` `--chrome #E8E1D3`) gives white iOS status text at ~1.29:1. Acceptance: pick the status-bar style per theme — `default` (dark text) for light palettes, `black-translucent` (white text) for dark — using the existing `COLOR_SCHEME` map (only Broadsheet is light today). The palette is device-local in IndexedDB and applied client-side by `applyAppearance` after hydrate, so a blocking first-paint script cannot read it. Safe approach: the served document keeps `black-translucent` (the first-10-minutes default is Ink & Brass, dark); `applyAppearance` updates `apple-mobile-web-app-status-bar-style` when the palette is known and when it changes. A Broadsheet return visit may flash the default meta until that effect runs. The status bar keeps `env(safe-area-inset-top)` regardless of style: if iOS with `default` + `viewport-fit=cover` still extends under the system bar, the inset still pads; if the system bar is opaque and `env()` is 0, the bar stays 44 px and is not double-padded.

4. Next 16 emits `mobile-web-app-capable` from `appleWebApp.capable`, not `apple-mobile-web-app-capable`. Acceptance: the served HTML contains `apple-mobile-web-app-capable=yes` (verified in the document, not only in source). An explicit `<meta>` in the root layout, because the Metadata API will not emit the Apple-prefixed name.

Stand-in for e2e: Playwright's Chromium does not fill `env(safe-area-inset-*)`. Inset formulas also take `var(--sa-top/right/bottom/left, 0px)` so a test can set 47/34 (or landscape 47 sides) on `html` and exercise the same rules. Unset, the var is 0 and production / zero-inset behaviour is unchanged.

Zero-inset layouts must stay pixel-identical to 814816a9 at 390, 320 (text scale 2) and 1280, on a few shots. Fail-first unit and e2e for each finding, then the fix. Same check set, `/broker` ≤ 220,160 B, clean e2e at exact HEAD with fresh `.data`. No push, PR, or merge. Stay off the ticket's order-type and TIF controls, the engine, and the card 12 worktree.
