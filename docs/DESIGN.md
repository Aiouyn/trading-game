# DESIGN — Ink & Brass

**Owner:** Velvet (visual identity, design system, motion). **Status:** v1.2 for Phase 0 (§6a order ticket states, §6b first-session onboarding, §6c rank-up Broke to Hustler, §6d the R0 shell), 2026-10-07. Ink & Brass was approved by Mathis.
**Tokens:** `src/styles/tokens.css` (the only place hex values live). **Mocks:** `docs/design/ink-brass-portfolio-desktop.png` (1440 × 900) and `docs/design/ink-brass-portfolio-phone.png` (390 × 844).
**Full background:** the design bible section `04-experience-lifestyle.md` §9–§10 (box copy). This file is the build contract for Forge.

## 1. The idea

A private bank at night. Dark ink surfaces, warm brass for wealth and the one primary action, an editorial serif for the moments that matter (your net worth, section titles, rank), and monospaced tabular numbers everywhere a value can change. It should feel expensive and calm, and stay readable through a two-hour chart session.

**Rules**
1. **Brass is earned.** Use brass for net worth progress, rank, the primary action and the last-price tag. Never for decoration, never for more than one button per view.
2. **Numbers are mono, always.** Every price, quantity, P&L, percentage and clock uses `.num` (JetBrains Mono, tabular). Columns of numbers right-align.
3. **Color is never the only signal.** Gain and loss always carry a sign (`+` or `−`, the real minus U+2212) as well as green or red.
4. **Borders, not shadows.** Separate surfaces with `ink-3` hairlines. The only glow is under the brass button.
5. **Motion explains a change.** Something moves only because a value or a state changed. Nothing loops except the tick ring.

## 2. Color

| Token | Hex | Use |
|---|---|---|
| `ink-0` | #0B0D10 | App background |
| `ink-1` | #12151A | Cards and panels |
| `ink-2` | #1A1E25 | Row hover, hairlines on ink-0, chart grid |
| `ink-3` | #262B33 | Borders, inputs, selected tab |
| `fg` | #ECE9E2 | Primary text |
| `fg-muted` | #9AA0A8 | Secondary text, inactive tabs |
| `fg-faint` | #7E848E | Labels, captions, sub-names |
| `fg-disabled` | #5F656E | Disabled controls and decoration only |
| `brass` / `brass-hi` / `brass-lo` | #C9A45C / #E6CB8F / #B08A45 | Wealth, rank, primary action, active nav |
| `on-brass` | #16120A | Text on brass |
| `gain` / `loss` | #3FD1B0 / #FF6B5A | Up and down, P&L, candles |
| `warn` / `info` | #F2B33D / #6EA8FE | Margin warnings / macro news, links |
| `steel` / `signal` | #7C8A99 / #E5484D | Shadow sub-palette, Lab and Security Ops only |

Contrast (WCAG): `fg` 15:1, `fg-muted` 6.9:1, `fg-faint` 4.9:1 on `ink-1`, so all text passes AA. `fg-faint` dips to 4.4:1 on `ink-2`, so don't put faint text on hover rows. Brass button text is 7.9:1. `signal` is for outlines, icons and short chip text on `ink-0`/`ink-1` only.

Note: `fg-faint` is lighter than the bible's #5F656E, which failed AA for text; #5F656E survives as `fg-disabled`.

## 3. Type

| Role | Font | Token / size | Notes |
|---|---|---|---|
| Net worth (desktop / phone) | Instrument Serif 400 | `text-hero` 40 / `text-hero-lg` 48 | Cents at 65% size in `fg-muted` |
| Section titles ("Positions", "Trade") | Instrument Serif 400 | `text-title` 22 | Sentence case |
| Hero price | JetBrains Mono 500 | `text-price` 30 | letter-spacing −0.02em |
| Body, buttons, names | Inter 400–600 | `text-body` 14 | Tickers are Inter 600 |
| Table values | JetBrains Mono 400 | 13 px | Right-aligned |
| Secondary | Inter | `text-small` 12.5, `text-caption` 11.5 | |
| Labels | Inter 500 | `.label` (10.5, uppercase, 0.14em) | `fg-faint` |

**Wiring (Forge, `src/app/layout.tsx`):** replace Geist with
```ts
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
const serif = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-instrument-serif" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });
// <html className={`${serif.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
```
**And in `src/app/globals.css`:** keep `@import "tailwindcss";`, add `@import "../styles/tokens.css";` on the next line, and delete the scaffold's `:root`, dark-mode block, `@theme inline` and `body` rules (tokens.css sets the body).

Number formatting: thousands separators always (`48,212.40`); 2 decimals for money and prices under 10,000, 0 decimals for whole-dollar totals at T3+; compact form (`$48.2k`, `$1.2M`, `$3.4B`) only in progress bars, chips and Wire copy; percentages to 2 decimals with sign. Losses and drawdown always carry the minus (`−0.03%`, U+2212) and `loss` color; an exact zero shows `0.00%` in `fg-muted` with no sign.

## 4. Space, shape, layout

- 4 px base grid (Tailwind's default spacing). Card padding 16–18, gaps 16–18.
- Radius: `rounded-lg` 14 for cards, `rounded-md` 10 for inputs and buttons, `rounded-sm` 6 for tab pills, `rounded-chip` for chips.
- **Desktop (≥ 1200 px):** a 72 px nav rail, a fluid main column (chart card over positions), a 344 px side column (order pad over watchlist), a 76 px top bar (net worth, today, rank progress, league and rival, game clock and tick ring) and a 34 px Wire strip at the bottom. See the desktop mock.
- **Tablet (768–1199 px):** the rail stays; the side column moves under the chart.
- **Phone (< 768 px):** status header (rank chip, clock, tick ring), serif net worth, rank progress, chart card, positions list, a floating full-width brass "Trade" button 16 px above an 84 px bottom tab bar (Market, Portfolio, Estate, Wire, More). See the phone mock. Touch targets ≥ 44 px.

## 5. Motion

| Token | Duration | Used for |
|---|---|---|
| `--dur-fast` | 120 ms | Hover, press, toggles |
| `--dur-base` | 220 ms | Tabs, sheets, row insert/remove |
| `--dur-slow` | 420 ms | Price flash, settle, rank-up beats |
| `--dur-ambient` | 2400 ms | Brass shimmer on a new rank, idle glows |
| `--dur-tick` | 5000 ms | One market tick |

Easing: `ease-out` (cubic-bezier(.22,1,.36,1)) for anything entering or responding; `ease-in-out` for ambient. 

- **Tick ring:** a 2 px brass arc that fills linearly over each 5 s tick and resets on the server tick (sync to the tick event, don't run a free timer). `animate-tick`, set `--ring-length` to the circle's circumference.
- **Price flash:** when a price cell changes, `animate-flash-gain` or `animate-flash-loss` on its background (420 ms fade). Restart the animation on every change; at most one flash per cell per tick.
- **Number roll:** net worth and P&L roll digits over 220 ms when they change by tick; big events (a fill, a rank-up) use 420 ms.
- **Reduced motion:** tokens.css zeroes durations. The tick ring then steps once per second instead of animating, and flashes become a 1-tick color change.

## 6. Phase 0 components

| Component | Spec |
|---|---|
| Top bar | Serif net worth + mono "Today" P&L + rank chip with progress bar to next rank + league and rival + game clock with market state dot + tick ring |
| Tick ring | 30 px desktop, 22 px phone, track `ink-3`, arc `brass` |
| Price cell | `.num`, flashes on change; the last price on the chart is a brass tag on a dotted brass line |
| Chart | Candles `gain`/`loss` bodies and wicks, volume bars at 22% opacity, grid `ink-2`, axis labels `fg-faint` 10.5 mono, crosshair `fg-muted` dashed. lightweight-charts: `layout.background = ink-1`, `textColor = fg-faint`, `upColor = gain`, `downColor = loss`, `borderVisible: false`. Range tabs 1H/1D/1W/1Q/1Y as pill tabs |
| Order pad | Buy/Sell segment (selected side tinted 12% with a 35% inset line in gain or loss), Market/Limit/Stop tabs, quantity field with mono value, 10/25/50/Max chips, a breakdown (ask, est. cost, fee, slippage, total, buying power after), one brass button labeled with the full action ("Buy 40 HALD") |
| Position row | Ticker (Inter 600) + name (`fg-faint`), mono qty, avg, last, value, P&L with sign and %, weight, 5-day sparkline |
| Watchlist row | Ticker + name left, mono price and signed % right |
| Chip | 1 px `ink-3` pill; the brass variant has a 45% brass border and 7% fill |
| Wire strip | "THE WIRE" label in brass, items tagged by type color: Filing and Purchase brass, Macro info, Earnings loss or gain |
| Empty state | One serif line + one suggested action |

## 6a. Order ticket states (for Quant's task #2 API)

| State | Ticket shows | Motion |
|---|---|---|
| Idle | Breakdown from `estimateFill` (price, fee, slippage in bps and $, total, buying power after); brass button "Buy 40 HALD" | Breakdown values roll 120 ms as qty changes |
| First-trade cap (Simple mode) | Qty chips stop at 20% of cash; a one-line `fg-muted` note under the field: "First trade is capped at 20% of cash." Max chip reads "Max 20%" | None |
| Invalid (qty over buying power, below 1 whole share) | Button disabled (`ink-3` fill, `fg-disabled` text), the reason in `warn` under the field | Field border pulses `warn` once, 220 ms |
| Pending (placed, waits for next tick) | The button becomes a non-brass "Filling at next tick" row with the tick ring (22 px) filling to the next tick; a Cancel text link | Tick ring, synced to the server tick |
| Halted asset | Same pending row, text "Waits for reopen", ring replaced by a steel pause glyph; a `warn` "Halted" chip on the price | None |
| Filled | Toast top-right (desktop) or above the tab bar (phone): "Bought 40 HALD at 91.41 · fee $3.66", in `fg` with a gain or loss side bar; the new row slides into Positions and its cells flash | Toast 220 ms in, 4 s hold; row insert 220 ms; flash 420 ms |
| Partial fill (limit) | Pending row shows "18 / 40 filled" with a thin brass progress bar | Bar eases 220 ms per fill |
| Rejected | Toast with a `loss` side bar and Quant's `rejectReason` in plain words; ticket keeps the values so the player can fix and resend | Toast 220 ms in |
| Open limit or stop | Listed under Positions as an "Open orders" strip: side, qty, type and trigger price in mono, Cancel | None |

## 6b. First-session onboarding (Phase 0)

Adapted from the bible's 04 §4 for a solo, trading-only sandbox: no businesses, league or push permission yet. Rules: one sentence per prompt, everything skippable, no tutorial walls, and nothing scripted. Every headline and number comes from the live engine. The onboarding step is saved with the game, never repeats, and can be replayed later from More → "Replay intro".

| # | When | What the player sees | Spec |
|---|---|---|---|
| 1 | New game, before the market | **Cold open (8 s).** Black. On phone a light haptic buzz. A phone lock screen fades up (ink-1 card, the R0 hairline crack across one corner) reading "Balance: $5,000.00" in serif and "Rent due Friday." in `fg-muted`. Behind it, a Port Avalon skyline silhouette in `ink-2`. One brass button, **Start**, plus a text link "I've played before" | Fade 420 ms per element, 220 ms stagger. "I've played before" skips steps 2–3 and the coach marks; the 20% first-trade cap still applies. Test ids `onboarding-coldopen`, `onboarding-start`, `onboarding-skip` |
| 2 | Market opens (clock runs) | **First news.** The Wire strip's newest relevant item expands into a card anchored over the chart's top-left: type tag, headline, the asset's 1D sparkline and its move, and one button "Look at HALD" that selects it | Pick the largest absolute jump on a **stock** in the last game day; fall back to the largest day move in the watchlist. Card slides down 220 ms; dismiss on tap outside. Id `first-news` |
| 3 | Asset selected | **Simple ticket.** Buy/Sell and the qty chips only; Limit and Stop tabs are hidden until the first fill. Under the button, one `fg-muted` line: "Prices can fall. That's the game." | Same pending ring and states as §6a. Ids `simple-ticket`, `honest-note` |
| 4 | First fill | Fill toast as §6a, then a small "First trade" receipt card in the Positions card (asset, qty, price, fee, game time) that collapses into the row after 4 s | Receipt scales in from 0.96, 220 ms. Limit and Stop tabs fade in (220 ms) with a one-time brass dot |
| 5 | First position is down 1% or more from its average cost | **Stop-loss explainer.** An inline card under that position row: "HALD is down 1.2% since you bought. A stop-loss sells it for you if it falls to a price you choose." A mini price ladder shows three ticks: your cost (fg), now (loss), and a dashed stop line at −5%. Buttons: brass **Set stop at 84.10** (−5% of cost, rounded to 2 decimals) and "Not now" | The brass button only **pre-fills** a Stop sell for the whole position in the ticket and focuses it; the player still confirms. Never place an order on their behalf. Shown once. Ids `stop-explainer`, `stop-preset` |
| 5′ | First position instead closes at a profit | "First profitable trade" receipt card (04 §3.3), same component as step 4 with a gain side bar | Once |
| 6 | After step 4, or 2 game hours of play | **Goals card** (Market under Positions, and top of Portfolio): "Reach $20k (Hustler)", "Close a profitable trade", "Hold 3 different assets", each with a thin brass progress bar | Completed goals tick with a 420 ms brass check, then the card shows the next goal. Id `goals-card` |
| 7 | After that | Free play: no more prompts this session unless the player opens Help | — |

Optional flavor if cheap: once in the first session, after the first fill, a grey in-world spam toast "Make $5k a day from your phone!" with a "Spam" tag and swipe to dismiss (R0 shell joke, 04 §9.3). Skip it if it competes with a real toast.

## 6c. Rank-up: Broke to Hustler

**Trigger:** net worth reaches $20,000 for the first time (rank is never lost). **Wait** until no order is pending and there's been no input for 10 s; never interrupt a countdown. Skippable after 1 s (tap or Esc). Total about 5 s. Id `rankup-overlay`, skip `rankup-skip`.

| Time | Beat |
|---|---|
| 0–600 ms | Screen dims to `ink-0` at 85%. The R0 hairline crack in the header glints once (brass, 120 ms) |
| 600–1400 ms | The crack heals: its stroke retracts to nothing (`ease-out`, 600 ms) while a soft brass sheen sweeps across the header (`animate-shimmer`, sped to 800 ms). Phone: medium haptic |
| 1400–2600 ms | Centered: `.label` "RANK UP", then **Hustler** in Instrument Serif at 72 px (56 px phone) rising 12 px into place over 420 ms, then the new `R1 · Hustler` brass chip and the net worth in mono |
| 2600–4200 ms | Three cards slide up with a 120 ms stagger. Phase 0 shows only real things: **"New phone: the crack is gone"**, **"Title: Hustler"** (on your profile), **"Next: Owner at $250k"** with a progress bar. Later phases swap in the real unlocks (T2 businesses, Studio) |
| 4200 ms → | One brass button, **Keep going**, which closes the overlay. No menu |

After it: the header chip is `R1 · Hustler`, the progress bar now reads "$20k / $250k to Owner", and a Wire item "You reached Hustler" is added (brass, type "Milestone"). Reduced motion: the same content as a static card, with no sheen, heal or rise.

## 6d. The R0 shell (Broke)

The bible's "interface is your status" starts here. At R0, a 1 px hairline crack in `fg-disabled` at 50% opacity runs across one corner of the top bar (desktop: top-right, behind the clock area; phone: top-left above the rank chip). It's an inline SVG under the content and never crosses text or controls. At R1 it's gone for good. Id `shell-crack`. That's the whole Phase 0 shell system; materials for later ranks come with their phases.

## 7. Voice in the UI

Glossy with a wink: short, confident labels ("Buy 40 HALD", "Market open · Port Avalon"). All brands, cities and tickers are fictional. Never write anything that reads as financial advice; this is a game with fictional markets and no real money.

## 8. What's next from me

Estate/Home, onboarding and the rank-up ceremony specs for Phase 0, then the Shadow sub-palette screens (the Connections panel, bible §10.5) when Lab and Security Ops are scheduled.
