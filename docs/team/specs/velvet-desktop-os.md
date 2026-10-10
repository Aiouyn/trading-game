# Quay: the desktop OS shell (web) and home screen (phone)
Owner: Velvet (spec). Build: Forge. Tests: Tape. Brief: Ledger, 2026-10-09 (Mathis: full A-to-Z redesign). Mocks: `design/redesign/<palette>-desktop.png` (1440 × 900), `design/redesign/<palette>-phone.png` (390 × 844), phone app switcher `design/redesign/ink-brass-phone-recents.png`, contact sheet `design/redesign/palettes-overview.png`. Tokens: `handoff/tokens.css` v2. Sources: `design/redesign/src/` (render with `node design/redesign/src/render.mjs`).

**Scope:** shell only, covering chrome, windows, launcher, notifications, home screen, rank materials and palettes. Engine, game rules, prices, unlock rules and every screen's content stay as specced. This file **supersedes the interface shells** in `velvet-rank-ups.md` (crack, aluminum, bezels, walnut, glass, horizon). Rank names, thresholds, order and ceremony rules there still stand. `handoff/DESIGN.md` stays the token and type contract; Quay adds palettes on top of it.

## The idea
The game is played on a computer you own in Port Avalon. Its OS is **Quay** (a harbor wharf). Each system is an app in its own window. You can lay them out the way a real desk works: chart, ticket and Wire side by side. As you get richer the computer gets better, but it never gets faster at trading than anyone else's.

Rules
1. **It's ours.** No real OS branding, icons or idioms: no coloured window dots, no start button, no magnifying dock, no notch, no home-indicator pill, no gear-for-settings cliché. Quay has its own mark, its own window controls and its own glyph family.
2. **Trading first.** Every shell feature has to make trading the same speed or faster. If a flourish costs a keypress or a frame on a price update, cut it.
3. **Rank is cosmetic.** Rank changes materials, wallpaper, workspace count and widgets that repeat data you can already see. It never changes speed, information, order types or any window behaviour that affects outcomes.
4. **DESIGN.md rules carry over:** brass (the accent) is earned, numbers are mono, colour is never the only signal, borders not shadows (windows get one soft shadow, nothing else does), motion explains a change.

## Brand
| Item | Spec |
|---|---|
| Name | **Quay**, Instrument Serif 20 px in the status strip, `fg` |
| Mark | A deck line over two short piers, with three water dashes under it at 55% opacity. 24 px grid, 1.5 px line, accent colour. Id `os-mark` |
| Releases | Each rank is a release: Quay 0 · Broke, Quay 1 · Hustler, Quay 2 · Owner … Quay 6 · Dynasty. The release number sits next to the wordmark in mono `fg-faint` |
| Glyphs | One family: 24 px grid, 1.5 px single-weight line, round caps and joins, no fills except tiny dots. Drawn as inline SVG (`design/redesign/src/glyphs.js` is the reference set) |

## Desktop layout (≥ 1200 px)
| Zone | Size | Contents (left to right) |
|---|---|---|
| **Status strip** (top) | 34 px, `chrome` at 94%, 1 px `line` bottom | Mark + "Quay" + release · launcher field "Find an app, a ticker, a command" with `Ctrl K` (312 px) · centred: "Day 38 · 11:20" (mono), market state dot + "Market open · Port Avalon", speed control `pause / 1x / 4x / 20x` (active segment gets an accent underline) · right: rank chip "R2 · Owner", net worth in mono with today's %, notification bell (accent dot when unread) |
| **Desktop** | the rest | Wallpaper and windows. Windows can't go under the strip or the shelf |
| **Shelf** (bottom) | 52 px, `chrome`, 1 px `line` top | App tiles 40 × 40, left-aligned, in shelf order, with a divider after the first four · right: layout button ("Trade layout"), Focus button with `Ctrl .`, workspace switcher (one box per workspace, active in accent) |

Shelf tile states: idle `fg-muted`; running `fg` + a 4 px dot under it; active window's app in `win2` with a 1 px `line` ring, accent glyph and a 12 × 2 px accent bar. Apps the game hasn't unlocked yet (a game rule, e.g. Research Desk before R3) are drawn in `fg-disabled`, and the tooltip names the unlock ("Research Desk · opens at Operator"). There's no upsell and no badge. Tiles never magnify, bounce or grow on hover. Hover is `win2` only.

## Compact desktop (768–1199 px)
For laptops with small windows, tablets in landscape and split-screen browsers.
| Item | Rule |
|---|---|
| Chrome | The same status strip and shelf as desktop. Below 1000 px the launcher field shrinks to a search glyph + `Ctrl K` (the strip keeps clock, speed, net worth and bell) |
| Windows | One window at a time, filled to the work area (strip to shelf, 8 px gutter). No free floating and no overlap. Title bar and controls stay; Fill is shown pressed and Collapse returns to the previous window |
| Switching | Shelf tiles switch the visible window (the running dot and active bar work as on desktop). `Alt 1..9`, `Ctrl Tab` / `` Alt ` `` and the launcher work the same |
| Halves (≥ 1000 px) | Two windows side by side, 1/2 + 1/2 (e.g. Broker + Wire), with `Ctrl ←/→` or a drag to the edge. Each half keeps the window's minimum width; if a minimum doesn't fit, the snap is refused with the hairline preview in `fg-disabled` |

**Broker's narrow form.** Broker's minimum width is 480 px, not 720. Below 720 px wide it uses the phone Broker layout: chart full width, the ticket as a docked panel under the chart (Buy/Sell, size, Enter), with a `Chart · Ticket` toggle when the window is shorter than 560 px. Same keys, same rule that nothing executes without Enter. That way Broker + Wire halves work from 1000 px.
| Needs 1200+ | Thirds, quarters, named layouts (Trade, Review, Research, custom) and free placement. In compact, the layout button and those launcher commands are hidden, not greyed |
| Trading | Broker already holds chart + ticket, so trading never needs a second window. Every Broker key works the same |
| Toasts, focus | Toasts behave as on desktop (top-right, max 3, 4 s, never over the ticket). Focus mode works the same: it hides the shelf and wallpaper, and at ≥ 1000 px shows the two halves borderless |
| Memory | Rects saved at ≥ 1200 px are kept untouched while compact; compact state is stored separately (`shell.compact`: visible window and the optional half pair). When the viewport grows back to ≥ 1200 px, the saved desktop rects and snap slots are restored exactly |
| Workspaces | Kept, and switched with the same keys and switcher; each workspace remembers its own visible window |

## Window model
| Part | Spec |
|---|---|
| Frame | `win` background, 1 px `line` border, radius 10 (Phosphor 6), one soft shadow (`--shadow`), no blur |
| Title bar | 32 px, 1 px `line` bottom. Left: app glyph 15 px (accent) + name (Inter 600 12.5) + context in `fg-faint` ("HLCN · 30m"). Right: three controls, 26 × 22 hit areas (44 × 44 on touch), glyphs in `fg-faint` |
| Controls | **Collapse** = a short horizontal bar (to the shelf). **Fill** = a pair of square brackets `[ ]` (fill the workspace, again to restore). **Close** = a small diagonal cross. Monochrome line glyphs, never coloured, never round dots. Hover: `win2` behind the glyph; Close's hover glyph turns `loss` |
| Active | A 1.5 px accent hairline along the title bar's top edge; name in `fg`. Inactive: name `fg-muted` weight 500, glyph `fg-faint`. Content is never dimmed (prices must stay readable in every window) |
| Size | Minimums: Broker 720 × 420, Wire 360 × 280, Portfolio 520 × 220, others 420 × 300. Resize from any edge, with an 8 px grab zone |
| Instances | One window per app, except Broker (up to 4, one per ticker) and Research Desk files (one per file). A second Broker opens with `Alt N` or "Open in new window" on a ticker |
| Memory | Position, size, snap slot and workspace are saved per save file (`shell.windows` in the save; Forge). If the stored rect no longer fits the viewport, it re-snaps to the nearest slot |
| Inner layout | Each app's content follows its own spec. The old desktop rail, top bar and side column (DESIGN §4) become window contents: Broker = chart card + order pad, Portfolio = positions + net-worth header, Wire = the full Wire list |

### Snap
| Target | How | Slots |
|---|---|---|
| Halves | Drag to the left or right edge, or `Ctrl+←/→` | 1/2 |
| Thirds | `Ctrl+←/→` again cycles 1/2 → 1/3 → 2/3 | 1/3, 2/3 |
| Quarters | Drag to a corner, or `Ctrl+↑/↓` after a half | 2 × 2 |
| Fill | Drag to the top edge, `Ctrl+↑`, or the Fill control | whole workspace |

While you drag, the target shows as a 1 px accent outline with a 6% accent fill, and the window doesn't move until you release. Gutter 8 px (1 px in Focus mode). Snapped windows share edges, so dragging a shared edge resizes both.

**Named layouts** (shelf layout button, or the launcher): one click places the right windows, opening them if needed.
| Layout | Arrangement |
|---|---|
| **Trade** (default on a new save) | Broker 2/3 left; Order ticket inside Broker; Wire top-right 1/3; Portfolio bottom-right 1/3 |
| **Review** | Portfolio left 1/2, Journal (Portfolio's journal view in its own window) right 1/2 |
| **Research** | Research Desk 2/3 left, Broker (same ticker) top-right, Wire bottom-right |
| Custom | "Save current as layout" (max 5 per save) |

### Workspaces
Workspaces are separate desks you switch between (`Ctrl+Alt+←/→` or the switcher). Their count comes from the rank hardware: R0 and R1 have 1, R2 has 2, R3 and up have 3. Extra workspaces are layout room, never extra information: every app can open on workspace 1 at every rank.

## Apps
| # | App | Purpose (one line) | Glyph |
|---|---|---|---|
| 1 | **Broker** | Charts, order ticket, order book and open orders for any ticker | Two candlesticks, one tall and one short, with wicks |
| 2 | **Portfolio** | Net worth, positions, P&L, the trade journal and the replay | A ring with one quarter slice cut from 12 to 3 o'clock |
| 3 | **Wire** | News, world-event banners, milestones and rival moves, newest first | Three short rows, each with a leading dot |
| 4 | **Messages** | In-world messages: contacts, offers, rivals, the bank | A squared speech panel with a short tail, two text lines |
| 5 | **Businesses** | Owned businesses, tiers, upkeep and income | A shop front with an awning and a door |
| 6 | **AI Lab** | Bots and strategies you build and run (its own spec) | Three nodes joined in a triangle |
| 7 | **Research Desk** | "Why it moved" files for any asset over closed days (R3, `velvet-research-desk.md`) | A page with a folded corner and a loupe over it |
| 8 | **Bank & Credit** | Cash, loans, credit lines, interest | A pediment over four columns on a base line |
| 9 | **Legal & Court** | Cases, fines, contracts | Balance scales |
| 10 | **Security** | Account safety, Shadow sub-palette screens | A shield with a keyhole |
| 11 | **Boutique** | Cosmetics: shells, wallpapers, desk items. Game money only, no loot boxes. Palettes are never sold here (they're free in Settings) | A shopping bag with a curved handle |
| 12 | **Settings** | Palette, shell picker, sound, motion, keys, accessibility | Three slider rails with knobs at different stops |
| 13 | **Company** (R2 Owner) | The player's own company; hidden until R2. Spec: `specs/velvet-company-app.md` | A tower block with window ticks on a ground line |

Shelf order is the table order (apps 1–4 are the trading group, then a divider). `Alt+1..9` follows shelf order. The player can reorder tiles, except that Broker stays first. Navigation paths in older specs map to apps: "Market" tab → Broker; "Portfolio" tab → Portfolio; "Wire" tab or strip → Wire; "More → Analyst" → Portfolio › Analyst; "More → Research Desk" → Research Desk; "Estate" → Businesses (homes live there until an Estate app is scheduled).

## Launcher (`Ctrl K`, or click the field or the mark)
A 640 px panel drops 12 px from the strip (220 ms fade + 4 px slide). Its input reads "Find an app, a ticker, a command". Results are grouped: **Apps**, **Tickers** (ticker, name, last price in mono, day % in colour), **Commands** ("Trade layout", "Focus mode", "Pause", "Speed 4x", "New Broker window"), and **Recent**. `↑/↓` moves, `Enter` opens and `Esc` closes. Picking a ticker opens it in the active Broker; `Shift+Enter` opens it in a new Broker. Commands never place or change orders: the launcher can open a pre-filled ticket, but only Broker's `Enter` executes.

## Focus mode (`Ctrl .`)
The fastest way to trade.
- Hides the wallpaper and shelf. The strip shrinks to 24 px and keeps only the clock, speed and net worth.
- Windows on the current workspace become borderless tiles with 1 px `line` gutters, no radius and no shadow. Title bars become 22 px with the name only, and controls appear on hover.
- If the workspace is unsnapped, it takes the Trade layout. Leaving Focus restores the previous rects exactly.
- Toasts still show, but only fills, margin warnings and world events. Everything else waits in the bell.
- Entering or leaving takes 120 ms (a fade, no movement). It's remembered per save.
- Id `focus-mode` on the root.

## Keyboard map
| Keys | Action | Scope |
|---|---|---|
| `Ctrl K` | Launcher | global |
| `Alt 1..9` | Open or focus the app in shelf slot 1–9 | global |
| `Ctrl ←/→/↑/↓` | Snap the active window (see Snap) | global |
| `Ctrl Alt ←/→` | Previous or next workspace | global |
| `Ctrl Tab` / `Ctrl Shift Tab` (tab: `` Alt ` ``) | Cycle windows on this workspace | global |
| `Ctrl W` (tab: `Alt W`) | Close the active window (Broker with a pending order asks first) | global |
| `Ctrl M` | Collapse the active window to the shelf | global |
| `Ctrl .` | Focus mode on/off | global |
| `Alt N` | New Broker window | global |
| `Space` | Pause / resume time (existing) | global, not in text fields |
| `B` / `S` | Ticket side Buy / Sell | Broker |
| `1`–`4` | Size presets | Broker |
| `/` | Ticker search in this Broker | Broker |
| `Enter` | Confirm the order. **Nothing executes without Enter** | Broker ticket |
| `Esc` | Clear the ticket, close the launcher, or dismiss the top toast | context |
| `?` | Key sheet overlay | global |

**Browser limit:** Chrome and other browsers never hand `Ctrl W`, `Ctrl Tab`, `Ctrl T`, `Ctrl N` or `Ctrl Shift N` to a page in a normal tab. So `Ctrl W` and `Ctrl Tab` work in the installed PWA, the Capacitor build and fullscreen with Keyboard Lock, and a plain browser tab uses the `Alt` fallbacks shown (the key sheet shows whichever applies). Other browser-reserved combos are never bound (`Ctrl L`, `F5`). Every binding can be remapped in Settings › Keys.

## Notifications
| Kind | Look | Sticks? |
|---|---|---|
| Fill | Toast with a neutral check glyph in `fg-muted` inside a 28 px framed square (a fill is news about an order, not an error; the buy or sell colour sits on the text only). Label "ORDER FILLED · BROKER", a mono time, then "Sold 120 BRNT at 61.30" with "Limit · fee $7.36" in `fg-muted`. Errors keep the red X | 4 s |
| Margin / warn | `warn` glyph and a 1 px `warn` left edge | until read |
| World event (Storm) | Toast with the engine headline; the banner sits at the top of Wire | 4 s |
| World event (Major) | **System overlay** over the whole desktop, strip and shelf included, using the `velvet-world-events.md` takeover timing and rules (waits for no pending order, at most 10 s; skippable after 1 s) | — |
| Messages, milestones, Wire | Bell dot only, plus a toast when the app isn't open | 4 s |

Toasts appear top-right, 10 px under the strip, 332 px wide, at most 3 stacked (the oldest leaves first). They come in with a 220 ms fade + 8 px slide from the right and leave in 120 ms. Hovering pauses the timer. Clicking opens the source window, and `Esc` dismisses. Toasts never cover the Broker ticket: if the active Broker's ticket is under the toast column, the column moves to top-left of the desktop. The bell panel lists the last 50 notifications per save. Phone: toasts drop from the status bar, one at a time.

## Phone (< 768 px): home screen and full-screen apps
| Zone | Spec |
|---|---|
| Status bar | 44 px: left the Quay mark (18 px, accent, 26 px hit area padded to 44) then "D38 · 11:20" (mono 13), right a market dot + compact net worth "$412.9k". No battery, no signal bars, no notch. Tap the mark = Home; long-press = Recent (below). Id `phone-quay` |
| Widget | 16 px from the edges, radius 20, `win` at 94% + 1 px `line`: "NET WORTH" label + rank chip, serif 44 net worth (cents 28 in `fg-muted`), today in mono with colour, sparkline 92 × 22, rank progress bar (3 px) "Next: Operator · $412.9k / $5M". Id `home-widget`. Tap opens Portfolio |
| Grid | 4 columns, 20 px row gap, icons 60 × 60 radius 16, label Inter 11.5 below. One page: no folders, no app library, no search page |
| Bottom row | 4 fixed slots on a radius-24 `chrome` panel: Broker, Portfolio, Wire, Messages. Not editable |
| Icon | A flat rounded-square tile (`win`, 1 px `line`) with one glyph at 26 px in the accent. The same family as the desktop glyphs. Locked apps use the `fg-disabled` glyph, `fg-muted` label and a tiny mono tag ("R3") |
| Badges | A 10 px accent dot with a 2 px `win` ring. Never a number |
| Edge bar | The Quay mark at 30 px in `fg-faint`, centred under the bottom row. Swipe up from it = home. Swipe from the left edge = back. Not a pill |
| Apps | Full screen with a 44 px app bar (back chevron, app name, one action). The phone layouts in each spec stay as they are; the old bottom tab bar is replaced by home + the bottom row |

Company is hidden on the phone until R2 Owner (see `velvet-company-app.md`). Apps that are unlocked but unused don't move.

### Phone app switcher: Recent
A plain list, not a carousel. No app screenshots or thumbnails and no card stack, so it reads as Quay and not as a phone OS.
| Item | Spec |
|---|---|
| Open | Long-press (400 ms) the Quay mark in the status bar, from home or any app. In the installed app (PWA / Capacitor) also: swipe up from the edge bar and hold 300 ms. A light haptic on open |
| Sheet | Bottom sheet, `ink-1`, radius 20 on the top corners only, 1 px `line` top, `--shadow-sheet`. Grab handle 36 × 4 centred, 9 px from the top. Behind it, a scrim at `--phone-scrim` dims the screen. The status bar and edge bar stay above the scrim (the clock stays live), and the mark shows pressed (accent at 16%) |
| Header | `.label` "RECENT", right-aligned `fg-faint` 11.5 "Swipe left to close" (shown until the player has closed one app) |
| Rows | Up to 6, most recent first, 60 px tall, 1 px `line` dividers. Each: a 36 px glyph tile (`ink-2`, 1 px `line`, radius 10, accent glyph 20 px), the app name (Inter 600 14), one live line in mono 11.5 `fg-muted`, and on the right a mono `fg-faint` time ("now", "11:19", or "D37" for older days) |
| Live lines | Broker: "HLCN 84.62 · ticket open" (ticker and last price of its active chart, plus "ticket open" when a ticket has input). Wire: "2 new since 11:02" (unread since last opened). Portfolio: net worth and today's % ("$412,860.15 · +0.78%"). Messages: "1 unread · Harbour Bank". Others: one status fact from their own spec (e.g. Businesses "Upkeep paid through Day 41"). Lines update live while the sheet is open, without number rolls or flashes |
| Unsent ticket | A Broker with an unsent ticket gets a 9 px accent dot (2 px `ink-1` ring) on its tile. Swiping that row closed asks nothing and **keeps the draft**: reopening Broker restores the ticket exactly. Nothing is ever sent from Recent |
| Tap | Switches to that app (220 ms: sheet out, app in). The app returns in the state it was left in |
| Swipe left | Past 72 px the row reveals "Close" (`loss` text on `loss` 12%); releasing past 50% of the width closes it. That's the same as closing a window: its state is kept, and only the running entry goes |
| Home | A ghost button at the bottom, 44 px, 1 px `line`, radius 10, with the Quay glyph in the accent and "Home". Id `recents-home` |
| Dismiss | Tap the scrim, drag the handle down, swipe down, back gesture, or `Esc` on a keyboard |
| Empty | "Nothing open." in `fg-muted` above the Home button |
| Motion | 220 ms in (sheet slides up + scrim fades, ease-out), 120 ms out. Rows don't stagger. Reduced motion: instant |
| Ids | `phone-recents`, `recents-row-<app>`, `recents-home` |

## Rank progression: the hardware and the OS
The R0–R6 ceremonies keep the `velvet-rank-ups.md` timeline. The **material beat** now shows the computer upgrading instead of a panel material.

| Rank | Desktop hardware | OS polish | Wallpaper | Phone |
|---|---|---|---|---|
| R0 Broke | A secondhand laptop: a 14 px dark bezel drawn around the viewport, a small "Port Avalon Electronics" sticker bottom-left, and a 1 px hairline crack across the top-right corner of the screen (`fg-disabled` 50%, never over controls). Boot takes 900 ms | Release "Quay 0". 1 workspace | Stock: flat `bg0` with the palette's line pattern at half strength | A used phone with a hairline crack top-left |
| R1 Hustler | A clean refurbished desktop: the bezel thins to 6 px and the crack is gone. Boot 500 ms | 1 workspace | Stock | A new phone, no crack |
| R2 Owner | A second monitor | 2 workspaces. Brushed-aluminum shelf (vertical 1 px brush at 3.5%, 1 px top highlight) | The palette wallpaper (as in the mocks) | Aluminum bottom-row panel |
| R3 Operator | A three-screen rig: hairline bezels on the workspace switcher boxes | 3 workspaces. Widgets: market clock, watchlist (both repeat data already on screen) | Palette wallpaper | Market clock widget option |
| R4 Mogul | A walnut desk edge under the shelf (4 px `#3A2A1E → #2A1E15`) with a 1 px accent inlay line | Room tone if sound is on | Palette wallpaper, night variant | Walnut edge on the bottom row |
| R5 Titan | A glass office | Strip and shelf at 86% with a 12 px blur. **Reduced transparency → R4** | Live skyline with owned buildings lit (`acc-hi` windows) | Skyline wallpaper |
| R6 Dynasty | Same rig, quieter | The calmest chrome: shelf divider and window shadows removed, accent softened to `acc-lo` on chrome | A calm sea horizon at 30% height | Horizon wallpaper |

**Hard rule:** none of these change trading speed, tick rate, order types, information shown, window limits or keyboard reach. Workspace count is layout room only (see Workspaces). Widgets only repeat data already visible elsewhere. Boot time at R0 and R1 runs **before** the save loads, never during a session. Tape asserts this (see Acceptance).

**Ceremony = OS update screen.** It follows the same rules as before: about 5 s, skippable after 1 s, waits for no pending order and 10 s idle, no world-event takeover playing, and only real cards.
| Time | Beat |
|---|---|
| 0–600 ms | The desktop dims to `bg0` at 85%. The strip and shelf stay visible but inert |
| 600–1400 ms | A centred line: `.label` "INSTALLING", then mono "Quay 2 · Owner". A 1 px accent progress hairline runs edge to edge (800 ms, linear, the only linear motion). Behind it, the hardware swaps (crack heals, bezel thins, the second-workspace box appears) in one 220 ms cross-fade |
| 1400–2600 ms | "Owner" in Instrument Serif 72 px (56 phone) rises 12 px over 420 ms, then the rank chip and net worth |
| 2600–4200 ms | Three cards as `velvet-rank-ups.md`, with card 1 now naming the hardware ("Second monitor: a second workspace") |
| 4200 ms → | One accent button, **Keep going** |

Settings › Shell lets the player pick any earned rank's look. Purchased cosmetic shells from the Boutique are marked "Purchased" and never count for Prestige (unchanged).

## Motion
| Event | Duration | Curve | Notes |
|---|---|---|---|
| Window open | 220 ms | ease-out | scale 0.98 → 1 + fade, origin = its shelf tile |
| Window close | 120 ms | ease-out | fade + scale 1 → 0.99 |
| Snap / layout | 220 ms | ease-out | rect tween; content re-lays out at the end, never mid-tween for charts |
| Collapse to shelf | 220 ms | ease-out | scale toward its tile + fade |
| Workspace switch | 220 ms | ease-out | 24 px horizontal slide + fade |
| Focus mode | 120 ms | ease-out | fade only |
| Toast in / out | 220 / 120 ms | ease-out | 8 px slide |
| Launcher | 220 ms | ease-out | fade + 4 px drop |
| Hover / press | 120 ms | ease-out | background only |
| Ambient (R4 room light, R5 skyline lights) | 2400 ms | ease-in-out | the only slow loops; none at R0–R3 |

Tokens are the DESIGN.md set: 120 / 220 / 420 / 2400 ms. There's no bounce, overshoot or spring anywhere, and no parallax. Prices never animate beyond the existing 420 ms flash and the number roll from DESIGN §5 (`--dur-slow` for big events). A window animating must never delay an order: input goes to the target window from the first frame. **Reduced motion:** every shell motion becomes instant, the ceremony becomes a static card, and the R5 blur and ambient loops are off.

## Palettes
Four palettes behind one switch (Settings › Palette, per device), all free (see Decided). Ink & Brass is the default.

**Tokens file:** `handoff/tokens.css` v2 (owner Velvet) holds every value below. Ink & Brass is the `:root` default, with every v1 token name and value unchanged. `[data-palette="broadsheet"]`, `[data-palette="phosphor"]` and `[data-palette="riviera"]` override the same names and set `color-scheme` (light for Broadsheet, dark otherwise). It also adds the Quay shell tokens: `--color-chrome`, `--color-grid`, `--radius-window`, `--radius-sheet`, `--os-*` (strip, shelf, window chrome, title font, wallpaper hooks, toast, launcher), `--btn-accent-bg`/`--btn-accent-shadow` (used by `.btn-brass`) and `--phone-*`. **Rule:** Forge only sets `data-palette` on `<html>` (absent or `ink-brass` means the default). Never set it on `body` or a subtree: the derived `--os-*` tokens resolve on `<html>`. Components never branch on palette. Name mapping: `bg0` = `ink-0`, `win` = `ink-1`, `win2` = `ink-2`, `line` = `ink-3`, `chrome` = `chrome`, `grid` = `grid`, `acc*` = `brass*` (the accent role in every palette).

| Token | Use | **Ink & Brass** | **Broadsheet** | **Phosphor** | **Riviera** |
|---|---|---|---|---|---|
| `bg0` | desktop base, wallpaper ground | #0B0D10 | #F2EDE3 | #070908 | #0E1A2B |
| `win` | window and widget surface | #12151A | #FFFFFF | #0D110F | #142338 |
| `win2` | inputs, hover, selected tab | #1A1E25 | #F6F2EA | #141A17 | #1C2E47 |
| `line` | borders, hairlines | #262B33 | #D9D0BF | #1F2723 | #2A3F5E |
| `chrome` | status strip, shelf, phone bottom row | #0E1014 | #E8E1D3 | #090C0B | #0F1C2E |
| `grid` | chart grid | #1A1E25 | #EEE8DC | #141A17 | #1C2E47 |
| `fg` | primary text | #ECE9E2 | #1B1A17 | #D8F3E6 | #F4ECDD |
| `fg-muted` | secondary text | #9AA0A8 | #5E5A52 | #93AA9E | #AEB6C2 |
| `fg-faint` | labels, captions | #7E848E | #67625A | #7A9085 | #929CAB |
| `fg-disabled` | disabled, decoration | #5F656E | #A39C8F | #4A5A52 | #5D6C82 |
| `acc` | primary action, rank, last price, active | #C9A45C | #8C2F2B | #FFB23F | #E8836B |
| `acc-hi` / `acc-lo` | button gradient, chip text / MA line, R6 | #E6CB8F / #B08A45 | #A8443E / #6E2320 | #FFC86E / #D9922A | #F2A48F / #C96A53 |
| `on-acc` | text on accent | #16120A | #FFFFFF | #1A1206 | #1A0F0B |
| `gain` / `loss` | up / down | #3FD1B0 / #FF6B5A | #1F7A5A / #B3261E | #5CE1E6 / #FF5C8A | #7FD4B5 / #F06C5F |
| `warn` / `info` | warnings / macro news | #F2B33D / #6EA8FE | #9A6100 / #2F5E9E | #F5D547 / #8AB4FF | #F2C14E / #8FB8E8 |

| Palette | Character | Wallpaper | Extras (decided, kept) |
|---|---|---|---|
| **Ink & Brass** | A private bank at night. The approved baseline | Dark ink with a faint brass line drawing of the harbour: skyline, cranes, lighthouse, the quay and its piers | none |
| **Broadsheet** | Morning newsprint: paper, ink and an oxblood pen. The only light palette, for daytime play | Off-white with a halftone engraving of the harbour, a hatched sun and ruled water, and a small engraved caption | Flat accent button (no gradient). Top Wire headline 22 px serif |
| **Phosphor** | The night desk terminal: amber on black-green, with a cyan/magenta gain/loss pair that's easier for red-green colour blindness | A dark 48 px grid with faint amber contour lines (bathymetry of the bay) | Window radius 6. Window titles and labels in mono caps. Top Wire headline in Inter 600. No scanlines, glow or flicker |
| **Riviera** | A mid-century travel poster of the bay at dusk | Flat poster shapes: navy-to-coral sky, low coral sun, hills, a lit skyline, sun stripes on the water, a sailboat | none |

**Contrast** (WCAG, measured on `win` / `win2` / `chrome`):
| | `fg` | `fg-muted` | `fg-faint` | `gain` | `loss` | `on-acc` on `acc` |
|---|---|---|---|---|---|---|
| Ink & Brass | 15.1 / 13.8 / 15.7 | 6.9 / 6.3 / 7.2 | 4.9 / **4.4** / 5.1 | 9.5 / 8.7 / 9.9 | 6.5 / 6.0 / 6.8 | 8.0 |
| Broadsheet | 17.4 / 15.6 / 13.4 | 6.9 / 6.1 / 5.3 | 6.0 / 5.4 / 4.6 | 5.3 / 4.7 / 4.0 | 6.5 / 5.9 / 5.0 | 8.2 |
| Phosphor | 16.2 / 15.0 / 16.7 | 7.7 / 7.1 / 7.9 | 5.6 / 5.2 / 5.8 | 12.1 / 11.2 / 12.5 | 6.5 / 6.0 / 6.7 | 10.3 |
| Riviera | 13.5 / 11.7 / 14.6 | 7.7 / 6.7 / 8.4 | 5.7 / 4.9 / 6.2 | 9.0 / 7.8 / 9.8 | 5.3 / 4.6 / 5.7 | 7.1 |

All body text is ≥ 4.5:1 and gain/loss text ≥ 3:1 on every window surface. Adjustments from the brief: Broadsheet `warn` went from #A86A00 (4.4:1 on white) to **#9A6100** (5.1:1). Broadsheet `fg-faint` is **#67625A**, darkened from a first pick of #6E695F that failed on `chrome` (4.2:1). The existing exception carries over: Ink & Brass `fg-faint` on `win2` is 4.4:1, so no faint text on hover rows (DESIGN §2).

## Accessibility
- All shell actions work by keyboard. Focus rings are 2 px accent at 2 px offset, always visible on keyboard focus.
- Windows are `role="dialog"` with `aria-labelledby` set to the title. The shelf is a `toolbar`, the launcher a `combobox` + `listbox`, and the toasts sit in an `aria-live="polite"` region (fills and world events `assertive`).
- Colour is never the only signal: running dots pair with a tooltip, the active window has an accent line **and** a weight change, and gain and loss always carry a sign.
- Touch targets ≥ 44 px on phone and on touch desktops, where the title-bar controls grow to 44 × 44.
- Reduced motion (see Motion). Reduced transparency: R5 falls back to R4, and the strip goes solid. High contrast: `line` steps up to `fg-disabled`, and the wallpaper drops to `bg0`.
- Photosensitivity: no flashing above once per second, and no full-screen colour changes (world-events rules).
- Phosphor is offered first in Settings › Palette to players who turn on "colour-blind friendly gains and losses".

## Test ids
`os-root` (on `<html>`, carrying `data-palette`; classes `shell-r0`…`shell-r6`, `focus-mode`), `os-mark`, `os-strip`, `os-launcher`, `os-launcher-input`, `os-launcher-result-<kind>-<n>`, `os-clock`, `os-speed-<pause|1x|4x|20x>`, `os-rank`, `os-networth`, `os-bell`, `os-shelf`, `shelf-app-<app>`, `shelf-layout`, `shelf-focus`, `ws-<n>`, `win-<app>` (+ `win-broker-<n>`), `win-<app>-collapse`, `win-<app>-fill`, `win-<app>-close`, `snap-preview`, `os-toast-<n>`, `os-overlay-world-event`, `os-update` (ceremony), `os-crack`, `os-bezel`, `home`, `home-widget`, `home-app-<app>`, `home-row`, `home-edge`, `phone-quay`, `phone-recents`, `recents-row-<app>`, `recents-home`, `os-compact` (on the root at 768–1199 px). App ids: `broker`, `portfolio`, `wire`, `messages`, `businesses`, `ailab`, `research`, `bank`, `legal`, `security`, `boutique`, `settings`, `company`.

## Acceptance
- **No rank advantage:** Tape runs the same seeded session at R0 and at R6 (via `grantCash`) and asserts identical tick timing, order-to-fill latency, available order types, Broker instance limit and launcher results. A test placing an order by keyboard from a cold start takes the same number of keypresses at every rank.
- **Nothing executes without Enter:** launcher commands, layouts and Focus never create or change an order (e2e checks the order list before and after each).
- Applying the Trade layout at 1440 × 900 places Broker, Wire and Portfolio in the slot rects defined under Snap, within 1 px. The mocks show a free (hand-placed) arrangement of the same three windows, with wallpaper left visible.
- Window rects and snap slots survive save → reload, per save file.
- Focus mode on → trade → off restores the exact previous rects. In Focus, the order ticket stays reachable and no toast overlaps it.
- At most 3 toasts are visible, each leaves after 4 s, and the Major world event shows `os-overlay-world-event` above windows, strip and shelf.
- In a browser tab, the `Alt` fallbacks work and no game binding fights a browser shortcut. In the installed PWA, `Ctrl W` closes the game window, not the app.
- Palette switch changes only token values: a DOM snapshot of the component tree is identical across the four palettes, apart from `data-palette` on `<html>` (the Phosphor and Broadsheet extras are tokens too).
- Contrast check script (Tape) passes the table above for every palette.
- Reduced motion: no shell transition longer than 0 ms. Reduced transparency: no `backdrop-filter` in the tree.
- Performance: dragging or snapping a window during 20x speed keeps chart updates at 60 fps on Tape's desktop profile, and window open stays ≤ 1 frame of input delay.
- Visual sign-off at 1440 × 900, **1000 × 800** (compact, Broker + Wire halves) and 390 × 844 for each palette (the 8 mocks plus a compact shot), plus the R0, R3 and R5 hardware looks, the OS update ceremony and the phone Recent sheet.
- Compact: at 900 px wide only one window is visible and halves snap is refused. At 1000 px Broker + Wire halves work. Thirds, quarters and layouts are absent below 1200. Rects saved at 1440 are restored exactly after shrinking to 900 and growing back.
- Recent: long-press on `phone-quay` opens `phone-recents` with at most 6 rows, newest first. Swiping Broker with a draft closed keeps the draft (reopen → same ticket, no order created). No row contains an image.
- Palettes: with `data-palette` absent, every v1 token in `handoff/tokens.css` computes to its v1 value. With each palette set, the computed values match the palette tables here.
- Grep: no "Windows", "macOS", "iOS", "Android", "Start", "Dock" or "Finder" strings in UI copy. Glyph review against real OS icon sets at sign-off.

## Decided (Mathis, 2026-10-09)
1. **Ink & Brass is the default palette** for every new player and every device.
2. **Broadsheet, Phosphor and Riviera are free** in Settings › Palette from day 1. Palettes are never sold in the Boutique, never earned through rank, and never count for Prestige.
3. **The per-palette extras stay:** Phosphor uses a 6 px window radius and mono caps window titles and labels; Broadsheet uses a flat accent button and a bigger (22 px) lead Wire headline. They're token values (`handoff/tokens.css`), not component branches.
