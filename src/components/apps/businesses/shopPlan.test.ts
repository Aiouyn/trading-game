import { describe, expect, it } from 'vitest';
import { SHOP_REFUSAL } from '@/content/shops';
import type { ShopView } from '@/world/shopView';
import { NO_BULK, bulkCommands, bulkPicked, bulkResult, bulkScope, refusalKeys, refusalVars } from './shopPlan';

/** A minimal shop view: only the fields the helpers read. */
function shop(over: Partial<{ id: string; sector: string; crew: number; price: number; pendingPrice: number | null; quality: number; marketing: number; maintained: boolean; nextChangeDay: number; fireOpenDay: number }> = {}): ShopView {
  const o = {
    id: 'b1', sector: 'food', crew: 0.75, price: 1, pendingPrice: null, quality: 0, marketing: 0, maintained: false,
    nextChangeDay: 4, fireOpenDay: 6, ...over,
  };
  return {
    id: o.id, sector: o.sector,
    settings: { crew: o.crew, price: o.price, pendingPrice: o.pendingPrice, quality: o.quality, marketing: o.marketing, maintained: o.maintained },
    price: { changeable: true, nextChangeDay: o.nextChangeDay, effectiveDay: null },
    manager: { stars: 0, fireOpenDay: o.fireOpenDay },
  } as unknown as ShopView;
}

describe('refusal copy keys', () => {
  it('every shop refusal code maps to its own three copy keys', () => {
    for (const [slug, code] of Object.entries(SHOP_REFUSAL)) {
      const k = refusalKeys(code);
      expect(k.what).toBe(`shop.refusal.${slug}.what`);
      expect(k.why).toBe(`shop.refusal.${slug}.why`);
      expect(k.do).toBe(`shop.refusal.${slug}.do`);
    }
  });

  it('an unknown code falls back to the generic copy, never to the raw code', () => {
    expect(refusalKeys('something.new')).toEqual({
      what: 'shop.refusal.unknown.what', why: 'shop.refusal.unknown.why', do: 'shop.refusal.unknown.do',
    });
  });

  it('the copy variables come from the shop the change was tried on', () => {
    const s = shop({ nextChangeDay: 9, fireOpenDay: 12 });
    expect(refusalVars(SHOP_REFUSAL.priceOncePerDay, s)).toEqual({ day: 9 });
    expect(refusalVars(SHOP_REFUSAL.managerTenure, s)).toEqual({ day: 12 });
    expect(refusalVars(SHOP_REFUSAL.cash, s)).toEqual({});
  });
});

describe('bulk changes', () => {
  it('a bulk plan needs at least one setting picked', () => {
    expect(bulkPicked(NO_BULK)).toBe(false);
    expect(bulkPicked({ ...NO_BULK, maintained: false })).toBe(true);
    expect(bulkPicked({ ...NO_BULK, crew: 1 })).toBe(true);
  });

  it('the scope is every shop, or the shops of one sector', () => {
    const shops = [shop({ id: 'a', sector: 'food' }), shop({ id: 'b', sector: 'retail' }), shop({ id: 'c', sector: 'food' })];
    expect(bulkScope(shops, 'all').map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(bulkScope(shops, 'food').map((s) => s.id)).toEqual(['a', 'c']);
    expect(bulkScope(shops, 'energy')).toEqual([]);
  });

  it('each lever becomes its own command, and a lever already at the chosen value sends nothing', () => {
    const s = shop({ crew: 1, quality: 2, marketing: 0, maintained: true, price: 1 });
    const cmds = bulkCommands(s, { crew: 1, price: 1.2, quality: 3, marketing: null, maintained: true });
    expect(cmds).toEqual([
      { type: 'biz.price', bizId: 'b1', price: 1.2 },
      { type: 'biz.quality', bizId: 'b1', level: 3 },
    ]);
    expect(bulkCommands(s, { ...NO_BULK, maintained: false })).toEqual([{ type: 'biz.maintain', bizId: 'b1', on: false }]);
  });

  it('a price already set for the next day is not sent again (it would spend the day change)', () => {
    const s = shop({ price: 1, pendingPrice: 1.1 });
    expect(bulkCommands(s, { ...NO_BULK, price: 1.1 })).toEqual([]);
    expect(bulkCommands(s, { ...NO_BULK, price: 1.2 })).toEqual([{ type: 'biz.price', bizId: 'b1', price: 1.2 }]);
  });

  it('the result counts the shops that took every change and each refusal with its copy variables', () => {
    const a = shop({ id: 'a', nextChangeDay: 7 });
    const b = shop({ id: 'b', nextChangeDay: 8 });
    const c = shop({ id: 'c', nextChangeDay: 9 });
    const r = bulkResult([a, b, c], [
      { shop: a, codes: [] },
      { shop: b, codes: [SHOP_REFUSAL.priceOncePerDay] },
      { shop: c, codes: [SHOP_REFUSAL.priceOncePerDay, SHOP_REFUSAL.priceOncePerDay] },
    ]);
    expect(r.n).toBe(3);
    expect(r.ok).toBe(1);
    expect(r.refusals).toEqual([{ code: SHOP_REFUSAL.priceOncePerDay, count: 2, vars: { day: 8 } }]);
  });

  it('a clean run has no refusals', () => {
    const a = shop({ id: 'a' });
    expect(bulkResult([a], [{ shop: a, codes: [] }])).toEqual({ n: 1, ok: 1, refusals: [] });
  });
});
