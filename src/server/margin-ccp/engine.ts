import { createHash } from "node:crypto";
import type { Money } from "../../../packages/engine/core/types";
import { TICKS_PER_GAME_DAY } from "../../../packages/engine/core/calendar/constants";
import { decodeMarginCcpGenesis, decodeMarginCcpFrames, marginCcpTick, marginCcpWire, marginCcpFingerprint, record, strictJson } from "./boundary";
import { planMarginCcpLiquidation } from "./liquidation";
import type { MarginCcpCheckpointStore, MarginCcpDefault, MarginCcpGenesis, MarginCcpFrame, MarginCcpState, MarginCcpServiceId, MarginCcpLayer, MarginCcpCommand } from "./model";
const Z = BigInt(0), abs = (v: Money) => v < Z ? -v : v, min = (...v: Money[]) => v.reduce((a, b) => a < b ? a : b), pos = (v: Money) => v > Z ? v : Z, clone = <T>(v: T): T => structuredClone(v);
export function marginCcpHashOrder(a: string, b: string): number {
    const h = (v: string) => createHash("sha256").update(v).digest("hex"), x = h(a), y = h(b);
    return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
}
export const walletBucket = (id: string) => "wallet/" + id;
export const marginBucket = (id: string, s: MarginCcpServiceId) => "margin/" + s + "/" + id;
export const dfBucket = (id: string, s: MarginCcpServiceId) => "df/" + s + "/" + id;
const sitg = (s: MarginCcpServiceId, n: 1 | 2) => "sitg" + n + "/" + s;
export function marginCcpCash(s: MarginCcpState, id: string): Money {
    const bucket = s.cash.find(b => b.id === id);
    if (!bucket)
        throw new Error("MARGIN_CCP_UNKNOWN_BUCKET");
    return bucket.amount;
}
function transfer(s: MarginCcpState, from: string, to: string, amount: Money, reason: string, eventId: string | null = null): void {
    if (amount === Z)
        return;
    if (amount < Z || marginCcpCash(s, from) < amount)
        throw new Error("MARGIN_CCP_UNFUNDED_TRANSFER");
    s.cash.find(b => b.id === from)!.amount -= amount;
    s.cash.find(b => b.id === to)!.amount += amount;
    s.transfers.push({ tick: s.tick, from, to, amount, reason, eventId });
}
function weights<T>(items: T[], budget: Money, value: (v: T) => Money, id: (v: T) => string): {
    item: T;
    amount: Money;
}[] {
    const rows = [...items].sort((a, b) => marginCcpHashOrder(id(a), id(b))), total = rows.reduce((n, r) => n + value(r), Z);
    if (total === Z || budget === Z)
        return rows.map(item => ({ item, amount: Z }));
    const result = rows.map(item => ({ item, amount: budget * value(item) / total }));
    let dust = budget - result.reduce((n, r) => n + r.amount, Z);
    for (const r of result)
        if (dust > Z && value(r.item) > Z) {
            r.amount++;
            dust--;
        }
    return result;
}
const margin = (s: MarginCcpState, member: string, service: MarginCcpServiceId) => s.margins.find(a => a.memberId === member && a.service === service)!;
const member = (s: MarginCcpState, id: string) => s.members.find(m => m.id === id)!;
const target = (s: MarginCcpState, id: string, service: MarginCcpServiceId) => member(s, id).accounts.find(a => a.service === service)!.targetDf;
const survived = (s: MarginCcpState, id: string, service: MarginCcpServiceId) => margin(s, id, service).status !== "DEFAULTED";
function history(s: MarginCcpState, kind: string, service: MarginCcpServiceId, memberId: string | null = null, eventId: string | null = null): void {
    s.history.push({ tick: s.tick, kind, memberId, service, eventId });
}
const unresolved = (s: MarginCcpState, id: string, service: MarginCcpServiceId) => s.fundingCalls.some(c => c.memberId === id && c.service === service && c.paid + c.cancelled < c.amount && c.due <= s.tick);
function openDefault(s: MarginCcpState, id: string, service: MarginCcpServiceId, reason: string): void {
    const a = margin(s, id, service);
    if (a.status === "DEFAULTED")
        return;
    a.status = "DEFAULTED";
    a.call = null;
    a.liquidationSince = s.tick;
    const eventId = service + "/" + encodeURIComponent(id) + "/" + s.tick;
    s.defaults.push({ id: eventId, memberId: id, service, declared: s.tick, reason, closeout: null, reportFingerprint: null, remaining: Z, claims: [], layers: [], fundingIssued: false, fundingAt: null, managementClosed: false, stage: "MANAGEMENT", vmghStart: null, vmghUntil: null, ownerLosses: [] });
    history(s, "member.default", service, id, eventId);
}
function newState(g: MarginCcpGenesis): MarginCcpState {
    const cash: {
        id: string;
        amount: Money;
    }[] = [];
    for (const m of g.members) {
        cash.push({ id: walletBucket(m.id), amount: m.wallet });
        for (const a of m.accounts) {
            cash.push({ id: marginBucket(m.id, a.service), amount: a.marginCash }, { id: dfBucket(m.id, a.service), amount: a.df });
        }
    }
    for (const service of g.services)
        cash.push({ id: sitg(service.id, 1), amount: service.sitg1 }, { id: sitg(service.id, 2), amount: service.sitg2 }, { id: "vm/" + service.id, amount: Z });
    return { world: g.world, tick: -1, members: g.members.map(m => ({ id: m.id, owner: m.owner, npc: m.npc, accounts: m.accounts.map(a => ({ service: a.service, targetDf: a.targetDf })) })), services: g.services.map(s => ({ id: s.id, status: "OPEN", targetSitg: s.sitg1, owners: clone(s.owners) })), cash, openingCash: clone(cash), openingM0: cash.reduce((n, b) => n + b.amount, Z), margins: g.members.flatMap(m => m.accounts.map(a => ({ memberId: m.id, service: a.service, status: "OK", call: null, liquidationSince: null }))), defaults: [], fundingCalls: [], assessmentHistory: [], orders: [], attempts: [], transfers: [], history: [], receipts: [], facts: null };
}
function marginP7(s: MarginCcpState): void {
    for (const r of [...s.facts!.risks].sort((a, b) => marginCcpHashOrder(a.service + "/" + a.memberId, b.service + "/" + b.memberId))) {
        const a = margin(s, r.memberId, r.service), equity = marginCcpCash(s, marginBucket(r.memberId, r.service)) + r.equityAdjustment;
        if (a.status === "DEFAULTED")
            continue;
        if (equity * BigInt(10) < r.im * BigInt(6)) {
            openDefault(s, r.memberId, r.service, "BELOW_60_PERCENT");
            continue;
        }
        if (equity < r.im) {
            if (!a.call) {
                if (unresolved(s, r.memberId, r.service)) {
                    openDefault(s, r.memberId, r.service, "FUNDING_SHORTFALL_AT_NEXT_MARGIN_CALL");
                    continue;
                }
                a.call = { issued: s.tick, due: s.tick + 30, amount: r.im - equity };
                history(s, "margin.call", r.service, r.memberId);
            }
            if (s.tick >= a.call.due) {
                openDefault(s, r.memberId, r.service, "UNMET_MARGIN_CALL");
                continue;
            }
            a.status = "CALL";
        }
        else {
            if (a.call)
                history(s, "margin.call.met", r.service, r.memberId);
            a.status = "OK";
            a.call = null;
        }
    }
}
function planOrders(s: MarginCcpState): void {
    const prior = s.orders;
    s.orders = [];
    for (const r of s.facts!.risks) {
        const a = margin(s, r.memberId, r.service);
        if (a.liquidationSince === null || s.defaults.some(e => e.memberId === r.memberId && e.service === r.service && e.closeout !== null))
            continue;
        const unfilled = new Map<string, number>();
        for (const p of r.positions) {
            let state = s.attempts.find(t => t.memberId === r.memberId && t.service === r.service && t.assetId === p.assetId);
            if (!state) {
                state = { memberId: r.memberId, service: r.service, assetId: p.assetId, quantity: p.quantity, unfilled: 0, lastOrderTick: -1 };
                s.attempts.push(state);
            }
            if (state.lastOrderTick === s.tick - 1 && prior.some(o => o.memberId === r.memberId && o.service === r.service && o.assetId === p.assetId && o.quantity > Z)) {
                state.unfilled = abs(p.quantity) < abs(state.quantity) ? 0 : state.unfilled + 1;
            }
            else if (abs(p.quantity) < abs(state.quantity))
                state.unfilled = 0;
            state.quantity = p.quantity;
            unfilled.set(p.assetId, state.unfilled);
        }
        const planned = planMarginCcpLiquidation(r, equityFor(s, r.memberId, r.service), a.liquidationSince, s.tick, unfilled);
        s.orders.push(...planned);
        for (const order of planned) {
            const state = s.attempts.find(t => t.memberId === order.memberId && t.service === order.service && t.assetId === order.assetId)!;
            state.lastOrderTick = s.tick;
        }
    }
}
function equityFor(s: MarginCcpState, id: string, service: MarginCcpServiceId): Money {
    return marginCcpCash(s, marginBucket(id, service)) + s.facts!.risks.find(r => r.memberId === id && r.service === service)!.equityAdjustment;
}
function payLayer(s: MarginCcpState, e: MarginCcpDefault, source: string, budget: Money, layer: MarginCcpLayer): Money {
    const amount = min(budget, marginCcpCash(s, source), e.remaining), claims = e.claims.filter(c => c.amount > c.paid);
    if (amount === Z)
        return Z;
    for (const r of weights(claims, amount, c => c.amount - c.paid, c => c.memberId)) {
        if (r.amount > Z) {
            transfer(s, source, walletBucket(r.item.memberId), r.amount, "CCP_" + layer, e.id);
            r.item.paid += r.amount;
        }
    }
    e.remaining -= amount;
    const row = e.layers.find(l => l.layer === layer);
    if (row)
        row.amount += amount;
    else
        e.layers.push({ layer, amount });
    return amount;
}
function mutualized(s: MarginCcpState, e: MarginCcpDefault, ids: string[], layer: MarginCcpLayer): void {
    const total = ids.reduce((n, id) => n + marginCcpCash(s, dfBucket(id, e.service)), Z), budget = min(total, e.remaining);
    for (const r of weights(ids, budget, id => marginCcpCash(s, dfBucket(id, e.service)), id => id))
        payLayer(s, e, dfBucket(r.item, e.service), r.amount, layer);
}
function closeouts(s: MarginCcpState): void {
    for (const report of [...s.facts!.closeouts].sort((a, b) => marginCcpHashOrder(a.defaultId, b.defaultId))) {
        const e = s.defaults.find(e => e.id === report.defaultId);
        if (!e || s.tick < e.declared + 480)
            throw new Error("MARGIN_CCP_PREMATURE_CLOSEOUT");
        const fingerprint = marginCcpFingerprint(report);
        if (e.closeout) {
            if (e.reportFingerprint !== fingerprint)
                throw new Error("MARGIN_CCP_CLOSEOUT_CONFLICT");
            continue;
        }
        if (report.claims.some(c => c.memberId === e.memberId || !member(s, c.memberId).accounts.some(a => a.service === e.service)) || report.scores.some(c => c.memberId === e.memberId || !member(s, c.memberId).accounts.some(a => a.service === e.service)))
            throw new Error("MARGIN_CCP_CROSS_SERVICE_CLAIM");
        const survivors = s.members.filter(m => m.id !== e.memberId && m.accounts.some(a => a.service === e.service) && survived(s, m.id, e.service)).map(m => m.id);
        if (survivors.some(id => !report.scores.some(r => r.memberId === id)))
            throw new Error("MARGIN_CCP_SCORE_COVERAGE");
        e.closeout = clone(report);
        e.reportFingerprint = fingerprint;
        s.orders = s.orders.filter(o => o.memberId !== e.memberId || o.service !== e.service);
        e.remaining = report.loss;
        e.claims = report.claims.map(c => ({ ...c, paid: Z }));
        payLayer(s, e, marginBucket(e.memberId, e.service), e.remaining, "DEFAULTER_IM");
        payLayer(s, e, dfBucket(e.memberId, e.service), e.remaining, "DEFAULTER_DF");
        payLayer(s, e, sitg(e.service, 1), e.remaining, "SITG1");
        const ranked = survivors.sort((a, b) => {
            const x = report.scores.find(r => r.memberId === a)!.distance, y = report.scores.find(r => r.memberId === b)!.distance;
            return x > y ? -1 : x < y ? 1 : marginCcpHashOrder(a, b);
        }), junior = ranked.slice(0, Math.ceil(ranked.length / 3));
        mutualized(s, e, junior, "SURVIVOR_DF_JUNIOR");
        mutualized(s, e, ranked.filter(id => !junior.includes(id)), "SURVIVOR_DF");
        payLayer(s, e, sitg(e.service, 2), e.remaining, "SITG2");
        history(s, "waterfall.allocated", e.service, e.memberId, e.id);
    }
}
export function marginCcpAssessmentCapacity(targetAmount: Money, history: readonly {
    issued: number;
    amount: Money;
}[], tick: number): Money { const committed = history.filter(h => h.issued > tick - 30 * TICKS_PER_GAME_DAY).reduce((n, h) => n + h.amount, Z); return min(targetAmount, pos(BigInt(2) * targetAmount - committed)); }
function issueFunding(s: MarginCcpState, e: MarginCcpDefault): void {
    e.fundingIssued = true;
    e.fundingAt = s.tick;
    e.managementClosed = true;
    history(s, "default.management.closed", e.service, e.memberId, e.id);
    const survivors = s.members.filter(m => m.id !== e.memberId && m.accounts.some(a => a.service === e.service) && survived(s, m.id, e.service));
    const caps = survivors.map(m => {
        const base = target(s, m.id, e.service);
        return { id: m.id, cap: marginCcpAssessmentCapacity(base, s.assessmentHistory.filter(h => h.memberId === m.id && h.service === e.service), s.tick) };
    }), total = caps.reduce((n, c) => n + c.cap, Z), budget = min(total, e.remaining);
    for (const r of weights(caps, budget, c => c.cap, c => c.id)) {
        if (r.amount === Z)
            continue;
        const call = { id: e.id + "/assessment/" + encodeURIComponent(r.item.id), eventId: e.id, memberId: r.item.id, service: e.service, kind: "ASSESSMENT" as const, amount: r.amount, paid: Z, cancelled: Z, issued: s.tick, due: s.tick + 7 * TICKS_PER_GAME_DAY };
        s.fundingCalls.push(call);
        s.assessmentHistory.push({ eventId: e.id, memberId: r.item.id, service: e.service, issued: s.tick, amount: r.amount });
    }
    for (const m of survivors) {
        const needed = pos(target(s, m.id, e.service) - marginCcpCash(s, dfBucket(m.id, e.service)) - s.fundingCalls.filter(c => c.memberId === m.id && c.service === e.service && c.kind === "DF").reduce((n, c) => n + c.amount - c.paid - c.cancelled, Z));
        if (needed > Z)
            s.fundingCalls.push({ id: e.id + "/df/" + encodeURIComponent(m.id), eventId: e.id, memberId: m.id, service: e.service, kind: "DF", amount: needed, paid: Z, cancelled: Z, issued: s.tick, due: s.tick + 7 * TICKS_PER_GAME_DAY });
    }
    e.stage = e.remaining === Z ? "CLOSED" : "ASSESSING";
    history(s, "funding.called", e.service, null, e.id);
}
function recoveryClock(s: MarginCcpState): void {
    for (const e of [...s.defaults].sort((a, b) => marginCcpHashOrder(a.id, b.id))) {
        const age = s.tick - e.declared;
        for (const [offset, label] of [[1, "porting.hedging.requested"], [120, "auction.round1.requested"], [240, "auction.round2.requested"], [360, "auction.round3.requested"], [480, "closeout.requested"]] as const)
            if (age === offset)
                history(s, label, e.service, e.memberId, e.id);
        if (e.closeout && !e.fundingIssued && age >= 720)
            issueFunding(s, e);
        if (e.stage === "ASSESSING") {
            const calls = s.fundingCalls.filter(c => c.eventId === e.id && c.kind === "ASSESSMENT");
            if (e.remaining === Z)
                e.stage = "CLOSED";
            else if (calls.every(c => c.paid + c.cancelled === c.amount) || s.tick >= e.fundingAt! + 7 * TICKS_PER_GAME_DAY) {
                e.stage = "VMGH";
                e.vmghStart = s.tick;
                e.vmghUntil = s.tick + 5 * TICKS_PER_GAME_DAY;
                history(s, "vmgh.started", e.service, null, e.id);
            }
        }
        if (e.stage === "VMGH" && s.tick >= e.vmghUntil! && e.remaining > Z) {
            e.stage = "SHORTFALL";
            s.services.find(x => x.id === e.service)!.status = "CLOSED";
            e.ownerLosses = weights(s.services.find(x => x.id === e.service)!.owners, e.remaining, o => BigInt(o.weightPpm), o => o.memberId).map(r => ({ memberId: r.item.memberId, amount: r.amount }));
            history(s, "partial.tearup.requested", e.service, null, e.id);
            history(s, "service.closure.requested", e.service, null, e.id);
            history(s, "owner.loss.handoff", e.service, null, e.id);
        }
    }
}
function command(s: MarginCcpState, c: MarginCcpCommand): string {
    if (c.kind === "POST_MARGIN") {
        const m = s.members.find(m => m.id === c.memberId);
        if (!m || m.owner !== c.actor || !m.accounts.some(a => a.service === c.service))
            return "NOT_OWNED";
        if (margin(s, m.id, c.service).status === "DEFAULTED" && s.defaults.some(e => e.memberId === m.id && e.service === c.service && e.closeout))
            return "SEALED_DEFAULT_COLLATERAL";
        if (marginCcpCash(s, walletBucket(m.id)) < c.amount)
            return "INSUFFICIENT_CASH";
        transfer(s, walletBucket(m.id), marginBucket(m.id, c.service), c.amount, "CCP_INITIAL_MARGIN");
        return "POSTED_NEXT_P7";
    }
    const call = s.fundingCalls.find(x => x.id === c.callId);
    if (!call || member(s, call.memberId).owner !== c.actor)
        return "NOT_OWNED_CALL";
    if (!survived(s, call.memberId, call.service))
        return "DEFAULTED_MEMBER";
    const e = s.defaults.find(e => e.id === call.eventId)!, budget = min(c.amount, pos(call.amount - call.paid - call.cancelled));
    if (budget === Z)
        return "NO_OUTSTANDING_CALL";
    if (call.kind === "ASSESSMENT" && e.remaining === Z)
        return "NO_REMAINING_LOSS";
    if (marginCcpCash(s, walletBucket(call.memberId)) < budget)
        return "INSUFFICIENT_CASH";
    if (call.kind === "ASSESSMENT")
        call.paid += payLayer(s, e, walletBucket(call.memberId), budget, "ASSESSMENT");
    else {
        const paid = min(budget, pos(target(s, call.memberId, call.service) - marginCcpCash(s, dfBucket(call.memberId, call.service))));
        transfer(s, walletBucket(call.memberId), dfBucket(call.memberId, call.service), paid, "CCP_DF_REPLENISHMENT", e.id);
        call.paid += paid;
    }
    return "PAID";
}
function variationMargin(s: MarginCcpState): void {
    for (const service of s.services) {
        const rows = s.facts!.vm.filter(v => v.service === service.id), net = new Map<string, Money>();
        for (const row of rows) {
            net.set(row.fromMemberId, (net.get(row.fromMemberId) ?? Z) - row.amount);
            net.set(row.toMemberId, (net.get(row.toMemberId) ?? Z) + row.amount);
        }
        const losers = [...net].filter(([, n]) => n < Z).sort((a, b) => marginCcpHashOrder(a[0], b[0])), winners = [...net].filter(([, n]) => n > Z).sort((a, b) => marginCcpHashOrder(a[0], b[0]));
        for (const [id, n] of losers)
            if (marginCcpCash(s, walletBucket(id)) < -n)
                throw new Error("MARGIN_CCP_UNFUNDED_VM_CONTRACT");
        const reserveId = "vm/" + service.id;
        for (const [id, n] of losers)
            transfer(s, walletBucket(id), reserveId, -n, "CCP_VM_COLLECT");
        const gains = winners.reduce((n, [, v]) => n + v, Z);
        let left = gains;
        for (const e of s.defaults.filter(e => e.service === service.id && e.stage === "VMGH" && s.tick < e.vmghUntil!).sort((a, b) => marginCcpHashOrder(a.id, b.id))) {
            const paid = payLayer(s, e, reserveId, left, "VMGH");
            left -= paid;
            if (e.remaining === Z)
                e.stage = "CLOSED";
        }
        for (const r of weights(winners, left, v => v[1], v => v[0]))
            transfer(s, reserveId, marginBucket(r.item[0], service.id), r.amount, "CCP_VARIATION_MARGIN");
    }
}
function cancelUnneededAssessments(s: MarginCcpState): void {
    for (const e of s.defaults)
        if (e.closeout && e.remaining === Z)
            for (const c of s.fundingCalls.filter(c => c.eventId === e.id && c.kind === "ASSESSMENT")) {
                const amount = c.amount - c.paid - c.cancelled;
                if (amount > Z) {
                    c.cancelled += amount;
                    history(s, "assessment.cancelled.loss.satisfied", c.service, c.memberId, e.id);
                }
            }
}
export function assertMarginCcpConservation(s: MarginCcpState): void {
    if (s.cash.some(c => c.amount < Z) || s.cash.reduce((n, c) => n + c.amount, Z) !== s.openingM0)
        throw new Error("MARGIN_CCP_MONEY_IDENTITY");
    if (s.fundingCalls.some(c => c.paid < Z || c.cancelled < Z || c.paid + c.cancelled > c.amount))
        throw new Error("MARGIN_CCP_FUNDING_IDENTITY");
    const reconstructed = new Map(s.openingCash.map(c => [c.id, c.amount]));
    for (const t of s.transfers) {
        if (t.amount < Z || !reconstructed.has(t.from) || !reconstructed.has(t.to))
            throw new Error("MARGIN_CCP_TRANSFER_PROVENANCE");
        reconstructed.set(t.from, reconstructed.get(t.from)! - t.amount);
        reconstructed.set(t.to, reconstructed.get(t.to)! + t.amount);
    }
    for (const c of s.cash)
        if (reconstructed.get(c.id) !== c.amount)
            throw new Error("MARGIN_CCP_BUCKET_IDENTITY");
    for (const e of s.defaults)
        if (e.closeout && (e.remaining !== e.claims.reduce((n, c) => n + c.amount - c.paid, Z) || e.closeout.loss !== e.remaining + e.layers.reduce((n, l) => n + l.amount, Z)))
            throw new Error("MARGIN_CCP_LOSS_IDENTITY");
}
function process(s: MarginCcpState, f: MarginCcpFrame): void {
    s.tick = f.tick;
    s.facts = clone(f.facts);
    marginP7(s);
    for (const d of [...f.facts.defaults].sort((a, b) => marginCcpHashOrder(a.service + "/" + a.memberId, b.service + "/" + b.memberId)))
        openDefault(s, d.memberId, d.service, d.reason);
    planOrders(s);
    closeouts(s);
    recoveryClock(s);
    for (const c of f.commands) {
        const fingerprint = marginCcpFingerprint(c), old = s.receipts.find(r => r.id === c.id);
        if (old) {
            if (old.fingerprint !== fingerprint)
                throw new Error("MARGIN_CCP_COMMAND_CONFLICT");
            continue;
        }
        s.receipts.push({ id: c.id, fingerprint, outcome: command(s, c) });
    }
    recoveryClockAfterPayments(s);
    variationMargin(s);
    cancelUnneededAssessments(s);
    for (const service of s.services) {
        if (service.status === "CLOSED")
            continue;
        service.status = marginCcpCash(s, sitg(service.id, 1)) < service.targetSitg || marginCcpCash(s, sitg(service.id, 2)) < service.targetSitg || s.defaults.some(e => e.service === service.id && (e.vmghStart !== null || e.stage === "SHORTFALL")) ? "RECOVERY" : s.defaults.some(e => e.service === service.id && !e.managementClosed) ? "DEFAULT_MANAGEMENT" : "OPEN";
    }
    assertMarginCcpConservation(s);
}
function recoveryClockAfterPayments(s: MarginCcpState): void {
    for (const e of s.defaults) {
        if ((e.stage === "ASSESSING" || e.stage === "SHORTFALL") && e.remaining === Z)
            e.stage = "CLOSED";
        if (e.ownerLosses.length)
            e.ownerLosses = weights(s.services.find(x => x.id === e.service)!.owners, e.remaining, o => BigInt(o.weightPpm), o => o.memberId).map(r => ({ memberId: r.item.memberId, amount: r.amount }));
    }
}
function reconstruct(g: MarginCcpGenesis, frames: MarginCcpFrame[], targetTick: number): MarginCcpState {
    const s = newState(g), ordered = [...frames].sort((a, b) => a.tick - b.tick);
    if (ordered.length !== targetTick + 1 || ordered.some((f, i) => f.tick !== i))
        throw new Error("MARGIN_CCP_EVERY_TICK_REQUIRED");
    for (const f of ordered)
        process(s, f);
    return s;
}
export const MARGIN_CCP_DEFAULT_ENABLED = false;
export class MarginCcpEngine {
    private busy = false;
    private constructor(private readonly store: MarginCcpCheckpointStore, private readonly genesis: MarginCcpGenesis, private frames: MarginCcpFrame[], private state: MarginCcpState, private revision: string | null) {
    }
    static async open(store: MarginCcpCheckpointStore, rawGenesis: unknown, enabled: unknown = MARGIN_CCP_DEFAULT_ENABLED): Promise<MarginCcpEngine> {
        if (enabled !== true)
            throw new Error("MARGIN_CCP_DISABLED");
        const g = decodeMarginCcpGenesis(rawGenesis), loaded = await store.load();
        if (loaded.payload === null) {
            if (loaded.revision !== null)
                throw new Error("MARGIN_CCP_NULL_CHECKPOINT");
            const engine = new MarginCcpEngine(store, g, [], newState(g), loaded.revision);
            await engine.save(engine.state, []);
            return engine;
        }
        const p = record(strictJson(loaded.payload), ["version", "genesis", "frames", "target", "digest"]);
        if (p.version !== 1 || marginCcpFingerprint(decodeMarginCcpGenesis(p.genesis)) !== marginCcpFingerprint(g) || typeof p.target !== "number" || (p.target !== -1 && marginCcpTick(p.target) !== p.target))
            throw new Error("MARGIN_CCP_CHECKPOINT");
        const frames = decodeMarginCcpFrames(p.frames, g), state = p.target === -1 ? newState(g) : reconstruct(g, frames, p.target);
        if ((p.target === -1 && frames.length) || marginCcpFingerprint(state) !== p.digest)
            throw new Error("MARGIN_CCP_CHECKPOINT_DIGEST");
        return new MarginCcpEngine(store, g, frames, state, loaded.revision);
    }
    private async save(state: MarginCcpState, frames: MarginCcpFrame[]): Promise<void> {
        const revision = await this.store.save({ version: 1, genesis: marginCcpWire(this.genesis), frames: marginCcpWire(frames), target: state.tick, digest: marginCcpFingerprint(state) }, this.revision);
        this.state = state;
        this.frames = frames;
        this.revision = revision;
    }
    async advance(rawTarget: unknown, rawFrames: unknown): Promise<MarginCcpState> {
        const t = marginCcpTick(rawTarget), incoming = decodeMarginCcpFrames(rawFrames, this.genesis);
        if (this.busy)
            throw new Error("MARGIN_CCP_BUSY");
        if (t < this.state.tick)
            throw new Error("MARGIN_CCP_TIME_REWIND");
        this.busy = true;
        try {
            const merged = new Map(this.frames.map(f => [f.tick, f]));
            for (const f of incoming) {
                if (f.tick > t)
                    throw new Error("MARGIN_CCP_FUTURE_FRAME");
                const old = merged.get(f.tick);
                if (old) {
                    if (marginCcpFingerprint(old) !== marginCcpFingerprint(f))
                        throw new Error("MARGIN_CCP_FRAME_CONFLICT");
                }
                else {
                    if (f.tick <= this.state.tick)
                        throw new Error("MARGIN_CCP_LATE_FRAME");
                    merged.set(f.tick, f);
                }
            }
            const frames = [...merged.values()].sort((a, b) => a.tick - b.tick);
            if (t === this.state.tick && frames.length === this.frames.length)
                return this.snapshot();
            await this.save(reconstruct(this.genesis, frames, t), frames);
            return this.snapshot();
        }
        finally {
            this.busy = false;
        }
    }
    snapshot(): MarginCcpState {
        return clone(this.state);
    }
    publicView() {
        return this.state.services.map(service => ({ service: service.id, status: service.status, defaults: this.state.defaults.filter(e => e.service === service.id).length, unpaidLoss: this.state.defaults.filter(e => e.service === service.id).reduce((n, e) => n + e.remaining, Z) }));
    }
    memberView(rawId: unknown) {
        if (typeof rawId !== "string")
            throw new Error("MARGIN_CCP_MEMBER_ID");
        const m = this.state.members.find(m => m.id === rawId);
        if (!m)
            throw new Error("MARGIN_CCP_MEMBER_ID");
        return m.accounts.map(a => ({ service: a.service, status: margin(this.state, m.id, a.service).status, riskReducingOnly: this.state.services.find(x => x.id === a.service)!.status !== "OPEN" || margin(this.state, m.id, a.service).status !== "OK" || marginCcpCash(this.state, dfBucket(m.id, a.service)) < a.targetDf || this.state.fundingCalls.some(c => c.memberId === m.id && c.service === a.service && c.paid + c.cancelled < c.amount), call: clone(margin(this.state, m.id, a.service).call) }));
    }
}
export { FileMarginCcpCheckpointStore } from "./store";
export { marginCcpWire } from "./boundary";
