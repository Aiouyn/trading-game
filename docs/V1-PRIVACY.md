# V1 privacy: what the public may see

The no-reveal rule (Mathis): a player's market activity is private. Something about a player or a rival is public only when
the player opted in, when it was stolen (espionage), or when it is a legal filing. Tape's no-leak checks (L1 to L6,
docs/team/specs/tape-acceptance.md section 12) assert this list. The list is pinned by src/world/privacy-doc.test.ts.

## 1. Public records (allowed)

These are deeds and registries, not market positions:

1. **Filings of 0.5% or more.** A legal filing of a stake of 0.5% or more in a listed company (the Wire's filings).
2. **Purchases of businesses and property on the Wire.** The purchase line for a business or a property the player bought.
3. **Profile holdings.** The businesses, properties and lifestyle items shown on a player's profile.

## 2. Never shown

- Market positions (holdings, shorts, options, margin), and any count of them that isolates one account.
- Orders, of any player, rival or NPC persona.
- P&L curves.
- Trading style: the player's order types, timing, size, or any label derived from them.
- Bots and NPC personas: their flow never appears as a player's, and no NPC surface shows another account's positions.
- A player's own flow inside any public figure, except the pool it folds into (section 3).

## 2a. Rulings (decided by the lead, see section 7)

- Realized P&L boards (src/world/boards.ts, the Trader board): public by design. They show outcomes, never holdings (R4).
- NPC persona filings (src/world/news.ts filings, called for every account): the same 0.5% rule as players (R4).
- Squeeze size on the Wire (src/world/news.ts squeeze line): the aggregate cover share of the day's volume only, never a holder (R4).
- Court cases on the Wire: public records (R4).
- **Still open:** alliance treasuries on the Wire (named members and the claim kind). Not covered by R4; ruling needed.

## 3. Public market figures (the fold)

- **Players row (explain).** A day's human player flow shows as "Players" only when at least 5 human accounts traded the asset
  that day and none holds more than 40% of the day's gross player flow. Otherwise the day's flow folds into Retail.
  NPC persona flow is always Retail (P1, D-15). Human accounts only count toward the 5 and the 40%.
- **Solo.** When exactly one human account exists, its flow is "You" on every day (and never Players).
- **Order depth (Broker).** Pool types only: the depth factor and each pool's desired flow for the latest closed day. Its Retail
  figure follows the same fold as the explain row (P2): NPC flow always, a folded player's own flow only on a folded day.
  The server sends it once per closed day (server/wire.ts DepthWire); the client never computes it.
- **Short interest.** The server computes it (engine publicShortInterest, with the 5-holder and 40% rule) and sends it on a slow
  cadence, only when it changed. The client never computes it from its own mirror (P3).
- **Explain archive.** 252 game days of per-asset cause and lnV-part rows, read through explainMove only. A window folds each day
  on its own before the window is summed, so an adjacent-window difference cannot isolate one account (window_diff_no_isolate).

## 4. Client storage (L1)

Only two localStorage keys are allowed: `tg-prefs` (shell layout, palette, language, cosmetic) and `tg-token` (the session token).
Nothing else is written to localStorage, and no position, trade or replay value is written to any browser storage.

## 5. World seed

A new world draws a random seed at its first boot and keeps it in the server database (P5). An explicit `SEED` environment
variable wins, so tests and e2e worlds pass their own seeds. The live seed is never in the source.

## 6. Checks

| Check | What it asserts | Where |
|---|---|---|
| window_diff_no_isolate | Players diffs only on shown days; depth Retail carries own flow only on folded days | src/engine/explain.test.ts |
| explain fold | Players and You rows follow section 3 | src/engine/explain.test.ts, npc-flow.test.ts |
| short interest on the wire | Server-computed, sent on change only | src/game/short-interest-wire.test.ts |
| depth on the wire | Server-computed per closed day, pool types only | src/game/depth-wire.test.ts |
| this list | Sections 1 to 5 are present in this document | src/world/privacy-doc.test.ts |

## 7. Lead rulings (Phase 3 integration)

These rulings were made by the lead while the three Phase 3 slices (A1 privacy and explain, A2 ledger and learning, A3 client
sandbox) were merged into v1. Each is pinned by a test named in brackets.

- **R1 (H6), narrowed: one naive public-data attacker does not recover the folded Players flow.** On a folded day the depth's
  Retail already holds the folded player flow (depthByPool). The tested attacker solves own = Retail minus the mean of the
  prior public Retail readings, and its error is on the scale of the Retail noise, so the own flow is not recovered by that
  solve. This ruling covers that attacker only. It does not claim that no public-data solve can isolate the folded flow, and
  the source of the Retail noise draws (the server-only world seed, P5) is design, not something the test asserts.
  [src/engine/fold-solve.test.ts]
- **R2: drift attribution.** Company alpha, carry and seasonal drift belong to Company noise. The regime's equity drift
  (cycleBeta x equityDrift) is a market move and belongs to Market. [src/engine/regime-drift.test.ts, src/engine/explain-split.test.ts]
- **R3: explainTrade's ledger.** The optional fourth argument of explainTrade (the trade ledger reader) is accepted. The world
  layer supplies the real ledger through explainTradeFor(g, playerId, roundTripId). The round trip type is defined once, in
  src/engine/ledger-types.ts, and the world re-exports it. [src/world/trade-explain.test.ts]
- **R4: the public boards and the filing rules.** Public boards, including realized P&L boards, show outcomes and not holdings,
  and are public by design (the bible boards). NPC filings follow the same 0.5% rule as players. Squeeze stories carry only the
  aggregate size. Court cases are public records. All four are allowed. Alliance treasuries are not covered by this ruling.

Explain identity on the books: for a closed stock round trip, realized = midPnl + slippagePnl - feesPaid. Each fill carries its
pre-trade mid (engine Fill.mid), and each fill is split pro rata between the trip it closes and the trip it opens on a flip. A trip
whose entry predates the ledger, and an option trip, are not explainable (RoundTrip.explainable is false) and explainTrade refuses
them. [src/world/trade-explain.test.ts]

