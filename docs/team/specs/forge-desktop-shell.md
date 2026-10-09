# Quay shell: window manager, routing, phone app stack, performance
Owner: Forge (app side). Visual source of truth: `velvet-desktop-os.md` (Velvet). Tests: Tape. Brief: Ledger, 2026-10-09 (Mathis: full redesign; Ink & Brass picked as the default palette).
Status: spec only. No UI code until Velvet's direction is final. Logic, state, saves and engine wiring from Phase 0/onboarding carry over unchanged.

## 1. What changes and what doesn't
- **Survives as is:** engine wiring, `src/game/store.ts` (world, history, tick loop, orders, persist), saves, onboarding logic (`src/game/onboarding.ts`), license gate, rank math, i18n, e2e hooks.
- **Replaced:** the page-level layout. `Shell.tsx` (NavRail, TabBar, WireStrip, TradeSheet), `TopBar` and `PhoneHeader` become the OS root, the status strip, the shelf and the phone home screen.
- **Rehomed:** each current screen becomes the content of an app window (section 7). Content components stay presentational and take no layout assumptions beyond "fill your container".

## 2. Modules
| Module | Kind | Role |
|---|---|---|
| `src/shell/apps.ts` | pure | App registry: id, title key, min size, max instances, unlock check `(world, playerId) => boolean`, route segment, lazy loader |
| `src/shell/wm.ts` | pure | Window-manager reducer: `(ShellState, WmAction, Ctx) => ShellState`. No React, no DOM; unit-tested like `onboarding.ts` |
| `src/shell/geometry.ts` | pure | Workspace rect, slot rects (1/2, 1/3, 2/3, quarters, fill), gutter, clamp, nearest-slot, named layouts |
| `src/shell/route.ts` | pure | URL ⇄ `{app, props}` parse and format |
| `src/shell/store.ts` | zustand slice | Holds `ShellState`; dispatches to `wm.ts`; persists through the game save's `persist()` |
| `src/shell/prefs.ts` | device prefs | Palette, reduced transparency override, key remaps. `localStorage['tg-prefs']`, never in a save |
| `src/components/os/*` | React | OsRoot, StatusStrip, Shelf, WindowFrame, Launcher, Toasts/Bell, PhoneHome, PhoneAppBar. Built after Velvet's sign-off |

`Ctx` gives the reducer what it may not know on its own: viewport size, workspace count (from earned rank), unlocked apps, and `now` for nothing time-sensitive (the reducer is deterministic).

## 3. Window-manager state
```ts
type AppId = 'broker'|'portfolio'|'wire'|'messages'|'businesses'|'ailab'|'research'
           |'bank'|'legal'|'security'|'boutique'|'settings'|'company';
type Slot = 'L2'|'R2'|'L3'|'C3'|'R3'|'L23'|'R23'|'TL'|'TR'|'BL'|'BR'|'FILL';
interface Rect { x: number; y: number; w: number; h: number }      // px, workspace-relative
interface Win {
  id: string;              // 'broker-1', 'portfolio', 'research-<fileId>'
  app: AppId;
  ws: number;              // 0-based workspace
  rect: Rect;              // last free rect (used when slot is null)
  slot: Slot | null;       // when set, rect is derived from the slot, never stored drift
  state: 'open'|'collapsed';
  filled: boolean;         // Fill control; restores to slot/rect
  props: { ticker?: string; fileId?: string; view?: string };
}
interface ShellState {
  v: 1;
  wins: Win[];             // z-order = array order, last = top. No z numbers stored
  activeWs: number;
  focusMode: boolean;
  focusRestore: Record<string, { rect: Rect; slot: Slot | null }> | null;
  layouts: { name: string; wins: Pick<Win,'app'|'slot'|'rect'|'props'>[] }[];  // max 5
  shelf: AppId[];          // order; 'broker' pinned first
  vp: { w: number; h: number };  // workspace size when last saved
}
```
**Focus** is derived, never stored: the top-most `open` window on `activeWs`. So focus and z-order can't disagree.

**Actions** (`WmAction`): `open(app, props)`, `focus(id)`, `close(id)`, `collapse(id)`, `restore(id)`, `fill(id)`, `snap(id, slot)`, `snapCycle(id, dir)`, `move(id, rect)`, `resize(id, rect)`, `applyLayout(name)`, `saveLayout(name)`, `switchWs(n)`, `moveToWs(id, n)`, `toggleFocusMode()`, `viewport(w, h)`, `reorderShelf(order)`.

**Rules the reducer enforces**
1. `open` on an app already open focuses it (and switches to its workspace), except Broker (max 4) and Research files (one per file). A fifth Broker focuses the least-recently focused one and changes its ticker instead of failing silently.
2. `open` on a locked app is a no-op that returns a `locked` result for the shelf tooltip. Locked apps can't be opened by layouts, deep links or a hand-edited save.
3. Snapped windows: rect is recomputed from the slot on every `viewport` action, so snap layouts are exact at any size. Shared-edge drag (Velvet: snapped neighbours resize together) is a `resize` that updates both windows' slots to a custom split. The split ratio is stored as a fraction, not px.
4. Free windows on `viewport`: clamp into the workspace. If the clamped rect is under the app's minimum size, snap to the nearest slot (Velvet: "re-snaps to the nearest slot").
5. Focus mode on: snapshot every rect and slot on `activeWs` into `focusRestore`; an unsnapped workspace gets the Trade layout. Focus off: restore the snapshot exactly, then drop it.
6. Workspace count comes from **earned** rank, not from the shell look picked in Settings › Shell. Picking the R0 look at R3 keeps 3 workspaces, so windows never vanish.
7. `close` on a Broker with a pending order is refused by the reducer with `confirm`; the frame shows Velvet's prompt and re-dispatches with `force`.
8. Nothing in `wm.ts` can create, change or cancel an order. The reducer has no access to the game store.

## 4. Save and restore
- `SaveGame.shell?: ShellState`. Optional field, so **saveVersion stays 1**: a save without it gets the Trade layout (new save) or a layout built from the old tab (migrated save: Broker on the last selected ticker, Wire and Portfolio).
- `persist()` writes the shell slice only on settled actions (pointer up, keyboard snap, open, close, layout). Never on pointermove. It shares the existing save write, so there's one storage write per change, not two.
- Validation on load: drop windows for unknown or locked apps, clamp Broker to 4, drop duplicate ids, clamp `activeWs` to the earned count, and recompute rects against the current viewport. A corrupt `shell` field falls back to the Trade layout and never blocks loading the game.
- **Per device, not per save:** palette, reduced transparency, key remaps (`tg-prefs`). **Per profile, not per save:** ad cap and fresh-start cooldown (see `forge-save-format.md`). **Per save:** windows, layouts, focus mode, shelf order.
- The shell state holds no game information. It's layout only, so it's safe under the no-leak rule.

## 5. Routing and deep links
One page hosts the OS. The URL names the focused app so any app is linkable and the browser Back button works on phone.

| URL | Opens |
|---|---|
| `/` | Restored layout (or Trade layout) |
| `/broker?t=HLCN` | Broker on HLCN (focus an existing Broker on HLCN, otherwise the active Broker switches ticker) |
| `/portfolio`, `/portfolio/journal`, `/portfolio/analyst` | Portfolio, on that view |
| `/wire` | Wire |
| `/research?file=<id>` | Research Desk, that file (R3 gate applies) |
| `/settings`, `/settings/about` | Settings; About holds the credits and **Replay intro** (replaces `/credits`) |
| any other app id | That app |

- Implementation: an optional catch-all route `src/app/[[...app]]/page.tsx` with `generateStaticParams` over the app ids and their views, so the build still works as a static export for Capacitor. Tickers and file ids live in the query, which keeps the static route list finite.
- Existing flags keep working on every route: `?seed`, `?fresh`, `?intro=off`, `?e2e`.
- **Desktop:** focusing a window updates the URL with `history.replaceState` (no history spam). Opening a deep link restores the saved layout first, then opens or focuses the target.
- **Phone:** opening an app uses `pushState`, so browser Back, Android Back and the app-bar chevron all go back one app, and Back from the first app returns home.
- A deep link to a locked app lands on the desktop or home with the locked tile highlighted and its unlock tooltip. It never opens the app.
- `/credits` redirects to `/settings/about`.

## 6. Phone: home screen and app stack (switcher)
- Below 768 px the same `ShellState` is not used for layout. The phone keeps a separate, unsaved **app stack**: `{ stack: { app, props }[] }`, at most 6 entries (Velvet's Recent list), most recent on top.
- Opening an app pushes it (or moves it to the top if already in the stack). Back pops. Home clears the visible app but keeps the stack.
- **Switcher (decided, Velvet):** a long-press on the Quay mark, plus swipe-up-and-hold on the bottom bar in the installed app, opens the "Recent" bottom sheet: up to 6 rows, each with the app icon, name and one live line (e.g. "HLCN 84.62 · ticket open"). Tap switches, swipe left removes the entry, and there's a Home button. The live line comes from the same narrow selectors as the windows, so the sheet costs no extra ticks.
- **Ticket drafts:** a Broker's unsent ticket (side, type, qty, prices) is kept per Broker instance in session memory, not in the save. Removing the Broker from Recent keeps the draft for that ticker until the session ends, and the row shows Velvet's dot while a draft exists. A draft never becomes an order without `Enter` in the Broker.
- Kept warm: the top 3 apps in the stack keep their React state (scroll, ticket draft, selected view). Their charts unmount when hidden and rebuild from history on return. Deeper entries keep only `{app, props}`.
- **Edge swipe:** "swipe from the left edge = back" works only in the installed PWA and Capacitor. In a Safari or Chrome tab the browser owns that gesture, so there it's the app-bar chevron and the browser's own back.
- **768–1199 px (decided, Velvet):** the status strip and shelf stay; one window opens filled and the shelf switches between windows. From 1000 px, two halves are allowed (`L2`/`R2` only). Thirds, quarters and named layouts need 1200 px. The reducer gets a `mode: 'single'|'halves'|'full'` from `Ctx`; the saved full layout is never overwritten in a smaller mode and comes back exactly when the viewport grows.

## 7. Existing screens to apps
| Today | Becomes |
|---|---|
| `Market.tsx` ChartCard + `OrderPad` + open orders | **Broker** (one per ticker, up to 4) |
| `Watchlist`, `TickerStrip` | Broker's ticker list, plus the launcher's Tickers group |
| `Market.tsx` Positions, `Portfolio.tsx` | **Portfolio** (net-worth header, positions, journal, replay) |
| `WireStrip` + Wire list | **Wire** (band label only, per Quant's `wire().band`) |
| `TopBar` (clock, speed, rank, net worth) | Status strip |
| `PhoneHeader` | Phone status bar + home widget |
| `TradeSheet` (phone) | Broker app full screen; the ticket is inline, no sheet |
| `Toasts` | Notification layer + bell (Velvet's rules: max 3, never over the Broker ticket) |
| `/credits` + `ReplayIntro` | Settings › About |
| Onboarding `ColdOpen` | System overlay over the OS during boot and warmup (it already plays while the market loads) |
| `FirstNews` | Anchored to the Broker chart, as now |
| `ReceiptCard`, `StopExplainer` | Portfolio positions, as now; the receipt also posts a toast if Portfolio isn't open |
| `GoalsCard` | Portfolio top on desktop, under the home widget on phone |
| `RankUpOverlay` | OS update ceremony `os-update`. The trigger logic (`pendingRank`, no pending order, 10 s idle, skip after 1 s) is unchanged |
| `ShellCrack` | `os-crack` in the R0 hardware layer |

**First session:** a fresh save opens the Trade layout with Broker focused, so onboarding's simple ticket, first news and receipt all sit in the windows they already target. During the cold open, the R0 boot (900 ms) runs before the save loads, as Velvet's hard rule says.

## 8. Palettes at runtime
- `html[data-palette="ink-brass|broadsheet|phosphor|riviera"]`, default `ink-brass`. Set before first paint by a tiny inline script in `layout.tsx` that reads `tg-prefs`, so there's no flash of the wrong palette.
- Palette blocks are Velvet's (`handoff/tokens.css` v2): Ink & Brass keeps every current name and value, and the other three override the same names. Forge only sets `data-palette` on `<html>`.
- **Charts don't read CSS.** lightweight-charts draws on canvas with JS colours, so a palette switch must re-apply them. `usePalette()` reads the computed tokens and calls `chart.applyOptions` and `series.applyOptions` on every live chart when the palette changes. No reload, no remount.
- Per-palette extras are CSS only (Phosphor: radius 6, mono caps titles; Broadsheet: flat accent button), keyed on the attribute, so the DOM is identical across palettes (Velvet's acceptance).
- The "colour-blind friendly gains and losses" setting suggests Phosphor first, as Velvet specs. It never switches palette by itself.

## 9. Performance with several live charts
Budget: up to 4 Broker charts plus the Portfolio net-worth chart live at 20x, at 60 fps on Tape's desktop profile.
1. **One clock.** The game store keeps the single tick loop. The UI reads it once per animation frame: if several ticks land in one frame, each chart gets one `series.update()` for the last bar, never a `setData`.
2. **Narrow subscriptions.** Each window subscribes with a zustand selector to its own ticker's last bar and quote. A tick on HLCN doesn't re-render a Broker on BRNT, and z-order or focus changes don't re-render any app content (they only touch the frame's `style.zIndex`).
3. **Hidden means paused.** Collapsed windows, windows on other workspaces, and phone apps not on screen stop subscribing. On show, the chart does one `setData` from history and resumes.
4. **Drag and resize without React.** Moving a window writes `transform` on the frame element through a ref, once per frame. The store gets one `move` on pointer up. Resize clips the content during the drag, and the chart calls `resize()` once at the end (Velvet: charts re-lay out at the end of a tween).
5. **Code-split apps.** Each app loads through `next/dynamic`. Broker, Portfolio and Wire are preloaded at boot; the rest load on first open. The OS root ships no Research or AI Lab code.
6. **No layout thrash.** Window rects are absolutely positioned. No flex reflow across windows, and the shelf and strip are fixed-size.
7. **Measured, not guessed.** Under `?e2e` only, `__tg.e2e.frames()` returns the frame-time histogram since the last call, so Tape can assert 60 fps during a drag at 20x without a profiler.

## 10. Keyboard (app side of Velvet's map)
- Bindings match on `event.code` (`Digit1`, `ArrowLeft`), not `event.key`, so `Alt 1..9` works on AZERTY (Mathis's layout), where the digits need Shift.
- Global shortcuts are ignored while focus is in a text field, except `Esc`. `Ctrl+←/→` inside the ticket's quantity field moves the caret by word, as the browser expects; it doesn't snap the window.
- Never bound in a browser tab: `Alt D`, `Alt E`, `Alt F` (Chrome and Edge on Windows use them for the address bar and menu) and `F10`. Velvet's `Alt W`, `Alt N` and `` Alt ` `` are fine.
- `Ctrl W` and `Ctrl Tab` only when the display mode is `standalone` or `fullscreen` with Keyboard Lock (detected with `matchMedia('(display-mode: standalone)')`). The key sheet shows whichever set is live.
- `Enter` in the Broker ticket stays the only key that executes an order (onboarding's honest note and the simple ticket keep working).

## 11. Edge cases and exploits
| Case | Rule |
|---|---|
| Hand-edited save opens a locked app | Dropped on load (§4) |
| Deep link to a locked app | Lands on the desktop or home, highlights the tile, never opens it (§5) |
| More than 4 Brokers through layouts or links | Clamped to 4; extra tickers reuse the least-recently focused Broker |
| Viewport shrinks below 1200 px mid-session | Desktop layout is kept in the save untouched; the UI switches to the smaller-screen mode. Growing back restores it exactly |
| Viewport too small for every snapped window's minimum | Windows stack filled; the shelf switches between them |
| Window dragged off screen | Clamped so the title bar stays at least 48 px on screen |
| Rank-up mid-drag | The ceremony waits for 10 s idle, which a drag resets (same input listeners as onboarding) |
| Major world event during a drag | The drag commits first, then the overlay (Velvet's takeover rules) |
| Multiple tabs on one save | Existing rule stands: last write wins on the game save. The shell has no cross-tab sync |
| Speed and pause | Owned by the game store, not the shell. Focus mode, layouts and the launcher never change speed unless the player picks the speed command |

## 12. Acceptance (Forge; Tape owns the e2e)
1. `wm.ts` unit tests: open, focus and z-order stay consistent; Broker cap; locked apps are refused; snap rects are exact at 1440 × 900 and 1920 × 1080; viewport shrink and grow round-trips; focus mode on and off restores exact rects; save load validation drops bad windows.
2. Trade layout at 1440 × 900 matches the slot rects to within 1 px (Velvet's acceptance).
3. Save → reload restores windows, slots, workspace, focus mode and shelf order. A save without `shell` opens the Trade layout. A corrupt `shell` still loads the game.
4. Every app in §5 opens from its URL. Locked apps don't. Phone Back walks the app stack and then goes home.
5. Palette switch at runtime recolours windows and every live chart without a remount (the chart instance id is unchanged) and with no wrong-palette flash on reload.
6. 4 Brokers plus Portfolio at 20x: `frames()` p95 is 16.7 ms or less while dragging a window. A tick on one ticker re-renders only the windows showing it (React Profiler count in a unit test).
7. No order is created, changed or cancelled by any shell action (window, layout, launcher, focus mode, deep link), checked as an order-list diff.
8. Existing onboarding e2e still pass with the new test ids from Velvet's list. Tape gets a test-id map from old to new before the switch.

## 13. Open questions
1. Decided (Velvet): 768–1199 px, Recent switcher, tokens ownership (`handoff/tokens.css` v2; Forge only sets `data-palette`).
2. **Tape:** the test-id migration map ships as `specs/forge-testid-map.json` (`{ "old-id": "new-id" }`, with `null` for removed ids) with the first shell build, so existing specs move once by script.
