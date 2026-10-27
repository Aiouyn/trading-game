# 17-notes — UX, Screens and Design System

## 1. Parameters

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| ui_abbrev_threshold | 10,000 | 1,000–1,000,000 | $ | money abbreviation in lists, chips, sentences (§3.4.1) |
| ui_toast_max_visible | 3 | 1–5 | toasts | toast stack (§3.10.2) |
| ui_toast_ms | 4,000 | 2,000–10,000 | ms | toast lifetime |
| ui_moment_gap_ms | 8,000 | 3,000–30,000 | ms | minimum gap between full-screen moments (§3.9) |
| ui_moment_idle_ms | 10,000 | 3,000–30,000 | ms | idle time required before a moment |
| ui_moment_skip_after_ms | 1,000 | 0–3,000 | ms | when a moment becomes skippable |
| ui_takeover_max_delay_ms | 10,000 | 3,000–30,000 | ms | world-event takeover dropped after this delay |
| push_cap_per_real_day | 5 | 1–10 | pushes / real day | push cap (§3.10.5) |
| ui_push_attack_extra_cap | 5 | 0–10 | pushes / real day | extra P0 pushes during attack/margin events |
| ui_quiet_start / ui_quiet_end | 22:00 / 08:00 | any | local time | quiet hours default |
| ui_push_reask_days | 7 | 1–30 | real days | push permission re-ask gate |
| ui_bell_history | 200 | 50–1,000 | notifications | bell centre size |
| ui_connections_refresh_ticks | 30 | 30 (fixed by 02 §4.2) | ticks | connections panel refresh |
| ui_hold_confirm_ms | 1,200 | 800–3,000 | ms | HoldToConfirm |
| ui_cost_confirm_threshold_pct_nw | 1% | 0.1–5% | of NW | CostConfirmSheet trigger |
| ui_cost_confirm_threshold_abs | 10,000 | 1,000–100,000 | $ | CostConfirmSheet trigger |
| ui_impact_warn_bp | 50 | 10–200 | bp | large-impact confirmation |
| ui_large_order_warn_adv_pct | 5% | 1–20% | of ADV | large-order confirmation |
| ui_fat_finger_pct | 10% | 2–50% | from last price | limit-price warning |
| ui_layouts_max | 5 | 1–10 | layouts | custom layouts |
| ui_broker_windows_max | 4 | 1–8 | windows | Broker instances |
| ui_watchlists_max / ui_watchlist_size | 20 / 50 | 5–50 / 10–50 | lists / symbols | watchlists |
| ui_reconnect_replay_game_days | 1 | 0.5–2 | game days | delta replay window on reconnect |
| ui_pending_timeout_ticks | 6 | 3–20 | ticks | pending intent status query |
| ui_wywa_min_away_real_min | 30 | 10–120 | real minutes | WYWA trigger |
| ui_close_min_presence_real_min | 10 | 1–60 | real minutes | daily close shown only if present this long that game day |
| ui_presentation_changes_per_day | 10 | 1–50 | per real day | `acct.presentation.set` rate |
| ui_amount_words_threshold | 10,000 | 1,000–1,000,000 | $ | contract amounts in words |
| ui_js_budget_kb | 200 | 150–300 | KB gz | Broker route bundle |
| ui_perf_tick_render_ms | 8 | 4–16 | ms p95 | tick render budget |
| ui_city_render_fps_threshold | 45 | 30–55 | fps | city tier fallback |
| ui_heap_budget_mb | 300 | 200–500 | MB | phone memory budget |
| ui_bg_unsubscribe_s | 30 | 10–120 | s | heavy-channel unsubscribe for hidden windows |
| ui_text_scale_max | 2.0 | 1.5–2.0 | × | text scaling |
| ui_moment_expiry_real_min | 60 (daily close 10) | 5–240 | real minutes | moment queue expiry |
| ui_share_link_days | 7 | 1–30 | real days | share image URL validity |
| support_tickets_per_day | 5 | 1–20 | reports | support report rate |

## 2. Decisions (DEFAULTs and resolutions)

- §3.2: Adopted the Quay desktop OS (Velvet spec, Mathis A-to-Z redesign 2026-10-09) as navigation for the whole game; 04 §10.1 five tabs become five app groups (Trade, Build, Shadow, World, Me). 32 apps defined (§3.2.4). DEFAULT.
- §3.2.4: App unlock rules (Risk LIC2, Quant Lab R2, Research Desk R3, Company R2, AI Lab $100k, Alliance real day 3 or invite, Contracts after account upgrade, Institutions when a charter is available, API by flag). DEFAULT.
- §3.2.3: Phone home is one vertically scrolling page grouped by the five groups (Quay said one page without scrolling; 32 apps need scroll). DEFAULT.
- §3.2.1: No speed control in the shared world (L9); speed controls exist only in practice worlds and replays.
- §3.2.5: Added named layouts Operator, Shadow, Institution to Quay's Trade/Review/Research. DEFAULT.
- §3.3.1: Shadow sub-palette values for non-default palettes (steel/signal per palette). DEFAULT.
- §3.4.1: Hero NW shows whole dollars at R3+ when ≥ $1M. DEFAULT.
- §3.5: Full component catalog (≈60 components). DEFAULT.
- §3.6: Simple/Pro per app, Broker Pro offered after first fill + 3 closed trades. DEFAULT.
- §3.8: Confirmation thresholds (1% NW or $10k; 50 bp impact; 5% ADV; 10% fat finger; HoldToConfirm list). DEFAULT.
- §3.9: Unified moment queue with priority order and Held as a non-celebration moment. DEFAULT.
- §3.10.1: Notification routing table by category and priority P0–P4. DEFAULT.
- §3.10.5: Lock-screen pushes hide amounts by default. DEFAULT.
- §3.11.7: No presence indicators for other players except opt-in in DMs/alliance. DEFAULT.
- §3.12: Rank material table under 00's rank names (R3 Mogul, R4 Tycoon). Resolves the naming contradiction with 04/velvet specs (Operator/Mogul).
- §3.15: Crests from a fixed parts library; no user images at launch. DEFAULT.
- §3.21: Share cards server-rendered with a verification code. DEFAULT.
- §4.1: Presentation privacy changes are a tick intent `acct.presentation.set` (so public artifacts replay). DEFAULT.
- §6: Every NPC on a board/auction/league carries an "NPC"/"House" tag. DEFAULT.
- §7.6 RSK-02: ROADMAP N1 (stress-test button) adopted as part of V3's risk analytics.
- §7.8 RD-04: ROADMAP N3 (explain-this-candle) adopted for closed bars, inside the ladder.
- §7.7: Quant Lab is a block notebook (no user code), server-evaluated under 11's budget. DEFAULT.
- §9: Reserved-word list for handles; contract amounts in words ≥ $10k. DEFAULT.
- Old open question 06-cities §9 ("what makes the City app worth opening daily"): answered by the City brief (LC02) in CTY-03.
- Old open question 04 §9.6 (avatars): kept decided silhouettes.

## 3. Interfaces assumed

- 02: `clock` channel `{tick, gameDay, tickOfDay, phase, weekday, quarter, year, chapter}`; server time offset; replay API with visibility filtering.
- 03: NW breakdown read model; statements API (balance sheet, income, cash flow, consolidated); ledger read API scoped to own entities; restricted-cash buckets `{reason, amount, untilRealMs}` in `me`.
- 04: `macro:{bloc}` published state; central bank pages data; sovereign data.
- 05: `ticker`, `book` (top 10 levels), `tape` (aggregate prints), `estimateFill`, impact estimate, `dayClose(chrId, day)`, `explainTrade`, `explainMove`, execution reports, published auction indicative only if 05 chooses; human rate limit.
- 06: per-asset `displayDecimals`, `qtyDecimals`, `lotSize`; options chain with Greeks; payoff API; instrument-specific ticket fields; DeFi pool and protocol data.
- 07: margin summary, liquidation prices, borrow locate, repo/sec-lending/prime data, CCP data, bank console data, systemic aggregates.
- 08: funds, ETFs, tranches, insurer and issuer consoles, ratings.
- 09: business and company data and previews; `biz.*` intent names as listed in §7.11–7.12.
- 10: city tiles, render tiers, district data, listings, crown towers, storefront slots.
- 11: `me.lab`, strategy graph block library, backtests, withheld-world eval, tournaments.
- 12: `me.security`, connection rows identical for all entries, op catalog with odds bands, defense stack.
- 13: `me.legal`, docket, evidence released per discovery, licences and charters with requirements, Held state.
- 14: `rank` channel with thresholds, shells earned, Prestige/Reputation/Notoriety; lifestyle catalog; estates; gift item class.
- 15: boards, leagues, profiles (public projection), chat, contracts, auctions, filings, alliances, k-anonymity-safe public data.
- 16: `news` with cause links and priced-in bands, archive, NPC dossiers, politics, history digest.
- 18: `onboarding` channel, explainability ladder, help content.
- 19: gateway channels, `POST /intent/preview`, prefs/notify/push/notes/share/support endpoints, sandbox worker, routing package, device performance profile.
- 20: integrity report publication; scenario seeds; withheld seeds.
- 21: store, ads, moderation, admin auth and approvals, telemetry essentials.
- Every module: an `explain(numberId)` that returns formula key + inputs for L1 explanations.

## 4. Content needed (22)

- App glyph set: 32 app glyphs + ~80 action glyphs (Quay family).
- Wallpapers: per palette × rank material (4 × 7) plus home-city skylines for the 16 cities (R5).
- Illustrations: home tiers (rented room, studio, loft, penthouse, mansion, estate, island, skyline tower) per city style; business storefront art per sector (13 sectors × awning variants); item hero images for the ≈45 lifestyle items.
- Avatar parts: silhouettes, outfits (≥ 24), watches (catalog), poses (≥ 6).
- Crest parts library: ≥ 12 shield shapes, ≥ 40 charges, tinctures from palettes.
- Sounds: market bell (normal/low), fill tick, attack thud, rank bell, gavel, paper slide, hammer, room tone.
- Share card templates: 12 (§3.21).
- Copy banned-word list `copy-banned.json` (en/fr); reserved-word list for names (en/fr).
- Help articles: one per screen id in §7 (≈230).
