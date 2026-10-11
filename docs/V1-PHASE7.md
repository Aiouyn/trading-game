# V1 Phase 7: status

Scope: Phase 7 as set in `docs/team/specs/lead-phase7.md` (binding). This file holds section 7A (the text roles, P7-1) and the
section 7B status (the model overlay, P7-2), which is built on track `p7/b` and not merged into this branch (see 7A.4).
Branch: `p7/a`, worktree `.claude/worktrees/p7-a`. Status words as in `docs/V1-PHASE6.md`: **Done**, **Partial**, **Not built**,
**Deferred**, **Decided**.

## 7A. The text roles (P7-1)

### 7A.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| One interface, one method per role | **Done** | `TextProvider` has `newsroom`, `executives`, `rumor`, `rival`, `moderator`, `narrator` (new), and keeps `deskMemo` (analyst) and `dailyClose` (narrator's close card). Each takes typed facts and returns a `Msg`. A role never reads world state. | `src/world/text/index.ts`, `template.ts` |
| Role facts and copy rules | **Done** | The fact types and the message builders are pure functions; the variant is `hash(fact id) mod 8` (FNV-1a, the hash the Wire's move headlines already used). No world RNG stream is read. | `src/world/text/roles.ts` |
| Nested messages | **Done** | `Msg.vars` may hold another `Msg`, rendered in the same locale (a quote inside an earnings line, a `when` phrase, a source name, a court kind, a business event). `t()`, `tm()` and the server's `renderMsg` resolve them the same way. Plural keys (`_one` / `_other`) are chosen on the server too. | `src/i18n/index.ts`, `src/world/text/template.ts` |
| Newsroom: Wire and margin lines | **Done** | Every generated Wire line the engine prints has a descriptor: regime, move, closing auction, halt, reopen, earnings, preview, macro, rates, listing (IPO, bankruptcy, takeover, spin-off), index review, squeeze, filing, margin call, liquidation, option expiry, and now also: a business sale (notice), a business deal (Wire), a property purchase (Wire), a business incident (notice), a chapter close (Wire) and the Hall of Fame (notice), an IPO pricing (Wire), a trading plan and a buyback (Wire filings), a lawsuit filed and a verdict (Wire). | `src/world/news.ts`, `assets.ts`, `boards.ts`, `company/ipo.ts`, `company/programs.ts`, `court.ts` |
| Newsroom: engine headlines and precursors | **Done** | `HEADLINES` and `PRECURSORS` keep their English lists and their RNG picks (the picks move no stream, so prices and fingerprints hold). The viewer's copy is `event.headline.<kind>.<n>` and `event.pre.<kind>.<n>`, eight variants each per locale, chosen by a hash of the event id (and the line for a precursor). | `src/engine/worldEvents.ts`, `src/i18n/*.json` (`event.*`) |
| Executives | **Done** | A CEO quote on an earnings print, from the surprise band (great, good, flat, bad, awful). It is nested in the earnings line. | `roles.ts` (`executivesMsg`) |
| Rumor mill | **Done** | The Whisper line names a fictional source (eight sources). The direction is the world's, so the accuracy is the world's. The Launchpad's rumour of the day is a Wire line with its own descriptor (`lp.wire.rumor`). | `roles.ts` (`rumorMsg`), `news.ts`, `launchpad/flow.ts` |
| Rival personas | **Done** | One voice per fund (Hale & Ward, Pinn Partners, Vetch), up or down, from the change since the player joined only. The profile card shows it under the name. The fixed flavour lines (`rivals.flavour.*`) had no reader and are removed. | `roles.ts` (`rivalMsg`), `RivalsCard.tsx` |
| Analyst (Research Desk memo) | **Done** | The memo's move, part and flow lines have eight variants each, keyed by the window (asset, from, to). Past facts only. | `template.ts` (`deskMemo`), `roles.ts` (`analystMsg`) |
| Narrator (daily close card) | **Done** | `narratorMsg` (`roles.ts`) gives eight variants each for the headline (up, down, flat), the best and worst positions, the empty book, the market (GX) line, the best and worst sector, the benchmarks, the no-trades line and the rank. The close card renders the headline and the rank from these descriptors (`CloseCard.tsx`). The masthead is a label (see 7A.4). | `roles.ts` (`narratorMsg`), `template.ts` (`dailyClose`), `CloseCard.tsx` |
| Moderator | **Done** | `moderatorMsg` gives eight lines per refusal reason (abuse, crypto, brand, figure, taken). A refused name or ticker says its first part in that line: the world's refusal (`refuse()` in `launchpad/state.ts`) and the Create form's live check (`refusalCopy` in `launchpad/copy.ts`) use the same `moderatorLine`. The rules stay in `launchpad/moderate.ts`. | `roles.ts`, `launchpad/moderatorLine.ts`, `launchpad/state.ts`, `apps/launchpad/copy.ts` |
| Wire tags | **Done** | The engine stores each tag as its English label (kept for the log and old clients). The Wire, the coach card and the digest show the French label through `wire.tag.<slug>` (38 labels). | `text/wireTags.ts`, `Wire.tsx`, `Overlays.tsx` |
| Client renders the descriptors | **Done** | Wire lines and tags, the bell panel (`BellPanel.tsx`, it rendered the English `text` before), the digest and the coach card (`Overlays.tsx`), event banner, Replay pins, Research Desk and Journal headlines, close card stories, event, headline and rank, rivals persona. No layout or styling change. | the components listed |
| Copy: en and fr | **Done** | 96 message types with eight variants per locale (`txt.*`), 7 engine event families with eight variants (`event.*`), and the fragments (the phrases that fill a slot, the court kinds, the business events, the day counts). The en and fr key sets are identical (4566 keys each). The French is written as French, not translated word by word. | `src/i18n/en.json`, `src/i18n/fr.json` |
| Retired copy | **Done** | The single-line keys `dayclose.nw.*`, `dayclose.story.*`, `dayclose.event.*`, `desk.memo.*`, the close lines `dayclose.best`, `dayclose.worst`, `dayclose.noPositions`, `dayclose.gx`, `dayclose.sector*`, `dayclose.ghosts`, `dayclose.noTrades`, `dayclose.rank`, the headline `close.head.*` and `rivals.flavour.*` are replaced or removed. | `src/i18n/*.json` |

### 7A.2 Guards

- `src/world/text/roles.test.ts`: every message type has eight variants in en and fr; the variants share their placeholders, and en and fr agree on them; the fragments exist in both languages; no template gives advice, a forecast or a banned word (English and French, `banned.ts`); every newsroom fact (now including the Phase 7 notices) renders with no placeholder left; the variant is stable for a fact id and spreads over the eight slots; the Wire, close card, rivals and desk memo render French with no English sentence built from the templates.
- `src/world/text/copy.test.ts` (new): the seven engine event families have eight variants with the same placeholders; the event variant is stable by the event id and spreads over the eight slots; a line the lists do not hold has no key; every Wire tag has an English and a French label; every new newsroom fact renders with no placeholder, in both languages, and the day count reads as one day or as days; the court kind is a fragment and an unknown kind shows as it is; every narrator line renders, and the variant is stable per close; a refused name or ticker gets its list's moderator line, the same for the same name.
- `src/world/text/banned.test.ts`: the world-template check now covers `txt.narr.*` (both languages).
- `src/world/research-desk.hunts.test.ts`: the French present-tense check covers the narrator's keys (head, best, worst, empty book, GX, sector, ghosts, no trades, rank).
- `src/i18n/i18n.test.ts` (unchanged) still checks that every French key exists in English with the same placeholders.
- Close, close-card, launchpad and desk tests moved to the narrator and moderator keys (`close.test.ts`, `close-card.test.ts`, `launchpad.test.ts`).
- Determinism: the engine's `text` on every Wire and notice item is unchanged, the new `msg` is additive, and no price, RNG draw, event timing or fingerprint reads it. The engine headline and precursor RNG picks are the same draws as before (the variant is a hash of the id, not a draw).

### 7A.3 Playwright

- `tests/e2e/phase7Text.spec.ts` (in the close chain): French set in Settings, then the Wire rows (the English story lines and now the English tag labels), the Rivals persona line, the Research Desk memo and headlines, and the close card (the story, the event, the headline, the best and worst lines, the rank) carry no English template sentence. Run at desktop and phone (`close-text`, `close-text-phone`); see 7A.5 for the result.

### 7A.4 Deviations (reasoned)

- **Notices outside the Wire (not migrated in this pass).** Some inbox notices the engine writes are still English-only: court notices to the parties (`court.ts`, the notify lines), the cyber notices (`cyber.ts`), the lab's notices (`lab.ts`), the company debt and bridge notices (`company/debt.ts`, `company/bridge.ts`), the comeback's chapter-start notice (`comeback.ts`) and the charity line (`game.ts`). They are personal notices, not the newsroom's Wire or margin lines, and the newsroom role is the one the spec names for them. They need a notices role with their own eight variants; they are the next item, not this one. The Wire items that are court filings and verdicts are migrated.
- **Masthead.** `dayclose.title` (the card's heading) is one label, not a message type with variants; the close card's inbox summary `dayclose.inbox` is kept for the same reason (a one-line log of the close).
- **Labels that are not generated text.** `close.best`, `close.worst`, `close.gx`, `close.sectors`, `close.cashDay` and the `close.ghost.*` and `close.band.*` labels are UI labels on the card; `luck.explain.*` is the fixed explainer of the ghosts (three paragraphs of one static page, not a message); `exchange.aum.*` are the fixed size buckets of the fund AUM line. These are not generated and do not take variants.
- **Content names.** Property types and business names come from the content files in English (`PROPERTY_TYPE_BY_ID`, `BIZ_BY_ID`); the Wire shows them as the content gives them. Localising them is a content task.
- **Progression challenges.** The hourly challenge texts in `content/progression.ts` are static English copy, not generated text; they are not in this pass.
- **Cause of the French rendering.** The Wire tags and the bell panel were English on the client before this pass (the reviewer's item 1 and the tag labels); they render through `tm()` and `wire.tag.*` now.
- **Launchpad rumour fallback (review item 9).** `rumorHeadline` in `src/content/news.ts` and the Launchpad's `lp.wire.rumor` line keep their English `text` on every Wire item for the log and old clients. The client renders `tm(w.msg, w.text)` (`Wire.tsx`), so the English `text` shows only when a line has no descriptor; the rumour of the day and the Wire rumour both carry one.
- **7B (the model overlay, P7-2) is not in this branch.** It is built on track `p7/b` (commits `9a7779f`, `ab4978b`, `2d51513`: `server/text/`, the overlay, the cache, the cap and the validation, with mocked-fetch tests). Merging the two tracks is a lead decision; this branch does not carry the server enricher, so the 7B checks run on `p7/b`.

### 7A.5 Gates (this pass)

- `npx next typegen` and `npx tsc --noEmit`: exit 0.
- Touched vitest suites: `src/world/text`, `close`, `close-card`, `launchpad`, `research-desk.hunts`, `i18n`, `engine/worldEvents*`, `news`, `court`, `boards`, `assets`, `company` and `components`: pass. The full vitest run is in the commit log for this pass.
- eslint on the touched TypeScript files: 0 errors, 0 warnings.
- Playwright: see the commit message for the run result (the French spec at desktop and phone).

## 7B. The model slot (P7-2)

### 7B.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| Off by default | **Done** | The slot is on only with `TEXT_PROVIDER=claude` and `ANTHROPIC_API_KEY`. With no environment, the welcome and tick messages are byte-identical to before (a test asserts the welcome bytes). | `server/text/config.ts` (`textConfigFromEnv`), `server/wire.ts` (`welcomeJson`), `server/index.ts` |
| Config by env | **Done** | `TEXT_PROVIDER`, `ANTHROPIC_API_KEY`, `TEXT_MODEL` (default `claude-haiku-5-5`), `TEXT_DAILY_USD_CAP` (default 1), `TEXT_ROLES` (default `newsroom`), plus `TEXT_RATE_PER_MIN` (6) and `TEXT_TIMEOUT_MS` (8000). | `server/text/config.ts` |
| Price table | **Done** | A config constant per model, USD per million tokens. An unknown model is priced at the most expensive row, so it can only over-count the cap. The `claude-haiku-5-5` row ($0.10 in, $0.50 out) matches the price table in the bundled `claude-api` skill (its model list cached 2026-10-06; the skill notes $0.50 in / $2.50 out for prompts over 100K tokens, which a wire line never reaches). Re-check the table when prices move. | `TEXT_PRICES_USD_PER_MTOK` |
| Provider over fetch | **Done** | `POST https://api.anthropic.com/v1/messages` with `x-api-key`, `anthropic-version: 2023-06-01` and `content-type: application/json`; body `{ model, max_tokens, system, messages }`. No SDK, no new dependency. | `server/text/claude.ts` |
| Prompt from public facts | **Done** | One prompt per role, built only from the item's public facts (kind, tag, the world's own line, tone, asset id, and the message key and vars). It asks for an English and a French line as JSON. No holdings, handles or hidden values. `launchpad` lines are not enrichable (they name the creator, plaintiff and defendant). The server passes every player handle to `enrichItemOf`, which drops any item whose fact values name one (case-insensitive substring). | `server/text/facts.ts` (`promptFor`, `enrichItemOf`) |
| Cap admission | **Done** | The cap is checked against recorded spend plus the reserved estimate of every call in flight (the prompt at two characters per token, the output at the token cap). The overshoot is zero by construction, not bounded by the rate limit. The reservation is released when each call answers. | `server/text/enricher.ts` (`reserveFor`, `reservedToday`) |
| Cache | **Done** | Keyed by role, a sha256 of the canonical facts, and locale. Both locales are written together, so a hit needs both. A hit costs nothing. Table `text_cache` in the server's database. | `server/db.ts`, `server/text/enricher.ts` |
| Daily cost cap | **Done** | Cost from the response's usage tokens and the price table, added to `text_spend` per UTC day. At the cap the enricher sends nothing until the next day. | `server/text/enricher.ts`, `server/db.ts` |
| Validation | **Done** | Valid JSON (an array or a bare string is rejected); both locales present and non-empty; each line at most 200 characters; every number in a line must be one the facts allow (thousands separators and a French decimal comma are read the way the client prints them); no banned word (`banned.ts`, both languages); no advice pattern (both languages); the French line is French: it may not use an English function word (`EN_STOPWORDS`, for example *the, and, with, its, was*) unless the facts contain that word (reason `language`). Any failure keeps the template. | `server/text/validate.ts` |
| Fallback | **Done** | A timeout, an HTTP error, a network error, a bad shape or a rejected reply (including `language`) keeps the template. Each has a counter. The client never sees an error. | `server/text/enricher.ts` (`reject`), `server/text/claude.ts` |
| Rate limit per role | **Done** | A sliding one-minute window per role (`TEXT_RATE_PER_MIN`). A stopped item is counted and not sent. | `server/text/enricher.ts` |
| Overlay on the views | **Done** | `textOverlay[itemId] = { en, fr }`. The welcome carries every kept line; a tick carries, per connection, the lines that landed after that connection's own cursor (its last sent version), so a socket skipped at a tick gets its lines at the next one, and a closing socket gets everything from its next welcome. Both fields are added only when the slot is on. The overlay lives in the server's memory, outside `GameState`, so it is never in a snapshot or the command log. | `server/index.ts`, `server/wire.ts`, `src/net/protocol.ts` (`TextOverlayMap`) |
| Enricher runs outside the step | **Done** | `server/index.ts` offers each new Wire news item after the tick. The step never sees the enricher, and the enricher never reads or writes the world. | `server/index.ts` (`host.onTick`) |
| Client shows the line | **Done for the Wire** | The Wire shows the overlay line for the viewer's language when present, else the world's own line. No layout or styling change. | `src/components/Wire.tsx`, `src/game/store.ts`, `src/world/text/overlay.ts` |
| Admin readout | **Done** | `GET /api/admin/text` with the admin token: enabled, model, roles, day, cap, spend today, calls, hits, rejects by reason, stops by reason, fallbacks, overlay size. | `server/index.ts` |
| Other roles on the client | **Not built** | The Research Desk, the Rivals board, the close card and the rumor feed still show their templates. Each is a later step of P7-1 and P7-2 (the overlay map is keyed by id, so each one only needs its own id and render line). | — |
| Playwright for generated French | **Not built** | Belongs to P7-3 (the Wire, the close card, the Rivals profile and the Research Desk in French, at desktop and phone). Only the Wire renders the overlay so far. | — |
| Live network calls | **Not built** | No test and no run in this step calls the network. Every test mocks `fetch`. The first real run needs a key and a decision on the cap. | — |

### 7B.2 Tests

`src/world/text/enricher.test.ts` and `src/world/text/overlay.test.ts`, all with a mocked `fetch` and a temporary database (the review fixes added the launchpad, handle, French, in-flight, cap and cursor cases):

- config: off with no environment; needs both the provider and a key; role list and cap parsed;
- facts: only wire news is enrichable; the hash is stable under key order; the prompt holds only the item;
- validation: one case for each reject reason (json, locale, length, number, banned, advice), the French number forms accepted when the facts hold the value;
- enricher: cache hit makes no call; the documented headers and body; both locales cached; spend from usage tokens; the daily cap stops and resets on the next day; the per-role rate limit; every reject reason counted and the template kept; a timeout (abort) falls back; HTTP and network errors fall back; off means nothing is sent;
- determinism: a 240-tick world with the enricher on (mocked) and off gives byte-identical state JSON, and the on run made calls; the overlay text is not in the state JSON;
- welcome: byte-identical with no overlay field; the overlay field present when given.

### 7B.3 Checks run

- `npx next typegen` then `npx tsc --noEmit`: 0 errors.
- `npx eslint` on the touched files: 0 errors, 0 warnings.
- `npx vitest run` on the touched areas: all pass. Full run: see the final commit.
- Smoke: `server/index.ts` started with the slot off on a temporary data directory answered `/health` and `GET /api/admin/text` (403 without the token, the readout with it).

### 7B.4 Decisions

- **The overlay is presentation only and lives outside the world.** It is kept in the server's memory (bounded to the last 300 lines). A restart empties it; the cache in the database fills it again on the next offer of the same facts.
- **The enricher only sees public wire news.** Player-private kinds are not enrichable (`enrichItemOf`), so no holding, handle or hidden value can reach a prompt.
- **Two languages in one reply, cached as two rows.** One call makes both lines; a cache hit needs both locales.
- **Digits are checked against the facts.** A French thousands space is read as a separator, so a line that prints `1 234,56` is accepted when the facts hold 1234.56, and a line with a number the facts do not give is rejected.
- **The cap counts real spend and the reservation for calls in flight.** A call is admitted only when recorded spend plus the reserved estimate of every call in flight plus its own estimate stays within the cap. A call that fails before an answer adds no recorded cost; a call that answers adds its real cost even if its reply is then rejected.

### 7B.5 Review fixes (p7/b review)

A read-only review of `p7/b` found these. Each blocking item is fixed; deviations are recorded here.

| Review item | Status | What changed |
|---|---|---|
| 1. Player handles reach the prompt (blocking) | **Fixed** | `launchpad` is removed from the enrichable kinds. `enrichItemOf(item, handles)` drops an item whose fact values contain a player handle (the server passes every handle). Tests: a launchpad line and a court line are not enrichable; a `move` line with a handle in its text or its vars is dropped; a clean item's prompt has no handle. |
| 2. The French line is not checked to be French (major) | **Fixed** | `validateReply` rejects a French line that uses an English function word (`EN_STOPWORDS`) unless the facts contain that word. Reject reason `language`, with its own counter. Tests: an English French line is rejected; a real French line and a stopword the facts hold pass. This is a heuristic (a French line with no English word passes), not a language detector. |
| 3. The price row cannot be confirmed locally (major) | **Verified** | The `claude-api` skill's cached model list (2026-10-06) gives claude-haiku-5-5 at $0.10 in and $0.50 out, the same row as `TEXT_PRICES_USD_PER_MTOK`. Its note on the over-100K-token tier is recorded in 7B.1. |
| 4. Overlay deltas drained once per tick (minor) | **Fixed** | The single `drain()` is replaced by a per-connection cursor (`version()`, `since(cursor)`). A connection stores the version it was sent (its welcome, then each tick); a skipped tick is sent later. A closing socket gets every kept line from its next welcome. |
| 5. An identical item during an in-flight call gets no overlay (minor) | **Fixed** | An in-flight flight keeps the list of item ids that wait on it; when the call validates, every waiting id gets the line. One call is made. Test: two identical items, one call, two overlays. |
| 6. The cap ignores in-flight calls (minor) | **Fixed** | See the 7B.4 decision above: the cap admission counts a reserved estimate per call in flight, so the overshoot is zero by construction. The readout shows `reservedToday`. Test: with a cap that admits one call, a second call in flight is stopped by the cap. |
| 7. P7-1 items (other roles, the English-in-French grep) | **Out of scope** | This branch enriches the newsroom wire only. The other roles belong to later P7-1 steps. |

Checks for this step: `npx next typegen` and `npx tsc --noEmit` exit 0; `npx eslint` on `server/text`, `server/index.ts` and `src/world/text` exits 0; `npx vitest run src/world/text --maxWorkers=3`: 4 files, 44 tests pass (full `npx vitest run --maxWorkers=3`: 224 files and 2235 tests pass, 70 skipped as before).
