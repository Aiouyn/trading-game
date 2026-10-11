# V1 Phase 6: status

Scope: Phase 6 as set in `docs/team/specs/lead-phase6.md` (binding). This file holds section 6A (World events and rivals). The other tracks (6B, 6C, 6D) add their own sections when they land.
Branch: `p6/a`, worktree `.claude/worktrees/p6-a`, from `v1` at `ae573f2`. Status date: 2026-10-11.
Status words as in `docs/V1-PHASE5.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**.

## 6A. World events and rivals

### 6A.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| Telegraph for a major (M39 ≥ 8 h) | **Done** | A crash or bubble is announced 8 game days (= 8 real hours, 720 ticks each) before onset. Crisis weeks keep their 2-day lead (see deviations). | `src/engine/worldEvents.ts` (`majorLeadDays`) |
| Telegraph window, no onset, no length | **Done** | An announced event carries `windowHours`: the hours left, rounded up to an 8-hour band (8, 16, 24 …). The event panel and the banner's announced label show it. Never the exact onset, never `endTick`. | `worldEventView`, `telegraphBand`; `EventBanner.tsx` |
| Takeover (major onset only, once per event) | **Done** | Hairline 300–900 ms, dim to 70%, `WORLD EVENT` label, engine headline, `GX … today` in mono, one line, See my positions and Close. Close is live from 1 s; the takeover ends by itself at 3 s. Waits (at most 10 s) behind a rank-up or an open phone ticket; keeps 8 s clear of the last full-screen moment. Reduced motion: static card, no desaturation. Brass accents go grey on the desk for the takeover. Phone: a double haptic at the headline. | `src/components/os/EventTakeover.tsx`, `takeoverRules.ts` |
| Banner, panel, aftermath, flash | **Done** (Phase 1, unchanged) | The Phase 1 strip and panel stay. Flash crash: no takeover, banner and the halted state. | `EventBanner.tsx` |
| Ambient layers (header pulse, chart band, wire speed, sound) | **Not built** | Spec §4. Not in this pass. | — |
| Rivals board (names and net worth only) | **Done** | A card in the Market (Broker) app under the watchlist, expandable. Rank, mark, name, 1W net worth spark, net worth, change since start. The player's row (brass hairline, monogram, "You") in its place. "Next up · gap ahead" on the rival directly above. Tap a row for the profile card: flavour line, net worth, change, last quarter chart, days ahead and behind of the player. | `src/world/rivalsBoard.ts`, `src/components/apps/broker/RivalsCard.tsx` |
| Rivals: no style, cash, holdings or trade data | **Done** | The engine view is built field by field; a test asserts the row and you keys and that no style word appears. | `rivalsBoard.test.ts` |
| Rivals: "passed" Wire line | **Not built** | Spec: a Wire line on the player's screen when a rival is passed. | — |
| Rival tiers, AP/DP and list size (M26) | **Done** | Hale T1, Pinn and Vetch T2. AP from the B2 range (T0 5–20 … T5 2000–5000), DP_ai = 0.8 × AP, normal list size from 03 §4.6.4. Seeded per fund. | `src/world/rivalCrews.ts` (`fundDefense`) |
| Rival funds carry a model list | **Partial** | Each crew has one security model (its AP as MCS). No trading models for funds. | `rivalCrews.ts` |
| Honeypots (M29): fund side and player side | **Partial** | The math is built and tested: poison by tier, the poison scaling, the canary check, the evidence caps, the 25% quarterly roll for T2+. Nothing calls it in play: a player cannot attack a fund yet (fund-side sessions are M28). The player's own honeypot model (purchase, bait, DU burn) is not built. | `rivalCrews.ts` |
| Rival crews attack the player (M31) | **Done** | `rivalCrewDay` (after the cyber day). A fund at T1+ picks one eligible player with 25% a day. Gates: the 72-game-hour new-account protection, the rookie zone (below R2), offline protection (no attack after more than 8 real hours offline), the lockdown shield, a 3-day cooldown per target, at most three hostile sessions per target, one per crew. Breach odds are the player's own (`breachOdds`, 1% floor). Success plants a Tap session through the player's cyber path. | `rivalCrews.ts`, `cyber.ts` (`plantCrewSession`), `game.ts` |
| Stolen-goods exception to offline protection | **Not built** | There is no stolen-goods state to test yet. The offline gate has no exception. | — |

### 6A.2 Commits

| Commit | What |
|---|---|
| `3e74247` | Telegraph window, 8-hour majors lead, admin event seam, rivals tier and history, `rivalsBoard` view |
| `95275de` | Takeover (store-driven queue, pure rules, CSS, i18n), window line in the event panel |
| `b868670` | Rivals card in the Market app, profile card, onset window on the banner label, i18n |
| `2765a5e` | Rival tiers, AP/DP, honeypot math, rival crews with the gates and the harness |
| `1e863e6` | The worldEvents Playwright spec (6 of 6), the close-chain entry, the admin event length and start, the banner panel's reset, the takeover's GX colour by sign, this status doc |

### 6A.3 Gates

- `npx next typegen && npx tsc --noEmit`: exit 0 (after each commit).
- Vitest, touched areas, then the broad run (`src/engine src/world src/components src/game src/i18n src/shell`, `--maxWorkers=2`): **187 files passed, 2 skipped; 1813 tests passed, 70 skipped, 21 todo** on the final tree (`1e863e6`).
- New tests: `src/engine/worldEventsTelegraph.test.ts` (16 cases, telegraph bands, forced events, lead rule), `src/world/rivalsBoard.test.ts` (6), `src/components/os/takeoverRules.test.ts` (7), `src/components/apps/broker/rivalsCard.test.tsx` (2), `src/world/rivalCrews.test.ts` (11, including the 20-seed, 90-day harness).
- ESLint on the touched files: 0 errors. One `react/jsx-no-literals` warning remains in `RivalsCard.tsx` (the `&` ampersand mark).
- Money identity: no faucet or sink was added. Crew attacks pay no cash (see deviations). The admin event seam moves no cash. The existing zero-sum and sequence tests in `src/world` pass.
- Determinism: all new draws use `keyedRng` or `seedStream` per fund, per day or per quarter. No new draw touches the price streams. A world with no rivals runs the crew hook as a no-op. `RivalState.hist` and `ConnectionEntry.hostile` are optional fields; old saves load.
- Playwright: `tests/e2e/worldEvents.spec.ts` (close chain; the phone chain now starts after `close-events`): takeover (Close disabled before 1 s, live after, ends on Close), banner and panel, the Rivals board at 900 × 800 and in the phone window, and the French takeover and board. **6 of 6 pass** (see 6A.4).
- Screenshots: `shots-p6a` in the session scratchpad (desktop 1440 × 900 and phone 390 × 844, en and fr). Set `P6_SHOTS` to choose the folder.

### 6A.4 End-to-end result

`tests/e2e/worldEvents.spec.ts` in the close chain (`close-events` and `close-events-phone`, `--workers=1`): **6 of 6 pass** (3 tests, desktop 1440 × 900 and phone 390 × 844). Covered: the crash onset takeover (Close disabled before one second, live after, and it closes on Close); the banner, the event panel and the Rivals board (the board at the 900 × 800 minimum window on desktop, no style word in its text, the profile card); the French takeover (`Voir mes positions`) and the French Rivals board (`Rivaux`). Shots: `shots-p6a` (desktop and phone, en and fr: takeover onset, banner and panel, rivals board and profile). The first runs failed on a race in the banner test (the panel click landed as the banner settled); the test now retries the click and the banner reads its open state, and the banner keeps the open panel across a frame that briefly lacks the event.

The spec forces its own events with `admin.event` (one game day each, starting one tick after the request, so no wait for a day). Each test ends its event in an `afterEach`.

### 6A.5 Deviations

1. **Major telegraph is 8 game days (8 real hours), not 2.** `majorLeadDays` is 8. The change moves onsets for every world with events on; it does not touch worlds with events off. The rate of rolls is unchanged, since a new roll still waits for the previous event to end.
2. **The window is an 8-hour band.** The spec example was "8 to 16 hours". The band is the hours left rounded up to 8, so an onset 3 hours away reads "within the next 8 hours". It never shows the onset.
3. **Crisis weeks keep a 2-game-day lead.** The spec says 48 real hours. Applying it would hold the single active-event slot for 48 days per crisis week (about 40% of the time at the storm rate), which would starve the majors. Left for Quant to decide.
4. **The takeover ends by itself at 3 s.** The spec says "about 3 s, skippable after 1 s". The Close control is disabled until 1 s.
5. **The Rivals board lives in the Market app, on both shells.** The spec allows "Market → Rivals" as a card under the watchlist (desktop). On the phone the same card sits at the foot of the Market app, not a segment on the Wire tab.
6. **"Days ahead and behind" is computed on the client** from the player's daily net worth and the fund's quarter of closes, matched by game day.
7. **Crews pay no cash.** A fund's attack costs nothing in this build, so no faucet or sink is booked. If a crew cost is added later, it must be booked against the fund's Street-side money (ruling O-22) and the money identity re-run.
8. **Offline protection has no stolen-goods exception** (there is no stolen-goods state yet).
9. **The 72-game-hour protection** uses the existing `shieldUntil` set at join (72 × 720 ticks = 72 real hours, since one game day is one real hour). The "game hour" in the lead spec is read as the real hour the codebase already uses.
10. **The e2e spec runs with one worker** (`--workers=1`), because it forces events in the shared world. Its two projects depend on the close chain, so they run in order.
11. **The admin seam starts an event one tick after the request** (`now`), not at the next day boundary. The unit tests keep the boundary rule for the default path. The e2e world ticks once a second, so a boundary would mean a twelve-minute wait.
12. **The takeover's GX number is coloured by its sign** (gain above zero, loss below), not by the event kind, so a positive number never reads red.

### 6A.6 Open items

- M28 (fund-side hidden sessions, the player's attacks on funds) is needed before the honeypot canary check can run in play. The player-side honeypot (purchase, sink, bait, DU burn) is not built.
- Wire line "You passed …" and the ambient layers of spec §4 (header pulse, chart band, wire speed, sound).
- Telegraph for crisis weeks at 48 hours (a Quant decision, see deviation 3).
- The fund's trading models (only the security model exists).
