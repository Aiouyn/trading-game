import type { MarginCcpState } from "../../../src/server/margin-ccp/model";
export const money = (n: number): string => (BigInt(n) * BigInt(1000000)).toString();
export function marginFixture(count = 4, twoServices = false) {
    const ids = Array.from({ length: count }, (_, i) => i === 0 ? "d" : "s" + i), serviceIds = twoServices ? ["LD", "OTC"] as const : ["LD"] as const;
    return { world: "margin-proof", ccy: "FDL", members: ids.map((id, i) => ({ id, owner: "owner-" + id, npc: i > 0, wallet: money(10000), accounts: serviceIds.map(service => ({ service, targetDf: money(100), df: money(100), marginCash: money(i === 0 ? 100 : 200) })) })), services: serviceIds.map(id => ({ id, sitg1: money(count * 10), sitg2: money(count * 10), owners: [{ memberId: ids[1], weightPpm: 1000000 }] })) };
}
export type MarginFixture = ReturnType<typeof marginFixture>;
export function marginFacts(g: MarginFixture) {
    return { risks: g.members.flatMap(m => m.accounts.map(a => ({ memberId: m.id, service: a.service, im: money(m.id === "d" ? 100 : 100), equityAdjustment: "0", held: false, positions: [] as {
                assetId: string;
                quantity: string;
                fairValue: string;
                marginalIm: string;
                expectedCost: string;
                sigmaPpm: number;
                expectedTickVolume: string;
                marketOpen: boolean;
                opening: boolean;
                openingVolume: string;
            }[] }))), defaults: [] as {
            memberId: string;
            service: "LD" | "OTC";
            reason: "REGULATOR" | "BANK_RESOLUTION";
        }[], closeouts: [] as {
            defaultId: string;
            sourceId: string;
            loss: string;
            claims: {
                memberId: string;
                amount: string;
            }[];
            scores: {
                memberId: string;
                distance: string;
            }[];
        }[], vm: [] as {
            service: "LD" | "OTC";
            fromMemberId: string;
            toMemberId: string;
            amount: string;
        }[] };
}
export type MarginFixtureFrame = {
    tick: number;
    facts: ReturnType<typeof marginFacts>;
    commands: unknown[];
};
export function marginFrames(g: MarginFixture, target: number, edit?: (f: MarginFixtureFrame) => void): MarginFixtureFrame[] {
    return Array.from({ length: target + 1 }, (_, tick) => {
        const f = { tick, facts: marginFacts(g), commands: [] as unknown[] };
        edit?.(f);
        return f;
    });
}
export function defaultReport(g: MarginFixture, loss: number, memberId = "d", declared = 0) {
    return { defaultId: "LD/" + encodeURIComponent(memberId) + "/" + declared, sourceId: "closeout-source-" + memberId, loss: money(loss), claims: [{ memberId: g.members.at(-1)!.id, amount: money(loss) }], scores: g.members.filter(m => m.id !== memberId).map((m, i) => ({ memberId: m.id, distance: money(100 - i) })) };
}
export function defaultFrames(g: MarginFixture, target: number, loss = 600) {
    return marginFrames(g, target, f => {
        if (f.tick === 0)
            f.facts.defaults = [{ memberId: "d", service: "LD", reason: "REGULATOR" }];
        if (f.tick === 480)
            f.facts.closeouts = [defaultReport(g, loss)];
    });
}
export function independentCcpAccounting(s: MarginCcpState) {
    const expected = new Map(s.openingCash.map(c => [c.id, c.amount]));
    let total = BigInt(0);
    for (const row of s.transfers) {
        if (row.amount < BigInt(0) || !expected.has(row.from) || !expected.has(row.to))
            throw new Error("AUDIT_TRANSFER");
        const from = expected.get(row.from)!;
        if (from < row.amount)
            throw new Error("AUDIT_UNFUNDED");
        expected.set(row.from, from - row.amount);
        expected.set(row.to, expected.get(row.to)! + row.amount);
    }
    for (const bucket of s.cash) {
        if (expected.get(bucket.id) !== bucket.amount || bucket.amount < BigInt(0))
            throw new Error("AUDIT_BUCKET");
        total += bucket.amount;
    }
    if (total !== s.openingM0)
        throw new Error("AUDIT_MONEY_CREATION");
    const losses = s.defaults.filter(e => e.closeout).map(e => {
        const payouts = s.transfers.filter(t => t.eventId === e.id && !t.reason.includes("REPLENISHMENT")).reduce((n, t) => n + t.amount, BigInt(0)), unpaid = e.claims.reduce((n, c) => n + c.amount - c.paid, BigInt(0));
        if (payouts + unpaid !== e.closeout!.loss || unpaid !== e.remaining)
            throw new Error("AUDIT_LOSS_SOURCE");
        return { eventId: e.id, originalLoss: e.closeout!.loss, actualFundedPayments: payouts, unpaid, identityResidual: "0" };
    });
    return { money: total, openingM0: s.openingM0, cashResidual: "0", everyBucketReconstructed: true, losses };
}
