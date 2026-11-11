import type { LiquidityState } from "../../../src/server/bank-liquidity/model";
export const cash = (dollars: number): string => (BigInt(dollars) * BigInt(1000000)).toString();
export function liquidityFixture() {
    const a = (id: string, bankId: string | null, owner: string, cashValue: number, sector: "NATURAL" | "CORPORATE" = "NATURAL") => ({ id, bankId, owner, group: owner, control: "PLAYER" as "PLAYER" | "NPC", sector: sector as "NATURAL" | "CORPORATE" | "FINANCIAL", cash: cash(cashValue) });
    return { world: "liquidity-proof", ccy: "FDL", banks: [{ id: "a", ownerAccountId: "oa", bloc: "FU", tier: "regional", segment: "retail", npc: false, sib: false, sibSurchargePpm: 0, reserves: cash(100000) }, { id: "b", ownerAccountId: "ob", bloc: "FU", tier: "regional", segment: "retail", npc: true, sib: false, sibSurchargePpm: 0, reserves: cash(2000000) }], accounts: [a("oa", null, "owner-a", 1000000), a("ob", null, "owner-b", 1000000), a("alice-a", "a", "alice", 500000), a("alice-b", "b", "alice", 50000), a("alice-cash", null, "alice", 10000), a("bob-a", "a", "bob", 300000), a("bob-cash", null, "bob", 0), a("corp-a", "a", "company", 300000, "CORPORATE"), a("corp-cash", null, "company", 0, "CORPORATE"), a("dealer", null, "dealer", 3000000), a("creditor", null, "creditor", 0)], assets: [{ id: "loans", kind: "LOAN" as "LOAN" | "L1" | "L2A" | "L2B" | "SECURITY" | "MORTGAGE", markPpm: 1000000, rwPpm: 1000000, adv: cash(10000000), collateralFor: null as string | null, holdings: [{ bankId: "a" as string | null, accountId: null as string | null, quantity: cash(1500000) }] }], notes: [] as {
            id: string;
            bankId: string;
            creditor: string;
            rank: "SECURED" | "COST" | "SENIOR" | "SUB" | "AT1";
            instrument: "BOND" | "INTERBANK" | "OTHER";
            amount: string;
            longTerm: boolean;
        }[], dgf: [{ bloc: "FU", cash: cash(500000) }] };
}
export type Fixture = ReturnType<typeof liquidityFixture>;
export function liquidityFacts(g: Fixture) {
    return { banks: g.banks.map(b => ({ bankId: b.id, publishedCet1Ppm: 200000, publishedRwa: cash(1500000), publicLoss: "0", equityReturnPpm: null as number | null, cdsBps: null as number | null, rumors: [] as {
                source: string;
                intensityPpm: number;
            }[], stigma: false, exposures: [] as {
                bankId: string;
                amount: string;
            }[], ccybPpm: 0, rrPpm: 0, mlfrPpm: 50000, intangibles: "0", dta: "0", unbookedLoss: "0", rwaAddon: "0", commitments: "0", financialCommitments: "0", derivativeExposure: "0", loanInflows: "0", interbankInflows: "0", maturingLiabilities: "0", regulatorFailure: false })), marks: g.assets.map(a => ({ assetId: a.id, markPpm: a.markPpm })), bids: [] as {
            id: string;
            buyer: {
                kind: "BANK" | "ACCOUNT";
                id: string;
            };
            assetId: string;
            quantity: string;
            pricePpm: number;
        }[] };
}
export type FixtureFrame = {
    tick: number;
    facts: ReturnType<typeof liquidityFacts> | null;
    commands: unknown[];
};
export function liquidityFrames(g: Fixture, target: number, edit?: (frame: FixtureFrame) => void): FixtureFrame[] {
    const times = new Set<number>();
    for (let t = 0; t <= target; t += 30)
        times.add(t);
    for (let t = 719; t <= target; t += 720)
        times.add(t);
    return [...times].sort((a, b) => a - b).map(t => {
        const f: FixtureFrame = { tick: t, facts: liquidityFacts(g), commands: [] };
        edit?.(f);
        return f;
    });
}
export const ownMove = (id: string, from: string, to: string, dollars: number, actor = "alice") => ({ id, actor, kind: "MOVE", from, to, amount: cash(dollars) });
export function independentAccounting(s: LiquidityState) {
    const sum = (v: bigint[]) => v.reduce((a, b) => a + b, BigInt(0)), balances = new Map(s.accounts.map(a => [a.id, sum(a.lots.map(l => l.amount))])), base = sum(s.banks.map(b => b.reserves)) + sum(s.accounts.filter(a => a.bankId === null).map(a => balances.get(a.id)!)) + sum(s.dgf.map(f => f.cash)) + s.mmfCash + s.authorityCash;
    if (base + s.sinks !== s.openingM0)
        throw new Error("INDEPENDENT_M0");
    const sheets = s.banks.map(b => {
        const deposits = sum(s.accounts.filter(a => a.bankId === b.id).map(a => balances.get(a.id)!)), other = sum(s.notes.filter(n => n.bankId === b.id).map(n => n.amount)), noncash = sum(s.assets.map(a => {
            const q = sum(a.holdings.filter(h => h.bankId === b.id).map(h => h.quantity)), n = q * BigInt(a.markPpm), d = BigInt(1000000), v = n / d, r = n % d;
            return v + (r * BigInt(2) > d || (r * BigInt(2) === d && v % BigInt(2) !== BigInt(0)) ? BigInt(1) : BigInt(0));
        })), assets = b.reserves + noncash, equity = assets - deposits - other;
        if (b.reserves < BigInt(0) || assets !== deposits + other + equity)
            throw new Error("INDEPENDENT_SHEET");
        return { bankId: b.id, assets, deposits, other, equity, noncash };
    });
    const outside = sum(s.accounts.filter(a => a.bankId === null).map(a => balances.get(a.id)!)), broad = outside + sum(sheets.map(b => b.deposits));
    const reconstruction = base - sum(s.dgf.map(f => f.cash)) - s.mmfCash - s.authorityCash + sum(sheets.map(b => b.noncash - b.other - b.equity));
    if (broad !== reconstruction)
        throw new Error("INDEPENDENT_BROAD_IDENTITY");
    return { base, sinks: s.sinks, openingM0: s.openingM0, broad, reconstruction, sheets };
}
