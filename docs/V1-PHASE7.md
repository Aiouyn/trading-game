# V1 Phase 7: status

Scope: Phase 7 as set in `docs/team/specs/lead-phase7.md` (binding). This file holds section 7A (the text roles, P7-1). Later sections (the model overlay, P7-2) are not started here.
Branch: `p7/a`, worktree `.claude/worktrees/p7-a`. Status words as in `docs/V1-PHASE6.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**.

## 7A. The text roles (P7-1)

### 7A.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| One interface, one method per role | **Done** | `TextProvider` has `newsroom`, `executives`, `rumor`, `rival`, `moderator` (new), and keeps `deskMemo` (analyst) and `dailyClose` (narrator). Each takes typed facts and returns a `Msg`. A role never reads world state. | `src/world/text/index.ts`, `template.ts` |
| Role facts and copy rules | **Done** | The fact types and the message builders are pure functions; the variant is `hash(fact id) mod 8` (FNV-1a, the hash the Wire's move headlines already used). No world RNG stream is read. | `src/world/text/roles.ts` |
| Nested messages | **Done** | `Msg.vars` may hold another `Msg`, rendered in the same locale (a quote inside an earnings line, a `when` phrase, a source name). `t()`, `tm()` and the server's `renderMsg` resolve them the same way. Plural keys (`_one` / `_other`) are chosen on the server too. | `src/i18n/index.ts`, `src/world/text/template.ts` |
| Newsroom: Wire and margin lines | **Done** | Every generated Wire line that had no descriptor now has one: regime, move (jump), closing auction, halt, reopen, earnings, preview, macro (CPI and jobs), rates, listing (IPO, bankruptcy, takeover, spin-off), index review (announced and effective), squeeze, filing, margin call, liquidation (private and Wire), option expiry. The English `text` stays on each item (log and old clients); the client renders the `msg`. | `src/world/news.ts` |
| Newsroom: engine headlines | **Decided** | `HEADLINES` and `PRECURSORS` in `src/engine/worldEvents.ts` already have en and fr keys (`event.headline.*`, `event.pre.*`) and the engine's RNG picks the index, so they stay as they are. No engine RNG use moved. | `src/i18n/*.json` (`event.*`) |
| Executives | **Done** | A CEO quote on an earnings print, from the surprise band (great, good, flat, bad, awful). It is nested in the earnings line. | `roles.ts` (`executivesMsg`) |
| Rumor mill | **Done** | The Whisper line names a fictional source (eight sources). The direction is the world's, so the accuracy is the world's. | `roles.ts` (`rumorMsg`), `news.ts` |
| Rival personas | **Done** | One voice per fund (Hale & Ward, Pinn Partners, Vetch), up or down, from the change since the player joined only. The profile card shows it under the name in place of the fixed flavour line. | `roles.ts` (`rivalMsg`), `RivalsCard.tsx` |
| Analyst (Research Desk memo) | **Done** | The memo's move, part and flow lines have eight variants each, keyed by the window (asset, from, to). Past facts only. | `template.ts` (`deskMemo`), `roles.ts` (`analystMsg`) |
| Narrator (daily close) | **Partial** | The net worth lines, the story chips (early, mid, late) and the event line have eight variants and render the Wire line's descriptor (nested). The close card shows the story headline and the event line from the descriptors. The title, best and worst, sector, ghost and rank lines and the card headline (`close.head.*`) are still one template each. | `template.ts` (`dailyClose`), `ledger-types.ts`, `close.ts`, `CloseCard.tsx` |
| Moderator | **Partial** | `moderatorMsg` gives one of eight lines per refusal reason (abuse, crypto, brand, figure, taken). The Launchpad's name refusals still use their three-part `lp.refuse.*` lines; the role is not wired into them yet. The rules stay in `launchpad/moderate.ts`. | `roles.ts`, `template.ts` |
| Copy: en and fr | **Done** | 72 message types with eight variants per locale, and 13 fragments (the `when`, `conv`, surprise and index-change phrases). The en and fr key sets are identical. The French is written as French, not translated word by word. | `src/i18n/en.json`, `src/i18n/fr.json` (`txt.*`) |
| Client renders the descriptors | **Done** | Wire, event banner, Replay pins, Research Desk and Journal headlines, close card stories and event, rivals persona. No layout or styling change. | `Wire.tsx` (already), `EventBanner.tsx` (already), `Replay.tsx`, `Dossier.tsx`, `JournalView.tsx`, `CloseCard.tsx`, `RivalsCard.tsx` |
| Retired copy | **Done** | The single-line keys `dayclose.nw.*`, `dayclose.story.*`, `dayclose.event.*` and `desk.memo.*` are replaced by `txt.*`. | `scripts`-free merge, see the commit |

### 7A.2 Guards

- `src/world/text/roles.test.ts` (new): every message type has eight variants in en and fr; the variants of a type share their placeholders, and en and fr agree on them; the fragments exist in both languages; no template gives advice, a forecast or a banned word (English and French, with `banned.ts`); every newsroom fact renders with no placeholder left, in both languages; the variant is stable for a fact id and spreads over the eight slots; the French close card, Wire, rival and memo lines carry no English sentence built from the templates.
- `src/i18n/i18n.test.ts` (unchanged) still checks that every French key exists in English with the same placeholders.
- The close, desk, journal, news and rivals tests were updated to the variant keys (`close.test.ts`, `close-card.test.ts`, `banned.test.ts`).
- Determinism: the engine's `text` on every Wire item is unchanged. The new `msg` field is additive; no price, RNG draw or event timing reads it.

### 7A.3 Not done in this pass

- The model overlay (P7-2) and its tests (cache, cap, validation, fallback, the determinism run with the enricher on).
- The Playwright checks in French (Wire, close card, Rivals profile, Research Desk, desktop and phone).
- The moderator role in the Launchpad refusals, and the single-variant close lines listed in 7A.1.
