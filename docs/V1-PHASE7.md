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
