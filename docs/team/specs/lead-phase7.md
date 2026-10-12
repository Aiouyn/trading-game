# Phase 7 lead decisions: the AI text layer (templates now, a model slot ready)

Binding for Phase 7. Locked decisions it applies: several AI text roles, templates only in V1, a ready model slot, and LLMs
never set prices.

## P7-1. One interface, roles, facts in and words out
- `src/world/text/` holds the `TextProvider` (it exists, with desk memos and trip lines). It grows one method per role. Every
  method takes a typed FACTS object (numbers, names, signs, ids already decided by the world) and returns a `Msg`
  (`{ key, vars }`) that the client renders in its locale. A role never reads world state, never writes it, and never picks a
  number: every figure in its output comes from its facts.
- Roles:
  - **newsroom**: Wire articles and headlines from cause facts (explainMove rows, world events and their precursors, earnings,
    listings, bankruptcies, mergers, spin-offs, index changes, squeezes). Replaces every English-only string the engine and
    `src/content/news.ts` print today (the 6A review found `HEADLINES` and `PRECURSORS` in `worldEvents.ts` are English-only).
  - **executives**: CEO quotes on earnings and filings for NPC companies (tone from the surprise sign and size band).
  - **rumor mill**: the rumor feed lines (M16), with a source name; the accuracy stays the world's.
  - **rival personas**: one voice each for Hale & Ward, Pinn Partners and Vetch, on the Rivals board and profile card, from their
    PAST performance only (never a position or an intention).
  - **analyst**: Research Desk prose, past facts only (keeps the Phase 3 rule).
  - **narrator**: the daily close card lines.
  - **moderator**: name checks for Launchpad tokens, companies, funds and handles (wraps `launchpad/moderate.ts`; one API).
- Variety: each message type has at least 8 template variants per locale; the variant is chosen by a stable hash of the fact's
  id (not a world RNG stream), so prices, streams and fingerprints never move and replays stay identical.
- en and fr for every template, real French. The existing `banned.ts` checks (banned words, advice patterns) run over every
  template in a test. No template gives trading advice.

## P7-2. The model slot (off by default)
- A server-side enricher (`server/text/`), never inside `step` and never on the client. The world always emits the template
  `Msg` at once; when the slot is on, the enricher may later attach model prose for the same item as a presentation-only
  overlay (`textOverlay[itemId] = { en, fr }`), sent to clients like any view field. World state, snapshots and the command log
  never contain model text, so replay is unchanged.
- Provider: Anthropic Messages API over `fetch` (no new dependency): `POST https://api.anthropic.com/v1/messages`, headers
  `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body `{ model, max_tokens, system, messages }`.
  Default model `claude-haiku-5-5` (configurable). Config by env: `TEXT_PROVIDER=claude`, `ANTHROPIC_API_KEY`,
  `TEXT_MODEL`, `TEXT_DAILY_USD_CAP` (default 1), `TEXT_ROLES` (which roles may be enriched).
- Guards, all enforced in code with tests (the network is mocked in every test):
  - cache keyed by role + a hash of the facts + locale (sqlite table in the server's database); a cache hit costs nothing;
  - a daily cost cap from the response's token usage and a price table; at the cap the enricher stops until the next real day;
  - validation of every reply: length cap, no number that is not in the facts (digits are checked against the facts' values as
    the client would format them), no banned word, no advice pattern, both locales present; on any failure the template stays;
  - timeouts and errors fall back to the template silently, with a counter;
  - rate limit per role; nothing about a player is ever sent except the public facts of that item (no handles of others, no
    holdings, no hidden values).
- An admin readout (behind the admin token): calls, cache hits, rejects by reason, spend today, cap.

## P7-3. Tests and gates
- Vitest: every role's templates (variant count, en/fr parity, placeholders match the facts, banned and advice checks); the
  variant choice is stable; a determinism test that a world run with the enricher on (mocked) gives byte-identical state to one
  with it off; the enricher's cache, cap, validation and fallback paths with a mocked fetch.
- Playwright: the Wire, the close card, the Rivals profile and the Research Desk in French show French generated text (no English
  sentence), at desktop and phone.
- Status doc `docs/V1-PHASE7.md` in the style of the earlier phases.
