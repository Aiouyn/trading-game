# Bankruptcy and the comeback (M20)
Owner: Velvet (spec). Build: Forge. Rules: ROADMAP §2.6 (fresh start once per 8 weeks, perks, anti-farming). Mock: `design/velvet-phase1-board-a.png` (panels 3 and 4).

## Tone
Calm, adult, no shame. A closed chapter, not a game over. Banned words: "failed", "game over", "lost everything", "wiped out", "broke you" (the R0 rank is called Broke, so the screen avoids reusing it). No full-screen red, no shaking, no skulls, no sad sounds.

## 1. Low cash card (not a modal)
- **Shows when** NW < $1,000. It sits at the top of Portfolio and once on Market under the chart. Dismissible; a dismiss hides it until the next real day.
- Content: serif "Running low." and one line, "Net worth $612.40. You have options." Then up to three rows, in this order:
  1. **Fresh start** with $5,000 (if available): "Close this chapter. Keep your rank, titles and cosmetics."
  2. **Watch an ad for $250** (only when ads exist, see `velvet-rewarded-ads.md`).
  3. **Keep trading**: closes the card.
- If the fresh start is on cooldown: the row reads "Next fresh start in 5 w 2 d" in `fg-muted`, disabled.

## 2. Forced close
When a liquidation leaves equity below zero, the game pauses the player's view (the world keeps running) and goes straight to screen 3 with the header "The account was closed by the clearing house." No interstitial.

## 3. The chapter screen
Full screen, `ink-0`, a single column 560 px max.
- `.label` "CHAPTER 1 · DAY 4 TO DAY 38". Serif `hero-lg` "Chapter closed."
- Three numbers in mono: **Peak** $14,880.20 · **End** $612.40 · **Days** 34.
- **What happened:** the three largest realized losses from the journal, each with its `explainTrade` sentence ("Most of this loss came from the crash, not the company."). Tap opens the journal entry. Facts only, no advice.
- **Kept / Goes**, two columns of short lines:
  - Kept: rank and shell, titles and trophies, cosmetics, licenses, researched AI nodes.
  - Goes: cash and positions, businesses, property, models and compute. Phase 0 shows only what exists (cash and positions).
- **Pick one** (three cards, one selectable, brass border when picked): Old contacts (one T1 business at 50% off), Lessons learned (50% off trading fees for 7 days), Second wind (×1.25 business income for 7 days). Phase 0, before businesses: only Lessons learned shows.
- **Rules line** in `fg-muted` small: "One fresh start every 8 weeks. Leverage stays at 1× for 7 days."
- Button: **hold to confirm** for 1.2 s, "Start chapter 2 with $5,000". A brass ring fills around the button while held; releasing early resets it.

## 4. The new chapter
A 2.4 s moment: the old page slides left and dims, a new page comes in with `.label` "CHAPTER 2" and the cash in serif, then the market. The R0 crack doesn't come back: rank and shell stay.

## Privacy
The chapter screen, its losses and the perk choice are private. Other players see nothing; at most the public "Reputation" change when the online phase has it.

## Edge cases
- Bust inside the 8-week window: no fresh start. The card offers ads (when they exist) and Keep trading, and the floor rule applies.
- Open orders at confirm: cancelled, listed in the order history as "Cancelled: fresh start".
- Debts that survive (online phase): one extra line on screen 3, "Owed to players: $3,200, paid from 30% of daily income."

## Test ids
`lowcash-card`, `lowcash-fresh`, `lowcash-ad`, `lowcash-keep`, `chapter-screen`, `chapter-loss-<n>`, `perk-<id>`, `chapter-confirm` (hold), `chapter-new`.

## Acceptance
- The card shows below $1,000 only, once per real day after dismiss.
- The confirm needs the full 1.2 s hold; a short press does nothing.
- After confirm: cash $5,000, no positions, rank and shell unchanged, cooldown set to 8 weeks (kept in the profile, so a new save never resets it).
- The $5,000 is restricted like ad cash (ROADMAP C5: 72 h online, 21 game days solo; no ops, insider actions, margin or transfers). It shows the same brass-outlined pill, reading `START` instead of `AD`.
- The chapter score keeps the bust loss: the chapter screen's "Goes" column never hides it, and boards show the closed chapter's End value, not a reset.
- Copy passes the banned-word check (Tape can grep the strings file).
