/**
 * Client sandbox tunables (Phase 3, A3). Every number the sandbox uses lives here, never inline.
 *
 * The sandbox is the bundled engine running in the browser with its own seed and paper money. Nothing it does
 * reaches the server, net worth, rank, boards, the Wire or the live store (see isolation.test.ts).
 */
export const SANDBOX = {
  /** version of this file's rules (cash, caps, challenge salt); a run file from another version is refused */
  configVersion: 1,
  /** run file format tag and version (M11) */
  runFormat: 'tg-sandbox-run',
  runVersion: 1,
  /** prefix of every sandbox seed; live world seeds never carry it */
  seedPrefix: 'sbx:',
  /** paper money for the practice account, the engine's default starting cash */
  practiceCash: 5000,
  /** paper money for scenarios and the weekly challenge */
  scenarioCash: 5000,
  /** a run file above this many bytes is refused before it is parsed */
  maxRunBytes: 512 * 1024,
  /** a run file with more commands than this is refused */
  maxRunCommands: 5000,
  /** the longest run a file may hold, in game days (a 30-day challenge is the cap) */
  maxRunDays: 30,
  /** order bounds accepted from the UI or a run file: quantity, prices, trailing distance */
  minOrderQty: 1e-9,
  maxOrderQty: 1e12,
  maxOrderPrice: 1e12,
  minOrderPrice: 1e-9,
  maxTrailPct: 0.999,
  minTrailPct: 1e-6,
  maxTakeProfitOrStop: 1e12,
  /** the local weekly board keeps this many entries per week */
  boardSize: 20,
  /** public salt for the weekly seed. Not secret: it only stops the week's seed from being the live world's seed */
  challengeSalt: 'tg-weekly-v1',
  /** the sandbox's own market index names (the same two the live game shows) */
  indexGx: 'GX',
  indexCrypto: 'CRX',
  /** asset id of the gold line in the scenario checks */
  goldAsset: 'GOLD',
} as const;

/**
 * Thresholds the scenario seeds must meet (quant-scenario-seeds.md). Each scenario test re-runs its seed and checks
 * these, so a change here makes the test fail until the seed is re-searched.
 */
export const SCENARIO_RULES = {
  /** overheating: the index rises at least this far above its start at some day close ... */
  overheatRunUp: 0.03,
  /** ... and then falls at least this far from that running peak */
  overheatDrawdown: 0.05,
  /** quiet: no index day close moves more than this (absolute) */
  quietMaxDailyMove: 0.03,
  /** crypto-winter: the share of stocks up over the window must sit in [low, high] (mixed) */
  mixedLow: 0.3,
  mixedHigh: 0.7,
  /** earnings-heavy: at least this many distinct stocks report within the window at the start */
  earningsMin: 4,
  earningsWindowDays: 10,
  /** flash: the flash goes live during this game day (0-based; 1 is the second day) */
  flashDay: 1,
} as const;
