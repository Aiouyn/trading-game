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
