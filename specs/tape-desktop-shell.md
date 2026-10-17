# Tape: Quay shell tests (window manager, routing, phone stack, palettes, performance)
Owner: Tape. Sources: `forge-desktop-shell.md` (Forge), `velvet-desktop-os.md` (Velvet). 2026-10-09.
Status: spec only. Specs move to new ids once by script from `specs/forge-testid-map.json` (`{old: new|null}`); a `null` id with a live spec reference fails the migration script loudly, never silently drops the assertion.

Viewports: **1440×900**, **1920×1080**, **1000×800** (halves mode), **900×800** (single mode), **390×844**. Palettes: all 4 where marked (P4).
Every e2e runs under `?e2e&seed=…&intro=off`. "Order diff" = `__tg.e2e` order list (ids, side, qty, price, status) before vs after; must be byte-identical.

## 1. Window-manager reducer (`wm.ts`, Vitest, property-style)
| id | Check |
|---|---|
| `wm_focus_is_top` | 2,000 random action sequences (seeded): focus always == top-most `open` win on `activeWs`; no stored z or focus field exists |
| `wm_broker_cap` | 5th Broker open → still 4; least-recently focused one switched ticker; no throw |
| `wm_one_file_one_window` | Research `open` twice on same fileId → 1 window |
| `wm_locked_refused` | `open`, `applyLayout`, `moveToWs` on locked app → state unchanged + `locked` result |
| `wm_no_store_import` | Static, **transitive**: the import graph from `wm.ts`, `geometry.ts`, `route.ts` reaches no value import from `src/game` or `src/engine` (type-only imports OK). Rank/unlock arrive via `Ctx`. 2026-10-09: FAIL on 99a1be3 (`wm.ts → apps.ts → @/engine`); **PASS on 70713e6** (chain = apps, geometry, route, wm; engine/rank only in `ctx.ts`). Hardened in fe1d971 (TS parser: export-from, export *, side-effect, dynamic import incl. templates, require, import=require, both quotes; non-literal path fails) |
| `wm_slot_exact` | Every slot rect at 1440×900 and 1920×1080 matches geometry within 1 px, gutter 8 (1 in Focus) |
| `wm_viewport_roundtrip` | 1440 → 900 → 1000 → 390-equivalent → 1440: full layout deep-equal to start (rects, slots, split fractions) |
| `wm_free_clamp` | Free window dragged off screen keeps ≥ 48 px title bar visible; under-min after clamp re-snaps to nearest slot |
| `wm_focus_mode_restore` | Focus on → 50 random snaps/moves → off: rects/slots deep-equal to pre-Focus snapshot; `focusRestore` null |
| `wm_ws_from_earned_rank` | R3 earned + R0 look picked → 3 workspaces, no window lost; R1 earned → wins on ws>0 moved to ws0 on load |
| `wm_close_pending_broker` | Close Broker with pending order → `confirm`, window stays; `force` closes it and **order still exists** |
| `wm_shared_edge` | Shared-edge drag stores fraction; both windows ≥ their app minimum at every viewport |

## 2. Save and restore
| id | Check |
|---|---|
| `shell_save_roundtrip` | Windows, slots, ws, focus mode, shelf order, layouts survive reload (per save; second save slot unaffected) |
| `shell_no_field` | Old save without `shell`: loads, Trade layout (new) or migrated-tab layout; `saveVersion` still 1 |
| `shell_corrupt_field` | 12 fuzzed `shell` payloads (bad types, NaN rects, 50 Brokers, unknown app, locked app, dup ids, `activeWs: 9`, 5 MB string) → game loads, money/positions/orders unchanged, Trade layout |
| `shell_locked_in_save` | Hand-edited save with Research at R1 → window dropped; no Research code chunk fetched (network log) |
| `shell_no_game_data` | Static + runtime: `shell` JSON contains no prices, tickers beyond props, P&L or Research content (no-leak) |
| `shell_write_count` | Drag a window 3 s: 1 save write on pointer-up, 0 during pointermove |
| `prefs_not_in_save` | Palette / key remaps live in `tg-prefs` only; switching save keeps them; exporting a save has none |

## 3. Routing and deep links
| id | Check |
|---|---|
| `route_every_app` | Each app/view URL in §5 opens or focuses the right window (desktop) / pushes the app (phone) |
| `route_locked_never_opens` | `/research?file=X` at R2, `/company`, `/ailab` when locked → desktop/home, tile highlighted, tooltip, **no window, no chunk loaded** |
| `route_research_file_leak` | Deep link to a file id that is open-day, future, or another player's → no window, same response as a nonexistent id (no existence oracle) |
| `route_flags_survive` | `?seed`, `?fresh`, `?intro=off`, `?e2e` work on every route |
| `route_no_history_spam` | Desktop: 20 focus changes → history length +0. Phone: 3 opens → Back ×3 walks stack then home |
| `route_credits_redirect` | `/credits` → `/settings/about` |
| `route_static_export` | `next build` static export lists finite routes; tickers/file ids only in query |
| `route_broker_ticker` | `/broker?t=HLCN` with a Broker already on HLCN focuses it; unknown ticker → no crash, no order |

## 4. Orders are untouchable (order diff on every row)
`shell_never_orders`: for each of window open/close/collapse/fill/snap/move/resize, layout apply/save, workspace switch, focus mode, launcher (every command and ticker pick incl. `Shift+Enter`), deep link, palette switch, rank ceremony, phone Recent (switch, swipe-remove), Back — order diff empty. Launcher pre-filled ticket stays a draft until `Enter` in Broker.
`draft_never_sends`: phone ticket draft → remove Broker from Recent → reopen → draft intact, dot shown, no order; draft gone after session end; draft not in save.
`enter_only_executes`: random key mash (seeded, 500 keys excluding Enter) with focus in ticket → 0 orders.

## 5. Keyboard
| id | Check |
|---|---|
| `kbd_azerty_alt_digits` | Playwright `locale fr-FR` + AZERTY `code` events: `Alt+Digit1..9` open shelf apps 1–9 |
| `kbd_text_field_guard` | In qty field: `Space`, `B`, `S`, `1-4`, `Alt 1` do nothing global; `Ctrl+←` moves caret, window doesn't snap; `Esc` still works |
| `kbd_browser_reserved` | No binding on `Alt D/E/F`, `F10`, `Ctrl L`, `F5`, `Ctrl T/N`; `Ctrl W`/`Ctrl Tab` unbound in tab mode, bound in `display-mode: standalone` |
| `kbd_same_keypresses_all_ranks` | Cold-start keyboard order: same keypress count at R0 and R6 |

## 6. Performance (`__tg.e2e.frames()`, desktop profile)
| id | Check |
|---|---|
| `perf_drag_20x` | 4 Brokers + Portfolio at 20x, drag 5 s → frame p95 ≤ 16.7 ms |
| `perf_narrow_rerender` | Tick on HLCN re-renders only HLCN windows (Profiler count) |
| `perf_hidden_paused` | Collapsed / other-ws windows: 0 chart updates over 200 ticks; on show one `setData` and price equals live |
| `perf_input_first_frame` | Click into a window during its 220 ms open tween → input lands in that window |
| `frames_e2e_only` | `__tg.e2e.frames` absent without `?e2e` |

## 7. Palettes (P4)
| id | Check |
|---|---|
| `palette_dom_identical` | DOM snapshot identical across 4 palettes apart from `palette-<slug>` and listed Phosphor/Broadsheet extras |
| `palette_no_flash` | Reload with each palette: first paint already has the right `data-palette` |
| `palette_chart_live` | Switch mid-session at 20x: chart instance id unchanged, colours equal computed tokens, 0 dropped ticks (bar count + last price match store) |
| `palette_contrast` | Contrast script passes Velvet's table on `win`/`win2`/`chrome` for every palette |
| `palette_never_auto` | Turning on colour-blind setting suggests Phosphor, doesn't switch |

## 8. Small screens and phone
| id | Check |
|---|---|
| `mode_single_900` | One window filled; shelf switches; Trade layout not overwritten |
| `mode_halves_1000` | Only `L2`/`R2` allowed; thirds/quarters/layout commands refused cleanly; halves refused if either window's min width doesn't fit (Broker min 480, Portfolio 520): Broker + Wire halve at 1000; Broker + Portfolio refused at 1000 |
| `broker_narrow_layout` | Broker < 720 px wide: phone layout (chart full width, ticket docked under); < 560 px tall: `Chart · Ticket` switch; keys unchanged; order diff empty on switch; `Enter` still the only executor; draft survives switching |
| `compact_chrome` | Below 1000 px: launcher field is the search icon + `Ctrl K`, layout button hidden; `Ctrl K` still opens the launcher |
| `phone_stack_cap` | 7 apps opened → Recent shows 6, most recent first |
| `phone_recent_live_line` | Recent row live line equals Broker quote; opening Recent adds 0 store subscriptions beyond the visible app |
| `phone_edge_swipe` | Edge-swipe back only in standalone; tab uses chevron + browser back |
| `phone_mark_gestures` | Status-bar Quay mark: tap → Home; 400 ms long-press → Recent; 399 ms → Home, not Recent. Standalone: 300 ms edge-bar hold → Recent |

## 9. Rank looks (no advantage)
`rank_no_advantage`: same seed at R0 vs R6 (`grantCash`): identical tick timing, order-to-fill latency, order types, Broker cap, launcher results. `boot_before_load`: R0 900 ms boot finishes before save load (no tick counted during it). `ceremony_waits`: drag in progress resets the 10 s idle; Major world event during drag commits the drag first.

## 9b. Never reveal another player's data (Mathis rule)
A link or switcher can only show what is in the viewer's own save.
| id | Check |
|---|---|
| `link_shows_own_save` | Save A (long HLCN, journal, Research files) builds `/portfolio`, `/portfolio/journal`, `/broker?t=HLCN`, `/research?file=<A's id>`; open each in a fresh context with save B: B's data only; none of A's positions, P&L, orders, journal lines, file ids or names appear in DOM, title, toasts or `__tg.e2e` |
| `link_carries_no_state` | `formatRoute` output for every app/view contains only app, view, `t`, `file` (plus flags); no qty, price, side, position, P&L or player id. Fuzz: parse rejects/ignores any extra param |
| `link_ticker_neutral` | `/broker?t=X` reveals nothing beyond the public quote: B sees same screen as typing X in the launcher |
| `research_file_not_portable` | A's file id in B's save: same response as a nonexistent id (folds with `route_research_file_leak`) |
| `recent_own_only` | Recent live line reads only the viewer's store (quote + "ticket open" from own draft); no row from any other save, profile or tab |
| `share_url_clean` | Copy-link / `history` URLs after trading carry no state beyond the above |
| `title_meta_clean` | `document.title` and OG/meta tags show no holdings, P&L or net worth (tab titles leak in screen shares and history) |

## 10. Visual proof
1440×900 and 390×844 per palette (8), plus 1000×800 halves and 900×800 single in Ink & Brass; R0, R3, R5 looks; OS update ceremony; Recent sheet. Grep UI copy for "Windows", "macOS", "iOS", "Android", "Start", "Dock", "Finder" → 0.

## Hooks
`__tg.e2e.orders()` (deep copy) and `__tg.e2e.charts()` → `[{id, testId}]` + `data-chart-id` on hosts (Forge, 2026-10-09, read-only, `?e2e` only). Test: both absent without `?e2e`; mutating the returned copy changes nothing.
