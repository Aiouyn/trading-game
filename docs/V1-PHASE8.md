# V1 Phase 8: status

Binding spec: `docs/team/specs/lead-phase8.md`. This file records each track's result. Section 8B is the French completeness track (P8-4).

## 8B. French completeness (P8-4)

**Goal.** A player who picks French sees French everywhere: no key missing in fr, no English sentence left on a screen.

**What was built**
- `src/i18n/frAudit.ts`: the shared audit data (reviewed allowlist of keys, English stopwords, fictional-name allowlist for the sweep, and the line heuristic).
- `src/i18n/fr-audit.test.ts` (vitest): fails on a key missing in fr or fr keys that en lacks; an fr value identical to en at three or more words (except the allowlist); straight apostrophes in fr (the copy uses ’); English stopwords in fr values. A stale allowlist entry also fails.
- `tests/e2e/frSweep.spec.ts` (Playwright, `desktop` 1440x900 and `phone` 390x844): switches to French, opens every app in `APP_IDS`, reads the visible text, and fails on any line with three or more words and an English stopword, unless it contains an allowlisted name or command.

**What the audit found and what changed**
- 415 fr values used a straight apostrophe. All now use ’.
- The sweep found about 210 distinct English sentences on the default app views. They came from content tables that were never translated: business blurbs and sector blurbs, upgrades and business event titles, lifestyle item blurbs, perks and names, licenses, property types, cities and districts, the asset universe (stocks, crypto, commodities, forex, bonds, property funds), AI research names and blurbs, data sources, achievement names and texts, hourly contracts, and rank unlocks.
- Those tables are now read through i18n keys (`biz.blurb.<id>`, `asset.blurb.<id>`, `ach.name.<id>`, `contract.text.<id>`, `ai.name.<id>` and so on), with English in en.json and French in fr.json. The English values equal the content text, so English screens are unchanged.
- Server-made lines (welcome, rank up, achievement unlocked, the Wire's achievement and milestone lines) now carry message descriptors (`msg`), so the Wire, the inbox and the bell read in the viewer's language. The English `text` is unchanged.
- The Phase 7 `ENGLISH_STORY` checks and the fr-specific e2e specs were not changed.

**Kept English on purpose (allowlist or fictional names)**
- Fictional proper names: business names, product and item names are kept only where they are brand-like; "Bank of Port Avalon" is allowlisted in the sweep (`FR_SWEEP_NAMES`). The four sponsor and company names and the `npm run world` command are in `FR_AUDIT_ALLOWLIST`.

**Coverage limits**
- The sweep reads the default view of each app. Deeper views (other tabs, long lists below the fold, error toasts) are covered only by the audit test and by the content keys, not by the sweep.

**Gates (this track)**
- `npx next typegen && npx tsc --noEmit`: 0 errors.
- `npx vitest run --maxWorkers=3` (full): 229 files passed, 2 skipped; 2292 tests passed.
- `eslint` on every touched file: 0 errors, 0 warnings.
- `npx playwright test tests/e2e/frSweep.spec.ts --project=desktop --project=phone --no-deps`: passed.
- Determinism and replays: no engine or simulation code changed; the only world change adds a `msg` descriptor to notification lines, and the English text stays identical.

**Review repairs (round 2)**
- NPC chat (blocking 1): the 30 engine chatter lines in `src/world/npc.ts` were English in French play. The table now lives in `src/world/text/npcChat.ts`, and the stored chat text is unchanged (saves and replays are the same). The screen translates a stored NPC line through `npc.chat.<style>.<n>` (en.json and fr.json), matched on the English template with `{a}` as the stock. Player lines are never translated. `npcChat.test.ts` checks that every template has its key in both locales and that each stored line maps back to its key.
- NPC bios (blocking 2): `Social.tsx` shows an NPC bio through `npc.bio.<playerId>` (24 keys, en equal to the bio the engine stores). Player bios are shown as typed.
- Cyber notify (blocking 3): the "defenses blocked" line at `src/world/cyber.ts:412` now carries `msg: { key: 'security.msg.blocked' }`, the key the Wire and bell already read.
- French spacing (item 4): every space before `: ; ! ? %` and inside `« »` in fr.json is now a no-break space (U+00A0), so "1 %" and "Ventes forcées en {asset} :" do not wrap apart. The en values are unchanged.
- Sweep coverage (item 5): the Playwright sweep still reads the default app views. The world chat and the NPC bio sit behind the chat tab and the profile modal, so they are guarded by `npcChat.test.ts` and the audit test, not by the sweep. Reasoned deviation: the sweep is not extended to those views in this round.

**Gates (round 2)**
- `npx next typegen && npx tsc --noEmit`: 0 errors. `eslint` on the touched files: 0.
- `npx vitest run --maxWorkers=3` (full): 228 files passed, 2 skipped; 2273 tests passed, 70 skipped.
