# Tape: Why-it-moved ladder + Research Desk hunts

**Owner:** Tape. **Status:** v1, 2026-10-09. Specs only until Quant ships `explainTrade` / `explainMove` and Forge ships the surfaces.
**Reads:** ROADMAP "APPROVED 2026-10-09: Why it moved ladder + Research Desk", `velvet-research-desk.md`, `velvet-trade-journal-replay.md`, Forge `forge-research-desk.md` (when written), Quant API when written.
**Harness:** unit/harness against the engine (no UI), then e2e with `?intro=off` and `?e2e` hooks. A band for a system that isn't built is never shown as PASS.

**Privacy rule:** every bot here is test code. Tests may read engine state directly. Nothing here implies a public view of anyone's book. Flow is pool types only; nobody is named.

---

## Surfaces under test

| Step | API | UI |
|---|---|---|
| Free one-liner | `explainTrade(state, tradeId)` | journal row + trade detail sentence |
| Hired analyst | `explainTrade` full parts (+ Senior: headlines, flow) | trade-detail waterfall |
| Research Desk (R3+) | `explainMove(state, assetId, fromDay, toDay)` | desk dossier |

Costs and unlock flow are Forge's (salary week-ahead, no refund, held ad/comeback cash blocked, desk upkeep per save). Tape checks the money sinks don't leak privilege; see § Money.

---

## 1. No future / closed days only

| Hunt id | Check | Band | How |
|---|---|---|---|
| `explain_move_rejects_open_day` | `explainMove` with `toDay` = current open session day, or any day after last closed day | throws / returns error; never a partial dossier | unit, 20 seeds |
| `explain_move_rejects_future_from` | `fromDay` > last closed day | rejected | unit |
| `explain_move_clamps_window` | window that starts before listing or ends after last closed | returned window starts at listing / ends at last closed; no bar past last close | unit + e2e |
| `desk_picker_blocks_today` | e2e: set `desk-to` to today and to lastClosed+1 | both refused; today shows "Session open" | e2e |
| `desk_chart_no_future_axis` | chart strip has no candle / axis room past last closed day | 0 future bars | e2e screenshot + DOM |
| `explain_trade_closed_only` | `explainTrade` on an open (unrealized) position / in-progress fill | not offered / rejected | unit |
| `no_forecast_copy` | memo templates + desk/journal strings | 0 hits on banned words: will, expect, likely, next, target, signal, buy/sell-as-advice, opportunity, undervalued, should | grep + e2e text scan |
| `memo_past_tense` | every memo sentence | past tense only | unit on templates |

---

## 2. No names / pool-type flow only

| Hunt id | Check | Band | How |
|---|---|---|---|
| `flow_pool_types_only` | `explainMove` / Senior `explainTrade` flow rows | keys ⊆ {value, trend, retail, pension, mm, you?, players?} — never a rival id, account id, or player handle | unit |
| `npc_funds_folded` | Hale & Ward / Pinn / Vetch flow | inside value / trend pools; never their own named row | unit with rivals on |
| `dom_no_trader_names` | desk + analyst waterfall DOM | 0 matches against rival display names and the save's account ids | e2e |
| `solo_you_row` | solo player traded the asset in the window | exactly one `You` row; never a `Players` row | unit + e2e |
| `online_players_threshold` | synthetic window with K accounts trading asset A | `Players` row only when K ≥ 5 **and** no single account > 40% of that day's player bucket; else folded into Retail | unit |
| `day_level_fold_before_sum` | Forge/Quant rule: threshold applied **per closed day**, failing days folded to Retail **before** window sum | PASS | unit |

### 2a. Adjacent-window subtract (Forge's hole)

**Attack:** take `explainMove(A, d1, d4)` and `explainMove(A, d1, d5)` and subtract. If day 5 had only one account's flow in "Players", the difference isolates that account.

| Hunt id | Check | Band | How |
|---|---|---|---|
| `window_diff_no_isolate` | for every adjacent closed pair `(from, to)` and `(from, to+1)` on 20 seeds × several assets, build day-diff of the Players bucket | the implied day never attributes Players flow that would isolate < 5 accounts or any account > 40% of that day's player bucket | harness |
| `window_diff_no_names` | same diffs | never introduce a named id | harness |

Synthetic fixture: craft days where day 1–4 pass the threshold (5+ accounts, max ≤ 40%) and day 5 fails (1 account). After day-level fold, both windows' Players rows (and their difference) must show day 5 folded into Retail.

---

## 3. Cause-vector fidelity

| Hunt id | Check | Band | How |
|---|---|---|---|
| `explain_trade_parts_sum` | market + sector + news + residual + fees/slippage | = realized P&L within $0.01 | 500 seeded round-trips / 20 seeds (extends tape-acceptance §7) |
| `explain_move_parts_sum` | waterfall parts | = move within 0.01 percentage point; UI shows Quant's total, never its own sum | unit + e2e |
| `test_shock_labeled` | window containing `shockPrice` / `shockValue` | row "Test shock"; memo says so; no invented story | unit |
| `event_window_no_end_leak` | window inside an active world event | no event length / endTick / give-back point | unit + e2e (ties to ecology hunts) |
| `ui_no_own_arithmetic` | Forge desk / journal | displayed total === API total byte-for-byte in the rendered string | e2e |

---

## 4. Money / unlock (Forge surface, Tape checks)

| Hunt id | Check | Band | How |
|---|---|---|---|
| `analyst_week_ahead_no_refund` | hire then fire inside the paid week | 0 refund; confirm copy says so | e2e |
| `analyst_unpaid_leaves` | cash < salary at week close | analyst gone; one Wire note; no debt | e2e |
| `restricted_cash_blocks_hire` | only `AD_GRANT` / `FRESH_START` cash available | hire / desk upkeep rejected | e2e + unit |
| `desk_below_r3_absent` | rank < R3 | no desk query UI in DOM | e2e |
| `desk_rank_loss_keeps_files` | had R3, bought reports, then lose rank | new queries locked; Files still readable | e2e |
| `desk_upkeep_miss` | can't cover desk upkeep | locks like rank loss; Files stay; one Wire note | e2e |

---

## 5. Visual proof (Velvet sign-off)

Desktop 1440×900 and phone 390×844, `?intro=off`:

1. Hire card (Junior / Senior).
2. Trade detail with Senior analyst (waterfall + flow + headline).
3. Research Desk dossier (memo, waterfall, flow, "Nobody is named.").
4. Desk locked (below R3 or after rank loss).

Proof path: `/workspace/trading-game/proof/research-desk/` (box) then PC when landed.

---

## FAIL conditions (summary)

- Any open-day or future tick in an explanation.
- Any named player, account, or NPC fund on a flow row or in the DOM.
- Adjacent-window subtract isolates < 5 accounts or a >40% account in Players.
- Waterfall / trade parts that don't sum to the API total within tolerance.
- Forecast / advice language in memo or desk copy.
- Restricted cash paying salary or upkeep.
- Desk query UI below R3.

**Not Tape's call:** analyst / desk prices (Quant vs R3 income curve), Junior vs Senior feature split (Velvet/Ledger). Tape only checks the guards above.

---

## Status (Phase 3 gates, branch p3/c1)

Each applies-now hunt has a test named with its id. Where a spec row and the engine differ, the ruling is noted here.

| Hunt | Where | Status |
|---|---|---|
| explain_move_rejects_open_day, explain_move_rejects_future_from | src/engine/research-desk.hunts.test.ts (20 seeds) | PASS |
| explain_move_clamps_window | engine lower bound: same file. Upper bound: the desk picker clamps (D-12), src/world/research-desk.hunts.test.ts. Row [29] says the engine clamps the end; the engine rejects it (D-12), so the spec row is read as the picker's clamp | PASS (ruling) |
| desk_picker_blocks_today | tests/e2e/research-desk-hunts.spec.ts | PASS |
| desk_chart_no_future_axis | src/world/research-desk.hunts.test.ts (its own test name: 5 seeds, closed-day windows and open-day windows, no bar on or after the open day) | PASS (no DOM screenshot taken) |
| explain_trade_closed_only | src/world/research-desk.hunts.test.ts | PASS |
| no_forecast_copy | src/world/research-desk.hunts.test.ts, every desk, journal, research, dayclose, work and lesson key in en and fr. buy and sell are the order form's words and lesson instructions, so they are not banned words. The advice built on them is banned by ADVICE_PATTERNS_EN / _FR (src/world/text/banned.ts), checked on every key | PASS (ruling) |
| memo_past_tense | src/world/research-desk.hunts.test.ts: the memo sentences, the journal lines, and a sweep of every French desk memo, journal line and dayclose key (fr: "vient" changed to "est venu"; "vous devancez" changed to "vous avez devancé") | PASS |
| flow_pool_types_only | src/engine and src/world hunt files. Pool key is `maker` in the engine (not `mm`) | PASS (key name amended) |
| npc_funds_folded, solo_you_row, online_players_threshold, day_level_fold_before_sum | src/engine/research-desk.hunts.test.ts (24 personas, rivals on) | PASS |
| dom_no_trader_names | tests/e2e/research-desk-hunts.spec.ts (desk and analyst DOM) | PASS |
| window_diff_no_isolate, window_diff_no_names | src/engine/research-desk.hunts.test.ts (20 seeds, depth subtraction included) | PASS |
| explain_trade_parts_sum (500 round trips, 20 seeds) | src/world/research-desk.hunts.test.ts (real trips through the ledger) | PASS |
| explain_move_parts_sum | src/engine/research-desk.hunts.test.ts and the dossier rows in src/world/research-desk.hunts.test.ts | PASS |
| test_shock_labeled | src/engine/research-desk.hunts.test.ts (shockPrice and shockValue print the Test shock row; the memo names it) | PASS |
| event_window_no_end_leak | src/engine/research-desk.hunts.test.ts (key set, no duration or end field) | PASS |
| ui_no_own_arithmetic | tests/e2e/research-desk-hunts.spec.ts (desk total equals the API total, string for string) | PASS |
| analyst_week_ahead_no_refund | src/world/research-desk.hunts.test.ts; the confirm copy is checked in tests/e2e/learning.spec.ts | PASS |
| analyst_unpaid_leaves | src/world/research-desk.hunts.test.ts. E2E not run: the e2e world has no route that drains spendable cash | PASS (unit) |
| restricted_cash_blocks_hire | src/world/research-desk.hunts.test.ts. E2E not run: no route holds ad or fresh-start cash | PASS (unit) |
| desk_below_r3_absent | tests/e2e/research-desk-hunts.spec.ts (no query control in the DOM) | PASS |
| desk_upkeep_miss | src/world/research-desk.hunts.test.ts (locks, files readable, one note). E2E not run, as above | PASS (unit) |
| desk_rank_loss_keeps_files | D-13: the rank never drops, so there is no rank-loss lock. Recorded as it.skip with the reason in src/world/research-desk.hunts.test.ts | N/A (D-13) |
| fold_solve (R1, stronger attacker) | src/engine/fold-lsq.test.ts; blur 2 ADV (ecology.foldBlur); measured in docs/V1-PRIVACY.md section 7. Corr 0.02 to 0.42 at 0.05 to 1 ADV. The attacker is not yet complete (no nested explain parts, Wire or short interest) | PASS for this attacker, attacker incomplete |
| L3, L4 | tests/e2e/no-leak.spec.ts (every frame type and a private-key list; an nw-history reply's `ghosts` is the requester's own series and is exempt) | PASS, desktop and phone |
| L1, L2, L5 | tests/e2e/no-leak.spec.ts (desktop; the phone project skips them with a written reason, the same storage, network and export code) | PASS, desktop |
| L6 | no tournament or autopsy code in src (skipped with that reason in the spec) | N/A |
