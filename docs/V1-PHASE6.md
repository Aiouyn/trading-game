# V1 Phase 6: status

Scope: Phase 6 as set in `docs/team/specs/lead-phase6.md` (binding). This file holds section 6A (World events and rivals) and section 6B (Comeback and money). The other tracks (6C, 6D) add their own sections when they land.
Branch: `p6/a`, worktree `.claude/worktrees/p6-a`, from `v1` at `ae573f2`. Status date: 2026-10-11. Second pass: the adversarial review of `d69ade0` (16 findings), repaired in `b4ebe14`, `efaad30`, `afed1b8` and the commit that adds this text.
Status words as in `docs/V1-PHASE5.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**.

## 6A. World events and rivals

### 6A.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| Telegraph for a major (M39, at least 8 real hours) | **Done** | A crash or bubble is announced 8 to 16 real hours before onset. The lead is drawn from the seed in whole hours (8, 9 … 16), so the Wire time plus the window never gives the exact onset. Onsets stay on a day boundary, so the engine's own start path runs. | `src/engine/worldEvents.ts` (`drawLead`, `majorLeadDays`, `majorLeadMaxDays`) |
| Telegraph window, no onset, no length | **Done** | An announced event carries `windowHours`: the hours left, rounded up to an 8-hour band. The panel and the banner show it. Never the exact onset, never `endTick`. | `worldEventView`, `telegraphBand`; `EventBanner.tsx` |
| No-reveal before onset | **Done** | An announced major shows no kind and no headline (`kind`, `headline`, `headlineKey` are null). The calendar shows only an announced crisis week. The Wire's precursor lines are the telegraph and are unchanged. | `worldEventView`; `Calendar.tsx` |
| Takeover (major onset only, once per event) | **Done** | Hairline 300–900 ms, scrim to 70%, `WORLD EVENT` label, the engine's headline in the viewer's language, `GX … today` in mono, one line, See my positions and Close. Close is disabled before 1 s and live from 1 s; the takeover ends by itself at 3 s. It waits (at most 10 s) behind a rank-up or an open phone ticket. The card is solid ink-1 and fades in over 420 ms after its 900 ms start (it was a 1.5 s fade, so the card read translucent for about a second and the Wire text showed through). The headline and buttons sit on a solid surface in all four palettes. Reduced motion: static card, no desaturation. | `src/components/os/EventTakeover.tsx`, `takeoverRules.ts`, `os-events.css` |
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
| 9 | Takeover legibility | Solid 94% ink backing panel on the card | **Fixed** (`afed1b8`); **re-fixed in round 5**: the card is opaque ink-1 and its rise is 420 ms, not 1.5 s (the reviewer found the card still translucent mid-rise) |
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

Round 5 re-shots (scratchpad `shots-p6a2`, desktop and phone): the takeover at 0.35 s, 1.05 s and settled in all four palettes (ink-brass, broadsheet, phosphor, riviera), the banner panel, the Rivals board in en and fr, the profile card, and the fr bubble takeover. Still not taken: the crash on day 3 and the flash crash. The velvet spec's sign-off set (crash onset, crash day 3, bubble, flash) is therefore not complete. The phone takeover's card is legible, but the home-screen icons show faintly through the 94% panel.

## 6B. Comeback and money

Branch `p6/b`, worktree `.claude/worktrees/p6-b`. Specs: `docs/team/specs/lead-phase6.md` (6B), `velvet-bankruptcy.md` (M20), `velvet-rewarded-ads.md` (M48). Status date: 2026-10-11. The branch merges `v1` (6A) at `2fa5755`; the round-5 repairs are `959eb9f` and `26ec639`, and this status text is the commit after them.
Status words as in `docs/V1-PHASE5.md`.

### 6B.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| Low-cash card | **Done** | Shows under $1,000 net worth, or while a sponsor offer is open. Dismiss hides it for one real day. Rows: Fresh start (when available), Watch an ad for $250 (when offered), Keep trading. Top of Portfolio; under the chart on Market. | `src/components/comeback/LowCashCard.tsx` |
| Chapter screen | **Done** | Peak, End, Days; the three largest losses with the journal sentence; Kept and Goes; perk choice (Old contacts needs a business); a 1.2 s hold to confirm. | `ComebackScreens.tsx`, `src/world/comeback.ts` |
| New chapter | **Done** | A 2.4 s chapter-2 moment; the account resets to fresh money; rank and shell stay. | `ComebackScreens.tsx` |
| Forced close (bust) | **Done** | Equity below zero after a liquidation: the chapter screen opens with the clearing-house header. A bust inside the 8-week window keeps its debt (no fresh money, no write-off). | `comeback.ts` (`comebackRefresh`) |
| Fresh-start reset | **Done** | Positions sold reduce-only; open orders cancelled; businesses and property sold; lab models, compute, data, bots and research staff cleared (research kept); managed funds wound down; other fund units redeemed where the rules allow; Limited and Unique lifestyle items removed; cash swept (`chapter close`, a booked sink); $5,000 opened as fresh money (`fresh start`). A write-off inside the window comes out of the $5,000 (`bust discharge`). | `comeback.ts` (`closeStep`, `finishFreshStart`) |
| Founder stakes at a fresh start | **Done (defined outcomes)** | A private company the founder alone owns goes through the company failure path. A listed company's founder shares go to its market book at 70% of VWAP30. The book pays from its own cash; shares it cannot pay for pass to the book for no payment. Guarantees on the founder's company debts are called and settled once. | `src/world/company/stakes.ts` |
| Cooldown | **Done** | One fresh start per 8 real weeks (`CHAPTER_TICKS`, 56 real days), kept on the profile record. | `comeback.ts` |
| Perks | **Done** | Old contacts (one T1 business at 50% off, a voucher); Lessons learned (half the trading fees for 7 real days); Second wind (business income x1.25 for 7 real days). Reputation -10. | `comeback.ts`, `perks.ts` |
| Leverage and margin | **Done** | Leverage capped at 1x for 7 real days after a fresh start. Buys past cash and shorts refused for 14 real days (`comebackMarginRefusal`); reduce-only orders pass. | `comeback.ts`, `game.ts` |
| Restricted cash (C5) | **Done** | Ad cash and the $5,000 start money are held 72 real hours. One rule for solo and online (72 hours = 72 game days, since one game day is one real hour). Restricted cash cannot pay ops, insider actions, margin, derivatives or transfers. The pill reads AD or START. | `core.ts` (`restrictedNow`), `cyber.ts`, order gates |
| Sponsor breaks (M48, simulated) | **Done** | A 15 s card for a fictional brand. Skip after 5 s pays nothing; a full watch pays $250 of ad cash, booked as the `adCash` faucet. No ad network, no tracking. | `src/world/sponsor.ts`, shell host |
| Ad offer | **Done** | Offered when the account is a real day old, and day-start cash and net worth are both under $1,000. Cap: 10 per real day, counted per player and per profile (the larger of the two). | `sponsor.ts` (`adRefusal`) |
| Board value after a reset | **Done** | Boards rank a player by the larger of live net worth and the End of the last closed chapter (`boardNetWorth`). | `comeback.ts` |
| Copy | **Done** | en and fr keys in both files, identical key sets (3,456 each). Refusals in three parts. Amounts are formatted in the message. | `src/i18n/en.json`, `fr.json` |
| AD_GRANT alert | **Not built** | The economy dashboard alert for ad grants is not built. | — |
| Clawback lookback and debts to players | **Not built** | The online-phase clawback lookback and the "Owed to players" line on screen 3 are not built. | — |
| NPC bank-loan debts | **Not built** | No NPC bank loan exists in the engine. The margin block covers margin only. | — |
| Insider restriction | **Partial (6C)** | `adInsiderRefusal` and its test exist. The insider command is 6C and is not built. | — |

### 6B.2 Commits

| Commit | What |
|---|---|
| `89de4fe` | Engine: sponsor breaks, comeback (confirm, dismiss, bust, close, reset, view), perks, restriction hooks (cyber, social, order margin, option derivative), `view.comeback` |
| `50b09cb` | Review repairs: real-day cap and snapshot, offer on day-start cash and net worth, ad cash margin with reserved buys, spendable cash for settlements, bust write-off inside the window, lab and fund reset, boards on the closed End, stalled close abandoned after a real day, margin block after a fresh start, journal sentence on losses |
| `2fa5755` | Merge of `v1` (Phase 6A) into `p6/b` |
| `959eb9f` | Founder stakes (`stakes.ts`), the once-only guarantee call, the listed short-book outcome, the stake and guarantee copy, the comeback e2e |
| `26ec639` | 6A polish: the takeover card opaque sooner, the Rivals profile padding and copy, the worldEvents Close race |

### 6B.3 Review repair (round 5)

The reviewer's findings on the uncommitted round-4 state, and what changed.

| # | Finding | Repair | Status |
|---|---|---|---|
| 1 | Steps 2 and 3 not committed | Committed as `959eb9f` and `26ec639`; the tree is clean after this commit | **Fixed** |
| 2 | Comeback e2e not green (`ECONNRESET` on the admin advance) | Two runs. The first run failed on a strict locator (the low-cash card mounts twice on desktop) and a `fetch failed`. The second run (`r5-e2e-b`): comeback green on desktop and phone, en and fr; worldEvents green on phone; the broker-adjacent specs (trading-tools, orders, no-leak, polish) green. The `ECONNRESET` did not recur. Its cause is not diagnosed: a fresh world advanced 721 ticks in one request with a 200 when tested alone. | **Fixed for these runs**; the cause is not known |
| 3 | Listed founder sale paid nothing on a fresh listing (book cash 0) | The book pays what it has; the shares it cannot pay for pass to the book with no payment. `tenderOffer` is not used: it settles every holder at one price at or above 1.2 x VWAP30 and delists the company, so it cannot price a 70% block. Tests: unfunded book (zero proceeds, all shares pass, money conserved), funded book (proceeds = stake x 70% VWAP30, money conserved), partial book (half sold, the rest passes). | **Fixed** (decision recorded in 6B.5) |
| 4 | Guarantee call booked personal debt twice | Each call is settled once: the paid part is applied, the unpaid part is booked as personal debt once, and the guarantee is discharged. A test calls twice and checks one booking. The company-level guarantee's paid part goes to company cash (a capital injection, as the ruling reads). | **Fixed** (the ruling wording is recorded in 6B.5 for the lead to confirm) |
| 5 | No screenshots | Taken: `shots-p6b` (en and fr, desktop and phone: low-cash card, sponsor break at 0 s, 5 s and done, ad pill, chapter screen, new chapter); `shots-p6a2` (takeover at 0.35 s, 1.05 s and settled in four palettes, desktop and phone; banner panel; Rivals board en and fr; profile card en and fr; the fr bubble takeover) | **Fixed** |
| 6 | No 6B section | This section | **Fixed** |
| 7 | Stray vertical line | The probe (`shots-p6a2/*-takeover-probe.json`) finds one 1 px element in the takeover: `os-takeover-line`, at x = 720 of 1440 (x = 195 of 390), at most 342 px (38vh) tall, opacity 0 once settled. No full-height line is found. The desk's own 1 px edges (x = 38 and x = 754 on desktop) are present before the event. See 6B.5 deviation 3. | **Partly fixed**: the card no longer reads translucent; the hairline is kept per the spec; not removed |
| 8 | Takeover backing translucent | The card was fading in over 1.5 s from opacity 0, so for about a second the Wire text showed through. It is now a 420 ms rise and the card is solid `ink-1`. The probe reads `cardOpacity` 1 and an opaque background in ink-brass, phosphor and riviera; broadsheet's card had ended at the probe frame, and its shots are checked by eye. | **Fixed** |
| 9 | Rivals copy plural bug | The profile shows two number rows, "Days ahead of you" and "Days behind you". No plural. The padding is the card's `p-4`, as the other cards. The empty chart state (fewer than two points) reads "No history yet. The chart fills in as days close." | **Fixed** |
| 10 | Sponsor cap per real day, not per game day | Kept. See 6B.5 deviation 1. | **Decided** (lead sign-off requested) |
| 11 | Not built items | Listed in 6B.1 | **Documented** |
| 12 | Raw numbers and "NPC book" in copy | Amounts are formatted before they reach the message; "NPC book" is gone from player copy (`comeback.stake.sold`, `comeback.stake.unpaid`, `comeback.guarantee.called`) | **Fixed** |

### 6B.4 Gates

- `npx next typegen` and `npx tsc --noEmit`: exit 0 on the final tree.
- ESLint on the touched files (`stakes.ts`, `stakes.test.ts`, `comeback.ts`, `RivalsCard.tsx`, `components/comeback`, `Portfolio.tsx`, `comeback.spec.ts`, `worldEvents.spec.ts`): **0 errors**.
- Vitest, the broad run (`src/engine src/world src/components src/game src/i18n src/shell src/content`, `--maxWorkers=2`) on the final tree: **193 files passed, 2 skipped; 1,893 tests passed, 70 skipped, 21 todo.**
- The i18n test (`src/i18n/i18n.test.ts`) passes: the variables of each key match in en and fr. Key sets: 3,456 each, identical.
- e2e (`--no-deps --workers=1`, the webpack build, ports 3262 and 8859): `r5-e2e-b`: **36 passed, 12 skipped** (11 on phone: the keyboard and shell order specs and the no-leak checks L1, L2, L5 and L6; 1 on desktop: no-leak L6; each is the spec's own device guard). The runs cover `comeback.spec.ts` (desktop, phone), `worldEvents.spec.ts` (desktop, phone), `trading-tools`, `orders`, `no-leak`, `polish`. The `--workers=1` is needed: the close projects advance one shared world.
- Money identity: `stakes.test.ts` checks the total money before and after each sale and each call (book, founder, company, bank pool); the broad run includes the zero-sum tests in `src/world/company/exploits/zerosum.test.ts`.
- Determinism: a world with no comeback, no stake and no sponsor card runs no new code. The new fields are optional (`Player.comeback`, `Player.adLots`, `Player.adDay`, `Player.rivalBase`, `Company.guarantee`), so old saves load. The sponsor brand is drawn from `keyedRng` per player and sequence number.

### 6B.5 Deviations and decisions

1. **The sponsor cap is per real day, not per game day.** The lead's line reads "at most 10 a game day". One game day is one real hour (720 ticks), so ten a game day is $60,000 a real day from a fifteen-second card. The cap is per real day (24 real hours, 24 game days), which gives $2,500 a real day (ROADMAP 2.7), as `sponsor.ts` documents. The day-start snapshot follows the same day. **Lead sign-off requested.**
2. **The listed founder block is not the engine tender.** `tenderOffer` refuses below 1.2 x VWAP30 and delists the company, so it cannot price a 70% block. The block is a direct transfer to the market book, capped by the book's cash, with the short-book outcome in 6B.1. A listing opens its book with no cash (`ipo.ts`); this was not changed, since it would move the IPO economy and the fingerprints.
3. **The takeover hairline is kept.** It is the spec's hairline (300–900 ms, the only fall in the game). The probe shows it at most 38vh tall and invisible once settled; the "whole screen" line was not reproduced. If the lead wants it gone, the change is one element in `EventTakeover.tsx`.
4. **The company-level guarantee pays into company cash.** The lead's ruling says the company-level guarantee pays the company's cash. Its paid part is a capital injection into the company (`c.cash`), and it reduces no debt. The failure path sends the same money to the estate. **Lead to confirm the wording.**
5. **A short book is a defined outcome.** The founder's stake does not stall the close, and a busted founder keeps no stake. Shares the book cannot pay for pass with no payment. The alternative (the shares stay locked and the close stalls) would leave a busted player with no way to start over.
6. **The ECONNRESET of the first run is not diagnosed.** It did not recur in the second run; the cause is recorded as unknown, not as fixed.

### 6B.6 Open items

- The AD_GRANT alert, the clawback lookback, debts to players and the "Owed to players" line, the NPC bank-loan debts, and the 6C insider command (6B.1).
- The lead's sign-off on deviations 1 and 4.
- The `ECONNRESET` cause (6B.5, 6).

### 6B.7 Screenshots

Written to the session scratchpad. Each frame at 1440 × 900 (`desktop-`) and 390 × 844 (`phone-`):

| Frame | en | fr |
|---|---|---|
| Low-cash card | `shots-p6b/…-en-1-lowcash-card.png` | `…-fr-1-lowcash-card.png` |
| Sponsor break at 0 s, 5 s, done | `…-en-2a`, `2b`, `2c` | `…-fr-2a`, `2b`, `2c` |
| Ad pill (AD) | `…-en-3-ad-pill.png` | — |
| Chapter screen | `…-en-4-chapter-screen.png` | `…-fr-3-chapter-screen.png` |
| New chapter | `…-en-5-new-chapter.png` | `…-fr-4-new-chapter.png` |
| Takeover at 0.35 s, 1.05 s, settled (ink-brass, broadsheet, phosphor, riviera; desktop and phone) | `shots-p6a2/…-takeover-*.png` | — |
| Banner, event panel | `shots-p6a2/…-en-banner-panel.png` | — |
| Rivals board and profile card | `shots-p6a2/…-en-rivals-board.png`, `…-en-rivals-profile-card.png` | `…-fr-rivals-board.png` |
| Bubble takeover, settled | — | `shots-p6a2/…-fr-takeover-bubble.png` |

## 6C. Security, law and anti-cheat

Scope: track 6C of `docs/team/specs/lead-phase6.md` (binding): insider tips from crime (M16 v1, `specs/quant-rumors.md`), the ECA market regulator (M16 v2, ROADMAP §2.5, 03 §10.2), and the collusion graph (Phase 4 O-5). Branch `p6/c`, worktree `.claude/worktrees/p6-c`, from `v1` at `26c2d98`. Status date: 2026-10-11. Status words as in 6A.

**Result in one paragraph.** The engine repairs and the review items are done (6C.4). The harness gates are **not met** (6C.3): the tip EV band (1.89 at the default), the tip variance band (14 at the default), the conviction band at the tribunal (5 of 5 convicted at the default) and the blind rumor gate (+0.55% per trader-season, about seven standard errors above zero). The wrongful-conviction gate is met (0 of 5), but the harness never takes a non-tip account to the tribunal, so that pass is weak (6C.3). The cause is the S5 schedule for small books and the rumor accuracy, both of which are decisions for Tape and Quant (6C.6). None of the regulator's constants was changed to hit a gate.

### 6C.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| Insider tips from crime (M16 v1) | **Done** | A planted session on a covered insider of a listed stock, or on a rival fund, queues a tip for the attacker. The tip is delivered privately once the report's surprise is locked (the analyst preview, at most five game days before the report). The claim is the sign of that surprise, so it is always true. The rival tip concerns one listed stock whose report is ahead, picked by a keyed draw. | `src/world/tips.ts` (`queueInsiderTip`, `queueRivalTip`, `tipsDay`); `cyber.ts` (plantSession); `rivalCrews.ts` (attackFund) |
| Tip flags on every trading route | **Done** | A trade on a tip is flagged when placed on: a manual order, a reduce-only close, a fund the player manages, and a lab model order. One helper scores all four. | `src/world/eca.ts` (`noteOrderPlaced`); `game.ts` (order.place, position.close); `funds/trade.ts`; `lab.ts` |
| Pre-tip position is not flagged | **Done** | The part of a trade that reduces a position the player held before the tip (a long for a "down" claim, a short for an "up" claim) is not flagged. The position is the controlled shares: the player's account plus a managed fund. | `tips.ts` (`heldAtTip`, `controlledQty`, `flagTipTrade`) |
| Tip item in Messages | **Done** | Inbox kind `tip`: a NON-PUBLIC card with the claim, the ticker and the days to the report. No outcome. | `tips.ts` (`say`); `inbox.kind.tip` in `en.json` and `fr.json` |
| ECA surveillance score | **Done** | Per account and asset, folded at the day close as `score = min(100, 0.8 × previous + points)`. Points come from the company insider record (Phase 4), from tip flags (40 × size factor, see 6C.5), and from pre-announcement trading (a right-side fill within two game days before a report that moves the stock by at least 3%: 40 × size factor × timing factor). | `src/world/eca.ts` |
| Fund fills count for their manager (pre-announcement) | **Done** | A fund's fill counts for its manager only when it is a manager order. Forced wind-down sales do not count. | `eca.ts` (`ecaFills`) |
| ECA inquiry and investigation | **Done** | An inquiry opens after three day closes at 60 or more. It becomes an investigation at 80, or at 60 when the account received a tip on the asset. An investigation adds 5 evidence a day while the score stays at 60 or more, and the tip trail gives 30 evidence on half the investigation days for an account that received a tip. An investigation or inquiry that stays under 60 for five game days closes quietly, and the pair cannot reopen for 20 game days. | `eca.ts` (`ecaDay`) |
| Tribunal-lite and S5 fines | **Done** | At 55 evidence, `regulatorVerdict` decides on `σ((E − 55)/12)` with a keyed draw. A conviction is S5 (8% of net worth, $100k floor, at most 35% of net worth), with the cash floor: the fine and the disgorgement come from cash above $5,000. A repeat conviction in the same season is ×1.5 per prior conviction (at most ×2.5). All fines of an account in a season are at most 60% of its peak net worth. Both amounts are sinks. Disgorgement is at today's price (not done, see 6C.5). | `court.ts` (`regulatorVerdict`, `ECA_REPEAT_X`, `ECA_REPEAT_MAX`); `eca.ts` (season ledger) |
| ECA letters | **Done** | Notice, investigation letter and verdict, each in three parts (what happened, why, what to do), in `en.json` and `fr.json`. The Legal & Court app shows the player's own inquiries and letters. The view carries the stage and the letters only, never the score, the evidence, the tip trail or the flags. | `eca.ts` (`letter`, `ecaViewOf`); `view.ts` (`regulator`); `components/apps/legal/LegalApp.tsx` |
| Collusion graph | **Done** | Owner groups are the transitive closure of: alliances; a registration device (the browser's random id, hashed on the server and again in the engine, never shown); two or more completed gifts between a pair (`recordGift`); and mirrored fills (same asset, side and quantity within two ticks; at least eight matches covering at least 60% of the smaller account's fills). A pair that is quiet for ten game days and is not linked is pruned each game day. | `src/world/collusion.ts`; `server/index.ts` (register); `src/net/client.ts` (`deviceId`) |
| `linkedAccounts(g, pid)` | **Done** for IPO, creator cap and founder cap; **Not wired** for the ad cap | The API for the consumers: the IPO order check and the IPO view (`company/ipo.ts`, `exchange/view.ts`), the Launchpad creator cap (`launchpad/state.ts`), and the founder sell cap. The ad cap needs `sponsor.ts`, which is on `p6/b` (6C.5). | `collusion.ts` |
| Founder sell cap on linked accounts (closes O-7a) | **Done** | Each member of the founder's group gets `floor(perDay / group size)` of the listed stock's daily cap, so the group sells at most the cap together. A group of one keeps the full cap. It is re-set every game day. | `company/bridge.ts` (`syncFounderCaps`); `collusion.ts` (`syncGroupSellCap`) |
| Admin seeds for e2e | **Done** | `admin.tip` and `admin.inquiry`, behind `ADMIN_TOKEN`. They run the game's delivery and notice code on a chosen stock. | `game.ts`; `tips.ts` (`adminSeedTip`); `eca.ts` (`adminSeedInquiry`); `server/index.ts` |
| Harness | **Done** (arms and sensitivity knob); gates **Not met** | `scripts/eca-harness.ts` runs the real engine with five arms (honest, heavy, lucky, tip, rumor). It reports per arm the inquiries, tribunal cases, convictions, wrongful convictions and fines, and the gates. | `scripts/eca-harness.ts` |

### 6C.2 Commits

| Commit | What |
|---|---|
| `554d2fe` | First pass: engine, letters, UI, unit tests, harness. |
| `c5977f7` | Inquiry closure, admin seeds, e2e spec, first 6C section. |
| `e68d7e5` | Review repair (engine, copy, device id, unit tests): the cash floor, every trading route, the pre-tip rule, rival tips, the device link, the IPO view, investigation closure, mirror prune, copy. |
| this commit | Harness arms, the S5 floor sensitivity knob, the review table, this section. |

### 6C.3 Gates

Harness: `npx tsx scripts/eca-harness.ts --seeds 20 --days 60 --out <dir>` (seeds `eca-h0` to `eca-h19`, eight traders per arm, 60 game days, about ten minutes). Arms: **honest** (follows the public consensus on half the days, 4% of net worth a trade); **heavy** (the same at three times the size, on most days); **lucky** (random side and size); **tip** (honest's trading, plus a successful session on an insider every ten game days; the tip is traded in three tranches a day at 4% of net worth, ±50%); **rumor** (follows the engine's public rumor on each report). The crime step is shortcut (the pending tip that `queueInsiderTip` would push); everything after it is the real code. Wrongful = a conviction on an account that never received a tip on that asset.

| Gate (lead-phase6 6C, 03 §16, quant-rumors) | Result | Numbers (default, 20 seeds) |
|---|---|---|
| Wrongful convictions under 3% | **Met, weakly** | 0 of 5 convictions. No honest, heavy or lucky account got an inquiry in any configuration, so no non-tip account reached the bar. The pass says nothing about a pattern-only trader at 55 evidence (see 6C.5, item 14). |
| Blind rumor-following EV at or below 0 after fees | **Not met** | +0.55% per trader-season (160 traders, sd 0.99, standard error 0.08). About seven standard errors above zero, and the same in every configuration. Owner: Quant (6C.6). |
| Tip EV 0.8 to 1.2 × honest | **Not met** | 1.89 (default). Between 1.74 and 2.48 across the sweep. |
| Tip variance 2 to 4 × honest | **Not met** at the default (14.0). Met at 2% tranches (2.2), with no conviction and an EV ratio of 1.74. | |
| Conviction rate at the tribunal 40 to 65% (03 §16) | **Not met** | 5 of 5 at the default; 2 of 2 at 2% tranches with crime every five game days. The tip trail (+30 on half the investigation days) takes evidence past 55 within about two days on average, so the verdict is drawn above the bar. The harness does not record the evidence at the verdict. |

**Sweep** (the same harness, 20 seeds each; the JSON for each run is in the scratchpad `p6/h8`):

| Config | Tip EV / honest | Tip var / honest | Tip inquiries | Tribunal | Convicted | Wrongful | Honest mean | Tip mean | Rumor mean | Fines (sum) |
|---|---|---|---|---|---|---|---|---|---|---|
| Default: 4% tranches, crime every 10 gd | 1.89 | 14.0 | 14 | 5 | 5 | 0 of 5 | 1.54% | 2.91% | 0.55% | 44,541 |
| 2% tranches (`ECA_TIP_MULT=0.5`), crime every 10 gd | 1.74 | 2.2 | 2 | 0 | 0 | 0 of 0 | 1.54% | 2.67% | 0.55% | 0 |
| 2% tranches, crime every 5 gd (`ECA_CRIME_DAYS=5`) | 2.48 | 7.0 | 5 | 2 | 2 | 0 of 2 | 1.34% | 3.32% | 0.61% | 15,922 |
| Default, S5 $100k floor removed (sensitivity, `ECA_FLOOR0=1`) | 2.45 | 5.7 | 14 | 5 | 5 | 0 of 5 | 1.54% | 3.77% | 0.55% | 10,181 |
| 2% tranches, S5 floor removed (sensitivity) | 1.74 | 2.2 | 2 | 0 | 0 | 0 of 0 | 1.54% | 2.67% | 0.55% | 0 |

Why the bands do not all pass under the spec as written:

1. **Small-book S5.** Each conviction costs 35% of net worth for any book under about $285k (the $100k floor, capped at 35%). The variance band needs convictions to stay rare, and the EV band needs them frequent enough to take back the tip edge. The gross edge of a tip trader over honest play is about 2.8% of starting net worth per season at the default (the net gap of 1.4% plus the 1.4% paid in fines). ROADMAP 2.5 already flags this for Tape.
2. **The floor is not the only lever.** Removing the $100k floor (sensitivity only) lowers each fine to 8% of net worth: the variance ratio falls to 5.7, but the EV ratio rises to 2.45, because less is taken per conviction. Detection is the binding lever, and the spec fixes its inputs: 40 points × size factor per flagged trade (the size factor is against the player's median trade, 03 and ROADMAP 2.5), and the 60-for-three-days inquiry line.
3. **Detection is thin.** At the default, the 160 tip traders open 14 inquiries in the season and 5 reach the tribunal (0.5% of the 960 tips delivered). A tip tranche at the median trade scores about 13 points, so only tranches well above a trader's usual size are caught.

The harness knobs that were varied are the tranche size (`ECA_TIP_MULT`), the crime frequency (`ECA_CRIME_DAYS`) and the sensitivity floor (`ECA_FLOOR0`). The regulator's own constants (`ECA`, `TRIBUNAL_BAR`, `ECA_CAP_PCT`, `TIP_FLAG_POINTS`, `SIZE_CAP_MULT`) are the spec values and were not changed to hit a gate. The harness defaults are the spec-consistent defaults (4% tranches, crime every 10 game days).

### 6C.4 Review repair (second pass, `c5977f7`)

| # | Review item | Status | What was done |
|---|---|---|---|
| 1 | Lead gates not met | **Not met, escalated** | Measured, not tuned to pass (6C.3). Owners in 6C.6. |
| 2 | ECA fine and disgorgement ignore the $5k floor | **Done** | `regulatorVerdict` takes both from cash above $5,000 (test: cash 6,000, net worth 80,000, the debit stays at or above the floor). |
| 3 | Tip flags bypassable (fund, reduce-only, lab) | **Done** | One helper, `noteOrderPlaced`, on every route. A manager's fund trade flags the manager (test). Lab and reduce-only use the same helper. |
| 4 | Sell of a pre-tip position flagged | **Done** | `heldAtTip` snapshot at delivery; the exempt part is the pre-tip position (tests for both claim sides). |
| 5 | Link sources missing (device, rival tips, ad cap) | **Done, except the ad cap** | The device is a random browser id sent at sign-up, hashed by the server, passed in `join` (test through `applyCommand`). Rival tips: `queueRivalTip` (test). The ad cap needs `sponsor.ts` from `p6/b` (6C.5, item 9). |
| 6 | IPO view uses alliance-only links | **Done** | `ipoBlock` uses `isLinkedAccount`, the same check as `orderIpo`. |
| 7 | Wrongful gate passes vacuously | **Partly** | The harness reports counts per arm and defines wrongful as a conviction with no tip. No non-tip arm reaches the bar, so the gate remains weakly tested (6C.3). Not fixed: adding an arm that reaches 55 with no tip is a Tape decision about pattern-only traders. |
| 8 | "Cleared" copy contradicts the bar | **Done** | The copy now says the tribunal heard the file and did not convict. |
| 9 | Missing ×1.5 repeat and 60% season cap | **Done** | Tests for the repeat factor and the season room. |
| 10 | Investigations never close | **Done** | Five quiet game days close an investigation. A stranded open inquiry (score removed from the map) now closes (test). |
| 11 | Disgorgement at today's price | **Not done** | Needs lot accounting. Disclosed in 6C.5, item 5. |
| 12 | Mirror false positives untested; prune; cost | **Done, except cost** | A busy-market test (30 accounts, random sides and sizes) links nobody. Quiet unlinked pairs are pruned daily (test). `groupRoots` is not cached; its cost is linear in players and mirror pairs, and it was not measured at scale. |
| 13 | IPO owner copy | **Done** | "The founder and any linked account are kept out of the book." |
| 14 | French colon | **Done** | `legal.eca.colon` is a no-break space and a colon in French. |
| 15 | French tip shots say 46 days | **Explained** | The admin seed delivers the tip now, so the shot shows 46 game days to the report. Production delivers at most five game days before a report. The shot is a seed artifact. |
| 16 | Doc numbers disagree (28 vs 135) | **Done** | Every number in this section is from a saved harness JSON (6C.3). |

### 6C.5 Deviations

1. **Rival-fund tips are built** (resolved from the first pass). A planted session on a rival fund queues a tip about one listed stock whose report is ahead, not about the rival's own holdings. The pick is keyed on the attacker, the fund and the tick.
2. **A tip is queued at a planted session, not at the session's progress.** Unchanged.
3. **Delivery waits for the report's surprise.** Unchanged: the engine draws it at the analyst preview, five game days before the report.
4. **A sell of a pre-tip position is not flagged** (resolved from the first pass; it matches quant-rumors). The "down" rule exempts the shares the player held at delivery; the "up" rule is the mirror case for a short.
5. **Disgorgement uses today's price.** It is the flagged trades' gain at the verdict day, not realised P&L. A flagged round trip that reverses later discloses nothing. Open: needs lot accounting per tip flag.
6. **The device link uses a browser id, not the IP.** The client sends a random 16-byte id kept in localStorage at sign-up. The server hashes it, and the engine hashes it again. The IP is not used: shared networks would link unrelated households, and every e2e run from localhost would link to every other. Risk: accounts that share a browser profile are linked (the spec's intent).
7. **Tip flag points carry the size factor but not the ROADMAP timing factor.** ROADMAP 2.5's insider points multiply by a timing factor (1 within a day, 0.5 at one to two days). A tip is known in advance, so applying it to tip trades would let a tip trader place orders three to five days before a report and score nothing. The pattern points (no tip) keep the timing factor.
8. **Mirror matching is exact-quantity, two ticks.** It is conservative. The busy-market test passes, and the map is pruned daily.
9. **The ad cap is not wired.** `sponsor.ts` is on `p6/b`. `linkedAccounts` is exported for it, and the merge wires it.
10. **Refusals say "linked account" and name nobody.** IPO (`ipoOwnerSet`, copy updated), creator cap and founder cap (unchanged).
11. **The group sell cap is split, not pooled.** Each member gets `floor(perDay / n)`, so the group total stays within the cap.
12. **The harness simplifies the market.** Reports every 12 game days (production 63), no listed company (the crime step is a pushed pending tip), and tranches on consecutive days.
13. **The S5 floor and cap are kept as specified.** A small-book rule is Tape's (ROADMAP 2.5), and the sensitivity run in 6C.3 shows what it would do.
14. **A non-tip account can reach the tribunal, which the harness does not test.** The spec allows a pattern-only investigation at 80, with +5 evidence a day while the score stays at 60 or more; from an inquiry's 10 to 20 evidence that is about seven to nine game days at 60 or more. The harness does not produce that case, so the wrongful gate passes without testing it.

### 6C.6 Open items (owners)

- **Tape: the small-book S5 rule** (ROADMAP 2.5). Without it the tip EV and variance bands cannot both pass (6C.3, reason 1). The sensitivity run shows removing the floor is not enough on its own (reason 2).
- **Tape: the tribunal evidence overshoot.** The tip trail is +30 on half the investigation days, so the verdict is drawn above the bar and the conviction rate sits near the top of the band or above it.
- **Tape: detection of tips** (reason 3). The 60-for-three-days line detects about 0.5% of tips at the default. A smoother function, or a size factor against the market, is a Tape decision.
- **Quant: the blind rumor edge.** +0.55% per trader-season with 55% accuracy (quant-rumors acceptance). The commission is 0.10% a side plus spread, and the edge is above it. A rumor accuracy, price-effect or fee change moves every world with rumors, so it is not a 6C change.
- **p6/b: wire the ad cap** to `linkedAccounts` when `sponsor.ts` merges.
- **Disgorgement at realised P&L** (6C.5, item 5): needs per-flag lot accounting.
- **`rivalCrews.test.ts`** takes about 74 seconds on this machine and one test has hit the 60-second default under four-agent load. It passes alone. Not a 6C regression.

### 6C.7 Tests, gates and screenshots

- Unit tests: `src/world/tips.test.ts` (pre-tip rule both sides, rival tip, earlier tests), `src/world/eca.test.ts` (13: cash floor, repeat, season room, stalled investigation, stranded inquiry, earlier tests), `src/world/collusion.test.ts` (busy market, device through `join`, prune, earlier tests), `src/world/funds/funds.test.ts` (a manager's fund trade flags the manager).
- `npx tsc --noEmit` exit 0 (after `npx next typegen`). Eslint on the touched files: 0 errors. en and fr key sets match (3372 each).
- Vitest on the touched areas (exchange, launchpad, company, funds, cyber, lab, rival crews, honeypots, world, players, net): 70 files, 711 tests, pass. Full suite on the final tree (`npx vitest run --maxWorkers=2`): 204 files and 2021 tests pass, 70 skipped, 21 todo, exit 0.
- e2e: `tests/e2e/regulator.spec.ts` passes on desktop and phone (an insider tip as a NON-PUBLIC card, and an inquiry letter in three parts, in English and French). `exchangeIpo.spec.ts` and `exchangeFunds.spec.ts` are in the close chain, and each close project depends on every desktop and phone project, so they cannot run alone. Run with `--no-deps` (`--project=close-funds --project=close-ipo` and the phone pair), three of four fail on `0fdbb25` and all four fail on the pre-repair commit `c5977f7` with the same tests: the IPO book is not open and the holding value is off. The failures come from the missing chain, not from 6C. The chain runs at the merge step, and it is not run in this pass.
- Screenshots: `REG_SHOTS_DIR` writes the desktop and phone shots in English and French to the scratchpad `shots-p6c` folder. The French tip shot shows 46 game days to the report: a seed artifact (6C.4, item 15). The desktop Legal window overlapping Settings is normal stacking.
