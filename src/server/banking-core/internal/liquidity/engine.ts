import { TICKS_PER_CHAPTER, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from "../../../../../packages/engine/core/calendar/constants";
import { liquiditySigmoid as sigmoid } from "./confidence-math";
import type { Money } from "../../../../../packages/engine/core/types";
import { assertLiquidityAccounting, assetPosition, balance, bankDeposits, encumbered, fraction, halfEven, hashOrder, insurancePremium, scaleLiquidityHazard, insured, insuredTotal, liquidityBaseCash, liquidityMetrics, loanAsset, marked, MICRO, minMoney, positive, prorata, ZERO } from "./accounting";
import { liquidityFingerprint } from "./boundary";
import type { LiquidityAccount, LiquidityAssetBid, LiquidityBank, LiquidityFrame, LiquidityGenesis, LiquidityIntent, LiquidityLot, LiquidityNote, LiquidityPayment, LiquidityResolutionBid, LiquidityState } from "./model";
const clone = <T>(v: T): T => structuredClone(v);
const operating = (b: LiquidityBank): boolean => ["ACTIVE", "WATCH", "RESTRICTED"].includes(b.status);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const asRatio = (n: Money, d: Money): number => d === ZERO ? 0 : Number(n) / Number(d);
const bank = (s: LiquidityState, id: string): LiquidityBank => {
    const b = s.banks.find(b => b.id === id);
    if (!b)
        throw new Error("LIQUIDITY_UNKNOWN_BANK");
    return b;
};
const deposit = (s: LiquidityState, id: string): LiquidityAccount => {
    const a = s.accounts.find(a => a.id === id);
    if (!a)
        throw new Error("LIQUIDITY_UNKNOWN_ACCOUNT");
    return a;
};
const fund = (s: LiquidityState, b: LiquidityBank) => s.dgf.find(f => f.bloc === b.bloc)!;
function event(s: LiquidityState, b: LiquidityBank, kind: string, amount = ZERO): void {
    s.history.push({ tick: s.tick, bankId: b.id, kind, amount });
}
function removeLots(a: LiquidityAccount, amount: Money): LiquidityLot[] {
    let left = amount;
    const out: LiquidityLot[] = [];
    for (const lot of a.lots) {
        const q = minMoney(lot.amount, left);
        if (q > ZERO) {
            out.push({ ...lot, amount: q });
            lot.amount -= q;
            left -= q;
        }
    }
    a.lots = a.lots.filter(l => l.amount > ZERO);
    if (left !== ZERO)
        throw new Error("LIQUIDITY_INSUFFICIENT_FUNDS");
    return out;
}
function addMoney(a: LiquidityAccount, amount: Money, lineage: string, tick: number | null = null): void {
    if (amount > ZERO)
        a.lots.push({ lineage, amount, countedAt: tick });
}
function recordInsuranceUse(b: LiquidityBank, group: string, amount: Money): void {
    if (!b.resolution || amount === ZERO)
        return;
    const old = b.resolution.insuranceUsed.find(v => v.group === group);
    if (old)
        old.amount += amount;
    else
        b.resolution.insuranceUsed.push({ group, amount });
}
function recordOutflow(s: LiquidityState, b: LiquidityBank, lots: LiquidityLot[], base: Money): void {
    let amount = ZERO;
    for (const l of lots)
        if (l.countedAt === null || s.tick - l.countedAt >= 30) {
            amount += l.amount;
            l.countedAt = s.tick;
        }
    if (amount > ZERO)
        b.outflows.push({ tick: s.tick, amount, base });
}
function ratioOut(s: LiquidityState, b: LiquidityBank): number {
    const rows = b.outflows.filter(x => x.tick > s.tick - 720);
    if (!rows.length)
        return 0;
    return asRatio(rows.reduce((n, x) => n + x.amount, ZERO), rows[0].base);
}
function maybeRun(s: LiquidityState, b: LiquidityBank): void {
    if (!operating(b))
        return;
    const out = ratioOut(s, b);
    if (!b.run && out >= .10) {
        b.run = true;
        b.calmSince = null;
        event(s, b, "bank.run.started");
    }
    if (b.run) {
        if (b.confidence >= .60 && out < .02) {
            if (b.calmSince === null)
                b.calmSince = s.tick;
            if (s.tick - b.calmSince >= 720) {
                b.run = false;
                b.calmSince = null;
                event(s, b, "bank.run.ended");
            }
        }
        else
            b.calmSince = null;
    }
}
function move(s: LiquidityState, p: LiquidityPayment): boolean {
    const from = deposit(s, p.from);
    if (balance(from) < p.amount)
        return false;
    if (p.to === "@MMF") {
        if (from.bankId === null)
            return false;
        const source = bank(s, from.bankId);
        if (source.reserves < p.amount || !operating(source))
            return false;
        const base = bankDeposits(s, source.id), lots = removeLots(from, p.amount);
        source.reserves -= p.amount;
        s.mmfCash += p.amount;
        const claim = s.mmfClaims.find(c => c.owner === from.owner);
        if (claim)
            claim.amount += p.amount;
        else
            s.mmfClaims.push({ owner: from.owner, group: from.group, amount: p.amount });
        recordOutflow(s, source, lots, base);
        return true;
    }
    const to = deposit(s, p.to);
    const source = from.bankId === null ? null : bank(s, from.bankId), dest = to.bankId === null ? null : bank(s, to.bankId), same = from.bankId === to.bankId;
    let covered = ZERO;
    if (source?.resolution && !operating(source)) {
        covered = minMoney(p.amount, insured(s, source).get(from.id) ?? ZERO);
        if (source.status === "LIQUIDATING" || source.status === "CLOSED" || source.status === "SOLD")
            return false;
        if (s.tick < source.resolution.insuranceDeadline && p.amount > covered)
            return false;
    }
    if (!same && source && source.reserves < p.amount)
        return false;
    const base = source ? bankDeposits(s, source.id) : ZERO, lots = removeLots(from, p.amount);
    if (!same) {
        if (source) {
            source.reserves -= p.amount;
            recordOutflow(s, source, lots, base);
            recordInsuranceUse(source, from.group, covered);
        }
        if (dest)
            dest.reserves += p.amount;
    }
    to.lots.push(...lots);
    return true;
}
function flushQueue(s: LiquidityState): void {
    for (const q of [...s.queue].sort((a, b) => a.created - b.created || hashOrder(a.id, b.id))) {
        if (move(s, q)) {
            s.queue = s.queue.filter(p => p.id !== q.id);
            const source = deposit(s, q.from).bankId;
            if (source)
                event(s, bank(s, source), "payment.settled", q.amount);
        }
    }
}
function newState(g: LiquidityGenesis): LiquidityState {
    const s: LiquidityState = { world: g.world, tick: -1, banks: g.banks.map(b => ({ ...clone(b), status: "ACTIVE", confidence: .90, run: false, calmSince: null, failedAt: null, ownerWiped: false, charterBanUntil: null, outflows: [], resolution: null })), accounts: g.accounts.map(a => {
            const { cash, ...rest } = a;
            return { ...rest, lots: cash === ZERO ? [] : [{ lineage: "genesis/" + a.id, amount: cash, countedAt: null }] };
        }), assets: clone(g.assets), notes: clone(g.notes), dgf: clone(g.dgf), mmfCash: ZERO, mmfClaims: [], authorityCash: ZERO, sinks: ZERO, openingM0: ZERO, openingPositions: g.assets.map(a => ({ assetId: a.id, quantity: a.holdings.reduce((n, h) => n + h.quantity, ZERO) })), queue: [], history: [], receipts: [], facts: null };
    s.openingM0 = liquidityBaseCash(s);
    return s;
}
function updateConfidence(s: LiquidityState): void {
    const start = clone(s);
    for (const b of s.banks.filter(operating).sort((a, b) => hashOrder(a.id, b.id))) {
        const f = s.facts!.banks.find(f => f.bankId === b.id)!, m = liquidityMetrics(start, bank(start, b.id));
        const capital = clamp((f.publishedCet1Ppm / 1e6 - asRatio(f.publicLoss, f.publishedRwa) - m.requirementPpm / 1e6) / .02, -3, 3), equity = f.equityReturnPpm === null ? 0 : clamp(f.equityReturnPpm / 1e5, -3, 1), cds = f.cdsBps === null ? 0 : clamp(f.cdsBps / 300, 0, 3), rumor = clamp(f.rumors.reduce((n, r) => n + Math.min(.3, r.intensityPpm / 1e6), 0), 0, 1);
        let contagion = 0;
        for (const other of start.banks)
            if (other.id !== b.id && other.bloc === b.bloc && (other.run || (other.failedAt !== null && s.tick - other.failedAt < 7 * 720))) {
                contagion += (other.tier === b.tier ? .5 : 0) + (other.segment === b.segment ? .3 : 0) + ((f.exposures.find(e => e.bankId === other.id)?.amount ?? ZERO) * BigInt(20) > positive(m.tier1) ? .5 : 0);
            }
        const z = 2 + .8 * capital + .6 * equity - .8 * cds - 1.5 * rumor - Math.min(1, contagion) - .8 * Number(f.stigma) - 2 * clamp(Math.max(0, ratioOut(start, bank(start, b.id)) - .02) / .10, 0, 2), target = sigmoid(z);
        b.confidence += (target < b.confidence ? .30 : .05) * (target - b.confidence);
    }
}
function receiver(s: LiquidityState, a: LiquidityAccount, b: LiquidityBank): LiquidityAccount {
    let dest = s.accounts.find(x => x.bankId === b.id && x.owner === a.owner);
    if (!dest) {
        dest = { id: "@receive/" + b.id + "/" + a.owner, bankId: b.id, owner: a.owner, group: a.group, control: a.control, sector: a.sector, lots: [] };
        s.accounts.push(dest);
    }
    return dest;
}
function npcFlight(s: LiquidityState): void {
    const start = clone(s), requests: {
        source: string;
        targetBankId: string | null;
        amount: Money;
        mmf: boolean;
    }[] = [];
    for (const b of start.banks.filter(operating).sort((a, b) => hashOrder(a.id, b.id))) {
        const x = Math.max(0, (.60 - b.confidence) / .60), cover = insured(start, b);
        for (const a of start.accounts.filter(a => a.bankId === b.id && a.control === "NPC").sort((a, b) => hashOrder(a.id, b.id))) {
            const reserved = s.queue.filter(q => q.from === a.id).reduce((n, q) => n + q.amount, ZERO), v = positive(balance(a) - reserved), iv = minMoney(v, cover.get(a.id) ?? ZERO);
            const hazard = scaleLiquidityHazard;
            const amount = minMoney(v, a.sector === "FINANCIAL" ? hazard(v, .0004 + .20 * x * x) : hazard(iv, .0002 + .008 * x * x) + hazard(v - iv, .0002 + .08 * x * x));
            if (amount === ZERO)
                continue;
            const mmf = a.sector === "FINANCIAL" ? fraction(amount, 300000) : ZERO;
            if (mmf > ZERO)
                requests.push({ source: a.id, targetBankId: null, amount: mmf, mmf: true });
            const destinations = start.banks.filter(k => k.id !== b.id && k.bloc === b.bloc && operating(k)).map(k => ({ b: k, weight: BigInt(Math.round(k.confidence * k.confidence * 1e12)) * bankDeposits(start, k.id) })).filter(v => v.weight > ZERO);
            const total = destinations.reduce((n, d) => n + d.weight, ZERO);
            if (total > ZERO) {
                const ordered = destinations.sort((a, b) => hashOrder(a.b.id, b.b.id)), parts = ordered.map(d => ({ bankId: d.b.id, amount: (amount - mmf) * d.weight / total }));
                let dust = amount - mmf - parts.reduce((n, p) => n + p.amount, ZERO);
                for (const p of parts)
                    if (dust > ZERO) {
                        p.amount++;
                        dust--;
                    }
                for (const p of parts)
                    if (p.amount > ZERO)
                        requests.push({ source: a.id, targetBankId: p.bankId, amount: p.amount, mmf: false });
            }
        }
    }
    for (const [i, r] of requests.entries()) {
        const a = deposit(s, r.source), b = bank(s, a.bankId!);
        if (r.mmf) {
            const p = { id: "@mmf/" + s.tick + "/" + i, from: a.id, to: "@MMF", amount: r.amount, created: s.tick };
            if (!move(s, p))
                s.queue.push(p);
            else
                event(s, b, "npc.mmf.flight", r.amount);
        }
        else {
            const dest = receiver(s, a, bank(s, r.targetBankId!)), id = "@npc/" + s.tick + "/" + i;
            const payment = { id, from: a.id, to: dest.id, amount: r.amount, created: s.tick };
            if (!move(s, payment))
                s.queue.push(payment);
        }
    }
}
function buyerCash(s: LiquidityState, bid: LiquidityAssetBid): Money {
    return bid.buyer.kind === "BANK" ? bank(s, bid.buyer.id).reserves : balance(deposit(s, bid.buyer.id));
}
function sellAssets(s: LiquidityState, b: LiquidityBank, liquidation: boolean, used: Map<string, Money>): void {
    for (const a of [...s.assets].sort((a, c) => Number(loanAsset(a)) - Number(loanAsset(c)) || hashOrder(a.id, c.id))) {
        if (assetPosition(a, b.id) === ZERO || (!liquidation && (encumbered(s, a, b.id) || (!loanAsset(a) && !["L1", "L2A", "L2B"].includes(a.kind)))))
            continue;
        for (const bid of s.facts!.bids.filter(x => x.assetId === a.id).sort((a, c) => c.pricePpm - a.pricePpm || hashOrder(a.id, c.id))) {
            if (bid.buyer.kind === "BANK" && (bid.buyer.id === b.id || !operating(bank(s, bid.buyer.id))))
                continue;
            if (!liquidation && loanAsset(a) && (bid.buyer.kind !== "BANK" || !bank(s, bid.buyer.id).npc || bid.pricePpm !== Math.round(a.markPpm * .85)))
                continue;
            const security = !loanAsset(a), cap = security ? positive(a.adv / BigInt(5) - (used.get("adv/" + a.id) ?? ZERO)) : assetPosition(a, b.id), left = positive(bid.quantity - (used.get("bid/" + bid.id) ?? ZERO));
            let q = minMoney(assetPosition(a, b.id), cap, left, buyerCash(s, bid) * MICRO / BigInt(bid.pricePpm));
            if (q === ZERO)
                continue;
            if (bid.buyer.kind === "BANK") {
                const buyer = bank(s, bid.buyer.id), m = liquidityMetrics(s, buyer), oldQuantity = assetPosition(a, buyer.id), oldMark = marked(a, oldQuantity), oldRisk = fraction(oldMark, a.rwPpm);
                const fits = (quantity: Money): boolean => {
                    const value = marked(a, oldQuantity + quantity), gain = value - oldMark - fraction(quantity, bid.pricePpm), cet1 = m.cet1 + gain, rwa = m.rwa + fraction(value, a.rwPpm) - oldRisk;
                    return cet1 * MICRO >= rwa * BigInt(m.requirementPpm) && (m.tier1 + gain) * MICRO >= (m.leverageDenominator + gain) * BigInt(buyer.sib ? 35000 : 30000);
                };
                if (!fits(q)) {
                    if (!fits(ZERO))
                        continue;
                    let low = ZERO, high = q;
                    while (low < high) {
                        const mid = (low + high + BigInt(1)) / BigInt(2);
                        if (fits(mid))
                            low = mid;
                        else
                            high = mid - BigInt(1);
                    }
                    q = low;
                }
            }
            const cash = fraction(q, bid.pricePpm);
            if (q === ZERO || cash === ZERO)
                continue;
            if (bid.buyer.kind === "BANK")
                bank(s, bid.buyer.id).reserves -= cash;
            else
                removeLots(deposit(s, bid.buyer.id), cash);
            b.reserves += cash;
            const source = a.holdings.find(h => h.bankId === b.id)!;
            source.quantity -= q;
            let target = a.holdings.find(h => bid.buyer.kind === "BANK" ? h.bankId === bid.buyer.id : h.accountId === bid.buyer.id);
            if (!target) {
                target = { bankId: bid.buyer.kind === "BANK" ? bid.buyer.id : null, accountId: bid.buyer.kind === "ACCOUNT" ? bid.buyer.id : null, quantity: ZERO };
                a.holdings.push(target);
            }
            target.quantity += q;
            used.set("adv/" + a.id, (used.get("adv/" + a.id) ?? ZERO) + q);
            used.set("bid/" + bid.id, (used.get("bid/" + bid.id) ?? ZERO) + q);
            if (liquidation && encumbered(s, a, b.id) && a.collateralFor) {
                const r = b.resolution!, old = r.collateralRecovered.find(v => v.noteId === a.collateralFor);
                if (old)
                    old.amount += cash;
                else
                    r.collateralRecovered.push({ noteId: a.collateralFor, amount: cash });
            }
            event(s, b, liquidation ? "estate.asset.sold" : "run.asset.sold", cash);
            if (!liquidation && b.reserves >= s.queue.filter(p => deposit(s, p.from).bankId === b.id).reduce((n, p) => n + p.amount, ZERO))
                return;
        }
    }
}
function cashToCreditor(s: LiquidityState, b: LiquidityBank, creditor: string, amount: Money, lineage: string): void {
    if (amount === ZERO)
        return;
    b.reserves -= amount;
    if (creditor === "@DGF")
        fund(s, b).cash += amount;
    else if (creditor === "@AUTH")
        s.authorityCash += amount;
    else if (creditor === "@SINK")
        s.sinks += amount;
    else if (s.banks.some(k => k.id === creditor))
        bank(s, creditor).reserves += amount;
    else {
        let a = deposit(s, creditor);
        if (a.bankId === b.id && !operating(b)) {
            let outside = s.accounts.find(x => x.owner === a.owner && x.bankId === null);
            if (!outside) {
                outside = { ...a, id: "@cash/" + a.id, bankId: null, lots: [] };
                s.accounts.push(outside);
            }
            a = outside;
        }
        if (a.bankId !== null)
            bank(s, a.bankId).reserves += amount;
        addMoney(a, amount, lineage);
    }
}
function addCost(s: LiquidityState, b: LiquidityBank, id: string, creditor: string, amount: Money): void {
    if (amount === ZERO)
        return;
    const existing = s.notes.find(n => n.id === id);
    if (existing)
        existing.amount += amount;
    else
        s.notes.push({ id, bankId: b.id, creditor, rank: "COST", instrument: "OTHER", amount, longTerm: false });
}
function dayCharges(s: LiquidityState): void {
    for (const b of s.banks.filter(operating).sort((a, b) => hashOrder(a.id, b.id))) {
        const m = liquidityMetrics(s, b), f = s.facts!.banks.find(f => f.bankId === b.id)!, dgf = fund(s, b), blocInsured = s.banks.filter(x => x.bloc === b.bloc && operating(x)).reduce((n, x) => n + insuredTotal(s, x), ZERO), base = dgf.cash * BigInt(1000) > blocInsured * BigInt(15) ? 400 : 800, premium = insurancePremium(insuredTotal(s, b), m.cet1, m.rwa, m.requirementPpm, base), paid = minMoney(b.reserves, premium);
        b.reserves -= paid;
        dgf.cash += paid;
        addCost(s, b, "@premium/" + b.id, "@DGF", premium - paid);
        if (paid > ZERO)
            event(s, b, "insurance.premium", paid);
        const shortfall = positive(fraction(bankDeposits(s, b.id), f.rrPpm) - b.reserves), penalty = halfEven(shortfall * BigInt(f.mlfrPpm + 20000), MICRO * BigInt(364)), penaltyPaid = minMoney(b.reserves, penalty), creditor = b.npc ? "@AUTH" : "@SINK";
        cashToCreditor(s, b, creditor, penaltyPaid, "@penalty");
        addCost(s, b, "@rr/" + b.id, creditor, penalty - penaltyPaid);
    }
}
function openResolution(s: LiquidityState, b: LiquidityBank, trigger: "SOLVENCY" | "LIQUIDITY" | "REGULATOR"): void {
    b.status = "IN_RESOLUTION";
    b.run = false;
    b.calmSince = null;
    b.failedAt = s.tick;
    b.ownerWiped = true;
    b.charterBanUntil = s.tick + TICKS_PER_CHAPTER;
    b.resolution = { opened: s.tick, auctionEnd: s.tick + 30, insuranceDeadline: s.tick + 720, liquidationDeadline: s.tick + 14 * 720, trigger, tool: "AUCTION", bids: [], insuranceUsed: [], collateralRecovered: [], creditorLosses: [], equityRights: [], insuranceShortfall: ZERO, estatePending: false, finalized: false };
    event(s, b, "bank.failed");
    event(s, b, "ccp.member.default.handoff");
    event(s, b, "legacy.bank.failure.handoff");
}
function dayStatus(s: LiquidityState): void {
    for (const b of s.banks.filter(operating).sort((a, b) => hashOrder(a.id, b.id))) {
        const m = liquidityMetrics(s, b), f = s.facts!.banks.find(f => f.bankId === b.id)!;
        if (m.cet1 * MICRO < m.rwa * BigInt(20000) || m.cet1 < ZERO) {
            openResolution(s, b, "SOLVENCY");
            continue;
        }
        if (s.queue.some(q => deposit(s, q.from).bankId === b.id)) {
            openResolution(s, b, "LIQUIDITY");
            continue;
        }
        if (f.regulatorFailure) {
            openResolution(s, b, "REGULATOR");
            continue;
        }
        b.status = m.cet1 * MICRO < m.rwa * BigInt(45000) || !m.leverageOk ? "RESTRICTED" : m.cet1 * MICRO < m.rwa * BigInt(m.requirementPpm) || !m.lcrOk || !m.nsfrOk ? "WATCH" : "ACTIVE";
    }
}
function command(s: LiquidityState, c: LiquidityIntent): string {
    if (c.kind === "MOVE") {
        const a = s.accounts.find(a => a.id === c.from), dest = s.accounts.find(a => a.id === c.to);
        if (!a || !dest || a.owner !== c.actor || dest.owner !== c.actor || c.from === c.to)
            return "NOT_OWNED";
        if (a.bankId !== null && bank(s, a.bankId).bloc !== (dest.bankId === null ? bank(s, a.bankId).bloc : bank(s, dest.bankId).bloc))
            return "CROSS_BLOC_UNSUPPORTED";
        const reserved = s.queue.filter(q => q.from === a.id).reduce((n, q) => n + q.amount, ZERO);
        if (balance(a) - reserved < c.amount)
            return "INSUFFICIENT_BALANCE";
        if (a.bankId !== null) {
            const b = bank(s, a.bankId);
            if (b.status === "LIQUIDATING" || b.status === "CLOSED")
                return "ESTATE_CLAIM";
            if (b.resolution && !operating(b) && s.tick < b.resolution.insuranceDeadline && (insured(s, b).get(a.id) ?? ZERO) < c.amount)
                return "UNINSURED_FROZEN";
        }
        const payment = { id: c.id, from: c.from, to: c.to, amount: c.amount, created: s.tick };
        if (move(s, payment))
            return "SETTLED";
        s.queue.push(payment);
        return "QUEUED";
    }
    if (c.kind === "CAPITAL") {
        const b = s.banks.find(b => b.id === c.bankId), a = s.accounts.find(a => a.id === c.accountId);
        if (!b || !a || deposit(s, b.ownerAccountId).owner !== c.actor || a.owner !== c.actor || a.bankId !== null || !operating(b))
            return "NOT_OWNER_OR_OPERATING";
        if (balance(a) < c.amount)
            return "INSUFFICIENT_CAPITAL";
        removeLots(a, c.amount);
        b.reserves += c.amount;
        event(s, b, "capital.injected", c.amount);
        return "INJECTED";
    }
    const b = s.banks.find(b => b.id === c.bankId), buyer = s.banks.find(b => b.id === c.buyerBankId);
    if (!b?.resolution || b.resolution.tool !== "AUCTION" || s.tick >= b.resolution.auctionEnd || !buyer || buyer.id === b.id || buyer.bloc !== b.bloc || buyer.status !== "ACTIVE" || deposit(s, buyer.ownerAccountId).owner !== c.actor)
        return "INELIGIBLE_BID";
    b.resolution.bids.push({ id: c.id, bankId: b.id, buyerBankId: buyer.id, price: c.price, capitalInjection: c.capitalInjection });
    return "BID_RECORDED";
}
function performAcquisition(s: LiquidityState, b: LiquidityBank, bid: LiquidityResolutionBid): boolean {
    const buyer = bank(s, bid.buyerBankId), owner = deposit(s, buyer.ownerAccountId), dgf = fund(s, b);
    if (buyer.status !== "ACTIVE" || balance(owner) < bid.capitalInjection || buyer.reserves + bid.capitalInjection < positive(bid.price) || dgf.cash < positive(-bid.price))
        return false;
    removeLots(owner, bid.capitalInjection);
    buyer.reserves += bid.capitalInjection;
    buyer.reserves -= bid.price;
    dgf.cash += bid.price;
    buyer.reserves += b.reserves;
    b.reserves = ZERO;
    for (const a of s.accounts)
        if (a.bankId === b.id)
            a.bankId = buyer.id;
    for (const n of s.notes)
        if (n.bankId === b.id)
            n.bankId = buyer.id;
    for (const a of s.assets) {
        const source = a.holdings.find(h => h.bankId === b.id);
        if (!source)
            continue;
        let target = a.holdings.find(h => h.bankId === buyer.id);
        if (!target) {
            target = { bankId: buyer.id, accountId: null, quantity: ZERO };
            a.holdings.push(target);
        }
        target.quantity += source.quantity;
        source.quantity = ZERO;
    }
    const m = liquidityMetrics(s, buyer), queued = s.queue.filter(q => deposit(s, q.from).bankId === buyer.id).reduce((n, q) => n + q.amount, ZERO);
    if (m.cet1 * MICRO < m.rwa * BigInt(m.requirementPpm + 10000) || !m.leverageOk || buyer.reserves < queued)
        return false;
    b.status = "SOLD";
    b.resolution!.tool = "PA";
    b.resolution!.finalized = true;
    event(s, b, "resolution.pa", bid.price);
    flushQueue(s);
    return true;
}
function executeBailin(s: LiquidityState, b: LiquidityBank): boolean {
    const m = liquidityMetrics(s, b), cover = insured(s, b), bonds = s.notes.filter(n => n.bankId === b.id && ["AT1", "SUB", "SENIOR"].includes(n.rank) && n.instrument === "BOND"), nonNatural = s.accounts.filter(a => a.bankId === b.id && a.sector !== "NATURAL"), eligible = bonds.reduce((n, v) => n + v.amount, ZERO) + nonNatural.reduce((n, a) => n + balance(a) - (cover.get(a.id) ?? ZERO), ZERO), need = positive(fraction(m.rwa, 100000) - m.cet1);
    if (eligible * BigInt(100) < (m.deposits + m.other) * BigInt(8) || need === ZERO)
        return false;
    const claims: {
        id: string;
        creditor: string;
        rank: number;
        amount: Money;
        note: LiquidityNote | null;
        account: LiquidityAccount | null;
    }[] = [];
    for (const n of bonds)
        claims.push({ id: n.id, creditor: n.creditor, rank: n.rank === "AT1" ? 1 : n.rank === "SUB" ? 2 : 3, amount: n.amount, note: n, account: null });
    for (const a of s.accounts.filter(a => a.bankId === b.id))
        claims.push({ id: a.id, creditor: a.id, rank: a.sector === "NATURAL" ? 5 : 4, amount: balance(a) - (cover.get(a.id) ?? ZERO), note: null, account: a });
    if (claims.reduce((n, c) => n + c.amount, ZERO) < need)
        return false;
    let left = need;
    for (let rank = 1; rank <= 5; rank++) {
        for (const { item, paid } of prorata(claims.filter(c => c.rank === rank), left, c => c.amount, c => c.id)) {
            if (paid === ZERO)
                continue;
            if (item.note)
                item.note.amount -= paid;
            else {
                removeLots(item.account!, paid);
                const available = balance(item.account!), queued = s.queue.filter(q => q.from === item.account!.id).sort((a, b) => a.created - b.created || hashOrder(a.id, b.id));
                let used = ZERO;
                for (const q of queued) {
                    q.amount = minMoney(q.amount, positive(available - used));
                    used += q.amount;
                }
                s.queue = s.queue.filter(q => q.amount > ZERO);
            }
            b.resolution!.equityRights.push({ creditor: item.creditor, amount: paid });
            left -= paid;
        }
    }
    if (left !== ZERO)
        throw new Error("LIQUIDITY_BAILIN_SHORTFALL");
    const queued = s.queue.filter(q => deposit(s, q.from).bankId === b.id).reduce((n, q) => n + q.amount, ZERO);
    if (b.reserves < queued)
        return false;
    b.resolution!.tool = "BAIL_IN";
    b.resolution!.finalized = true;
    b.status = "WATCH";
    event(s, b, "resolution.bail_in", need);
    flushQueue(s);
    return true;
}
function liquidationCost(s: LiquidityState, b: LiquidityBank): Money {
    const total = s.assets.reduce((n, a) => n + fraction(marked(a, assetPosition(a, b.id)), loanAsset(a) ? 750000 : 900000), b.reserves);
    const secured = s.notes.filter(n => n.bankId === b.id && n.rank === "SECURED").reduce((n, c) => n + minMoney(c.amount, s.assets.filter(a => a.collateralFor === c.id).reduce((n, a) => n + fraction(marked(a, assetPosition(a, b.id)), loanAsset(a) ? 750000 : 900000), ZERO)), ZERO), costs = s.notes.filter(n => n.bankId === b.id && n.rank === "COST").reduce((n, c) => n + c.amount, ZERO), protectedAmount = insuredTotal(s, b);
    return positive(protectedAmount - positive(total - secured - costs));
}
function finishAuctions(s: LiquidityState): void {
    for (const bankId of s.banks.filter(b => b.resolution?.tool === "AUCTION" && s.tick >= b.resolution.auctionEnd).map(b => b.id).sort(hashOrder)) {
        const b = bank(s, bankId);
        const alternatives: {
            cost: Money;
            order: number;
            state: LiquidityState;
        }[] = [];
        for (const bid of [...b.resolution!.bids].sort((a, c) => hashOrder(a.id, c.id))) {
            const trial = clone(s);
            if (performAcquisition(trial, bank(trial, b.id), bid))
                alternatives.push({ cost: -bid.price, order: 0, state: trial });
        }
        const trial = clone(s), canBailin = executeBailin(trial, bank(trial, b.id));
        if (canBailin)
            alternatives.push({ cost: ZERO, order: 1, state: trial });
        alternatives.sort((a, c) => a.cost < c.cost ? -1 : a.cost > c.cost ? 1 : a.order - c.order);
        const liquidation = liquidationCost(s, b), chosen = b.sib && canBailin ? alternatives.find(a => a.order === 1) : alternatives.find(a => a.cost <= liquidation);
        if (chosen) {
            Object.assign(s, chosen.state);
            continue;
        }
        b.resolution!.tool = "LIQUIDATION";
        b.status = "LIQUIDATING";
        s.queue = s.queue.filter(q => deposit(s, q.from).bankId !== b.id);
        event(s, b, "resolution.liquidation");
    }
}
function payInsurance(s: LiquidityState, b: LiquidityBank): void {
    const r = b.resolution!;
    if (r.tool !== "LIQUIDATION" || s.tick < r.insuranceDeadline || r.finalized)
        return;
    const amount = insured(s, b), claims = s.accounts.filter(a => a.bankId === b.id && (amount.get(a.id) ?? ZERO) > ZERO), dgf = fund(s, b), dest = s.banks.filter(k => k.id !== b.id && k.npc && k.status === "ACTIVE" && k.bloc === b.bloc).sort((a, c) => bankDeposits(s, a.id) > bankDeposits(s, c.id) ? -1 : bankDeposits(s, a.id) < bankDeposits(s, c.id) ? 1 : hashOrder(a.id, c.id))[0];
    if (dest) {
        for (const { item: a, paid } of prorata(claims, dgf.cash, a => amount.get(a.id)!, a => a.id)) {
            if (paid === ZERO)
                continue;
            removeLots(a, paid);
            recordInsuranceUse(b, a.group, paid);
            const target = receiver(s, a, dest);
            dgf.cash -= paid;
            dest.reserves += paid;
            addMoney(target, paid, "@insurance/" + b.id + "/" + a.id);
            const id = "@subrogation/" + b.id, old = s.notes.find(n => n.id === id);
            if (old)
                old.amount += paid;
            else
                s.notes.push({ id, bankId: b.id, creditor: "@DGF", rank: "INSURED", instrument: "OTHER", amount: paid, longTerm: false });
            event(s, b, "insurance.paid", paid);
        }
    }
    r.insuranceShortfall = insuredTotal(s, b);
    if (r.insuranceShortfall > ZERO && !s.history.some(e => e.bankId === b.id && e.kind === "insurance.unfunded"))
        event(s, b, "insurance.unfunded", r.insuranceShortfall);
}
function liquidate(s: LiquidityState, b: LiquidityBank): void {
    const r = b.resolution!;
    if (r.finalized)
        return;
    const unsold = s.assets.some(a => assetPosition(a, b.id) > ZERO);
    if (unsold) {
        if (s.tick >= r.liquidationDeadline) {
            r.estatePending = true;
            if (!s.history.some(e => e.bankId === b.id && e.kind === "estate.pending"))
                event(s, b, "estate.pending");
        }
        return;
    }
    // Wait for insurance eligibility, so early liquidation cannot make a lower rank consume its guarantee.
    if (s.tick < r.insuranceDeadline)
        return;
    type Claim = {
        id: string;
        rank: number;
        creditor: string;
        amount: Money;
        note: LiquidityNote | null;
        account: LiquidityAccount | null;
        insuredPart: boolean;
    };
    const claims: Claim[] = [], cover = insured(s, b);
    r.creditorLosses = [];
    for (const n of s.notes.filter(n => n.bankId === b.id)) {
        if (n.rank === "SECURED") {
            const recovered = r.collateralRecovered.find(c => c.noteId === n.id)?.amount ?? ZERO, secured = minMoney(n.amount, recovered);
            claims.push({ id: n.id + "/secured", rank: 1, creditor: n.creditor, amount: secured, note: n, account: null, insuredPart: false });
            claims.push({ id: n.id + "/deficiency", rank: 6, creditor: n.creditor, amount: n.amount - secured, note: n, account: null, insuredPart: false });
        }
        else
            claims.push({ id: n.id, rank: n.rank === "COST" ? 2 : n.rank === "INSURED" ? 3 : n.rank === "SENIOR" ? 6 : n.rank === "SUB" ? 7 : 8, creditor: n.creditor, amount: n.amount, note: n, account: null, insuredPart: false });
    }
    for (const a of s.accounts.filter(a => a.bankId === b.id)) {
        const protectedAmount = cover.get(a.id) ?? ZERO;
        claims.push({ id: a.id + "/insured", rank: 3, creditor: a.id, amount: protectedAmount, note: null, account: a, insuredPart: true });
        claims.push({ id: a.id + "/uninsured", rank: a.sector === "NATURAL" ? 4 : 5, creditor: a.id, amount: balance(a) - protectedAmount, note: null, account: a, insuredPart: false });
    }
    for (let rank = 1; rank <= 8; rank++)
        for (const { item: c, paid } of prorata(claims.filter(c => c.rank === rank), b.reserves, c => c.amount, c => c.id)) {
            if (paid > ZERO) {
                if (c.note)
                    c.note.amount -= paid;
                else {
                    removeLots(c.account!, paid);
                    if (c.insuredPart)
                        recordInsuranceUse(b, c.account!.group, paid);
                }
                let creditor = c.creditor;
                if (c.account) {
                    const outside = s.accounts.find(a => a.bankId === null && a.owner === c.account!.owner);
                    if (outside)
                        creditor = outside.id;
                    else {
                        const id = "@estate/" + c.account.id;
                        let a = s.accounts.find(a => a.id === id);
                        if (!a) {
                            a = { ...c.account, id, bankId: null, lots: [] };
                            s.accounts.push(a);
                        }
                        creditor = id;
                    }
                }
                cashToCreditor(s, b, creditor, paid, "@estate/" + c.id);
                event(s, b, "estate.rank." + rank, paid);
            }
            if (paid < c.amount) {
                const old = r.creditorLosses.find(x => x.id === c.id);
                if (old)
                    old.amount = c.amount - paid;
                else
                    r.creditorLosses.push({ id: c.id, amount: c.amount - paid });
            }
        }
    const arrears = insuredTotal(s, b);
    r.insuranceShortfall = arrears;
    if (arrears > ZERO) {
        r.insuranceShortfall = arrears;
        r.creditorLosses = [];
        r.estatePending = true;
        return;
    }
    // All unprotected residual claims are real write-offs. A guarantee deficit is never erased.
    for (const a of s.accounts.filter(a => a.bankId === b.id))
        a.lots = [];
    for (const n of s.notes.filter(n => n.bankId === b.id))
        n.amount = ZERO;
    if (b.reserves > ZERO)
        cashToCreditor(s, b, b.ownerAccountId, b.reserves, "@estate/equity");
    b.status = "CLOSED";
    r.finalized = true;
    r.estatePending = false;
    event(s, b, "estate.closed");
}
function process(s: LiquidityState, frame: LiquidityFrame | null): void {
    if (frame?.facts) {
        s.facts = clone(frame.facts);
        for (const mark of frame.facts.marks)
            s.assets.find(a => a.id === mark.assetId)!.markPpm = mark.markPpm;
    }
    if (!s.facts)
        throw new Error("LIQUIDITY_FACTS_REQUIRED");
    const used = new Map<string, Money>();
    flushQueue(s);
    for (const c of frame?.commands ?? []) {
        const fingerprint = liquidityFingerprint(c), previous = s.receipts.find(r => r.id === c.id);
        if (previous) {
            if (previous.fingerprint !== fingerprint)
                throw new Error("LIQUIDITY_COMMAND_CONFLICT");
            continue;
        }
        s.receipts.push({ id: c.id, fingerprint, outcome: command(s, c) });
    }
    flushQueue(s);
    if (s.tick % TICKS_PER_GAME_HOUR === 0) {
        updateConfidence(s);
        npcFlight(s);
        for (const b of s.banks.filter(operating).sort((a, b) => hashOrder(a.id, b.id)))
            if (s.queue.some(q => deposit(s, q.from).bankId === b.id))
                sellAssets(s, b, false, used);
        flushQueue(s);
    }
    if (s.tick % TICKS_PER_GAME_DAY === 719) {
        dayCharges(s);
        flushQueue(s);
        dayStatus(s);
    }
    finishAuctions(s);
    for (const b of s.banks.filter(b => b.resolution?.tool === "LIQUIDATION").sort((a, b) => hashOrder(a.id, b.id))) {
        if (frame?.facts)
            sellAssets(s, b, true, used);
        payInsurance(s, b);
        liquidate(s, b);
    }
    for (const b of s.banks)
        maybeRun(s, b);
    assertLiquidityAccounting(s);
}

export {newState as initialLedger,process as liquidityStep,move as liquidityMove};
