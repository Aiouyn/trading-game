// Pure helpers for the Shops tab (Phase 4 stage C): which copy a refusal code shows, the variables that copy
// needs, and the commands a bulk change sends. No React here, so the rules are unit-tested on their own.
import { SHOP_REFUSAL } from '@/content/shops';
import type { ShopView } from '@/world/shopView';
import type { Command } from '@/world/types';

/** The copy keys for one refusal: what happened, why, and what the owner can do. */
export interface RefusalKeys { what: string; why: string; do: string }

const SLUG_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(SHOP_REFUSAL).map(([slug, code]) => [code, slug]),
);

/** The copy keys for a refusal code; an unknown code gets the generic copy, never a raw code. */
export function refusalKeys(code: string): RefusalKeys {
  const slug = SLUG_BY_CODE[code] ?? 'unknown';
  return { what: `shop.refusal.${slug}.what`, why: `shop.refusal.${slug}.why`, do: `shop.refusal.${slug}.do` };
}

/**
 * The variables a refusal's copy needs, read from the shop the change was tried on. `prepay` and `shortfall` are
 * passed by the caller (they depend on the star level chosen), so they are not set here.
 */
export function refusalVars(code: string, shop: ShopView): Record<string, string | number> {
  switch (code) {
    case SHOP_REFUSAL.priceOncePerDay: return { day: shop.price.nextChangeDay };
    case SHOP_REFUSAL.managerTenure: return { day: shop.manager.fireOpenDay };
    default: return {};
  }
}

/** The bulk settings: each lever is a value to apply, or null to keep what each shop has. */
export interface BulkSettings {
  crew: number | null;
  price: number | null;
  quality: number | null;
  marketing: number | null;
  maintained: boolean | null;
}

export const NO_BULK: BulkSettings = { crew: null, price: null, quality: null, marketing: null, maintained: null };

export function bulkPicked(s: BulkSettings): boolean {
  return s.crew !== null || s.price !== null || s.quality !== null || s.marketing !== null || s.maintained !== null;
}

/** The shops a sector scope reaches: `all`, or one sector id. */
export function bulkScope(shops: ShopView[], sector: string): ShopView[] {
  return sector === 'all' ? shops : shops.filter((s) => s.sector === sector);
}

/**
 * The commands one shop needs for the bulk settings. A lever already at the chosen value sends nothing, so a
 * price that is already set does not spend the shop's one price change for the day.
 */
export function bulkCommands(shop: ShopView, s: BulkSettings): Command[] {
  const out: Command[] = [];
  const st = shop.settings;
  if (s.crew !== null && s.crew !== st.crew) out.push({ type: 'biz.crew', bizId: shop.id, crew: s.crew });
  if (s.price !== null && s.price !== (st.pendingPrice ?? st.price)) out.push({ type: 'biz.price', bizId: shop.id, price: s.price });
  if (s.quality !== null && s.quality !== st.quality) out.push({ type: 'biz.quality', bizId: shop.id, level: s.quality });
  if (s.marketing !== null && s.marketing !== st.marketing) out.push({ type: 'biz.marketing', bizId: shop.id, level: s.marketing });
  if (s.maintained !== null && s.maintained !== st.maintained) out.push({ type: 'biz.maintain', bizId: shop.id, on: s.maintained });
  return out;
}

/** The result of a bulk run: how many shops took every change, and the refusals by code (with the shop's copy variables). */
export interface BulkResult {
  n: number;
  ok: number;
  refusals: { code: string; count: number; vars: Record<string, string | number> }[];
}

/**
 * Tallies a bulk run. `outcomes` holds, per shop, the error code of each command that was refused (empty when
 * every command for that shop was taken).
 */
export function bulkResult(scope: ShopView[], outcomes: { shop: ShopView; codes: string[] }[]): BulkResult {
  const byCode = new Map<string, { count: number; vars: Record<string, string | number> }>();
  let ok = 0;
  for (const o of outcomes) {
    if (o.codes.length === 0) { ok++; continue; }
    for (const code of new Set(o.codes)) {
      const cur = byCode.get(code) ?? { count: 0, vars: refusalVars(code, o.shop) };
      cur.count++;
      byCode.set(code, cur);
    }
  }
  return { n: scope.length, ok, refusals: [...byCode].map(([code, v]) => ({ code, ...v })) };
}
