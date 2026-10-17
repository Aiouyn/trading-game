# Rewarded-ad offer (M48): tasteful, never nagging
Owner: Velvet (spec). Build: Forge. Rules: ROADMAP §2.7 and Mathis's decision: $250 per ad, at most 10 a day, only under $1k net worth, ad cash can't fund hacking right away. Needs Mathis's yes on the ad network and tracking before any build. Mock: `design/velvet-phase1-board-a.png` (panel 4).

## Principles
1. **The player asks, the game never pushes.** No interstitials, no ad on launch, no ad after a loss, no push notification about ads, no countdown pressure, no "limited time".
2. **A fixed amount.** $250, always. No spin, chest, multiplier or "double it" (loot-box line, bible PART V #7).
3. **One place.** The offer lives only in the low-cash card (see `velvet-bankruptcy.md`) and in More → "Earn $250". Nowhere else.
4. **Honest about the strings.** The restriction is stated before the ad, not after.

## The offer row
Inside the low-cash card: a row with a 20 px play icon in `fg-muted`, "Watch a short ad for $250", and on the right `3 of 10 today` in mono `fg-faint`. Under it, `small` `fg-faint`: "Ad cash can't pay for ops, insider actions, margin or transfers for 72 h." In solo, the note reads "for 21 game days" (ROADMAP C5).
- Ineligible (NW ≥ $1,000, account younger than 24 h, guest, or 10 used): the row isn't shown at all. No greyed-out teaser.
- Fresh start (if available) is listed above it, per ROADMAP §2.7.

## During and after
- The ad runs in the network's own full-screen player.
- Completed: a toast, "+$250 added." The cash animates up once (the normal 600 ms roll), no coins.
- Not completed: a toast, "No ad finished, so no cash." No penalty, no "are you sure".
- The Cash line in Performance and the ticket's "Cash after" show a small brass-outlined `AD` pill while any ad cash is still restricted. Tap shows "$500 of your cash is ad cash until Day 9 14:00. It works for trades and businesses, not ops, insider actions, margin or transfers."
- If an order would use restricted cash for a blocked use, the ticket's invalid state says exactly that (DESIGN §6a invalid state).

## Frequency
The "3 of 10 today" count lives in the profile, not the save (Forge's profile record), so a new or wiped save shows the same count.
At most one low-cash card per real day after a dismiss. The More entry is always there when eligible, and never badged.

## Privacy
Ad views are never shown to other players and never affect boards.

## Test ids
`ad-offer`, `ad-count`, `ad-note`, `ad-toast`, `ad-pill`, `more-earn`.

## Acceptance
- The offer never appears at NW ≥ $1,000 or after 10 ads that day.
- No ad starts without a tap on the offer row (Tape: e2e asserts zero ad calls across a full scripted session at NW < $1k with no taps).
- The `AD` pill and its time match the engine's restricted cash.
