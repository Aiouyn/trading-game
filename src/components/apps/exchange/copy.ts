// The Exchange app's copy helpers: which i18n key a code, a reason or a label maps to, and the three-part refusal text.
// Pure functions (no React), so the copy test can check that every key they can return exists in English and French.
import { hasKey, t } from '@/i18n';
import { compactMoney } from '@/game/format';
import type { CompanySector } from '@/content/company';

/** A refusal in its three parts: what happened, why, and what the player can do (the company and fund copy shape). */
export interface RefusalCopy {
  what: string;
  why: string;
  do: string;
}

/**
 * The copy of a refusal code. `prefix` is the namespace the code's keys live under (`funds.refusal` or `company.refusal`).
 * A code with no copy yet falls back to the Exchange's generic line, so a refusal never shows a raw key.
 */
export function refusalCopy(prefix: 'funds.refusal' | 'company.refusal', code: string, vars: Record<string, string | number> = {}): RefusalCopy {
  const base = `${prefix}.${code}`;
  if (!hasKey(`${base}.what`)) {
    return { what: t('exchange.refuse.what'), why: t('exchange.refuse.why'), do: t('exchange.refuse.do') };
  }
  return { what: t(`${base}.what`, vars), why: t(`${base}.why`, vars), do: t(`${base}.do`, vars) };
}

/** The vars a company reject carries (its numbers and days), read from the command's data, never computed here. */
export function rejectVars(data: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (k !== 'code' && (typeof v === 'number' || typeof v === 'string')) out[k] = v;
    }
  }
  return out;
}

/** The key of a plan end reason (the engine's `terminated`, `legal`, `tender`, `completed`), or the generic line. */
export function planEndKey(reason: string): string {
  return hasKey(`exchange.plan.end.${reason}`) ? `exchange.plan.end.${reason}` : 'exchange.plan.end.other';
}

/** The key of a skip reason (`volume`, `price`, `cap`, `halt`), or the generic line. */
export function skipKey(reason: string): string {
  return hasKey(`exchange.skip.${reason}`) ? `exchange.skip.${reason}` : 'exchange.skip.other';
}

/** The key of a sector name. */
export function sectorKey(sector: CompanySector): string {
  return `exchange.sector.${sector}`;
}

/** The key of a company tier, or of Listed once a company has a listing. */
export function tierKey(tier: string, listed: boolean): string {
  return listed ? 'exchange.tier.listed' : `exchange.tier.${tier}`;
}

/** The key of a fund status. */
export function statusKey(status: string): string {
  return `exchange.status.${status}`;
}

/** The key of an asset class in a mandate. */
export function classKey(cls: string): string {
  return `exchange.class.${cls}`;
}

/** The AUM bucket label for an index (0 = below the first bucket), from the buckets the world reads. */
export function aumBucketKey(bucket: number, buckets: readonly number[]): { key: string; vars: Record<string, string | number> } {
  const last = buckets.length;
  if (bucket <= 0) return { key: 'exchange.aum.0', vars: { b0: compactMoney(buckets[0]!) } };
  if (bucket >= last) return { key: 'exchange.aum.3', vars: { b2: compactMoney(buckets[last - 1]!) } };
  if (bucket === 1) return { key: 'exchange.aum.1', vars: { b0: compactMoney(buckets[0]!), b1: compactMoney(buckets[1]!) } };
  return { key: 'exchange.aum.2', vars: { b1: compactMoney(buckets[1]!), b2: compactMoney(buckets[2]!) } };
}

/** A per-unit NAV: four decimals, the real minus sign. The unit value is a fund's own mark, never a stock price. */
export function unitNav(n: number): string {
  const s = n.toFixed(4);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/** The copy keys the Exchange can show for a stock's latest weekly hires read. */
export function hiresKey(v: 'up' | 'flat' | 'down'): string {
  return `exchange.hires.${v}`;
}

/** The copy key for an insider filing's side. */
export function sideKey(side: 'buy' | 'sell'): string {
  return side === 'buy' ? 'exchange.side.buy' : 'exchange.side.sell';
}

/** The copy key for a covenant status. */
export function covenantKey(status: string): string {
  return hasKey(`exchange.covenant.${status}`) ? `exchange.covenant.${status}` : 'exchange.covenant.ok';
}
