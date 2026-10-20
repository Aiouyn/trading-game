# 18 — Onboarding, Academy, Help and the Explainability Ladder

Module owner: Onboarding. Status: complete specification, 2026-10-18. Follows the module template of 00 §3.3.
Sources kept: original vision 04 §0.6, §3.3–§3.4, §4 (first 10 minutes, just-in-time introductions, returning session), 04 §10.5.7 (Connections teaching and the Security drill), DESIGN.md v1.2 §6b–§6c (first-session onboarding, stop-loss explainer, goals card), ROADMAP M05–M09 and the approved "Why it moved" ladder and Research Desk (Mathis, 2026-10-09), the velvet specs for the trade journal, Research Desk, bankruptcy and rewarded ads, MASTER-BIBLE PART VI (#8 bankruptcy comeback, #9 trade journal), V3 T4 (legible floor) and Part 4 (delegation spine as access, not simplification).
Screens referenced by id are laid out in 17 §7 (ONB-, ACD-, HLP-, RD-, PF-04).

Time units follow 00 §5.1: 1 tick = 5 real seconds = 2 game minutes; 1 game day = 720 ticks = 1 real hour. "Real" durations are written as such.

---

## §1 Purpose

The game has the deepest ceiling of any financial game; this module is the legible floor that makes the ceiling reachable (V3 T4). It does four things:

1. **The first session** turns a stranger into a player in ten minutes: first dollar in under 60 seconds, three verbs (buy a business, trade, upgrade), a rival by minute 4, and a reason to come back (04 §4.1).
2. **Just-in-time introductions** open every deeper system at the moment it becomes useful, triggered by real game state, never by a calendar.
3. **The Academy and Help** let any player learn any system at their own pace in ring-fenced practice worlds that never touch the real economy, and answer "what is this?" on every screen.
4. **The explainability ladder** answers "why?" about every number and every move, from a free one-liner to the Research Desk, always after the fact and never as advice.

Nothing in this module creates an economic edge, a cash reward beyond the two documented onboarding faucets (§3.2.3), or a way around any rule.

---

## §2 Entities

```ts
type OnbStepId =
  | 'cold_open' | 'identity' | 'first_business' | 'first_dollar' | 'first_upgrade'
  | 'first_news' | 'first_trade' | 'stop_explainer' | 'first_profit_receipt' | 'league_rival'
  | 'the_look' | 'first_choice' | 'window_future' | 'goals' | 'leaving_well' | 'free_play';

type Background = 'dropout_coder' | 'ex_bank_intern' | 'street_flipper' | 'barista_with_a_plan';

interface OnboardingProgress {               // one per character; stored in world state (deterministic, replayable)
  chrId: string;
  startedTick: Tick;
  path: 'guided' | 'veteran';                // 'veteran' = "I've played before"
  background: Background;
  steps: Record<OnbStepId, { status: 'pending'|'shown'|'done'|'skipped'; atTick?: Tick }>;
  firstTradeCapActive: boolean;              // true until the first fill
  goals: GoalProgress[];                     // active starter and ladder goals (max 3 visible)
  jit: Record<JitId, { status: 'locked'|'eligible'|'queued'|'shown'|'done'|'skipped'|'later'; atTick?: Tick; laterUntilRealMs?: number }>;
  coachMarks: Record<string, boolean>;       // one-time marks seen
  pushAskedRealMs: number | null;
  replayCount: number;                       // times "Replay intro" was used (cosmetic only)
}

interface GoalDef {
  id: string;                                // e.g. 'G01_reach_20k'
  titleKey: string;
  condition: GoalCondition;                  // evaluated in P12 from engine state
  rewardCosmetic: string | null;             // decor item, title, card design (14 catalog ids); never cash
  unlocksGoals: string[];                    // next goals in the ladder
}
type GoalCondition =
  | { kind: 'nw_at_least'; amount: Money }
  | { kind: 'own_businesses'; count: number }
  | { kind: 'closed_trade_profit'; count: number }
  | { kind: 'distinct_assets_held'; count: number }
  | { kind: 'upgrades_done'; count: number }
  | { kind: 'stop_order_placed' }
  | { kind: 'own_property'; count: number }
  | { kind: 'model_trained' }
  | { kind: 'trade_asset_class'; cls: string }
  | { kind: 'contract_signed' }
  | { kind: 'alliance_joined' }
  | { kind: 'league_week_completed' }
  | { kind: 'academy_course_done'; courseId: string };
interface GoalProgress { goalId: string; value: number; target: number; doneTick?: Tick; }

type JitId = string;                          // ids listed in §3.8
interface JitDef {
  id: JitId; system: string;                  // module number of the system taught
  trigger: JitTrigger;
  contentKey: string;                         // localized content bundle
  durationSec: [number, number];              // target 30–60 s
  practice: 'none' | 'inline_widget' | 'guided_real' | 'practice_world';
  priority: number;                           // lower = more urgent
}
type JitTrigger = { all: Condition[] } | { any: Condition[] };   // conditions as GoalCondition plus rank, license, flags, events

interface AcademyCourse {
  id: string; track: AcademyTrack; titleKey: string; level: 1 | 2 | 3;   // 1 basics, 2 working, 3 expert
  lessons: Lesson[]; practice?: PracticeWorldSpec; drill?: DrillId; quiz?: QuizSpec;
  badge: string;                              // cosmetic badge id (14/22)
  prerequisites: string[];                    // course ids; advisory only (never blocks)
}
type AcademyTrack = 'basics'|'trading'|'businesses'|'property'|'banking'|'funds'|'derivatives'|'macro'
                  |'ailab'|'security'|'law'|'corpfin'|'institutions'|'lifestyle'|'multiplayer'|'crypto';
interface Lesson { id: string; concept: string; widget: WidgetKind | null; minutes: number; }
type WidgetKind = 'payoff_drag' | 'book_sandbox' | 'margin_sim' | 'curve_shift' | 'waterfall_ccp'
                | 'tranche_loss' | 'bank_balance_sheet' | 'run_sim' | 'mcs_calc' | 'odds_bands'
                | 'evidence_meter' | 'prestige_calc' | 'statement_builder' | 'amm_curve' | 'fx_carry';

interface PracticeWorldSpec {
  kind: 'replay' | 'scenario';
  window?: { fromGameDay: number; toGameDay: number };   // replay: a closed window of the live world's public tape
  scenarioSeedId?: string;                               // scenario: a 20-registered scenario seed
  notional: Money;                                       // ring-fenced balance, default PARAM.acad_practice_notional
  licensesGranted: string[];                             // practice-only licences (no effect outside)
  objectives: GoalCondition[];
}
interface PracticeWorldInstance {
  id: string; chrId: string; spec: PracticeWorldSpec;
  createdRealMs: number; speed: 0 | 1 | 4 | 20;          // practice clocks can pause and speed up
  status: 'running' | 'paused' | 'ended';
  runtimeRealMsToday: number;
}

type DrillId = 'security_drill' | 'margin_call_drill' | 'liquidation_drill' | 'bank_run_drill'
             | 'court_drill' | 'lockdown_drill' | 'fund_gate_drill' | 'ccp_default_drill';

interface QuizSpec { bankId: string; questions: number; passPct: number; kind: 'knowledge' | 'licence_exam'; }
interface QuizAttempt { chrId: string; quizBankId: string; startedRealMs: number; score: number; passed: boolean; }

interface HelpArticle { id: string; screenId?: string; titleKey: string; bodyKey: string; glossary: string[]; related: string[]; }
interface GlossaryTerm { id: string; termKey: string; defKey: string; formulaKey?: string; ownerModule: string; }

type ExplainLevel = 'L0_label' | 'L1_number' | 'L2_trade_line' | 'L3_analyst_junior' | 'L3_analyst_senior' | 'L4_desk';
interface AnalystContract { chrId: string; tier: 'junior' | 'senior'; paidThroughTick: Tick; hiredTick: Tick; }
interface DeskSubscription { chrId: string; paidThroughTick: Tick; fileCount: number; }
interface DeskFile { fileNo: number; chrId: string; assetId: string; fromDay: number; toDay: number; createdTick: Tick; resultRef: string; }
```

---

## §3 Rules and formulas

### §3.1 Principles (binding)

1. **Teach with the real game.** Every headline, price and number in onboarding comes from the live engine; nothing is scripted fake news (04 §4.2). Practice worlds are labelled as practice everywhere.
2. **One sentence per prompt.** No tutorial walls; every prompt is skippable; no forced text longer than one sentence (04 §4.1).
3. **Never place an order or spend money on the player's behalf.** Onboarding may pre-fill a ticket or a sheet; the player always confirms (DESIGN §6b step 5).
4. **No advice.** Teaching explains mechanisms and consequences; it never tells the player what to buy or sell. Copy obeys 17 §3.20 banned lists.
5. **No cash rewards** beyond the start cash and the Retail-broker grant (§3.2.3). Goals and badges give cosmetics and titles only.
6. **Respect time.** At most one just-in-time introduction per 10 real minutes, none during a pending order or a moment, none during the first 10 minutes except the scripted steps.
7. **Same rules for everyone.** "I've played before" skips teaching, never rules: the 20% first-trade cap, protection and rookie zone apply to every new character.

### §3.2 Entry: guest, account and character

**§3.2.1 Guest first.** Tapping Start creates a device-bound guest account (02 §5.1). A guest may play everything single-actor; P2P trading, contracts, auctions bidding, DMs and alliance joining need an account. The account prompt appears at the end of the first session (§3.5) and is required after PARAM.guest_max_real_minutes = 30 minutes of cumulative play or before any gated action.

**§3.2.2 Character creation.** At the end of `identity`, the client submits `acct.onboard.createCharacter` (§4). In the next tick:
- the character is created with start cash $5,000 FDL (00 §5.9), LIC0, rank R0, home city as chosen among the 3 FDL-bloc cities (22 names them; Port Avalon is the default), the rented room home (market rent about $5.40 per game day at launch, 10 §3.14 owns it; ruling in 24), and protection starting at the join tick for 72 real hours (13);
- the character is placed immediately into a Penny league group with free capacity (interface assumed from 15: `league.placeNew(chrId)` returns `groupId`; 15 owns placement);
- `OnboardingProgress` is created with `path` as chosen.

**§3.2.3 The onboarding faucets.** (a) Start cash $5,000 (03 reason code `ACCT_START_CASH`, FAUCET). (b) The Retail-broker grant of PARAM.onb_retail_grant = $250 (00 §5.9, RESOLVED-NUMBERS), which **pays the LIC1 Retail fee** at the moment the licence is granted: 14 posts `ACCT_ONBOARD_GRANT` (FAUCET, $250, once per character; one character per account) and the matching `ACCT_LICENSE_FEE` (SINK, $250), so the player's cash is unchanged and the licence is free to them (14 §3.3.1). (c) The starter Kessler Field gift, owned by 14 (`ACCT_STARTER_GIFT`, FAUCET at its $840 recognized value, unsellable for 7 real days). (d) The background discount (§3.2.4) is a reduced sink, posted as a FAUCET rebate `ACCT_BACKGROUND_DISCOUNT` (14's code) on the purchase so the Stabilizer sees it. No other onboarding flow moves money.

**§3.2.4 Background picks** (flavour plus a tiny tilt, never starting money; 04 §4.2):

| Background | Highlighted first businesses | Tilt |
|---|---|---|
| Dropout coder | Freelance dev studio, IT support shop (22 names; B1) | 10% off the first business bought from the highlighted set |
| Ex-bank intern | — | one free game week (7 real hours) of the Terminal information tier (16) from the Retail grant tick |
| Street flipper | Sneaker resale, food truck (B1) | 10% off the first highlighted business |
| Barista with a plan | Coffee cart (B1, $2,500 in 01) | 10% off the first highlighted business |

PARAM.onb_bg_discount_pct = 10. The discount applies once per account. If a highlighted business costs more than the remaining cash after the discount, the next cheapest B1 in the same sector family is highlighted instead.

### §3.3 The first session, step by step

#### §3.3.1 The step machine

Each step has a trigger, a target time (from the Start tap, real time), a latest time after which a fallback fires, and a skip rule. Steps run in the client but every state change that matters to the world (character creation, purchases, licence, orders) is a normal intent; progress flags are recorded by `acct.onboard.stepAck` so a reinstall resumes correctly. A step never starts while an order countdown is pending or a moment plays (17 §3.9). "Coach mark" means ONB-04.

| # | Step | Target | Trigger | Content (one sentence each) | Player action / intent | Fallback / latest |
|---|---|---|---|---|---|---|
| 1 | cold_open | 0:00–0:08 | Start | ONB-01 lock screen "Balance: $5,000.00", "Rent due Friday." over the home skyline | tap Start, or "I've played before" | — |
| 2 | identity | 0:08–0:40 | after 1 | ONB-02: handle, avatar, city, background | `acct.onboard.createCharacter` | handle taken: inline suggestion list; skip avatar uses default |
| 3 | first_business | 0:40 | character exists | ONB-03: map zooms to one district, up to 4 suggested B1 spots glow; the suggested card is chosen by §3.3.2 | `biz.buy` [09] (one tap + keys moment) | if the player browses instead, the catalog stays open; latest 3:00 → coach mark "Your first business is one tap away." once |
| 4 | first_dollar | ≈ 0:55 | first revenue posting of the business arrives | the earnings counter appears in the strip; a soft number roll; no text | none | depends on 09's opening rule (§3.3.6) |
| 5 | first_upgrade | ≈ 1:30 | 09 reports the business capacity-bound (`lostSales > 0` in the last game hour) | coach mark on the business card: "Your cart is turning people away." with the capacity upgrade's DiffBadge | `biz.upgrade` [09] via its confirm sheet | if not capacity-bound by 6:00, the step waits and fires later in the session when the signal appears; if never, skipped |
| 6 | first_news | ≈ 2:30 | 2:00 elapsed and steps 3–4 done | the Retail licence is granted (`acct.onboard.claimRetail` → 14 grants LIC1 paid by the $250 onboarding grant; toast "Retail licence: on the house") and ONB-05 expands the selected headline (§3.3.3) | "Look at {TICKER}" opens BRK-01 | latest 4:00 |
| 7 | first_trade | after 6 | asset opened | BRK-01 Simple; Limit/Stop hidden until the first fill; honest note "Prices can fall. That's the game."; cap note (§3.3.4) | `mkt.order.place` [05] | if no trade by 6:00, a single coach mark on the Trade button; never repeated |
| 8 | stop_explainer | when it happens | first position down ≥ PARAM.onb_stop_explainer_drawdown = 1% from average cost | inline card under the row: "{TICKER} is down 1.2% since you bought. A stop-loss sells it for you if it falls to a price you choose." with a mini price ladder and **Set stop at {cost×0.95}** (PARAM.onb_stop_preset_pct = 5) | the button only pre-fills a stop sell for the whole position and focuses the ticket | once; "Not now" closes |
| 8′ | first_profit_receipt | when it happens | first trade closed at a profit | "First profitable trade" receipt card (shareable, opt-in) | Share optional | once |
| 9 | league_rival | ≈ 4:00 | 3:30 elapsed and step 6 shown | ONB-07: league group, the rival (§3.3.5) highlighted "Next up · $1,240 ahead" | tap opens their public profile | latest 5:00 |
| 10 | the_look | ≈ 5:00 | after 9 | ONB-08: gift box with the starter watch (§3.3.7), one outfit pick, "Prestige 1. The top of your league has {n}." | `life.onboard.claimGift` [14] | skippable; an unclaimed gift stays in the Vault's "Gifts" shelf |
| 11 | first_choice | ≈ 6:00 | after 10 and no pending order | ONB-09 three cards: "Buy a second business (spread the risk)", "Upgrade the first one twice (compound)", "Put $1,000 into an ETF (passive)" | each opens its real flow (catalog, upgrade sheet, Broker with an ETF pre-selected and $1,000 pre-filled, PARAM.onb_choice_etf_amount); the player confirms | the ETF card is replaced by "Put $500 into an ETF" if cash after the cap rule is below $1,000; hidden if below $200 |
| 12 | window_future | ≈ 7:30 | after 11 | ONB-10 room pan: laptop "The Lab opens at $100k", locked drawer "Security. Your 72 h protection ends in {h:mm}, or the moment you attack someone", poster "Summit Estates. Someday." | tap hotspots (one line + unlock each) | skippable |
| 13 | goals | ≈ 8:30 | after 12 | ONB-11 three starter goals (§3.4) | none | — |
| 14 | leaving_well | ≈ 9:30 | after 13, or when the player backgrounds the app after step 6 | ONB-12: "Your business keeps earning while you're away (8 hours, 16 with a manager). Want a ping when you hit $20k?"; then the account prompt for guests | push permission (OS prompt only after "Yes, ping me"); account upgrade (19) | "Not now" is final for 7 real days |
| 15 | free_play | 10:00 | after 14 | no more prompts this session unless Help is opened | — | — |

The target times are design targets for p50; steps are event-driven and never wait on a timer once their trigger is met, except where "elapsed" is written.

#### §3.3.2 Selecting the suggested first business

```
candidates = B1 businesses (09 catalog) purchasable in the home city now, price ≤ cash
if background has a highlighted set: prefer the cheapest candidate in that set (after discount)
else: prefer the cheapest candidate with 09's "beginner-friendly" flag (low staffing, no licence)
district = the home-city district with the most free B1 storefront slots among the 3 with the
           highest 09 demand index for that sector; ties by district id
show up to 4 glowing spots: the suggested one (accent) + the 3 next-cheapest candidates in that district
```

#### §3.3.3 Selecting the first headline and asset

```
open = assets tradable under LIC1 (06/13) whose session is open now (clock + ticker phase)
items = Wire items of the last 720 ticks (1 game day) whose targets ⊂ open
score(item) = |price move of its main asset since the item tick| × (1 + 0.5·[asset is an equity])
pick argmax score; tie → most recent
if no item: pick the open LIC1 equity with the largest |day change| and show its latest headline,
            else the open crypto major with the largest |day change| (crypto trades 24/7, so one always exists)
```
The headline is a real engine item (04 §4.2, W05). If a Major world event is active, its headline is used and the card adds "This is the whole market, not just one stock."

#### §3.3.4 The first-trade cap

Until the first fill, a buy order's notional is capped at PARAM.onb_first_trade_cap_pct = 20% of cash (DESIGN §6a). The cap is enforced server-side by 05's validation reading `OnboardingProgress.firstTradeCapActive` (interface: 18 exposes `onb.firstTradeCap(chrId): Money | null`). The size chips stop at 20% ("Max 20%"), and the field shows "First trade is capped at 20% of cash." Sells are never capped. The cap applies on both paths.

#### §3.3.5 Selecting the rival

The rule is 15's (§3.5.5): the league view highlights the closest player above the viewer in their group; if that player is more than 3× the viewer's score basis, the nearest NPC reference row is shown instead, with its NPC tag (17 §6). A character joining mid-week enters the least-full group of their base tier at once (15 §3.5.1), so a group always exists at minute 4. Only public profile fields are shown (L11).

#### §3.3.6 The first dollar depends on 09's opening rule

Business operations normally run once per game hour, staggered by `hash(id) mod 30` (00 §5.1), so a new business could wait up to 30 ticks (150 real seconds). To meet the 60-second target, this module requires from 09: **a newly bought business runs its first operation at the tick after purchase, then joins its stagger slot** (interface `biz.firstOpTick = purchaseTick + 1`; DEFAULT requested of 09, which may override with any rule that gives a first revenue posting within 6 ticks). The UI never shows estimated or simulated earnings; the first number is the real posting.

#### §3.3.7 The starter watch

The gift is a Kessler Field (04 §6.3, 14 catalog `lid_kessler_field`): MASS class, PP 1, recognized by 14 as `ACCT_STARTER_GIFT` at $840 (price × (1 − 30% hit)) and unsellable for 7 real days (14's anti-farm lock). It is the first item of 14's beginner set "First Steps". 18 only presents it.

#### §3.3.8 Market-closed and other fallbacks

| Situation at Start | Handling |
|---|---|
| Equity session closed (pre-market, after-hours, weekend) | step 6 uses §3.3.3, which falls back to FX (if open) or a crypto major; the card adds "The stock exchange is closed now. Crypto trades around the clock." The ETF card in step 11 says "Queued for the opening auction at 08:00" when equities are closed |
| A Major world event takeover is playing | onboarding steps wait (17 §3.9); takeover then banner; step 6 uses the event headline |
| The world is halted (21) | steps 1–5 continue; step 6+ wait until trading resumes; the cold open adds nothing |
| No B1 storefront slot free in the home city | 10 grows the district (06-cities §6.2); if growth is pending, the suggestion picks the next city district with a slot; worst case the catalog lists all cities' B1 businesses |
| Cash below the suggested business price (impossible at $5,000 with B1 ≤ $5,000 in 01; guard for later catalog changes) | suggest the cheapest B1 the player can afford; if none, skip step 3 and go to step 6 |
| Player is on a very slow device | city map renders T0 picture (17 §3.18); no step depends on the map rendering |
| Player closes the app mid-onboarding | progress resumes at the next pending step on return; WYWA appears only after step 14 has run once |

#### §3.3.9 "I've played before" (veteran path)

Skips steps 3 (guidance only: the catalog opens without glow), 5, 8, 9, 10, 11, 12 and all coach marks. Keeps: character creation, the Retail licence and its grant (claimed at character creation instead of step 6), the first-trade cap, protection and rookie zone, the goals card, the leaving-well prompt at 10 real minutes of play. Every skipped step is available from Academy › Basics and from Settings › "Replay intro" (which replays the presentation only, never grants anything again).

### §3.4 Starter goals and the goal ladder

The goals card shows at most PARAM.onb_goal_cards = 3 active goals. Completing one shows a 420 ms accent check, awards its cosmetic, and pulls the next goal from the ladder. Rewards are cosmetic (decor, card designs, titles: 14 catalog), never cash (04 §3.3). Goals stop being offered after G20 or after 14 real days, whichever comes first; then the card is replaced by chapter ladders (15).

| Id | Goal | Condition | Reward (cosmetic) | Unlocks |
|---|---|---|---|---|
| G01 | Reach $20k (Hustler) | nw_at_least 20,000 | rank-up handles itself; "First steps" card design | G04 |
| G02 | Own 2 businesses | own_businesses 2 | business card design "Two doors" | G05 |
| G03 | Close a profitable trade | closed_trade_profit 1 | trade receipt frame | G06 |
| G04 | Hold 3 different assets | distinct_assets_held 3 | watchlist theme | G08 |
| G05 | Upgrade a business 3 times | upgrades_done 3 | storefront awning style | G07 |
| G06 | Set a stop on a position | stop_order_placed | "Guarded" title | G09 |
| G07 | Own 3 businesses | own_businesses 3 | business card design (04 §3.3) | G10 |
| G08 | Reach $50k | nw_at_least 50,000 | "First Dollar" framed bill decor | G11 |
| G09 | Finish a league week | league_week_completed | league pennant decor | G12 |
| G10 | Finish Academy: Businesses 1 | academy_course_done 'biz_1' | Academy badge | G13 |
| G11 | Own a property | own_property 1 | house keys decor | G14 |
| G12 | Reach $100k | nw_at_least 100,000 | watch box in the Vault (04 §3.3) | G15 |
| G13 | Train your first model | model_trained | "Laptop lab" decor | G16 |
| G14 | Trade an ETF | trade_asset_class 'etf' | — | G17 |
| G15 | Reach $250k (Owner) | nw_at_least 250,000 | "Owner" card design | G18 |
| G16 | Make a first FX or bond trade | trade_asset_class 'fx' or 'bond' | — | G19 |
| G17 | Sign a contract | contract_signed | pen decor | G20 |
| G18 | Join an alliance | alliance_joined | crest frame | — |
| G19 | Finish Academy: Derivatives 1 | academy_course_done 'deriv_1' | Academy badge | — |
| G20 | Reach $1M | nw_at_least 1,000,000 | (the $1M moment, 14) | — |

First session shows G01, G02, G03 (04 §4.2 step 8:30). A goal whose condition is already met when it would appear is completed silently and replaced.

### §3.5 Leaving well: push permission and the account

- The push ask happens only at step 14 (after value has been shown). "Yes, ping me" triggers the OS prompt and, if granted, enables 17 §3.10.5 defaults plus a one-time `goal_reached` push for G01. "Not now" is not asked again for 7 real days (17 PARAM.ui_push_reask_days), and never within a session.
- Guests then see "Keep your progress: create an account" (magic link, passkey, Google, Apple, Discord). Upgrading keeps everything (19). If the guest declines, the prompt returns at 30 minutes of cumulative play (§3.2.1) as a blocking sheet with the options and a "Later" that allows only non-gated play.

### §3.6 The second session and returning players

- **First return** (≥ 30 real minutes away, 17 SH-09): WYWA plays with a single coach mark on the first card: "This is what happened while you were away. Swipe through, then you're caught up." The first daily close after the first trade (17 SH-10) carries a coach mark: "One page at every close."
- **Second session priorities** (shown as at most one coach mark each, in this order, only if relevant): the business offline cap ("Earning capped at 8 h while you're away; a manager makes it 16 h"), the first league result, the next goal.
- **Dormant return** (≥ 30 real days away, 02 §3.7): a "Welcome back" card before WYWA: what kept running (businesses at 50% on managers, AI mandates, frozen sessions), three facts from 16's history digest of the period ("The Crash of Y4 Q2", "Meridia Bank merged with …"), a prompt to review mandates and standing orders, and the current chapter's ladders.

### §3.7 Teaching the protection timeline

- The protection chip in the strip counts down (17 §3.2.1).
- At 24 real hours before it ends: JIT `security_drill_offer` (§3.8) shows the player's weakest surface unit (12 provides `surface.weakest(chrId)` as a public-to-self description) and offers the Security drill in the Academy.
- The first time the player opens the ops planner while protected, a sheet states: "Launching any op ends your protection now. Your rookie zone keeps the strongest attackers off you until day 7 or $1M." (13 §13.1 numbers).
- At protection end: one toast "Your protection has ended. Your rookie zone continues until {date or $1M}."

### §3.8 Just-in-time introductions

**§3.8.1 Scheduler** (runs on the client from server state; the eligibility flags are computed in P12 so they replay):
```
each tick: for each JitDef with status 'locked': if trigger holds → status 'eligible', queue in priority order
show next queued intro when all hold:
  - onboarding steps 1–14 are done (or skipped)
  - now − lastJitShownRealMs ≥ PARAM.onb_jit_min_gap_real_min (10)
  - no pending order countdown, no moment playing, no P0 alert active
  - the player has been active (input) in the last 60 real seconds
  - the intro's app or screen is open, OR the intro is a 'global' intro (marked G below), which shows as a card in the next idle moment
actions on the card (ONB-13): Start (plays the 30–60 s intro), Show me later (re-queue after 1 real hour), Skip (status 'skipped'; the content stays in the Academy)
at most PARAM.onb_jit_max_per_session (3) per real session (a session = continuous presence with < 30 real minutes gaps)
```

**§3.8.2 The introductions** (every deep system; module owner in brackets; practice: W inline widget, R guided real action the player confirms, P practice world).

| Id | System | Trigger | Introduction (30–60 s) | Practice |
|---|---|---|---|---|
| J01 property_first | Property [10] | NW ≥ $50k and a listing in a district of the player's businesses priced below 10's appraisal; fallback NW ≥ $75k (G) | "Buy the place you live in": owner-occupier vs rental, net income after costs, mortgage in one card | R |
| J02 mortgage | Mortgages [07/10] | first mortgage quote opened | LTV, rate, stress at +200 bp, what happens on default | W margin_sim |
| J03 pro_license | Pro licence [14/06] | R2 rank-up (G) | the Pro licence card (fee $15,000 × MSI, the Pro exam or the Academy shortcut, 14 §3.3.1), then, once bought, a guided first FX or bond trade; price vs yield | R |
| J04 fx_carry | FX [06] | first FX ticket | pips, sessions, carry from rate differentials | W fx_carry |
| J05 bonds | Bonds [06] | first bond ticket | price per 100, yield, duration: why rates move prices | W curve_shift |
| J06 lab_wakes | AI Lab [11] | NW ≥ $100k first time (G) | the laptop wakes: first model trained in ≈2 real minutes on the free "Public tape" dataset with a minimum T0 run paid at normal spot cost (11 provides a starter run ≤ 24 ticks; cost shown before confirm) | R |
| J07 strategy_graph | Strategy graphs [11] | first model trained | blocks, mandates, DU budget: "your AI uses the same order door as you" | W |
| J08 connections | Connections [11/12] | first model exists | "Every connection to your model is listed here. Learn what normal looks like." (04 §10.5.7) | — |
| J09 first_clue | Clues [12] | first anomaly event on any model | one-time coach mark: oddities happen to everyone; patterns matter more than one blip | — |
| J10 security_drill_offer | Security [12] | 24 real hours before protection ends (G) | the weakest surface unit, the defense stack in one card, the drill invitation | P drill security_drill |
| J11 ops_planner | Ops [12] | first open of SEC-07 | odds bands, detection vs attribution, cooldowns, evidence; protection-loss warning | W odds_bands |
| J12 court | Court [13] | first case, filing or theft touching the player (G) | the docket explained with the player's own case: evidence, bars, counsel limits, appeal | — |
| J13 held | Held [13] | Held scheduled (grace starts) (G) | what still runs, what is blocked, the grace period to reduce risk | — |
| J14 alliances | Alliances [15] | 72 real hours after join, or first invite (G) | HQ tour: treasury, roles, ops board, syndicates | — |
| J15 contracts | Contracts [15] | first contract offer received or account upgraded | clauses, escrow, what the engine can and cannot verify | — |
| J16 derivatives | Derivatives [06] | R3 rank-up (G) | options explained with a payoff chart the player drags | W payoff_drag |
| J17 leverage_line | Margin [07] | first leveraged or short position opened | the liquidation line on the chart: "this is the price where the position would be closed" and "set a stop above it" (pre-fill only; ROADMAP N10 adopted as teaching) | W margin_sim |
| J18 short_borrow | Shorting [07] | first short sell ticket | borrow availability, fee, recalls, covering pressure | — |
| J19 perps_funding | Perpetuals [06] | first perp ticket | funding, mark vs index, liquidation | W |
| J20 loans | Bank credit [07] | R1 rank-up or first loan offer | loans, collateral, covenants, what default means | — |
| J21 repo_seclend | Repo, securities lending [07] | LIC2 and eligible collateral ≥ $250k | cash against collateral, haircuts; lending out holdings | W |
| J22 funds_invest | Funds [08] | first visit to Funds | fees, high-water mark, gates, first-loss stake, track records | — |
| J23 fund_launch | Running a fund [08] | CH_FUND becomes available | custody, mandate, gates; "you can never withdraw investors' money" | — |
| J24 company | Company [09] | R2 rank-up (G) | found a company: products, R&D, people, decisions land at the close | R |
| J25 ipo | IPO [09] | a controlled company passes listing readiness | filings, windows, trading plans, the bell | — |
| J26 filings_5pct | Filings [13/15] | first stake ≥ 4% in a listed company (warn before the 5% line) (G) | "At 5% the world learns about it within 1 game day." | — |
| J27 top200_report | Holdings report [15] | the player enters the top 300 NWI (warn ahead of the top-200 rule) | quarterly holdings report rule | — |
| J28 ma | M&A [09] | first stake ≥ 20% or first tender offer opened | tender offers, defenses, merger review | — |
| J29 lbo | LBO [09] | first LBO builder open | sources and uses, covenants, refinancing | W |
| J30 institutions | Charters [13/07/08] | any charter available (G) | what a bank, insurer, CCP member, market maker, custodian is in this world; systemic responsibility | W bank_balance_sheet |
| J31 bank_run | Player bank [07] | first own-bank deposit outflow above 07's alert threshold | the run feedback loop and the CB facility | P drill bank_run_drill |
| J32 ccp | Clearing [07] | CCP membership available | margin, default fund, waterfall | W waterfall_ccp |
| J33 securitization | Structured credit [08] | first issuer desk open or first tranche RFQ | pools, tranches, ratings, correlation | W tranche_loss |
| J34 insurance | Insurance [08/13] | first incident, first Limited item or first property bought | cover, deductibles, claims, Reputation discount | — |
| J35 lifestyle | Prestige [14] | first lifestyle purchase or first visit to the Showroom | Prestige formula in plain words, novelty fade vs heritage, the cost of being seen | W prestige_calc |
| J36 clubs | Clubs [14] | first qualification for any club | access edges are small and noisy | — |
| J37 hosting | Hosting [14] | first mansion | events, invites, effects | — |
| J38 auctions | Auctions [15] | first lot opened | English auction, anti-snipe, fees | — |
| J39 analyst | Explainability [18] | 5th closed trade | the free one-liner and what an analyst adds | — |
| J40 research_desk | Research Desk [18] | R3 rank-up (G) | the dossier: closed days only, explains, never predicts | — |
| J41 risk_app | Risk [05/07] | LIC2 granted | VaR, stress on the world's own crises | — |
| J42 quant_lab | Quant Lab [11] | R2 rank-up and first Quant Lab open | development vs withheld results; no peeking at the future | — |
| J43 macro_cb | Central banks [04] | first CB meeting while holding bonds or FX | the policy rate and its channels | W curve_shift |
| J44 world_event | World events [16] | first Major or Storm onset (G) | "This is the whole market"; precursors on the Wire are how it is seen early | — |
| J45 system_dashboard | Systemic risk [07/20] | first Storm after R2 | the public dashboard and what each gauge measures | — |
| J46 rumors | Rumors [16] | first rumor on a holding | source track records; rumors are legal and unreliable | — |
| J47 tips | Tips [13/16] | first NON-PUBLIC tip | insider trading is a crime; Trade, Ignore or Report | — |
| J48 taxes | Taxes [03] | first tax due | taxable events, jurisdictions, legal planning vs evasion | — |
| J49 daily_close | Daily close [05] | first day close after the first trade | one page at every close | — |
| J50 league_week | Leagues [15] | first league week end (G) | promotion, relegation, % growth scoring | — |
| J51 chapter | Chapters [15] | first chapter end (G) | ladders, titles, nothing resets | — |
| J52 low_cash | Comeback [14/21] | NW < $1,000 first time | the low-cash card and its options | — |
| J53 civic | Politics [16] | R3 and the first bill affecting a held sector | lawful lobbying vs bribery; rules apply to everyone | — |
| J54 dynasties | Dynasties [16] | first discovered dynasty link | knowledge is not disclosure: keep, share, sell or report | — |
| J55 defi | DeFi [06] | first DeFi screen open | AMM curves, impermanent loss, liquidations, depegs | W amm_curve |
| J56 market_making | Market making [05] | market-maker concession available | quoting, inventory, adverse selection | — |
| J57 delegation | Delegation [09/10/11] | owning ≥ 4 businesses or properties, or a first manager hire | mandates, budgets, exceptions: breadth without four full-time jobs (D02, D05) | — |
| J58 execution_algos | Execution [05] | first order > 5% ADV or LIC2 | TWAP, VWAP, participation, icebergs | W book_sandbox |
| J59 api | API [19] | `api.eligible` becomes true | same door, same limits | — |
| J60 honeypots | Honeypots [12] | first model with MCS above 11's honeypot-relevant threshold, or T2 | decoy models as defense | — |

Each intro's content bundle has en and fr text; widgets reuse Academy widgets (§3.10.6).

### §3.9 Coach marks

One-sentence anchored bubbles (17 ONB-04). Rules: at most one visible; at least 20 real seconds between marks; each shown once per account (stored in `coachMarks`); never anchored to a control the player is using; dismissed by any tap; the full list is replayable in Help › "Show tips again". Catalog of marks (key → anchor → text): `cm_earnings_counter` → strip counter → "Your business earns every game hour."; `cm_tick_ring` → tick ring → "Everything happens on the tick, every 5 seconds."; `cm_pending` → pending row → "Orders fill at the next tick, at one price for everyone."; `cm_trade_button` → Trade button → "Ready when you are."; `cm_wire` → Wire tile → "Real news from this world. It moves prices."; `cm_rank_bar` → rank bar → "Next rank at $20k."; `cm_protection` → protection chip → "Nobody can target you while this runs."; `cm_wywa` → first card → (see §3.6); `cm_close` → daily close → (see §3.6); `cm_first_clue` → anomaly feed → (J09); `cm_restricted_cash` → restricted pill → "Some of your cash has rules for a while. Tap to see them."; `cm_simple_pro` → mode switch (after 3 closed trades) → "Pro shows every control. Same market, same rules."; `cm_launcher` (desktop, after 20 minutes) → launcher → "Ctrl K finds anything."; `cm_keys` (desktop, first mouse ticket) → ticket → "Tip: B, S and Enter work too."

### §3.10 The Academy

**§3.10.1 Structure.** Tracks × levels (1 basics, 2 working, 3 expert). Each course: 3–8 lessons of 1–4 real minutes, optional practice world, optional drill, optional quiz, a cosmetic badge. Prerequisites are advisory only. Course recommendations: the Academy home highlights the course matching the most recent JIT intro the player skipped or the next unlocked system; never more than one highlight.

**§3.10.2 Course catalog** (DEFAULT list; content text in 22's catalog of teaching content).

| Track | Courses (id: title · lessons · practice/drill/quiz) |
|---|---|
| Basics | basics_1 How this world works (tick, batch auction, game time, net worth, NWI) · 5 · quiz · basics_2 Money has reasons (ledger, reason codes, faucets and sinks, the Stabilizer) · 4 · quiz · basics_3 Your first week (ranks, licences, protection, leagues) · 4 |
| Trading | trade_1 Orders and fills (market, limit, stop, pending, fees, impact) · 6 · P replay · trade_2 Reading the Wire (news, priced-in bands, rumors, credibility) · 5 · P replay · trade_3 Risk and stops (position sizing, drawdown, stops, diversification as a mechanism) · 5 · P scenario · trade_4 Execution at size (square-root impact, ADV, algos, icebergs) · 6 · P scenario · trade_5 Shorting (borrow, fees, recalls, squeezes) · 4 · P scenario |
| Crypto | crypto_1 Tokens and sessions (24/7, volatility, venues) · 4 · crypto_2 DeFi mechanics (AMMs, impermanent loss, lending, liquidations, stablecoin pegs) · 6 · P scenario |
| Businesses | biz_1 Running a business (demand, market share, upgrades, condition, offline cap) · 6 · P scenario · biz_2 Customers and suppliers (contracts, requirements, dependence, switching) · 5 · biz_3 Delegation (managers, mandates, exceptions, group policies) · 4 |
| Property | prop_1 Property economics (net income, occupancy, cap rate, taxes) · 5 · prop_2 Mortgages and refinancing · 4 · W margin_sim · prop_3 Development (permits, construction, delays) · 4 |
| Banking | bank_1 Credit and collateral (loans, covenants, default) · 5 · bank_2 Margin (initial, maintenance, calls, liquidation, procyclicality) · 5 · drill margin_call_drill, liquidation_drill · bank_3 Repo, securities lending and prime brokerage · 6 · bank_4 How banks work (credit creation, capital, liquidity, runs, the CB facility) · 7 · W bank_balance_sheet · drill bank_run_drill · bank_5 The clearing house (novation, margin, default waterfall) · 5 · W waterfall_ccp · drill ccp_default_drill |
| Funds | fund_1 Investing in funds (fees, HWM, gates, track records) · 4 · drill fund_gate_drill · fund_2 ETFs and authorized participants · 4 · fund_3 Securitization and tranches · 6 · W tranche_loss · fund_4 Insurance and reinsurance, cat bonds · 5 |
| Derivatives | deriv_1 Options basics (calls, puts, payoffs, premium) · 6 · W payoff_drag · P scenario · quiz licence_exam (LIC3) · deriv_2 Greeks and volatility · 6 · deriv_3 Futures, rolls, basis, storage · 5 · deriv_4 Perpetuals and funding · 4 · deriv_5 Swaps and CDS · 6 · quiz |
| Macro | macro_1 Rates and central banks (policy rate, Taylor rule, QE/QT, forward guidance) · 6 · W curve_shift · macro_2 Inflation, growth and the cycle · 5 · macro_3 FX regimes and crises · 5 · W fx_carry · macro_4 Sovereign debt and ratings · 5 · macro_5 Reading the systemic dashboard · 4 |
| AI Lab | ai_1 Compute, data, algorithms and MCS · 6 · W mcs_calc · ai_2 Training runs (failure odds, careful vs quick) · 4 · ai_3 Strategy graphs and mandates · 6 · P scenario · ai_4 Evaluation, withheld worlds, crowding · 5 · ai_5 Licensing and the model market · 3 · ai_6 Governance and incidents · 3 |
| Security | sec_1 Attack surface and defense · 5 · W odds_bands · sec_2 The Connections panel · 5 · drill security_drill, lockdown_drill · sec_3 Ops, odds, detection and attribution · 6 · sec_4 Honeypots, canaries and counter-intelligence · 4 |
| Law | law_1 Evidence and courts (bars, counsel limits, verdicts, appeals) · 6 · W evidence_meter · drill court_drill · law_2 Regulators and surveillance (insider trading, manipulation, filings) · 5 · law_3 Sanctions, Held, the floor and garnishment · 4 · law_4 Contracts and arbitration · 4 |
| Corporate finance | corp_1 Founding and running a company · 6 · corp_2 Raising money (venture rounds, preferred shares, debt) · 5 · corp_3 IPOs and listed life (filings, windows, trading plans) · 5 · quiz licence_exam (LIC4) · corp_4 M&A, LBOs, activism · 7 · corp_5 Restructuring and distressed investing · 5 · corp_6 Groups, consolidation and tax structuring · 5 · W statement_builder |
| Institutions | inst_1 Running a bank · 7 · inst_2 Market making and exchange concessions · 5 · inst_3 Clearing membership · 4 · inst_4 Issuers and rating agencies · 4 · inst_5 Sovereign-scale institutions · 4 |
| Lifestyle | life_1 Prestige, Reputation and Notoriety · 5 · W prestige_calc · life_2 Collections, clubs and hosting · 4 |
| Multiplayer | mp_1 Leagues, boards and chapters · 4 · mp_2 Alliances and syndicates · 4 · mp_3 Filings, Whale Watch and privacy · 4 · mp_4 Auctions and exchanges · 3 · mp_5 Politics and lobbying · 4 |

That is 67 courses, every module of 00 §1 with a player-facing system covered at least once.

**§3.10.3 Practice worlds.** The Academy's sandboxes, and the only "solo" play in the game (V3 Part 11: solo is a non-competitive sandbox).
- **Replay worlds** replay the live world's *public* tape (prices, published news, filings) over a closed window chosen by the course (default the most recent 30 closed game days containing at least one Storm or Major, chosen by 16's history index). The player's orders fill against a replay liquidity model: the public depth and 05's impact formula with the historical NPC depth parameters; other agents do not react. No private data of any player is used, so a replay world can never reveal anything that was not public.
- **Scenario worlds** are synthetic seeded worlds from 20's scenario seed registry (crash week, overheating, credit crunch, bank run, sovereign stress, crypto winter, earnings season, quiet market), with NPC agents only, run server-side.
- Both run in 19's sandbox worker as isolated engine instances with their own ledger namespace `sandbox:{instanceId}`; no posting can reach the live ledger (a P13 invariant: no entry references both namespaces).
- Ring-fenced notional PARAM.acad_practice_notional = $100,000 (course specs may set other values); practice licences are granted inside the sandbox only.
- Controls: pause, 1×, 4×, 20× (practice only), reset, end. A persistent brass PRACTICE frame on every window of the sandbox (17 ACD-03).
- Limits: one running practice world per account; PARAM.acad_practice_real_minutes_per_day = 120 real minutes of runtime per real day (server cost); idle worlds pause after 5 real minutes without input and end after 24 real hours.
- Nothing carries over: no money, assets, models, ranks, Prestige or ladder scores. Course completion gives only the cosmetic badge. This resolves ROADMAP Q4 ("does solo progress carry into the online world?") in the persistent-world design: only cosmetics and badges exist outside the sandbox.
- Practice results are never ranked and never shown to other players unless the player shares a badge.

**§3.10.4 Drills.** Short scripted situations inside a practice world, each ending with a debrief that names what happened and why (mechanisms only):

| Drill | Setup | Player learns | Debrief shows |
|---|---|---|---|
| security_drill | a practice model with a harmless training session planted among its normal connections; anomaly feed running with decoys (04 §10.5.7) | read the list, tag, notice the repeated entry, disconnect at a cost | which entry it was, the clues that named it, the decoys |
| lockdown_drill | three suspicious entries across models | Quarantine vs Lockdown costs and pauses | cost of each choice |
| margin_call_drill | leveraged position into a scenario drawdown | add cash, reduce, or be liquidated | the liquidation ladder |
| liquidation_drill | a perp at high leverage | mark vs index, liquidation price | where the stop would have been |
| bank_run_drill | the player runs a practice bank in a scenario rumor | deposit outflows, liquidity, CB facility | the feedback loop |
| court_drill | a practice civil case with evidence cards | evidence vs bar, counsel cap, settlement | the verdict probability band and why |
| fund_gate_drill | investor in a practice fund under redemption stress | gates and notice periods | NAV vs price |
| ccp_default_drill | a practice clearing member defaults | the waterfall layers | who paid what |

**§3.10.5 Quizzes and licence exams.**
- Knowledge quizzes: 6 questions from a bank of ≥ 18 per course; pass PARAM.acad_knowledge_pass_pct = 70%; unlimited attempts; badge on pass.
- **Licence exams** are owned by 14 (§3.3.1: Pro exam 10 questions, 8 to pass; Derivatives exam; Institutional exam; free; retake after 1 game day; `acct.exam.submit`). The Academy hosts them: each exam is the final quiz of a designated course and uses the same player (ACD-05). Designated courses: **LIC2 Pro exam** = trade_5 Shorting final quiz (covers FX, bonds, margin 2×, shorting, algos: 10 questions from a bank of ≥ 40, pass 80%); **LIC3 Derivatives exam** = deriv_1 final quiz (payoff diagrams, margin); **LIC4 Institutional exam** = corp_3 final quiz (private deals, underwriting, structured products, CDS, prime brokerage). Passing the designated quiz records the exam as passed in 14 (14: "a player who passes the Academy track's final quiz skips the exam"), valid for 14's `PARAM.exam_valid_chapters`.
- Question formats: multiple choice, numeric with tolerance, "drag the price to where the position is liquidated". Questions are generated from templates with randomized parameters so answer sharing is useless.
**§3.10.6 Widgets.** Shared interactive components (also used by JIT intros), each computing results through the owning module's pure functions exposed to the client in a sandbox-only mode (06 payoff, 07 margin and waterfall, 08 tranche loss, 04 curve shift, 11 MCS, 12 odds bands, 13 evidence meter, 14 Prestige, 03 statements, 06 AMM curve, 06 carry). They never call live-world APIs and never show live values of other players.

**§3.10.7 Badges.** One per course and drill, cosmetic, shown under Profile › Titles › Academy (14 counts them as titles with 0 PP so they never inflate Prestige). An "Academy Fellow" title for completing all level-1 courses; "Academy Master" for all 67 courses.

### §3.11 Help and the glossary

- **Help articles:** one per screen in 17 §7 (about 230), reached from the `?` in each screen header (17 HLP-02), plus topic articles per Academy course. Each article: what the screen is for, what each number means (with glossary links), what actions do and cost, related articles.
- **Glossary:** at least 400 terms (22 holds the list), each with a plain one-line definition, a longer definition, the formula where relevant (text from the owning module), and links. Every finance term in any UI string is wrapped with a glossary hover automatically when the term id is tagged in the message key.
- **Search:** across articles, glossary, courses and the launcher.
- **Support:** ticket form (17 §4.2) and ticket status; enforcement appeals (21).
- **Real-account security articles** are visually distinct from in-game security (17 §3.20).

### §3.12 The explainability ladder

Approved by Mathis (2026-10-09). Explanations are paid for with in-game money and progress only, never real money (L7). Every level explains closed periods only and never forecasts.

| Level | Who | Where | What | Cost |
|---|---|---|---|---|
| L0 Labels | everyone | every screen | units, signs, plain labels, glossary hovers | free |
| L1 Explain this number | everyone | hover or long-press on any owner-computed number that has a published formula (17 HLP-04) | the formula and the input values that produced it ("Margin required = 25% × $48,212 = $12,053"), from the owning module's `explain(numberId)` | free |
| L2 Trade one-liner | everyone | journal row and trade detail (17 PF-04) | the one sentence naming the biggest cause, from 05's `explainTrade` cause vector | free |
| L2 World-event share | everyone | event panel (17 SH-08) | the event's share of each held asset's move today | free |
| L2 Business and property income | owners | BIZ-03, PRP-02 | the owner's own income attribution by line (it is their own accounting) | free |
| L3 Junior analyst | hired | trade detail | full waterfall of every closed trade: market, sector, news, company noise, fees and slippage | PARAM.expl_junior_base = $40 + PARAM.expl_junior_pct_nw = 0.005% of NW per game week |
| L3 Senior analyst | hired | trade detail | Junior plus which headline and which day, and flow by pool type | PARAM.expl_senior_base = $150 + PARAM.expl_senior_pct_nw = 0.015% of NW per game week |
| L4 Research Desk | rank ≥ R3, subscribed | RD-02 (17) | the same breakdown for any asset and any closed window; files kept | PARAM.expl_desk_base = $2,500 + PARAM.expl_desk_pct_nw = 0.03% of NW per game week |

Rules:
1. **Payment.** Salaries and upkeep are paid one game week ahead at the day close (t = 719) of the last trading day of the game week, pro-rated at hire by remaining trading days. NW is measured at the payment tick. Reason codes `EXPLAIN_ANALYST_SALARY` and `EXPLAIN_DESK_UPKEEP`, class SINK (03). Restricted cash (ad, comeback, onboarding grant buckets) cannot pay (velvet-research-desk).
2. **Lapse.** If a payment fails (insufficient unrestricted cash), the analyst leaves or the desk locks with one Wire note; no debt, no modal. Desk files stay readable. Below R3 the desk cannot be subscribed (rank is never lost, so this only matters before R3).
3. **Let go / cancel.** No refund of the current week; the confirm sheet says so.
4. **No future.** `explainTrade` covers closed trades; `explainMove` clamps `toDay` to the last closed game day; the API rejects any window touching an open session. World-event explanations use elapsed facts only (17 §3.11.4).
5. **No attribution of flow to anyone.** Flow appears by pool type only; "Players" appears only under k-anonymity (≥ 5 distinct accounts and no account above 40% of the bucket, per closed day, whole percents), else folded into Retail. In the player's own trades, the player's own flow is "You". Named NPC funds are never singled out.
6. **Templates.** The one-liner, the memo (≤ 3 sentences) and waterfall labels are generated from the cause vector through localized templates (22 lists them), past tense only, with the banned-word lint (17 §3.20). A test shock in a window is named "Test shock" (admin events, 21).
7. **Senior and desk parity.** A Senior analyst and the desk show identical numbers for the same trade window; the desk adds any asset and any window.
8. **Sink sizing check** (for 20's harness): at the 01 §8.4 median curve, the desk costs about 0.27% of NW per real day at R3 ($5M) and about 0.1% at $1B; a Junior analyst costs about $140 per real day at $20k. 20 retunes the percentages if desk upkeep exceeds 5% of median R3 income.

### §3.13 Advisor notes (W08)

- An in-world advisor (an NPC from 16's roster assigned at character creation, e.g. a relationship manager at the player's bank) sends at most PARAM.onb_advisor_notes_per_day = 1 note per real day to Messages, connecting a **public** event to something the player owns or follows: "The hospital expansion in Old Harbor needs cold storage. Two of your warehouses are in that district."
- The note lists what is known (the public event, the player's own assets) and what is uncertain ("Demand and timing are not known"), never a profit claim, recommendation or prediction (banned-word lint). 16 supplies the eligible event-asset links; 18 owns frequency, wording and the toggle (Settings › Notifications › Advisor notes, default on for R0–R2, off after).
- Notes never reveal private information about others and never reference non-public events.

### §3.14 Late joiners and returning veterans

- A player joining a world in its third year gets the same first session, plus one card after step 13: "This world has been running since {date}. Three things to know:" with three facts from 16's history digest and a pointer to the chapter ladders and leagues ("Late joiners compete on chapter ladders and leagues, not against a five-year-old empire").
- Players returning after a fresh start (bankruptcy, 14) skip onboarding; the chapter screen (17 SH-14) shows the journal summary and the Academy highlights trade_3 Risk and stops.

### §3.15 Comeback teaching

The low-cash card (17 SH-13) and the chapter screen are the comeback teachers: facts from the journal, the perk choice, the rules line. No shame copy. After a fresh start, the next three closed trades always show the L2 one-liner expanded inline once ("Most of this loss came from …"), then return to normal.

### §3.16 Funnel targets (checked by 20's harness and live analytics)

| Metric | Target |
|---|---|
| Time from Start to first revenue posting | p50 ≤ 60 s, p90 ≤ 90 s |
| New players who buy a business in session 1 | ≥ 95% |
| New players who make a trade in session 1 | ≥ 80% |
| New players reaching R1 within their first two sessions | ≥ 60% (04 §4.1) |
| First session length | p50 ≥ 10 real minutes |
| Players who skip onboarding then churn in session 1 | ≤ the guided path's churn + 5 points |
| JIT intro completion | ≥ 50% started, ≥ 70% of started finished |

ROADMAP Q2 (how fast small businesses pay, which sets when Hustler arrives) is resolved here as a binding **target**, not a number: the median engaged player reaches R1 by the end of their second real day and 60% of new players reach it within two sessions; 09 owns and tunes the B1 payback to meet this band, and 20's harness gates it.

### §3.17 Localization and accessibility of teaching content

- All onboarding, JIT, coach mark, Academy, help and glossary content is keyed (en first, fr complete at shared-world launch, L8).
- Every interactive widget has a keyboard path and a table fallback; every animated step has a reduced-motion static version; the cold open's haptic has a visual equivalent.
- Lesson text targets a reading age of about 14 for level 1 courses; numbers shown in lessons follow 17 §3.4.

---

## §4 Player intents

All are `acct.*` tick intents (they touch world state that must replay: character creation, goal and JIT flags, faucets, sinks), except where marked REST. Rate limits are the standard 20 intents per tick (00 §5.5).

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `acct.onboard.createCharacter` | `{ handle: string; avatar: AvatarSpec; cityId: string; background: Background; path: 'guided'|'veteran' }` | account has no character; handle valid, unique, not reserved, passes moderation (15/21); city ∈ the 3 FDL-bloc cities; background valid | creates the character (§3.2.2): `ACCT_START_CASH` faucet $5,000, LIC0, R0, rented room, protection from this tick, league placement; creates `OnboardingProgress`; on `veteran` also runs the Retail grant (below) |
| `acct.onboard.stepAck` | `{ step: OnbStepId; status: 'shown'|'done'|'skipped' }` | step exists; transitions only forward (pending → shown → done/skipped) | records progress; no economic effect |
| `acct.onboard.claimRetail` | `{}` | character holds LIC0 only; never claimed; 14's `law.licenseEligibility` true | 14 grants LIC1 Retail: posts `ACCT_ONBOARD_GRANT` $250 FAUCET and `ACCT_LICENSE_FEE` $250 SINK in the same tick (cash unchanged); if the background is ex_bank_intern, starts 1 game week of Terminal tier (16) at no charge |
| `life.onboard.claimGift` (owned by 14, triggered by 18) | `{ outfitId: string }` | not yet claimed | adds 14's starter watch (§3.3.7, `ACCT_STARTER_GIFT`) and the outfit cosmetic |
| `acct.onboard.replayIntro` (REST) | `{}` | — | client replays presentation only; increments `replayCount`; grants nothing |
| `acct.goal.dismiss` | `{ goalId }` | goal active | hides it and pulls the next goal; no reward |
| `acct.jit.respond` | `{ jitId; action: 'start'|'later'|'skip'|'done' }` | jit in queued/shown | updates `jit` status; 'later' sets `laterUntilRealMs = now + 1 real hour` |
| `acct.coach.seen` | `{ key }` | — | marks a coach mark seen |
| `acct.academy.start` | `{ courseId }` | course exists | records start |
| `acct.academy.lessonDone` | `{ courseId; lessonId }` | lesson in course; client-reported but cross-checked: lessons with a "Try it" step require the matching sandbox event in the practice instance | records completion; on last lesson + quiz pass (if any), awards the badge (`acad.badge_awarded`) |
| `acct.practice.create` | `{ courseId?; spec?: PracticeWorldSpec }` | no running practice world; daily runtime < 120 real minutes; spec from a course or from the open list (replay windows of closed days; registered scenarios) | asks 19's sandbox worker to start an isolated instance; returns `instanceId` |
| `acct.practice.control` | `{ instanceId; action: 'pause'|'resume'|'speed'; speed?: 1|4|20 }` | owns instance | controls the sandbox clock |
| `acct.practice.end` / `reset` | `{ instanceId }` | owns instance | ends or resets the sandbox; nothing carries over |
| Practice-world intents | the normal module intents (`mkt.*`, `biz.*`, …) with envelope field `world: 'sandbox:{instanceId}'` | validated by the sandbox instance only | affect only the sandbox ledger |
| `acct.drill.start` | `{ drillId }` | not already running one | creates a practice instance with the drill setup |
| `acct.quiz.start` / `acct.quiz.answer` / `acct.quiz.submit` | `{ quizBankId }` / `{ attemptId; qId; answer }` / `{ attemptId }` | for licence-exam quizzes: 14's retake rule (1 game day after a failed attempt); question ids belong to the attempt | scores server-side; on pass records `QuizAttempt.passed`; for a designated exam quiz, also submits 14's `acct.exam.submit` result so `examPassedTick` is set |
| `acct.analyst.hire` | `{ tier: 'junior'|'senior' }` | unrestricted cash ≥ pro-rated first payment | SINK `EXPLAIN_ANALYST_SALARY` pro-rated; creates `AnalystContract`; upgrades/downgrades replace the contract from the next payment |
| `acct.analyst.fire` | `{}` | contract exists | ends at once; no refund |
| `acct.research.subscribe` | `{}` | rank ≥ R3; unrestricted cash ≥ pro-rated upkeep | SINK `EXPLAIN_DESK_UPKEEP`; creates `DeskSubscription` |
| `acct.research.cancel` | `{}` | subscription exists | ends at once; files remain |
| `acct.research.query` | `{ assetId; fromDay; toDay }` | subscription active; `toDay ≤ lastClosedDay`; `fromDay ≤ toDay`; window ≤ PARAM.expl_desk_max_window_days = 1,344 game days (one chapter); ≤ PARAM.expl_desk_queries_per_real_hour = 60 | calls 05's `explainMove`; stores a `DeskFile` |
| `acct.advisor.toggle` | `{ on: boolean }` | — | enables or disables advisor notes |

Validation errors use the standard reason keys (19) with copy from 17 §3.20.

## §5 Engine events

| Kind | Visibility | Payload | Consumers |
|---|---|---|---|
| `onb.character_created` | PRIVATE | `{chrId, cityId, background, path}` | 15 (league), 10 (home), 17 (UI), analytics |
| `onb.step` | PRIVATE | `{chrId, step, status}` | 17, funnel analytics |
| `onb.retail_claimed` | PRIVATE | `{chrId}` (14 emits `acct.license.granted`) | 14 (grant), 17 (toast) |
| `onb.goal_completed` | PRIVATE | `{chrId, goalId, cosmeticId}` | 14 (cosmetic grant), 17 |
| `onb.jit` | PRIVATE | `{chrId, jitId, status}` | 17, analytics |
| `acad.lesson_completed` | PRIVATE | `{chrId, courseId, lessonId}` | 17 |
| `acad.badge_awarded` | PRIVATE (public on profile as a title) | `{chrId, badgeId}` | 14 (titles), 15 (profile) |
| `acad.quiz_result` | PRIVATE | `{chrId, quizBankId, score, passed}` | 14 (licence exams) |
| `acad.practice` | PRIVATE | `{chrId, instanceId, action}` | 19 (worker), analytics |
| `expl.analyst_paid` / `expl.desk_paid` | PRIVATE | `{chrId, amount}` | 03 |
| `expl.analyst_left` / `expl.desk_locked` | PRIVATE | `{chrId, reason}` | 17 (Wire note) |
| `expl.desk_file` | PRIVATE | `{chrId, fileNo, assetId, fromDay, toDay}` | 17 |
| `onb.advisor_note` | PRIVATE | `{chrId, eventRef, assetRefs}` | 17 (Messages) |

No onboarding or Academy event is PUBLIC except badges displayed as titles. Sandbox events stay inside the sandbox instance's own stream.

## §6 NPC behaviour

- **The landlord** (rented room): one NPC message on day 1 confirming rent (about $5.40 per game day at launch, 10 §3.14) and the "Rent due Friday" line of the cold open; afterwards only if rent fails.
- **The advisor** (§3.13): an NPC from 16's roster (relationship manager at the player's bank or a local business association), consistent across the character's life; changes only if the NPC's institution changes (16 succession events), with a message.
- **Rival funds** (16): used as the fallback rival (§3.3.5) and as reference rows; they behave exactly as in the live world.
- **Academy instructors**: fictional named voices for course intros (22 lists 6 instructors with tracks), presentation only; they never send messages outside the Academy.
- **Scenario-world NPCs**: the standard NPC liquidity and actor models of 05 and 16, running in the sandbox with the scenario seed.

## §7 Screens

Layouts in 17. This module drives: ONB-01 to ONB-13 (first session and JIT cards), ACD-01 to ACD-06 (Academy), HLP-01 to HLP-05 (Help), PF-04 and RD-01 to RD-04 (explainability), SH-09 WYWA teaching marks, SH-13 and SH-14 comeback teaching, the goals card on EST-01 Home and Portfolio. Content per screen:
- **ONB screens:** §3.3 table text, en and fr.
- **Academy home:** tracks in the §3.10.2 order; progress rings; one highlighted course (§3.10.1); practice world status with runtime left today.
- **Lesson player:** concept, widget, "Try it" (opens the practice world at the right screen), quiz.
- **Practice world:** the real app screens inside the PRACTICE frame, with the sandbox clock controls.
- **Help:** article for the open screen; glossary; search; support.
- **Explainability:** journal, analyst hire, desk dossier and files.

## §8 Edge cases

1. **Player buys the business before step 3 glows** (fast player): step 3 is marked done; step 4 proceeds.
2. **Player trades before step 6** (opens Broker from the shelf): Broker's first ticket state is "Get the Retail licence (on the house)", which submits `acct.onboard.claimRetail`; step 6 is marked done; the cap still applies.
3. **First trade is a sell** (impossible without a position) or a short (LIC0/LIC1 disallow shorting by default; 06/07 decide): the cap applies only to buys.
4. **First position immediately hits −1%** while the fill toast shows: the stop explainer waits for the toast to close.
5. **First trade closes at a loss before any stop explainer:** the journal line shows the L2 one-liner expanded inline once ("Most of this loss came from the sector, not the company.").
6. **League group has no one above** (the player leads the group at minute 4, rare): fallback NPC rival (§3.3.5); if none, the card reads "You lead your group. The next group up starts at {NWI}."
7. **Background discount when the highlighted business is unaffordable after another purchase:** the discount stays available for the first highlighted purchase within 7 real days, then lapses.
8. **Account deleted during onboarding:** progress deleted with the character (anonymization rules, 02 §5.3). A new account is a new character and gets the grant, which is net zero cash (it only pays the licence fee), so there is nothing to farm; alt detection is 15/21's.
9. **Player reaches $20k inside the first session:** rank is evaluated at the day close only (14 §3.2.4), so the rank-up arrives at the next t = 719 (at most one real hour later) and plays per 17 §3.9; goal G01 completes at the same close. Onboarding steps continue meanwhile.
10. **Major world event starts at minute 2:** takeover then banner; step 6 uses the event headline; the honest note adds the whole-market line.
11. **World halted for maintenance at Start:** steps 1–5 run (business purchase queues for the next tick after resume if the world is paused; the UI states "Opens when the world resumes"); step 6 onwards waits.
12. **Practice world limits reached:** "Practice time for today is used up. It resets at {local midnight}." The Academy lessons without practice remain available.
13. **Practice world during a real P0 alert:** the alert breaks through the PRACTICE frame labelled "Real account" (17 §8.24); the sandbox auto-pauses.
14. **Licence exam failed:** "You can retake it from {time}" (14: 1 game day). No penalty beyond the wait.
15. **Desk query window spanning a listing date or delisting:** clamp to the listing interval with a line "Listed on Day 33" (velvet-research-desk).
16. **NW drops below the desk's rank threshold:** rank is never lost, so the desk stays available; only payment failure locks it.
17. **Two devices running onboarding:** progress is server-side; the second device shows the current step; coach marks are per account.
18. **Veteran path player later wants the guided intro:** Settings › Replay intro (presentation only) and Academy › Basics.
19. **JIT trigger fires while the player is in a practice world:** queued until the practice world is closed or paused, except G-marked intros tied to P0 (Held), which show at once.
20. **A JIT's system is disabled by a feature flag (21 staged rollout):** the intro stays locked until the flag is on.

## §9 Exploits and counters

| Exploit | Counter |
|---|---|
| Farming the $250 Retail grant with new accounts | the grant pays the LIC1 fee in the same tick, so it adds no spendable cash; once per character |
| Farming the background discount | once per account; it only reduces a purchase from the system; the business sells back at 85% (09) of the discounted price, so flipping loses money |
| Farming the starter watch with alts | 14's 7-real-day sale lock and 85% buyback (a $840 recognized item sells for at most $714 after the lock); guests cannot move it P2P; 15/21 alt detection |
| Using practice worlds to see the future | replay worlds use only closed, public history; scenario worlds are synthetic; neither has access to the live seed or entropy (02 commit-reveal); sandboxes have their own namespace |
| Moving value out of a practice world | separate ledger namespace; P13 invariant forbids cross-namespace entries; no intent in a sandbox can reference a live entity |
| Using practice worlds as free compute (backtests at scale) | 120 real minutes per day, one instance, scenario/replay specs from a fixed list; serious backtesting belongs to Quant Lab with its own costs (11) |
| Sharing quiz answers | parameterized templates; banks ≥ 40 for licence-exam quizzes; 14's retake delay |
| Desk flow to isolate a rival | k-anonymity per closed day; whole percent; "Players" bucket folded into Retail when thin; queries cannot touch open sessions |
| Desk as a forecasting edge | closed days only; no priced-in for the future; harness test that a strategy using desk outputs on closed days does not beat buy-and-hold on more than 70% of seeds (the ROADMAP gate pattern), run by 20 |
| Advisor notes as an information edge | built only from public events and the player's own holdings; at most 1 per real day; no non-public sources |
| JIT intros or coach marks used to grief (e.g. triggered by others' actions) | triggers come from the player's own state, except court and Held, which are real events that need the player's attention anyway; rate limits apply |
| Replaying the intro to re-earn rewards | replay grants nothing |

## §10 Acceptance tests

18-AT-01 From Start, a scripted guided new player sees the first revenue posting of the first business within 60 real seconds at p50 and 90 s at p90 across 200 runs on the reference profile (requires 09's opening rule).
18-AT-02 Character creation posts exactly START_CASH $5,000 and no other money; protection end equals join tick + 72 real hours; the character is in a Penny league group the same tick.
18-AT-03 `acct.onboard.claimRetail` grants LIC1 and posts exactly one `ACCT_ONBOARD_GRANT` $250 FAUCET and one `ACCT_LICENSE_FEE` $250 SINK in the same tick; the character's cash is unchanged; a second claim is rejected.
18-AT-04 The first buy order is capped at 20% of cash server-side (a forged larger order is rejected); sells are never capped; after the first fill the cap is gone.
18-AT-05 The stop explainer's button only pre-fills a stop sell at 95% of average cost for the whole position; no order exists until the player confirms (intent log check).
18-AT-06 The first-news headline is a real engine Wire item from the last 720 ticks whose asset is tradable under LIC1 with an open session; when equities are closed, the selected asset is FX or a crypto major.
18-AT-07 The rival shown at minute 4 follows 15 §3.5.5 (closest group member above, or the nearest NPC reference row when that member is above 3× the viewer's score basis, with the NPC tag); no non-public field is displayed.
18-AT-08 Claiming the gift adds 14's starter Kessler Field (PP 1) with its `ACCT_STARTER_GIFT` posting and 7-real-day sale lock; 18 posts nothing itself.
18-AT-09 "I've played before" skips steps 3 (guidance), 5, 8–12 and all coach marks, keeps the cap, protection and goals, and claims the Retail licence at creation.
18-AT-10 No onboarding step, JIT intro or coach mark appears during a pending order countdown, a moment, or a P0 alert; JIT intros are at least 10 real minutes apart and at most 3 per session.
18-AT-11 The push permission OS prompt never appears before step 14 and never without a tap on "Yes, ping me"; after "Not now", no ask for 7 real days.
18-AT-12 Every goal reward is a cosmetic or title; no goal completion posts money (ledger check over 1,000 scripted characters).
18-AT-13 Every JIT intro in §3.8.2 fires exactly once when its trigger first holds in scripted states, and never before.
18-AT-14 Practice worlds: no ledger entry ever references both a sandbox namespace and the live namespace (invariant over 10,000 scripted practice sessions); ending a practice world leaves the live character byte-identical to before it started, apart from Academy progress.
18-AT-15 A replay world built from days d1..d2 contains only public data: two live worlds with identical public tapes and different private states produce byte-identical replay worlds.
18-AT-16 Practice runtime stops at 120 real minutes per real day; a second concurrent instance is refused.
18-AT-17 Licence-exam quizzes: 10 questions from a bank of ≥ 40, pass at 80%, retake only after 1 game day; a pass sets 14's `examPassedTick` for the matching licence.
18-AT-18 Analyst and desk payments post as SINK with the documented reason codes at the last trading day's close, equal to base + pct × NW at that tick; restricted cash is never used; failure locks the service with a Wire note and no debt.
18-AT-19 `acct.research.query` with `toDay` ≥ the current game day is rejected; the dossier waterfall total equals `explainMove` to 0.01 percentage point.
18-AT-20 Desk flow rows never contain a player handle, account id or NPC fund name; a day where one account exceeds 40% of a bucket is folded into Retail.
18-AT-21 Every explanation template, onboarding string and Academy text passes the banned-word lint; explanation templates contain no future tense.
18-AT-22 Every screen in 17 §7 has a Help article and every glossary-tagged term resolves to a glossary entry in en and fr.
18-AT-23 Advisor notes: at most 1 per real day per character; every note references only PUBLIC events and the player's own assets (audit over 30 simulated real days).
18-AT-24 The funnel targets of §3.16 are measured by 20's onboarding bots on every release; a release where the median scripted player does not reach R1 by the end of real day 2 fails the gate.
18-AT-25 After a fresh start, the next three closed trades show the expanded one-liner once each, and onboarding does not replay.
18-AT-26 Late-joiner card shows three facts that exist in 16's public history digest; none is about a specific player's private activity.
