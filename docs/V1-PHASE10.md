# V1 Phase 10: the realism pass

Source: `docs/V1-EVALUATION.md` and `docs/team/specs/lead-phase10.md` (binding). This file records each track. Section 10C is the
Launchpad track (branch `p10/lp`, rulings R-10-6).

## 10C. Launchpad like pump.fun (R-10-6)

### 10C.0 Summary
The Launchpad now reads like a memecoin board: a grid of cards (image, name, ticker, creator, market cap in dollars, the curve,
replies, time since the last trade), a king of the hill banner, a live trades bar, and a token page with a candle chart on the game
clock, a trades table, a replies thread, the top-20 holders, and quick buys. Graduated tokens price on the engine. The launch fee is
$100. The world side is in `src/world/launchpad/*` (view, reply, anon, flow, trade, launch, moderate, icon) and
`src/world/text/lpReplies.ts`; the client is `src/components/apps/launchpad/*`. The shell, `PriceChart.tsx`, `BrokerApp.tsx` and
`TerminalLayout.tsx` were not touched.

### 10C.1 Items
| Item | What changed | Where |
|---|---|---|
| Board | Cards in a grid; sorts: last trade (New), volume (Trending), market cap (Graduated), created, replies, curve; search | `FeedTab.tsx`, `Board.tsx` |
| King of the hill | The live token with the most curve progress, as a banner | `view.ts` `king`, `Board.tsx` `KingBanner` |
| Live trades bar | The newest 12 trades across tokens; a player line under its anonymous id, NPC flow under a fictional handle | `view.ts` `bar`, `Board.tsx` `TradesBar` |
| Candle chart | 1m, 5m, 15m, 1h on the game clock (12, 60, 180, 720 ticks); price or market-cap axis | `CandleChart.tsx` |
| Trades table | Time, trader (anonymous id, creator marked), side, dollars, tokens, price | `TokenSections.tsx` |
| Holders | Top 20 by tokens; the curve, the dev, the NPC cohort and the viewer marked; anonymous ids | `view.ts` `holdersOf`, `TokenSections.tsx` |
| Replies | Player text (140 characters, moderated: empty, long, link, abuse; one a real minute); NPC replies (fictional handles, text keys) | `reply.ts`, `moderate.ts` `moderateText`, `TokenSections.tsx` |
| Quick buys | $10, $50, $100, $500, max; sells 25, 50, 75, 100 % | `Ticket.tsx` |
| Slippage | Shown at the precision typed (the refusal says the typed limit) | `Ticket.tsx` |
| Create | Four generated images (variant 0 is the old icon), a description of 140 characters, the $100 fee | `CreateTab.tsx`, `launch.ts`, `icon.ts` |
| Graduated price | The engine's live mid for the card, the market cap and the chart; the chart keeps sampling | `view.ts` `cardOf`, `flow.ts` `lpTick` |
| Holders incl. NPC | The NPC cohort is an anonymous holder in the counts and the list | `view.ts` `holderRows` |
| Tape in USD | Each tape line carries `usd` (the outlay with fee on a buy, the gross on a sell); old lines read qty times price | `trade.ts`, `view.ts` `tapeOf` |
| {hours} | The gate's refusal data (its parts with their numbers) reaches the Create form; it had been sent without them | `view.ts` `gateData`, `CreateTab.tsx` |
| Launch fee | $100 (`LP.LAUNCH_FEE`), down from $1,000 | `constants.ts` |

### 10C.2 Rulings taken here (deviations, for the lead)
- **Anonymous trader ids, not handles, on the bar.** The brief said "handle bought $X". The bar and the tape show a six-hex id
  hashed from the ticker and the account (`anon.ts`), so an account cannot be followed across tokens and no handle appears. Creator
  lines keep the creator flag. Residual: the hash is not keyed by a secret, so someone who knows an account id can match it on one
  token. A keyed id is a follow-up if the lead wants it.
- **Replies are anonymous too.** A player's reply shows the anonymous id; the creator's reply is marked as the creator's. The
  creator's handle stays public on the card and the header (a founder's name is public).
- **NPC replies are drawn by hash, not from the token's stream**, so no other draw moves and a replay is byte-identical.
- **Candles are built on the client** from the 1-minute samples (one per 12 ticks). `PriceChart` reads engine history by asset id,
  and a curve token has no asset, so a local candle view is used (see 10C.5).
- **Sells in 25 to 100 %** replace the old 25, 50, max chips; the buy chips are $10 to $500 and max (the account's cash).

### 10C.3 Gates and checks
- Typecheck: `npx tsc --noEmit` exit 0 at every commit. Lint: `eslint` on the touched files, 0 errors.
- Vitest, touched areas: `src/i18n`, `src/components/apps/launchpad`, `src/world/launchpad` (incl. the new `pump.test.ts`, 16 tests):
  161 green before `pump.test.ts` was added, the new file green after.
- Vitest, full suite (the tree at `c881c72` plus the diagnostics): 284 files passed, 2 skipped (as on v1); 2,647 tests passed,
  4 expected fail, 70 skipped, 20 todo; exit 0. This includes every fingerprint and determinism test (the company, ecology, funds and
  launchpad determinism files) with their hard-coded values unchanged. Two view expectations changed on purpose: the holder count
  of a launch now includes the NPC sniper's cohort as an anonymous holder (`view.test.ts`).
- Tests added (`src/world/launchpad/pump.test.ts`): the $100 fee (sink and totals); description and variant refusals and storage;
  the {hours} data; icon variant 0 equals the old icon; the graduated card price equals `priceOf` and the chart keeps sampling;
  holders incl. the NPC cohort, the curve and the dev, anonymous ids, no handle; per-token ids; tape dollars and the anonymous id;
  old tape lines read as qty times price; the king; the moderator's cases; reply refusals, the creator role, the one-a-minute brake;
  the thread keeps 60 lines; NPC replies deterministic across two identical worlds, rate-limited, fictional handles and keys; an
  old (pre-Phase 10) snapshot loads and steps.
- Money: the fee is a booked sink (`lpLaunchFee`, `totals.launchFee`); no reply or description moves money; the NPC cohort's sells and
  buys are unchanged. Old snapshots load (pump.test "old snapshots load"). En and fr keys: the same set (`i18n.test`, `fr-audit`).
- No-reveal: `view.test` (no other player's handle in the view, the tape flags only the creator); `pump.test` (holder rows carry no
  handle or account id).
- Playwright: `tests/e2e/launchpadPump.spec.ts` (desktop and phone): the board card, the king, the Create form, the token page
  (description, candles, tape, curve and holder roles), a $100 quick buy, a link refused inline, a reply posted and shown, the bar and
  the reply count back on the board; a French board and token page. The existing `launchpad*.spec.ts` run on the same testids.
  Results in 10C.4.
- Determinism: a world without a launch has no `launchpad` key (`determinism.test`), and every Launchpad tick is a no-op without it, so
  the no-launch worlds keep their fingerprints. A world with launches changes by design (the fee, the replies, the chart samples of
  graduated tokens, the tape fields); the lead re-runs the launchpad gate with the $100 fee.

### 10C.4 Playwright
Run on the final tree with a fresh build (`npx next build --webpack`), ports 3422 and 9022, `--workers=2`, the desktop (1440x900)
and phone (390x844) projects:
- `launchpad.spec.ts` (the v1 Launchpad specs, all still green on the new board; the tab and testid names it uses are kept): green on desktop and phone.
- `launchpadPump.spec.ts` (new): the board, the king and the trades bar; the token page (description, candles, trades, holder
  roles, the thread); a $100 quick buy sent from the ticket; a link refused inline before it is sent; a reply posted and shown,
  the card's reply count updated; the French board and token page. Desktop and phone: green.
- `launchpadLayout.spec.ts`: the tabs and a token page fit the screen with no sideways scroll and no split figure, desktop and
  phone; the minimum-window check. Green after the figure fixes (the trades table's dollar cells had padding counted as a wrapped
  figure; they now carry the class on an inner span).
- Screenshots (desktop 1440x900 and phone 390x844; English and French; the board, the Create form, the token page, the traded
  token): the scratchpad folder `shots-p10-lp`. Read and checked: the king banner, the trades bar, the candle chart with its
  timeframes, the tape, the holder roles, the quick chips and the French strings render; the board and the token page show no
  cut figure on either width.

### 10C.5 Shared-engine note (for the UX fork and `PriceChart.tsx`)
`PriceChart` draws the engine's asset history (candles by `assetId`, with the Broker's intervals). For a graduated token it could
take `assetId = ticker` and draw the engine's own candles. A curve token has no asset, so it needs an explicit OHLC series and a
market-cap scale. Those two inputs are the change the Launchpad would need from `PriceChart`; it was not edited. Until then
`CandleChart.tsx` serves both kinds of token.

### 10C.6 Not done and open
- The lead re-runs the Launchpad held-out gate (`scripts/balance/launchpad.ts`) with the $100 fee; this track did not run it.
  The gate's bots also see the new NPC replies only as text (no money), and the holder counts only as a view; neither moves a gate.
- The anonymous ids are not keyed (see 10C.2).
- The bar shows anonymous ids, not handles (see 10C.2); the brief asked for handles.
- The candle chart is local (see 10C.5); a shared `PriceChart` with candles from a curve token is a change for the UX fork's file.
- The Create form's image variants are generated SVG glyphs (four shapes and palettes), not artwork; no uploads.
- Not built: a reply's moderation by the Phase 7 moderator role (V1 uses the name filter's abuse list and a link refusal).
