# Tape acceptance and e2e plans

**Owner:** Tape. **Status:** v1, 2026-10-09. What Tape runs before posting PASS on each Forge or Quant item, M01–M20 (`vision/ROADMAP.md`).
Conventions (URLs, hooks, waits, proof paths, `assertNoLeak`) are in `specs/tape-e2e-conventions.md`. Testids marked ✓ exist in Forge's box build (`/workspace/tg`); testids marked *(proposed)* are names Tape asks Forge to use, and Forge can rename them before building.

**Every section's PASS also needs** typecheck, lint, Vitest, build and the full e2e suite to be green on both projects, zero console errors, and proof screenshots at 1440 and 390 in `test-results/proof/`.

**Privacy rule (Mathis, 2026-10-09):** nothing automatically leaks a player's strategy, style or holdings. Reveals are opt-in, earned through espionage, or a legal filing. That applies to every section below and is checked in §12.

---

## 1. M01 · Land the queued work on the PC

**Preconditions:** PC online. Quant's news-reaction fix lands first, then Forge's Portfolio batch. Then Tape runs once.
**Steps (one batch, in this order):** `npm run typecheck` → `lint` → `test` → `build` → `e2e` (desktop + phone) → `sim` → `balance` at 20 seeds → `balance` at 60 seeds.
**PASS:**
- All green. Old saves load and price identically (the save fixture from `c2598bc` opens with the same NW to the cent).
- Quant's box numbers reproduce on the PC within ±0.05 on every share metric: BH beats momentum 0.767, contrarian 0.783, random 0.617; the highest share where any strategy beats BH is 0.383 (gate `max_strategy_beats_bh_share ≤ 0.7`).
- Portfolio proof: signed drawdown, the brass NW line with the $5k Start line, at both sizes.
**FAIL:** any red step, or any share metric more than 0.05 off. One PASS/FAIL post to Ledger with the commit hashes.

## 2. M02 · Test-only engine hook + e2e hooks

**Preconditions:** Quant's `shockPrice` exported from `src/engine` and marked test-only in ENGINE.md. Forge's `__tg.e2e` behind `?e2e`.
**Unit (Vitest, Quant's file, Tape reviews):**
- `shockPrice(w, id, pct)` changes only `assets[id].lnP`. Value, `h`, regime and every RNG stream are unchanged. Over the next 1,000 ticks every **other** asset is bit-identical to an unshocked copy.
- Throws on an unknown id and on `pct ≤ −1`. Never pushes a price below the asset floor.
- *Note for Ledger:* ROADMAP M02 says "changes only that asset's price and value". The code moves price only and leaves value alone so the pull fades the move. Tape tests the code's behavior; Ledger should fix the wording.
**e2e (`hooks.spec.ts`):**
| # | Steps | Assert |
|---|---|---|
| H1 | `/?seed=tape-h1&fresh&intro=off` (no `e2e`) | `window.__tg` defined, `window.__tg.e2e === undefined`. Same on a **production build** (the suite always runs `next build` + `next start`) |
| H2 | `/?seed=tape-h2&fresh&intro=off&e2e`, `grantCash(15000)`, `advance(1)` | `net-worth` rises by exactly 15,000 (±$1 display). `__tg.state().world.accounts[PLAYER].peakEquity` ≥ old NW + 15,000 |
| H3 | `shock('HLCN', -0.015)` | `quote(HLCN)` mid is old × 0.985 within 1e-9 relative. Every other `chart-price`/watch price unchanged on the same tick |
| H4 | After H2, wait 1.5 s, `goto('/')` | The game loads **without** the granted cash (session tainted → no save). The save in IndexedDB is the pre-hook one or none |
| H5 | `/?seed=tape-h5&fresh&intro=off&e2e`, only `__tg.e2e.idle()` | `idle()` doesn't taint (it changes no world state). Reload keeps the save. If Forge chooses to taint on `idle()` too, update this row, not the code |
| H6 | Hooks never write a save | Spy `IDBObjectStore.prototype.put` after any `grantCash`/`shock`: zero calls for the rest of the session |
**PASS:** H1–H6 green on both projects, plus the unit test.

## 3. M05 · Onboarding, rank-up and the R0 shell (DESIGN v1.2 §6b–6d)

**URL:** `/?seed=tape-ob-<n>&fresh` with **no** `intro=off`; add `&e2e` only for O5 and O7. Every other spec in the suite uses `&intro=off`.
**Testids ✓:** `onboarding-coldopen`, `onboarding-start`, `onboarding-skip`, `first-news`, `first-news-look`, `simple-ticket`, `honest-note`, `intro-receipt`, `stop-explainer`, `stop-preset`, `stop-later`, `goals-card`, `goal-<id>`, `rankup-overlay` (`data-rank`), `rankup-card`, `rankup-continue`, `rankup-skip`, `shell-crack`, `replay-intro`, `rank-chip`, `order-pending`, `order-submit`.

| # | Flow | Steps | PASS |
|---|---|---|---|
| O1 | Cold open | load, wait ready | `onboarding-coldopen` visible, clock paused (`__tg.state().paused`), `shell-crack` visible, no market ticks while it shows (`advance` not called; tick unchanged after 3 s) |
| O2 | First news | `onboarding-start`, `advance(720)` (one game day) | `first-news` shows a **real engine headline**: its asset id and sign match a `wire(state)` item or the largest stock day move. `first-news-look` selects that asset (`chart-ticker` = id) |
| O3 | Simple ticket + honest note | open the ticket | `simple-ticket` and `honest-note` visible; no Limit/Stop tabs; the honest note's text equals `intro.ticket.honest`; 20% first-trade cap still applies (`first-trade-cap`, total ≤ $1,000) |
| O4 | Receipt | buy, `advance(3)` | `intro-receipt` shows asset, qty, price, fee matching the fill in `__tg.state()` to the cent; it collapses after ~4 s; Limit/Stop tabs appear with the one-time dot |
| O5 | Stop-loss explainer via shock | (`&e2e`) after O4, `shock(<asset>, -0.015)`, `advance(1)` | `stop-explainer` under that position. `stop-preset` reads avgCost × 0.95 rounded to 2 dp (4 under $1). Clicking it **pre-fills** a Stop sell for the whole position and focuses the ticket: **no new order exists** (`open-order` count and `__tg.state().world.orders` unchanged) until `order-submit`. Shown once: a second dip doesn't show it again. `stop-later` dismisses for good |
| O5′ | Profitable close instead | buy, advance until in profit, sell (no hook) | "First profitable trade" `intro-receipt` with realized P&L equal to the engine's to the cent; the stop explainer never shows if the position closed before dipping |
| O6 | Goals | after O4, or `advance` 2 game hours with no trade | `goals-card` with `goal-nw20k`, `goal-profit`, `goal-hold3`; buying 3 assets ticks `goal-hold3` and it stays done after selling one |
| O7 | Hustler (§6c) | (`&e2e`) `grantCash(15500)`, `advance(1)`, `idle()` | `rankup-overlay[data-rank=R1]` appears. **Blocked** while a market order is pending (`order-pending` visible) and while the trade sheet is open, even after `idle()`; appears once both clear. `rankup-skip` disabled for the first 1 s, enabled after. Three `rankup-card`s. `rankup-continue` ("Keep going") closes it. After: `rank-chip` reads R1, `shell-crack` gone for good, a "You reached Hustler" Wire item, `goal-nw20k` replaced by `goal-nw250k` |
| O7′ | No idle, no ceremony | same as O7 but keep sending input every 2 s for 15 s | no overlay |
| O8 | Reduced motion | O7 with `page.emulateMedia({ reducedMotion: 'reduce' })` | same content as a static card; no sheen element visible |
| O9 | "I've played before" | `onboarding-skip` | no `first-news`, no `simple-ticket`/`honest-note`, no stop explainer, **20% cap still on** |
| O10 | Saved once, replayable | play O1–O4 (no hooks), reload `/` | nothing replays; More → `replay-intro` replays the cold open and first news on the current game; facts (first fill) are kept |
| O11 | Old save migration | load the `c2598bc` save fixture | `migratedOnboarding`: no cold open, no prompts, ranks already reached are marked seen (no ceremony on load) |

**Proof:** `<project>-ob-coldopen`, `-ob-first-news`, `-ob-ticket`, `-ob-receipt`, `-ob-stop`, `-ob-goals`, `-ob-rankup`, `-ob-after-rankup`. Velvet signs these off.
**Note:** Hustler by trading alone isn't reachable in Phase 0 (ROADMAP Q2), so O7 is the ceremony's only coverage until businesses land.

## 4. M06 · Phase 0 exit gate: the 10-minute fun check

**Scripted part (Tape, `fun-check.spec.ts`, both projects, fresh profile, real cold open, no hooks):**
- [ ] Load to `onboarding-coldopen` in < 5 s on the PC (production build).
- [ ] First trade (first fill) in **< 90 s** of wall time from page load by a scripted "new player" path: Start → news card → Look → Buy chip → submit.
- [ ] The first news card shows a real engine headline (checked as in O2).
- [ ] No console errors in a 10-minute run at 4× speed.
- [ ] No dead ends: from every screen, Market and Portfolio are one tap away.
- [ ] No advice wording on any visible screen: a scan of rendered text for "you should", "guaranteed", "risk-free", "buy now", "can't lose" finds nothing.
- [ ] The honest note and the "Simulated market" framing are present.
**Human part (Mathis, one 10-minute session):** "Did you get it?", "What confused you?", "Would you open it tomorrow?". Each "confused" answer becomes a ticket on the board.
**PASS:** every box ticked plus Mathis's three answers recorded. Tape posts the gate.

## 5. M07 · Daily close card + priced-in on the Wire

**Preconditions:** Quant's `dayClose(state, playerId)`; M07 Wire panel built. Testids *(proposed)*: `day-close`, `day-close-pnl`, `day-close-best`, `day-close-worst`, `day-close-headline`, `day-close-dismiss`, `day-close-history`, `wire-priced-<itemId>`.
**Unit:** card numbers equal `portfolio()` math to the cent over 30 seeded days (Quant's test; Tape adds 3 seeds).
**e2e (`intro=off`):**
- Buy 2 assets, `advance` one game day: exactly one `day-close` card, numbers equal `__tg.state()` portfolio day P&L to the cent.
- With a pending market order at day close: the card waits until the order fills. With a rank-up due (`&e2e grantCash`): the rank-up shows first, the card after.
- Dismiss → it's in `day-close-history` in Portfolio.
- Priced-in shows only **Early / Mid / Late / Done**. The DOM contains no `%` and no number inside `wire-priced-*`, and nothing on a rumor item (Quant's rumors spec).
**Harness gate before the band can ever be sharpened:** `news_drift` beats BH on ≤ 70% of seeds after fees (M04, Risk R3).
**Private:** the card shows only the player's own book. No "share" button unless it goes through the M11 Export.

## 6. M08 · Benchmark ghost on Portfolio

**Preconditions:** Quant's `buyAndHold` ghost (`quant-ghosts.md`: equal-weight **stocks**, bought once, same fees, at the player's starting equity for the window). Testids *(proposed)*: `ghost-line` on `networth-chart`, `ghost-value`, `ghost-label`.
**Harness check (`scripts/balance/ghost-parity.ts`):** for 20 seeds, run Tape's harness `bh` (same definition: equal-weight stock basket, whole shares, market orders, same fees, from the same tick) and `ghostReport(...).buyAndHold`. **Equal to the cent** on every seed. Any difference is a FAIL, not a band.
**e2e:** fresh game, no trades, `advance` 21 game days: ghost line visible and `ghost-value` equals the engine's number to the cent; label text equals the "Equal-weight basket since your day 1" key. With no trades, percentile 50 and the "nothing to score" line (Velvet's copy).
**Private:** the ghost is computed and drawn locally on the player's own Portfolio. It never appears on any rival or leaderboard surface.

## 7. M09 · Trade journal v1 + replay

**Preconditions:** Quant's `explainTrade(state, tradeId)`; Forge's journal and replay chart. Testids *(proposed)*: `journal`, `journal-row-<tradeId>`, `journal-sentence`, `journal-parts`, `replay-chart`, `replay-entry`, `replay-exit`, `replay-held`.
**Unit/harness:** market + sector + news + residual + fees/slippage = realized P&L within $0.01 on **500 seeded trades** (Tape generates them with random buy/sell pairs over 20 seeds). A shocked day (test only) is labeled as a test shock, never given a story (ecology spec).
**e2e (`intro=off`):** buy, `advance` 5 days, sell → a `journal-row` appears; `journal-parts` sum to the realized P&L shown in `order-history` to the cent; `replay-chart` shows entry and exit markers at the fill ticks; "if held to now" equals qty × current mid minus the original cost.
**Copy check:** `journal-sentence` contains none of the advice words in §4.
**Storage:** the replay re-renders from the save's fills. No extra storage key appears (checked by `assertNoLeak`).
**Private:** the journal is the player's own screen. Nothing from it reaches the Wire, rivals or a leaderboard.

## 8. M10 · Keyboard-first desktop trading

**Preconditions:** Forge's shortcut spec. Desktop project only (`test.skip` on phone with the reason "touch device: shortcuts off").
**e2e (`keyboard.spec.ts`, `intro=off`):** `/` → type `HLCN` → Enter selects it; `B` opens the ticket; `2` picks the second size chip; `Enter` shows the confirm step; `Enter` confirms; `advance(3)` → filled; `S` → `4` → `Enter` → `Enter` → sold. `Esc` cancels at any point with no order created. `Space` toggles pause. `?` opens the help overlay.
**Negative:** with focus in `order-qty`, `B`/`S`/digits type into the field and open nothing. No key path executes without the confirm step. Phone project: pressing `B` does nothing.
**A11y:** every shortcut target has an accessible name (axe check on the ticket and help overlay).

## 9. M11 · Run files: export, import and exact replay

**Ownership:** Quant owns the format and its versioning (engine version, config hash, seed, ordered intents with ticks, final state hash). Forge owns the export/import UI and version-mismatch handling. Tape owns the repro workflow.
**Testids *(proposed)*:** `run-export`, `run-import`, `run-import-open`, `run-import-error`.
**Explicit-only rule:** a run file is created **only** when the player clicks `run-export`. Never written automatically, never uploaded, never posted, never attached to a score.
**Checks:**
- Play 30 game days (scripted orders, no hooks) → `run-export` → file < 200 KB gzipped.
- Import into a clean profile: until the player clicks `run-import-open`, nothing about the file renders (no NW, no positions, no trades). After opening: final NW to the cent and the same state hash.
- Engine-version mismatch → `run-import-error` with a clear message; nothing loads.
- Tampered file (one intent's qty changed) → detected by re-sim state-hash mismatch.
- An imported run never counts for anything ranked and never replaces the main save unless the player confirms.
**Tape repro workflow:** a bug report = run file + `npm run replay <file>` (headless, `src/engine` only) reproducing the final state hash, plus the e2e that opens it. Run files used as fixtures live in `tests/fixtures/runs/`, never in public/.

## 10. M19 · Weekly seed challenge (solo) — privacy constraints only

Local scores against the ghosts and NPC funds only. **No global ranking** (Q5, Risk R1). A score is never published with positions, trade logs or style tags. e2e: finishing a challenge makes no network request and writes no run file unless `run-export` is clicked.

## 11. M20 · Bankruptcy UI flow

**Preconditions:** Quant's M13 reason-coded ledger and M20 rules (ROADMAP §2.6). Testids *(proposed)*: `bust-screen`, `bust-summary`, `bust-perk-<id>`, `bust-confirm`, `fresh-start-offer`.
**Setup:** `/?seed=tape-bust&fresh&intro=off&e2e`. No positions, then `__tg.e2e.setCash(900)` (Forge, box copy). Net worth includes positions, so clear them first.
**e2e:**
- NW < $1,000 → `fresh-start-offer` appears (voluntary). NW ≥ $1,000 → it doesn't.
- `bust-screen`: calm copy, `bust-summary` lists the journal's top loss causes, three perks (`bust-perk-contacts`, `-lessons`, `-wind`), exactly one selectable.
- After `bust-confirm`: cash $5,000, positions empty, rank unchanged, titles kept, a `FRESH_START` ledger entry ≤ $5,000, leverage capped at 1× for 7 days, Reputation −10.
- A second bust inside 8 weeks: no fresh-start cash, only the floor (and ads once M48 exists).
- A forced bust (equity < 0 after liquidation) reaches the same screen. A busted save always opens on a playable screen; it's never a dead end.
**Private:** the bust summary is the player's own screen. Nothing about the bust reaches the Wire except the rank-neutral "fresh start" fact if Ledger wants it (no positions, no trades).

## 12. No-leak checks (Mathis rule)

Run on every session-length spec via `assertNoLeak(page)` (conventions §6), plus a dedicated `no-leak.spec.ts`:

| # | Steps | Assert |
|---|---|---|
| L1 | Normal session: `/?seed=tape-leak&fresh&intro=off`, 5 trades, `advance` 10 game days, open Portfolio, journal, daily close history. **No Export click** | IndexedDB holds only `trading-game/saves`; no value carries the run-file header; `localStorage` empty; `sessionStorage` has only `tg-replay-intro` if any. No replay blob anywhere |
| L2 | Same session | Zero requests to any origin except the app's own. Nothing is posted anywhere |
| L3 | Rivals active (after M12) | Portfolio, Wire and the Rivals board show **no** rival positions or trades: rivals appear only as name + equity on the leaderboard. A rival's holding can appear only as a legal filing item, when that system exists |
| L4 | Rivals active | No rival or NPC surface shows the **player's** positions, trades, style or ghost percentile |
| L5 | After `run-export` | Exactly one file download; still nothing in storage beyond the save; still no network request |
| L6 | Tournament autopsy (later) | Off by default; appears only after the player opts in on that entry |

## World-event foresight lock (Velvet + Quant)

App reads events only through `worldEventView` (`id`, `kind`, `headline`, `elapsedDays`). Forge lint: `src/components` must not import raw `WorldEvent` or read `endTick`.

**E2e:** force two crashes that differ only in planned length (10 vs 30 game days). On elapsed day 3, assert `event-banner` text is identical and the 1440/390 screenshots match. Duration may appear only on the ended line ("Crash ended · lasted N days…"), never while the event is live.

