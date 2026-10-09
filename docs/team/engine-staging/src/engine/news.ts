import type { NewsBand, NewsConfig, NewsItem, NewsView, WorldConfig, WorldState } from './types';

/** Phase 0 defaults. A quarter is 63 game days, a macro print every 21. */
export const DEFAULT_NEWS: NewsConfig = {
  earningsEveryDays: 63,
  macroEveryDays: 21,
  kept: 120,
};

export function newsConfig(cfg: WorldConfig): NewsConfig {
  return { ...DEFAULT_NEWS, ...cfg.news };
}

/** Stable 0..n-1 pick from a string. Not an engine stream: headlines never touch price RNGs. */
function pick(key: string, n: number): number {
  let h = 2166136261;
  for (const c of key) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}

export function isEarningsDay(assetId: string, day: number, every: number): boolean {
  return every > 0 && day > 0 && day % every === pick(assetId, every);
}

const COMPANY_UP = [
  '{name} wins a major contract',
  '{name} guides higher for the year',
  '{name} launches a product ahead of rivals',
];
const COMPANY_DOWN = [
  '{name} warns on demand',
  '{name} faces a regulatory probe',
  '{name} loses a key customer',
];
const TRIAL_UP = ['{name} drug trial hits its endpoint'];
const TRIAL_DOWN = ['{name} drug trial misses its endpoint'];

function fill(tpl: string, name: string): string {
  return tpl.split('{name}').join(name);
}

function companyHeadline(assetId: string, name: string, logImpact: number): string {
  const up = logImpact >= 0;
  const bank = assetId === 'LMNP' ? (up ? TRIAL_UP : TRIAL_DOWN) : up ? COMPANY_UP : COMPANY_DOWN;
  return fill(bank[pick(`${assetId}:${logImpact > 0 ? 'u' : 'd'}:${Math.abs(logImpact).toFixed(4)}`, bank.length)]!, name);
}

const MACRO: Record<string, string> = {
  expansion: 'Growth stays firm across the Union',
  overheating: 'Inflation runs hot as the cycle peaks',
  contraction: 'The Union slips into contraction',
  recovery: 'Activity turns up as the recovery takes hold',
};

/**
 * Share of a news move already in the price. A jump prints `jumpImmediate` at once and the rest
 * decays into the price with the asset's half-life, so this rises from jumpImmediate toward 1.
 * A print with no surprise (logImpact 0) is fully priced in.
 */
export function newsPricedIn(item: NewsItem, tick: number, cfg: WorldConfig): number {
  if (item.logImpact === 0) return 1;
  const imm = cfg.jumpImmediate ?? 1;
  const half = cfg.assets.find((a) => a.id === item.assetId)?.halfLifeDays ?? 20;
  const days = Math.max(0, (tick - item.tick) / cfg.ticksPerDay);
  const stillDrifting = (1 - imm) * Math.exp((-Math.LN2 * days) / half);
  return Math.min(1, 1 - stillDrifting);
}

export interface JumpRef { assetId: string; logSize: number }

/** Build the news printed this tick from the jumps that already fired, plus the calendar. */
export function newsForTick(
  state: WorldState, tick: number, day: number, dayStart: boolean, dayEnd: boolean, jumps: JumpRef[],
): NewsItem[] {
  const nc = newsConfig(state.config);
  const out: NewsItem[] = [];
  const reported = new Set<string>(
    (state.news ?? []).filter((n) => n.kind === 'earnings' && n.day === day).map((n) => n.assetId!),
  );
  for (const j of jumps) {
    const def = state.config.assets.find((a) => a.id === j.assetId);
    if (!def) continue;
    const earnings = def.assetClass === 'stock' && isEarningsDay(def.id, day, nc.earningsEveryDays) && !reported.has(def.id);
    if (earnings) reported.add(def.id);
    const kind = earnings ? 'earnings' : 'company';
    const headline = earnings
      ? (j.logSize > 0 ? `${def.name} earnings beat expectations` : `${def.name} earnings miss expectations`)
      : companyHeadline(def.id, def.name, j.logSize);
    out.push({ id: `${kind}:${def.id}:${tick}`, tick, day, kind, assetId: def.id, headline, logImpact: j.logSize });
  }
  if (dayEnd) {
    for (const def of state.config.assets) {
      if (def.assetClass !== 'stock' || reported.has(def.id)) continue;
      if (!isEarningsDay(def.id, day, nc.earningsEveryDays)) continue;
      out.push({
        id: `earnings:${def.id}:${tick}`, tick, day, kind: 'earnings', assetId: def.id,
        headline: `${def.name} earnings land in line`, logImpact: 0,
      });
    }
  }
  if (dayStart && nc.macroEveryDays > 0 && day > 0 && day % nc.macroEveryDays === 0) {
    out.push({
      id: `macro:${day}`, tick, day, kind: 'macro',
      headline: MACRO[state.regime] ?? 'The macro picture is unchanged', logImpact: 0,
    });
  }
  return out;
}

/**
 * Band for the Wire. Cuts are the exact share after 1, 2 and about 4 half-lives of a normal stock
 * (0.85, 0.93, 0.98), so a fresh print at 0.70 reads Early and a finished drift reads Done.
 * Not exported as a number on purpose.
 */
export function newsBand(item: NewsItem, tick: number, cfg: WorldConfig): NewsBand {
  const x = newsPricedIn(item, tick, cfg);
  if (x >= 0.98) return 'done';
  if (x >= 0.93) return 'late';
  if (x >= 0.85) return 'mid';
  return 'early';
}

/** Newest first. Carries the band, never the exact share. */
export function wire(state: WorldState, limit = 30): NewsView[] {
  const items = state.news ?? [];
  const n = Math.max(0, limit);
  return items.slice(-n).reverse().map((item) => ({ ...item, band: newsBand(item, state.tick, state.config) }));
}
