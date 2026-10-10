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

## 2a. Open rulings (not decided by the lead; the code may still show these until the ruling lands)

- Realized P&L per player on the Trader board (src/world/boards.ts): performance, not style; ruling needed.
- Filings from NPC personas (src/world/news.ts filings, called outside the NPC guard): the NPC guard is open.
- Squeeze size on the Wire (src/world/news.ts squeeze line): a size can isolate one account; the holder rule is open.
- Alliance treasuries and court suits on the Wire: named members and the claim kind; ruling needed.

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
