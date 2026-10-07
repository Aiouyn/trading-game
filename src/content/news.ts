/**
 * News templates (bible 01, News: "every move has a cause"). The engine decides what moves and
 * by how much; these templates give each move its story, chosen deterministically from the
 * event so every player reads the same headline. {name} is the company or asset, {move} the
 * signed percent, {city} a fictional city.
 */

type Dir = 'up' | 'down';

const GENERIC: Record<Dir, string[]> = {
  up: [
    '{name} jumps {move} after a surprise upgrade from Trustwell analysts',
    '{name} rallies {move} on takeover chatter',
    '{name} surges {move} as a big fund discloses a stake',
    '{name} climbs {move} after raising its full-year outlook',
    '{name} pops {move} on a new buyback program',
  ],
  down: [
    '{name} slides {move} after a downgrade',
    '{name} drops {move} as its finance chief resigns',
    '{name} falls {move} on a regulator inquiry',
    '{name} sinks {move} after cutting its outlook',
    '{name} tumbles {move} as a short seller publishes a report',
  ],
};

const BY_SECTOR: Record<string, Record<Dir, string[]>> = {
  tech: {
    up: ['{name} jumps {move} after unveiling a new AI assistant', '{name} rises {move} as cloud bookings beat every estimate', '{name} soars {move} on a landmark government contract'],
    down: ['{name} falls {move} after a global outage', '{name} drops {move} as the antitrust office opens a case', '{name} slides {move} on a weak user-growth report'],
  },
  semis: {
    up: ['{name} spikes {move} as AI labs order a year of supply', '{name} gains {move} after a breakthrough at the 1 nm node', '{name} rallies {move} on a chip-export deal'],
    down: ['{name} drops {move} on new chip export curbs', '{name} slumps {move} as an inventory glut builds', '{name} falls {move} after a fab fire'],
  },
  energy: {
    up: ['{name} rises {move} after a major field discovery', '{name} climbs {move} as the Petroleum Council cuts output', '{name} gains {move} on a record power auction'],
    down: ['{name} falls {move} after a pipeline spill', '{name} drops {move} as windfall taxes are proposed', '{name} slides {move} on a mild-winter forecast'],
  },
  materials: {
    up: ['{name} jumps {move} on a rich new deposit', '{name} gains {move} as infrastructure spending passes', '{name} rallies {move} after rival mines flood'],
    down: ['{name} drops {move} after a mine collapse halts output', '{name} falls {move} on weak demand from Kaiyo factories', '{name} slips {move} as tariffs bite'],
  },
  industrials: {
    up: ['{name} climbs {move} on a record order book', '{name} gains {move} after winning the harbor-tunnel bid', '{name} rises {move} as freight volumes surge'],
    down: ['{name} falls {move} after a safety recall', '{name} drops {move} as a strike shuts plants', '{name} slides {move} on a canceled megaproject'],
  },
  financials: {
    up: ['{name} gains {move} as trading revenue hits a record', '{name} rises {move} after passing the stress test', '{name} jumps {move} on a merger announcement'],
    down: ['{name} falls {move} after a trading loss comes to light', '{name} drops {move} on a money-laundering fine', '{name} slides {move} as loan defaults rise'],
  },
  health: {
    up: ['{name} soars {move} after a late-stage trial succeeds', '{name} jumps {move} on approval of its lead drug', '{name} climbs {move} as a big pharma partner signs on'],
    down: ['{name} plunges {move} after its trial misses the endpoint', '{name} falls {move} on a safety warning from regulators', '{name} drops {move} after the patent court rules against it'],
  },
  staples: {
    up: ['{name} rises {move} as price hikes stick', '{name} gains {move} on a celebrity brand deal', '{name} edges up {move} after a strong holiday season'],
    down: ['{name} slips {move} after a product recall', '{name} falls {move} as shoppers trade down', '{name} drops {move} on a commodity cost squeeze'],
  },
  discretionary: {
    up: ['{name} jumps {move} as a new model sells out', '{name} surges {move} after a viral launch', '{name} climbs {move} on record luxury spending'],
    down: ['{name} falls {move} after a recall of 400,000 units', '{name} drops {move} as demand cools', '{name} slides {move} on a design-theft scandal'],
  },
  realestate: {
    up: ['{name} rises {move} as occupancy hits a record', '{name} gains {move} after selling a tower at a premium', '{name} climbs {move} on a rezoning win'],
    down: ['{name} falls {move} as a major tenant leaves', '{name} drops {move} on a property write-down', '{name} slides {move} as vacancies climb'],
  },
  security: {
    up: ['{name} jumps {move} after a wave of high-profile breaches', '{name} rises {move} on a defense contract', '{name} gains {move} as insurers mandate its product'],
    down: ['{name} falls {move} after its own systems are breached', '{name} drops {move} as a big contract is lost', '{name} slides {move} on export restrictions'],
  },
  media: {
    up: ['{name} soars {move} after a blockbuster weekend', '{name} jumps {move} as subscribers beat forecasts', '{name} rises {move} on a sports-rights deal'],
    down: ['{name} falls {move} after a flop', '{name} drops {move} as advertisers pull spending', '{name} slides {move} on subscriber losses'],
  },
  crypto: {
    up: ['{name} rips {move} as an exchange lists it', '{name} surges {move} after a large wallet starts buying', '{name} jumps {move} on an upgrade going live'],
    down: ['{name} crashes {move} after an exchange hack', '{name} dumps {move} as regulators threaten a ban', '{name} slides {move} after a large holder sells'],
  },
  metals: {
    up: ['{name} climbs {move} as investors seek safety', '{name} rises {move} on central-bank buying'],
    down: ['{name} falls {move} as risk appetite returns', '{name} drops {move} after a large fund liquidates'],
  },
  basemetals: {
    up: ['{name} jumps {move} on supply disruptions', '{name} rises {move} as battery demand surges'],
    down: ['{name} falls {move} as factory orders slump', '{name} drops {move} on a new supply wave'],
  },
  agri: {
    up: ['{name} spikes {move} on drought in the breadbasket', '{name} jumps {move} after a frost'],
    down: ['{name} falls {move} on a bumper harvest', '{name} drops {move} as stockpiles build'],
  },
  fx: {
    up: ['The {name} strengthens {move} after a hawkish central bank', 'The {name} rallies {move} on capital inflows'],
    down: ['The {name} weakens {move} on political uncertainty', 'The {name} slides {move} after a surprise rate cut'],
  },
  rates: {
    up: ['{name} rallies {move} as investors flee to safety'],
    down: ['{name} falls {move} as yields jump'],
  },
};

/** Commodity-specific stories override the sector pool for their own moves. */
const BY_ASSET: Record<string, Record<Dir, string[]>> = {
  OIL: {
    up: ['Crude jumps {move} as the Petroleum Council cuts output', 'Crude spikes {move} after a tanker is seized in the strait'],
    down: ['Crude falls {move} as the Petroleum Council fails to agree', 'Crude drops {move} on a surprise inventory build'],
  },
  CMPT: {
    up: ['Compute spot jumps {move} as a frontier lab books every GPU in sight', 'Compute prices spike {move} on a chip shortage'],
    down: ['Compute spot falls {move} as a new hyperscale data center comes online', 'Compute prices drop {move} after an AI lab cancels a training run'],
  },
  DATA: {
    up: ['Data prices jump {move} as a privacy law shuts off scraping', 'Data spot rises {move} on a licensing bidding war'],
    down: ['Data prices fall {move} as synthetic data floods the market', 'Data spot drops {move} after a big archive is released for free'],
  },
  PWR: {
    up: ['Power prices spike {move} in a heatwave', 'Grid power jumps {move} as a reactor trips offline'],
    down: ['Power prices fall {move} on a windy week', 'Grid power drops {move} as solar output peaks'],
  },
  GOLD: {
    up: ['Gold climbs {move} as investors seek safety', 'Gold rises {move} on record central-bank buying'],
    down: ['Gold falls {move} as the dollar firms', 'Gold drops {move} as risk appetite returns'],
  },
};

/** Small deterministic string hash (FNV-1a). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function moveHeadline(assetId: string, sector: string, name: string, move: number, key: string): string {
  const dir: Dir = move >= 0 ? 'up' : 'down';
  const pool = BY_ASSET[assetId]?.[dir] ?? BY_SECTOR[sector]?.[dir] ?? GENERIC[dir];
  const all = Math.abs(move) < 0.04 && BY_SECTOR[sector] ? [...pool, ...GENERIC[dir]] : pool;
  const t = all[hashStr(key) % all.length]!;
  return fill(t, name, move);
}

function fill(t: string, name: string, move: number): string {
  const pct = `${move >= 0 ? '+' : '−'}${(Math.abs(move) * 100).toFixed(1)}%`;
  return t.replace('{name}', name).replace('{move}', pct);
}

/**
 * Simplified earnings (Mathis: "reading earnings is too complex, keep it but simplify").
 * The surprise becomes a letter grade and a one-line verdict; the analysts' consensus becomes
 * a lean with up to three stars of conviction; the rumor becomes a "whisper".
 */
export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export function earningsGrade(surprise: number): Grade {
  if (surprise >= 1.5) return 'A+';
  if (surprise >= 0.75) return 'A';
  if (surprise >= 0.25) return 'B';
  if (surprise > -0.25) return 'C';
  if (surprise > -1) return 'D';
  return 'F';
}

export function gradeVerdict(g: Grade): string {
  return {
    'A+': 'Crushed it', A: 'Clear beat', B: 'Small beat', C: 'In line', D: 'Missed', F: 'Big miss',
  }[g];
}

export function earningsHeadline(name: string, surprise: number, move: number): string {
  const g = earningsGrade(surprise);
  const pct = `${move >= 0 ? '+' : '−'}${(Math.abs(move) * 100).toFixed(1)}%`;
  const what = {
    'A+': `${name} smashes estimates, raises guidance`,
    A: `${name} beats on sales and profit`,
    B: `${name} edges past estimates`,
    C: `${name} reports in line with estimates`,
    D: `${name} misses on profit`,
    F: `${name} misses badly and cuts its outlook`,
  }[g];
  return `${what} (grade ${g}), shares ${pct}`;
}

/** Analysts' lean in [-1, 1] → "Beat ★★" style label. */
export function consensusLabel(consensus: number): { lean: 'Beat' | 'Miss' | 'Split'; stars: number } {
  const a = Math.abs(consensus);
  if (a < 0.15) return { lean: 'Split', stars: 0 };
  return { lean: consensus > 0 ? 'Beat' : 'Miss', stars: a > 0.6 ? 3 : a > 0.35 ? 2 : 1 };
}

export function previewHeadline(name: string, consensus: number, daysAway: number): string {
  const { lean, stars } = consensusLabel(consensus);
  const when = daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`;
  if (lean === 'Split') return `Analysts are split on ${name} ahead of earnings ${when}`;
  const conv = stars === 3 ? 'strongly expect' : stars === 2 ? 'expect' : 'lean toward';
  return `Analysts ${conv} ${name} to ${lean === 'Beat' ? 'beat' : 'miss'} when it reports ${when}`;
}

export function rumorHeadline(name: string, direction: 1 | -1): string {
  return direction > 0
    ? `Whisper: sources say ${name}'s quarter came in hot`
    : `Whisper: sources say ${name}'s quarter disappointed`;
}

export function macroHeadline(kind: 'cpi' | 'jobs', actual: number, consensus: number): string {
  const diff = actual - consensus;
  const a = `${(actual * 100).toFixed(1)}%`;
  const c = `${(consensus * 100).toFixed(1)}%`;
  if (kind === 'cpi') {
    if (diff > 0.0007) return `Inflation runs hot at ${a} vs ${c} expected; stocks wobble`;
    if (diff < -0.0007) return `Inflation cools to ${a} vs ${c} expected; markets cheer`;
    return `Inflation in line at ${a}`;
  }
  if (diff > 0.0007) return `Economy stronger than expected: growth ${a} vs ${c}`;
  if (diff < -0.0007) return `Growth disappoints at ${a} vs ${c} expected`;
  return `Growth in line at ${a}`;
}

export function ratesHeadline(policy: number, change: number, expected: number): string {
  const p = `${(policy * 100).toFixed(2)}%`;
  const bp = Math.round(change * 1e4);
  const surprise = Math.round((change - expected) * 1e4);
  const verb = bp > 0 ? `hikes ${bp} bp to ${p}` : bp < 0 ? `cuts ${-bp} bp to ${p}` : `holds at ${p}`;
  if (surprise === 0) return `Avalon Central Bank ${verb}, as expected`;
  return `Avalon Central Bank ${verb}, a ${surprise > 0 ? 'hawkish' : 'dovish'} surprise`;
}

export function regimeHeadline(from: string, to: string): string {
  const t: Record<string, string> = {
    expansion: 'The expansion is back: hiring picks up across the Republic',
    overheating: 'Economists warn the economy is overheating',
    contraction: 'Recession: the economy contracts as credit tightens',
    recovery: 'Green shoots: the recovery begins',
  };
  return t[to] ?? `The economy turns from ${from} to ${to}`;
}
