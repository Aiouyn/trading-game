# 17 — UX, Screens and Design System

Module owner: UX. Status: complete specification, 2026-10-18. Follows the module template of 00 §3.3.
Sources kept: original vision 04 §9–§13 (Ink & Brass, shells, key screens, accessibility), 02 §3.4, §8.4, §12.2, §12.6, 06-cities §9–§10, 06-cities-proposal LC01, LC02, LC16, MASTER-BIBLE PART V #4, and the later Velvet build specs in the repository (DESIGN.md v1.2, the Quay desktop OS, rank-ups, daily close, bankruptcy, world events, rewarded ads, rivals board, trade journal, Research Desk, Company app), which are treated as decided material. V3 Parts 4, 8, 9 and 10 add the expert platform, the integrity report, institutional identity and the systemic-risk dashboards.

What this file owns: navigation, the shell, every screen's layout, components, states and actions, design tokens, motion, sound, haptics, accessibility, localization, client performance, and the client-side information-hygiene rules. What it does not own: any game rule or number. A screen shows numbers computed by the owning module; the client never computes an economic number of its own (rule §3.11.1).

Rank names follow 00 §5.8 (R0 Broke, R1 Hustler, R2 Owner, R3 Mogul, R4 Tycoon, R5 Titan, R6 Dynasty). Older UX documents call R3 "Operator" and R4 "Mogul"; wherever such text is reused here, 00's names replace them. Rank thresholds are 14's; this file assumes 14 keeps the original values ($20k, $250k, $5M, $100M, $2B, top 50 of the world board) and reads them only through `rank.thresholds()` (§2.6).

---

## §1 Purpose

The game is one of the deepest financial simulations ever built and it must still be legible to a newcomer on a phone (V3 test T4). The interface is the part of the game that makes that possible. It has five jobs:

1. **Make the same economy readable at every depth.** Simple views and expert views issue the same intents against the same rules (D04). Nothing is hidden behind a mode except clutter.
2. **Make money feel like something.** The shell material, the Estate, the city and the moments turn net worth into a place and an identity (04 §0.1, §0.2).
3. **Respect the tick.** Everything resolves on the 5-second tick; the interface shows exactly that, with no false precision, no client prediction of money, and no animation that delays an order.
4. **Protect fairness and privacy.** The client shows only what the server sends, renders hostile and legitimate things identically where the rules require it, and never lets a richer shell, a faster device or a script see more than anyone else.
5. **Respect the player's time and wellbeing.** Notification caps, no streaks, no gambling cues, no fake urgency, honest disclaimers (04 §11.3, L5).

---

## §2 Entities

All types are client- or account-level presentation state. None of them carries money or game truth. Server-stored preferences live in 19's `account_prefs` table; device-local state lives in IndexedDB under the key `quay.<accountId>`.

### §2.1 Account-level UI preferences (server-stored, synced across devices)

```ts
type ShellId = 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'r6' | `cosmetic_${string}`;
type PaletteId = 'ink-brass' | 'broadsheet' | 'phosphor' | 'riviera';
type Locale = 'en' | 'fr';                       // L8; more locales append later
type DetailMode = 'simple' | 'pro';

interface AccountUiPrefs {
  accountId: string;
  shell: ShellId;                                // any earned rank shell or an owned cosmetic shell
  locale: Locale;
  numberLocale: string;                          // BCP-47, default = device locale; controls grouping/decimal marks
  timeDisplay: 'game' | 'game+real';            // default 'game'; 'game+real' adds real-time hints
  detailMode: Record<AppId, DetailMode>;         // per app; default 'simple' for Broker until first fill + 3 trades, then the player chooses
  sound: { master: number /*0..1*/; music: number; ui: number; enabledOnPhone: boolean };
  haptics: boolean;                              // default true on touch devices
  reducedMotion: 'system' | 'on' | 'off';        // default 'system'
  reducedTransparency: 'system' | 'on' | 'off';
  highContrast: boolean;                         // default false
  colorBlindPair: boolean;                       // default false; when true, gain/loss use the Phosphor pair in every palette
  textScale: number;                             // 1.0..2.0, default 1.0
  notifications: NotificationPrefs;
  privacy: PresentationPrivacy;
  layouts: SavedLayout[];                        // max PARAM.ui_layouts_max = 5
  shelfOrder: AppId[];                           // Broker is always first
  watchlists: Watchlist[];                       // max 20 lists × 50 symbols (02 §3.4 ticker channel limit is 50 per subscription)
  dismissed: Record<string, Tick>;               // one-time hints and cards by key
}

interface NotificationPrefs {
  push: Record<NotifyCategory, boolean>;         // all default false until permission granted, then per §3.10.5 defaults
  email: 'off' | 'daily' | 'weekly';             // default 'off'
  quietHours: { start: string; end: string; tz: string }; // default 22:00–08:00 device tz (PARAM.ui_quiet_start/end)
  lastPermissionAskRealMs: number | null;        // re-ask gate (PARAM.ui_push_reask_days)
}

interface PresentationPrivacy {
  showHomeInCity: boolean;                       // default false (06-cities §10, opt-in)
  showEstateToVisitors: boolean;                 // default true for the illustration, false for item values
  crownTowerName: 'handle' | 'private';          // default 'handle'
  showNotorietyOnProfile: boolean;               // default false (03 opt-in rule)
  shareDefaults: 'pnl_only';                     // fixed; share sheets always start minimal (§3.21)
}

interface SavedLayout { id: string; name: string; viewportClass: 'desktop'; windows: WindowRect[]; }
interface Watchlist { id: string; name: string; assetIds: string[]; }
```

### §2.2 Device-local UI state (IndexedDB, never sent)

```ts
type AppId =
  | 'broker' | 'portfolio' | 'wire' | 'messages' | 'markets' | 'risk' | 'quantlab' | 'research'
  | 'businesses' | 'company' | 'property' | 'city' | 'bank' | 'funds' | 'institutions' | 'insurance'
  | 'ailab' | 'security' | 'legal' | 'estate' | 'boards' | 'profile' | 'alliance' | 'contracts'
  | 'auctions' | 'civic' | 'academy' | 'help' | 'atelier' | 'settings' | 'replay' | 'api';

interface WindowRect { app: AppId; instance: number; x: number; y: number; w: number; h: number;
                       snap: SnapSlot | null; workspace: 1 | 2 | 3; collapsed: boolean; context?: string; }
type SnapSlot = 'L1/2'|'R1/2'|'L1/3'|'C1/3'|'R1/3'|'L2/3'|'R2/3'|'TL'|'TR'|'BL'|'BR'|'FILL';

interface ShellLocalState {
  palette: PaletteId;                            // per device (Quay decision 2026-10-09)
  windows: WindowRect[];
  compact: { visible: AppId | null; halves: [AppId, AppId] | null };
  focusMode: boolean;
  activeWorkspace: 1 | 2 | 3;
  ticketDrafts: Record<string /*broker instance*/, OrderDraft>; // kept until sent or cleared (Recent rule)
  lastSeenTick: Tick;                            // for reconnect replay (02 §3.4)
  renderTierOverride: 'auto' | 'T0' | 'T1' | 'T2';
  myCityOverlay: boolean;                        // computed locally, never uploaded (06-cities §10)
  connectionNotes: Record<string /*entry label lineage id*/, { tag: 'trusted'|'watch'|null; note: string }>;
}

interface OrderDraft { assetId: string; side: 'buy'|'sell'; type: string; qty: string; limit?: string; stop?: string; tif?: string; algo?: AlgoDraft; }
interface AlgoDraft { kind: 'twap'|'vwap'|'pov'|'iceberg'; params: Record<string, string>; }
```

Rule: `connectionNotes` are device-local by default, with an explicit "Sync my notes" toggle (default off) that stores them encrypted under the account in 19's `account_private_notes`. The server never reads them; they are never used by any game rule (04 §10.5 rule 4: "the game never cross-checks for you").

### §2.3 Notifications, alerts and moments

```ts
type NotifyCategory =
  | 'security_flag' | 'attack_detected' | 'margin' | 'liquidation' | 'contract_signature' | 'lawsuit'
  | 'verdict' | 'league_result' | 'rival_moved' | 'goal_reached' | 'auction_outbid' | 'auction_won'
  | 'fund_gate' | 'bank_run' | 'world_event' | 'chapter' | 'message' | 'alliance' | 'held' | 'system';

type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
// P0 critical money-at-risk now (margin call, liquidation warning, Held starting, attack detected on you)
// P1 needs a decision soon (contract signature, lawsuit filed, auction outbid, fund gate vote, appeal deadline)
// P2 important result (fill, verdict, league result, rank-up, world event onset)
// P3 informative (Wire item you follow, rival moved, message)
// P4 ambient (milestone, oddity on a model, city brief item)

interface UiNotification {
  id: string; tick: Tick; category: NotifyCategory; priority: Priority;
  titleKey: string; bodyKey: string; params: Record<string, string>;   // localized at render (§3.17)
  sourceEventSeq: number;                        // the EngineEvent it was derived from (00 §5.6)
  deepLink: ScreenRoute;
  read: boolean; pushed: boolean; emailed: boolean;
}

type MomentKind = 'rank_up' | 'world_event_takeover' | 'milestone_major' | 'unique_reveal' | 'verdict'
                | 'hacked_pulse' | 'daily_close' | 'chapter_end' | 'ipo_bell' | 'gilt_cover';
interface Moment { id: string; kind: MomentKind; createdTick: Tick; payload: unknown; expiresRealMs: number; }
```

### §2.4 Screen registry and routing

```ts
interface ScreenRoute { screen: ScreenId; params?: Record<string, string>; }  // e.g. { screen:'BRK-02', params:{asset:'ast_EQ_HALC'} }
type ScreenId = string;  // the IDs of §7, e.g. 'SH-12', 'LAB-07'

interface ScreenDef {
  id: ScreenId; app: AppId; titleKey: string;
  unlock: UnlockRule;                            // §3.2.4
  channels: ChannelId[];                         // subscriptions opened while visible (§2.6)
  minWidthDesktop: number; phone: 'full' | 'sheet';
}
type UnlockRule =
  | { kind: 'always' }
  | { kind: 'rank'; min: Rank }
  | { kind: 'license'; min: License }
  | { kind: 'charter'; charter: string }
  | { kind: 'nw'; minNw: Money }                 // first time NW ≥ value; never re-locks
  | { kind: 'flag'; flag: string };              // server-provided capability flag (e.g. 'api.eligible')
```

Deep links: every screen has a URL `/{app}/{screenId}?{params}` (Next.js app router; 19 owns the routing package). Notifications, Wire items, share cards and the launcher all navigate through `ScreenRoute`.

### §2.5 Design tokens (typed constants)

```ts
interface PaletteTokens {
  bg0: string; win: string; win2: string; line: string; chrome: string; grid: string;
  fg: string; fgMuted: string; fgFaint: string; fgDisabled: string;
  acc: string; accHi: string; accLo: string; onAcc: string;
  gain: string; loss: string; warn: string; info: string;
  steel: string; signal: string;                 // Shadow sub-palette (L4); same in every palette unless listed
  colorScheme: 'dark' | 'light';
}
interface TypeTokens { display: string; ui: string; num: string; sizes: number[]; }
interface MotionTokens { fast: 120; base: 220; slow: 420; ambient: 2400; tick: 5000; easeOut: string; easeInOut: string; }
```

Values are in §3.3. The single source of truth at build time is `packages/ui/tokens.css` (19 owns the package layout; this file owns the values). Components never contain hex values; a lint rule fails any hex literal outside the tokens file.

### §2.6 Client data interfaces assumed from other modules

The client subscribes to channels over the gateway (19 owns the protocol; this table is the exact shape this file assumes, extending 02 §3.4). Every payload is a delta keyed by tick; money arrives as decimal strings (00 §3.1).

| Channel | Owner | Payload (shape assumed) | Cadence |
|---|---|---|---|
| `clock` | 02 | `{tick, gameDay, tickOfDay, phase: 'pre'|'open_auction'|'continuous'|'close_auction'|'after'|'weekend', weekday, quarter, year, chapter}` | every tick |
| `me` | 03/19 | balances by currency, NW (marked), NWI, restricted-cash buckets `{reason, amount, untilRealMs}`, positions summary, fills, open orders, margin summary, alerts, holds, Held state, protection `{endsRealMs, rookieUntil}` | every tick (delta, often empty) |
| `ticker:{listId}` | 05 | `{assetId, last, chg, chgPct, vol, phase, halted}` ×≤50 | every tick |
| `book:{assetId}` | 05 | public depth levels as 05 publishes them (top 10 per side), last auction result `{price, qty, imbalance?}` | every tick, only while a Broker shows the asset |
| `tape:{assetId}` | 05 | aggregate executed prints per tick (no account ids) | every tick while visible |
| `candles:{assetId}:{res}` | 19 read model | OHLCV at 1 tick, 1 game hour, 1 game day | on request + live bar |
| `news` | 16 | Wire items filtered by regions, holdings, follows `{id, kind, headlineKey|text, entities, tick, credibility?, pricedInBand?, causeLinks[]}` | on change |
| `filings` | 15/13 | public filings | on change |
| `board:{boardId}:{scope}` | 15 | top 100 rows + my row | every game hour (top), daily (full) |
| `league:{groupId}` | 15 | group table | every game hour |
| `city:{cityId}` | 10 | district indices, rents, listings count, public building changes, city brief items | on change |
| `macro:{bloc}` | 04 | macro state as published (prints only, never hidden variables) | at publication |
| `system:risk` | 07/08/20 | systemic indicators (§7.5 MKT-07) | every game hour |
| `me.connections` | 11/12 | connection rows, identical fields for every entry (§3.11.3) | at most once per 30 ticks (PARAM.ui_connections_refresh_ticks) |
| `me.lab` | 11 | models, runs, compute, data, DU usage | on change |
| `me.security` | 12 | defense stack, scans, anomaly feed, own ops and sessions | on change |
| `me.legal` | 13 | cases, evidence visible to me, deadlines, sanctions | on change |
| `case:{caseId}` | 13 | public docket entries for a case | on change |
| `alliance:{id}` | 15 | treasury, roles, ops board, chat | on change |
| `chat:{channelId}` | 15 | messages | live |
| `auction:{lotId}` | 15/14 | bids, current price, end tick, anti-snipe extension | every tick while open |
| `fund:{fundId}` | 08 | public NAV, track record, fees, gates; full data for manager and investors | daily NAV; live for manager |
| `inst:{entityId}` | 07/08 | institution console data for its owner | every tick (owner only) |
| `company:{cmpId}` | 09 | public filings for everyone; full internals for owner | on change |
| `rank` | 14 | `{rank, thresholds[], nextAt, shellsEarned[], prestige, reputation, notoriety?}` | on change |
| `onboarding` | 18 | `OnboardingProgress` (18 §2) | on change |

Read APIs (request/response, 19): asset directory, history, statements (03), archive (16), replay (02/19), Hall of Fame (15), Gilt List issues (14/15), Academy content (18), help articles (18).

---

## §3 Rules and formulas

### §3.1 Design principles (binding on every screen)

1. **Brass is earned.** The accent marks wealth, rank, the one primary action of a view and the last-price tag. Never decoration, never more than one accent button per view.
2. **Numbers are mono, always.** Every changing value uses the numeric face with tabular figures; numeric columns right-align.
3. **Colour is never the only signal.** Gain and loss always carry a sign (`+`, or the true minus U+2212) and, in lists, an arrow (▲ ▼). Attack and alert states always carry an icon and text.
4. **Borders, not shadows.** Surfaces separate with `line` hairlines. Only windows and sheets cast a shadow.
5. **Motion explains a change.** Something moves only because a value or a state changed. Only the tick ring and declared ambient loops repeat.
6. **The server is the truth.** No client-side money prediction; pending orders show as pending until the fill delta arrives (02 §3.4).
7. **Same economy, different views.** Simple and Pro views of one feature call the same intents with the same validation (D04).
8. **Every cost before commitment.** Any action that costs money, time, reputation or exposure shows the cost and the consequence before confirmation (03 principle 6, E02, C05).
9. **Nothing executes without an explicit confirm.** Launcher commands, layouts, keyboard shortcuts, notifications and pre-fills never submit an intent by themselves.
10. **Calm by default.** One loud thing at a time (§3.9). Routine activity never interrupts; the player is interrupted only for a decision, material exposure, or something they chose to follow (W07).

### §3.2 Navigation: the Quay shell

The game is played on a computer the character owns. Its operating system is **Quay** (decided Velvet spec, 2026-10-09). Each system is an **app** that opens in a window (desktop) or full screen (phone). This replaces the five bottom tabs of 04 §10.1; the five tab names survive as the five app groups.

#### §3.2.1 Desktop (≥ 1200 px)

| Zone | Size | Contents |
|---|---|---|
| Status strip (top) | 34 px, `chrome` at 94%, 1 px `line` bottom | Quay mark + "Quay" + release ("Quay 2 · Owner") · launcher field "Find an app, a ticker, a command" with `Ctrl K` (312 px) · centre: game clock "Day 38 · 11:20" (mono), market phase dot + label ("Market open · Port Avalon"), tick ring 22 px · right: protection chip while active ("Protected · 41:12"), shield chip during a heat shield or Lockdown shield, rank chip, net worth (mono) with today's %, bell |
| Alert banner slot | 0 or 34 px under the strip | at most one banner (§3.10.3), never over a ticket |
| World-event banner slot | 0 or 34 px | during Storm/Major/Crisis week (§7.1 SH-08) |
| Desktop | remaining | wallpaper (rank material) and windows |
| Shelf (bottom) | 52 px, `chrome` | app tiles 40 × 40 in shelf order with group dividers; right: layout button, Focus button (`Ctrl .`), workspace switcher |

There is **no speed control** in the shared world (1 real hour = 1 game day, L9). The speed control of the old solo prototype exists only inside Academy practice worlds (18 §3.10) and replay viewers.

#### §3.2.2 Compact desktop (768–1199 px)

One window at a time filling the work area (8 px gutter). From 1000 px two windows may sit as halves. Thirds, quarters, named layouts and free placement need ≥ 1200 px and are hidden (not greyed) below it. Rects saved at ≥ 1200 px are kept and restored exactly when the viewport grows back. Broker has a narrow form from 480 px (chart above a docked ticket; `Chart · Ticket` toggle under 560 px height).

#### §3.2.3 Phone (< 768 px)

| Zone | Spec |
|---|---|
| Status bar | 44 px: Quay mark (tap = Home, long-press 400 ms = Recent), "D38 · 11:20" mono 13, market dot, compact NW. Protection or shield chip replaces the market label when active |
| Home widget | NET WORTH label + rank chip, serif 44 px NW, today's change, 92 × 22 sparkline, rank progress bar ("Next: Mogul · $412.9k / $5M") |
| App grid | 4 columns, icons 60 × 60, labels 11.5 px. One vertical page grouped under five small labels: **Trade**, **Build**, **Shadow**, **World**, **Me**. No folders, no second page; the page scrolls vertically when needed |
| Bottom row | 4 fixed slots: Broker, Portfolio, Wire, Messages |
| Edge bar | Quay mark 30 px; swipe up = Home; swipe from left edge = back |
| Apps | full screen with a 44 px app bar (back chevron, app name, one action) |
| Recent | bottom sheet list of up to 6 running apps with one live line each (Quay spec); swiping a Broker with a draft keeps the draft |

#### §3.2.4 App catalog, groups and visibility

| # | App | Group | Contents (screens in §7) | Unlock rule | Teaser before unlock |
|---|---|---|---|---|---|
| 1 | Broker | Trade | terminal for every asset class | always | — |
| 2 | Portfolio | Trade | NW, positions, orders, journal, statements, taxes, cash | always | — |
| 3 | Wire | Trade | news, filings, Whale Watch, rumors, archive, Gilt List | always | — |
| 4 | Messages | Trade | inbox, DMs, channels, NPC correspondence | always | — |
| 5 | Markets | Trade | directory, screener, calendars, macro, central banks, curves, sovereigns, systemic risk, integrity report | always (Simple: directory + calendars) | — |
| 6 | Risk | Trade | VaR/ES, exposures, stress, margin forecast | license ≥ LIC2 | locked tile visible from R1 |
| 7 | Quant Lab | Trade | research projects, backtests, withheld-world validation | rank ≥ R2 | visible-locked from R1 |
| 8 | Research Desk | Trade | analyst, "Why it moved" dossiers | rank ≥ R3 (analyst hire from day 1 lives in Portfolio) | visible-locked from R2 |
| 9 | Businesses | Build | catalog, owned businesses, staff, contracts, supply chain | always | — |
| 10 | Company | Build | own companies, filings, IPO, M&A, LBO, restructuring, venture | rank ≥ R2 | hidden until R1, then locked tile |
| 11 | Property | Build | listings, owned property, mortgages, management, development | always (intro at NW $50k, 18) | — |
| 12 | City | Build | map, districts, crown towers, city brief | always | — |
| 13 | Bank & Credit | Build | accounts, loans, margin centre, repo, securities lending, prime brokerage, collateral | always (loans from R1, repo/prime per 07 eligibility) | — |
| 14 | Funds | Build | fund marketplace, my investments, my fund, ETF AP desk, structured products | always (invest per 08 eligibility) | — |
| 15 | Insurance | Build | policies, quotes, claims | always | — |
| 16 | Institutions | Build | charters, bank console, insurer console, CCP membership, market-maker console, custodian, issuer desk, sovereign-adjacent | flag `charter.anyAvailable` (13) or any charter held | visible-locked from R3 |
| 17 | AI Lab | Shadow | compute, data, algorithms, runs, models, strategy graphs, mandates, licensing, tournaments, governance | NW ≥ $100k first time (04 §4.3) | visible-locked from minute 7:30 of onboarding ("The Lab opens at $100k") |
| 18 | Security | Shadow | defense, connections, scans, ops planner, sessions, incidents, honeypots, Back Room | always | — |
| 19 | Legal & Court | Shadow | docket, cases, filing, regulators, licenses, whistleblower, arbitration, Held | always | — |
| 20 | Estate | Me | home, Vault, Showroom, collections, hosting, clubs, philanthropy, Chief of Staff | always | — |
| 21 | Boards | World | chapter hub, leaderboards, leagues, Hall of Fame, recap, Finals, tournament board | always | — |
| 22 | Profile | Me | own and public profiles, Legacy, dynasty | always | — |
| 23 | Alliance | World | HQ, treasury, roles, ops board, syndicates | game day 3 of the character or first invite (04 §4.3) | hidden before |
| 24 | Contracts | World | inbox, builder, escrow, templates | account upgraded from guest (02 §5.1) | locked with "Create an account to sign contracts" |
| 25 | Auctions | World | auction house, business/property exchange, data and model markets, estate sales and concessions | always (bidding needs account) | — |
| 26 | Civic | World | politics, bills, lobbying, elections, named actors, dynasties, discoveries | always (lobbying per 16 eligibility) | — |
| 27 | Academy | Me | courses, practice worlds, drills, badges (18) | always | — |
| 28 | Help | Me | search, glossary, contextual help, support | always | — |
| 29 | Atelier | Me | real-money cosmetics and the cosmetic chapter pass (21; named "Atelier" so it never collides with 14's in-game luxury "Boutique", which lives in Estate; ruling in 24) | always | — |
| 30 | Settings | Me | account, palette, shell, sound, motion, accessibility, keys, notifications, privacy, data | always | — |
| 31 | Replay | World | event replays, spectator pages | always | — |
| 32 | API | Trade | API keys, scopes, usage (19) | flag `api.eligible` (19) | hidden before |

**Visibility algorithm** (runs on every `rank`/`me` delta):
```
for app in catalog:
  if unlocked(app.unlock): state = 'unlocked'
  else if teaserRuleMet(app): state = 'locked'     // tile in fg-disabled, tag "R3" or "$100k", tooltip names the unlock; no upsell, no badge
  else: state = 'hidden'
unlocked(rule) is sticky: once true for a character, it stays true (rank is never lost, 14), except
  license/charter rules, which follow the live license state (a revoked license re-locks its screens but keeps read-only history).
```
The shelf and phone grid show `unlocked` and `locked` apps. A newly unlocked app gets one accent dot (never a number) until first opened.

#### §3.2.5 Window model, snap, workspaces, focus mode and launcher

As the Quay spec, kept in full:
- Frames: `win` background, 1 px `line`, radius 10 (Phosphor 6), one soft shadow. Title bar 32 px: app glyph + name + context ("HALC · 30m"), controls Collapse (short bar), Fill (`[ ]`), Close (diagonal cross); monochrome; 44 × 44 hit areas on touch.
- Minimum sizes: Broker 720 × 420 (narrow form 480), Wire 360 × 280, Portfolio 520 × 220, map apps (City, Civic dynasty graph) 560 × 400, all others 420 × 300.
- Instances: one per app, except Broker (PARAM.ui_broker_windows_max = 4), Research Desk files (one per file), case views (one per case, max 4), and Replay (max 2).
- Snap slots: halves, thirds (cycle with `Ctrl ←/→`), quarters, fill. Named layouts: **Trade** (Broker 2/3 left, Wire top-right 1/3, Portfolio bottom-right 1/3; default for a new account), **Review** (Portfolio left, Journal right), **Research** (Research Desk 2/3, Broker top-right, Wire bottom-right), **Operator** (Businesses left 1/2, City top-right, Property bottom-right), **Shadow** (Security left 1/2, AI Lab right 1/2), **Institution** (Institutions 2/3, Markets › System bottom-right, Messages top-right), plus up to 5 custom.
- Workspaces: R0–R1 one, R2 two, R3+ three. Layout room only; every app opens on workspace 1 at every rank.
- Focus mode (`Ctrl .`): hides wallpaper and shelf; strip 24 px with clock, tick ring and NW; borderless tiles; toasts limited to fills, P0 alerts and world events.
- Launcher (`Ctrl K`): groups Apps, Tickers (ticker, name, last, day %), Players and companies (public names only), Commands, Recent, Help articles. Commands open screens or pre-filled tickets; they never place or change an order. Natural commands supported (04 §10.1): `buy 100 HALC limit 42` opens a pre-filled Broker ticket; `go to <name>` opens an asset, company, player profile or city; `upgrade <business>` opens that upgrade's confirm sheet.

#### §3.2.6 Keyboard map (desktop)

| Keys | Action | Scope |
|---|---|---|
| `Ctrl K` | Launcher | global |
| `Alt 1..9` | Open or focus shelf app 1–9 | global |
| `Ctrl ←/→/↑/↓` | Snap active window | global |
| `Ctrl Alt ←/→` | Workspace | global |
| `Ctrl Tab` / `Alt \`` | Cycle windows | global |
| `Ctrl W` / `Alt W` | Close window (asks first if a ticket has input) | global |
| `Ctrl M` | Collapse | global |
| `Ctrl .` | Focus mode | global |
| `Alt N` | New Broker window | global |
| `B` / `S` | Ticket side | Broker |
| `1`–`4` | Size presets 10 / 25 / 50 / Max (% of buying power for buys, of position for sells) | Broker |
| `/` | Ticker search in this Broker | Broker |
| `Enter` | Confirm the order; nothing executes without it | Broker ticket |
| `Esc` | Clear ticket / close launcher / dismiss top toast | context |
| `G` then `P/W/M/L/S` | Go to Portfolio / Wire / Messages / Legal / Security | global |
| `?` | Key sheet | global |

Browser-reserved combinations are never bound; `Alt` fallbacks are shown in browser tabs. Every binding is remappable (Settings › Keys). Shortcuts are disabled inside text inputs and on touch-only devices. Space does **not** pause anything in the shared world; inside practice worlds and replays it pauses that sandbox only.

### §3.3 Design tokens

#### §3.3.1 Colour (four free palettes; Ink & Brass is the default, L4)

| Token | Use | Ink & Brass | Broadsheet | Phosphor | Riviera |
|---|---|---|---|---|---|
| `bg0` | base, wallpaper ground | #0B0D10 | #F2EDE3 | #070908 | #0E1A2B |
| `win` | window, card | #12151A | #FFFFFF | #0D110F | #142338 |
| `win2` | inputs, hover, selected | #1A1E25 | #F6F2EA | #141A17 | #1C2E47 |
| `line` | borders | #262B33 | #D9D0BF | #1F2723 | #2A3F5E |
| `chrome` | strip, shelf | #0E1014 | #E8E1D3 | #090C0B | #0F1C2E |
| `grid` | chart grid | #1A1E25 | #EEE8DC | #141A17 | #1C2E47 |
| `fg` | primary text | #ECE9E2 | #1B1A17 | #D8F3E6 | #F4ECDD |
| `fg-muted` | secondary | #9AA0A8 | #5E5A52 | #93AA9E | #AEB6C2 |
| `fg-faint` | labels | #7E848E | #67625A | #7A9085 | #929CAB |
| `fg-disabled` | disabled, decoration | #5F656E | #A39C8F | #4A5A52 | #5D6C82 |
| `acc` | primary action, rank | #C9A45C | #8C2F2B | #FFB23F | #E8836B |
| `acc-hi` / `acc-lo` | highlight / low | #E6CB8F / #B08A45 | #A8443E / #6E2320 | #FFC86E / #D9922A | #F2A48F / #C96A53 |
| `on-acc` | text on accent | #16120A | #FFFFFF | #1A1206 | #1A0F0B |
| `gain` / `loss` | up / down | #3FD1B0 / #FF6B5A | #1F7A5A / #B3261E | #5CE1E6 / #FF5C8A | #7FD4B5 / #F06C5F |
| `warn` / `info` | warnings / macro | #F2B33D / #6EA8FE | #9A6100 / #2F5E9E | #F5D547 / #8AB4FF | #F2C14E / #8FB8E8 |
| `steel` | Shadow sub-palette base | #7C8A99 | #4F5B68 | #7C8A99 | #8A98A8 |
| `signal` | Shadow alert, attacks, Notoriety | #E5484D | #B3261E | #FF5C8A | #F06C5F |

Rules: palettes change token values only (identical DOM). Contrast floors: body text ≥ 4.5:1 on `win`, `win2` and `chrome`; gain/loss text ≥ 3:1; `fg-faint` never on `win2` in Ink & Brass (4.4:1). `signal` is used only for outlines, icons and short chip text. The **Shadow sub-palette** applies inside AI Lab and Security windows: the accent role becomes `steel` (primary buttons are steel-outlined, not brass), and `signal` is the only alert colour. Brass returns inside Shadow apps only for money amounts that are wealth moments (a licence income line), never for buttons. `colorBlindPair = true` substitutes the Phosphor gain/loss pair in every palette.

Semantic tag colours (Wire items, chips): Filing and Purchase `acc`; Macro `info`; Earnings by sign `gain`/`loss`; Verdict `fg` with a scales glyph; Crime/attack `signal` (only in the player's own security context, never on public Wire items about other players, which stay `fg`); Rumor `fg-muted` with a dashed border; Non-public tip `warn` outline with "NON-PUBLIC" label.

#### §3.3.2 Type

| Role | Face | Size / weight | Notes |
|---|---|---|---|
| Hero NW | Instrument Serif 400 | 40 desktop / 44 phone widget / 48 large | cents at 65% in `fg-muted` |
| Moment titles | Instrument Serif | 72 desktop / 56 phone | rank name, verdict, world event |
| Section titles | Instrument Serif | 22 | sentence case |
| Hero price | JetBrains Mono 500 | 30 | −0.02em tracking |
| Body, buttons | Inter 400–600 | 14 | tickers Inter 600 |
| Table values | JetBrains Mono 400 | 13 | right-aligned, tabular |
| Small / caption | Inter | 12.5 / 11.5 | |
| Label | Inter 500 | 10.5 uppercase, 0.14em | `fg-faint` |

All three faces are open-licence and self-hosted. Size scale: 10.5, 11.5, 12.5, 13, 14, 16, 20, 22, 28, 30, 40, 44, 48, 56, 72. Phone base 16 for inputs (prevents zoom on focus). French text is set with the same faces; `font-feature-settings: "tnum"` on every numeric element.

#### §3.3.3 Space, radius, elevation, z-index, breakpoints

- Spacing scale (px): 2, 4, 8, 12, 16, 20, 24, 32, 48, 64. Card padding 16; window content padding 12 desktop, 16 phone.
- Radius: 6 inputs and pills, 10 buttons and windows, 14 cards, 20 sheets, 999 chips. Phosphor: windows 6.
- Elevation: windows `0 12px 32px rgba(0,0,0,.35)`; sheets `0 -8px 24px rgba(0,0,0,.4)`; nothing else.
- Z-order (low → high): wallpaper 0, windows 10–99 (focus order), shelf/strip 100, banners 110, toasts 120, sheets 130, moment overlay 140, Held overlay 150, system overlays (halt, disconnect, forced update) 160.
- Breakpoints: phone < 768, compact 768–1199, desktop ≥ 1200, wide ≥ 1800 (adds a fourth layout column option). Minimum supported width 320 px.
- Touch targets ≥ 44 × 44 px on touch devices; ≥ 28 px pointer targets on desktop.

### §3.4 Number, money and time formatting

All formatting goes through one module `packages/ui/format.ts`. No component formats numbers itself.

**§3.4.1 Money.** Input: `Money` decimal string + currency code + context (`'hero'|'table'|'list'|'chip'|'sentence'`).
```
formatMoney(amount, ccy, ctx):
  sym = ccy == 'FDL' ? '$' : ccy + ' '                       // other currencies show their code (00 §3.1)
  a = abs(amount); sign = amount < 0 ? '−' : (ctx in ['delta'] && amount > 0 ? '+' : '')
  if ctx in ['list','chip','sentence'] and a ≥ PARAM.ui_abbrev_threshold (=10,000):
      unit = first of [T=1e12, B=1e9, M=1e6, k=1e3] with a ≥ unit
      v = a / unit; digits = v < 10 ? 2 : (v < 100 ? 1 : 0)   // 3 significant figures: $3.21M, $12.4k, $412k
      return sign + sym + roundHalfEven(v, digits) + unitLetter
  decimals = (ctx == 'hero' and rank ≥ R3 and a ≥ 1e6) ? 0 : 2   // whole dollars for big hero values at R3+
  return sign + sym + groupByLocale(roundHalfEven(a, decimals))
```
Full precision (to the cent, or 6 decimals for micro-priced assets) is available on hover (desktop) or long-press (phone) on every abbreviated value. Zero shows `$0.00` in `fg-muted` with no sign. Negative values always carry U+2212 and `loss` colour; colour is never the only signal.

**§3.4.2 Prices and quantities.** Prices use the asset's `displayDecimals` (06). Quantities use `qtyDecimals`; crypto shows up to 8 decimals trimmed of trailing zeros, minimum 4. Bonds display price per 100 face with a yield toggle; FX shows pips with the last decimal at 70% size. Options show premium per unit and per contract.

**§3.4.3 Percentages and rates.** `+1.24%` / `−0.03%` with 2 decimals; basis points as `+12 bp` for spreads and rate changes (rates < 1% change shown in bp). Ratios (Sharpe, coverage, LTV) 2 decimals, no sign unless a change. Probabilities from owning modules are shown as **bands** where the owner publishes bands (03 principle 6, "odds bands") and as whole percents otherwise (`~12%`), never with false precision beyond 1 decimal.

**§3.4.4 Game time.** From the `clock` channel only.
- Clock: `Day {gameDay} · {HH:MM}` where HH:MM = `tickOfDay × 2` game minutes from 00:00 (00 §5.1). Phone: `D{gameDay} · HH:MM`.
- Dates in tables: `Wk {week} {Mon}` within the current quarter, `Q{q} Y{y}` beyond; chapter `Ch {n}`.
- Durations in game units for game rules (`3 game days`), and in real units for real-time rules (protection `41:12` h:mm real, Held, cooldowns in real hours) with the unit always written. With `timeDisplay='game+real'`, game durations add a real hint in `fg-faint` ("3 game days · 3 h").
- Relative times: "3 game-min ago" under 1 game hour, "2 game-h ago" under 1 game day, then dates. Connection rows use game-hour precision only (04 §10.5.2).

**§3.4.5 Locale.** Grouping and decimal marks follow `numberLocale` (fr: `12 400,50 $`; en: `$12,400.50`). The fictional `$` symbol stays (04 §13). Abbreviation letters localize (fr: `k`, `M`, `Md` for billions, `T` for trillions via ICU compact short with the fr pattern).

**§3.4.6 Screen-reader text.** Every numeric cell carries an `aria-label` produced by `speakMoney/ speakPrice/ speakPct`: "Halcyon, 42.10 dollars, up 1.2 percent" (04 §13).

### §3.5 Component library

Every screen in §7 is assembled only from these components (plus layout primitives Stack, Grid, Split, Tabs, Segmented, Sheet, Window). Each component lists its props (data it needs), its states and its accessibility contract. Ids for tests follow `data-testid="<component>-<context>"`.

| Component | Props (data) | States | Notes and a11y |
|---|---|---|---|
| **TickRing** | `tick`, `tickStartMs` from `clock` | running, reconnecting (dashed, `fg-faint`), halted (steel pause glyph), reduced-motion (static seconds number) | 22 px strip / 30 px Broker; fills linearly over 5 s, resyncs on each server tick, never a free timer; `aria-hidden`, a hidden live region announces "Tick" only in screen-reader verbose mode |
| **PriceCell** | value, prev, decimals, assetId | idle, flash-gain, flash-loss (420 ms bg fade, max one per tick), stale (italic `fg-faint` after 2 missed ticks), halted | `aria-label` from §3.4.6 |
| **NumberRoll** | value | rolling (220 ms; 420 ms for fills and moments), static (reduced motion) | digits roll, never the sign |
| **MoneyText** | amount, ccy, ctx | normal, restricted (brass-outlined pill `AD` or `START` beside it, or the code of any other restricted bucket the owner defines), estimated (prefix `≈`, `fg-muted`) | hover/long-press full precision |
| **PnLChip** | amount, pct | gain, loss, zero, about-even (|x| < $1) | sign + arrow + colour |
| **Sparkline** | series (≤ 120 points) | normal, no-data (flat dashed) | `aria-label` summarises start, end, change |
| **CandleChart** | candles, resolution, overlays (markers, bands, lines), crosshair | loading skeleton, live, halted (steel band), event-shaded band (6% tint, label), replay mode | lightweight-charts; layout bg `win`, text `fg-faint`, up `gain`, down `loss`; last price brass tag on a dotted brass line; range tabs 1H/1D/1W/1Q/1Y/All; keyboard: arrows move crosshair, `+`/`−` zoom |
| **DepthLadder** | public levels, last auction | normal, thin (fewer than 3 levels: "Thin book" label), halted | shows only what 05 publishes; no account labels |
| **TapeList** | prints | live, paused (when scrolled up) | aggregate prints only |
| **OrderPad** | asset, buying power, estimateFill result from 05, license, restrictions | idle, invalid (reason in `warn`), pending (tick ring row "Filling at tick N", Cancel), partial ("18 / 40 filled"), halted ("Waits for reopen"), closed session ("Queued for the opening auction"), filled (toast), rejected (toast with reason), first-trade cap ("Max 20%") | one accent button labelled with the full action ("Buy 40 HALC"); breakdown rows: price, est. fill, fee, est. impact (bp and $), total, buying power after, margin after (derivatives) |
| **PositionRow** | position | normal, margin-warn (warn edge), liquidation-near (loss edge + liquidation price), restricted | ticker, name, qty, avg, last, value, P&L, weight, 5-day sparkline |
| **OptionsChain** | expiries, strikes, quotes, Greeks from 06 | loading, normal, illiquid strike (`fg-faint`), halted | calls left, puts right, ATM line in `acc` |
| **PayoffChart** | legs, underlying range, payoff from 06 | static, draggable underlying marker (Academy and ticket), break-evens labelled | the curve is computed by 06's payoff API, not the client |
| **YieldCurve** | tenors, yields, prior curves | normal, inverted (label "Inverted 2Y–10Y") | |
| **WaterfallBars** | rows `{label, value}`, total (from owner) | normal, expanded rows | the total shown is the owner's total; no client summing |
| **AttributionBar** | parts | normal | 4 px bar, labelled in tooltip |
| **StatementTable** | statement lines from 03 (income, balance sheet, cash flow), periods | normal, consolidated toggle, restated badge | indent levels, subtotal rules |
| **OwnershipGraph** | nodes (entities), edges (stakes %) from 03/09 | normal, consolidated view, public-only view (others' structures show only filed links) | keyboard navigable tree fallback |
| **NodeGraphEditor** | block library and graph from 11 | edit, validate errors (red outline on node + message), running (read-only), DU budget meter | blocks, ports, wires; no free code; a list view fallback for keyboard and screen readers |
| **CityCanvas** | city tiles, overlays | render tiers T0/T1/T2 (10), loading, offline picture | list-view fallback (§3.16) |
| **DistrictTile** | district summary | normal, followed, my-holdings marker | |
| **BusinessCard** | business summary | normal, closed, upgrading, distressed (condition < 40%) | |
| **ItemCard** | lifestyle item (14) | catalog, owned, insured, collateralised, auction lot | hero image on dark backdrop |
| **ProfileCard** | public profile (14/15) | full, compact (name, flag, rank badge, title, Prestige, Reputation, opt-in Notoriety) | compact appears wherever a name does |
| **RankBadge**, **PrestigeChip**, **ReputationMeter** | from `rank` | — | |
| **ConnectionRow** | connection entry (§3.11.3) | active, re-keying, flagged ("Suspicious", `signal` outline) | 44 px phone / 36 px desktop; identical fields for every entry |
| **ThroughputGauge** | effective DU vs budget, 24 h series + expected band | normal, dented (label if world published cause) | ring in TickRing style |
| **ScanRing** | next auto-scan, last result | counting, scanning, cooldown | |
| **SessionArc** | progress P (attacker side) | growing, frozen, lost ("Connection lost") | asymptote line at 85% |
| **AnomalyCard** | anomaly event | one style for clues and decoys | steel only |
| **CaseTimeline** | docket entries, evidence cards | open, hearing, verdict, appeal, closed | |
| **EvidenceCard** | evidence item visible to viewer | sealed (shows only "Sealed exhibit #n"), revealed | 13's discovery rules decide what arrives |
| **ClauseCard** | clause type + parameters | draft, valid, invalid, signed, breached, fulfilled | |
| **LeaderboardRow** | rank, profile compact, metric, change | normal, mine (accent left hairline), rival ("Next up"), promotion/relegation zone tint | |
| **WireItem** | item | variants: news, filing, trade print, verdict, purchase, milestone, rumor, tip, statement, world event | tag chip + headline + entities + time; tap opens WIR-02 |
| **AlertBanner** | P0/P1 alert | margin, liquidation-near, lawsuit, contract, attack-detected, Held countdown | never covers an OrderPad; dismiss moves it to the bell |
| **Toast** | notification | fill, warn, world event, info | §3.10.2 |
| **CardStack** | ordered cards | swiping, done | WYWA |
| **BottomSheet** | content | half, full | grab handle; drag down to dismiss |
| **CostConfirmSheet** | intent preview from the owning module: cost lines, consequences, cooldowns, odds bands | ready, invalid, submitting (pending tick) | §3.8 |
| **HoldToConfirm** | label, holdMs (PARAM.ui_hold_confirm_ms = 1200) | idle, holding (ring fills), confirmed, cancelled | keyboard: hold Enter for the same time; screen readers get a two-step confirm instead |
| **CountdownChip** | target real ms or tick | running, expired | real-time rules show h:mm; game rules show game units |
| **ProgressBar** | value, max | normal, complete (420 ms accent check) | |
| **EmptyState** | one serif line + one suggested action | — | never a blank panel |
| **Skeleton** | shape | loading | never shows fake numbers |
| **LockTile** | unlock rule | locked | names the unlock, no upsell |
| **ShareCard** | card template + allowed fields | preview, exporting | §3.21 |
| **CommandPalette** | query | results grouped | combobox + listbox |
| **Heatmap** | grid values | normal | pattern + colour (never colour only) |
| **Gauge** | value, thresholds | normal, warn, critical | used for capital ratios, margin utilization |
| **DiffBadge** | before/after values | — | upgrade previews "+$41 / game h" |
| **Stepper** | steps | wizard flows | |
| **SearchField**, **Select**, **NumberInput** (mono, locale-aware, rejects more decimals than allowed), **Toggle**, **Slider** (with numeric input twin), **DateTick picker** (game calendar; future days disabled where the screen forbids them) | — | — | all keyboard reachable |

### §3.6 Simple and Pro modes (D03, D04)

- Each app with depth has two detail modes. **Simple** shows the few consequential decisions; **Pro** shows the full controls and analytics. The switch is a segmented control in the app bar ("Simple · Pro"), stored per app in `AccountUiPrefs.detailMode`.
- Both modes submit the same intent kinds with the same payload shapes; Simple fills omitted fields with the owning module's documented defaults (for example a Simple equity order is `mkt.order.place {type:'market', tif:'day'}`; a Simple loan uses the bank's standard term).
- Broker starts in Simple and offers Pro after the first fill plus 3 more closed trades (18 controls the prompt). Every other app starts in Simple. Pro is never gated by rank; only content gated by licenses or rank is gated.
- What Simple hides must never be a risk: margin, liquidation prices, borrow recall risk, restricted cash, fees and impact are always shown in both modes.

### §3.7 Tick synchronization and pending states

1. The client clock is driven only by `clock` deltas. `tickStartMs` = arrival time of the tick delta adjusted by the gateway's published offset; the TickRing fills from there.
2. Submitted intents show **Pending · tick N** where N = the tick the gateway acknowledged the intent into (P0 ingest of tick N, 00 §5.2). The result arrives in tick N's P14 deltas.
3. If the result has not arrived 2 ticks after N (network), the row shows "Waiting for the exchange" with a dashed ring; after PARAM.ui_pending_timeout_ticks = 6 it queries intent status by `intentId` (19). The client never resubmits on its own (idempotency key = intentId).
4. Market phases (00 §5.1) shape the OrderPad: pre-market and after-hours on equity-type assets show "Queued for the opening auction at 08:00" (t = 60) or "Market closed · opens Mon 08:00" on weekends; FX and crypto follow their own session flags from `clock`/`ticker`.
5. Halts (05): the asset's PriceCell shows a `warn` "Halted" chip, the chart a steel band, and the OrderPad the halted state. World halts (admin, 21): the system overlay "Trading halted by the Exchange" (diegetic, 02 §11) with the reason category if public.
6. Reconnect: send `lastSeenTick`; the gateway replays `me` deltas up to PARAM.ui_reconnect_replay_game_days = 1 game day, else sends a snapshot; during the gap all prices go stale (§3.5 PriceCell) and OrderPads disable with "Reconnecting".

### §3.8 Confirmation, cost disclosure and safety rails

| Intent class | Confirmation required |
|---|---|
| Market order in Simple mode | one tap on the labelled button (the label is the confirmation) |
| Any order with estimated impact > PARAM.ui_impact_warn_bp = 50 bp, or size > PARAM.ui_large_order_warn_adv_pct = 5% of the asset's average daily volume | CostConfirmSheet with the impact estimate from 05 and a suggestion to use an execution algo (factual: "An execution algo splits this over time") |
| Limit price more than PARAM.ui_fat_finger_pct = 10% through the last price | inline `warn` "Limit is 14.2% above the last price" + confirm |
| Leverage, short sale, derivatives open | CostConfirmSheet showing margin required, liquidation price, borrow fee and recall risk (06/07) |
| Any purchase, op, filing, loan, contract or charter with cost ≥ PARAM.ui_cost_confirm_threshold_pct_nw = 1% of NW or ≥ $10,000 | CostConfirmSheet |
| Irreversible or destructive: Lockdown, fresh start, delete account, disband alliance, sell a Unique item below its last valuation, plead guilty, transfer ownership of a company, burn/retire a model, cancel a fund | HoldToConfirm (1.2 s) inside a CostConfirmSheet |
| Cyber or espionage op launch | CostConfirmSheet with the op's odds bands (12), cost, cooldown, protection-loss warning if the player is still protected ("Launching this ends your protection now"), and a HoldToConfirm |

The CostConfirmSheet always shows: what you pay (each line, with currency), what you get, what can go wrong (the owner's published risk lines), timing (ticks/game days until effect), what it reveals publicly (filings, Wire auto-posts such as lifestyle purchases > $10M, 14), and restrictions (restricted cash cannot be used for this: which bucket and until when). Data comes from the owning module's `preview` endpoint for the intent kind (each module's §4 validation run as a dry run; 19 exposes `POST /intent/preview`). The sheet never computes cost itself.

Undo: none for money. Where a module offers cancellation (open orders, pending contracts before counter-signature, queued Chief of Staff actions), the row shows Cancel until the module's cut-off.

### §3.9 The moment queue

Full-screen moments are rare (04 §9.5 moments budget). One queue per client:

```
priority order (highest first): held_start > world_event_takeover > rank_up > verdict > unique_reveal
                                > milestone_major (first $1M, first $1B) > ipo_bell > gilt_cover > chapter_end > daily_close
enqueue(m): push; sort by priority, then createdTick
tryPlay() every 250 ms:
  if a moment is playing: return
  if now − lastMomentEnd < PARAM.ui_moment_gap_ms (8000): return
  m = head
  if m.kind == 'held_start': play now (it is a rule state, not a celebration)
  blockers = pendingOrderCountdown || ticketHasFocus(phone) || inputWithin(PARAM.ui_moment_idle_ms = 10000)
  if m.kind == 'world_event_takeover':
      if blockers and now − m.createdRealMs > PARAM.ui_takeover_max_delay_ms (10000): drop m (banner already shows); return
      if blockers: return
  else if blockers: return
  if m.kind == 'daily_close' and the player was not present for that day: move to history, drop
  play m; skippable after PARAM.ui_moment_skip_after_ms = 1000 (tap, click, Esc)
multiple rank-ups in the queue collapse to the highest, with "Also: <lower ranks>" on card 1
moments older than expiresRealMs (default 1 real hour; daily close 10 real minutes) are dropped to history
```

Moment durations: rank-up 4–6 s, first $1M and $1B 6 s, Unique reveal 2.4 s, verdict 3 s, hacked pulse 1.5 s red edge then straight to facts, world-event takeover ~3 s, IPO bell 4 s, chapter end 6 s, daily close is a sheet (not full-screen) that still uses the queue. In Focus mode only held_start, world_event_takeover and P0 alerts interrupt; others wait until Focus ends or appear as toasts.

### §3.10 Notifications

#### §3.10.1 Routing table (engine event → surfaces)

Every `UiNotification` derives from one `EngineEvent` (00 §5.6) delivered to this player (visibility PUBLIC filtered by relevance, PARTIES or PRIVATE). The mapping below is the default; owning modules name their event kinds, this table names the category.

| Category | Typical source events | Priority | Toast | Bell | Banner | Push (if allowed) | WYWA card |
|---|---|---|---|---|---|---|---|
| margin | 07 margin call, maintenance breach | P0 | yes | yes | yes until resolved | yes | Actions |
| liquidation | 07 liquidation warning / executed | P0 | yes | yes | yes | yes | Actions |
| attack_detected | 12 scan flagged a session, op detected against you, ransomware notice | P0 | yes (steel) | yes | yes | yes, security category, quiet | Actions |
| security_flag | 12 defense AI flags an entry | P1 | no | yes | no | one quiet push | Actions |
| held | 13 Held scheduled (grace) / started / ended | P0 | yes | yes | countdown banner | yes | Actions |
| contract_signature | 15 offer received, counter, deadline | P1 | yes | yes | no | yes | Actions |
| lawsuit | 13 case filed against you, hearing scheduled, deadline | P1 | yes | yes | yes for deadlines < 1 real hour | yes | Actions |
| verdict | 13 verdict in your case | P2 | moment | yes | no | yes | Actions |
| auction_outbid / auction_won | 15 auctions | P1 / P2 | yes | yes | no | yes | Money |
| fund_gate | 08 gate vote, redemption gate imposed | P1 | yes | yes | no | yes | Actions |
| bank_run | 07 run on a bank you hold deposits in / own | P0 if owner, P1 if depositor | yes | yes | owner: yes | yes | Actions |
| world_event | 16 Storm/Major onset, crisis week announcement | P2 | Storm toast / Major takeover | yes | world-event banner | Major only | Wire |
| fill | 05 order filled/partial/rejected | P2 | yes | yes | no | no (never pushed) | Money |
| league_result | 15 weekly league close | P2 | yes | yes | no | yes | Rivals |
| rival_moved | 15 the player directly above/below changed | P3 | no | yes | no | yes (max 1/real day) | Rivals |
| goal_reached | 18 starter goal done, 14 milestone | P4 | yes | yes | no | yes if opted ("ping me at $20k") | Money |
| message | 15 DM, NPC correspondence | P3 | yes when Messages not open | yes | no | yes for DMs only | Messages |
| alliance | 15 role change, treasury vote, op board | P3 | yes | yes | no | yes for votes | Actions |
| chapter | 15 chapter end, Finals qualification | P2 | moment | yes | no | yes | Wire |
| system | 21 maintenance, patch notes, forced update | P1 | yes | yes | yes for maintenance < 1 h | yes | — |

Clues and decoys on model connections are **never** notifications: they add only the steel dot on AI Lab and Security tiles and one neutral WYWA line (04 §10.5.1). Planting a session is never notified to anyone (no event reaches the victim).

#### §3.10.2 Toasts

Top-right under the strip, 332 px, at most PARAM.ui_toast_max_visible = 3, each PARAM.ui_toast_ms = 4000 ms (warn and P0 stick until read), hover pauses, click opens the deep link, `Esc` dismisses. Toasts never cover an active OrderPad: the column moves top-left when a ticket sits under it. Phone: one at a time from the status bar. During 3+ fills in one tick, fills merge into one toast "4 orders filled" with a list.

#### §3.10.3 Banners

At most one AlertBanner; priority P0 > P1; a newer P0 replaces a P1 (the P1 goes to the bell). Banners show the single most urgent fact and one action ("Margin call: add $12,400 or reduce by 14:30 · Resolve"). The world-event banner is separate and stacks under it.

#### §3.10.4 Bell (notification centre)

Holds the last PARAM.ui_bell_history = 200 notifications per account (server-synced read state), grouped by day, filter chips by category. "Mark all read". Each row links to its source.

#### §3.10.5 Push and email

- Permission is asked only after value is shown (18 §3.3, minute 9:30) and re-asked no sooner than PARAM.ui_push_reask_days = 7 real days after a refusal.
- Defaults after permission: on for margin, liquidation, attack_detected, security_flag, held, contract_signature, lawsuit, verdict, auction_outbid, fund_gate, bank_run, goal_reached (only the goals the player asked for), league_result; off for rival_moved, message, alliance, world_event, chapter, system.
- **Daily cap:** PARAM.push_cap_per_real_day = 5 pushes per real day (owned by 15 §3.11), counted server-side per account. P0 pushes during an active attack or margin event may exceed it by up to PARAM.ui_push_attack_extra_cap = 5 more, which is the +5 allowance of 15 §3.11 (ruling in 24). When the cap is reached, further pushes are folded into the next WYWA.
- **Quiet hours** (default 22:00–08:00 local): only P0 pushes are delivered; everything else waits.
- Collapse rule: pushes of the same category within 10 real minutes merge.
- Email: optional daily or weekly digest (money, actions, rivals, Wire highlights). Never marketing without separate consent (21).
- Push copy never contains amounts above the player's chosen privacy level on the lock screen: by default "Margin call on your account" without numbers (setting "Show amounts in notifications", default off).

### §3.11 Information hygiene in the client

1. **No client economics.** The client never computes P&L, NW, fees, odds, margin, impact, payoff or attribution. It renders owner-computed values. Any derived display (a sum in a table footer) uses the owner's provided total. Tests grep the UI packages for arithmetic on Money types outside `format.ts`.
2. **Only what is sent.** Screens render only fields the channel delivered. Public views of other players use 15's public profile projection and 13/15's filings; the client has no access to anything else (L11). Nothing in the UI infers or labels another player's strategy, style, holdings or activity.
3. **Identical rows.** Model connection entries render from identical fields with identical components, ordering rules, animations and icons regardless of whether an entry is hostile (04 §10.5 rules 1–3). The client receives no hostile flag (02 §4.2). The refresh cadence is once per 30 ticks; the client neither polls faster nor animates arrivals differently by kind. Clue and decoy cards share copy pool and timing.
4. **No future.** Screens that explain the past (journal, Research Desk, world-event panels, replays) clamp to closed periods: no element is derived from an event end tick, a remaining duration, or an open session (velvet-research-desk rules). Date pickers disable days after the last closed day.
5. **Flow is never named.** Any flow breakdown shows pool types only; "Players" appears only under the k-anonymity rule supplied by 05/16 (assumed: ≥ 5 distinct accounts and no account above 40% of the bucket, applied per closed day).
6. **No precision beyond the API.** The UI never shows a timestamp, count or value more precisely than the API delivered (connection first-seen is game-hour precision).
7. **No presence leaks.** The UI shows no "online now", "last seen" or "typing" indicators for other players, except inside DMs and alliance chat where both sides opted in ("Show when I'm active to alliance members", default off). Crown towers, storefronts and estates never react to a player being online (LC16).
8. **Telemetry.** Client telemetry (§5.2) carries no other player's data and never labels hostile or legitimate connections.

### §3.12 Rank materials (shell) and status presentation

The interface is the status (04 §0.2). Rank changes only materials; never speed, information, order types, window limits or keyboard reach (Quay hard rule).

| Rank | Desktop hardware | OS polish | Wallpaper | Phone | Ceremony card 1 |
|---|---|---|---|---|---|
| R0 Broke | secondhand laptop: 14 px dark bezel, "Port Avalon Electronics" sticker, hairline crack top-right (never over controls); boot 900 ms before the session loads; in-world spam toasts ("Make $5k a day from your phone!") at most 1 per real day, tagged Spam | Quay 0, 1 workspace | stock | used phone, crack top-left | — |
| R1 Hustler | refurbished desktop, 6 px bezel, crack gone; boot 500 ms | Quay 1 | stock | new phone | "New desktop: the crack is gone" |
| R2 Owner | second monitor | Quay 2, 2 workspaces, brushed-aluminium shelf | palette wallpaper | aluminium bottom row | "Second monitor: a second workspace" |
| R3 Mogul | three-screen rig | Quay 3, 3 workspaces, clock and watchlist widgets | palette wallpaper | market clock widget | "Three screens" |
| R4 Tycoon | walnut desk edge with accent inlay; serif headlines in more places; soft room tone if sound is on | Quay 4 | palette night variant | walnut edge | "Private office" |
| R5 Titan | glass office: strip and shelf 86% + 12 px blur (reduced transparency → R4) | Quay 5 | live skyline of the home city with the player's own buildings lit | skyline wallpaper | "Glass floor over <city>" |
| R6 Dynasty | the calmest chrome; divider and window shadows removed; accent softened | Quay 6 | sea horizon at 30% height | horizon | "Control room" |

The ceremony is the OS update screen (dim 0–600 ms; "INSTALLING Quay N · Name" with a 1 px progress hairline 600–1400 ms while the hardware cross-fades; serif rank name 1400–2600 ms; three cards 2600–4200 ms: new hardware, what opened (license, business tier, home, AI tier — only things that exist), next rank with progress; one accent button **Keep going**). No confetti, coins or particles. Settings › Shell lets the player choose any earned shell or an owned cosmetic shell; purchased shells are labelled "Purchased" and never count for Prestige (L7).

Status surfaces: ProfileCard compact on every name; Estate as Home background (§7 EST-01); crown towers in the city (10); Gilt List (WIR-08).

### §3.13 Motion

| Token | ms | Use |
|---|---|---|
| fast | 120 | hover, press, toggles, toast out |
| base | 220 | tabs, sheets, windows, row insert/remove, toast in |
| slow | 420 | price flash, settle, moment beats, flagged-entry settle |
| ambient | 2400 | R4/R5 ambient light, world-event hairline pulse, Unique reveal |
| tick | 5000 | the tick ring |

Easing: ease-out `cubic-bezier(.22,1,.36,1)` for entering and responding; ease-in-out `cubic-bezier(.6,0,.2,1)` for ambient. No bounce, spring, overshoot or parallax. A window animating never delays input. Reduced motion: every duration 0 except the tick ring, which becomes a once-per-second step; flashes become a one-tick colour change; moments become static cards. Photosensitivity: nothing flashes more than once per second; no full-screen colour change.

### §3.14 Sound and haptics

- Sound off by default on phones, on by default on desktop at master 0.5. Sounds: market-open and close bell (soft; lower pitch during a crash), muted tick on fills, low thud when attacked (detected only), single low bell on rank-up, gavel tap on verdict, paper slide on the daily close, auction hammer. No coin, slot, reel or casino sounds anywhere (L5).
- All sounds have a visual equivalent; captions option shows "[market open bell]" in a corner when sound is on.
- Haptics (touch devices, toggle): light tap on fill, medium on rank-up, double pulse on attack alert, light on hold-to-confirm completion.
- Ambient room tone (R4+) only when sound is on, at −24 dB relative to UI sounds.

### §3.15 Illustration, avatars and iconography

- Glyph family: 24 px grid, 1.5 px single-weight line, round caps; no fills except dots; one glyph per app (Quay set) plus action glyphs. No real OS idioms or branded icons; UI copy never says Windows, macOS, iOS, Android, Start, Dock or Finder.
- Illustration: flat-ish architectural style lit at dusk; homes, districts, businesses and item hero images on a dark studio backdrop with the same lighting.
- Avatars: stylized silhouettes and portrait cards customizable with outfit, watch and pose; no realistic faces (04 §9.6, decided).
- Crests (alliances, dynasties, funds, banks): composed from a fixed parts library (shield shape, charge, tincture from the palette's accent family) so no user-uploaded images exist at launch (moderation, 21).
- Rival and NPC marks: monochrome shapes, never semantic colours.

### §3.16 Accessibility (target WCAG 2.2 AA)

- Contrast as §3.3.1; high-contrast mode raises `line` to `fg-disabled` and removes wallpapers.
- Text scales to 200% (`textScale`); panels stack instead of overlapping; the Broker narrow form engages automatically when its width at scale drops below 720 px.
- Full keyboard play; visible focus ring 2 px accent at 2 px offset; skip links per window; windows are `role="dialog"` with `aria-labelledby`; the shelf is a `toolbar`; the launcher a `combobox` + `listbox`; toasts in an `aria-live="polite"` region (fills, P0 alerts and world events `assertive`).
- Every canvas (charts, city, graphs) has a list or table fallback reachable from a "View as table" control; the city's list view covers companies, my places, districts, listings and crown towers (06-cities §9.4).
- Screen-reader labels for every number (§3.4.6). Charts announce summaries; crosshair values are announced on demand.
- Reduced motion and reduced transparency honoured (system or override). HoldToConfirm offers a two-step confirm for assistive technology.
- Colour-blind pair toggle; Phosphor palette offered first to players who enable it.
- Cognitive accessibility: Simple mode everywhere, one-sentence prompts, glossary hover on every finance term (18 §3.11), no timed decisions shorter than 1 game hour except auctions and orders (which the player starts).
- Captions for every sound; no information by sound only.

### §3.17 Localization (L8)

- Every user-visible string is a key in `messages/{locale}.json` using ICU MessageFormat (plural, select, number, date). A lint fails on raw JSX text. English is the source; French is complete at launch of the shared world (M50 target: 100% coverage); missing keys fall back to English and are reported by telemetry.
- Layout tolerates +30% string length (French) without truncating numbers; labels truncate with ellipsis and a tooltip, numbers never truncate.
- Generated text (news headlines from 16 templates, journal sentences, Research Desk memos, Academy content) is template-keyed with entity parameters, so it localizes; free-text player content (chat, names) is shown as written.
- Fictional proper nouns (companies, cities, brands, currencies) are not translated. Ticker symbols never change.
- Dates and numbers follow `numberLocale`; the game calendar words (Day, Wk, Q, Y, Ch) are keys.
- Right-to-left support is built into layout primitives (logical CSS properties) so later locales need no rework.

### §3.18 Performance budgets and render tiers

| Budget | Target |
|---|---|
| First load JS on Broker route (gzipped) | ≤ PARAM.ui_js_budget_kb = 200 KB |
| Tick delta apply + render | ≤ PARAM.ui_perf_tick_render_ms = 8 ms on a mid-range Android profile (19 defines the device profile) |
| Lists | virtualized; 60 fps scrolling at 500 rows (positions), 10,000 rows (ledger explorer) |
| Charts | no layout shift on update; candles append in place |
| Window drag/snap | 60 fps at full tick load on the desktop profile |
| Input latency | ≤ 1 frame from key to ticket update |
| City | render tier auto: T2 full, T1 light under 45 fps measured in the first 2 s (PARAM.ui_city_render_fps_threshold), T0 picture without WebGL2 or with battery saver (10 owns the renderer) |
| Memory | ≤ 300 MB JS heap on phone after 1 real hour |

Background windows (collapsed or other workspace) unsubscribe heavy channels (`book`, `tape`, `city`) after 30 s and resubscribe on focus.

### §3.19 Offline, reconnect, PWA and native

- PWA: installable shell; service worker caches static assets only, never market data; offline screen shows the last snapshot read-only with a large "Offline · last update Day 38 11:20" label; no intent can be composed offline except drafts.
- Native wrappers (Capacitor): same build; native push, haptics, biometric unlock for the session token, share sheet. Store disclaimers per 21.
- Session expiry: the client keeps drafts and returns to the same screen after re-authentication.
- Forced update: when 19 bumps the minimum client protocol, a system overlay asks to reload at the next tick boundary; drafts persist.

### §3.20 Voice and copy rules

- Tone: glossy finance magazine with a wink; confident, short, never a casino, never a cartoon (04 §2). Losses and money are serious.
- Labels name the action fully ("Buy 40 HALC", "Lend $2.0M at 4.10%").
- **Never advice.** Banned in system copy (lint list `copy-banned.json`): "should", "consider buying", "opportunity", "undervalued", "can't lose", "guaranteed", "free money", "jackpot", "lucky", "double or nothing", "spin". Explanation surfaces (journal, desk) also ban future tense ("will", "expect", "likely", "next", "target").
- Bankruptcy copy bans "failed", "game over", "lost everything", "wiped out" (velvet-bankruptcy).
- Hostile entries are never called "hostile" or attributed to a player in the victim's UI; the flagged chip reads "Suspicious" (04 §10.5.5).
- Disclaimer "Simulated market. Not financial advice." sits in the Broker footer and the Settings › About page; "No real money can be won or withdrawn." sits in Settings › About and the store listing (21).
- Real-world account security is distinguished loudly from in-game hacking: real-account alerts use the system category with the label "Your real account" and never the Shadow palette (02 §5.1).

### §3.21 Shareable cards

Share is opt-in for every card and starts minimal (Mathis's no-leak rule). Templates: trade receipt, daily close, rank-up, milestone, verdict, defended hack, chapter recap, Gilt List cover, league promotion, IPO bell, estate snapshot, tournament result (opt-in trade log never weights). Each template lists its allowed fields; by default only percentages and the event, never cash balances, position sizes, quantities or order history. A per-share toggle "Include tickers and story" (off by default, not remembered) adds tickers and the story. Output 1080 × 1350 PNG (and 1080 × 1920 for stories) rendered server-side from the allowed fields only (19), with the game wordmark and the disclaimer line. Shared images are never used by any game rule.

---

## §4 Player intents

17 owns almost no world intents: the interface submits the intents of the module that owns each action (listed per screen in §7). What 17 owns:

### §4.1 World intent owned by 17

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `acct.presentation.set` | `{ showHomeInCity?: boolean; showEstateToVisitors?: boolean; crownTowerName?: 'handle'|'private'; showNotorietyOnProfile?: boolean; activeVisibleToAlliance?: boolean }` | actor is the character; at most PARAM.ui_presentation_changes_per_day = 10 per real day (stops toggling to probe public projections) | stored on the character; public projectors (10 city, 14 profile, 15 boards) read it from the next tick; emits `acct.presentation_changed` (PRIVATE). Turning a public display off anonymizes current presentation from the next public snapshot (LC16); it cannot retract past snapshots |

It is a tick intent (not a plain settings write) because it changes public artifacts, which must replay deterministically (02).

### §4.2 Non-world account writes (REST, 19 owns the endpoints)

| Endpoint | Body | Validation | Effect |
|---|---|---|---|
| `PUT /me/prefs` | `Partial<AccountUiPrefs>` except `privacy` | shell ∈ earned ∪ owned cosmetics; locale ∈ supported; layouts ≤ 5; watchlists ≤ 20 × 50; textScale ∈ [1, 2] | stored; synced to other devices on next connect |
| `PUT /me/notify` | `NotificationPrefs` | quiet hours valid times | stored; the push service uses it |
| `POST /me/push-token` / `DELETE` | device token, platform | authenticated device | registers or removes a push target |
| `PUT /me/notes` | encrypted blob | ≤ 256 KB | stored opaque; never read by the server |
| `POST /share/render` | `{template, refs, includeDetails}` | refs belong to the caller; fields restricted to the template allowlist (§3.21) | returns an image URL valid 7 real days |
| `POST /intent/preview` | an `Intent` envelope without signature | same validation as P1 of the owning module, read-only | returns `{valid, reasons[], costLines[], consequences[], publicEffects[], restrictions[], etaTicks}`; never changes state |
| `POST /support/report` | screen id, client version, last 200 log lines (no other players' data), optional screenshot | rate 5/real day | ticket in 21 |

### §4.3 Client-side actions (never sent)

Window management, layouts, palette, Focus mode, local notes and tags, My City overlay, chart drawings (trend lines, saved per asset per device; "Sync drawings" option via `/me/prefs`), drafts.

---

## §5 Engine events

### §5.1 Consumed

The client consumes the event stream only through the channels of §2.6. Routing to surfaces is §3.10.1; every screen in §7 lists its channels. The client never receives `SEALED` events (00 §5.6); evidence screens show only what 13 releases.

### §5.2 Emitted

| Event | Kind | Visibility / sink | Payload |
|---|---|---|---|
| `acct.presentation_changed` | EngineEvent | PRIVATE (projectors read it) | `{chrId, fields}` |
| Client telemetry `ui.screen_view` | analytics (19, not the event store) | internal | `{screenId, ms, viewportClass, appVersion}` |
| `ui.perf` | analytics | internal | `{tickRenderMs p50/p95, fps, heapMb, renderTier}` sampled 1/min |
| `ui.error` | analytics | internal | stack hash, screen |
| `ui.i18n_missing` | analytics | internal | key, locale |
| `ui.moment` | analytics | internal | kind, played/skipped/dropped, delay ms |
| `ui.notify` | analytics | internal | category, surface, opened |

Telemetry contains no other player's identifiers, no connection-entry labels and no hostile/legit hints. Players can disable non-essential telemetry in Settings › Privacy (21 sets what "essential" means).

---

## §6 NPC behaviour (presentation)

NPCs do not use the interface; this section fixes how they appear.
- **Named NPC actors** (16, 600 at launch) have a public dossier card (CIV-06): name, mark, institution, city, public roles, public holdings filed, public history. Discovered links (P02) appear only for players who earned them, labelled with their provenance ("From the Harbor Gazette archive, Day 211").
- **NPC correspondence**: banks, landlords, suppliers, customers, regulators and advisors send messages to the Messages app as typed message templates from 16 (offers, notices, requests). Each message that proposes a deal opens the owning module's validated intent preview; NPC text never asserts an economic fact the simulation did not produce (W05, B09).
- **NPC rows on boards**: any NPC entity on a board, league or auction carries an "NPC" tag and its mark; house AIs in tournaments carry "House". Players are never shown an NPC as if it were a human.
- **NPC rival funds**: shown with name, mark, flavour line and net worth only (velvet-rivals-board no-leak rule).
- **NPC attacker crews** never appear by name in the victim's UI; detected NPC ops read like player ops (same identical-row rule), because attribution needs a case.

---

## §7 Screens

Each screen block gives: **Purpose · Unlock · Layout** (D desktop window, P phone) · **Components** · **Data** (channels and owner) · **States** · **Actions** (intents, owner module in brackets). Intent kind names are the ones this file assumes the owner uses; where the owner's file names them differently, the owner's names win and the screen keeps its behaviour. Every screen also has the universal states: loading (Skeleton), error (inline "Couldn't load · Retry" plus support link), offline (read-only snapshot), and locked (LockTile) when its unlock rule fails.

### §7.1 Shell (SH)

**SH-01 Boot and sign-in.** Purpose: start the client, authenticate or continue as guest (02 §5.1). Unlock always. D/P: full-screen `bg0`; Quay mark; rank hardware boot (R0 900 ms, R1 500 ms, R2+ none; runs before the session loads). Components: sign-in buttons (email magic link, passkey, Google, Apple, Discord), "Play as guest", language picker, About/disclaimer link. Data: none before auth. States: first launch (shows 18 cold open after "Play as guest" or sign-in), returning (straight to WYWA if away > 30 real min else to last screen), banned (reason category and appeal link, 21), maintenance (countdown), forced update. Actions: REST auth (19).

**SH-02 Desktop.** Purpose: the work surface. D only. Components: status strip, banners, wallpaper, windows, shelf, workspace switcher, TickRing, protection CountdownChip, bell. Data: `clock`, `me`, `rank`. States: normal, Focus mode, Held overlay active (LAW-13, §7.21), halted world overlay, reconnecting (strip clock dashed, prices stale). Actions: client window actions.

**SH-03 Phone home.** P only. Components: status bar, home widget, grouped app grid, bottom row, edge bar. Data: `me`, `rank`, `clock`. States: normal; locked tiles with rank tags; accent dots on newly unlocked apps and on apps with P0/P1 items (dot only). Actions: open apps.

**SH-04 Launcher.** D 640 px panel; P full-screen search from the status bar pull-down. Components: CommandPalette. Data: local app list, asset directory (cached daily), public names index (15), help index (18). States: empty query shows Recent; no results ("Nothing found · Search help"). Actions: navigation; pre-filled tickets only.

**SH-05 Bell (notification centre).** D drop panel 400 px under the bell; P full screen. Components: grouped list, filter chips, Mark all read. Data: account notifications (19). States: empty ("Nothing new."). Actions: open deep links; mark read (REST).

**SH-06 Moment overlay.** All moments of §3.9 render here. Components: dim layer, serif title, label, cards, one accent button, skip affordance after 1 s. States per moment kind: rank-up (OS update), first $1M / $1B (6 s: NW in serif 72 px, Wire headline preview, "Millionaire"/"Billionaire" title, one decor reward card), Unique reveal (2.4 s item hero light sweep), verdict (3 s: scales glyph, "Verdict: liable / not liable / guilty / not guilty" serif, sanction line, Appeal link if available), hacked pulse (1.5 s `signal` edge pulse then the incident card), IPO bell (4 s replay of the bell with the opening print), chapter end (6 s chapter portrait reveal), Gilt cover (cover card + share). Actions: Keep going; deep links on cards.

**SH-07 Alert banner.** §3.10.3. Actions: the single resolve action deep-links (Margin centre, case, contract, Security).

**SH-08 World-event layer.** Takeover, banner, ambient and aftermath per velvet-world-events, generalized to the shared world: takeover only for Major onsets; banner `● CRASH · DAY 3 · GX −18.40% since it began · Today −2.10%` (elapsed only, never remaining); event panel on tap (headline, precursors, the event's share of each held asset's move today as 16/05 publish it). Data: `news` (world events), `ticker`. Actions: See my positions (PF-02).

**SH-09 While You Were Away (WYWA).** Purpose: catch up in under 30 s (04 §4.4). Shown on return when away ≥ PARAM.ui_wywa_min_away_real_min = 30 real minutes, or on demand from the bell. D: column of cards over Home/desktop centre 520 px; P: swipeable CardStack. Card order: **Money** (one big number: NW change while away with the top 3 contributors as the owner modules attribute them, earnings from businesses and property, fills), **Actions needed** (every open P0/P1 item: margin, lawsuits, contract signatures, attacks detected with incident timelines, auction outbids, fund gates, Held), **Security** (one neutral line about oddities "3 oddities on Aster-2 while you were away", scans that ran and their results), **Rivals** (who passed you, league standing), **World** (up to 5 Wire highlights relevant to holdings), **Done** (lands on Home). Data: `/me/away-summary?since=lastSeenTick` (19 aggregates from events). States: nothing happened ("Quiet while you were away."), very long absence (> 7 real days: adds "What changed in the world" card from 16's history digest). Actions: each card deep-links; resolve actions open their sheets.

**SH-10 Daily close sheet ("The Close").** Per velvet-daily-close with the shared world: masthead "THE {CITY} CLOSE · DAY n", headline ("Up $212.40 today."), `+0.44% · GX +0.12%`, BEST/WORST, the story with priced-in band, event line, Share and Done. Shown at day close (t = 719) only for a day the player was present ≥ 10 real minutes; never on weekends; queued (§3.9); at most one per real hour. History in PF-05. Data: 05/03 `dayClose(chrId, day)`.

**SH-11 Key sheet.** `?`. Two-column keycaps; footer "Nothing executes without Enter."

**SH-12 System overlays.** Halted ("Trading halted by the Exchange" + reason category), disconnected ("Reconnecting… last update 11:20"), maintenance window countdown, forced update ("A new version is ready. Reload at the next tick."), session expired (sign-in sheet), account frozen by enforcement (21: reason category, appeal link).

**SH-13 Low-cash card.** Per velvet-bankruptcy §1: shows when NW < $1,000, at the top of Portfolio and once in Broker; rows Fresh start (if available; 14), Watch an ad for $250 (if eligible; 21, L12; offer row shows "3 of 10 today" and the restriction note), Keep trading. Dismiss hides until the next real day.

**SH-14 Chapter screen and fresh start.** Per velvet-bankruptcy §2–§4 (forced close message, Peak/End/Days, what happened from the journal, Kept/Goes, perk pick, HoldToConfirm "Start chapter 2 with $5,000", new-chapter moment). Actions: `acct.freshStart.declare {perk}` and, after a forced close, `acct.freshStart.choosePerk {perk}` [14]. The restricted START cash pill applies (ROADMAP C5: 72 real hours).

**SH-15 Rewarded ad flow.** Offer row only in SH-13 and Me › Earn $250; network full-screen player; completion toast "+$250 added." or "No ad finished, so no cash."; `AD` restricted pill thereafter. Actions: `acct.ad.claim {adReceipt}` [21].

### §7.2 Settings (SET)

**SET-01 Account.** Handle (change once per chapter, 02 §5.2), display company name, country (one change per 180 real days, 15), home city (once per chapter for a fee, 10), email, sign-in methods, 2FA (required for top-1% and alliance leaders; banner until set), linked devices, sign out everywhere. Actions: REST (19); `soc.country.change`, `prop.homeCity.change` [15, 10].
**SET-02 Appearance.** Palette (4 swatches, live preview), shell picker (earned and owned shells; "Purchased" label), text scale slider with preview, high contrast, colour-blind pair, reduced motion, reduced transparency. Client/REST only.
**SET-03 Sound and haptics.** Master, UI, ambient sliders; phone sound toggle; haptics toggle; captions.
**SET-04 Notifications.** Per-category push toggles, email digest, quiet hours, "Show amounts in notifications", permission status and a "Turn on" button that triggers the OS prompt only from a tap.
**SET-05 Keys.** Remap table with conflict detection; reset.
**SET-06 Privacy and presentation.** The `acct.presentation.set` fields with plain explanations of what each makes public; telemetry toggle; data export (GDPR, 21); delete account (HoldToConfirm, explains anonymization "Former player #8812", 02 §5.3).
**SET-07 Trading defaults.** Default order type and TIF, confirm thresholds (player may lower PARAM thresholds, never raise above defaults), default Simple/Pro per app, size presets.
**SET-08 About.** Version, disclaimers, licences of fonts and chart library (TradingView Lightweight Charts attribution), credits, links to the public integrity report (MKT-08).

### §7.3 Broker (BRK)

**BRK-01 Broker, Simple.** Purpose: trade unlocked assets with the fewest decisions. Unlock always (first fill after LIC1 grant, 18). D: chart card (1D default) above a compact ticket; P: chart full width, ticket as bottom sheet from a floating accent "Trade" button. Components: asset header (ticker, name, PriceCell, day change, phase label), CandleChart (line by default in Simple), OrderPad Simple (Buy/Sell, size chips 10/25/50/Max of buying power, one button), honest note "Prices can fall. That's the game.", position strip for this asset, news strip for this asset. Data: `ticker`, `candles`, `me`, `news`, `/intent/preview`. States: §3.5 OrderPad states, first-trade cap (18), restricted cash note, license-locked asset ("Pro license needed · opens at Owner"), session closed. Actions: `mkt.order.place {assetId, side, qty, type:'market', tif:'day'}`, `mkt.order.cancel` [05].

**BRK-02 Broker, Pro terminal.** Purpose: full execution. Unlock always (mode switch). D (≥ 720 px): chart centre with indicators and drawings; DepthLadder and TapeList right; OrderPad bottom-right; Positions/Orders/Fills tabs bottom; asset news left (collapsible). P: tabs Chart · Book · Ticket · Orders. Components: CandleChart with overlays (MA, VWAP, volume, Bollinger, RSI, user drawings), DepthLadder, TapeList, OrderPad Pro (types market, limit, stop, stop-limit, take-profit, trailing stop, iceberg with display qty, TIF day/GTC/IOC/FOK as 05 supports; reduce-only and post-only flags where 05 supports), auction panel at t = 60 and t = 540 (shows 05's published indicative uncross price and imbalance only if 05 publishes them; otherwise "Auction at 08:00"), short-sale borrow box (locate status, borrow fee annualized, recall risk band from 07), margin box (initial/maintenance, liquidation price from 07), estimated impact (05). Data: `ticker`, `book`, `tape`, `candles`, `me`, `news`, `/intent/preview`. States: as BRK-01 plus thin book, borrow unavailable ("No borrow available · try later"), hard-to-borrow (fee shown in `warn`), position limit reached (05/07 anti-domination limits: "Position limit: 4.8% of float max 5%"). Actions: `mkt.order.place`, `mkt.order.modify`, `mkt.order.cancel`, `mkt.order.cancelAll {assetId?}` [05]; `bank.borrow.locate {assetId, qty}` [07].

**BRK-03 Asset-class tickets.** The OrderPad swaps its body by asset class (06 owns instruments; fields shown are those 06 defines):
- *Equity / ETF:* as BRK-02; ETF adds NAV, premium/discount, creation/redemption activity summary (08).
- *Bond:* price per 100 ↔ yield toggle, accrued interest, clean/dirty, duration, rating (08), call schedule; order by face amount. Actions `mkt.order.place` with `qtyFace`.
- *FX:* spot with pip display; forwards tab (tenor picker, forward points); session flags. Actions `mkt.order.place` (spot), `mkt.fx.forward {pair, notional, tenor}` [06].
- *Commodity futures:* contract month selector, roll calendar, basis vs spot, delivery/cash-settle note, physical storage link (BIZ/MKT-09). Actions `mkt.order.place`, `mkt.futures.roll` [06].
- *Options:* OptionsChain (expiry tabs, strikes, bid/ask/last, IV, Δ Γ ν Θ from 06), strategy builder (legs list: single, vertical, straddle, strangle, collar, calendar, butterfly, iron condor templates), PayoffChart with draggable underlying, max loss/max gain/break-evens from 06, margin required. Actions `mkt.order.placeMulti {legs[]}` [05/06], `mkt.option.exercise` [06].
- *Perpetuals:* leverage slider (bounded by license and 07), funding rate and next funding time, mark vs index, liquidation price, reduce-only. Actions `mkt.order.place` with `leverage`.
- *Swaps (IRS, inflation, total return):* RFQ ticket (notional, tenor, fixed/float, payer/receiver), quotes from NPC dealers (and player market makers) with expiry ring, clearing via CCP badge. Actions `mkt.rfq.request`, `mkt.rfq.accept {quoteId}` [06].
- *CDS:* reference entity (name or tranche), notional, tenor, spread quote, upfront, protection buyer/seller toggle, counterparty via CCP, credit event rules link. Actions as swaps [06].
- *Crypto spot:* fractional qty, network/exchange venue label (fictional), 24/7 session. Actions `mkt.order.place`.
- *DeFi:* AMM swap (pool, price impact from the pool curve, slippage tolerance), add/remove liquidity (impermanent-loss explainer from 06), lending protocol supply/borrow with health factor and liquidation threshold, stablecoin mint/redeem where the design allows. Actions `mkt.defi.swap`, `mkt.defi.lp.add/remove`, `mkt.defi.lend.supply/withdraw/borrow/repay` [06].
- *Collectible index products:* if 06 lists them, as equity.
Every body shows the same breakdown rows (price, fees, impact, margin, total, after) and the same pending states.

**BRK-04 Execution algos.** Unlock LIC2 (DEFAULT; 05 may set). D: sheet over the ticket; P: full screen. Components: algo picker (TWAP, VWAP, POV/participation, iceberg), parameters (start/end tick, participation %, limit cap, display qty), schedule preview from 05 (expected slices per tick, estimated impact range), live monitor (progress bar, filled vs schedule, average price vs benchmark, slippage in bp), pause/cancel. Data: `me` algo orders, `tape`. States: scheduled, running, paused, completed, cancelled, stopped by limit. Actions `mkt.algo.start {kind, params}`, `mkt.algo.pause/resume/cancel` [05].

**BRK-05 Execution analytics (TCA).** Unlock LIC2. Table of completed parent orders: benchmark (arrival, VWAP, close), slippage bp and $, participation, fees; scatter of slippage vs size; filters. Data: 05 execution report read model. Actions none.

**BRK-06 Asset page.** Purpose: everything public about an asset. Unlock always. D: header + tabs; P: tabs. Tabs: Overview (price, chart, key stats, sector, bloc), Fundamentals (filed statements via StatementTable, 09/03; consensus estimates if the player has Terminal tier, 16), Filings (≥ 5% holders filed, insider trades, quarterly holdings mentions; 13/15), Ratings (08), Ownership (public filed structure via OwnershipGraph, public-only view), News (16), HQ (link "Show on map", 10), For bonds: issuer, covenants; for tokens: supply schedule, protocol notes. Actions: Watch (local/REST), Trade (opens Broker), Study this move (Research Desk, R3+).

**BRK-07 Information tier.** Terminal subscription panel (Free / Terminal / Research per 01 §6.2): what each tier gives, price per game day (scales with NW, 16 owns price), subscribe/cancel. Actions `mkt.info.subscribe {tier}` / `cancel` [16].

### §7.4 Portfolio (PF)

**PF-01 Overview.** NW hero (serif), today / chapter / all-time toggle, NW chart with benchmark ghost (dashed `fg-faint`, "Equal-weight basket since your day 1", toggle), allocation donut by class (equities, bonds, FX, crypto, derivatives, businesses, property, lifestyle, cash, other) and by currency, drawdown, Sharpe (owner-computed, 15/05), rank progress, restricted-cash summary. Data: `me`, 03 NW breakdown read model. States: new player (only cash: EmptyState "Your money is all cash. Broker or Businesses are good first stops." — factual, no advice wording beyond naming places), event band on chart during world events.
**PF-02 Positions.** Grouped by asset class with subtotals from the owner; columns per class (derivatives add Greeks, margin, liquidation price; bonds add yield, duration; FX by currency); multi-currency values in FDL with native in tooltip. Actions: Close (opens pre-filled ticket), Set stop (pre-fill), Roll (futures), Exercise (options). States: margin-warn rows, restricted positions (pledged collateral badge "Pledged to repo #12").
**PF-03 Orders.** Open orders and algos with Cancel/Modify; history with status filters (filled, cancelled, rejected with reason, expired). Actions `mkt.order.cancel/modify` [05].
**PF-04 Journal and trade detail.** Per velvet-trade-journal-replay: closed trades with explainTrade sentence, attribution bar (analyst only), trade detail with replay chart, news pins, "If held" line, Why waterfall (analyst), the sentence. Analyst hire row. Data: 05/18 `explainTrade` (18 owns the ladder, §3.12 of 18). Actions: `acct.analyst.hire {tier}` / `fire` [18].
**PF-05 Closes.** Daily close history list; tap reopens SH-10.
**PF-06 Statements.** Personal financial statements from 03: balance sheet (assets by class, liabilities: loans, margin debt, mortgages, judgments), income statement (trading realized, dividends, interest, business distributions, rents, fees, taxes, upkeep), cash flow; period selector (game day, week, quarter, year, chapter); consolidated toggle for holdings structures (03); export CSV. Data: 03 statements API.
**PF-07 Taxes.** Tax summary by jurisdiction (03): taxable events, rates, payments due, residency/holding locations (V3 3.7), planning notes from the module (legal planning only), audit status link (13). Actions: `fin.tax.pay`? The namespace list lacks fin; use `bank.tax.pay {jurisdiction, amount}` [03] (DEFAULT name; 03 may rename).
**PF-08 Cash and currencies.** Balances per currency, restricted buckets with reasons and release times, FX convert ticket (opens Broker FX), deposit sweeps to bank accounts (BNK-01). Actions `mkt.order.place` FX [05], `bank.deposit.move` [07].
**PF-09 Luck vs skill.** Ghost report (buy-and-hold, random, no-fees ghosts on the same world window; 05/20 compute it); percentile; window selector; text in report voice only.
**PF-10 Comeback and history.** Past chapters of this character (bankruptcy chapters), Phoenix progress if 14 adopts it.

### §7.5 Markets (MKT)

**MKT-01 Directory and screener.** Every listed instrument (400 at launch, 22) by class, bloc, sector; Simple: search + category cards; Pro: screener with filter rows (price, change, volume, market cap, P/E from filings, yield, rating, IV, funding) and saved screens. Data: asset directory (19, daily) + `ticker` for visible rows only. Actions: Watch, Trade.
**MKT-02 Calendars.** Earnings dates (09), central-bank meetings (04), macro prints (04), sovereign bond auctions (04), index rebalances (08), option expiries and futures rolls (06), chapter events, Season Finals, crisis-week announcements (15/16). Filters by bloc and holdings; add to my calendar (local reminders as P3 notifications). Never shows unpublished results.
**MKT-03 Macro dashboard (per bloc).** Published macro state (04): policy rate, CPI, GDP growth, unemployment, credit conditions index, FX regime, fiscal balance, debt/GDP, cycle phase *as published* (no hidden variables); history charts; bloc comparison table. Data `macro:{bloc}`.
**MKT-04 Central bank page.** Bank name and mark (22), last decision and statement text (template from 04), forward-guidance line, rate path history, balance sheet (QE/QT holdings), standing facilities and their rates, reserve requirement, next meeting countdown. Unlock always. Data 04.
**MKT-05 Rates and curves.** YieldCurve per bloc with prior-day/week overlays, curve spreads (2Y–10Y), inflation swap curve, FX forward points, cross-currency basis, carry table (rate differentials). Pro only. Data 04/06.
**MKT-06 Sovereigns and ratings.** Each sovereign: rating and outlook (08 agencies), spreads, CDS where listed, debt maturity wall, auction results, restructuring status. Data 04/08.
**MKT-07 System (systemic-risk dashboard).** Public to everyone (V3 Part 10): aggregate leverage by sector of players and NPCs (as 07/20 publish aggregates), funding stress (interbank spread over policy rate, repo haircuts index), margin utilization at the CCP, CCP default-fund usage and size, bank capital ratio distribution of NPC banks, deposit-flow index (run risk), stablecoin peg deviations, ETF discount index, credit spreads index, insurer cat exposure index; each with history, thresholds marked as 07/08/20 define, and a "What this measures" help link. Gauges + sparklines; no ranking of individual players. Data `system:risk`.
**MKT-08 Stabilizer and integrity report.** The diegetic public integrity report (V3 Part 8, 20/03): money supply M0/M2 indices, faucets vs sinks by reason-code class per game week, Stabilizer actions, NWI index, invariant-check status ("Ledger balanced every tick since …"), exploit-fix history (public summaries from 21/20), crisis frequency. Data 03/20 weekly publication.
**MKT-09 Physical commodities.** Storage capacity and utilisation (tank farms, warehouses), freight index, contango/backwardation per commodity, basis by location, link to own storage and fleet businesses (09). Data 06/09.
**MKT-10 DeFi explorer.** Pools (TVL, fee tier, price, volume), lending protocols (utilisation, rates, liquidations), stablecoins (backing type, peg, collateral ratio), bridges and venues (status, incidents). Data 06.
**MKT-11 Funds and ETFs.** ETF list with NAV, price, premium/discount, flows; NPC and player funds summary linking to FND-01. Data 08.

### §7.6 Risk (RSK)

Unlock LIC2. All numbers come from the risk API (05/07 compute; 17 assumes `risk.report(chrId, method, horizon)`).
**RSK-01 Risk dashboard.** VaR and expected shortfall (method: historical on the world's own history, parametric; horizon 1 game day / 1 game week; confidence 95/99), factor exposures (market, sector, rates DV01, FX by currency, credit spread CS01, commodity, crypto beta, volatility vega), Greeks aggregate, liquidity-adjusted risk (days to liquidate at 10% ADV), concentration, leverage. Components: Gauge, Heatmap, tables. States: insufficient history ("Risk needs 20 game days of history for this method").
**RSK-02 Stress and scenarios.** Replays the current portfolio through the world's own past crises and storms (named from 16's world history, e.g. "Crash of Y2 Q3"), plus standard shocks (rates +200 bp, equities −20%, FX ±10%, spreads ×2, vol ×1.5). Output per scenario: P&L, margin call yes/no, liquidations implied, from 05/07 stress engine. Actions: none (analysis only; N1 adopted here as part of V3 risk analytics).
**RSK-03 Margin forecast.** Current margin by account (cash, margin, CCP-cleared), procyclical sensitivity ("If volatility rises 50%, initial margin rises to $X"), next variation-margin estimate range, liquidation ladder. Data 07.
**RSK-04 Correlation under stress.** Correlation matrix of holdings, calm vs stressed windows from world history.

### §7.7 Quant Lab (QL)

Unlock R2. The research environment on historical and withheld worlds (V3 Part 4). This file assumes 11 owns strategy graphs and backtests, and 20/02 provide historical snapshots and withheld seeds; no user code ever runs (blocks and a fixed expression library only).
**QL-01 Projects.** List of research projects (name, hypothesis text, datasets, last backtest, status). Actions `lab.project.create/archive` [11].
**QL-02 Notebook.** A sequence of cells; each cell is a block: Data query (asset universe, fields, window over closed history), Transform (fixed library: returns, ranks, z-scores, rolling stats, factor regressions, lags), Signal (NodeGraphEditor subgraph), Portfolio construction (weights rule, constraints, rebalance cadence), Backtest run, Chart/Table output. Cells evaluate server-side under the player's research compute budget (11 meters it in DU or compute). States: draft, running (progress), error (cell outline + message), stale (inputs changed). Actions `lab.research.run {projectId, cellId}` [11].
**QL-03 Backtest result.** Equity curve with benchmark, net of realistic costs and impact (05's model), turnover, capacity estimate, drawdowns, factor attribution, trade list; "Development result" label always visible (B07, A05). Actions: Promote to evaluation (QL-04).
**QL-04 Withheld-world validation.** Runs the frozen strategy on withheld seeds (20) that the player cannot inspect beforehand; shows score distribution, overfitting indicator (development vs withheld gap), pass/fail against the player's chosen criteria. Actions `lab.eval.withheld {strategyHash}` [11/20].
**QL-05 Datasets.** Owned and licensed datasets with provenance and legal tags (11), coverage, freshness (DQU decay), cost. Links to LAB-03.

### §7.8 Research Desk (RD) and the explainability ladder

Unlock R3 (analyst hire from day 1 via PF-04). Layout and rules per velvet-research-desk, generalized to every asset class and to the shared world (flow k-anonymity §3.11.5).
**RD-01 Analyst hire.** Junior and Senior tiers with weekly salary (18 §3.12 prices), hired state "Paid through Day 41", Let go. Actions `acct.analyst.hire/fire` [18].
**RD-02 Dossier.** Query bar (asset, window From/To clamped to the last closed day; presets Last closed day, Last week, Last quarter, This chapter), header "RESEARCH DESK · FILE 0412", memo (≤ 3 sentences, past tense, from 18/05 templates), waterfall in percentage points (Market, Sector, News · n, Flow, Company noise, Move), flow by pool type (Value funds, Trend followers, Retail, Pensions, Market makers, and Players only under k-anonymity), headlines in window, chart strip with no future axis room. Footer "Closed days only. The desk explains, it doesn't predict." Data `explainMove(assetId, fromDay, toDay)` [05 computes, 18 owns ladder]. Actions `acct.research.query {assetId, fromDay, toDay}` [18] (counts toward upkeep tier usage, no per-query fee by default).
**RD-03 Files.** Saved dossiers; readable even when the desk is locked.
**RD-04 Explain this candle.** From any chart (all ranks for the player's own held assets and closed bars; any asset at R3 with the desk): tap a closed bar to open a mini-dossier for that bar. Unlocked bars only for closed periods.

### §7.9 Wire (WIR)

**WIR-01 Feed.** Single feed with filter chips: All, Holdings, Follows, News, Filings, Trades (public prints such as block trades and threshold auto-posts as 16 publishes them), Verdicts, Purchases (lifestyle auto-posts > $10M), Milestones (own), Rumors, World events, Statements (player posts). Breaking strip at the top during crashes. Each WireItem shows tag, headline, entities, game time, priced-in band chip (Early/Mid/Late; never a %), credibility label for rumors ("Source record 12/20"). Desktop: Feed + Whale Watch side by side at ≥ 1440 px. Data `news`, `filings`. States: empty filter ("Nothing in this filter yet.").
**WIR-02 Item detail.** Full body (Terminal tier for full body and consensus where 16 gates it), entities with links (assets, companies, districts, NPCs), causal links (W09: "Part of: Harbor plant closure → employment −2% → occupancy" as 16 records the cause graph, shown only for public nodes), related items, "Show on map". Actions: Follow entity (REST), Share (receipt card if own milestone).
**WIR-03 Filings browser.** Search by entity or filer; filing types: ownership ≥ 5% (within 1 game day), quarterly holdings of the top 200 NWI (top 10 positions, 1 game week delayed), insider trades on own listed company, company statements (09), fund disclosures (08), regulatory notices (13). Each filing as a document view with fields and a timestamp. Data 15/13/09.
**WIR-04 Whale Watch.** Top 50 globally and in the player's country by NWI with their public filings, recent public prints attributable through filings only, headlines. Never shows unfiled positions (L11). Data `board`, `filings`.
**WIR-05 Rumor sources.** Each rumor source's public track record (hits/misses, resolved count), recent rumors and their resolutions. Data 16.
**WIR-06 Tip card.** A NON-PUBLIC card (from crime actions, contacts, Back Room) with a legal-risk tag ("Trading on this is insider trading"), accuracy disclaimer, and actions Trade (opens ticket with a persistent `warn` banner), Ignore, Report (+Reputation per 13). Actions `law.report.tip {tipId}` [13].
**WIR-07 Archive (world history).** Searchable public history (16, W10): mergers, bankruptcies, crises, verdicts, feuds, developments, eras; timeline view; entity pages; then/now views for places (LC03). Data 16 archive API.
**WIR-08 The Gilt List.** Quarterly issue (global and per country, 14/15): cover star, top 100 by NWI with estate illustrations (opt-in display), biggest climbers, Most Flamboyant, Most Generous; past issues. Share cover (own only).
**WIR-09 Post a statement.** Player statements to the Wire: text (moderated, 21), optional entity tags, reach estimate from 14 (`reach_weight`), warning "False statements that move prices are market manipulation." Actions `soc.wire.post {text, entities[]}` [15].
**WIR-10 Live events.** Countdowns for central-bank meetings, earnings in holdings, auctions ending, Season Finals clock, crisis-week announcements.

### §7.10 Messages (MSG)

**MSG-01 Inbox.** Threads: DMs (friends and contract counterparties only, 02 §8.4), NPC correspondence (bank, landlord, suppliers, customers, regulators, advisors), contract offers (link to CON-03), system. Filters, search. Data `chat`, 16 messages.
**MSG-02 Conversation.** Text only; NPC deal proposals render as cards with "Review" opening the owning module's intent preview; report/mute/block in the header; no read receipts or typing indicators unless both opted in (§3.11.7).
**MSG-03 Channels.** Country and city channels (slow mode), league group, alliance and alliance-ops channels, hosting-event rooms (14). Moderation tools: report, mute, block; slow-mode timer.
**MSG-04 Report.** Category, message reference auto-attached, optional note. Actions REST to 21.

### §7.11 Businesses (BIZ)

Data owner 09 throughout (`biz.*` intents). Channels: `me` (owned business summaries), `city:{id}` (demand), 09 read models.
**BIZ-01 Catalog.** Browse by city, sector (13 sectors) and tier (B1–B6; tiers above the player's rank shown locked with the rank tag). Each BusinessCard: price, expected net income per game day as 09 estimates it (range, including wages, upkeep and taxes, E02 principle applied to businesses), payback range, local demand, competitors count and their public names, customer requirements (C05). Simple: "Suggested in your district" first; Pro: full filters and a demand heatmap. Actions: Buy (BIZ-02).
**BIZ-02 Buy flow.** Steps: choose district (map or list, nicer slots cost more if 10 adopts slot pricing), choose site/storefront slot (CityCanvas mini), name the business (moderated), financing (cash, loan quote from BNK-02), confirm (CostConfirmSheet with setup delay: 1 game day for cross-region purchases unless a jet removes it, 14). After success: keys moment (1.2 s), "Visit your business" button opens CTY-01 at the storefront (LC01; never mandatory). Actions `biz.buy {catalogId, cityId, districtId, slotId?, name, financing}` [09].
**BIZ-03 Business detail.** Header (name, address, district, tier, condition gauge, status open/closed/upgrading), income panel (revenue, costs by line, net per game hour and day, trailing chart), market share and competitors (public), upgrades (six axes with DiffBadge before/after from 09 preview), staff and manager, events (inspections, breakdowns, strikes), customer contracts, supply links, Sell. States: distressed (condition < 40%), closed (failed or forced), offline cap reached ("Earning capped while you're away: 8 h, 16 h with a manager", 09). Actions `biz.upgrade {bizId, axis}`, `biz.maintain`, `biz.price.set`, `biz.close/reopen` [09].
**BIZ-04 Staff and managers.** Roster by role, wages, morale/loyalty (12 staff loyalty surfaces in Security), hire from pool (Prestige adds candidates, 14), manager mandate (budget, policy, exception thresholds: D05 delegation). Actions `biz.staff.hire/fire`, `biz.manager.setMandate` [09].
**BIZ-05 Supply chain and dependencies.** Graph of suppliers and customers (own and NPC), concentration risk meters (I08), switching costs (C06), internal capacity allocation with opportunity cost display (I02). Actions `biz.supplier.switch`, `biz.capacity.allocate` [09].
**BIZ-06 Customer contracts.** NPC contract offers with requirements (price, reliability, certification, response time, confidentiality), penalties, duration, capacity needed; accept/decline/negotiate within 09's ranges; subcontracting with other players (C08) opens CON-02 with a template. Actions `biz.contract.accept/decline/counter` [09].
**BIZ-07 My businesses.** Portfolio list with group policies (maintenance, pricing, manager mandates applied to a group; E06 pattern), totals from 09, alerts. Actions `biz.group.setPolicy` [09].
**BIZ-08 Sell or list.** Sell to NPC (85% sell-back or 09's rule), list on the business exchange (AUC-03), or transfer by contract. Actions `biz.sell`, `biz.list {price}` [09/15].

### §7.12 Company (CMP)

Unlock R2. Layout follows velvet-company-app v1.4 (rail views Overview, Products, R&D, People, Operations, Marketing, Finance, Filings, Listing), generalized to multiple companies and to the full corporate-finance scope of 09. Private views carry a quiet "Private" label; Filings and Listing views are public with a founder-only preview. Data `company:{cmpId}` [09].
**CMP-01 Companies list.** All companies the player controls or holds stakes in, with role (founder, controlling holder, minority, board seat), consolidated status (03), market value or last valuation. Actions: Found a company (CMP-02).
**CMP-02 Found a company.** Wizard: product/service, customer segment, city, operating model, competitive promise (C02 composition), legal entity jurisdiction (tax regime, 03), initial capital, founder stake. Actions `biz.company.found {...}` [09].
**CMP-03 Overview.** Cash, runway, revenue this week, next close, the one decision due, checklist (first weeks), runway chart, team summary.
**CMP-04 Products.** Each product: segment, price, quality vs target, unit cost, margin, share; competitor table (public). Actions `biz.product.create/price/retire` [09].
**CMP-05 R&D.** Projects with budget, days left, success band (±5 points), gain as bear/base/bull. Actions `biz.rnd.start/fund/cancel` [09].
**CMP-06 People.** Heads by role, ramping hires, wages, key people (poachable, 12). Actions `biz.people.hire/fire` [09].
**CMP-07 Operations.** Plants, cities, capacity, utilization, data-center link to own lab (I01). Actions `biz.plant.build/expand/close` [09].
**CMP-08 Marketing.** Spend by product and city, reach estimate range. Actions `biz.marketing.set` [09].
**CMP-09 Finance.** Cash, Borrow (revolver, term loan, bond issue, covenants, personal guarantee consequence shown before signing), dividends, buybacks, trading plan for founders (pre-committed plan a quarter ahead), trading window state. Actions `biz.finance.borrow/repay/issueBond/dividend/buyback`, `biz.tradingPlan.commit` [09].
**CMP-10 Filings.** Filed statements, next filing preview (founder only), weekly signals when listed, the trading window. Public view for everyone.
**CMP-11 Listing and IPO.** Readiness checklist (license LIC4, filing history, audits per 09/13), underwriting choice (NPC banks, player banks), price range, allocation, lock-ups, IPO ceremony (bell moment). Actions `biz.ipo.file/price/list` [09].
**CMP-12 Venture and cap table.** Rounds, preferred shares, liquidation preferences, dilution, option pool, term sheets from NPC and player investors (V3 3.7), down-round warnings. Actions `biz.round.offer/accept`, `biz.equity.grant` [09].
**CMP-13 M&A.** Targets (public companies and private listings), stake builder (5/20/50% thresholds with filing reminders), tender offer builder (price, conditions, financing), defenses for own companies (poison-pill style rights as 09 defines, white knight, buyback), merger review status (13 antitrust). Actions `biz.ma.tender/withdraw/merge`, `biz.defense.adopt` [09].
**CMP-14 LBO builder.** Target, sources and uses table, debt tranches (senior, mezzanine, covenants, cash sweep, interest cover), returns range from 09's model, refinancing calendar. Actions `biz.lbo.propose/close` [09].
**CMP-15 Activism and proxy.** Stake, demands, board seat campaign, vote tally (published at the meeting), target responses. Actions `biz.activism.demand`, `biz.proxy.nominate/vote` [09].
**CMP-16 Restructuring and bankruptcy.** Creditor classes, claims register, plan proposals (debt-for-equity, haircuts), absolute-priority waterfall view, votes, court status (13), distressed claim trading link. Actions `biz.restructure.propose/vote`, `mkt.claim.trade` [09/06].
**CMP-17 Group structure.** OwnershipGraph of the player's holdings and companies with consolidation (03 §consolidation), intercompany flows, related-party flags (I07), tax jurisdictions. Actions `biz.entity.transfer/merge` [09/03].
**CMP-18 Board seats.** Seats held on NPC or player companies, upcoming votes, information rights (private board pack; insider rules banner). Actions `biz.board.vote` [09].

### §7.13 Property (PRP)

Data owner 10 (`prop.*`).
**PRP-01 Listings.** Search by city, district, type (residential, commercial, industrial, land), tier (working, mid, prime, trophy), price, NOI; each card leads with price, expected net income after management, upkeep and taxes, occupancy, debt payment at the standard mortgage (E02). Map toggle. Actions: Buy (PRP-02).
**PRP-02 Property detail and buy.** Building facts (address, type, condition, units, tenants), economics (rent roll, vacancy, operating costs, taxes, NOI, cap rate), district context (index, demand drivers from 10/16), mortgage quote panel, purchase CostConfirmSheet (3% transaction + 1% stamp, 10 owns numbers). Actions `prop.buy {propId, financing}` [10].
**PRP-03 Mortgage and refinance.** LTV, rate (fixed/variable), term, payment, stress at +200 bp, covenants; refinance and equity-release options; application status. Actions `bank.mortgage.apply/refi/repay` [07/10].
**PRP-04 Management.** Manager hire and policy per property or group (rent setting rule, maintenance budget, tenant screening level, exception thresholds), exceptions inbox (material repairs, vacancies, disputes). Actions `prop.manager.setPolicy`, `prop.exception.resolve` [10].
**PRP-05 Development.** Land parcels, zoning, permit pipeline (time and probability bands), construction timeline with cost overrun ranges, pre-leasing, financing draws. Actions `prop.develop.start/draw/cancel` [10].
**PRP-06 My properties.** Grouped by city/district/type with totals (10), owner-occupied home marked, crown parcel indicator. Group actions per E06.
**PRP-07 Change of use and renovation.** Options with cost, delay, restrictions and expected NOI range; commercial premises for own businesses or lab (E07) with the opportunity-cost line (rent forgone). Actions `prop.renovate`, `prop.changeUse`, `prop.assignToBusiness` [10].
**PRP-08 Sell.** Sell to NPC market (10's price), list (AUC-03), or contract.

### §7.14 City (CTY)

Data owner 10 (and 06-cities rules). Render tiers T0/T1/T2.
**CTY-01 City map.** Isometric map of the selected city (tabs per city; locked cities greyed with unlock rank where 10 gates visits, otherwise all visitable). Overlays: My places (client-only), Districts index change heatmap, Sectors (HQs by sector with patterns), For sale, Auction lots, Today's movers (HQ lights), Development (construction sites). Interactions per 06-cities §9.2 (tap card, long-press menu, pinch/zoom, rotate 90°, keyboard arrows, `+`/`−`, `[`/`]`). Light follows the game clock. Data `city:{cityId}`, prices for HQ lights. States: render tier, loading chunk, offline picture.
**CTY-02 Building card.** Company HQ (company card, Broker link), storefront (business name, sector, owner public name only if public record), property (type, owned flag per public rules, listing), landmark (history, named wings from philanthropy), crown tower (handle/title or "Private", tier bucket at daily close only).
**CTY-03 City brief.** On opening: at most 3 real changes since last visit relevant to the player (LC02), each linking to record and map position, with publication time.
**CTY-04 District page.** Index and history, demand drivers (employers, services, transport as 10/16 publish), rents and occupancy, listings, then/now view (LC03), businesses by sector (public), follow district.
**CTY-05 List view.** Accessible list of every tappable category (companies, my places, districts, listings, crown towers, landmarks) with search.
**CTY-06 Crown towers.** Per-city board of the top N (PARAM from 10, default 12) with tower styles; own crown style purchase (sink). Actions `prop.crown.style {style}` [10].
**CTY-07 Place your shop.** If 10 adopts slot choice: pick a free storefront slot; nicer slots cost more. Actions part of `biz.buy` [09/10].

### §7.15 Bank & Credit (BNK)

Data owner 07 (`bank.*`).
**BNK-01 Accounts.** Deposit accounts at NPC and player banks: balance, rate, deposit-insurance coverage line, bank health summary (public ratios), move money. Actions `bank.deposit.open/move/close` [07].
**BNK-02 Loans and credit lines.** Offers from banks (rate, term, collateral, covenants, LTV), applications, outstanding loans with schedule, early repayment, collateral posted, default consequences in plain words. Actions `bank.loan.apply/accept/repay/drawdown` [07].
**BNK-03 Margin centre.** Per account (cash, margin, CCP-cleared, prime): equity, initial and maintenance requirements, utilization gauge, excess, margin calls with deadline, liquidation ladder, procyclical note from 07, actions Add cash / Reduce positions (pre-filled tickets). Actions `bank.margin.deposit/withdraw` [07].
**BNK-04 Repo.** Borrow cash against eligible collateral: collateral picker (eligible list with haircuts), term (overnight, 1 game week, term), rate, roll; lend cash in reverse repo; active trades. Actions `bank.repo.borrow/lend/roll/close` [07].
**BNK-05 Securities lending.** Lend out holdings: eligible positions, offered fee, recall terms, lent positions with income; borrow side lives in BRK-02. Actions `bank.secLend.offer/recall` [07].
**BNK-06 Prime brokerage.** For funds and large accounts (07 eligibility): prime brokers, margin tiers, cross-margining, financing rates, custody; switching. Actions `bank.prime.open/switch` [07].
**BNK-07 Collateral inventory.** Every pledged asset with what it secures (never double-pledged, 07 invariant), free collateral, substitution. Actions `bank.collateral.substitute/release` [07].
**BNK-08 Bank directory.** NPC and player banks: public capital ratio, liquidity coverage, rating, deposit rates, run indicator band as published, history (failures, rescues). Data 07 public projection.

### §7.16 Funds (FND)

Data owner 08 (`fund.*`).
**FND-01 Fund marketplace.** NPC and player funds: strategy class (macro, relative value, event-driven, quant, credit, long-only, fund-of-funds as declared by the manager), verified track record (NAV history), fees (management, performance, high-water mark), gates, lock-ups, manager first-loss stake, AUM, Reputation of manager. Filters. No holdings shown except what the fund publishes or files (L11).
**FND-02 Fund detail and invest.** Terms document view, NAV chart, drawdowns, investor count, subscribe/redeem with notice period and gate status. Actions `fund.subscribe/redeem` [08].
**FND-03 My investments.** Positions in funds, NAV, pending redemptions, gates.
**FND-04 Launch a fund.** Requires CH_FUND (13). Wizard: name and crest, strategy class, mandate (allowed assets, leverage, concentration), fees, gates, lock-up, manager stake, custodian, prime broker, seed capital. Actions `fund.launch {...}` [08].
**FND-05 Manager console.** NAV (live for manager), investors (anonymized to "Investor 12" unless they opt in), flows, mandate compliance meters, fees accrued, gate controls, investor letters (opt-in publication only). Actions `fund.gate.set`, `fund.letter.publish`, `fund.mandate.amend` (investor vote if required, 08) [08].
**FND-06 ETF AP desk.** For authorized participants: ETF premium/discount, creation/redemption basket, unit size, fees; create or redeem. Actions `fund.etf.create/redeem {etfId, units}` [08].
**FND-07 Structured products.** Securitization pools and tranches (senior, mezzanine, equity): collateral pool stats, ratings, attachment/detachment points, default-correlation sensitivity from 08, prices; buy via Broker (RFQ). Issuer side is INS-08.

### §7.17 Insurance (INR)

Data owner 08 (products, pricing) and 13 (claims).
**INR-01 Policies.** Owned policies (cyber, property, collectibles, business interruption, D&O, liability, key person): cover, deductible, premium, insurer (NPC or player), Reputation discount line (MASTER-BIBLE decision 5).
**INR-02 Quote and buy.** Choose cover; quotes from insurers with ratings. Actions `fund.insurance.buy/cancel` [08] (namespace DEFAULT; 08 may use its own).
**INR-03 Claims.** File a claim linked to an incident or event, evidence attached from the ledger and incident timeline, status, payout. Actions `law.claim.file` [13].

### §7.18 Institutions (INS)

The institutional layer (V3 Part 3). Every console is visible only to the institution's owner and authorized officers (alliance roles, 15). Public projections of each institution appear in BNK-08, MKT-07 and profiles.
**INS-01 Charters.** Every charter (CH_BANK, CH_FUND, CH_INSURER, CH_EXCHANGE_MEMBER, CH_CUSTODIAN, clearing membership, market-maker concession, issuer licence, sovereign-adjacent mandates) with requirements from 13 (capital, record, Reputation, license, fees), the player's progress against each, application status. Actions `law.charter.apply {charter}` [13].
**INS-02 Bank console (player bank).** Balance sheet (loans by segment, securities, reserves, deposits, interbank, CB borrowing, equity), capital ratios vs requirements (Gauges), liquidity coverage, NIM, P&L; lending policy (rate grid by risk band, LTV caps, sector limits, underwriting standard), deposit pricing, interbank lending/borrowing ticket, CB standing facility, deposit-flow monitor with run-risk band, stress results, regulator correspondence. Actions `bank.inst.setPolicy`, `bank.inst.depositRate`, `bank.interbank.lend/borrow`, `bank.cbFacility.draw`, `bank.inst.raiseCapital` [07].
**INS-03 Clearing membership.** Default-fund contribution, margin posted for own and client positions, waterfall position (layers and the member's mutualized share), CCP stress results, default-management drills, auction participation for a defaulter's portfolio. Actions `bank.ccp.join/leave/contribute`, `bank.ccp.auctionBid` [07].
**INS-04 Market-maker console.** Quoted instruments, quote parameters (spread, size, skew), inventory and risk limits, obligations compliance (uptime %, max spread), rebates earned, adverse-selection report. Actions `mkt.mm.setQuotes/pause` [05].
**INS-05 Insurer console.** Products and pricing, policies in force, reserves (case, IBNR), catastrophe exposure map by region and peril, reinsurance treaties (buy/sell), cat bond issuance, solvency ratio. Actions `fund.ins.setPricing`, `fund.ins.reinsure`, `fund.ins.issueCatBond` [08].
**INS-06 Custodian console.** Assets under custody by client, fees, segregation status, operational incidents. Actions `fund.custody.accept/offboard` [08].
**INS-07 Issuer desk (securitization).** Pool builder (select loans and mortgages owned or bought; pool stats), tranche structurer (attachment points, coupons), rating request to agencies (08) with expected rating band, placement (RFQ to buyers), servicing reports. Actions `fund.spv.create/tranche/rate/place` [08].
**INS-08 Exchange concession.** For holders of an exchange concession (re-auctioned per chapter per 01/15): listing fees, rebate schedule, obligations, revenue. Actions as 05/15 define.
**INS-09 Sovereign-adjacent (Dynasty content).** Sovereign wealth fund, government debt underwriting (primary dealer bids at sovereign auctions), private clearing house sponsorship. Actions `fund.swf.*`, `mkt.sovAuction.bid` [08/04].

### §7.19 AI Lab (LAB) — Shadow sub-palette

Unlock NW ≥ $100k (tile visible-locked earlier). Data owner 11 (`lab.*`), channel `me.lab`, `me.connections`.
**LAB-01 Overview.** Tier (T0–T5) with next-tier requirements, compute available vs reserved vs owned, data inventory DQU, models list with MCS and status, active runs, DU usage vs cap (A1/C3a formula result from 11), incidents.
**LAB-02 Compute.** Spot price ($/GPUh), reserved contracts, owned hardware in data centers (with energy cost, utilization), chip-shortage events banner, buy/rent/sell compute. Display GPUh (00 §3.1). Actions `lab.compute.rent/reserve/buy/sell` [11].
**LAB-03 Data.** Datasets with volume, quality, freshness decay curve, provenance trail, legal-risk tag (clean, grey, stolen), licence terms; data market (AUC-04 link); scrape/partnership/synthetic sourcing options with costs and legal tags; model-collapse warning when synthetic share exceeds 11's threshold. Actions `lab.data.buy/license/scrape/generate/retire` [11].
**LAB-04 Algorithm tree.** Tech tree spine (handcrafted → classic ML → transformers → MoE/RL → frontier scaling → secret sauce): nodes with prerequisites, time, cost, efficiency multiplier, status. Actions `lab.research.node.start/cancel` [11].
**LAB-05 Training run planner.** Purpose and target product, compute budget (C3 run-size bands per tier), dataset mix, careful vs quick mode, checkpoint insurance, researchers assigned; preview from 11: duration in game days, MCS range, failure odds band, cost. Actions `lab.run.start {...}` [11].
**LAB-06 Run monitor.** Progress, loss curve proxy, checkpoints, failure events, abort/resume. Actions `lab.run.abort` [11].
**LAB-07 Model detail.** Tabs: Health (MCS, drift, alpha-decay/crowding indicators as 11 measures, P&L when deployed), Products (trading, analyst signal, cyber attack, cyber defense, operations, licensing), Deployment (mandate, staged capital, paper/live), Connections (§7.20 SEC-03 filtered to this model, with ThroughputGauge and anomaly feed), Lineage (versions, distilled-from record if known to the owner, watermark tools), Retire/Archive. Actions `lab.model.deploy/pause/retire/fork` [11].
**LAB-08 Strategy graph editor.** NodeGraphEditor with the block library (data, signals, filters, sizing, execution, risk guards), DU cost per evaluation, validation, version history, backtest link (QL-03). Actions `lab.graph.save/validate` [11].
**LAB-09 Mandates.** Capital, leverage, allowed assets/markets, drawdown stop, daily loss limit, retraining budget, exception notifications; mandate breach impossible by construction (11). Actions `lab.mandate.set` [11].
**LAB-10 Evaluation.** Out-of-sample on historical windows and withheld worlds; paper trading results; deployment readiness checklist. Actions `lab.eval.run` [11].
**LAB-11 Researchers.** Roster, skills, salary, loyalty (poach risk shown as band), hiring pool (Prestige adds candidates, 14). Actions `lab.researcher.hire/fire/raise` [11].
**LAB-12 Licensing and model market.** Licence own models as API (watermarked) with pricing, licensees list (counts and revenue; licensee identities only where the contract discloses them), browse others' licensed models. Actions `lab.license.offer/accept/revoke` [11].
**LAB-13 Tournaments and arenas.** Weekly AI tournament entry (freeze a strategy hash before the lock; division by tier), results board (BRD-07), model arenas schedule and results. Actions `lab.tournament.enter`, `lab.arena.enter` [11/15].
**LAB-14 Operational AI.** Models applied to own businesses (demand forecasting, pricing assistance, inventory, capacity planning, I05) with the decisions they support and measured effects. Actions `lab.ops.assign {modelId, bizId, task}` [11].
**LAB-15 Governance.** Registration with the AI regulator, audit obligations, incidents and their resolution, "trusted lab" reputation status, safety settings. Actions `lab.gov.register/audit/remediate` [11/13].

### §7.20 Security (SEC) — Shadow sub-palette

Data owner 12 (`ops.*`), channels `me.security`, `me.connections`. Connections panel rules are 04 §10.5 in full (kept): calm by default, identical rows, clues = decoys in look, player memory is the tool.
**SEC-01 Overview.** Attack surface (units by type), coverage ratio (budget units ÷ surface units, cap 1.3), DP_eff estimate band, defense stack status, protection and rookie-zone status, heat shield chip, insurance link, last incidents, auto-scan ring with cadence by defense tier.
**SEC-02 Defense stack.** Layers from 12 (AI defense model link, money spend, patch level, SOC, incident response, physical security for homes, vendor risk), each with cost, effect band and decay; buy/upgrade. Actions `ops.defense.buy/upgrade/cancel` [12].
**SEC-03 Connections.** All entries across models, list header ("14 connections · normal for T2 is 8–15", "updated 9 game-min ago, next in 51"), sort (first seen default, load, last handshake, kind) and filters (model, kind, tag, untagged only), group by kind at T3+, ConnectionRow, tag (Trusted/Watch) and note (local). Refresh once per game hour. Actions per row: Disconnect (CostConfirmSheet with exact cost "$1,000 + 0.02% of NW = $4,180" or "Free (flagged)" and the legitimate-contract consequence). Actions `ops.conn.disconnect {entryLabel}` [12].
**SEC-04 Entry detail sheet.** Row fields, 24 h load sparkline, 24-cell handshakes-by-hour strip, every anomaly that named this entry, tag and note, Disconnect, Deep scan this model.
**SEC-05 Scans, Quarantine, Lockdown.** Deep scan ($5,000 + 0.01% NW, duration and 6 h cooldown ring as 12 sets them; 04 defaults 30 min and 6 h), Quarantine model (drops all its connections, pauses 1 h, cooldown 6 h), Lockdown (Security only, bottom, HoldToConfirm 1.2 s; cuts all connections on all models, pauses all AIs 2 h, reconnect cost per legitimate partner $500 shown with count, 24 h cooldown, then 12 h shield). Numbers from 12 (04 values shown as defaults). Actions `ops.scan.deep`, `ops.model.quarantine`, `ops.lockdown` [12].
**SEC-06 Anomaly feed.** Quiet steel column, newest first, one line per event (slowdown, odd usage, off-hours handshake); identical copy and timing for clues and decoys; first-time coach mark (18).
**SEC-07 Ops planner (attacker).** Target picker (search by public name; shows only public facts plus the target's protection/rookie/heat-shield/dormant status, which block or price the op; never their defenses beyond what recon ops reveal), op catalog (12 cyber ops and 8 espionage ops from 12), strength cards for session ops (Whisper, Tap, Siphon with plant odds, copy speed, drain, noise), recon results, odds bands for breach, detection and attribution (12 publishes bands; 1% floor shown as "never below 1%"), cost, cooldowns (same-victim 24 h, 3 attempts), dogpile cap state, punch-down/punch-up modifiers in plain words, evidence risk, protection-loss warning; CostConfirmSheet + HoldToConfirm. Actions `ops.op.launch {opKind, targetId, strength?, params}` [12].
**SEC-08 Live sessions (attacker side).** Rows with SessionArc toward the 85% ceiling, time left of lifetime, frozen state when victim dormant, Pull session; lost sessions grey "Connection lost" with final P. Never shows victim presence. Actions `ops.session.pull` [12].
**SEC-09 Incidents.** Each detected incident: timeline (game-hour precision), what was taken or affected, evidence on file, insurance claim link, "Open a case" (LAW-03 pre-filled), revenge discount note if applicable.
**SEC-10 Staff loyalty and counter-intelligence.** Key staff loyalty bands (businesses, lab, company), poach attempts detected, vetting and retention actions, counter-intel ops (canaries, sweeps). Actions `ops.ci.sweep`, `ops.staff.retain` [12].
**SEC-11 Honeypots and canaries.** Decoy models (Basic $30k / Advanced $120k / Frontier $400k; poison 0.2/0.4/0.6 as RESOLVED-NUMBERS), data canaries and watermarks, status. Actions `ops.honeypot.deploy/retire`, `ops.canary.plant` [12].
**SEC-12 Market-conduct desk.** For campaigns under 12's market-conduct conflict (K01–K07) on both sides: own short campaigns (positions link, statements posted, legal risk band), defenses for own companies (rebuttal publication with verifiable disclosure, buyback, case filing); everything labelled with its legal status. Actions `ops.campaign.*`, `soc.wire.post`, `biz.rebuttal.publish` [12/15/09].
**SEC-13 The Back Room.** Notoriety ≥ 50 club (14): black-market data, fixers, fencing; never on the public profile. Actions as 12/14 define.
**SEC-14 Most Wanted and Defender standing.** Opt-in Most Wanted listing toggle with consequences (+15% detection against the public top 10), Defender stats.

### §7.21 Legal & Court (LAW)

Data owner 13 (`law.*`), channels `me.legal`, `case:{id}`.
**LAW-01 Docket.** My cases (as plaintiff, defendant, witness), public docket search (court, case type, parties as public), deadlines with CountdownChip. 
**LAW-02 Case view.** CaseTimeline (filed, discovery, hearing, verdict, appeal), EvidenceCards visible to the viewer (sealed exhibits as placeholders until 13's discovery reveals them), replay embed of relevant ticks (REP-01, only for events the viewer may see), counsel choice and cost (cap ±0.75 logit stated as "Counsel can help, not decide"), settlement and plea offers with terms, verdict probability band if 13 publishes one to parties, costs to date. Actions `law.counsel.hire`, `law.settle.offer/accept`, `law.plea.enter`, `law.evidence.submit` [13].
**LAW-03 File a case.** Wizard: case type (civil, criminal referral, tribunal, arbitration, class action, derivative suit), parties, claims, evidence from own ledger/incidents (auto-attached), filing fee, malicious-prosecution warning. Actions `law.case.file {...}` [13].
**LAW-04 Verdict and sanctions.** Verdict reveal moment (3 s), sanction list (fines as % of NW with the S-tier, restitution, disgorgement, Held, op bans, license actions), collection plan (cash → positions → businesses at −15%), garnishment plan (30% of daily income) and the floor ($5,000 liquid + one T1 business). Actions `law.fine.pay` [13].
**LAW-05 Appeals.** One appeal per case, fee 2% of judgment (refunded if won), grounds (new evidence ≥ 10 points or procedural flag), escrow note. Actions `law.appeal.file` [13].
**LAW-06 Regulators.** Per regulator (market, revenue/tax, cyber, AI, banking/prudential as 13 lists): open inquiries and investigations touching the player, consent decrees, monitors, license status, required filings, surveillance score band if 13 publishes it to the subject. Actions `law.filing.submit`, `law.decree.comply` [13].
**LAW-07 Licenses.** LIC0–LIC4 status, rank gate, fee (× MSI), exam status with an "Take the exam in the Academy" link, renewal date, eligibility from 13 (`law.licenseEligibility`), suspensions; LIC1 shows "Granted in onboarding". The same view appears in Profile › Rank and Licenses (14). Actions `acct.license.buy`, `acct.license.renew`, `acct.exam.submit` [14].
**LAW-08 Whistleblower.** Protected disclosure form (evidence must come from ledger-generated sources), bounty rules (5% pool), status. Actions `law.whistle.disclose` [13].
**LAW-09 Arbitration.** Arbiter marketplace (player arbiters with reputation and fee), clauses electing arbitration, active proceedings. Actions `law.arbiter.select/register` [13].
**LAW-10 Investigations (private intelligence).** Hire a private-intelligence firm (NPC or player) to follow the ledger: scope, budget, findings as evidence items with provenance. Actions `law.investigation.hire` [13].
**LAW-11 Class and derivative actions.** Open actions the player can join, lead plaintiff, claims, status. Actions `law.class.join/lead` [13].
**LAW-12 Garnishment and debts.** Judgment debts, plans, payments, Victim Compensation Fund advances received.
**LAW-13 Held screen.** Full-screen overlay during Held (13): countdown (real time), the empire's live P&L (read-only), what still runs (businesses at 70%, AIs inside mandates, standing orders, defense), what is blocked (manual trading, ops, suits, purchases), read-only chat, grace-period banner before it starts ("Held begins in 0:41 real time; you can reduce risk now"). Exit returns to the last screen.

### §7.22 Estate (EST)

Data owner 14 (`life.*`), homes via 10.
**EST-01 Home (Estate view).** The emotional centre: the player's home illustrated at the city's current game hour, with the collection placed in it (cars in the drive, art on the walls, yacht at the dock if a berth exists); overlay cards: NW, today's goals (18), 3 suggested next steps (18 picks from real state; neutral wording), chapter progress. Tapping an item opens it in the Vault. On desktop it is the wallpaper of workspace 1 behind windows at R2+ when the "Estate wallpaper" setting is on; on phone it is the Estate app's first screen. States: rented room (R0 illustration with the window skyline), studio, loft, penthouse, mansion, estate, island/tower.
**EST-02 Vault.** Everything owned outside businesses and markets: value (14 fair value), condition, insurance status, collateral use, Prestige points, storage location (garage, marina, hangar, gallery, cellar, watch box) with capacity bars. Gallery view and table view. Actions `life.item.sell/insure/pledge/maintain` [14/07/08].
**EST-03 Showroom.** Lifestyle catalog by category (homes link to PRP; cars, watches, yachts, jets, art, wine, fashion, experiences, philanthropy, trophies), brand pages (fictional brands), player-made editions. Each item card shows price, purchase hit, upkeep per game year, PP, benefits, storage needed and rank gate before buying. Actions: Buy (EST-04).
**EST-04 Item detail and purchase.** Hero image, specs, history (for Limited/Unique), price behaviour class (Mass/Limited/Unique/Consumed), CostConfirmSheet with purchase hit, upkeep, storage check, Wire auto-post notice when > $10M, exposure note ("Prestige raises your visibility as a target", 12/14). Unique reveal moment on purchase. Actions `life.item.buy {itemId}` [14].
**EST-05 Collections and sets.** Sets with progress, set bonus (+20% PP on set items), titles earned. Actions: equip title [14].
**EST-06 Hosting.** Create an event (dinner 8, party 30, gala 100), invite list, date (one game day), cost, effects (contract fees waived between attendees, temporary room chat, Reputation bump if host Reputation ≥ 50); attending events list. Actions `life.host.create/invite/cancel`, `life.host.rsvp` [14].
**EST-07 Clubs.** Harbor Club, Glasshill Circle, Summit Society (requirements PP + Reputation, dues), benefits, membership status; The Back Room is not listed here (SEC-13). Actions `life.club.join/leave` [14].
**EST-08 Philanthropy.** Donations, named wings (shown on the city map), scholarship fund, Reputation effects. Actions `life.donate {...}` [14].
**EST-09 Chief of Staff.** Mansion+: queue up to 3 actions for the next market open while offline (an upgrade, a limit order, an upkeep payment); each queued action shows its future validation note ("Will be checked at 08:00"). Actions `life.cos.queue/remove` [14].
**EST-10 Visit an estate.** Another player's estate illustration, read-only, per their presentation privacy (item values hidden by default). From their profile.

### §7.23 Boards and chapters (BRD)

Data owner 15 (`soc.*`).
**BRD-01 Chapter hub.** Current chapter card with countdown (big serif numerals), chapter theme, ladders (richest this chapter, fastest climber with the $100k floor), challenge events calendar, Season Finals status, the player's past chapters strip. Actions `soc.challenge.join {eventId}` [15].
**BRD-02 Leaderboards.** Board tabs (Richest NWI, Richest this chapter, Fastest climber, Trader, Tycoon, Alliance, Prestige, Most Wanted (opt-in), Defender, City and Sector boards, AI tournament, Rivals), scope switch (Global, Country, Chapter), the player's row pinned with accent hairline, rival highlighted "Next up", NPC rows tagged. Data `board:{id}:{scope}` (top 100 hourly). 
**BRD-03 League week.** The player's league group (50, or 30 in Titan, Apex 1 group), promotion and relegation lines (top 10 / bottom 10), score = % NWI growth this week, countdown to week end, promotion/relegation animation at close. Data `league:{groupId}`.
**BRD-04 Hall of Fame.** Permanent per-chapter records (champions of every board globally and per country, biggest single trade, biggest crash survived, longest-lived alliance, etc.).
**BRD-05 Chapter recap.** Personal vertical story at chapter end: peak worth, best trade, worst day, nemesis (only if public facts support it: e.g. who sued you), sessions caught, chapter portrait of the estate; Share.
**BRD-06 Season Finals and challenge events.** Ring-fenced challenge portfolios (identical starts), live standings, spectator link (REP-02), rules card. The challenge portfolio is a separate Broker context with a persistent brass "Challenge" frame so it cannot be confused with the real account.
**BRD-07 AI tournament board.** Divisions (Laptop, Startup, Frontier), weekly results with benchmark ghost and house AI rows, season aggregate, opt-in published trade logs. Data 11/15.

### §7.24 Profile (PRO)

**PRO-01 Profile.** ProfileCard full: name, country flag, rank badge, chosen title, Prestige, Reputation (with history sparkline), opt-in Notoriety, top 3 displayed items, tenure ("in the world since day 41"), chapter history, pinned trade receipts (opt-in), public filings, verified track records (fund, tournament, published research; V3 Part 9 expert identity), institutions owned (public), alliance, crest. Tabs: Estate, Titles, Filings, Receipts, Legacy, Record (public court record, contracts honored vs defaulted). Actions on others' profiles: Follow, Message (if allowed), Offer contract, Invite to alliance, Visit estate, Report.
**PRO-02 Edit profile.** Avatar (silhouette, outfit, watch, pose), title choice, pinned receipts, bio (moderated), crest builder.
**PRO-03 Legacy.** Founding plaques, chapter portraits gallery, "My beginnings" bookmark to the first storefront (LC01), named towers and wings, permanent history entries (14).
**PRO-04 Dynasty and succession.** Dynasty-tier: dynasty crest, heirs and succession plan as 14 defines (succession of a character's empire), institutions held by the dynasty. Actions `acct.dynasty.*` [14].

### §7.25 Alliance (ALL)

Data owner 15.
**ALL-01 Directory and create/join.** Browse alliances (name, crest, type Partnership → Firm → Corporation → Conglomerate, member count, Alliance board rank, requirements); create; invitations. Actions `soc.alliance.create/apply/accept/leave` [15].
**ALL-02 HQ.** Desktop: ops board centre, chat right; Phone: tabs. Crest reveal on first open. Overview of treasury, members, roles, rivalries, joint holdings (banks, funds, exchange concessions as institutions).
**ALL-03 Treasury and roles.** Balance, contributions, withdrawals with approval rules, role editor (permissions matrix), audit log (embezzlement is possible and leaves a trail). Actions `soc.alliance.treasury.move`, `soc.alliance.role.set` [15].
**ALL-04 Ops board.** Joint ops and campaigns (12) with participants and status; shared SOC (defense pooling). Actions `ops.joint.propose/join` [12/15].
**ALL-05 Syndicates.** Equity syndicates for deals (stakes, voting weight, payouts), syndicate builder via CON-02 templates. Actions `soc.syndicate.create/join` [15].

### §7.26 Contracts (CON)

Data owner 15 (`soc.contract.*`), escrow at the Clearing House.
**CON-01 Inbox.** Offers received, drafts, active, completed, breached; deadlines.
**CON-02 Builder.** Templates (Sell business, Loan with collateral, Lease, Revenue share, Join syndicate, Option, Service level, Non-compete, NDA, Bounty, Penalty) and the advanced canvas of ClauseCards with a live plain-language summary, counterparty Reputation panel at signing (default history, convictions, chapters played), off-market warning (price > 10% from fair value, 0% loans, new-account counterparties flagged and capped by account age), fees (0.5% registration + 2% P2P transfer tax shown). Desktop canvas; phone step-by-step clause cards. Actions `soc.contract.propose/counter/withdraw` [15].
**CON-03 Contract detail.** Clauses, escrow status (locked assets and money), schedule of executions, breach detection status, court link for unverifiable clauses, signature with pen-stroke animation and escrow lock. Actions `soc.contract.sign/exercise/terminate` [15].

### §7.27 Auctions and exchanges (AUC)

Data owner 15 (mechanism), 14 (collectibles), 09/10 (business/property), 11 (data/models).
**AUC-01 Auction house.** Lots by category (watches, art, cars, wine, Unique trophies, estate sales of dormant accounts, concession re-auctions), gallery and list views, filters, upcoming and live. Pre-auction viewing 1 game hour early for Summit Society members (14).
**AUC-02 Lot and live bidding.** Lot hero, provenance, estimate band, reserve met/not met, current price, bid history (bidders as "Bidder 4" unless public), end tick with anti-snipe extension (+12 ticks if a bid lands in the last 12), bid sheet with buyer premium (15%) and seller fee (12%) shown. Hammer-down with Unique reveal. Actions `soc.auction.bid {lotId, amount}`, `soc.auction.list {itemId, reserve, endTick}` [15].
**AUC-03 Business and property exchange.** Listings with fair-value check from 09/10 (off-market prices flagged), bids, settlement at tick, 2% tax shown. Actions `soc.exchange.list/bid/accept` [15].
**AUC-04 Data market.** Dataset listings (buyer gets a licence; seller keeps the original), provenance and legal tags, price, licence terms. Actions `lab.data.list/license` [11].
**AUC-05 Model market.** Licensed models (rental per game day, watermarked; never weights), capability summaries, licence terms. Actions `lab.license.accept` [11].

### §7.28 Civic (CIV)

Data owner 16.
**CIV-01 Politics overview.** Per bloc: government composition, approval, upcoming decisions (policy, tax bills, capital rules, trade policy) with timelines, recent decisions and who supported them (public lobbying registry).
**CIV-02 Bill page.** Text summary, affected sectors, status, public positions of NPC institutions, the lawful lobbying registry entries, how to engage.
**CIV-03 Lobbying.** Register as a lobbyist (16 eligibility), campaigns (budget, position, target institutions), public disclosure of lobbying spend (lawful lobbying is public), warning that bribery is a separate crime. Actions `soc.lobby.register/fund/withdraw` [16].
**CIV-04 Elections.** Calendar, candidates (NPC), platforms, polling as 16 publishes, lawful campaign donations with disclosure. Actions `soc.donate.campaign` [16].
**CIV-05 Named actors directory.** Search 600+ named NPC actors and institutions; dossier cards (§6); relationships known to the player.
**CIV-06 Dynasties and discoveries.** Dynasty graph (OwnershipGraph style) showing only links the player has discovered or that are public, each with provenance; discoveries log (P07 secrets with provenance); choice actions on a discovery (keep, share, sell by contract, report to a regulator). Actions `soc.discovery.share/report` [16/13].

### §7.29 Academy and Help (ACD, HLP) — layouts; content and rules in 18

**ACD-01 Academy home.** Course map by track (Basics, Trading, Businesses, Property, Banking & Credit, Funds & Structured, Derivatives, Macro, AI Lab, Security, Law, Corporate Finance, Institutions, Lifestyle & Status, Multiplayer), progress rings, badges, recommended next course (18's rule), practice worlds entry.
**ACD-02 Lesson player.** One concept per screen, interactive widget (payoff chart drag, order book sandbox, margin simulator, curve shifter), "Try it" step in a practice world, quiz.
**ACD-03 Practice world.** A ring-fenced sandbox Broker/app with a persistent brass "PRACTICE" frame and its own clock controls (pause, 1×, 4×, 20×), notional balance, reset; never ranked; nothing carries over.
**ACD-04 Drills.** Security drill (harmless training session on a practice model), margin-call drill, bank-run drill, court drill, liquidation drill; each with a debrief.
**ACD-05 Quizzes and licence exams.** Question cards, results, retry gate (18; licence exams scored by 14 `acct.exam.submit`).
**ACD-06 Badges.** Earned Academy badges (cosmetic).
**HLP-01 Help centre.** Search, categories, articles (18), glossary, keyboard sheet link, support ticket.
**HLP-02 Contextual help.** The `?` affordance on every screen header opens a side sheet with that screen's article and its glossary terms.
**HLP-03 Glossary.** Every term with a plain definition, formula where relevant, and links.
**HLP-04 Explain this number.** Long-press/hover on any owner-computed number with a published formula shows its inputs and formula (18 §3.12 L1).
**HLP-05 Support.** Ticket form (§4.2), ticket status, appeals of enforcement (21).

### §7.30 Atelier (BTQ) — data owner 21 (L7)

The real-money cosmetics store is named **Atelier** (21 Rule 3.11.3; ruling in 24). Screen codes keep the prefix BTQ. The word "Boutique" is reserved for 14's in-game luxury shop (paid with game money).

**BTQ-01 Storefront.** Cosmetics only: shells and estate styles beyond earned ones, avatar outfits, profile frames, crest parts, crown tower styles if 21 sells them for real money (otherwise in-game money via CTY-06), desk items. Every item shows "Cosmetic only. Never affects money, Prestige, rank or odds." No random items, no loot boxes, no timers, no "limited time" countdowns. Purchased items are labelled "Purchased" everywhere they appear.
**BTQ-02 Item preview.** Live preview on the player's own shell/profile.
**BTQ-03 Cosmetic chapter pass.** Earned track and premium track of cosmetics only; progress from playing; no money, Prestige or rank rewards.
**BTQ-04 Purchase.** Platform IAP sheet (app stores) or web checkout (21); receipts; refunds per 21.

### §7.31 Replay and spectating (REP)

**REP-01 Replay viewer.** Animated timeline of a public event (crash day, hostile takeover, famous case) or of the player's own trades, reconstructed from the event log through 19's replay API with visibility filtering (public events for everyone; own private events for the owner; case parties per 13). Controls: play, pause, speed (1×–60×), scrub, jump to markers; panes: price, Wire, filings. Never shows private data of others.
**REP-02 Spectator page.** Season Finals and challenge events: live standings, public trades of finalists (challenge portfolios are public by the event's rules), commentary feed from 16 templates.

### §7.32 API (API) — data owner 19

**API-01 Keys.** Create/revoke keys with scopes (read market, read me, trade, lab), IP allowlist, expiry; rate limits displayed (same 20 intents/tick and DU caps as the UI, 00 §5.5). Shown only when `api.eligible`.
**API-02 Usage.** Calls, intents, rejects by reason, rate-limit hits.

### §7.33 Admin console (ADM) — internal staff app, data owner 21

A separate staff web app (not in Quay), same tokens, Ink & Brass only, every action audited as an event with reason code and, where 21 requires, second approval.
**ADM-01 Player search.** By handle, account id, email (staff with PII role only), device cluster; result cards with flags.
**ADM-02 Player view.** Ledger and event history (03), positions, cases, enforcement history, linked-account graph (15 anti-cheat), notes. Actions: freeze, unfreeze, warn, clawback (compensating entries, two approvals), compensation (two approvals).
**ADM-03 World control.** Partition health, tick timing histogram, pause world / market halt with diegetic message, resume, deploy status.
**ADM-04 Live events and scheduler.** Calendar of scheduled events (central banks, earnings, finals, holidays, challenge events), create/cancel, inject or cancel news (with audit), feature flags and staged rollouts.
**ADM-05 Config knobs.** PARAM registry browser (23) with current values, proposed changes, approval workflow.
**ADM-06 Moderation queue.** Reports (chat, names, statements, bios), context, actions (remove, mute, ban), appeals.
**ADM-07 Support tickets.** Queue, player context, replies, macros.
**ADM-08 Integrity dashboards.** Money minted vs destroyed per tick by reason code, top wealth deltas with explanation breakdown, P2P flow graph, flagged accounts, invariant status and Truth Machine reports (20).
**ADM-09 Store and monetization.** Cosmetic catalog management, pass seasons, rewarded-ad metrics (eligibility checks, counts, AD_GRANT faucet alert), refunds (21).

### §7.34 Onboarding surfaces (ONB) — layouts; sequence and rules in 18

**ONB-01 Cold open.** Black → phone lock screen card ("Balance: $5,000.00", "Rent due Friday.") over the home-city skyline silhouette; one accent button **Start**, text link "I've played before". Fades 420 ms per element, 220 ms stagger; light haptic on phone.
**ONB-02 Who are you.** Name (handle, moderated, availability check), avatar silhouette picker (3 outfits), home city (3 FDL-bloc cities as illustrated cards, Port Avalon default), background (4 cards with one-line tilt each). One step per screen on phone, one sheet on desktop.
**ONB-03 First business.** City map zoomed into one district with up to 4 suggested B1 spots glowing (CityCanvas T0/T1 allowed); a BusinessCard sheet with price, expected earnings range and the background discount; one tap buy; keys moment.
**ONB-04 Coach marks.** One-sentence anchored bubbles (max 1 visible), each with "Got it"; never block input; never more than one per 20 real seconds.
**ONB-05 First news card.** The Wire's chosen engine headline expanded over the chart (tag, headline, asset sparkline and move, "Look at {TICKER}").
**ONB-06 First trade.** BRK-01 Simple with the 20% cap note, honest note, pending ring, fill toast, "First trade" receipt card.
**ONB-07 League and rival card.** The league group table with the player's row and the closest player above highlighted ("Next up · $1,240 ahead"); tap opens their public profile.
**ONB-08 Gift and Me.** Gift box with the starter watch (Kessler Field, gift item), outfit pick, Prestige chip "Prestige 1. The top of your league has 14."
**ONB-09 First decision.** Three choice cards (second business, upgrade twice, $1,000 into an ETF), each opening its real flow.
**ONB-10 Window to the future.** The room pan (estate illustration of the rented room) with tappable hotspots: laptop ("The Lab opens at $100k"), locked drawer (Security, protection countdown and its early-end rule), poster (Summit Estates, "Someday."), each one line + unlock.
**ONB-11 Goals card.** Three starter goals with ProgressBars; completed goals tick (420 ms) and the next goal slides in.
**ONB-12 Leaving well.** "Your business keeps earning while you're away (8 hours, 16 with a manager). Want a ping when you hit $20k?" Buttons: "Yes, ping me" (triggers the OS permission prompt) and "Not now". Then the account-upgrade prompt for guests ("Keep your progress: create an account").
**ONB-13 JIT intro card.** The 30–60 s introduction format used by every just-in-time intro (18 §3.8): title, one sentence, a live widget or guided step, Skip, "Show me later".

### §7.35 Ledger explorer (PF-11)

**PF-11 Ledger explorer.** Every posting on the player's own entities (character, companies, funds, institutions) from 03: tick, entry id, accounts, amount, currency, reason code and class (FAUCET, SINK, TRANSFER, CREDIT_CREATE, CREDIT_DESTROY, REVALUE), refs with links. Filters by entity, reason class, code, period; running balance per account; export CSV. Virtualized to 10,000+ rows. Data 03 ledger read API (owner-scoped). This is how "every dollar has a reason" is visible to the player (V3 T5).

---

## §8 Edge cases

1. **Joining when equity markets are closed.** Broker opens on the first available instrument whose session is open; queued orders show "Queued for the opening auction at 08:00". Onboarding handles the first trade per 18 §3.3.4.
2. **Two devices or two tabs at once.** Both are live; intents de-duplicate by `intentId`. Drafts are per device. Prefs are last-write-wins by server timestamp. Moments play only on the device with the most recent input in the last 60 real seconds; other devices file them to history.
3. **Clock skew.** Device clocks are never used for game time. Real-time countdowns (protection, Held, cooldowns) use the server time offset measured at connect and refreshed every 60 s.
4. **Huge and tiny numbers.** Values ≥ $1T abbreviate with `T`; values beyond $999T use `$1,234T`. Amounts that round to zero but are non-zero show `<$0.01` or `>−$0.01`, never a signless zero. Negative NW shows in `loss` with the minus and the low-cash card logic.
5. **Asset delisted, halted for days or restructured.** Watchlist rows show "Delisted Day n" or "Halted since Day n"; positions remain visible with the last fair value from 05/06 and a link to the restructuring (CMP-16) or claim (06).
6. **Window outside the viewport** after a resolution change: re-snap to the nearest slot; if no layout fits, fall back to compact mode.
7. **Locale switch mid-session.** Re-render without reload; drafts keep their canonical values (inputs store canonical decimal strings, not locale strings).
8. **Held while composing an order.** The draft stays; the ticket shows the Held blocked state; standing orders listed as "still live".
9. **Rank-up while in Focus mode, during a pending order, or during a world event.** Queued per §3.9; a world event overlays first; the rank-up waits.
10. **P0 alert during a takeover.** The banner appears above the takeover; the takeover is skippable immediately (no 1 s lock) when a P0 is present.
11. **Very large lists** (T5 with 120 connections, 10,000 ledger rows, 500 positions): grouping and virtualization; sort and filter run on the client over delivered data only.
12. **Assistive technology during moments.** Moments render as an `alertdialog` with the text content; no animation is required to understand them.
13. **Text scale 200% on a phone.** Broker uses the narrow form; tables switch to stacked rows with labels.
14. **Device cannot render the city** (no WebGL2 or < 45 fps): T0 picture plus the list view.
15. **Deleted or anonymized players** in history: names render as "Former player #8812" everywhere, including old Wire items and boards (02 §5.3).
16. **Name under moderation:** the owner sees "Pending review"; others see the previous name or a generic "Player #n".
17. **Notification for something already resolved:** the deep link opens the item showing its resolved state and a one-line "Resolved at 14:20".
18. **Guest attempting gated actions** (contracts, P2P, bidding): a sheet explains the account requirement with the upgrade flow; progress is kept.
19. **Same asset open in several Broker windows:** all share the same draft only if the player links them (link toggle); otherwise independent drafts; Enter acts only in the focused window.
20. **Reconnect with pending orders:** pending rows keep their tick; results arrive in the replayed deltas; nothing resubmits.
21. **Quiet hours spanning a P0 event:** P0 still pushes; others are held to the WYWA.
22. **Player switches palette during a moment:** applies after the moment ends.
23. **Shell chosen that is later unavailable** (a cosmetic refunded): falls back to the highest earned rank shell.
24. **Player in a practice world or challenge event receives a real P0 alert:** the alert banner breaks through the PRACTICE/Challenge frame with "Real account" label.
25. **Language with longer strings breaks a button:** buttons wrap to two lines up to 2 lines, then truncate with tooltip; number fields never truncate.

## §9 Exploits and counters

| Exploit | Counter |
|---|---|
| Datamining the client or network to tell hostile from legitimate connections | server serializes identically (02 §4.2); client renders identically (§3.11.3); a test diffs DOM and network frames of worlds that differ only in hostility and expects identical output except labels drawn from the same random distribution |
| Timing side-channel (refresh cadence, animation duration, ordering) revealing new hostile entries | fixed 30-tick refresh; identical insert animation for every row; ordering by player-chosen sort only; the list never reorders on arrival except by that sort |
| Scraping faster than allowed by keeping many windows open | all windows share one subscription per channel; the gateway enforces per-account rate limits regardless of client |
| UI macros or scripts as a speed edge | batch auction removes speed advantage; human rate limit (20 intents/tick, 00 §5.5) applies to UI and API alike; anti-automation patterns are 15's |
| Claiming higher shells give advantage | Quay hard rule plus acceptance test 17-AT-12 |
| Notification spam as harassment (mass contract offers, DMs) | per-sender caps (15), push collapse and one push per sender per real day for offers, DMs only from friends or counterparties, block |
| Impersonating staff or the system in chat or names | reserved words blocked in handles and company names ("Quay", "Support", "Admin", "Moderator", "Exchange", "Clearing House", "Regulator", "System" and their French forms); system messages render with a badge that user content cannot produce (separate channel, no rich text in user content) |
| Fake share cards to scam or brag | cards are server-rendered from records and carry a short verification code; the public verify page shows exactly the card's allowed fields |
| Locale tricks in contracts (decimal comma vs point) | contract and loan amounts ≥ $10,000 also render in words in the viewer's locale and in canonical form; amounts are stored as canonical decimal strings |
| Homoglyph handles impersonating famous players | confusable normalization at registration (15/21); ProfileCard compact shows tenure and country so look-alikes are distinguishable |
| HTML/script injection through names, bios, statements | all user text rendered as plain text; crests built from the parts library only; no user images at launch |
| Overlay/clickjacking via embedding | the app sends frame-ancestors none; share pages are static images |
| Using the Research Desk to isolate one account's flow | k-anonymity per closed day, whole-percent rounding (§3.11.5) |
| Reading the future from UI artifacts (event end, remaining duration) | no UI element derives from end ticks (§3.11.4); test 17-AT-20 |
| Reading another player's online status from city or estate | no presence-driven visuals (§3.11.7); test 17-AT-21 |
| Fat-finger losses blamed on UI | confirm thresholds (§3.8), canonical inputs, full-precision preview |

## §10 Acceptance tests

17-AT-01 Every user-visible string in the client comes from a message key; a lint run over the UI packages finds zero raw JSX text and zero hex colour literals outside the tokens file.
17-AT-02 With `data-palette` absent every token equals its Ink & Brass value; for each of the four palettes the computed values equal §3.3.1, and a DOM snapshot of the component tree is identical across palettes apart from the attribute on `<html>`.
17-AT-03 The contrast script confirms §3.3.1 floors for all palettes on `win`, `win2` and `chrome`.
17-AT-04 `formatMoney` returns `$12.4k`, `$3.21M`, `$1.05B`, `$4.2T` style outputs for list context, full precision for table context, U+2212 for negatives, and identical results to a reference table of 500 cases in en and fr.
17-AT-05 No module in the UI packages performs arithmetic on Money values outside `format.ts` (static analysis).
17-AT-06 A submitted order shows "Pending · tick N" with N equal to the gateway acknowledgement, and the fill appears in the same render as tick N's deltas; no balance changes before the delta.
17-AT-07 Launcher commands, layouts, Focus mode, keyboard shortcuts other than Enter in a ticket, notifications and pre-fills never create or change an intent (e2e compares the intent log before and after each).
17-AT-08 Every intent class in the §3.8 table opens the specified confirmation; HoldToConfirm requires the full 1,200 ms hold; screen-reader mode offers the two-step alternative.
17-AT-09 The CostConfirmSheet values equal `/intent/preview` output exactly for 200 scripted intents across modules.
17-AT-10 The moment queue: given scripted simultaneous rank-up, major world event, milestone and daily close, they play in priority order with ≥ 8 s gaps; the takeover is dropped if blocked for more than 10 s; nothing plays while an order countdown is pending.
17-AT-11 Push cap: with 12 pushable events in one real day for an account not under attack, exactly 5 pushes are sent and the rest appear in WYWA; during quiet hours only P0 pushes are sent.
17-AT-12 No rank advantage: the same scripted session at R0 and R6 shows identical tick timing, order-to-fill latency, available order types, Broker instance limit, launcher results and keypress count for a keyboard order.
17-AT-13 Connections: two staged worlds identical except that one entry is hostile produce identical network frames (modulo label values drawn from the shared label generator) and identical DOM structure, ordering and animation classes.
17-AT-14 The connections panel never refreshes more often than once per 30 ticks, verified over 1,000 ticks with the window open.
17-AT-15 Clues and decoys render with the same component, copy pool and timing distribution (chi-square on 10,000 simulated anomalies, p > 0.05).
17-AT-16 Every screen in §7 is reachable by keyboard alone and announces its title; axe-core reports zero serious violations on every screen at 1440, 1000 and 390 px.
17-AT-17 Text scale 200%: no screen at 390 px has horizontal scrolling of the page or overlapping text; numbers are never truncated.
17-AT-18 Reduced motion: no transition longer than 0 ms except the tick ring step; reduced transparency: no `backdrop-filter` in the tree.
17-AT-19 French: 100% of keys present in `fr.json` at shared-world launch; screenshots at +30% length show no clipped buttons or numbers.
17-AT-20 No UI string, element or attribute is derived from a world event's end tick or remaining duration: a forced event shows the same banner on day 3 whatever its length.
17-AT-21 Privacy: two worlds with identical public records but different private trades, orders and online times produce byte-identical public city payloads, crown towers, profiles, boards and estate visits.
17-AT-22 Research Desk: `desk-to` cannot be set after the last closed day; no flow row ever names a player or NPC fund; a window where one account exceeds 40% of a bucket folds that day into Retail.
17-AT-23 Performance: tick apply + render ≤ 8 ms p95 on the mid-range Android profile with Broker, Wire and Portfolio open; Broker route JS ≤ 200 KB gzipped; 60 fps scrolling at 500 positions.
17-AT-24 City render tier falls to T1 when the first 2 s measure below 45 fps and to T0 without WebGL2; the list view reaches every entity reachable on the map.
17-AT-25 Reconnect after 10 real minutes replays missed `me` deltas so positions and balances match a fresh snapshot exactly; after more than 1 game day a snapshot is used.
17-AT-26 Low-cash card appears only when NW < $1,000, at most once per real day after dismiss; the ad offer row never appears when ineligible and no ad starts without a tap.
17-AT-27 Share cards contain only template-allowed fields; the default share contains no cash balance, quantity or position size; the verification code page shows the same fields.
17-AT-28 Restricted cash pills (`AD`, `START` and any other owner-defined bucket) match the engine's restricted buckets and release times; an order using restricted cash for a blocked use shows the invalid state with the exact reason.
17-AT-29 Simple and Pro submit identical intent kinds: for 50 scripted actions per app, the Simple payload equals the Pro payload with the documented defaults filled.
17-AT-30 Every NPC entity on a board, auction or league row carries the "NPC" or "House" tag.
17-AT-31 Unlock rules: each app's state (hidden, locked, unlocked) matches §3.2.4 for scripted characters at every rank, license and flag combination; rank-based unlocks never re-lock.
17-AT-32 The system overlay for a world halt appears within one tick of the halt event and blocks no read-only screen.
17-AT-33 The Held overlay shows countdown, live P&L and the blocked/allowed lists; manual order intents from the UI are not offered during Held (and are rejected server-side if forced).
17-AT-34 Forced update overlay keeps drafts; after reload the draft is restored unchanged.
17-AT-35 Copy lint: zero banned words (§3.20) in system strings, explanation templates and bankruptcy screens.
17-AT-36 Every numeric cell has an `aria-label` produced by the speak functions; screen-reader smoke test reads a position row as "Halcyon, 40 shares, 42.10 dollars, up 1.2 percent".
17-AT-37 The WYWA stack appears after ≥ 30 real minutes away, lists every open P0/P1 item, and can be completed in ≤ 6 swipes when there are ≤ 5 action items.
17-AT-38 Contract amounts ≥ $10,000 render in words and canonical form in both locales.
17-AT-39 Handles containing reserved words or confusables are rejected at the UI and server (shared validation schema).
17-AT-40 With a P0 alert active, no toast or banner covers an active OrderPad at any breakpoint.
