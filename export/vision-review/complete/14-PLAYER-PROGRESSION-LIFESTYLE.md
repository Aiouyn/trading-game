# 14 — Player Progression and Lifestyle

Owner module for: the account and character (gameplay identity), ranks, the license ladder, the interface shell, milestones and titles, the lifestyle catalog and everything owned "for yourself", Prestige, Reputation, Notoriety, clubs, hosting, the personal Fresh Start, Legacy, Houses and dynasty succession, and the status publications that show all of it (Estate, profile card, Gilt List, chapter portraits, verified track records).

Depends on: 02 (clock, RNG streams, day-close hooks), 03 (balance sheets, reason codes, net worth, rank-basis net worth), 05 (auction clearing for Unique lots routed through 06), 06 (collectible instruments and the collectible index), 07 (collateral and loans against items, liquidation), 08 (insurance on items), 09 (businesses, player-made editions, managers), 10 (homes as properties, cities, districts, crown parcels), 11 (AI tiers for the rank map, researcher hiring pools), 12 (exposure/heat, physical security, Back Room), 13 (license eligibility, convictions, audits, Held), 15 (boards, Wire, contracts, linked-account graph, chat, notifications), 16 (rumor streams, NPC actors that bid and host), 17 (layouts), 18 (onboarding beats), 21 (cosmetics store, rewarded ads), 22 (names).

Sources kept: original vision 04 (all of §3, §5–§8, §11.3, §12), 02 §5, 03 §7.1, §9.6, §10.3, §13, MASTER-BIBLE PART III rows 4, 5, 8, 9, 11, ROADMAP §2.6 (bankruptcy), 06-cities §6.3 and LC01, LC10, LC16, V3 Part 9. Rank names follow 00 §5.8: the old vision's R3 "Operator" is **R3 Mogul** here, and the old R4 "Mogul" is **R4 Tycoon**. Thresholds are unchanged.

Intent namespaces owned here: `acct.*` (identity, rank, license, House, Fresh Start) and `life.*` (lifestyle, clubs, hosting, display, philanthropy).

---

## §1 Purpose

1. **Make money feel like something.** Rank, home, shell, possessions and titles turn net worth into a place and an identity. A player should feel the jump from $50k to $5M without reading a number (old 04 §0.1).
2. **Drain money in a way players want.** Lifestyle is the economy's most voluntary sink. Mass luxury loses value on purchase and fades in Prestige, so it must be refreshed; collectibles hold value but carry upkeep (old 04 §5.1).
3. **Give small, real, capped advantages** for spending (access, convenience, talent, collateral, reach, physical security) so spending is a decision, never a cash faucet (old 04 §0.4).
4. **Keep three separate social axes**: Prestige (status from what you own and display), Reputation (trust from clean conduct), Notoriety (fame from crime). A player can be high on all three (old 04 §7.1, bible decision 5).
5. **Remember.** The world never resets (L1), so Legacy, Houses and succession give a permanent public history: founding plaques, generations, heirlooms, chapter portraits (V3 Part 9).
6. **Respect the player.** No demotion, no punishing streaks, no real-money path to any of this (L7), quiet money stays a valid strategy (old 04 §7.8).

---

## §2 Entities

All money is `Money` (bigint micro-dollars, FDL unless a `ccy` is given). "Real dollars" means a nominal amount divided by the world money-supply index `MSI(t)` published by 03 (MSI = 1.0 at genesis), so thresholds keep their meaning in year 3 (01 §8.3, 00 §4 NWI). Time fields are `Tick` unless the name says `RealMs`.

### §2.1 Account

```ts
type AgeBand = 'U16' | '16_17' | '18_PLUS';          // U16 is refused at sign-up (L5); stored for compliance (21)
type AccountState = 'GUEST' | 'REGISTERED' | 'SUSPENDED' | 'BANNED' | 'DELETED';

interface Account {
  accountId: string;                 // 'acc_' + ulid; never shown to other players
  state: AccountState;
  createdRealMs: number;
  guestDeviceId: string | null;      // set while GUEST (15 §3.12 anti-alt)
  authMethods: ('EMAIL'|'PASSKEY'|'GOOGLE'|'APPLE'|'DISCORD')[];   // 19 owns auth
  twoFactor: boolean;                // required at top-1% NWI and for alliance Chairs (§3.1.6)
  ageBand: AgeBand;
  country: CountryCode;              // ISO-3166 alpha-2 of the real country, 15 §3.2 owns verification
  countryChangedRealMs: number | null;
  locale: 'en' | 'fr';               // L8
  characterId: string;               // exactly one character per account (00 glossary)
  profileId: string;
  houseId: string | null;            // §2.15
  flags: AccountFlag[];              // 'SHADOW_POOL' | 'RMT_WATCH' | 'ALT_SUSPECT' | 'STAFF' (15 §3.12)
  cosmeticsOwned: string[];          // purchased cosmetic ids (21); never affect any rule
}
```

### §2.2 Profile (public identity)

```ts
interface Profile {
  profileId: string;
  handle: string;                    // §3.1.3 rules; unique case-insensitive
  handleChangedTick: Tick | null;
  displayCompanyName: string | null; // "vega · Northline Capital"; must be a cmp the character controls (09)
  avatar: AvatarSpec;
  background: Background;            // §3.1.4, fixed after creation
  homeCityId: string;                // city of residence for city boards and crown parcels (10)
  homeCityChangedTick: Tick | null;
  chosenTitleId: string | null;      // shown next to the handle
  pinnedReceiptIds: string[];        // max PARAM.profile_pinned_receipts_max = 6
  shellId: ShellId;                  // 17 §2.1 ShellId; must be earned or owned
  publication: PublicationConsent;   // §2.3
  tenureStartTick: Tick;             // join tick; "in the world since day N"
  chaptersPlayed: number;            // chapters with ≥ PARAM.chapter_active_days_min = 10 active real days
  peakAllTimeRank: number | null;    // best position ever on Richest (all-time) board (15)
}

interface AvatarSpec {               // silhouette style at launch (old 04 §9.6)
  silhouette: 'A'|'B'|'C'|'D'|'E'|'F';
  outfitId: string;                  // earned or cosmetic
  poseId: string;
  showWatchItemId: string | null;    // an owned, displayed WATCH item rendered on the wrist
  frameId: string | null;            // profile card frame (cosmetic or earned)
}

type Background = 'DROPOUT_CODER' | 'EX_BANK_INTERN' | 'STREET_FLIPPER' | 'BARISTA_WITH_A_PLAN';
```

### §2.3 Publication consent (LC16: privacy is a publication contract)

Every public representation of a character is listed here, field by field. Anything not listed is private. 15 and 17 build public payloads from this allowlist only.

```ts
interface PublicationConsent {
  showEstate: boolean;               // estate illustration + displayed items to visitors; default true
  showItemValues: boolean;           // values of displayed items to visitors; default false
  showHomeInCity: boolean;           // home building marked on the public city map; default false (06-cities §10)
  showLifestyleOnWire: boolean;      // displayed purchases ≥ PARAM.wire_purchase_threshold_real post to the Wire; default true
  showNotoriety: boolean;            // public Notoriety + opt-in Most Wanted listing; default false (03 §13.7)
  showHouse: boolean;                // House name, crest, generations, succession on the Wire; default true once founded
  showVerifiedRecord: boolean;       // §3.16.5; default false
  crownName: 'handle' | 'private';   // name on a crown/Hall of Patrons slot (10, §3.16.4); default 'handle'
  showChapterPortraits: boolean;     // Hall of Fame portraits on profile; default false
  showFollowerCount: boolean;        // default true
}
```

### §2.4 Character (gameplay identity layer)

The balance sheet (cash, positions, businesses, properties, models) lives in 03 and the owning modules. This record holds only what 14 owns.

```ts
type CharacterStatus = 'ACTIVE' | 'INACTIVE' | 'DORMANT' | 'ESTATE' | 'HELD' | 'ANONYMIZED';
// INACTIVE/DORMANT/ESTATE transitions are owned by 15 §3.13; HELD by 13; ANONYMIZED by §3.1.7

interface Character {
  characterId: string;               // 'chr_' + ulid (00 §3.2)
  accountId: string;
  status: CharacterStatus;
  personaName: string;               // in-world given name + surname; changes only by succession (§3.15)
  personaGeneration: number;         // 1 at creation, +1 per succession
  joinTick: Tick;
  protectionEndsTick: Tick;          // join + 72 real hours (= 72 × 720 ticks), ends early per 13 (00 §5.9)
  rank: RankState;                   // §2.5
  licenses: LicenseHolding[];        // §2.6
  prestige: PrestigeState;           // §2.10
  reputation: ReputationState;       // §2.11
  notoriety: NotorietyState;         // §2.12
  titlesEarned: TitleAward[];        // §2.13
  milestones: MilestoneAward[];
  residence: Residence;              // §2.9
  freshStarts: FreshStartRecord[];   // §2.17
  legacy: LegacyRecord;              // §2.16
  chiefOfStaffQueue: QueuedIntent[]; // §3.12.6, max 3
  restrictedCash: RestrictedCashLot[]; // FIFO lots of AD_GRANT / FRESH_START cash (§3.13, 21)
}

interface RestrictedCashLot {
  lotId: string; reason: 'AD_GRANT' | 'FRESH_START';
  amount: Money; remaining: Money;
  restrictedUntilTick: Tick;         // createdTick + 72 real hours (ROADMAP C5 decided)
}
```

### §2.5 Rank

```ts
type Rank = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

interface RankState {
  rank: Rank;                        // never decreases (§3.2.4)
  reachedTick: Record<Rank, Tick | null>;
  shellsEarned: ShellId[];           // 'r0'..'r6' (17 §2.1)
  dynastyTopStreakCloses: number;    // consecutive game-day closes in the top 50 of Richest all-time (R6 gate)
  lastEvaluatedTick: Tick;
  pendingCeremony: Rank | null;      // rank-up reached but ceremony not yet shown (§3.5.3)
}
```

### §2.6 License holding

```ts
type LicenseId = 'LIC0' | 'LIC1' | 'LIC2' | 'LIC3' | 'LIC4';
type CharterId = 'CH_BANK' | 'CH_FUND' | 'CH_INSURER' | 'CH_EXCHANGE_MEMBER' | 'CH_CUSTODIAN';

interface LicenseHolding {
  id: LicenseId | CharterId;
  state: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'LAPSED';
  grantedTick: Tick;
  renewalDueTick: Tick;              // granted + 1 game year (262,080 ticks), then yearly
  suspendedUntilTick: Tick | null;   // set by 13 sanctions
  examPassedTick: Tick | null;       // Academy exam (18) for LIC2–LIC4
  feePaid: Money;
}
```

### §2.7 Lifestyle catalog definition

```ts
type ItemClass = 'MASS' | 'LIMITED' | 'UNIQUE' | 'CONSUMED';
type ItemCategory = 'HOME' | 'CAR' | 'WATCH' | 'YACHT' | 'JET' | 'ART' | 'WINE' | 'FASHION'
                  | 'EXPERIENCE' | 'PHILANTHROPY' | 'TROPHY';
type StorageKind = 'CAR_SLOT' | 'WATCH_SLOT' | 'ART_SLOT' | 'CELLAR_BOTTLE' | 'BERTH' | 'HANGAR' | 'WARDROBE' | 'NONE';

interface LifestyleItemDef {
  defId: string;                     // 'lid_' + slug, e.g. 'lid_marchetti_furia'
  nameKey: string;                   // L8 string key; display name in 22
  brandId: string | null;            // fictional brand (22): Kessler, Vael, Oriel, Corvo, Halden, Marchetti, Aurel Marine, Stratos, Velour Maison, Vantage & Hale
  category: ItemCategory;
  itemClass: ItemClass;
  listPriceReal: Money | null;       // real dollars at MSI 1.0; null = auction only
  reserveReal: Money | null;         // auction reserve for UNIQUE
  purchaseHit: number;               // fraction lost on purchase (MASS); 0 for LIMITED/UNIQUE (auction fees apply instead)
  depreciationPerGameYear: number;   // MASS declining-balance after purchase; 0 for LIMITED/UNIQUE (index-driven)
  upkeepPerGameYear: number;         // fraction of current value per game year (sink)
  staffRealPerGameYear: Money;       // fixed staff line in real dollars (homes, yachts, jets); 0 otherwise
  minRank: Rank;                     // soft gate: offered from this rank
  storageNeeded: { kind: StorageKind; units: number };
  storageProvided: Partial<Record<StorageKind, number>>;  // homes and some trophies provide storage
  editionSizeBase: number | null;    // LIMITED: per-drop base size (§3.6.3); UNIQUE: 1
  buildRealDays: number;             // 0 = immediate; built-to-order items (superyacht 10)
  perChapterBuildCap: number | null; // e.g. gigayacht 1 new build per chapter
  experienceBurstPP: number | null;  // CONSUMED/EXPERIENCE: PP burst
  reputationGain: number | null;     // CONSUMED/PHILANTHROPY: base Reputation (§3.10)
  benefits: BenefitId[];             // §3.12
  collectibleIndexId: string | null; // 06 index for LIMITED/UNIQUE valuation, e.g. 'CI_WATCH'
}
```

### §2.8 Owned item

```ts
interface OwnedItem {
  itemId: string;                    // 'itm_' + ulid
  defId: string;
  ownerId: string;                   // chr (or cmp/House trust if 08 allows; §3.15.6)
  serial: string | null;             // "Edition 7 of 50", "1 of 99"
  makerCmpId: string | null;         // player-made edition maker (§3.6.7)
  acquiredTick: Tick;
  heritageStartTick: Tick;           // = acquiredTick, or the House's first acquisition for heirlooms (§3.15.3)
  pricePaid: Money;                  // nominal
  pricePaidReal: Money;              // pricePaid / MSI(acquiredTick)
  condition: number;                 // [0,1], starts 1.0
  displayed: boolean;                // §3.6.5; only displayed items give PP and are public
  locationPropId: string | null;     // home property holding it (storage); null = third-party storage
  insuredBy: string | null;          // ins entity (08); default NPC insurer bundled in upkeep
  pledgedTo: string | null;          // loan id when used as collateral (07)
  heirloom: boolean;                 // §3.15.3
  provenanceFlag: 'CLEAN' | 'STOLEN' | 'FENCED';  // 12 E5 sets STOLEN; auction house refuses non-CLEAN
  buildCompletesTick: Tick | null;   // built-to-order items
  upkeepArrearsGameDays: number;     // consecutive day closes unpaid
}
```

### §2.9 Residence and storage

```ts
interface Residence {
  primaryHomePropId: string | null;  // an owned or leased property flagged owner-occupied (10); null = rented room
  secondaryHomePropIds: string[];    // max PARAM.secondary_homes_max = 9
  rentedRoom: boolean;               // true while no primary home
  storageCapacity: Record<StorageKind, number>;   // sum over homes + paid storage (§3.6.6)
  paidStorageUnits: Record<StorageKind, number>;  // third-party storage rented
  securityWingGrade: 0 | 1 | 2 | 3 | 4 | 5;       // §3.12.9 → 12 physicalSecurityGrade
  staffArrearsGameDays: number;
}
```

### §2.10 Prestige

```ts
interface PrestigeState {
  pp: number;                        // integer, recomputed at each day close (t = 719)
  ppLive: number;                    // UI estimate, recomputed on any change, never used by rules
  byCategory: Record<ItemCategory, number>;
  setBonus: number;
  titlesPP: number;
  burstPP: number;                   // sum of active experience bursts
  bursts: { sourceItemId: string; pp: number; endsTick: Tick }[];
  setsCompleted: string[];           // set ids (§3.9)
}
```

### §2.11 Reputation

```ts
interface ReputationState {
  value: number;                     // [0,100], float64, displayed rounded; start PARAM.rep_start = 50
  history: ReputationEvent[];        // public lines: last 50 kept in hot storage, all in the event store
  lastNegativeTick: Tick | null;
  weeklyPositiveByKind: Record<RepEventKind, number>; // for weekly caps, reset each real week (Monday 00:00 UTC)
  chapterPhilanthropyReal: Money;    // for diminishing philanthropy gains (§3.10.3)
}

type RepEventKind =
  | 'CONTRACT_HONORED' | 'CONTRACT_DEFAULT' | 'FILING_ON_TIME' | 'FILING_LATE' | 'FILING_FALSE'
  | 'CONVICTION' | 'CIVIL_LOSS' | 'COURT_WIN_VICTIM' | 'PHILANTHROPY' | 'AUDIT_CLEAN'
  | 'TIP_REPORTED' | 'CLEAN_LAB_CHAPTER' | 'FRESH_START' | 'HOSTED_EVENT_ATTENDED'
  | 'MALICIOUS_PROSECUTION' | 'FUND_GATE_ABUSE' | 'RUG_PULL' | 'SUCCESSION_RESET' | 'DRIFT';

interface ReputationEvent {
  tick: Tick; kind: RepEventKind; delta: number; refId: string | null;
  publicLine: string | null;         // string key for the profile record, e.g. 'rep.line.contract_default'
}
```

### §2.12 Notoriety

```ts
interface NotorietyState {
  value: number;                     // [0,100], start 0, private unless PublicationConsent.showNotoriety
  lastOpTick: Tick | null;
  history: { tick: Tick; delta: number; reason: 'OP_SUCCESS' | 'MOST_WANTED' | 'CONVICTION_CONVERT' | 'DECAY' | 'SUCCESSION' }[];
}
```

### §2.13 Titles and milestones

```ts
type TitleSource = 'MILESTONE' | 'SET' | 'LADDER' | 'LEAGUE' | 'FINALS' | 'TOURNAMENT' | 'GILT' | 'HOUSE'
                 | 'EXPERIENCE' | 'PHILANTHROPY' | 'BOARD' | 'LEGACY' | 'FRESH_START';
interface TitleDef {
  titleId: string; nameKey: string; source: TitleSource;
  ppFresh: number;                   // PP while fresh (the chapter it was earned plus the next)
  ppHeritage: number;                // PP after that, permanent
  unique: boolean;                   // one holder per scope at a time (e.g. "Chapter 3 Champion")
}
interface TitleAward { titleId: string; awardedTick: Tick; chapter: number; scope: string /* 'global' | country code | city id */; personaGeneration: number; }

interface MilestoneDef { milestoneId: string; nameKey: string; condition: MilestoneCondition; reward: { decorItemDefId?: string; titleId?: string; wire: boolean; moment: MomentKind | null }; }
interface MilestoneAward { milestoneId: string; tick: Tick; }
```

### §2.14 Clubs, collection sets, hosted events

```ts
interface ClubDef {
  clubId: 'HARBOR_CLUB' | 'GLASSHILL_CIRCLE' | 'SUMMIT_SOCIETY' | 'BACK_ROOM';
  minPP: number | null; minRep: number | null; minNotoriety: number | null;
  duesRealPerGameYear: Money;        // billed quarterly in advance (every 91 game days)
  benefits: BenefitId[];
  publicMembership: boolean;         // BACK_ROOM = false (never on profile)
}
interface ClubMembership { clubId: string; characterId: string; joinedTick: Tick; paidThroughTick: Tick; state: 'ACTIVE' | 'GRACE' | 'LAPSED'; graceEndsTick: Tick | null; }

interface CollectionSetDef { setId: string; nameKey: string; titleId: string; requirement: SetRequirement[]; }
type SetRequirement =
  | { kind: 'ITEM_DEF'; defIds: string[]; count: number }            // any `count` of these defs
  | { kind: 'CATEGORY_MIN_PRICE'; category: ItemCategory; minPriceReal: Money; count: number }
  | { kind: 'HOME_IN_BLOCS'; blocs: number }                          // homes in N distinct blocs
  | { kind: 'PROPERTY_IN_DISTRICT'; districtTag: string; propertyKind: string };

type HostedEventKind = 'DINNER' | 'PARTY' | 'GALA';
interface HostedEvent {
  eventId: string; hostId: string; kind: HostedEventKind;
  venuePropId: string;               // host's home with hosting capacity (§3.12.2)
  startTick: Tick; endTick: Tick;    // duration PARAM.hosting_duration_ticks = 720 (1 game day)
  invitees: string[]; attendees: string[];
  capacity: number; cost: Money;
  channelId: string;                 // temporary chat channel (15 §3.9)
  state: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
}
```

### §2.15 House (player dynasty)

```ts
interface House {
  houseId: string;                   // 'hse_' + ulid
  accountId: string;                 // exactly one House per account, permanent
  nameKey: string;                   // player text, moderated, unique among Houses: "House Varela"
  crest: { shieldId: string; chargeId: string; tinctures: [string, string]; mottoText: string | null };
  foundedTick: Tick;
  generations: Generation[];         // one entry per persona; current is last
  heirloomItemIds: string[];         // max PARAM.house_heirlooms_max = 12
  houseTitles: TitleAward[];         // predecessors' titles, shown as "House Varela: Chapter 3 Champion"
  recordLines: string[];             // permanent public record lines (convictions etc.) carried from all generations
  legacyPoints: number;              // mirrors the character's Legacy (§3.14) for House display
}
interface Generation {
  personaName: string; personaGeneration: number;
  startTick: Tick; endTick: Tick | null;
  peakRank: Rank; peakRankBasisNWReal: Money;
  portraitIds: string[];             // chapter portraits during this generation
  heirTrait: HeirTrait | null;       // trait chosen when this generation began (§3.15.4)
}
type HeirTrait = 'BUILDER' | 'QUANT_RAISED' | 'DIPLOMAT' | 'COLLECTOR' | 'STEWARD' | 'SPARTAN';

interface Succession {
  successionId: string; houseId: string;
  state: 'PROBATE' | 'COMPLETED' | 'ABORTED';
  beganTick: Tick; completesTick: Tick;   // began + PARAM.probate_ticks
  estateValueReal: Money | null;      // valued at completion tick
  inheritanceTax: Money | null;
  installmentPlanId: string | null;   // 07 loan from the sovereign treasury when cash is short
  heirPersonaName: string; heirTrait: HeirTrait;
}
```

### §2.16 Legacy

```ts
type LegacyKind = 'TENURE_CHAPTER' | 'RANK_FIRST' | 'COMPANY_FOUNDED' | 'COMPANY_IPO' | 'NAMED_WING' | 'PUBLIC_SPACE'
                | 'LADDER_TITLE' | 'HALL_OF_FAME' | 'GENERATION' | 'PATRON_CHAPTER' | 'FOUNDING_PLAQUE'
                | 'GILT_COVER' | 'FUND_TRACK_RECORD' | 'MODEL_LINEAGE' | 'PUBLISHED_RESEARCH';
interface LegacyEntry { entryId: string; tick: Tick; kind: LegacyKind; points: number; refId: string | null; publicLineKey: string; personaGeneration: number; }
interface LegacyRecord { points: number; entries: LegacyEntry[]; plaques: Plaque[]; }
interface Plaque { plaqueId: string; kind: 'FOUNDING' | 'PATRON' | 'WING' | 'PUBLIC_SPACE'; cityId: string; parcelId: string; textKey: string; tick: Tick; visible: boolean; }
```

### §2.17 Fresh Start record

```ts
interface FreshStartRecord {
  tick: Tick;
  trigger: 'VOLUNTARY' | 'FORCED_NEGATIVE_EQUITY';
  grantedCash: Money;                // ≤ PARAM.fresh_start_cash_real × MSI
  perk: 'OLD_CONTACTS' | 'LESSONS_LEARNED' | 'SECOND_WIND' | null;  // null when only the floor was granted
  perkEndsTick: Tick | null;
  priorPeakRankBasisNWReal: Money;   // for the Phoenix title (§3.13.6)
  leverageCapUntilTick: Tick;
  creditBlockUntilTick: Tick;
}
```

### §2.18 Status publications

```ts
interface ChapterPortrait { portraitId: string; characterId: string; chapter: number; tick: Tick; renderSpec: EstateRenderSpec; }
interface EstateRenderSpec {                       // what 17 draws; built only from displayed items and consented fields
  homeDefId: string | null; homeCityId: string | null; timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  displayed: { defId: string; slot: string; serial: string | null }[];
  shellId: ShellId; crestRef: string | null;
}
interface GiltListIssue {
  issueId: string; quarterIndex: number; scope: 'global' | CountryCode; publishedTick: Tick;
  top100: { characterId: string; rankBasisNWRealBucket: string; estateSpecId: string | null }[];
  climbers: string[];                // top 10 by quarterly rank-basis growth (ln ratio, $100k floor)
  mostFlamboyant: string[];          // top 10 by PP
  mostGenerous: string[];            // top 10 by real philanthropy this quarter
  coverStar: string;                 // §3.16.3
}
interface VerifiedTrackRecord {
  characterId: string; window: 'CHAPTER' | 'ALL_TIME' | 'LAST_365_GAME_DAYS';
  computedTick: Tick; returnPct: number; sharpe: number; maxDrawdownPct: number; trades: number;
  assetClassesTraded: string[];      // classes only, never instruments
  published: boolean;
}
```

---

## §3 Rules and formulas

### §3.1 Account and character lifecycle

**§3.1.1 Creation (guest).** A first launch creates `Account{state:'GUEST'}` bound to a device id, a `Character` and a `Profile` with a generated handle `guest_<6 base32>`. Starting state is 00 §5.9: cash $5,000, LIC0, R0, home city among the three FDL-bloc cities (default Port Avalon), protection until `joinTick + 72·720`. Guests can play every solo-visible system but cannot: send or receive P2P transfers or contracts, chat outside their league group read-only view, join alliances, or appear on boards (15 §3.12). The game requires an account after `PARAM.guest_max_real_minutes = 30` minutes of play or before any P2P action.

**§3.1.2 Upgrade to registered.** Adding any auth method (19) moves the account to `REGISTERED`. The age gate asks for a birth year; `U16` is refused with a message and the guest data is deleted after 24 real hours (L5). The country is captured per 15 §3.2.

**§3.1.3 Handle rules.** 3–20 characters, `[A-Za-z0-9_.-]`, must start with a letter, not all digits, case-insensitive unique among live handles and among handles released in the last `PARAM.handle_release_hold_chapters = 1` chapter. Passes the moderation filter (21) and a reserved list (staff, institutions, NPC actor names in 22, brand names). A handle can change once per chapter for `PARAM.handle_change_fee_real = $1,000` (sink `ACCT_HANDLE_FEE`). The previous handle shows as "formerly X" on the profile for one chapter. Handle changes are blocked while the character is under investigation, in a case, Held, or within 7 real days after a conviction (anti-evasion).

**§3.1.4 Background.** Chosen once at creation; flavor plus one tilt, never cash (old 04 §4.2):

| Background | Tilt (applied by the named module) |
|---|---|
| `DROPOUT_CODER` | 10% off the first Freelance dev studio or IT support shop (09) |
| `EX_BANK_INTERN` | 7 game days of free Terminal news tier on the first license (16 information tiers) |
| `STREET_FLIPPER` | 10% off the first Sneaker resale or Food truck (09) |
| `BARISTA_WITH_A_PLAN` | 10% off the first Coffee cart (09) |

The discount is a reduced purchase price, recorded as `ACCT_BACKGROUND_DISCOUNT` (FAUCET, ≤ $600 per character, once).

**§3.1.5 Home city.** Chosen at creation among FDL-bloc cities. Changeable once per chapter for `PARAM.home_city_change_fee_real = $25,000` (sink `ACCT_HOME_CITY_FEE`), effective at the next day close. The home city decides city-board membership and Hall of Patrons eligibility (10, §3.16.4). It is not the residence: a player may live anywhere they own a home. A change resets the current-chapter city-board score in both cities to 0 (anti-hopping, mirrors 15 §3.2 country rule).

**§3.1.6 Two-factor requirement.** When a character enters the top 1% of NWI (checked at day close), enters the top 100 of any global board, or becomes an alliance Chair, the account is asked to enable 2FA (the same MFA as 19 Rule 3.9.3, which also requires it for API keys and staff; ruling in 24); without it, P2P transfers and contract signatures above $1M real are blocked until enabled (protects against real account theft, old 02 §5.1). The UI states plainly that this is real-account security, not the in-game hacking system.

**§3.1.7 Deletion and anonymization.** On a verified deletion request (21 privacy): (1) open contracts are terminated with each contract's termination clause (15 §3.6.9), escrow returned per clause; (2) the estate is liquidated: debts to other entities paid first in 07's liquidation order, UNIQUE items and concessions go to the estate auction (15 §3.13), everything else is sold at fair value −15%; (3) remaining cash is destroyed (`ACCT_DELETION_ESCHEAT`, SINK); (4) the character becomes `ANONYMIZED` with handle `former_<n>`, all public history lines keep their facts but show "Former player #n"; (5) Legacy plaques are hidden; (6) the House record is anonymized. Deletion is blocked while Held or with an unpaid judgment; the judgment is paid from the estate first.

### §3.2 Ranks

**§3.2.1 Rank basis.** Ranks use **rank-basis net worth**, provided by 03: `rankBasisNW(chr, tick)` = net worth with every position marked at its liquidation value against the whole crowd (the "alt-lifted peak" fix, ROADMAP must-fix), illiquid assets at fair value (never last print), divided by `MSI(tick)`. Interface assumed from 03: `nw.rankBasisReal(characterId: string, tick: Tick): Money`.

**§3.2.2 Thresholds** (real dollars):

| Rank | Name | Threshold | Shell (17 ShellId) | Typical home | Business tier opens (09) | License available | AI tier band (11, soft) |
|---|---|---|---|---|---|---|---|
| R0 | Broke | start | `r0` cracked phone | rented room | B1 | LIC0 (LIC1 granted in onboarding, 18) | T0 teased |
| R1 | Hustler | $20,000 | `r1` new phone | studio | B2 | LIC1 | T0 |
| R2 | Owner | $250,000 | `r2` laptop | loft | B3 | LIC2 Pro | T1 |
| R3 | Mogul | $5,000,000 | `r3` three-screen desk | penthouse | B4 | LIC3 Derivatives; CH_FUND, CH_EXCHANGE_MEMBER | T2 |
| R4 | Tycoon | $100,000,000 | `r4` private office | mansion | B5 | LIC4 Institutional; CH_BANK, CH_INSURER, CH_CUSTODIAN; House founding | T3 |
| R5 | Titan | $2,000,000,000 | `r5` glass trading floor | estate | B6 | board seats (via Summit Society), sovereign-scale mandates (08), exchange concession bids (09 §3.8.3) | T4–T5 |
| R6 | Dynasty | §3.2.3 | `r6` island control room | island or skyline tower | Unique trophy auctions, sovereign wealth fund (08) | — | — |

V3 question 1 ("player banks and exchange concessions earlier than Dynasty?") is **resolved: yes**. Bank, insurer and custodian charters become available at R4 Tycoon; fund and exchange-member charters at R3 Mogul; exchange concessions open at R5 Titan (09 §3.8.3); only the sovereign wealth fund stays at R6 (ruling in 24). 13 adds the capital, record and fee requirements on top of these rank gates.

**§3.2.3 R6 Dynasty gate.** `DEFAULT (Mathis may override)`: all three of (a) `rankBasisNW ≥ PARAM.rank_r6_floor_real = $20,000,000,000`, (b) a position in the top `PARAM.rank_r6_top_n = 50` of the Richest (all-time, global) board (15 §3.4) at `PARAM.rank_r6_streak_closes = 24` consecutive game-day closes (one real day), and (c) a founded House (§3.15). The old vision's "top 50 of the world board" is kept as condition (b); (a) stops a thin early world from handing out Dynasty, (c) makes Dynasty literally a dynasty.

**§3.2.4 Evaluation and no demotion.** At every day close (t = 719) in P12, for each ACTIVE or INACTIVE character: compute `rb = rankBasisNW`; while the next rank's condition holds, set `rank = next`, `reachedTick[next] = tick`, append the shell, set `pendingCeremony`, emit `acct.rank.up`. R6 uses the streak counter (increment when in top 50 at this close, else reset to 0). Rank never decreases (old 04 §3.1). Current standing is shown by leagues and boards (15). A Fresh Start keeps the rank (§3.13.3).

**§3.2.5 What rank gates and what it does not.** Rank only makes things **available**: business tiers, license purchase, charter applications, lifestyle offers (`minRank`), city access (§3.2.6), app tiles (17 §3.2). Money and requirements still apply. Rank never changes any odds, price, fee or rule outcome.

**§3.2.6 City access by rank** (10 consumes): home-bloc cities from R0; all cities of the other four blocs from R2 (the Pro license is needed for FX anyway); Isla Serena from R4 (free-zone domicile and non-island assets), while buying a private island needs R6 (10 §3.18; ruling in 24). Owning assets in a city is possible only once that city is accessible; trading listed instruments of any bloc follows licenses, not this rule.

**§3.2.7 Rank timing targets** (for 20's balance bands; from old 04 §3.2, personal curve from join): R1 day 1–2 (top 1%: first session); R2 ~day 5 (~day 2); R3 ~day 12 (day 7); R4 ~day 40 (~day 14); R5 after day 56 for the median (~day 28 for top 1%); R6 top 50 only. Days are real days.

### §3.3 License ladder

**§3.3.1 Ladder.** `DEFAULT (Mathis may override)` fees and exams (old 01 §3 "licenses cost money and have a background check"; no numbers existed):

| License | Unlocks (owned by 06/07) | Rank gate | Fee (real, sink `ACCT_LICENSE_FEE`) | Exam (18 Academy) | Renewal per game year |
|---|---|---|---|---|---|
| LIC0 Cash | cash account, spot buys of nothing but businesses and lifestyle | — | 0 | — | — |
| LIC1 Retail | stocks, ETFs, major crypto, unlevered | R0 (granted in onboarding) | $250, paid by the onboarding grant (`ACCT_ONBOARD_GRANT`, FAUCET $250, once; 00 §5.9) | none | 0 |
| LIC2 Pro | FX, commodities, bonds, margin 2×, shorting, execution algos | R2 | $15,000 | Pro exam (10 questions, 8 to pass) | 10% of fee |
| LIC3 Derivatives | options, futures, perps, swaps, CDS protection buying, up to the 06/07 caps (10×) (06 §3.2 is authoritative) | R3 | $250,000 | Derivatives exam (payoff diagrams, margin) | 10% of fee |
| LIC4 Institutional | private deals, underwriting, structured products, OTC blocks, CDS protection selling, prime brokerage access (06 §3.2 is authoritative) | R4 | $5,000,000 | Institutional exam | 10% of fee |

Fees are stated in real dollars and charged as `fee × MSI(tick)`. Exams are free, retakable after `PARAM.exam_retake_game_days = 1` game day, and teach rather than gate experts (18 lets a player who passes the Academy track's final quiz skip the exam).

**§3.3.2 Eligibility interface (13).** Before granting or renewing, 14 calls `law.licenseEligibility(characterId, licenseId) → { eligible: boolean; reason?: 'CONVICTION_S5_ACTIVE' | 'SUSPENDED' | 'HELD' | 'UNDER_INVESTIGATION' | 'OTHER' }` (13 owns the rule, e.g. convicted players lose licenses). A license can be suspended or revoked only by a 13 sanction event; 14 applies it (`state`, `suspendedUntilTick`). While suspended, positions of the unlocked classes can only be closed (13 §sanctions, old 03 §9.6).

**§3.3.3 Renewal.** At `renewalDueTick` the renewal fee is charged. If cash is insufficient, the license enters `LAPSED` after a grace of `PARAM.license_grace_game_days = 7` game days; while LAPSED, only closing orders are allowed for that class, and paying the fee restores `ACTIVE` immediately. LIC1 never lapses.

**§3.3.4 Charters.** Charter applications (`acct.charter.apply`) check the rank gate in §3.2.2 and forward to 13, which owns capital, record, fee and approval. 14 stores the resulting `LicenseHolding` with the `CharterId`.

### §3.4 The shell

The shell is the interface's material theme (old 04 §9.3; layouts and visuals in 17). Rules here: a character earns shell `rK` on reaching rank K and keeps every earned shell forever; the active shell can be any earned shell or any owned cosmetic shell (21). Cosmetic shells are visibly labeled as purchased in the profile's shell field and never count toward Prestige, titles or any rule (L7). The shell never changes what information a player sees (17 §1 rule 4). The default active shell is the highest earned; a player who has chosen a shell manually keeps it on rank-up (the ceremony offers a one-tap switch).

### §3.5 Milestones, titles and the rank-up ceremony

**§3.5.1 Milestones** (one-time; cosmetic rewards, never cash, old 04 §3.3):

| Milestone id | Condition (checked by the named event) | Reward | Wire | Moment (17) |
|---|---|---|---|---|
| `M_FIRST_DOLLAR` | first business income posting (09) | "First Dollar" framed bill decor | no | none |
| `M_FIRST_PROFIT_TRADE` | first closed trade with positive realized P&L (05) | shareable trade receipt card | no | none |
| `M_THREE_BUSINESSES` | owns 3 businesses at once | business card design | no | none |
| `M_100K` | rank-basis NW ≥ $100k real | watch box decor (+1 WATCH_SLOT) | no | none |
| `M_MILLIONAIRE` | ≥ $1M real | champagne decor; title "Millionaire" | yes | `milestone_major` (6 s) |
| `M_FIRST_PROPERTY` | first property acquired (10) | house keys animation, map pin | no | none |
| `M_FIRST_IPO` | first IPO of a controlled company (09) | bell-ringing replay clip | yes | `milestone_major` |
| `M_FIRST_REPEL` | first hostile session disconnected while FLAGGED, or first failed op against you detected (12) | "Firewall" badge | no | none |
| `M_IRON_NERVES` | positive week (7 game days) that contains a major crisis onset (16) | title "Iron Nerves" | no | none |
| `M_FIRST_COURT_WIN` | first case won (13) | gavel decor | no | none |
| `M_BILLIONAIRE` | ≥ $1B real | title "Billionaire"; Gilt cover candidate priority | yes | `milestone_major` |
| `M_FIRST_HOUSE` | House founded | crest reveal | yes (if showHouse) | `milestone_major` |
| `M_FIRST_GENERATION` | first succession completed | "Second Generation" title | yes (if showHouse) | `milestone_major` |

**§3.5.2 Title PP.** A title's PP is `ppFresh` during the chapter it was earned and the next chapter, then `ppHeritage` forever (so an old champion keeps some shine in a world that never resets). Default values:

| Title class | ppFresh | ppHeritage |
|---|---|---|
| Chapter champion, global board (15) | 500 | 125 |
| Chapter champion, country board | 150 | 40 |
| Season Finals winner (15) | 800 | 200 |
| Ladder top 10 (global) | 100 | 25 |
| Ladder top 100 (global) | 30 | 8 |
| League week winner (15) | 10 | 0 |
| Weekly AI tournament division winner (15) | 20 | 5 |
| Gilt List cover star | 100 | 25 |
| Milestone titles (Millionaire, Billionaire, Iron Nerves…) | 5 | 5 |
| Set titles (§3.9) | 0 (the set bonus already pays) | 0 |
| Experience titles ("Orbital") | 50 | 50 |
| Philanthropy titles ("Patron of the Arts") | 0 (Reputation path) | 0 |

Only the character's **titles from the current persona** count fully; House titles from earlier generations count at `PARAM.house_title_pp_share = 0.5` (§3.15.5).

**§3.5.3 Rank-up ceremony.** 4–6 s moment (17 `rank_up`), skippable after 1 s. It is held while the player has an order pending in the current tick or has acted in the last `PARAM.ceremony_idle_real_s = 10` real seconds; it plays on the next idle moment or at the next login. It ends with three unlock cards (business tier, license, home class) and one suggested next step (17). `pendingCeremony` clears when shown.

### §3.6 Lifestyle: rules common to all items

**§3.6.1 Prices and inflation.** Catalog prices are real dollars. The nominal price at tick t is `listPriceReal × MSI(t) × WLI(t)`, where `WLI` is the world lifestyle price index (03 Stabilizer lever L2, "lifestyle and NPC-service price index", 03 §3.7.4, starting 1.0, clamped [0.90, 1.25]). Staff lines scale the same way.

**§3.6.2 Buying MASS items (Boutique).** NPC brand boutiques sell MASS items in unlimited quantity at the nominal list price. Validation: `rank ≥ minRank`, cash available (restricted cash allowed, §3.13.5), storage available or explicit "send to paid storage". Effect, all in P12 queued for P13:
1. Posting `LIFE_BOUTIQUE_PURCHASE` (SINK, amount = price): the cash leaves the player economy to the NPC luxury sector (03 boundary rule, §3.17).
2. Asset recognition `LIFE_ITEM_RECOGNIZE` (REVALUE) at `value0 = price × (1 − purchaseHit)`.
3. `OwnedItem` created with `condition = 1`, `displayed = true` if storage allows, else `false`.
4. Velour Maison / Luxury revenue driver input: 09/05 read the trailing 4-week total of `LIFE_BOUTIQUE_PURCHASE` (bible row 11: Velour revenue = 0.6·top-1% wealth growth + 0.4·total player Prestige spend; other Luxury names weight 0.2).
5. If `displayed && price/MSI ≥ PARAM.wire_purchase_threshold_real = $10,000,000 && showLifestyleOnWire`, emit a PUBLIC Wire item (15).

Built-to-order items (`buildRealDays > 0`) take payment on order and complete at `buildCompletesTick`; the item gives no PP until complete. Player yacht builders (09) can take the same orders; then payment is a TRANSFER to the builder company and the build time is the builder's.

**§3.6.3 LIMITED releases (drops).** Each LIMITED def is released by its NPC maker in a **drop** at the start of each chapter (and, for a new city opening, a one-off drop). Drop size `= round(editionSizeBase × max(1, (N_a / PARAM.drop_scale_na = 10,000))^0.5)` where `N_a` is the activity-weighted player count (15 §3.1). Allocation is not random (L5): purchase requests are collected during an allocation window of `PARAM.drop_window_ticks = 720` (one game day); at window close requests are served in order of (1) the requester's displayed PP in that category, highest first ("brand loyalty"), (2) earlier request tick, (3) lower `characterId` hash. Each character may hold at most `PARAM.drop_max_per_char = 1` unit of a given drop. Unsold units stay on sale at list price until the next drop. Secondary trading happens only at the auction house (06). Each unit gets a serial "N of S".

**§3.6.4 UNIQUE items.** Exist once in the world (22 catalog, plus new ones created with each new city by 10 and 22's generator). They trade only through the auction house (06 owns the English auction with anti-snipe +12 ticks if a bid lands in the last 12; seller fee 12%, buyer premium 15%). Estate sales (dormant 90 days, 15 §3.13) and concession lots appear as special lot types. Summit Society members may bid from `PARAM.summit_early_bid_ticks = 30` ticks (one game hour) before public bidding opens.

**§3.6.5 Display.** An item is `displayed` only if it occupies storage in a home the character owns or leases as a residence (§3.6.6) and the character has not toggled it private. Only displayed items count PP, appear on the Estate and profile, and can post to the Wire. Undisplayed items still count toward net worth and still incur upkeep. A character may toggle display any time; PP recomputes at the next day close. This is the "quiet money" switch (old 04 §7.8).

**§3.6.6 Storage.** Capacity comes from homes (`storageProvided`, catalog §3.7) and from paid third-party storage, which costs `PARAM.paid_storage_rate = 1%` of item value per game year (sink `LIFE_STORAGE`) and never allows display. Yachts need a BERTH (owned marina berth via a property in a harbor district, or rented at $30,000 real per game year), jets a HANGAR slot (estate or island, or rented at $120,000 real per game year). Removing a home (sale) moves its items to paid storage automatically at that tick.

**§3.6.7 Player-made editions.** A player-owned luxury business (watch manufacture, fashion house, car maker, yacht builder; 09) can publish a LIMITED edition: name (moderated), category, edition size (2–500), unit price (≥ 09's unit cost), and a design from 22's parts library. Buyers pay the maker company (TRANSFER `LIFE_EDITION_SALE`), the maker pays production cost to NPC suppliers (09). The edition is a LIMITED item with `makerCmpId`, its own collectible sub-index (06) seeded from the maker's sell-through and brand Prestige, and the normal PP formula. Anti-funnel: a maker cannot sell an edition unit above `PARAM.edition_max_price_multiple = 3×` its production cost to a linked account (15 §3.12), and edition sales to the same buyer are capped at 3 units per edition.

**§3.6.8 Valuation (marks for net worth).**
- MASS: `value(t) = pricePaid × (1 − purchaseHit) × (1 − depreciationPerGameYear)^(ageGameYears) × (0.5 + 0.5·condition)`.
- LIMITED / UNIQUE: `value(t) = 06.collectibleFairValue(itemId, t) × (0.5 + 0.5·condition)` (06 owns the index and the fair-value rule).
- HOME: the property's fair value (10).
- CONSUMED: no asset.

**§3.6.9 Upkeep, staff and condition.** At each day close, for each owned item: `upkeep = value(t) × upkeepPerGameYear / 364` and, for homes and craft with staff, `staff = staffRealPerGameYear × MSI × WLI / 364`; post `LIFE_UPKEEP` and `LIFE_STAFF` (SINK). If cash (unrestricted or restricted) cannot cover it, nothing is posted for that item, `upkeepArrearsGameDays += 1`, and `condition -= PARAM.condition_decay_unpaid = 0.02` (floor 0). Paid days reset arrears to 0. No debt is created and nothing is repossessed by 14 (loans against items are 07's). Upkeep includes baseline NPC insurance (08 `INS_LIFESTYLE_BASIC`: theft and damage at value, deductible 10%); a player may instead insure with a player insurer (08) and get the baseline portion refunded from upkeep. **Restoration:** `life.item.restore` pays `(1 − condition) × value × 0.5` (sink `LIFE_RESTORATION`) and sets condition to 1.0, completing after `PARAM.restore_game_days = 3`.

**§3.6.10 Selling.** MASS items can be sold back to NPC dealers at `value(t) × (1 − PARAM.dealer_buyback_haircut = 0.15)` (`LIFE_NPC_BUYBACK`, FAUCET; the haircut is the difference already lost). LIMITED and UNIQUE items are sold through the auction house (06) or by contract (15). Any item can be gifted only through a contract (15) and the gift is subject to the 2% P2P tax and the anti-funnel rules. Selling a displayed item removes its PP at the next day close.

**§3.6.11 Collateral (07 consumes).** Advance rates: homes at 10's mortgage LTVs; UNIQUE 50%; LIMITED 30%; MASS 0% (old 04 §7.6). A pledged item cannot be sold, gifted or used in a succession heirloom swap until released. A crash in a collectible index can margin-call art (07 rules).

**§3.6.12 Theft.** E5 physical intrusions (12) target displayed PHYSICAL items; 14 provides the target list `life.physicalTargets(chr)` = displayed LIMITED/UNIQUE items with value, plus `securityWingGrade`. A stolen item leaves the owner (`provenanceFlag = 'STOLEN'`), insurance pays per 08, and the item can only be fenced via the Back Room at 40% (12).

### §3.7 The lifestyle catalog

Every launch item, with the numbers from old 04 §6 kept. Prices in real dollars at MSI 1.0. *Hit* = purchase hit (MASS) or "auction" (06 fees apply). *Dep* = MASS depreciation per game year after purchase. *Upkeep* = % of current value per game year (insurance, storage, maintenance, fuel). *PP* = base Prestige at condition 1, age factor 1 (formula §3.8). Brands are fictional (22 owns names). 22 copies this table as the content catalog; this table owns the numbers.

**§3.7.1 Homes** (homes are properties in 10; prices typical for the named Port Avalon district, other districts and cities vary by 10's model; purchase hit = 10's 3% transaction + 1% stamp duty; homes use rarity multiplier 1 except the island, which resolves the old 04 table where the mansion and estate were listed Limited but priced at rarity 1).

| defId | Item | Class | Price | Upkeep | Staff / game yr | PP | Rank | Storage provided | Hosting | Max security grade |
|---|---|---|---|---|---|---|---|---|---|---|
| `lid_rented_room` | Rented room (start) | — | rent = market rent of its ROOM unit, about $5.40 / game day at launch (10 §3.14; ruling in 24) | — | — | 0 | R0 | none (1 WATCH_SLOT, 2 WARDROBE) | none | 0 |
| `lid_studio_riverside` | Studio, Riverside Lofts | MASS | $90,000 | 1.5% + 10's property tax | 0 | 9 | R1 | 1 CAR, 50 CELLAR, 2 WATCH, 4 WARDROBE, 2 ART | none | 0 |
| `lid_loft_riverside` | Loft apartment, Riverside Lofts | MASS | $450,000 | 1.5% + tax | 0 | 21 | R2 | 2 CAR, 150 CELLAR, 6 WATCH, 8 WARDROBE, 4 ART | none | 1 |
| `lid_penthouse_glasshill` | Penthouse, Glasshill | MASS | $6,000,000 | 2% + tax | $120,000 | 77 | R3 | 4 CAR, 400 CELLAR, 12 WATCH, 12 WARDROBE, 6 ART | dinner | 2 |
| `lid_mansion_summit` | Mansion, Summit Estates | LIMITED | $45,000,000 | 3% + tax | $900,000 | 212 | R4 | 12 CAR, 2,000 CELLAR, 30 WATCH, 20 WARDROBE, 20 ART, helipad | dinner, party | 3 |
| `lid_estate_summit` | Estate with grounds, Summit Estates | LIMITED | $350,000,000 | 3.5% + tax | $6,000,000 | 592 | R5 | 40 CAR, 6,000 CELLAR, 60 WATCH, 40 WARDROBE, 60 ART, 1 HANGAR | dinner, party, gala | 4 |
| `lid_island_serena` | Private island, Isla Serena (one per island lot) | UNIQUE | auction, reserve $1.5B | 4% + tax | $12,000,000 | 4,899 | R6 | unlimited CAR/CELLAR/WATCH/WARDROBE, 120 ART, 4 BERTH, 4 HANGAR | all | 5 |
| `lid_skyline_tower_penthouse` | Skyline tower crown residence (one per city CBD) | UNIQUE | auction, reserve $800M | 3% + tax | $8,000,000 | 3,578 | R6 | 60 CAR, 8,000 CELLAR, 100 WATCH, 60 WARDROBE, 100 ART, 2 HANGAR (roof) | all | 5 |

Rented room rent is charged at day close only while unrestricted cash ≥ `PARAM.rent_min_cash_real = $1,000`; below that it is waived (no death spiral at the floor). Renting a home from another owner (10 lease) also makes it a residence with the same storage.

**§3.7.2 Cars**

| defId | Item | Class | Price | Hit | Dep | Upkeep | PP | Rank | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `lid_used_hatchback` | Used hatchback | MASS | $8,000 | 25% | 15% | 8% | 3 | R0 | |
| `lid_corvo_esport` | Corvo E-Sport (Corvo is a listed stock, 22) | MASS | $65,000 | 20% | 12% | 5% | 8 | R1 | |
| `lid_halden_gt` | Halden GT | MASS | $240,000 | 18% | 10% | 5% | 15 | R2 | |
| `lid_marchetti_furia` | Marchetti Furia | MASS | $1,200,000 | 15% | 10% | 6% | 35 | R3 | |
| `lid_marchetti_furia_ultima` | Marchetti Furia Ultima | LIMITED | $4,500,000 | auction | 0 | 4% | 134 | R3 | editionSizeBase 99 per drop |
| `lid_marchetti_vetro` | Marchetti 250 "Vetro" (classic) | UNIQUE | auction ~$30M–$70M | auction | 0 | 2% | ~849 at $45M | R4 | 12 exist at launch |
| `lid_racing_seat` | Racing team seat (one season of a fictional GT series) | CONSUMED | $40,000,000 | 100% | — | — | 200 burst | R4 | title "Paddock" |

**§3.7.3 Watches**

| defId | Item | Class | Price | Hit | Dep | Upkeep | PP | Rank |
|---|---|---|---|---|---|---|---|---|
| `lid_kessler_field` | Kessler Field (starter gift, 18 minute 5) | MASS | $1,200 | 30% | 5% | 1% | 1 | R0 |
| `lid_kessler_diver` | Kessler Diver | MASS | $9,500 | 25% | 5% | 1% | 3 | R1 |
| `lid_vael_perpetual` | Vael Perpetual | MASS | $85,000 | 20% | 4% | 1% | 9 | R2 |
| `lid_vael_grand_complication` | Vael Grand Complication (numbered) | LIMITED | $750,000 | auction | 0 | 1% | 55 | R3 (editionSizeBase 50) |
| `lid_oriel_one_of_12` | Oriel "One of 12" Tourbillon | LIMITED | $6,000,000 | auction | 0 | 1% | 155 | R4 (editionSizeBase 12) |
| `lid_heritage_watch` | Heritage piece (historic) | UNIQUE | auction ~$15M–$60M | auction | 0 | 0.5% | ~693 at $30M | R4 (20 exist at launch) |
| `lid_player_edition_watch` | Player-made editions (§3.6.7) | LIMITED | maker sets | maker margin | 0 | 1% | formula | maker's choice |

The starter Kessler Field is a gift: `ACCT_STARTER_GIFT` (FAUCET, value recognized at $840 = price × (1−hit)); it cannot be sold for `PARAM.starter_gift_lock_real_days = 7` real days (anti-farm).

**§3.7.4 Yachts and jets**

| defId | Item | Class | Price | Hit | Dep | Upkeep | Staff / game yr | PP | Rank | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `lid_aurel_40` | Aurel 40 (12 m) | MASS | $900,000 | 20% | 8% | 10% | 0 | 30 | R3 | needs 1 BERTH |
| `lid_aurel_80` | Aurel 80 (24 m) | MASS | $12,000,000 | 15% | 8% | 10% | $600,000 | 110 | R4 | BERTH |
| `lid_superyacht_110` | Superyacht (110 m), built to order | MASS | $350,000,000 | 12% | 6% | 10% | $8,000,000 | 592 | R5 | 10 real days to build; player builders may build |
| `lid_gigayacht_160` | Gigayacht (160 m) | LIMITED | $1,200,000,000 | 10% | 0 | 9% | $20,000,000 | 2,191 | R5 | perChapterBuildCap 1 per world; build 20 real days |
| `lid_stratos_light` | Stratos Light jet | MASS | $8,000,000 | 15% | 8% | 8% | $400,000 | 89 | R3 | HANGAR; fly-in home bloc (§3.12.5) |
| `lid_stratos_longrange` | Stratos Long-Range jet | MASS | $65,000,000 | 12% | 8% | 8% | $2,000,000 | 255 | R4 | HANGAR; fly-in any bloc |

The gigayacht is LIMITED with a purchase hit because it is built new; its value afterwards follows the CI_YACHT index (06).

**§3.7.5 Art, wine and fashion**

| defId | Item | Class | Price | Hit | Dep | Upkeep | PP | Rank |
|---|---|---|---|---|---|---|---|---|
| `lid_emerging_print` | Emerging artist print | MASS | $5,000 | 40% | 10% | 0.5% | 2 | R1 |
| `lid_gallery_piece` | Gallery piece (numbered, living artist) | LIMITED | $250k–$5M (typ. $1M) | auction | 0 | 1% | ~63 at $1M | R2 |
| `lid_masterwork` | Masterwork | UNIQUE | auction $20M–$400M (typ. $120M) | auction | 0 | 1% | ~1,386 at $120M | R4 (60 at launch) |
| `lid_wine_case_everyday` | Wine case (12 bottles, everyday fine) | MASS | $2,000 | 30% | 0 | 2% | 1 | R1 (12 CELLAR) |
| `lid_wine_rare_vintage` | Rare vintage case | LIMITED | $250,000 | auction | 0 | 1.5% | 32 | R3 (12 CELLAR) |
| `lid_wine_legendary_lot` | Legendary cellar lot (100 cases, one estate) | LIMITED | $5,000,000 | auction | 0 | 1.5% | 141 | R4 (1,200 CELLAR) |
| `lid_velour_wardrobe` | Velour Maison wardrobe | MASS | $3,000 | 60% | 60% | 0 | 2 | R1 (1 WARDROBE) |
| `lid_velour_atelier` | Velour Maison atelier wardrobe | MASS | $40,000 | 60% | 60% | 0 | 6 | R2 (1 WARDROBE) |
| `lid_couture_season` | Couture season | MASS | $400,000 | 70% | 60% | 0 | 20 | R3 (2 WARDROBE) |

Gallery pieces are sold by NPC galleries in drops like other LIMITED items; price within the band is set by the piece's artist tier (22).

**§3.7.6 Experiences, philanthropy and trophies** (experiences and donations are 100% sinks; experiences give a PP burst for `PARAM.experience_burst_game_days = 60` game days, about 2.5 real days, matching the old 04 intent of "one game month ≈ 2.5 real days"; philanthropy gives Reputation, never PP).

| defId | Item | Class | Price | Effect | Rank |
|---|---|---|---|---|---|
| `lid_gala_table` | Gala table (charity gala in your city) | CONSUMED | $250,000 | +16 PP burst, Rep +1 (philanthropy kind), a seat at that city's next Gala (counts as attending a GALA event for networking, §3.12.2) | R3 |
| `lid_private_concert` | Private concert at your home | CONSUMED | $5,000,000 | +71 PP burst, auto-hosts a PARTY at no extra cost | R4 |
| `lid_orbital_flight` | Orbital flight | CONSUMED | $250,000,000 | +500 PP burst, unique Wire cover, title "Orbital" | R5 |
| `lid_hospital_wing` | Hospital wing (named) | CONSUMED | $50,000,000 | Rep +8, name on the City map (10 plaque), Legacy `NAMED_WING` | R4 |
| `lid_museum_wing` | Museum wing (named) | CONSUMED | $500,000,000 | Rep +15, Legacy `NAMED_WING`, enables art loans for the Patron set (§3.9) | R5 |
| `lid_scholarship_fund` | Scholarship fund (recurring) | CONSUMED | $10,000,000 per game year, billed per game quarter | Rep +3 per game year, +1 AI researcher candidate in 11's hiring pool while funded | R4 |
| `lid_public_space` | Sponsor a public park or plaza (one chapter, 10 places it) | CONSUMED | $5,000,000 per chapter | Rep +2, Legacy `PUBLIC_SPACE`, name on a public space (moderated) | R3 |
| `lid_sports_franchise` | Sports franchise (09's B6 business, one per city) | UNIQUE | auction ~$3B | 6,928 PP; its economics are 09's | R5 |

**§3.7.7 Content count.** 46 catalog defs above plus player editions. 22 must list: brand pages (10 brands), artist roster for gallery pieces (40 artists in 4 tiers), 12 Vetro classics, 20 heritage watches, 60 masterworks, island lots (6 at launch on Isla Serena, +1 per new city cluster), 15 skyline crown residences (one per city), 15 sports franchises, decor items for milestones, crest parts (24 shields, 60 charges, 12 tinctures).

### §3.8 Prestige

**§3.8.1 Per-item PP** (old 04 §7.2, unchanged except the home rarity rule):

```
PP_item = round( sqrt(pricePaidReal / 1,000) × rarityMult × condition × ageFactor )
rarityMult = MASS 1 · LIMITED 2 · UNIQUE 4 ; HOME category: 1, except UNIQUE homes 4
ageFactor:
  MASS (incl. fashion):      1.0 → 0.5 linearly over 1 game year from acquiredTick, then 0.5
  LIMITED / UNIQUE:          1.0 → 1.25 linearly over 2 game years from heritageStartTick, then 1.25
  HOME:                      1.0 always
pricePaidReal for UNIQUE/LIMITED bought at auction = hammer price / MSI at that tick
pricePaidReal for gifts and inheritances = fair value at transfer / MSI (heirlooms keep the original)
Only displayed items count.
```

**§3.8.2 Character Prestige** (computed at each day close, P12):

```
for each category c (except EXPERIENCE, PHILANTHROPY):
   sort displayed items of c by PP_item descending: p1 ≥ p2 ≥ …
   PP_c = Σ_k p_k · 0.5^(k−1)
setBonus = Σ_{completed sets s} 0.2 · Σ_{items i used to satisfy s} PP_item(i)   (an item counts in at most one set)
titlesPP = Σ_titles (fresh ? ppFresh : ppHeritage) × (current persona ? 1 : PARAM.house_title_pp_share)
burstPP  = Σ_active bursts pp
Prestige = round( Σ_c PP_c + setBonus + titlesPP + burstPP )
```

Benchmarks (balance targets for 20, from old 04): new player ~1, R2 ~40, R3 ~250, R4 ~1,000, R5 ~5,000, R6 15,000+.

**§3.8.3 Uses of Prestige** (all small and capped; owners named):
- Heat: `heatBonus = clamp(0.02·(PP − 2000)/1000, 0, 0.12)` multiplies **exposure only** in 12 (12 §3.1 formula, bible row 4).
- Influence reach on the Wire (15): `reachWeight = min(2, 1 + 0.25·log10(1 + PP))`.
- Talent (09, 11): `+1` candidate per hiring pool per 1,000 PP, capped `+3`; at R5 or above researchers get `+10` loyalty (12 §3 loyalty formula).
- Club eligibility (§3.12.1), Gilt List "Most Flamboyant", Prestige board (15).
- Revenue driver for Velour Maison and Luxury (09/05; bible row 11).
- Tax-audit odds (13 owns `p_audit`, which reads lifestyle spend, not PP).

### §3.9 Collections and sets

A completed set gives +20% PP on the items used and a title. Launch sets (old 04 §5.4 plus four new):

| setId | Name | Requirement | Title |
|---|---|---|---|
| `SET_HARBOR_WEEKEND` | Harbor Weekend | a displayed YACHT with pricePaidReal ≥ $12M + an owned marina berth property in an Old Harbor-tagged district + a Halden GT | Commodore |
| `SET_COMPLICATION` | The Complication | 3 of {Vael Grand Complication, Oriel One of 12, heritage watch} | Horologist |
| `SET_VETRO_TRILOGY` | Vetro Trilogy | 3 Marchetti classics (Vetro defs) | Collector |
| `SET_PATRON` | Patron | a museum wing donated + 3 masterworks on loan to it (a loan keeps ownership and display PP, the item shows in the museum) | Patron of the Arts |
| `SET_FIVE_CAPITALS` | Five Capitals | homes (owned or leased residences) in all 5 blocs | Citizen of the World |
| `SET_CELLAR_MASTER` | Cellar Master | 1 legendary cellar lot + 5 rare vintage cases | Sommelier |
| `SET_HANGAR_AND_HARBOR` | Hangar and Harbor | a long-range jet + a yacht ≥ $12M + an estate or island | Jet Set |
| `SET_ATELIER` | Atelier Patron | 3 player-made editions from 3 different maker companies, none controlled by you | Connoisseur |
| `SET_FIRST_STEPS` | First Steps | Kessler Field + used hatchback + emerging print (a beginner set) | Starter |

### §3.10 Reputation

**§3.10.1 Scale and application.** `value ∈ [0, 100]`, start 50. Every change is an event with a public line (profile record). Gains and losses scale with the current value:

```
positive Δ:  Δ_eff = Δ × (100 − R) / 50
negative Δ:  Δ_eff = Δ × (0.5 + R / 100)
R ← clamp(R + Δ_eff, 0, 100)
```

So a clean 90 rises slowly and falls hard; a 10 can climb.

**§3.10.2 Event table** (14 owns the numbers; the triggering modules emit the events):

| Kind | Trigger (module) | Δ | Cap |
|---|---|---|---|
| `CONTRACT_HONORED` | contract completed to term, value ≥ $10k real, unlinked counterparty (15) | +0.5 | +3 per real week |
| `CONTRACT_DEFAULT` | engine-verified breach or default by this party (15) | −5; −10 if value ≥ $1M real | — |
| `FILING_ON_TIME` | required filing made on time (15) | +0.1 | +1 per real week |
| `FILING_LATE` | required filing late (15) | −2 | — |
| `FILING_FALSE` | proven false filing (13) | −5 (plus the conviction) | — |
| `CONVICTION` | verdict (13), by severity | S1 −10, S2 −12, S3 −15, S4 −20, S5 −25, S6 −30 (old 03 §9.6 "−10 to −30") | — |
| `CIVIL_LOSS` | lost a civil case as defendant (13) | −3 | — |
| `COURT_WIN_VICTIM` | won a case as victim (13) | +3 | — |
| `PHILANTHROPY` | donation or philanthropic item | item's `reputationGain`, or for `life.donate`: `3 × log10(amountReal / $10,000)` | `PARAM.rep_philanthropy_chapter_cap = 20` per chapter |
| `AUDIT_CLEAN` | clean tax audit (13) | +2 | — |
| `TIP_REPORTED` | reported a NON-PUBLIC tip instead of trading (16, 13) | +2 | +4 per real week |
| `CLEAN_LAB_CHAPTER` | chapter end, ≥ 1 deployed model, no AI governance incident and no conviction (11, 13) | +2 | once per chapter |
| `FRESH_START` | §3.13 | −10 | — |
| `HOSTED_EVENT_ATTENDED` | attended an event whose host has R ≥ 50, unlinked, account ≥ 7 real days old | +1 | +2 per real week |
| `MALICIOUS_PROSECUTION` | filer lost and the court flagged the suit malicious (13) | −5 | — |
| `FUND_GATE_ABUSE` | fund manager sanctioned for gate or mandate abuse (08, 13) | −8 | — |
| `RUG_PULL` | proven rug pull (13, S6) | −30 extra | — |
| `DRIFT` | R < 50 and no negative event in the last real week | +0.5 per real week | never above 50 by drift |
| `SUCCESSION_RESET` | §3.15.5 | `R' = 50 + f·(R − 50)` | once per succession |

**§3.10.3 What Reputation does** (bible row 5: never verdicts, fines or legal fees):
- Insurance premiums (08 reads it).
- Pre-trial asset freezes (13 reads it).
- NPC bank credit pricing (07): spread adjustment `−(R − 50) × 2 bps`, so ±100 bps at the extremes.
- Staff loyalty `+10` when the employer's R ≥ 60 (12 loyalty formula).
- Club eligibility (§3.12.1) and hosting bumps.
- Shown to counterparties at contract signing (15 §3.6.7) with the full public history.
- Gilt List "Most Generous" uses real philanthropy amounts, not Reputation.

### §3.11 Notoriety

**§3.11.1 Changes:**

| Reason | Δ |
|---|---|
| `OP_SUCCESS`: a successful op (12) against an unlinked, non-rookie, non-Penny-league victim | `clamp(2 · log10(1 + lootValueReal / $10,000), 0.5, 8)` |
| `MOST_WANTED`: in the public top 10 of Most Wanted (15) at a real-day boundary | +1 per real day |
| `DECAY`: no successful op in the last real week | −2 per real week |
| `CONVICTION_CONVERT`: any criminal conviction (13) | `N ← 0.5·N`; the removed half also applies an extra Reputation event `−0.2 × removed` (old 04: "convictions decay it into plain bad Reputation") |
| `SUCCESSION` | `N ← 0.25·N` |

**§3.11.2 Uses.** The Back Room (N ≥ 50, §3.12.1), opt-in public Wanted card and Most Wanted listing (15), and as an input to 12's NPC crew relations (12 owns any effect). Notoriety never changes breach, detection, verdict, fine or price.

### §3.12 Benefits of spending (each small, capped, never a cash faucet)

**§3.12.1 Clubs** (old 04 §7.3; dues are sinks `LIFE_CLUB_DUES`, billed per game quarter in advance at join and then every 91 game days):

| Club | Needs | Dues / game yr (real) | Benefits | Public |
|---|---|---|---|---|
| Harbor Club | PP ≥ 250 and R ≥ 40 | $150,000 | `B_DEALROOM_EARLY`: private deal-room listings (06/09 private markets) visible 720 ticks before the public; a members' channel (15) | yes |
| Glasshill Circle | PP ≥ 1,000 and R ≥ 50 | $2,000,000 | `B_GALA_SEAT`: a seat at the quarterly central-bank Gala of the member's home bloc (16 schedules it the game day before each policy meeting of that bloc's central bank, 04). For the 7 game days after it, the member receives the "Circle whispers" rumor stream, whose sources have hidden accuracy `U(0.45, 0.75)` instead of the public `U(0.40, 0.70)` (16 §3.6) | yes |
| Summit Society | PP ≥ 5,000 and R ≥ 60 | $25,000,000 | `B_EARLY_BID`: bid on UNIQUE lots 30 ticks early; `B_BOARD_INVITE`: at most one invitation per game quarter to an independent director seat on an NPC listed company in an accessible city (09 owns the seat: a director fee, a vote, and insider status with trading blackouts enforced by 13) | yes |
| The Back Room | Notoriety ≥ 50 (any PP) | $1,000,000 | `B_INFORMANTS`, `B_FENCE` (12 E7 and fencing) | never shown |

Eligibility is checked at each billing date. If no longer eligible, the membership enters `GRACE` for one game quarter, then `LAPSED` if still ineligible. A criminal conviction of S4 or worse suspends Harbor, Glasshill and Summit memberships immediately (no refund). The harness gate (20) checks that no club benefit gives a guaranteed profit.

**§3.12.2 Hosting** (old 04 §7.4):

| Kind | Capacity | Cost (real, sink `LIFE_HOSTING`) | Host PP burst | Needs a home that hosts |
|---|---|---|---|---|
| DINNER | 8 | $50,000 | 5 | penthouse or better |
| PARTY | 30 | $500,000 | 20 | mansion or better |
| GALA | 100 | $5,000,000 | 70 | estate, island or skyline residence |

Rules: start tick between 30 ticks and 72 game days (3 real days) ahead; duration 720 ticks (one game day). A host may run one event per `PARAM.hosting_cooldown_real_hours = 24` real hours. Invitations go to any player who has not blocked the host. During the window: a temporary chat channel (15) exists; contracts registered between two attendees pay no registration fee (the 2% P2P tax still applies, 15 §3.6.8); each attendee who is unlinked to the host (15 §3.12) and whose account is ≥ 7 real days old gets `HOSTED_EVENT_ATTENDED` if the host's R ≥ 50; the host's burst lasts 60 game days; the Wire posts PARTY and GALA events if the host consents. Cancelling refunds 50%.

**§3.12.3 Influence reach.** §3.8.3 `reachWeight` scales how widely a player's Wire statement is shown (15 §3.10) and, through 05's belief model, how much it nudges sentiment. Lying is still manipulation (13).

**§3.12.4 Talent.** §3.8.3.

**§3.12.5 Jets: fly-in.** Opening a business or buying a property in another bloc normally waits `PARAM.cross_bloc_settle_delay_ticks = 720` ticks (1 game day; owned by 10). Owning a light jet removes the delay within the home bloc's other cities (where 10 also applies a within-bloc delay of 0.5 game day); a long-range jet removes it for every bloc.

**§3.12.6 Chief of Staff** (mansion or better). Queue up to `PARAM.cos_queue_max = 3` intents of kinds `biz.upgrade`, `mkt.order.place` (limit only), `prop.upkeep.pay`, `biz.manager.hire`. They are submitted automatically at the next opening auction tick (t = 60) of the next trading day if the character is offline then, each through normal validation (P1). Failed validations are reported in While You Were Away. Convenience only: offline caps (09) are unchanged.

**§3.12.7 Collateral.** §3.6.11.

**§3.12.8 Heat.** §3.8.3; 12 applies it.

**§3.12.9 Physical security wing** (12 reads `physicalSecurityGrade`; defends only E5 physical ops, never cyber):

| Grade | Install (real, sink `LIFE_SECURITY`) | Upkeep / game yr | Minimum home |
|---|---|---|---|
| 0 | — | — | any |
| 1 | $100,000 | 10% of install | loft |
| 2 | $500,000 | 10% | penthouse |
| 3 | $2,000,000 | 10% | mansion |
| 4 | $10,000,000 | 10% | estate |
| 5 | $50,000,000 | 10% | island or skyline residence |

The grade applies to the primary home and to items stored there; items in secondary homes use that home's own grade; paid storage has grade 3.

### §3.13 Fresh Start (personal insolvency and comeback)

Resolves old ROADMAP §2.6 and approved idea L13 "bankruptcy comeback". 07 owns liquidation mechanics; 13 owns judgment debts and the conflict floor. 14 owns eligibility, what is kept and the perk.

**§3.13.1 Triggers.** Voluntary when rank-basis NW < `PARAM.fresh_start_nw_line_real = $1,000`. Forced when equity < 0 after 07 has completed liquidation (the character is insolvent).

**§3.13.2 Procedure.** (1) 07 liquidates everything left (positions, businesses, properties, LIMITED/UNIQUE items at the 15% NPC haircut, models, compute and data) to pay creditors in 07's priority order. (2) Debts to NPC banks and NPC counterparties are discharged (SINK on the creditor side per 03). (3) Debts to players (judgments, restitution, contract loans) survive and move onto 13's garnishment plan (30% of daily income). (4) Debt owed to the Clearing House (07 CCP) survives. (5) Grant `PARAM.fresh_start_cash_real = $5,000` × MSI as restricted cash (`ACCT_FRESH_START`, FAUCET).

**§3.13.3 What is kept.** Account, handle, profile, titles, milestones, Hall of Fame, rank, shells, cosmetics, licenses already paid for, researched algorithm nodes (11: knowledge, not assets), House and Legacy, Reputation and Notoriety (after the −10 Rep event). MASS lifestyle items are kept only if `value < $500` real (sentimental items) to avoid stripping a starter set.

**§3.13.4 The perk** (pick one, non-cash, value ≤ $2,500): `OLD_CONTACTS` one B1 business at 50% off (09); `LESSONS_LEARNED` 50% off trading fees for 7 real days (05); `SECOND_WIND` ×1.25 business income for 7 real days (09).

**§3.13.5 Anti-farming.**
1. At most one Fresh Start with cash and perk per `PARAM.fresh_start_cooldown_real_days = 56` real days (one chapter). A second bust inside that window gets only the conflict floor (13: $5,000 liquid plus one T1 business is a separate rule for crime and court; for own-trading busts inside the cooldown the character receives nothing more than rewarded-ad eligibility, 21).
2. Clawback lookback: P2P transfers, gifts and contract payments out in the `PARAM.fresh_start_clawback_real_days = 7` real days before declaring are reversed (15 executes).
3. The fastest-climber ladder's $100k floor (15 §3.4) stops bust-and-climb farming.
4. Leverage capped at 1× for 7 real days (07 reads `leverageCapUntilTick`); margin and NPC loans blocked for 14 real days (`creditBlockUntilTick`).
5. Reputation −10.
6. Restricted cash (`RestrictedCashLot`, FIFO) for 72 real hours: cannot pay for ops (12), insider actions, margin, derivatives or P2P transfers (ROADMAP C5 decided). Allowed: spot trades, B1–B2 businesses, upgrades, lifestyle.

**§3.13.6 Phoenix.** If after a Fresh Start the character's rank-basis NW reaches `priorPeakRankBasisNWReal` (and that peak was ≥ $100k real), award title "Phoenix" and a shareable comeback card (ROADMAP N7). The bust screen (17) is calm and shows the trade-journal summary (05) of what went wrong.

### §3.14 Legacy

Legacy is the permanent public record of what a player built (V3 Part 9). Points never decrease; convictions are public record lines, never subtractions. Legacy points (LgP):

| Kind | Points | Rule |
|---|---|---|
| `TENURE_CHAPTER` | 1 | per chapter with ≥ 10 active real days |
| `RANK_FIRST` | R1 1, R2 2, R3 5, R4 10, R5 25, R6 50 | first time each rank is reached |
| `COMPANY_FOUNDED` | 2 | a founded company (09) alive ≥ 1 chapter with revenue ≥ $1M real per game year |
| `COMPANY_IPO` | 10 | a founded company lists (09) |
| `NAMED_WING` | hospital 5, museum 20 | §3.7.6 |
| `PUBLIC_SPACE` | 3 | per sponsored chapter |
| `LADDER_TITLE` | global champion 10, country champion 5, global top 100 2 | chapter ladders (15) |
| `HALL_OF_FAME` | 5 | any Hall of Fame record (15 §3.5.6) |
| `GENERATION` | 25 | per completed succession (§3.15) |
| `PATRON_CHAPTER` | 3 | a full chapter in a city's Hall of Patrons (§3.16.4) |
| `FOUNDING_PLAQUE` | 0 | record only (LC01) |
| `GILT_COVER` | 5 | cover star |
| `FUND_TRACK_RECORD` | 5 | a managed fund (08) alive ≥ 1 game year with positive net return |
| `MODEL_LINEAGE` | 2 | a model (11) licensed to ≥ 5 unlinked licensees for ≥ 1 chapter |
| `PUBLISHED_RESEARCH` | 1 | opt-in published research (16 Research Desk) cited (followed) by ≥ 25 players; max 5 per chapter |

**Plaques.** A founding plaque on a business's first storefront is offered on purchase and shown only if the player publishes it (LC01). A Patron plaque goes on the city's Hall of Patrons Wall of Patrons permanently after a full chapter in a recognition position ("a tower that keeps your name after you leave the board", V3), opt-out hides it.

### §3.15 Houses and dynasty succession

**§3.15.1 Founding.** `acct.house.found` at R4 or above; fee `PARAM.house_founding_fee_real = $10,000,000` (sink `ACCT_HOUSE_FEE`); name moderated and unique ("House Varela"); crest from earned parts and owned cosmetic parts (21). One House per account, permanent; renaming costs the fee again and is allowed once per chapter.

**§3.15.2 What a House is.** An identity layer over the one character: crest on the profile, Estate gate, company buildings that the player chooses to brand (10), the generation list, House titles and record lines. It is not a separate balance sheet; no assets move to the House.

**§3.15.3 Heirlooms.** Up to 12 owned LIMITED or UNIQUE items can be designated heirlooms (`life.item.heirloom.set`, free, changeable once per chapter per item). An heirloom's `heritageStartTick` stays at the House's first acquisition through a succession, so its heritage age factor keeps growing across generations. Selling an heirloom removes the flag.

**§3.15.4 Succession ("Pass the Torch").** Requirements: a House; R4 or above; at most once per chapter; at least one chapter since founding or the last succession; none of: an open investigation or case involving the character as subject or defendant, Held, an unpaid judgment or garnishment, a conviction in the last 14 real days, a Fresh Start cooldown, an active hidden session the character planted (pull it first, 12), a probate already running. Steps:
1. `acct.house.succession.begin { heirPersonaName, heirTrait }`. The character enters PROBATE for `PARAM.probate_ticks = 17,280` (24 game days = one real day). During PROBATE: no outbound P2P transfers or gifts, no new contracts as payer, no Fresh Start, no handle change. Trading, businesses and defense continue.
2. At completion: `estateValueReal = rankBasisNW`. Inheritance tax, progressive on real value, brackets `DEFAULT (Mathis may override)` and a policy lever (16 `TAX_INHERITANCE` scales them ×[0.5, 1.5]):

| Band (real) | Rate |
|---|---|
| ≤ $100M | 0% |
| $100M – $1B | 10% |
| $1B – $10B | 20% |
| > $10B | 30% |

   Paid in cash (`ACCT_INHERITANCE_TAX`, SINK). If cash is short, the remainder becomes an installment plan: a loan from the home bloc's treasury (07, at that bloc's policy rate) repaid over one chapter; default on it is a normal loan default.
3. The character continues as the same entity (balance sheet, contracts, obligations, court history and repeat-offender counters all continue; nothing escapes). `personaName` and `personaGeneration` change. The previous persona becomes a `Generation` entry with its portraits.
4. Reputation `R' = 50 + f·(R − 50)` with `f = 0.5`, or `f = 0.8` if any conviction happened in the last chapter. Notoriety `× 0.25`.
5. Titles of the previous persona become House titles (shown "House Varela: Chapter 3 Champion") and count at 50% PP.
6. Heir trait (one, small, never cash), lasting one chapter: `BUILDER` −5% business upgrade costs (09); `QUANT_RAISED` −10% Research Desk and analyst upkeep (16/05); `DIPLOMAT` Reputation DRIFT doubles (+1/real week, still not above 50); `COLLECTOR` heirloom age factor cap 1.30 instead of 1.25; `STEWARD` −10% staff lines (§3.6.9); `SPARTAN` −10% lifestyle upkeep.
7. Legacy +25 (`GENERATION`), milestone `M_FIRST_GENERATION`, Wire item if `showHouse`.

**§3.15.5 No cross-account bequests.** `DEFAULT (Mathis may override)`: an estate can never pass to another account (it would be the ultimate funnel). Gifts between players go through contracts with the 2% tax and 15's anti-funnel caps.

**§3.15.6 Players do not age.** Characters have no age or mortality; succession is always voluntary. NPC dynasties age and succeed by 16 §3.4.

### §3.16 Status publications

**§3.16.1 Estate view and visiting.** The Home screen background renders `EstateRenderSpec` from the primary home and displayed items at the home city's time of day (17). Other players can visit read-only from the profile if `showEstate`; values are shown only if `showItemValues`. The spec is rebuilt at day close and on display changes, never per tick.

**§3.16.2 Profile card.** Handle, country flag, rank badge, chosen title, Prestige, Reputation meter, opt-in Notoriety, House crest and generation, top 3 displayed items, tenure ("in the world since day N"), chapters played, peak all-time rank, pinned receipts, follower count if allowed, verified record if published. A compact version appears wherever the name does (boards, Wire, docket, chat).

**§3.16.3 The Gilt List.** Published every game quarter (each 91st game day close) as a global edition and one per country board that exists (15 §3.2). Contents: the top 100 of the Richest board at that close (the data is already public on 15's board), with net worth shown only as the board's rounded bucket; estate illustrations only for those with `showEstate`; top 10 climbers by `ln(NW_end / max(NW_start, $100k))` over the quarter; "Most Flamboyant" top 10 by PP; "Most Generous" top 10 by real philanthropy this quarter; one **cover star**, chosen deterministically: the player with the highest `score = rankDeltaPercentile·0.4 + ppPercentile·0.3 + newMilestone·0.3` among those with `showEstate`, ties by higher NWI; nobody can be cover star twice in one chapter. The cover is a shareable card (17).

**§3.16.4 Hall of Patrons and crown parcels.** 10 owns the building and parcels; 14 supplies recognition: each chapter start, the top `PARAM.patrons_per_city = 12` players of each city board (home city) at the chapter-end snapshot fill that city's recognition positions for the whole chapter (LC10, frozen per chapter), shown with handle or "private" per `crownName`. An opted-out player's slot uses a neutral civic treatment that encodes nothing (LC10). After a full chapter, a Patron plaque is permanent (§3.14).

**§3.16.5 Verified track record.** Opt-in. The engine computes return, Sharpe, max drawdown and trade count over the chosen window from the character's own ledger (05 owns the math), lists asset classes traded but never instruments, positions or timing. A published record is re-verified at each day close and stamped "verified at day N". Unpublishing removes it from the profile immediately (screenshots cannot be retracted; the UI says so).

**§3.16.6 Chapter portraits.** At each chapter end, the current `EstateRenderSpec` is saved as a `ChapterPortrait` in the personal Hall of Fame (private unless `showChapterPortraits`).

### §3.17 Ledger reason codes owned by 14

The 03 boundary assumption: flows from a player-owned entity to the NPC sectors (`hh`, `frm`, NPC actors, `sys`) are SINK for the player economy, and flows from them into player entities are FAUCET (interface assumed: 03 classifies by reason code, which these codes follow).

| Code | Class | Use |
|---|---|---|
| `ACCT_ONBOARD_GRANT` | FAUCET | $250 paying LIC1 (once) |
| `ACCT_LICENSE_FEE` | SINK | license fees and renewals |
| `ACCT_HANDLE_FEE`, `ACCT_HOME_CITY_FEE`, `ACCT_HOUSE_FEE` | SINK | identity fees |
| `ACCT_BACKGROUND_DISCOUNT` | FAUCET | background tilt (≤ $600 once) |
| `ACCT_STARTER_GIFT` | FAUCET | Kessler Field ($840 value) |
| `ACCT_FRESH_START` | FAUCET | ≤ $5,000 real per character per 56 real days |
| `ACCT_INHERITANCE_TAX` | SINK | succession |
| `ACCT_DELETION_ESCHEAT` | SINK | residual cash of deleted accounts |
| `LIFE_BOUTIQUE_PURCHASE` | SINK | MASS and NPC-drop LIMITED purchases |
| `LIFE_ITEM_RECOGNIZE` | REVALUE | asset recognition on purchase |
| `LIFE_ITEM_MARK` | REVALUE | daily mark of items |
| `LIFE_EDITION_SALE` | TRANSFER | player-made edition sales |
| `LIFE_NPC_BUYBACK` | FAUCET | dealer buyback of MASS items |
| `LIFE_UPKEEP`, `LIFE_STAFF`, `LIFE_STORAGE`, `LIFE_RESTORATION`, `LIFE_SECURITY`, `LIFE_RENT` | SINK | running costs |
| `LIFE_CLUB_DUES`, `LIFE_HOSTING`, `LIFE_EXPERIENCE`, `LIFE_DONATION` | SINK | consumption |
| `LIFE_BERTH_RENT`, `LIFE_HANGAR_RENT` | SINK | rented slots (NPC); TRANSFER `LIFE_SLOT_RENT_P2P` when a player owns the marina or airfield (10) |

Sink sanity (from old 04 §6.7, a target band for 20): a median R4 Tycoon at $100M holds ~$71M of lifestyle at list (mostly the mansion, still in net worth), loses ~$6M to purchase hits and pays ~$4.3M per game year in upkeep and staff. If 20's harness shows lifestyle costs above `PARAM.lifestyle_cost_share_max = 25%` of an R4 player's income, lower upkeep first, never list prices.

---

## §4 Player intents

Envelope per 00 §5.5. All intents validate in P1 and apply in P12 unless stated; money postings commit in P13. Common validation for every intent here: actor is the character itself (no Mandate operator may submit `acct.*` or `life.*` intents except `life.item.upkeep.pay` and `life.hosting.rsvp`, which a Chief of Staff queue may hold), character not ANONYMIZED, account not SUSPENDED/BANNED, rate limit 20 intents per tick (00 §5.5). Held characters (13) may submit only `life.display.set`, `life.item.upkeep.pay`, `acct.profile.update` (cosmetic fields) and `life.hosting.rsvp` (decline only).

| Kind | Payload | Validation (beyond common) | Effect |
|---|---|---|---|
| `acct.register` | `{ authMethod, birthYear, countryClaim }` | GUEST; birthYear gives ≥ 16 | state REGISTERED; age band set; country flow (15 §3.2) |
| `acct.profile.update` | `{ avatar?, chosenTitleId?, pinnedReceiptIds?, displayCompanyName?, shellId? }` | title earned; receipts own; company controlled; shell earned or owned | profile updated next tick |
| `acct.handle.change` | `{ newHandle }` | §3.1.3 rules, once per chapter, not blocked | fee; old handle held 1 chapter |
| `acct.homeCity.change` | `{ cityId }` | city accessible by rank; once per chapter | fee; effective next day close |
| `acct.publication.set` | `Partial<PublicationConsent>` | — | applied next tick; public payloads rebuilt at next day close (crown name at chapter start) |
| `acct.license.buy` | `{ licenseId }` | rank gate; exam passed (LIC2–4); `law.licenseEligibility` true; cash ≥ fee (restricted cash not allowed) | fee posted; LicenseHolding ACTIVE |
| `acct.license.renew` | `{ licenseId }` | LAPSED or within 7 game days of due | fee; ACTIVE; renewal due +1 game year |
| `acct.exam.submit` | `{ examId, answers: number[] }` | not retaken within 1 game day | pass if ≥ threshold; `examPassedTick` |
| `acct.charter.apply` | `{ charterId, sponsorEntityId }` | rank gate (§3.2.2) | forwarded to 13 (`law.charter.apply`) |
| `acct.ceremony.ack` | `{ rank }` | pendingCeremony == rank | clears pending |
| `acct.freshStart.declare` | `{ perk }` | §3.13.1 voluntary trigger; not in PROBATE; not Held | §3.13.2 procedure starts next tick |
| `acct.freshStart.choosePerk` | `{ perk }` | forced trigger completed, perk not yet chosen, within 72 game days | perk applied |
| `acct.house.found` | `{ name, crest }` | R4+, no House, fee, name unique and moderated | House created; milestone |
| `acct.house.update` | `{ name?, crest?, motto? }` | rename once per chapter with fee; crest parts owned | updated |
| `acct.house.succession.begin` | `{ heirPersonaName, heirTrait }` | §3.15.4 requirements | PROBATE |
| `acct.house.succession.abort` | `{}` | PROBATE | ABORTED; no fee refund needed (none charged) |
| `acct.delete.request` | `{ confirmPhrase }` | phrase matches; not Held; no PROBATE | 21 privacy flow, then §3.1.7 |
| `acct.trackRecord.publish` | `{ window, publish: boolean }` | — | §3.16.5 |
| `life.item.buy` | `{ defId, homePropId?, toPaidStorage?: boolean }` | MASS or open LIMITED drop; rank ≥ minRank; storage or paid storage; cash | §3.6.2 or drop request queued (§3.6.3) |
| `life.item.order` | `{ defId, builderCmpId? }` | built-to-order def; perChapterBuildCap not reached | payment; build timer |
| `life.drop.request` | `{ defId, maxPrice }` | drop window open; ≤ 1 per drop; maxPrice ≥ list | request stored; allocation at window close |
| `life.item.sell` | `{ itemId, channel: 'DEALER' }` | MASS; not pledged; not stolen | §3.6.10 buyback |
| `life.item.consign` | `{ itemId, reserve }` | LIMITED/UNIQUE; CLEAN provenance; not pledged | 06 auction lot created |
| `life.display.set` | `{ itemId, displayed: boolean, homePropId? }` | storage in a residence for `true` | display updated; PP next day close |
| `life.item.move` | `{ itemId, toHomePropId | 'PAID_STORAGE' }` | capacity | moved; display re-evaluated |
| `life.item.restore` | `{ itemId }` | condition < 1; cash | restoration timer |
| `life.item.heirloom.set` | `{ itemId, heirloom: boolean }` | House; LIMITED/UNIQUE; ≤ 12; once per chapter per item | flag |
| `life.item.upkeep.pay` | `{ itemId | 'ALL' }` | cash | pays arrears for today (no back-pay of skipped days; condition lost stays lost) |
| `life.storage.rent` | `{ kind, units }` | — | paid storage capacity |
| `life.security.install` | `{ propId, grade }` | home allows grade | install fee; grade |
| `life.experience.buy` | `{ defId }` | CONSUMED experience; rank | sink; burst; title if any |
| `life.donate` | `{ amount, causeId }` | amount ≥ $10,000 real; cause from 22 list (12 causes); unrestricted cash | sink; Reputation |
| `life.philanthropy.buy` | `{ defId, nameText?, cityId? }` | rank; name moderated; one wing per hospital/museum building per city (10 provides building slots) | sink; Rep; plaque; Legacy |
| `life.club.join` | `{ clubId }` | eligible; not suspended; cash for first quarter | membership ACTIVE |
| `life.club.leave` | `{ clubId }` | member | LAPSED at paidThrough; no refund |
| `life.hosting.schedule` | `{ kind, venuePropId, startTick, invitees: string[] }` | home hosts kind; cooldown; start window; invitees ≤ capacity × 2 | cost posted; event SCHEDULED; invitations sent (15 notifications) |
| `life.hosting.cancel` | `{ eventId }` | host; SCHEDULED | 50% refund (`LIFE_HOSTING_REFUND`, FAUCET) |
| `life.hosting.rsvp` | `{ eventId, accept: boolean }` | invited | attendee list |
| `life.hosting.enter` | `{ eventId }` | accepted; LIVE; capacity | attendance recorded |
| `life.edition.publish` | `{ makerCmpId, category, nameText, size, unitPrice, designParts }` | controlled luxury business (09); size 2–500; price ≥ unit cost | edition created; units sold via Boutique "player editions" shelf |
| `life.cos.queue` | `{ intents: Intent[] }` | mansion+; ≤ 3; allowed kinds (§3.12.6) | queue replaced |
| `life.portrait.share` | `{ portraitId }` | own | share card generated (17) |

---

## §5 Engine events

All carry the 00 §5.6 envelope. Visibility in brackets.

| Kind | Payload | Visibility | Consumers |
|---|---|---|---|
| `acct.registered` | `{ accountId, country, ageBand }` | PRIVATE | 15, 19, 21 |
| `acct.rank.up` | `{ characterId, from, to, tick }` | PUBLIC (rank badge is public) | 15 (Wire for R3+), 17 moment, 18 just-in-time intros, 10 (city access) |
| `acct.license.granted` / `.lapsed` / `.suspended` / `.revoked` | `{ characterId, licenseId, until? }` | PRIVATE (suspension from a verdict is PUBLIC via 13) | 05, 06, 07 gates |
| `acct.milestone` | `{ characterId, milestoneId }` | PUBLIC if `wire` else PRIVATE | 15, 17 |
| `acct.title.awarded` | `{ characterId, titleId, scope }` | PUBLIC | 15, 17 |
| `acct.freshStart` | `{ characterId, trigger }` | PRIVATE (06-cities §10 privacy) | 07, 13, 15 |
| `acct.house.founded` / `acct.house.succession.completed` | `{ houseId, generation, estateBucket }` | PUBLIC if `showHouse` | 15 Wire, 16 history |
| `acct.deleted` | `{ formerLabel }` | PUBLIC | 15, 16 |
| `life.item.acquired` | `{ characterId, defId, class, priceBucket, displayed }` | PUBLIC when displayed and above threshold with consent, else PRIVATE | 15 Wire, 09 Luxury demand |
| `life.item.disposed` | `{ itemId, reason: 'SOLD'|'STOLEN'|'LIQUIDATED'|'CONSIGNED' }` | PRIVATE | 12, 08 |
| `life.prestige.updated` | `{ characterId, pp, byCategory }` | PUBLIC (Prestige is public) | 15 boards, 12 heat |
| `life.reputation.changed` | `{ characterId, kind, delta, value, publicLine }` | PUBLIC | 07, 08, 13, 15 |
| `life.notoriety.changed` | `{ characterId, delta, value }` | PRIVATE (PUBLIC if opted in) | 12, 15 Most Wanted |
| `life.drop.opened` / `life.drop.allocated` | `{ defId, size, allocations: count }` | PUBLIC (counts only) | 15, 17 |
| `life.club.joined` / `.lapsed` | `{ characterId, clubId }` | PUBLIC except Back Room (SEALED, 13 discovery only) | 15 |
| `life.hosting.scheduled` / `.started` / `.ended` | `{ eventId, kind, hostId, attendeeCount }` | PUBLIC for PARTY/GALA with consent, else PARTIES | 15 |
| `life.philanthropy` | `{ characterId, defId|causeId, amountBucket }` | PUBLIC | 15 Wire, 16 history, 10 plaques |
| `life.gilt.published` | `{ issueId, scope }` | PUBLIC | 15, 17 |
| `life.portrait.saved` | `{ portraitId }` | PRIVATE | 17 |

Amounts in public payloads are buckets (`priceBucket`: <$1M, $1–10M, $10–100M, $100M–1B, ≥$1B real), never exact values, so the Wire cannot be used to rebuild a balance sheet.

---

## §6 NPC behaviour

1. **NPC luxury demand.** NPC households and NPC wealthy actors (16) buy MASS items in aggregate; this is part of 09's Luxury sector demand, not individual items. Only player purchases create `OwnedItem`s.
2. **NPC collectors.** 16's wealthy actors (dynasty heads, founders, fund principals; about 60 at launch) hold LIMITED and UNIQUE items and bid at auctions with a reservation value `V_npc = 06.collectibleFairValue × (0.85 + 0.25·u)`, `u ~ U(0,1)` seeded per (actor, lot), budget-limited by their balance sheet (16 §3.3). They consign items when their liquidity goal is breached. This keeps auctions liquid and gives masterworks a provenance history.
3. **NPC drop buyers.** If a LIMITED drop is not fully taken by players by window close, NPC collectors take `min(unsold, ceil(0.3 × size))` units at list price; the rest stays on sale. This keeps editions scarce but prevents dead stock.
4. **NPC hosting.** Each city holds one charity Gala per game quarter (NPC-hosted, 16 schedules), where Gala-table buyers attend. Central-bank Galas (Glasshill benefit) are NPC-hosted.
5. **NPC clubs.** Club membership lists include NPC members (16) so a new member meets named actors; NPC members can send deal invitations through 16's decision model (never information about players).
6. **NPC crews** read exposure (heat) via 12, never Prestige directly.
7. **No NPC reacts to a player's rank or Prestige** except through public events and the same rules everyone faces (16 §3.3 knowledge firewall).

---

## §7 Screens

Layouts are 17's; this lists what each screen shows from this module.

| Screen (17 app) | Shows | Drives |
|---|---|---|
| Home / Estate (`estate`) | estate illustration, cash, NW, rank progress ("Next: Mogul · $412.9k / $5M"), today's goals, suggested actions, While You Were Away entry | display toggles, visit link |
| Me / Profile (`profile`) | §3.16.2 card, titles, record lines, Reputation history, House tab, Legacy tab, receipts | profile edits, publication settings |
| Vault (`estate` sub-view) | every owned item: value, condition, upkeep/day, insurance, PP, display state, storage location, pledge state, heirloom flag | sell, consign, restore, move, display, heirloom, pay upkeep |
| Boutique (`boutique`) | catalog by category and brand, open drops with window countdown and your priority position, player editions shelf, built-to-order queue | buy, order, drop request |
| Rank and Licenses (`profile` sub-view) | rank ladder, thresholds (`rank.thresholds()`), what each unlocks, licenses with fees, exams and renewal dates | buy, renew, exam, charter apply |
| Clubs (`civic` sub-view) | clubs, requirements met or missing, benefits, dues, member lists (public members only) | join, leave |
| Hosting planner (`estate` sub-view) | venue capacity, costs, calendar, invite picker, RSVPs, live room | schedule, cancel, RSVP, enter |
| House and Legacy (`profile` sub-view) | crest, generations, heirlooms, Legacy points and entries, plaques, succession requirements checklist, inheritance tax estimate | found, update, succession begin/abort |
| Gilt List (`boards` sub-view) | current and past issues, global and country editions, cover card | share |
| Hall of Fame (personal) | chapter portraits, past titles, peak ranks | share portrait |
| Fresh Start (modal flow) | calm bust summary, trade-journal causes, perk cards, what is kept and lost | declare, choose perk |
| Settings (`settings`) | identity, shell, publication consent (each field with a plain-language preview of what others will see) | all `acct.publication.set` |

Rank-up ceremony, milestone moments and Unique reveals are 17 moments fed by §5 events.

---

## §8 Edge cases

1. **Rank threshold crossed and lost within one game day.** Rank is evaluated at day close only, so intraday spikes never rank up; once reached at a close, it is kept.
2. **Two ranks crossed at one close** (big IPO): both ranks are awarded at the same tick; one combined ceremony shows the highest, the unlock cards list everything.
3. **R6 streak broken by a board recalculation.** The streak counts only closes where the published board row was top 50; corrections by 15 never retroactively revoke an awarded R6.
4. **MSI changes after an item purchase.** PP uses `pricePaidReal` fixed at purchase, so inflation never changes PP.
5. **Home sold with items displayed.** Items move to paid storage at that tick, display turns off, PP drops at next close. Staff lines stop at the sale tick.
6. **Last home seized by foreclosure (10/07).** Same as 5; the character becomes a rented-room resident.
7. **Item pledged and a Fresh Start occurs.** 07 liquidation sells it and pays the loan first.
8. **Drop with zero player requests.** NPC rule §6.3 applies; serials continue across drops ("Edition 12 of 99" in drop 2 is allowed: S is the per-drop size, the serial format is "drop D, N of S").
9. **Gigayacht build cap reached.** New orders are refused until the next chapter; the Boutique shows "next build slot opens at chapter N".
10. **Player-made edition maker company sold mid-edition.** Unsold units transfer with the company; minted serials keep the original maker name.
11. **Succession during a market crash.** Estate value is taken at the completion tick; the player may abort before completion.
12. **Succession completes while a new case is filed during probate.** Completion is blocked (the requirement is rechecked at completion); the succession stays in PROBATE until the case ends or the player aborts, max 1 chapter, then auto-aborts.
13. **Club eligibility lost because Prestige fell from novelty fade.** Grace applies (one game quarter).
14. **Hosting venue sold before the event.** Event is cancelled with a full refund (`LIFE_HOSTING_REFUND`) since the host did not choose to cancel.
15. **Attendee is Held during the event.** May stay in the chat read-only; no Rep bump.
16. **Restricted cash exactly covers a purchase that is disallowed** (e.g. margin): the intent fails with a reason naming the restriction and the release tick.
17. **Upkeep due while Held.** Upkeep posts normally (Held does not block automatic postings, 13).
18. **Deleted account owned a Hall of Patrons slot.** Slot becomes neutral civic until the next chapter.
19. **Country board too small for a Gilt edition.** No country edition; the player appears in the regional roll-up edition (15 §3.2).
20. **Same character qualifies as cover star for global and country editions.** Allowed; the "twice per chapter" rule applies per edition scope.
21. **A UNIQUE item is the subject of a court divestiture (13).** It is consigned by 13; heirloom flag is removed.
22. **Exam answers submitted for a license the character cannot afford.** Passing is recorded; buying later needs no retake for `PARAM.exam_valid_chapters = 2` chapters.

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| 1 | Pump rank with an alt buying a thin asset after the main | rank basis uses crowd-exit liquidation value (03), never last print |
| 2 | Alt funnels cash to the main via player-made editions | 3× cost price cap to linked accounts, 3 units per buyer per edition, 15 linked-account graph voids |
| 3 | Farm Reputation by hosting alts | attendee must be unlinked and ≥ 7 real days old; weekly cap +2; host must have R ≥ 50 |
| 4 | Farm Reputation with tiny honored contracts between friends | value ≥ $10k real, unlinked, +3/week cap, 2% P2P tax + 0.5% fee make it cost money |
| 5 | Wash Reputation by succession | f = 0.5 (0.8 after a recent conviction), once per chapter, R4+, inheritance tax, record lines stay on the House |
| 6 | Escape fines or judgments by succession | same character continues; blocked with open cases or unpaid judgments |
| 7 | Bust-and-restart for the $5k | 56-day cooldown, clawback lookback 7 days, $100k climber floor, restricted cash, Rep −10 |
| 8 | Buy MASS, sell back, repeat to "launder" | buyback at value −15% after the purchase hit: always loses ≥ 25% |
| 9 | Inflate PP with 40 identical cheap items | category weights 0.5^(k−1) (breadth over count) |
| 10 | Display items you do not have room for | display requires residence storage; paid storage never displays |
| 11 | Use Glasshill whispers as a free-money signal | accuracy band only shifts to 45–75%, 7 game days per quarter; harness gate (20) |
| 12 | Snipe drops with many alts | 1 per character per drop, priority by category PP, guests and accounts < 7 real days cannot request drops |
| 13 | Dodge exposure by keeping Prestige but hiding Notoriety | heat uses PP (public), Notoriety never lowers exposure |
| 14 | Hide items from E5 theft by displaying nothing | allowed: quiet money is a valid strategy, at the cost of all PP benefits |
| 15 | Abuse the starter gift (sell for cash on many alts) | 7-day sell lock, buyback value $714, guests cannot sell, alt detection |
| 16 | Use Chief of Staff as an offline bot | 3 intents, allowed kinds only, at one fixed tick, normal validation |
| 17 | Spend restricted ad cash on derivatives via a fund | restriction follows the cash into fund subscriptions (08 checks the lot tag) |
| 18 | Handle change to escape a bad name | blocked during cases and for 7 days after a conviction; "formerly X" shown for one chapter; record lines follow the character |
| 19 | Club board-seat invites as insider gold | director status triggers 13 blackout and insider rules; trading inside the blackout feeds the surveillance score |
| 20 | Gilt cover gaming by self-dealing a rank jump | rank deltas use rank-basis NW; cover once per chapter |

---

## §10 Acceptance tests

1. A new guest character has cash $5,000, LIC0, rank R0, a home city in the FDL bloc, and `protectionEndsTick = joinTick + 51,840`.
2. A guest cannot submit any P2P transfer, contract or alliance intent; each returns the validation reason `GUEST`.
3. Registering with a birth year giving age 15 is refused and no REGISTERED account exists afterwards.
4. Handle `ab` and handle `1234` are refused; `Vega_1` is accepted; a second account cannot take `vega_1`.
5. A second handle change in the same chapter is refused.
6. A character whose rank-basis NW is $19,999 real at day close stays R0; at $20,000 it becomes R1 at that close and `acct.rank.up` is emitted once.
7. A character at R3 whose NW falls to $10k keeps R3 at every later close.
8. An intraday rank-basis spike above $5M that is below $5M at day close does not rank up.
9. R6 is awarded only after 24 consecutive day closes in the top 50 with NW ≥ $20B real and a House; 23 closes do not award it.
10. Buying LIC2 at R1 is refused; at R2 without the exam it is refused; at R2 with the exam and $15,000 × MSI cash it succeeds and posts `ACCT_LICENSE_FEE`.
11. A license whose renewal is unpaid for 7 game days becomes LAPSED and opening orders in its classes are refused while closing orders are accepted.
12. The onboarding LIC1 grant posts exactly one `ACCT_ONBOARD_GRANT` of $250 per character, ever.
13. Buying a Marchetti Furia at list $1.2M (MSI 1) posts a $1.2M SINK and recognizes a $1.02M asset; net worth drops by $180k.
14. A MASS item's value after 1 game year at condition 1 equals `price × (1−hit) × (1−dep)`.
15. An item with unpaid upkeep for 10 day closes has condition 0.8 and no upkeep postings on those days.
16. A displayed Marchetti Furia Ultima bought at $4.5M real has PP 134 at acquisition and PP 168 (×1.25) after 2 game years at condition 1.
17. A MASS item's PP halves linearly over its first game year.
18. Two identical displayed cars of PP 35 each contribute 52.5 (35 + 17.5) to the CAR category.
19. Toggling an item undisplayed removes its PP at the next day close and removes it from the public estate payload.
20. An item in paid storage cannot be set displayed.
21. A completed Horologist set adds exactly 20% of the three watches' PP and awards the title.
22. A LIMITED drop with more requests than units allocates by category PP descending, then by request tick; no character gets 2 units; no randomness is used (same inputs, same allocation on replay).
23. Unsold drop units after the window: NPC collectors take at most ceil(0.3 × size).
24. A positive Reputation event of +2 at R = 90 changes R by +0.4; a −10 event at R = 90 changes it by −14.
25. Reputation from philanthropy never exceeds +20 in one chapter.
26. DRIFT raises R by 0.5 per clean real week only while R < 50 and never above 50.
27. A conviction halves Notoriety and applies an extra Reputation event of −0.2 × the removed amount.
28. Reputation never appears as an input to any 13 verdict or fine computation (static check of 13's formula inputs).
29. Heat bonus for PP 5,000 is 0.06 and for PP 20,000 is 0.12; it is passed to 12 as an exposure multiplier only.
30. `reachWeight` for PP 0 is 1.0, for PP 99 is 1.5, and never exceeds 2.
31. Joining Glasshill with PP 1,000 and R 49 is refused; with R 50 it succeeds and posts one quarter of dues.
32. An S4 conviction suspends Harbor, Glasshill and Summit memberships at the verdict tick.
33. Back Room membership never appears in any PUBLIC or PARTIES payload.
34. A GALA cannot be scheduled from a mansion; a PARTY can.
35. An attendee linked to the host gets no `HOSTED_EVENT_ATTENDED` event.
36. Contracts registered between two attendees during a LIVE event charge 0 registration fee and the full 2% P2P tax.
37. Chief of Staff submits queued intents only at t = 60 of the next trading day and only if the character is offline at that tick.
38. A voluntary Fresh Start at NW $900 grants $5,000 restricted cash, applies Rep −10, blocks margin for 14 real days and leverage above 1× for 7 real days.
39. A second voluntary Fresh Start within 56 real days grants no cash and no perk.
40. Restricted cash cannot fund an op, a margin order, a derivative order or a P2P transfer for 72 real hours; it can fund a spot buy.
41. P2P transfers made in the 7 real days before a Fresh Start are reversed.
42. After a Fresh Start, rank, titles, licenses, House and Legacy are unchanged.
43. Phoenix is awarded when NW returns to the prior peak (≥ $100k) after a Fresh Start, and not before.
44. Founding a House below R4 is refused; at R4 it posts $10M × MSI SINK.
45. Succession is refused with an open case; with no blockers it completes exactly 17,280 ticks after it began.
46. Succession of an estate of $2B real charges $90M + $200M = $290M tax (10% of $900M + 20% of $1B).
47. After succession the character id, contracts and debts are unchanged; personaGeneration +1; Rep 70 becomes 60 (f = 0.5); Notoriety 40 becomes 10.
48. Heirloom heritage age factor continues to rise across a succession; a non-heirloom LIMITED item's heritage also continues (it is the same owner), while a gifted item's heritage restarts at the gift.
49. No intent exists that moves an estate to another account.
50. Legacy points never decrease across any sequence of events (property test over random event streams).
51. The Gilt List is produced at every 91st game-day close, contains the Richest board's top 100 with bucketed values only, and its cover star is identical on replay.
52. A player with `showEstate = false` appears in the Gilt top 100 rows but with no estate illustration.
53. Two worlds with identical public records but different private positions produce byte-identical public profile, estate and Gilt payloads (LC16 privacy test).
54. Public payloads never contain exact item values unless `showItemValues` is true; lifestyle Wire items contain only price buckets.
55. Deleting an account liquidates its estate, destroys residual cash with `ACCT_DELETION_ESCHEAT`, and every past public line now names "Former player #n".
56. Every money movement in this module uses a reason code from §3.17, and the module's net mint over a 20-seed harness run is reported per code (20).
57. A Hall of Patrons slot assignment is fixed for the whole chapter even when board ranks change daily.
58. Cosmetic shells never change any number in any engine output (replay with and without a cosmetic shell is identical).
