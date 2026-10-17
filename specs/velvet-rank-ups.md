# Rank-ups R1 to R6 and the interface shells

> **Superseded in part (2026-10-09):** the interface shells in this file (R0 crack, aluminum, bezels, walnut, glass, horizon as panel materials) are replaced by the Quay desktop OS in `velvet-desktop-os.md`. There, rank shows as computer hardware, OS polish and wallpaper, and the ceremony is an OS update screen. The rank names, thresholds, order of moments, wait and skip rules, three-card rule and privacy rules below still stand.

Owner: Velvet (spec). Build: Forge. Extends `docs/DESIGN.md` §6c (Broke → Hustler), which stays the template. Source: bible 04 §3.1, §3.4, §9.3. Mock: `design/velvet-phase1-board-b.png` (panel 4, Owner).

## One ceremony, seven materials
Every rank-up uses the §6c timeline: dim, **old material leaves**, rank name in serif, three cards, one button. Only the material beat (600–1400 ms) and the cards change per rank.

| Rank | Net worth | Material beat (600–1400 ms) | Shell after (header and side rail) |
|---|---|---|---|
| R1 Hustler | $20k | The R0 hairline crack heals | Clean glass: crack gone |
| R2 Owner | $250k | A brushed-aluminum gradient wipes left to right across the header (`ink-2` → `#2A2F37` → `ink-2`, 800 ms) | Matte aluminum top bar: a 1 px top highlight `rgba(255,255,255,.06)` and a faint vertical brush texture (CSS, 3% opacity). Phone: header only |
| R3 Operator | $5M | Side panels gain bezels: a 1 px `ink-3` inner border draws around each column, 120 ms stagger | Bezeled panels; the side column header gets a tiny "screen 2" label |
| R4 Mogul | $100M | A walnut strip (`#3A2A1E` → `#2A1E15`) slides in under the top bar with a brass inlay line | Walnut and brass header band, 6 px; ambient room tone if sound is on |
| R5 Titan | $2B | The background fades to a blurred city skyline (owned buildings lit), panels turn translucent (`ink-1` at 86% + 12 px blur) | Glass floor. Reduced-transparency setting falls back to R4 |
| R6 Dynasty | top 50 world board | Everything quietens: brass softens to `brass-lo`, a sea horizon line at 30% height | The calmest shell: fewer hairlines, more space |

The rank name is always Instrument Serif 72 px (56 px phone). The `.label` above reads "RANK UP". The ceremony never shows confetti, coins or particles.

## The three cards
Only things that exist in the current build. Each card: a 24 px line icon, a title (sans 600), one line in `fg-muted`.
- Card 1: the new shell ("New shell: aluminum laptop").
- Card 2: what opened (license, business tier, home, AI tier per 04 §3.1), only if built. Otherwise the title ("Title: Owner").
- Card 3: the next rank with a progress bar ("Next: Operator at $5M").

## Rules
- **Trigger:** net worth reaches the threshold for the first time. Rank is never lost.
- **Wait:** no pending order, 10 s idle, no world-event takeover playing. Skippable after 1 s.
- **Order of moments:** rank-up, then a world-event takeover, then milestones, then the daily close. Never two full-screen moments back to back: at least 8 s between them.
- **Multiple ranks at once** (a huge gain, or a test hook): play only the highest; card 1 adds "Also: Owner" in `fg-muted`.
- **R6 Dynasty** is a board position, not net worth: it plays when the player enters the top 50, and losing the spot never takes the shell back.
- **Haptics:** medium on the rank name. **Sound:** a single low bell when sound exists.
- **Settings:** "Shell" picker with every earned shell. Purchased cosmetic shells (M49) are marked "Purchased" and never count for Prestige.
- **Privacy:** the ceremony and its Wire line are on the player's own screen only. A player's rank shows publicly only where boards already show it (M38).
- **Reduced motion:** static card with the same content; the shell swaps instantly.

## Test ids
`rankup-overlay`, `rankup-name`, `rankup-card-1..3`, `rankup-keep-going`, `shell-<rank>` on the root (`shell-r0` … `shell-r6`).

## Acceptance
- Each rank's ceremony plays once and in order, using Forge's `grantCash` + `idle` hooks.
- The shell class on the root matches the highest earned rank (or the one picked in settings).
- Performance: the R5 blur keeps 60 fps on Tape's mid-tier phone profile, or it falls back to R4.
- Screenshot sign-off of each shell at 1440 and 390.
