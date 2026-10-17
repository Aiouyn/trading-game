# World events: how a crash feels (M21 solo, M39 shared)
Owner: Velvet (spec). Build: Forge. Data: Quant `specs/quant-world-events.md` (`WorldEvent {kind, startTick, endTick, headline, shocks}`) and ROADMAP §2.8 (Ripple, Storm, Major, Crisis week). Mock: `design/velvet-phase1-board-b.png` (panels 1 and 2).

## Principle
The market should feel heavy, not the screen loud. A crash is told through weight, silence and one big sentence, then the facts. Never strobe, never a red full screen, never more than one flash per second (photosensitivity).

**No leaks from the future:** the UI reads events only through Quant's `worldEventView(state)` (`id`, `kind`, `headline`, `elapsedDays`), and shows only what the engine already published. Never the end date, the remaining length, the size of the rest of the move, or a "bottom". `endTick` is never read by the UI.

## The four layers
| Tier | Takeover | Banner | Ambient |
|---|---|---|---|
| Ripple (sector, it's news) | none | none, it's a Wire item | none |
| Storm (crisis week, flash) | none | yes | yes |
| Major (crash, bubble) | **yes, once** | yes | yes |
| Crisis week (announced) | an announcement card 48 h ahead, not a takeover | yes, with "Crisis week" | yes |

## 1. Telegraph (before)
Precursor headlines appear on the Wire as normal news, with a small `warn` dot when the engine marks them as precursors. Nothing else changes. Players who read the Wire are the ones who see it coming, which is the skill.

## 2. Takeover (onset of a major, about 3 s, skippable after 1 s)
- Waits for no pending-order countdown, like the rank-up, but **at most 10 s**: prices keep moving, so a late takeover is worse than none. If 10 s pass with an order pending, skip the takeover and go straight to the banner.
- 0–300 ms: the brass accents across the UI desaturate to `fg-muted` (CSS filter on accent tokens only; numbers keep their colors).
- 300–900 ms: a 1 px hairline drops from the top bar to 38% screen height (`ease-in`, the only "fall" in the game) and the screen behind dims to 70%.
- 900–2400 ms: on the line, `.label` "WORLD EVENT", then the engine headline in Instrument Serif 56 px (40 px phone), max 2 lines: "Markets in freefall." Under it in mono: `GX −6.20% today`.
- One line in `fg-muted`: "This is the whole market, not just your stock."
- Button **See my positions** (brass) and text **Close**. Phone: light double haptic at the headline.
- Bubble: the same structure, with the line rising instead of falling and `gain` for the GX number. No euphoria: no gold rain.
- Reduced motion: the headline card appears static; no desaturation.

## 3. Banner (during)
A 34 px strip under the top bar (desktop) or under the header (phone), on top of the Wire strip:
`● CRASH · DAY 3   GX −18.40% since it began   Today −2.10%`
- Dot color: crash `loss`, bubble `gain`, crisis week `warn`, flash `info`. The text stays `fg`.
- **Elapsed only**, never remaining.
- Tap opens the event panel: the headline, the precursors that came before it, and the event's share of each held asset's move today ("−4.1% of HLCN's −5.0% today is the crash"), from `shocks`.

## 4. Ambient (during)
- Header hairline: a slow 2400 ms opacity pulse (40% → 80%) in the dot color. Off with reduced motion.
- Charts: the event window shaded in the dot color at 6% on every price chart and on the net worth chart, with a small label at the top-left of the band.
- The Wire strip scrolls 1.5× faster during a crash or flash.
- Sound (when it exists): the market-open bell sounds lower for the event's duration.

## 5. Aftermath
When the engine ends the event, the banner shows "Crash ended · lasted 18 days · GX −31.0%" for one game day, then goes. The next daily close adds an event line: "The crash lasted 18 days. GX −31.0%. You −12.4%." Facts only.

## Flash crash
No takeover (it's a day). A 1.5 s soft `info` edge glow, the banner, and the §6a halted state on any halted ticket.
- The give-back is random in size and timing, and sometimes never comes (Ledger's call). The UI never hints at a rebound: no "usually recovers", no countdown, no recovery band on the chart. The ended line states only what happened.

## Interaction with other moments
Rank-up first, then the takeover, then milestones, then the daily close; at least 8 s between full-screen moments. A takeover never starts while the ticket is open on phone: it waits (max 10 s) or falls back to the banner.

## Privacy
Shared events are world facts, so every player sees the same banner. Nothing about any player's exposure is shown to others.

## Test ids
`event-takeover`, `event-headline`, `event-close`, `event-banner`, `event-panel`, `event-share-<assetId>`, `event-band`.

## Acceptance
- One takeover per major, never for a ripple or storm, never more than 10 s late.
- No UI string or element is derived from `endTick` (Tape: grep plus a test that a forced event shows the same banner at day 3 whatever its length).
- Screenshot sign-off at 1440 and 390 for crash onset, crash day 3, bubble, flash.
