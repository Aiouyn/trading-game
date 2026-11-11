# Card 7: first-fill receipt and position P&L

Written before implementation. This is the only file changed by the first commit.

## Value and scope

Choose candidate (d). The first successful purchase already says Bought, price, and fee, but gives no immediate answer to "what do I own now and am I up or down?" Keep that receipt and add the current position quantity and explicitly unrealized P&L from the same authoritative me snapshot. Explain that this value changes with prices, and name the existing Portfolio > Positions destination. Show no invented zero, forecast, realized profit, goal completion, or celebratory milestone.

Bundle candidate (a) only after a failing-before reproduction: make the phone Portfolio's DOM own its initial focus after its lazy mount/remount instead of leaving BODY focused. This is a navigation accessibility repair, not a new app flow. Preserve focus already deliberately inside the new app. Prove Card2's second-Enter path on the merged UI stack.

Defer (b), scroll continuity, because it is a separate navigation contract and Card6's About framing is already explicit. Defer (c), goal progress while trading, to avoid Builder's goal/guide lane. Do not edit GoalGuide, GoalSlot, goal strings or model, Wire stories, engine, server, market, economy, shared contracts, dependencies, route-budget scripts, limits, or helpers.

## Exact base, branch, and identity

- Branch ui/broker-fill-feedback, worktree /workspace/avalon/ui-broker-fill-feedback.
- Base 1f263883407623e21f27bbd26653dd632e27fcad on ui/broker-trade-sheet. This is a stacked UNMERGED UI branch through Card6, final Card5 bfe320dd, original split 009f50bf, and 110583b0. It does not contain Cards1–4 or main's 11540036 preflight fix.
- Use the broker stack rather than 110583b0 because the new feedback must fit and retain focus in Card6's one phone ticket sheet. Do not rebuild the superseded inline phone ticket or duplicate order logic.
- Verify Forge (trading-game bot) <forge@trading-game.local> as author and committer. Remove every GIT_* variable from manual npm-test and Git subprocesses. Before every commit inspect log -3 and all new commits, and check for stray init or tracked.txt fixture changes. Never skip hooks.
- Local checkout only. No cloud, push, PR, deploy, or external handoff. Scratch integration merges are evidence only.

## Grounding and sketch

BrokerFrame alone owns draft, review, pending intent, and acknowledgement. TicketReview's AckPanel displays IntentResult and MyFill from me. Position.upl and qty are already server strings. Formatting may reuse MoneyText and decText; do not calculate P&L or add a subscription. The same accepted-fill presentation runs inside the desktop ticket or the single PhoneTradeSheet. Rejected, resting, queued, submitting, and missing-position states must not claim a filled holding or show a made-up P&L.

PhoneHome keeps an app bar while AppBody lazily mounts PortfolioFrame. Account changes and route navigation can remount app bodies. A caller's timer that focuses a soon-to-be-removed node does not own the final mounted destination. If reproduced, focus restoration belongs to the destination Portfolio root's mount, not another timer, MutationObserver, global selector, or polling loop.

Two local design candidates were compared. Task/arena tools are not exposed, so no independent-runner review is claimed.

1. Chosen: extend the existing receipt with server-backed position context. Put the changing position value outside the receipt's polite live region, so every quote does not re-announce the purchase. Keep the existing New order action and all order handlers. Phone Portfolio may recover lost BODY focus on mount at its own focusable root, without stealing an already intentional focus.
2. Rejected: a global first-trade toast or new completion state and portfolio shortcut protocol. That duplicates Builder's milestone ownership, adds persistence and dismiss policy, and risks a second navigation or submission path. Reusing the full Positions component inside the ticket would also add subscriptions, CSS and unrelated rows.

Rubric: authoritative figures only; immediate post-fill clarity; no duplicate order/goal ownership; correct modal and destination focus; EN/FR at 320/390px and 200% text; small counted /broker delta. The chosen shape has one source of order state and no parallel first-fill storage.

## Acceptance and proof plan

- Keep Bought/Sold quantity, execution price and fee unchanged. Only an acknowledged ACCEPTED fill gets the new holding context. Read its asset's quantity and upl from the same me body; do not treat an absent row as zero or realized P&L. Label stale values as last known. Reject, queued/resting, pending and missing-position cases get no misleading valuation.
- Put only the stable receipt in role=status. Keep updating position figures outside that live region. Preserve the existing sheet's focus trap, Escape/backdrop/Close, Trade focus return, safe-area and strict 44px controls.
- Normal pre-fill Broker desktop must remain visually unchanged. Post-fill desktop changes are intentional feedback. Phone sheet receipt and FR200% at320/390 must wrap without horizontal overflow, with Close and New order reachable.
- Add focused unit red/green proof for receipt values and missing/rejected/queued states. Reproduce and regression-test (a) before shipping its fix. Do not weaken existing tests or broadly regenerate golden images.
- Freeze final HEAD before final proof. Run lint, typecheck, ordinary production build, check-hooks, ledger map-no-dup, npm test with all GIT_* unset, and unchanged /broker route-budget <=220160 bytes.
- Measure ordinary-production /broker on exact base 1f263883 and final Card7, and on a scratch merge of approved Cards1–7. Record exact commits, build IDs, counted asset hashes and two page probes per build. This is bundle size, not a runtime speed claim.
- Preserve Card5's all-built-apps-lazy app-modules.test.tsx contract. Merge Cards1–4 around the Card6 base with the documented ticket-column union, then Card7 last. Keep Card1 compact-desktop shortcut; phone uses Trade. Preserve Card2 Portfolio focusability when resolving any root-ref conflict. Record the merge order and union in evidence.
- Clean e2e: fresh worktree/install and initially absent .data, real signed-in phone open -> quantity -> review -> Place -> receipt/P&L -> Portfolio position/fill. Also cover desktop, no order before Place or on New order, chunk-abort retry, account second Enter in the integrated stack, and existing affected Broker/Portfolio cohorts.
- Capture phone and desktop screenshots, post-fill P&L and FR200% views. Use only ports3300–3399, never3302/3199/3102. Existing Chromium only; no apt or --with-deps.
- Write progress and raw failures under /workspace/avalon/evidence/ui-broker-fill-feedback after each phase. Keep primary worktree and evidence. Remove only owned scratch dirs, stop owned previews, and verify clean final HEAD and Forge identities. Report SHA, exact base/UNIT first, all checks, bytes, screenshots, integration and qualifications. Do not push. Local Node24 versus CI22 and independent Gatekeeper remain qualifications.
