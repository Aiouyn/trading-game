# Card 8 — phone: Back to trade keeps your place (ui/broker-about-return)

## Re-audit (fresh accounts, 7-card stack 11afab00, phone 390x844 + desktop 1440x900; evidence `ui-card8/audit/`)
- Phone Trade -> About -> Back to trade: scrolled to the bottom of Trade (scrollTop 219 = max: open orders, Trade bar), opened About, pressed Back. Trade came back at scrollTop 0 with focus on the asset select at the top: the player lands on the chart again and must re-find the order list / Trade bar they were looking at. Happens on every About visit, the most frequent phone navigation in the first minutes (learn what HALC is, then buy).
- Leaderboard (phone and desktop): already says "Your rank: 1 of N", "Find my row", marks "You", and explains "Net worth = cash + holdings at the server price". Clear enough; no change.
- PWA: manifest is standalone with name/short_name/theme and one SVG "any" icon. Install polish lives in the M2-05 PWA lane; not this card.
- Nothing new looked worse than the scroll loss.
Pick: candidate (b).

## Base
Stack on ec95012f (Card 7 head, on Card 6 6f58c342), not 110583b0: the phone Trade view that must be restored only exists in this shape on the Card 6 stack (no inline phone ticket, sticky Trade bar that changes the scroll extent, the About framing golden Card 6 updated). Built on 110583b0 the scroll positions, goldens and the back path would differ and need re-doing at merge.

## Behaviour
Phone/narrow only; desktop Trade|About (BR-10-02: back focuses the ticker) unchanged.
- On leaving Trade for About, remember the phone app scroller's scrollTop.
- On Back to trade, restore it once the Trade view is rendered (clamped to the current scroll range).
- Focus keeps the existing contract when it can be seen: the asset select is focused (preventScroll) if it is visible in the restored viewport (true whenever the player had not scrolled, so BR-10-11 is unchanged). Otherwise focus goes, without scrolling, to the control that opened About (the About tab of the Trade|About switch), scrolled only to "nearest" if needed, so focus is never left off-screen and the place is kept. No focus stealing on asset change or ticks; nothing places an order.
- A new asset selection or a fresh mount starts at the top as today (no stale offset reused across assets).

## Acceptance and evidence
- Unit (happy-dom, red before): remembered offset restored after About -> Back; select focused when visible, About tab otherwise; desktop path unchanged.
- E2E phone (fresh .data, EN 390 and FR 320 at 200%): scroll to Open orders, About, Back -> scrollTop equals the saved one (±1 px), Open orders heading still in view, focused element visible inside the viewport and above the Trade bar, 44px targets, no overflow, axe; unscrolled case keeps asset-select focus; desktop BR-10-02 unchanged.
- Exact-HEAD: lint, typecheck, build, check-hooks, route-budget /broker (own and 8-card merged stack <= 215 KB), map-no-dup, npm test (GIT_* unset), clean fresh-.data e2e of the Broker phone/desktop cohort, phone+desktop screenshots, scratch deleted, no push.
