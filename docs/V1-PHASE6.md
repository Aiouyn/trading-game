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

## 6D. Competitions and lifestyle

Branch `p6/d`, worktree `.claude/worktrees/p6-d`, from `v1` at `26c2d98`; first pass at `45aa4cc`, repaired here after the adversarial review of `45aa4cc`. Spec: `docs/team/specs/lead-phase6.md` (track 6D), with ROADMAP §2.4 (tournament) and N8, `docs/team/vision/04-experience-lifestyle.md` and `01-markets-economy.md`. Status words as in `docs/V1-PHASE5.md`. Each commit passed `npx tsc --noEmit`, eslint with 0 errors on the touched files, and the vitest suites of the touched areas.

### 6D.1 Review findings and repairs

| # | Finding (review of `45aa4cc`) | Repair | Where | Test |
|---|---|---|---|---|
| 1 | Insurance 24 h lockout bypassed by a session cut within one game day | `breachedAt` is stamped when a hostile entry is created (`newEntry`) and when a session ends (`endSession`), as well as in the daily pass. The probe is a test now: open, refuse, `sec.disconnect`, tick +60, refuse with `insLockout`, then accept after 24 h. | `cyber.ts`, `insurance.ts` (`1531963`) | `insurance.test.ts` (probe) |
| 2 | Auction no-reveal: a first bid below the opening price returned the reserve within a cent; refused bids persisted the lot | `placeBid` checks every rule before writing the lot. The opening bid is 50% of the collectibles index, and the reserve is index × a hidden factor in [0.8, 1.1) drawn per lot from the seed, so the public opening bid does not give the reserve away. A refusal carries only the public minimum. | `auctions.ts` (`d9e111a`) | `auctions.test.ts` (no-reveal block) |
| 3 | Insurance had no loss sources | `lossDay` (securityDay) rolls once per game day: hack drain (a share of net worth per open hostile session, scaled by strength), shop fire (30% of the sale value), shop theft (15%), collectible theft (one owned good). Each cash loss is a booked sink; the claim is a transfer from `npc:insurer`. The collectible theft is an asset loss, so it books no sink. | `insurance.ts` (`1531963`) | `insurance.test.ts` (loss sources, determinism, money identity) |
| 4 | Tournament settlement not wired (no job, no worker, no trigger) | `server/tournamentJob.ts` checks every 60 ticks; a due week (locked, unsettled) runs in a child process, `scripts/tournament-run.ts` (forked with tsx), off the tick loop; the rows come back as a logged `tournament.settle` command. One run at a time; a failed run waits ten real minutes. A restart re-detects every unsettled due week. | `server/index.ts`, `server/tournamentJob.ts`, `scripts/tournament-run.ts` (`72e133a`) | `scripts/tournament-run.test.ts` (forked child = in-process rows) |
| 5 | Trade-log opt-in (N8) absent | Opt-in at entry (`tournament.enter` with `publishLog`), frozen on the entry. At settlement the runner keeps one seed's trade log for each top-three entry that opted in, and the settlement refuses a log for anyone else (`tnLogOptOut`) or outside the top three (`tnLogTop`). | `tournament.ts`, `tournamentWeek.ts` (`72e133a`) | `tournamentWeek.test.ts` (N8 block) |
| 6 | No UI and no e2e for any track | Components for the insurance switch (Security), the streak card and the auction tab (Boutique), the tournament card (AI Lab) and the stress panel (Portfolio). Views carried on the player view (`sixd.ts`). Playwright specs for insurance, streak, stress (`sixd.spec.ts`) and an auction bid (`sixdAuction.spec.ts`, in the close chain). The home room and the collection page are not built (6D.5). | `src/components/apps/sixd/*`, `src/world/sixd.ts`, `tests/e2e/sixd*.spec.ts` | see 6D.4 |
| 7 | Copy not i18n: English literals in every refusal; the tournament settlement line had no key | Every 6D refusal is a code with its numbers in `data`; each code has `sixd.refuse.<code>.what|why|do` in en and fr. Notification lines are `msg` keys (`loss.*`, `tournament.in`, `tournament.out.drawdown|trades`). | `src/i18n/en.json`, `fr.json` (`0aa54e9`) | `i18n.test.ts` (key sets, literal `t()` keys) |

### 6D.2 Non-blocking findings

| # | Finding | Repair |
|---|---|---|
| 8 | The 10% deductible was dead: 80% of the loss always bound | The deductible is an excess of 10% of the insured value per claim (see 6D.5 Deviations). A loss under the excess pays nothing. |
| 9 | Privacy: an owned unique lot showed as withdrawn, and the bid refusal said "already owned" | Neither remains. A unique lot someone holds settles as "did not sell", the same as an unmet reserve. |
| 10 | Streak rewards had no cosmetics | Milestones at 3, 7 and 14 days record a palette accent (`phosphor`, `riviera`, `broadsheet`) on the streak. The shell's palette picker is not yet gated on them (6D.6). |
| 11 | The consignor's share was destroyed | The hammer less the 12% fee is a transfer to the fictional `npc:consignor` account. Only the fee and the 15% premium are sinks. The resale faucet still pays the item's paid price × the index (disclosed, not changed). |
| 12 | Doc and code mismatches | Fixed in the module headers: seeds derive from the world seed and the week; an entry's actor is captured at entry. |

### 6D.3 Track status

| Track | Status | What | Where |
|---|---|---|---|
| Tournament core | **Done** | Isolated runs of 30 game days from $1,000,000 against three seeds. Score: median annualised Sharpe. Disqualified on a drawdown over 40% or fewer than 20 trades in any seed. Five house AIs. | `src/world/tournament.ts` |
| Lifecycle, reveal | **Done** | Week w is entered during week w-1 and locks at tick w × 120,960. Seeds from the world seed and the week; the commitment shows from the open; seeds are revealed at settlement and checked against it. Settlement is a logged command. | `tournamentWeek.ts` |
| Settlement job | **Done** | See 6D.1 row 4. | `server/tournamentJob.ts` |
| Benchmark | **Measured** | A 30-day isolated run takes **8.2 s** on the dev machine, unloaded (one house actor, twelve assets). The per-tick sha256 noise draw is about 9% of it (67 ms of 757 ms for two days); the engine step is most of the cost. The review's 9.6 min figure was a loaded-machine figure. A field of N entries costs (N+5) × 3 × 8 s on one core, about two minutes for ten entries. | `tournament.ts` header |
| Trade log (N8) | **Done** | See 6D.1 row 5. The log is kept for one seed, only for a top-three opt-in, and is counted (not shown) on the board. | `tournament.ts`, `tournamentWeek.ts` |
| Board UI | **Done** | Entry with an opt-in checkbox, the commitment, entries, the last settled board, and the count of published logs. The trades themselves are not shown. | `src/components/apps/sixd/TournamentCard.tsx` (AI Lab) |
| Auctions | **Done** | 3 to 5 limited or unique collectibles per real week, one English auction over 720 ticks (one real hour); a bid in the last 24 ticks extends the lot by 24. Minimum raise 2%. No state until the first bid. Seller fee 12% and buyer premium 15% are sinks. | `src/world/auctions.ts` |
| Auction UI | **Done** | The Boutique's Auctions tab: lots, high bid, count, minimum, reserve met or not, and a bid form. The bidders appear only at the end. | `src/components/apps/sixd/AuctionsPanel.tsx` |
| Streak | **Done** | Real day = 24 game days. Login and one action per day (the action is recorded after each successful player command). Cash = 100 × rank index × min(days, 7) / 7, booked as a faucet. Milestones at 3, 7, 14, 30 days. One rest day a week keeps half the streak. | `src/world/streak.ts` |
| Streak UI | **Done** | The streak card at the top of the Boutique, with the claim, the next milestone, badges, titles and accents. | `src/components/apps/sixd/StreakCard.tsx` |
| Insurance | **Done** | One switch. Premium 0.4% of the insured value each real week (sink). Lapses when the premium exceeds spendable cash. Loss sources and claims as in 6D.1 row 3. Cannot go on during a breach, within 24 h after one, or with nothing insured. | `src/world/insurance.ts` |
| Insurance UI | **Done** | The insurance card in Security: state, insured value, premium, paid out so far, the switch, and the refusal in three parts. | `src/components/apps/sixd/InsuranceCard.tsx` |
| Home room, collection | **Logic only** | Six slots for owned goods (no experiences). Two opt-in switches (`home`, `collection`), both off by default. | `src/world/home.ts` |
| Home and collection pages | **Not built** | The rank shell's home and a collection page are not drawn. | — |
| Stress test | **Done** | The book (cash plus positions at mid) under the four kinds, at each kind's published typical move by asset class. Labelled "Illustrative". Reads the book and the static move table only. | `src/world/stress.ts`, `src/content/stress.ts` |
| Stress UI | **Done** | The stress panel in the Portfolio positions tab. Empty state for a book with no positions. | `src/components/apps/sixd/StressPanel.tsx` |

### 6D.4 Gates

- `npx next typegen && npx tsc --noEmit`: exit 0 at each commit.
- eslint on the touched files: 0 errors (warnings fixed).
- Full vitest run (run after the last source change of the UI, which added no unit tests): 209 files passed, 2 skipped; 2,073 tests passed, 70 skipped, 21 todo; exit 0. The touched suites include insurance (17), streak (14), tournament and tournamentWeek (with N8 and reveal), the runner (2), auctions (with the no-reveal block), home and i18n.
- Playwright, the 6D specs at the final commit: 16 passed, 0 failed, on the desktop (1440 x 900) and phone (390 x 844) projects, in en and fr.
  - `tests/e2e/sixd.spec.ts` (12): insurance switched on and off in Security; the streak claim in the Boutique, with its one-claim-a-day refusal; the Portfolio stress panel labelled Illustrative, with its empty state.
  - `tests/e2e/sixdAuction.spec.ts` (4): the Auctions tab lists three to five lots with their status, and shows no bid form for lots past their hour.
  - Screenshots: 16 PNGs in `scratchpad/shots-p6d`.
- Not run in Playwright: an auction bid on an open lot. A lot is open only in its week's first real hour, so the test must advance the shared world to a week's first tick, about 120,000 ticks. The admin advance is synchronous and blocked the world server past the fetch timeout, and the next test could not register. The bid flow (the minimum, the reserve, the anti-snipe, the settlement and the money) is covered by `src/world/auctions.test.ts`.
- `npx tsc --noEmit`: exit 0. eslint on every touched file: 0 errors, 0 warnings.
- Money identity: the loss-day test checks that every change in cash matches the booked faucets less sinks. Each auction settlement, premium and claim has a cent test.

### 6D.5 Deviations

- **Deductible as an excess.** The spec gives a 10% deductible and an 80% payout cap, both as shares of the loss. Under those readings the cap always binds and the deductible never acts. The deductible is therefore 10% of the insured value at the claim (an excess, not a share of the loss); the payout is the loss less the excess, capped at 80% of the loss, and never more than the insurer holds. A loss under the excess pays nothing.
- **Loss sources behind a market flag.** Loss sources and the insurer exist only in a world whose first policy went on (`insuranceMarket`), and the loss stream is seeded lazily. Worlds that never sold a policy draw no losses and keep their state, which is how "worlds without the feature keep every fingerprint" is met.
- **`breachedAt` in hostile-session worlds.** `cyber.breachedAt` is a new field, absent in v1. Worlds with a hostile session now carry it, so their snapshots change from v1. Worlds without a hostile session do not.
- **Trade log opt-in at entry.** The spec reads as a choice after the results. The log is computed by the off-tick runner, so the choice is made at entry and frozen on the entry. The publication itself still happens only for a top-three entry, after the settlement.
- **Consignor transfer.** The consignor's share is a transfer to a fictional account, not a sink. The fee and the premium are sinks.
- **Hack drain is cash.** A hostile session takes a daily share of net worth from cash, scaled by its strength (whisper 0.6, tap 1.0, siphon 1.6, times 0.01% a game day). The existing compute drain (fewer bot runs) is separate and unchanged.
- **Shop events book a fraction of the sale value** (fire 30%, theft 15%), since a shop's contents are not modelled. The shop branch has no unit test of its own; the same claim path is covered by the hack-drain and collectible-theft tests.
- **Tournament seeds** derive from the world seed and the week, with no per-week server secret, so replays need no stored seeds. Their secrecy rests on the world seed staying private.
- **Refusal copy** is in `sixd.refuse.*`. The refusal codes are the same words the world sends, so a code that changes must change its keys with it.

### 6D.6 Open items

- The home room and the collection page are not drawn (6D.3). The logic and its opt-in are in place.
- The trade-log publication is counted on the board, not shown. The log viewer and the commentary of N8 are not built.
- The palette picker does not yet read the streak accents (the accents are recorded and listed on the card).
- Auction extensions are not capped, as the spec says. A long bidding war can run past the hour.
- An auction bid in Playwright (an open lot needs the shared world at a week's first tick; the admin advance of about 120,000 ticks blocks the world server). Covered by unit tests only. A test-only clock hook for the e2e world would close this.
