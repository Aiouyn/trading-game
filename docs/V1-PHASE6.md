# V1 Phase 6: status

Scope: Phase 6 as set in `docs/team/specs/lead-phase6.md` (binding). This file holds section 6A (World events and rivals). The other tracks (6B, 6C, 6D) add their own sections when they land.
Branch: `p6/a`, worktree `.claude/worktrees/p6-a`, from `v1` at `ae573f2`. Status date: 2026-10-11. Second pass: the adversarial review of `d69ade0` (16 findings), repaired in `b4ebe14`, `efaad30`, `afed1b8` and the commit that adds this text.
Status words as in `docs/V1-PHASE5.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**.

## 6A. World events and rivals

### 6A.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| Telegraph for a major (M39, at least 8 real hours) | **Done** | A crash or bubble is announced 8 to 16 real hours before onset. The lead is drawn from the seed in whole hours (8, 9 … 16), so the Wire time plus the window never gives the exact onset. Onsets stay on a day boundary, so the engine's own start path runs. | `src/engine/worldEvents.ts` (`drawLead`, `majorLeadDays`, `majorLeadMaxDays`) |
| Telegraph window, no onset, no length | **Done** | An announced event carries `windowHours`: the hours left, rounded up to an 8-hour band. The panel and the banner show it. Never the exact onset, never `endTick`. | `worldEventView`, `telegraphBand`; `EventBanner.tsx` |
| No-reveal before onset | **Done** | An announced major shows no kind and no headline (`kind`, `headline`, `headlineKey` are null). The calendar shows only an announced crisis week. The Wire's precursor lines are the telegraph and are unchanged. | `worldEventView`; `Calendar.tsx` |
| Takeover (major onset only, once per event) | **Done** | Hairline 300–900 ms, scrim to 70%, `WORLD EVENT` label, the engine's headline in the viewer's language, `GX … today` in mono, one line, See my positions and Close. Close is disabled before 1 s and live from 1 s; the takeover ends by itself at 3 s. It waits (at most 10 s) behind a rank-up or an open phone ticket. The card sits on a 94% ink panel, so the headline reads over the chart and over the phone's app icons. Reduced motion: static card, no desaturation. | `src/components/os/EventTakeover.tsx`, `takeoverRules.ts`, `os-events.css` |
| Banner, panel, aftermath, flash | **Done** | The strip and the panel show the translated headline and the precursors (from the Wire's message keys). The panel's rows `event-share-<assetId>` show each held asset's share of today. Flash crash: no takeover; banner and panel; the aftermath line. | `EventBanner.tsx`, `eventText.ts` |
| Ambient: header pulse | **Done** | A 2400 ms hairline pulse (40% to 80%) under the top bar, in the kind's colour, while live. Off under reduced motion. | `os-events.css` (`.os-event[data-state="live"]::before`) |
| Ambient: chart band | **Done (price charts)** | The event window is shaded at 6% from the onset to now, with a kind label at the top left, on the broker's price chart (`data-testid="event-band"`). It follows zoom and scroll and never shows an end. | `PriceChart.tsx` (`eventBand`), `ChartCard.tsx` |
| Ambient: net worth chart band | **Not built** | Spec §4 also names the net worth chart. The net worth chart is not wired to the band yet. | — |
| Ambient: Wire speed 1.5× | **Not built** | The Wire in this build is a list, not a scrolling strip, so there is nothing to speed up. | — |
| Ambient: flash edge glow | **Done** | A 1.5 s soft `info` edge once at a flash crash's onset. No red, no second glow. Off under reduced motion. | `EventBanner.tsx`, `os-events.css` (`body.os-flash-glow`) |
| Sound | **Not built** | There is no sound system in this build. | — |
| Live onset for the chart | **Done** | Live views carry `sinceTick` (the onset tick, never the end). | `worldEventView` |
| Rivals board (names and net worth only) | **Done** | A card in the Market (Broker) app under the watchlist, expandable. Rank, mark, name, 1W net worth spark, net worth, change since your day 1. The player's row (brass hairline, monogram, "You"). "Next up · gap ahead" on the rival directly above. Tap a row for the profile card: flavour line, net worth, change since day 1, last quarter chart, days ahead and behind. | `src/world/rivalsBoard.ts`, `src/components/apps/broker/RivalsCard.tsx` |
| Rivals ranks | **Done** | Ranks are unique. A tie goes to the rival with the lower id, and the player sits below a tie. | `rivalsBoard.ts` |
| Rivals "since your day 1" | **Done** | Each rival's change is against its equity when the player joined (`Player.rivalBase`, taken at `createPlayer`). A world or account made before the snapshot falls back to the rival's starting cash. | `players.ts`, `rivalsBoard.ts` |
| Rivals: no style, cash, holdings or trade data | **Done** | The engine view is built field by field; a test asserts the row and you keys and that no style word appears. | `rivalsBoard.test.ts` |
| Rivals: "passed" Wire line | **Not built** | Spec: a Wire line on the player's screen when a rival is passed. | — |
| Rival tiers, AP/DP and list size (M26) | **Done** | Hale T1, Pinn and Vetch T2. AP from the B2 range (T0 5–20 … T5 2000–5000), DP_ai = 0.8 × AP, the normal list size from 03 §4.6.4. Seeded per fund. | `src/world/rivalCrews.ts` (`fundDefense`) |
| Rival funds: model list (M26) | **Done** | `fundModelList`: the fund's security model (MCS = AP), the quarter's honeypot as a bait model when it runs one, and the list size. Read by the fund operation and tested. | `rivalCrews.ts` |
| Honeypot, player side (M29) | **Done** | A player places a basic ($30k, poison 0.20), advanced ($120k, 0.40) or frontier ($400k, 0.60) honeypot: one at a time, tier-gated (basic T1, advanced T3, frontier T4), the price a sink in the security book. The bait is the best security MCS times the ratio (engine: 0.5 to 1.25; the Security app uses 1.0). | `cyber.ts` (`deployHoneypot`), `SecurityApp.tsx` (`honeypot-<kind>`) |
| Canary check (M29) | **Done** | A player's op may run the canary (+20% of the op's price). The canary flags a honeypot with p = clamp(0.25 + 0.15·log2(AP/DP_eff), 0.05, 0.75); a flagged honeypot is avoided, and the op goes to the real systems. Crews always run it. | `cyber.ts` (`meetHoneypot`), `rivalCrews.ts` |
| Honeypot session (M29) | **Done** | An unflagged attempt that breaches takes a decoy session: not a Connections entry, no drain on the victim, no clues. The thief sees a plant. The defender gets +15 at once and +3 per effective hour, capped at 40 alone. After 7 real days the thief keeps a student: bait · P · (1 − poison), with poison = tier poison · (0.4 + 0.6·P/0.85). | `cyber.ts` (`openDecoy`, `decoyDay`, `endDecoy`) |
| Honeypot, fund side (M29, M28-lite) | **Partial** | A rival fund at T2 and up runs one honeypot in a 63-day quarter with 25%. A player's operation against a fund (`sec.fund`, with the canary) meets it. A clean breach opens a fund session that distils a student from the fund's AP when it closes. The fund session's full M28 rewards and the fund-side court (M30) are not built. | `rivalCrews.ts` (`attackFund`, `fundHoneypot`), `SecurityApp.tsx` (fund targets) |
| Rival crews attack the player (M31) | **Done** | `securityDay` (the day hook stepGame calls): cyber day, then crews. A fund at T1+ picks one eligible player with 1-in-30 a day (`CREW_DAY_CHANCE`). Gates: the 72-game-hour new-account protection, the rookie zone (below R2), offline protection (no attack after more than 8 real hours offline), the lockdown shield, a 3-day cooldown per target, at most three hostile sessions per target, one per crew. Breach odds are the player's own (`breachOdds`, 1% floor). | `rivalCrews.ts`, `cyber.ts` (`plantCrewSession`), `game.ts` |
| Stolen-goods exception to offline protection | **Not built** | There is no stolen-goods state to test yet. The offline gate has no exception. | — |
| Honeypot DU burn (5% of the owner's DU budget) | **Not built** | The DU budget is compute, not modelled in the security book. The honeypot costs cash only. | — |

### 6A.2 Commits

| Commit | What |
|---|---|
| `3e74247` | Telegraph window, 8-hour majors lead, admin event seam, rivals tier and history, `rivalsBoard` view |
| `95275de` | Takeover (store-driven queue, pure rules, CSS, i18n), window line in the event panel |
| `b868670` | Rivals card in the Market app, profile card, onset window on the banner label, i18n |
| `2765a5e` | Rival tiers, AP/DP, honeypot math, rival crews with the gates and the harness |
| `1e863e6` | The worldEvents Playwright spec, the close-chain entry, the admin event length and start, the banner panel's reset, the takeover's GX colour by sign, this status doc |
| `b4ebe14` | Review 1, 2, 6 (the no-reveal), 10, 11, 16: lead drawn from the seed; majors hide kind and headline; admin events run on their own ticks; unique ranks; "since your day 1"; Wire lines carry message keys |
| `efaad30` | Review 3, 4, 12, 13: honeypots on both sides, canary, decoy sessions, the fund model list, the fund operation, the 1-in-30 crew cadence, the harness on `securityDay` |
| `afed1b8` | Review 5, 8, 9: takeover backing panel, ambient layers (pulse, chart band, flash glow), `sinceTick`, the e2e takeover timing in the page |
| (this commit) | Review 6, 7, 14, 15: the e2e run and its shots; the French copy; the determinism check; this status doc |

### 6A.3 Review repair (second pass)

Each finding of the review of `d69ade0`, and what changed.

| # | Finding | Repair | Status |
|---|---|---|---|
| 1 | Calendar and view showed a major's kind and headline before onset | The view hides kind, headline and headline key for announced majors; the calendar shows an announced crisis week only | **Fixed** (`b4ebe14`) |
| 2 | Exact onset: Wire time + fixed 8 h | Lead drawn from the seed: majors 8–16 whole hours; crisis 1–2 hours | **Fixed** (`b4ebe14`) |
| 3 | Honeypots not called in play | Player purchase (`sec.honeypot`), canary and decoy sessions in `plantSession` and `plantCrewSession`, the fund operation `sec.fund` with fund honeypots, the student and the evidence clock in `cyberDay` (`decoyDay`) | **Fixed for both sides** (`efaad30`); the fund side is M28-lite (see 6A.1) |
| 4 | Fund got one 'crew' model; `listSize` unused | `fundModelList` (security model, quarter's honeypot as a bait model, list size); the fund operation reads it | **Fixed** (`efaad30`); the canary does not depend on the list size (no formula in the spec) |
| 5 | Ambient layers and flash glow missing | Pulse, chart band (`event-band`), flash glow (`afed1b8`) | **Fixed**; the net worth band and Wire speed are not built (see 6A.1) |
| 6 | Verification shots did not show the claimed frames | The e2e spec waits for the settled card before each takeover shot; the profile is shot after a tips toast is dismissed, as a page shot and as the card alone | **Fixed**: the new shots were opened and checked by eye (`shots-p6a`: the fr takeover shows the French card over Settings; the phone profile card shows Pinn Partners) |
| 7 | Takeover and panel render English headlines in fr | Headlines, precursors and Wire end lines are keys (`event.headline.*`, `event.pre.*`, `event.wire.end*`) in both files | **Fixed** (`b4ebe14`, `afed1b8`) |
| 8 | Close test not proving Close, skip not proven | The spec measures in the page: Close disabled before 1 s and live from 1 s; a forced click before 1 s leaves the card; Close removes it before 3 s; the self-end is at about 3 s | **Fixed in the spec**; run result in 6A.4 |
| 9 | Takeover legibility | Solid 94% ink backing panel on the card | **Fixed** (`afed1b8`) |
| 10 | Row change used the rival's own starting cash | Change since the player's day 1: `Player.rivalBase` | **Fixed** (`b4ebe14`) |
| 11 | Admin `now` start did not run the engine start path | `worldEventIntraday` starts and ends any kind on its own tick (the day path skips an event already started); tested in `worldEventsTelegraph.test.ts` | **Fixed** (`b4ebe14`) |
| 12 | Crew cadence 0.25 a day against a comment of once a month | `CREW_DAY_CHANCE = 1/30`; tested over 20 seeds × 240 days (rate between 0.3/30 and 1/30 of fund-days: the pick needs an eligible victim) | **Fixed** (`efaad30`) |
| 13 | Harness vacuous, rookies by rank, direct `rivalCrewDay` | The harness runs `securityDay` (the function stepGame calls); it counts rookies who pass every other gate (`rookieEligibleDays > 0`); `stepGame` runs game days in a separate test | **Fixed** (`efaad30`) |
| 14 | Determinism coupling: crew drain slows bots, and bots place orders | See 6A.5, deviation 15. The fingerprint suites in `src/engine src/world src/components src/game src/i18n src/shell src/content` pass on this tree (1831 tests). | **Checked**; the coupling is disclosed, not removed |
| 15 | Crisis lead 2 hours against a 48-hour spec | Kept at 1–2 hours, with the reason in deviation 3 | **Decided** (deviation 3) |
| 16 | Tied ranks shown as 1 | Unique ranks | **Fixed** (`b4ebe14`) |

### 6A.4 Gates

- `npx next typegen && npx tsc --noEmit`: exit 0 on each commit.
- Vitest, the broad run (`src/engine src/world src/components src/game src/i18n src/shell src/content`, `--maxWorkers=2`) on the final tree: **188 files passed, 2 skipped; 1831 tests passed, 70 skipped, 21 todo.**
- ESLint on the touched files: **0 errors, 0 warnings** (the `jsx-no-literals` warning on the `&` mark in `RivalsCard.tsx` is gone: the mark is a constant).
- New or rewritten tests: `src/engine/worldEventsTelegraph.test.ts` (lead band, no-reveal, admin start and end, 13 cases); `src/engine/worldEvents.test.ts` (view keys); `src/world/rivalsBoard.test.ts` (unique ranks); `src/world/rivalCrews.test.ts` (the harness on `securityDay`, rookie-edge, protection, cadence, canary and honeypot, fund model list); `src/world/honeypots.test.ts` (placing, the decoy session, the canary, the student, the evidence cap, a step with a honeypot); `src/components/os/takeoverRules.test.ts`, `eventSelect.test.ts`.
- Money identity: the honeypot price and the fund operation's price are debits into the security and operations books (sinks); the canary add-on is part of the same debit. Crews pay no cash. The zerosum and sequence tests in `src/world` pass.
- Determinism: all new draws use `keyedRng` or `seedStream`, per fund, per day, per op, per session. The lead draw is one more draw on the `macro:events` stream, so event timing changes only in worlds with events on (6A's first commit already changed those). A world with no events and no rivals runs no new code. `Player.rivalBase`, `Model.poison`, `CyberState.decoys`, `Player` fields and `WorldEventView.sinceTick` are optional; old saves load.
- e2e (`tests/e2e/worldEvents.spec.ts`, close-events and close-events-phone, `--no-deps --workers=1`, webpack build): **8 of 8 pass** on the tree before the profile fix; the banner test re-run after it: **2 of 2 pass** (desktop 900 × 800 and phone 390 × 844).

### 6A.5 Deviations

1. **Major telegraph is 8 to 16 real hours, drawn from the seed.** The spec says at least 8 hours and a window such as "8 to 16". The lead is an integer number of hours, so a day boundary still starts the event.
2. **The window is an 8-hour band.** An onset 3 hours away reads "within the next 8 hours"; an onset 12 hours away reads "within the next 16 hours". It never shows the onset.
3. **Crisis weeks keep a 1–2 hour lead (spec: 48 hours).** The single active-event slot is held from announcement to end. At the storm rate of 0.8% a game day, a 48-hour lead plus the 5-day week holds the slot about 42% of days (0.008 × 53), so a rolled major on those days is dropped; the 1–2 hour lead holds it about 6% of days. The odds are separate, but the slot is one. Quant can lift the lead when the slot can hold two announcements (a scheduled slot that does not block rolls).
4. **The takeover ends by itself at 3 s.** The spec says "about 3 s, skippable after 1 s". Close is disabled until 1 s.
5. **The Rivals board lives in the Market app, on both shells.** The spec allows a card under the watchlist (desktop). On the phone the same card sits at the foot of the Market app, not a segment on the Wire tab.
6. **"Days ahead and behind" is computed on the client** from the player's daily net worth and the fund's quarter of closes, matched by game day.
7. **Crews pay no cash.** A fund's attack costs nothing, so no faucet is booked for it. The player's honeypot and the player's operation against a fund are sinks in the security and operations books (`debit`), and the canary add-on is part of that debit.
8. **Offline protection has no stolen-goods exception** (there is no stolen-goods state yet).
9. **The 72-game-hour protection** uses the existing `shieldUntil` set at join (72 × 720 ticks = 72 real hours, since one game day is one real hour).
10. **The e2e spec runs with one worker** (`--workers=1`), because it forces events in the shared world. Its two projects depend on the close chain, so they run in order (`--no-deps` in the run that produced 6A.4).
11. **The admin seam starts an event one tick after the request** (`now`), not at the next day boundary. A start or end off a boundary is run by `worldEventIntraday` on its own tick (any kind, not only flash).
12. **A honeypot's poison cuts the student's MCS**, not a separate trading edge. The model has one strength number, so the student's MCS is bait · P · (1 − poison). The poison is stored on the model and shown nowhere a player can read it.
13. **The honeypot's DU burn is not modelled** (5% of the owner's DU budget). The honeypot costs cash only, and the bait ratio in the app is fixed at 1.0 (the engine accepts 0.5 to 1.25).
14. **The crew cadence is 1 in 30 a fund-day** (`CREW_DAY_CHANCE = 1/30`), as the comment and ROADMAP's "about once a month" say. The first pass had 0.25 (about seven a month). The exploit probe in the review measured the old rate; at the new rate the repeated-lockdown dodge produces about an eighth of the attempts it did, but it is not re-measured here.
15. **Determinism coupling (disclosed).** A crew attack that lands is a hostile session on the victim (drain on the victim's bots, `lab.ts`), and the bots place real orders. So a crew attack changes prices in a world with crews once it has landed on a bot owner. Worlds with no landed attack keep their fingerprints, and the fingerprint suites in the broad run pass on this tree; no suite here checks a world where a crew attack lands on a bot owner, so this coupling has no fingerprint test. Decoy sessions drain nothing and emit no clues, so a honeypot does not change a bot.
16. **The fund-side session is M28-lite.** The fund's honeypot and the canary work; a clean fund session distils a student from the fund's AP when it closes. The M28 progress reward and the fund-side court (M30) are not built.
17. **Net worth band, Wire speed and sound are not built** (6A.1).

### 6A.6 Open items

- The net worth chart band, the Wire's 1.5× scroll and the sound layer (6A.1).
- The "You passed …" Wire line and its row swap.
- The fund-side court (M30) for honeypot evidence: the evidence is recorded (`g.cyber.evidence`); no filing reads it against a fund yet.
- The M28 progress reward on a fund session, and the fund's trading models (only the security model and the bait exist).
- The exploit probe's repeated-lockdown dodge: the 14-day shield (`defense.shieldUntil`) can be renewed, and each lockdown invites the next wave of crew attempts when it ends. A cooldown on repeated lockdowns is the candidate fix; not built, and the rate is lower after the 1-in-30 change.
- Crisis lead (Quant decision, deviation 3).
- The e2e run covers the price chart's band and the French takeover; the calendar's no-reveal is covered by the engine test (no e2e: a major's onset takes a day in the e2e world).

### 6A.7 Screenshots (sign-off set, partial)

Written to the session scratchpad `shots-p6a` by the e2e spec (`P6_SHOTS`), each at 1440 × 900 (`desktop-`) and 390 × 844 (`phone-`) and checked by eye:

| Frame | en | fr |
|---|---|---|
| Crash onset takeover, settled | `…-en-takeover-onset.png` | — |
| Banner, event panel (open), window and band | `…-en-banner-panel.png` | — |
| Rivals board | `…-en-rivals-board.png` | `…-fr-rivals-board.png` |
| Rivals profile card | `…-en-rivals-profile.png`, `…-en-rivals-profile-card.png` | — |
| Bubble takeover, settled | — | `…-fr-takeover-bubble.png` |

Not taken: the crash on day 3, the en bubble takeover, the flash crash, and the fr profile card. The velvet spec's sign-off set (crash onset, crash day 3, bubble, flash) is therefore not complete. The phone takeover's card is legible, but the home-screen icons show faintly through the 94% panel.

## 6C. Security, law and anti-cheat

Scope: track 6C of `docs/team/specs/lead-phase6.md` (binding): insider tips from crime (M16 v1, `specs/quant-rumors.md`), the ECA market regulator (M16 v2, ROADMAP §2.5, 03 §10.2), and the collusion graph (Phase 4 O-5). Branch `p6/c`, worktree `.claude/worktrees/p6-c`, from `v1` at `26c2d98`. Status date: 2026-10-11. Status words as in 6A.

### 6C.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| Insider tips from crime (M16 v1) | **Done** | A planted session on a covered insider of a listed stock queues a tip for the attacker. It is delivered privately once the report's surprise is locked (the analyst preview, at most five game days before the report). The claim is the sign of that surprise, so it is always true. Orders on the claim's side, after the tip and before the report, are flagged when placed. Rumors are never flagged. | `src/world/tips.ts`; hooks in `cyber.ts` (plantSession), `game.ts` (order.place, day close) |
| Tip item in Messages | **Done** | Inbox kind `tip`: a NON-PUBLIC card with the claim, the ticker and the days to the report. No outcome. | `tips.ts` (`say`); `inbox.kind.tip` in `en.json` and `fr.json` |
| ECA surveillance score | **Done** | Per account and asset, folded at the day close as `score = min(100, 0.8 × previous + points)`. Points come from the company insider record (Phase 4 window and plan points, read as a daily delta), from tip flags (40 × size factor at placement), and from abnormal pre-announcement trading (a right-side fill within two game days before a report that moves the stock by at least 3%: 40 × size factor × timing factor, timing 1 within a day and 0.5 at one to two days). | `src/world/eca.ts` |
| ECA inquiry and investigation | **Done** | An inquiry opens after three consecutive day closes at 60 or more, with 10 to 20 evidence points (score / 5). It becomes an investigation at 80, or at 60 when the account received a tip on the asset. An investigation adds 5 evidence a day while the score stays at 60 or more; the tip trail gives 30 evidence on half the investigation days for an account that received a tip. An inquiry whose score stays under 60 for five game days closes quietly. A decided file cannot reopen for 20 game days. | `eca.ts` |
| Tribunal-lite and S5 fines | **Done** | At 55 evidence, `regulatorVerdict` (in `court.ts`) decides on the logistic `σ((E − 55)/12)` with a keyed draw. A conviction is S5: 8% of net worth, floor $100k, at most 35% of net worth, never below the $5k floor, plus disgorgement of the gain on the flagged trades (at today's price). Both are sinks (`eca fines`, `eca disgorgement`), since there is no victim to pay. Reputation −10. | `court.ts` (`regulatorVerdict`, `TRIBUNAL_BAR`, `ECA_CAP_PCT`) |
| ECA letters | **Done** | Notice, investigation letter and verdict, each in three parts (what happened, why, what to do), in `en.json` and `fr.json` (`eca.notice.*`, `eca.investigation.*`, `eca.verdict.*`). The Legal & Court app shows the player's own inquiries and letters (`EcaCard`). The view carries the stage and the letters only, never the score, the evidence, the tip trail or the flags. | `eca.ts` (`letter`, `ecaViewOf`); `view.ts` (`regulator`); `components/apps/legal/LegalApp.tsx` |
| Collusion graph | **Done** | Owner groups are the transitive closure of: alliances (unchanged); a registration device, kept as a sha256 hash (`registerDevice`, never sent to a client); two or more completed gifts between a pair (`recordGift`, from accepted transfer deals); and mirrored fills (same asset, side and quantity within two ticks; at least eight matches covering at least 60% of the smaller account's fills). | `src/world/collusion.ts` |
| `linkedAccounts(g, pid)` | **Done** | The API for the consumers: IPO exclusions (`company/ipo.ts`), the Launchpad creator cap (`launchpad/state.ts`, `isCreatorLinked`), the founder sell cap, and the ad cap (exported, not wired: `sponsor.ts` is on `p6/b`). `isLinkedAccount` answers pairs. | `collusion.ts` |
| Founder sell cap on linked accounts (closes O-7a) | **Done** | Each member of the founder's group gets `floor(perDay / group size)` of the listed stock's daily cap, so the group sells at most the cap together. A group of one keeps the full cap. It is re-set every game day, so a member who leaves the group loses the cap. | `company/bridge.ts` (`syncFounderCaps`); `collusion.ts` (`syncGroupSellCap`) |
| Admin seeds for e2e | **Done** | `admin.tip` and `admin.inquiry`, behind `ADMIN_TOKEN` (`/api/admin/tip`, `/api/admin/inquiry`). They run the game's delivery and notice code on a chosen stock, or the first stock with a report ahead. The tip seed locks the surprise and the consensus, so the claim stays true. | `game.ts`; `tips.ts` (`adminSeedTip`); `eca.ts` (`adminSeedInquiry`); `server/index.ts` |
| Harness | **Done** | `scripts/eca-harness.ts`: the real engine (`createGame`, `applyCommand`, `stepGame`) over seeds, with honest, lucky, tip and rumor traders. Reports every 12 game days (the production cadence is 63), so a 60-day season holds several per stock. | `scripts/eca-harness.ts` |

### 6C.2 Commits

| Commit | What |
|---|---|
| `554d2fe` | Engine, letters and copy: collusion, tips, ECA, tribunal-lite, hooks, Legal & Court letters, Messages kind, the unit tests and the harness. |
| (next commit on `p6/c`) | Inquiry closure fix, the founder group cap test, the admin seeds, the e2e spec, the harness default and this section. |

### 6C.3 Gates

Unit tests (new): `src/world/collusion.test.ts` (9), `src/world/tips.test.ts` (6), `src/world/eca.test.ts` (8). All pass. The founder cap test runs the listed-company fixture through `companyDay`.

Harness: `npx tsx scripts/eca-harness.ts --seeds 20 --days 60` (seeds `eca-h0` to `eca-h19`, 8 traders per kind, 60 game days, reports every 12 game days). The tip trader's crime is simulated by pushing the pending tip that `queueInsiderTip` would push, since no listed company is built in the harness. Everything after that is the real code. Each tip is traded in three tranches, one a game day. Returns are net worth over the season.

| Tip tranche (per day, % of NW) | Tip EV / honest | Tip variance / honest | Inquiries | Convictions | Wrongful | Rumor trader (mean season) |
|---|---|---|---|---|---|---|
| 4% (the default) | **1.71** (band 0.8 to 1.2: fail) | **2.04** (band 2 to 4: pass) | 0 | 0 of 160 | 0 | +0.52% |
| 6% | **−13.5** (fail) | **53** (fail) | 135 | 97 of 160 (61%; band 40 to 65%: pass) | 0 of 97 (pass, under 3%) | +0.52% |

Four-seed points on the same harness, not release numbers: 2% gives tip EV 1.07 and variance 0.60, with no inquiries; 5% gives 1.99 and 3.9, with 5 inquiries and no conviction; 8% gives −28 and 44, with 66% convicted.

| Gate (lead-phase6 6C, 03 §16) | Result |
|---|---|
| Wrongful convictions under 3% | **Pass.** 0 of 97 convictions at 6%; no honest, lucky or rumor trader got an inquiry in 20 seeds. |
| Blind rumor-following EV at or below 0 after fees | **Fail.** +0.52% per trader-season (20 seeds × 8 traders; standard error about 0.08%). The engine's catalyst rumors are 55% accurate (`universeConfig`), and that edge survives the fees. Not changed here: a rumor price or fee change moves every world with rumors. Quant to decide. |
| Tip EV 0.8 to 1.2 × honest at 2 to 4 × variance | **Fail** at every tranche tested. Only the 2% tranche is in the EV band, and its variance is 0.6 ×. The 4% tranche is in the variance band with EV 1.7 ×. At 6% the 35%-of-NW S5 fine makes EV negative. |
| Conviction rate 40 to 65% on attributed ops (03 §16) | Pass at 6%, but only with the EV failing. At 4% there are no convictions. |

Why the EV band is missed (for Tape and Quant):

1. **The size factor is relative to the trader's own median.** A tip trade at the trader's usual size scores about 13 points (40 × 1/3), so three tranches never reach 60 for three game days. Detection is a cliff: 0 inquiries at 4%, 5 at 5%, 28 at 6%.
2. **The fine drives the EV.** A conviction costs 35% of a small book (the cap binds below about $285k of net worth). ROADMAP §2.5 flagged this already (a gentler first-offence rule for small books is Tape's call). Nothing here changes the scale.
3. **Tip trades are right-side by construction.** A tip is perfect information on one report, so a tip trader beats honest play whenever undetected. Detection has to be smooth to hold EV near honest. The current 60-for-three-days line is not smooth.

### 6C.4 Tuning

The harness default is the 4% tranche. The 6% run is the same code with `ECA_TRANCHE_MULT=1.5`. The regulator's constants are the spec values: `ECA` in `eca.ts`, and `TRIBUNAL_BAR` and `ECA_CAP_PCT` in `court.ts`. None was tuned to hit a gate. Only the trader's tranche size was swept.

### 6C.5 Deviations

1. **Rival-fund tips are not built.** The spec's "or a rival" needs a session target among rival funds. `plantSession` takes players only, and rival funds are reached by the crew and fund paths. Tips come from covered insiders of listed stocks only (the roster in `company/insiders.ts`).
2. **A tip is queued at a planted session, not at the session's progress.** The spec says "successful". The cyber model's success is a planted entry.
3. **Delivery waits for the report's surprise.** The engine draws it at the analyst preview, five game days before the report. A tip queued earlier is delivered at that preview; its claim is the sign of the surprise.
4. **Sells of a pre-existing position are flagged.** The spec says they are not. The engine keeps no lot history per tip, so a sell on a "down" claim is flagged whatever the position. Open.
5. **Disgorgement uses today's price.** It is the flagged trades' gain at the verdict day, not realised P&L.
6. **The device hash is an API, not a feed.** The engine has no device or IP. `registerDevice` takes a token from the server, and no client sends one yet.
7. **Mirror matching is exact-quantity, two ticks.** It is conservative. It has unit tests but no harness of its own.
8. **The group sell cap is split, not pooled.** Each member gets `floor(perDay / n)`, so the group total stays at or under the cap (the sum proves it), at the cost of a small rounding loss. The engine's per-account tally is unchanged.
9. **The ad cap is not wired.** `sponsor.ts` is on `p6/b`. `linkedAccounts` is exported for it.
10. **Refusals.** The IPO refusal (`ipoOwnerSet`) and the creator cap already say "linked accounts" and name nobody. The sell-cap refusal text is unchanged.
11. **The harness simplifies the market.** Reports every 12 game days, no listed company (the crime step is a pushed pending tip), and tip traders trade three tranches on consecutive days.

### 6C.6 Open items

- Failing gates, with owners: the rumor EV (Quant); the tip EV band and variance (Tape, with the small-book S5 rule); and the detection cliff (Tape: a smoother evidence function, or a size factor relative to the market rather than to the trader).
- The e2e spec (`tests/e2e/regulator.spec.ts`) seeds a tip and an inquiry through the admin routes and reads Messages and the Legal & Court app in English and French.
- `src/world/rivalCrews.test.ts` takes about 74 s on this machine, and one of its tests hit the 60 s default timeout during the full run under four-agent load. It passes alone (18 of 18). Not a regression from 6C; noted for the merge run.

### 6C.7 Screenshots

Desktop and phone, English and French, the tip card and the inquiry letter: `scratchpad/shots-p6c` (written by the e2e run when `REG_SHOTS_DIR` is set).
