import type {CoreState} from "../../model";
import { createHash } from "node:crypto";
import type { Money } from "../../../../../packages/engine/core/types";
import type { LiquidityAccount, LiquidityBank, LiquidityState, LiquidityAsset } from "./model";
export const ZERO = BigInt(0), MICRO = BigInt(1000000), INSURANCE_CAP = BigInt(250000) * MICRO;
export const minMoney = (...values: Money[]): Money => values.reduce((a, b) => a < b ? a : b);
export const positive = (v: Money): Money => v > ZERO ? v : ZERO;
export function halfEven(n: Money, d: Money): Money {
    if (d <= ZERO || n < ZERO)
        throw new Error("LIQUIDITY_ROUND_DOMAIN");
    const q = n / d, r = n % d;
    return q + (r * BigInt(2) > d || (r * BigInt(2) === d && q % BigInt(2) !== ZERO) ? BigInt(1) : ZERO);
}
/** Round an exact binary64 hazard only at the final Money boundary, without a rate quantization grid. */
export function scaleLiquidityHazard(amount: Money, rate: number): Money {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1)
        throw new Error("LIQUIDITY_HAZARD_DOMAIN");
    if (rate === 0)
        return ZERO;
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, rate, false);
    const hi = view.getUint32(0, false), lo = view.getUint32(4, false), exponent = ((hi >>> 20) & 2047) - 1023;
    const mantissa = BigInt(hi & 1048575) * BigInt(4294967296) + BigInt(lo) + (exponent === -1023 ? ZERO : BigInt(4503599627370496));
    return halfEven(amount * mantissa, BigInt(2) ** BigInt(52 - (exponent === -1023 ? -1022 : exponent)));
}
export function insurancePremium(insuredAmount: Money, cet1: Money, rwa: Money, requirementPpm: number, base: number): Money {
    const denominator = rwa === ZERO ? BigInt(1) : MICRO * rwa;
    const shortfall = rwa === ZERO ? ZERO : positive(BigInt(requirementPpm) * rwa - cet1 * MICRO);
    let numerator = rwa === ZERO ? BigInt(cet1 < ZERO ? 4000 : base) : BigInt(base) * (denominator + BigInt(100) * shortfall);
    if (numerator < BigInt(500) * denominator)
        numerator = BigInt(500) * denominator;
    if (numerator > BigInt(4000) * denominator)
        numerator = BigInt(4000) * denominator;
    return halfEven(insuredAmount * numerator, denominator * MICRO * BigInt(364));
}
export const fraction = (n: Money, ppm: number): Money => halfEven(n * BigInt(ppm), MICRO);
export const balance = (a: LiquidityAccount): Money => a.lots.reduce((n, l) => n + l.amount, ZERO);
export const bankDeposits = (s: LiquidityState, id: string): Money => s.accounts.filter(a => a.bankId === id).reduce((n, a) => n + balance(a), ZERO);
export const marked = (a: LiquidityAsset, quantity: Money): Money => fraction(quantity, a.markPpm);
export const encumbered = (s: LiquidityState, a: LiquidityAsset, bankId: string): boolean => a.collateralFor !== null && s.notes.some(n => n.id === a.collateralFor && n.bankId === bankId && n.amount > ZERO);
export const loanAsset = (a: LiquidityAsset): boolean => a.kind === "LOAN" || a.kind === "MORTGAGE";
export const assetPosition = (a: LiquidityAsset, bankId: string): Money => a.holdings.filter(h => h.bankId === bankId).reduce((n, h) => n + h.quantity, ZERO);
export function restrictedReserves(s:LiquidityState,bankId:string):Money{const core=s as CoreState;let sum=ZERO;for(const row of core.cashOwnership??[]){if(row.bankId!==bankId)continue;const a=s.accounts.find(a=>a.id===row.accountId)!;sum+=balance(a)*BigInt(row.weightPpm)/MICRO;}return sum;}
export function liquiditySheet(s: LiquidityState, b: LiquidityBank) {
    const core=s as CoreState, interbankAssets=s.notes.filter(n=>n.creditor===b.id&&n.instrument==="INTERBANK").reduce((n,x)=>n+x.amount,ZERO), accruedAssets=(core.bankingMeta?.interbank??[]).filter(l=>l.lenderId===b.id).reduce((n,l)=>n+l.accrued,ZERO), accruedDebt=(core.bankingMeta?.interbank??[]).filter(l=>l.borrowerId===b.id).reduce((n,l)=>n+l.accrued,ZERO), depositInterest=(core.bankingMeta?.products??[]).filter(p=>s.accounts.find(a=>a.id===p.id)?.bankId===b.id).reduce((n,p)=>n+p.interestDue,ZERO), restricted=restrictedReserves(s,b.id), noncash = s.assets.reduce((n, a) => n + marked(a, assetPosition(a, b.id)), ZERO)+interbankAssets+accruedAssets, assets = b.reserves + restricted + noncash, deposits = bankDeposits(s, b.id), other = s.notes.filter(n => n.bankId === b.id).reduce((v, n) => v + n.amount, ZERO)+accruedDebt+depositInterest;
    return { assets, noncash, deposits, other, reserves:b.reserves+restricted, availableReserves:b.reserves,restrictedReserves:restricted, equity: assets - deposits - other };
}
export function liquidityBaseCash(s: LiquidityState): Money {
    return s.banks.reduce((n, b) => n + b.reserves, ZERO) + s.accounts.filter(a => a.bankId === null).reduce((n, a) => n + balance(a), ZERO) + s.dgf.reduce((n, f) => n + f.cash, ZERO) + s.mmfCash + s.authorityCash;
}
export function hashOrder(a: string, b: string): number {
    const hash = (id: string) => createHash("sha256").update(id).digest("hex");
    const x = hash(a), y = hash(b);
    return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
}
export function prorata<T>(items: T[], budget: Money, amount: (v: T) => Money, id: (v: T) => string): {
    item: T;
    paid: Money;
}[] {
    const ordered = [...items].sort((a, b) => hashOrder(id(a), id(b))), sum = ordered.reduce((n, v) => n + amount(v), ZERO), limit = minMoney(budget, sum);
    if (sum === ZERO)
        return ordered.map(item => ({ item, paid: ZERO }));
    const result = ordered.map(item => ({ item, paid: limit * amount(item) / sum }));
    let dust = limit - result.reduce((n, v) => n + v.paid, ZERO);
    for (const r of result)
        if (dust > ZERO && r.paid < amount(r.item)) {
            r.paid++;
            dust--;
        }
    return result;
}
export function insured(s: LiquidityState, b: LiquidityBank): Map<string, Money> {
    const result = new Map<string, Money>(), accounts = s.accounts.filter(a => a.bankId === b.id);
    const groups = [...new Set(accounts.map(a => a.group))].sort(hashOrder);
    for (const group of groups) {
        let cap = positive(INSURANCE_CAP - (b.resolution?.insuranceUsed.find(x => x.group === group)?.amount ?? ZERO));
        const sorted = accounts.filter(a => a.group === group).sort((a, c) => balance(a) > balance(c) ? -1 : balance(a) < balance(c) ? 1 : hashOrder(a.id, c.id));
        for (const a of sorted) {
            const cover = minMoney(cap, balance(a));
            result.set(a.id, cover);
            cap -= cover;
        }
    }
    return result;
}
export const insuredTotal = (s: LiquidityState, b: LiquidityBank): Money => [...insured(s, b).values()].reduce((a, c) => a + c, ZERO);
export function liquidityMetrics(s: LiquidityState, b: LiquidityBank) {
    const f = s.facts?.banks.find(f => f.bankId === b.id);
    if (!f)
        throw new Error("LIQUIDITY_NO_OBSERVATION");
    const sheet = liquiditySheet(s, b), cet1 = sheet.equity - f.intangibles - f.dta - f.unbookedLoss;
    let rwa = f.rwaAddon+sheet.restrictedReserves, l1 = b.reserves, l2a = ZERO, l2b = ZERO, rsf = sheet.restrictedReserves;
    for (const a of s.assets) {
        const v = marked(a, assetPosition(a, b.id));
        rwa += fraction(v, a.rwPpm);
        rsf += fraction(v, a.kind === "L1" ? 50000 : a.kind === "L2A" ? 150000 : a.kind === "MORTGAGE" ? 650000 : loanAsset(a) ? 850000 : 1000000);
        if (encumbered(s, a, b.id))
            continue;
        if (a.kind === "L1")
            l1 += v;
        else if (a.kind === "L2A")
            l2a += fraction(v, 850000);
        else if (a.kind === "L2B")
            l2b += fraction(v, 500000);
    }
    // Both caps apply to the final HQLA, not to the pre-cap total. These three bounds solve them jointly.
    const hqla = minMoney(l1 + l2a + l2b, (l1 + l2a) * BigInt(20) / BigInt(17), (l1 + l2b) * BigInt(5) / BigInt(3), l1 * BigInt(20) / BigInt(9));
    let out = f.maturingLiabilities + fraction(f.commitments, 100000) + fraction(f.financialCommitments, 400000), asf = positive(sheet.equity) + s.notes.filter(n => n.bankId === b.id && (["AT1", "SUB"].includes(n.rank) || (n.longTerm && n.instrument === "BOND"))).reduce((n, x) => n + x.amount, ZERO);
    const coverage = insured(s, b);
    for (const a of s.accounts.filter(a => a.bankId === b.id)) {
        const v = balance(a), cover = coverage.get(a.id) ?? ZERO;
        if (a.sector === "NATURAL") {
            out += fraction(cover, 50000) + fraction(v - cover, 100000);
            asf += fraction(v, 900000);
        }
        else if (a.sector === "FINANCIAL")
            out += v;
        else {
            out += fraction(v, a.sector === "OPERATIONAL" || a.control === "PLAYER" ? 250000 : 400000);
            asf += fraction(v, 500000);
        }
    }
    const inflow = minMoney(fraction(out, 750000), fraction(f.loanInflows, 500000) + f.interbankInflows), netOut = out - inflow;
    const leverageDenominator = sheet.assets + fraction(f.commitments + f.financialCommitments, 100000) + f.derivativeExposure;
    const tier1 = cet1 + s.notes.filter(n => n.bankId === b.id && n.rank === "AT1").reduce((n, x) => n + x.amount, ZERO);
    return { ...sheet, cet1, tier1, rwa, requirementPpm: 70000 + f.ccybPpm + b.sibSurchargePpm, hqla, netOut, asf, rsf, leverageDenominator, leverageOk: tier1 * MICRO >= leverageDenominator * BigInt(b.sib ? 35000 : 30000), lcrOk: hqla >= netOut, nsfrOk: asf >= rsf };
}
export function assertLiquidityAccounting(s: LiquidityState): void {
    if (s.mmfClaims.reduce((n, c) => n + c.amount, ZERO) !== s.mmfCash || s.mmfClaims.some(c => c.amount < ZERO))
        throw new Error("LIQUIDITY_MMF_CUSTODY");
    if (liquidityBaseCash(s) + s.sinks !== s.openingM0)
        throw new Error("LIQUIDITY_BASE_MONEY_IDENTITY");
    if (s.banks.some(b => b.reserves < ZERO) || s.accounts.some(a => a.lots.some(l => l.amount < ZERO)) || s.notes.some(n => n.amount < ZERO) || s.dgf.some(f => f.cash < ZERO) || s.mmfCash < ZERO || s.authorityCash < ZERO || s.sinks < ZERO)
        throw new Error("LIQUIDITY_NEGATIVE_CASH");
    for (const b of s.banks) {
        const sheet = liquiditySheet(s, b);
        if (sheet.assets !== sheet.deposits + sheet.other + sheet.equity)
            throw new Error("LIQUIDITY_BALANCE_SHEET");
    }
    for (const a of s.assets) {
        if (a.holdings.some(h => h.quantity < ZERO) || (!(s as CoreState).creditBooks?.some(b=>b.loans.some(l=>l.assetId===a.id))&&a.holdings.reduce((n, h) => n + h.quantity, ZERO) !== s.openingPositions.find(p => p.assetId === a.id)?.quantity))
            throw new Error("LIQUIDITY_ASSET_OWNERSHIP");
    }
    for (const a of s.accounts) {
        const reserved = s.queue.filter(q => q.from === a.id).reduce((n, q) => n + q.amount, ZERO);
        if (reserved > balance(a))
            throw new Error("LIQUIDITY_DOUBLE_RESERVED");
    }
}
