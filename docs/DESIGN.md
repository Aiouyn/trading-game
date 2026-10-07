# DESIGN — Ink & Brass

**Owner:** Velvet (visual identity, design system, motion). **Status:** v1.1 for Phase 0 (adds §6a order ticket states), 2026-10-07. Ink & Brass was approved by Mathis.
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

Number formatting: thousands separators always (`48,212.40`); 2 decimals for money and prices under 10,000, 0 decimals for whole-dollar totals at T3+; compact form (`$48.2k`, `$1.2M`, `$3.4B`) only in progress bars, chips and Wire copy; percentages to 2 decimals with sign.

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

## 7. Voice in the UI

Glossy with a wink: short, confident labels ("Buy 40 HALD", "Market open · Port Avalon"). All brands, cities and tickers are fictional. Never write anything that reads as financial advice; this is a game with fictional markets and no real money.

## 8. What's next from me

Estate/Home, onboarding and the rank-up ceremony specs for Phase 0, then the Shadow sub-palette screens (the Connections panel, bible §10.5) when Lab and Security Ops are scheduled.
