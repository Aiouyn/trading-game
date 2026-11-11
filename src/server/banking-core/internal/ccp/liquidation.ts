import type { Money, Qty } from "../../../../../packages/engine/core/types";
import type { MarginCcpOrder, MarginCcpRisk } from "./model";
const Z = BigInt(0), abs = (q: Qty) => q < Z ? -q : q;
function limitPrice(value: Money, factor: number, ceil: boolean): Money {
    const v = new DataView(new ArrayBuffer(8));
    v.setFloat64(0, factor, false);
    const hi = v.getUint32(0, false), lo = v.getUint32(4, false), e = ((hi >>> 20) & 2047) - 1023, n = BigInt(hi & 1048575) * BigInt(4294967296) + BigInt(lo) + BigInt(4503599627370496), d = BigInt(2) ** BigInt(52 - e), p = value * n;
    return p / d + (ceil && p % d !== Z ? BigInt(1) : Z);
}
/** Readonly fair-value liquidation instructions; the existing execution owner must certify actual fills. */
export function planMarginCcpLiquidation(risk: MarginCcpRisk, equity: Money, declared: number, tick: number, unfilled: ReadonlyMap<string, number> = new Map()): MarginCcpOrder[] {
    if (tick <= declared)
        return [];
    const target = equity <= Z ? risk.im : ((risk.im * BigInt(11) > equity * BigInt(10)) ? risk.im - equity * BigInt(10) / BigInt(11) : Z);
    let remaining = target;
    const positions = [...risk.positions].sort((a, b) => {
        if (a.marginalIm === Z || b.marginalIm === Z) {
            if (a.marginalIm !== b.marginalIm)
                return a.marginalIm > b.marginalIm ? -1 : 1;
        }
        if (a.expectedCost === Z || b.expectedCost === Z) {
            if (a.expectedCost !== b.expectedCost)
                return a.expectedCost === Z ? -1 : 1;
        }
        const x = a.marginalIm * b.expectedCost, y = b.marginalIm * a.expectedCost;
        return x > y ? -1 : x < y ? 1 : a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0;
    }), orders: MarginCcpOrder[] = [];
    for (const p of positions) {
        if (remaining <= Z && equity > Z)
            break;
        if (p.quantity === Z)
            continue;
        const volume = p.opening ? p.openingVolume : p.expectedTickVolume;
        if (!p.marketOpen) {
            orders.push({ created: declared, eligibleAt: declared + 1, memberId: risk.memberId, service: risk.service, assetId: p.assetId, side: p.quantity > Z ? "SELL" : "BUY", quantity: Z, limitPrice: p.fairValue, bandPpm: 0, openingOnly: true });
            continue;
        }
        let q = abs(p.quantity) < volume / BigInt(5) ? abs(p.quantity) : volume / BigInt(5);
        if (p.marginalIm > Z && equity > Z) {
            const needed = (remaining * abs(p.quantity) + p.marginalIm - BigInt(1)) / p.marginalIm;
            if (q > needed)
                q = needed;
        }
        if (q === Z)
            continue;
        const base = Math.max(5000, Math.min(30000, 2 * p.sigmaPpm * Math.sqrt(30))), band = Math.min(100000, base + 10000 * (unfilled.get(p.assetId) ?? Math.max(0, tick - declared - 1))), price = limitPrice(p.fairValue, p.quantity > Z ? 1 - band / 1000000 : 1 + band / 1000000, p.quantity > Z);
        orders.push({ created: declared, eligibleAt: declared + 1, memberId: risk.memberId, service: risk.service, assetId: p.assetId, side: p.quantity > Z ? "SELL" : "BUY", quantity: q, limitPrice: price, bandPpm: band, openingOnly: p.opening });
        remaining -= p.marginalIm * q / abs(p.quantity);
    }
    return orders;
}
