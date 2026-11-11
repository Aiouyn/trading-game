import { createHash } from "node:crypto";
import { types } from "node:util";
import type { Money } from "../../../../../packages/engine/core/types";
export type LiquidityJson = null | boolean | number | string | LiquidityJson[] | {
    [key: string]: LiquidityJson;
};
function jsonTree(input: unknown, encodeMoney: boolean): LiquidityJson {
    const seen = new Set<object>();
    const walk = (value: unknown): LiquidityJson => {
        if (types.isProxy(value))
            throw new Error("LIQUIDITY_PROXY_INPUT");
        if (encodeMoney && typeof value === "bigint")
            return value.toString();
        if (value === null || typeof value === "string" || typeof value === "boolean")
            return value;
        if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0))
            return value;
        if (typeof value !== "object" || value === null || seen.has(value))
            throw new Error("LIQUIDITY_JSON_TREE");
        seen.add(value);
        if (Array.isArray(value)) {
            if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1)
                throw new Error("LIQUIDITY_DENSE_ARRAY");
            const out: LiquidityJson[] = [];
            for (let i = 0; i < value.length; i++) {
                const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
                if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
                    throw new Error("LIQUIDITY_DENSE_ARRAY");
                out.push(walk(descriptor.value));
            }
            return out;
        }
        if (Object.getPrototypeOf(value) !== Object.prototype)
            throw new Error("LIQUIDITY_PLAIN_OBJECT");
        const out: {
            [key: string]: LiquidityJson;
        } = {};
        const keys = Reflect.ownKeys(value);
        if (keys.some((key) => typeof key !== "string"))
            throw new Error("LIQUIDITY_JSON_KEY");
        for (const key of (keys as string[]).sort()) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
            if (!descriptor.enumerable || !("value" in descriptor) || ["__proto__", "constructor", "prototype"].includes(key))
                throw new Error("LIQUIDITY_JSON_PROPERTY");
            out[key] = walk(descriptor.value);
        }
        return out;
    };
    return walk(input);
}
export function strictJson(input: unknown): LiquidityJson {
    return jsonTree(input, false);
}
export function canonicalJson(value: unknown): string {
    return JSON.stringify(strictJson(value));
}
// Domain money is explicitly encoded; no toJSON/accessor/proxy can run before validation.
export function liquidityWire(value: unknown): LiquidityJson {
    return jsonTree(value, true);
}
export function liquidityFingerprint(domainValue: unknown): string {
    return createHash("sha256").update(canonicalJson(liquidityWire(domainValue))).digest("hex");
}
import type { LiquidityGenesis, LiquidityFrame, LiquidityFacts, LiquidityObservation, LiquidityIntent, LiquidityAssetKind, LiquidityRank, LiquiditySector } from "./model";
export function record(v: LiquidityJson, keys: string[]): {
    [key: string]: LiquidityJson;
} {
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k)))
        throw new Error("LIQUIDITY_FIELDS");
    return v;
}
const list = (v: LiquidityJson): LiquidityJson[] => {
    if (!Array.isArray(v))
        throw new Error("LIQUIDITY_ARRAY");
    return v;
};
const text = (v: LiquidityJson): string => {
    if (typeof v !== "string" || !/^[a-zA-Z0-9_./-]{1,160}$/.test(v) || v.startsWith("@"))
        throw new Error("LIQUIDITY_ID");
    return v;
};
const flag = (v: LiquidityJson): boolean => {
    if (typeof v !== "boolean")
        throw new Error("LIQUIDITY_FLAG");
    return v;
};
function reference(v: LiquidityJson): string {
    if (typeof v === "string" && /^@(receive|estate|cash)\/[A-Za-z0-9_./@-]{1,1024}$/.test(v))
        return v;
    return text(v);
}
export function liquidityTick(v: unknown): number {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || Object.is(v, -0) || v < 0 || v > Number.MAX_SAFE_INTEGER - 2000000)
        throw new Error("LIQUIDITY_TICK");
    return v;
}
function integer(v: LiquidityJson, lo = 0, hi = 1000000): number {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || Object.is(v, -0) || v < lo || v > hi)
        throw new Error("LIQUIDITY_INTEGER");
    return v;
}
function money(v: LiquidityJson, signed = false): Money {
    if (typeof v !== "string" || !(signed ? /^(0|-?[1-9][0-9]{0,29})$/ : /^(0|[1-9][0-9]{0,29})$/).test(v))
        throw new Error("LIQUIDITY_MONEY");
    return BigInt(v);
}
function oneOf<T extends string>(v: LiquidityJson, choices: readonly T[]): T {
    for (const choice of choices)
        if (v === choice)
            return choice;
    throw new Error("LIQUIDITY_ENUM");
}
const unique = (ids: string[]): void => {
    if (new Set(ids).size !== ids.length)
        throw new Error("LIQUIDITY_DUPLICATE");
};
export function decodeLiquidityGenesis(raw: unknown): LiquidityGenesis {
    const g = record(strictJson(raw), ["world", "ccy", "banks", "accounts", "assets", "notes", "dgf"]);
    if (g.ccy !== "FDL")
        throw new Error("LIQUIDITY_FDL_ONLY");
    const banks = list(g.banks).map(v => {
        const b = record(v, ["id", "ownerAccountId", "bloc", "tier", "segment", "npc", "sib", "sibSurchargePpm", "reserves"]);
        return { id: text(b.id), ownerAccountId: text(b.ownerAccountId), bloc: text(b.bloc), tier: text(b.tier), segment: text(b.segment), npc: flag(b.npc), sib: flag(b.sib), sibSurchargePpm: integer(b.sibSurchargePpm, 0, 20000), reserves: money(b.reserves) };
    });
    const accounts = list(g.accounts).map(v => {
        const a = record(v, ["id", "bankId", "owner", "group", "control", "sector", "cash"]);
        return { id: text(a.id), bankId: a.bankId === null ? null : text(a.bankId), owner: text(a.owner), group: text(a.group), control: oneOf(a.control, ["PLAYER", "NPC"] as const), sector: oneOf<LiquiditySector>(a.sector, ["NATURAL", "OPERATIONAL", "CORPORATE", "FINANCIAL"]), cash: money(a.cash) };
    });
    const notes = list(g.notes).map(v => {
        const n = record(v, ["id", "bankId", "creditor", "rank", "instrument", "amount", "longTerm"]);
        return { id: text(n.id), bankId: text(n.bankId), creditor: text(n.creditor), rank: oneOf<LiquidityRank>(n.rank, ["SECURED", "COST", "SENIOR", "SUB", "AT1"]), instrument: oneOf(n.instrument, ["BOND", "INTERBANK", "OTHER"] as const), amount: money(n.amount), longTerm: flag(n.longTerm) };
    });
    if (notes.some(n => (["AT1", "SUB"].includes(n.rank) && n.instrument !== "BOND") || (["SECURED", "COST"].includes(n.rank) && n.instrument !== "OTHER")))
        throw new Error("LIQUIDITY_NOTE_INSTRUMENT");
    const assets = list(g.assets).map(v => {
        const a = record(v, ["id", "kind", "markPpm", "rwPpm", "adv", "collateralFor", "holdings"]);
        return { id: text(a.id), kind: oneOf<LiquidityAssetKind>(a.kind, ["L1", "L2A", "L2B", "SECURITY", "MORTGAGE", "LOAN"]), markPpm: integer(a.markPpm, 0, 1000000000), rwPpm: integer(a.rwPpm, 0, 12500000), adv: money(a.adv), collateralFor: a.collateralFor === null ? null : text(a.collateralFor), holdings: list(a.holdings).map(v => {
                const h = record(v, ["bankId", "accountId", "quantity"]);
                return { bankId: h.bankId === null ? null : text(h.bankId), accountId: h.accountId === null ? null : text(h.accountId), quantity: money(h.quantity) };
            }) };
    });
    const dgf = list(g.dgf).map(v => {
        const d = record(v, ["bloc", "cash"]);
        return { bloc: text(d.bloc), cash: money(d.cash) };
    });
    for (const ids of [banks.map(b => b.id), accounts.map(a => a.id), assets.map(a => a.id), notes.map(n => n.id), dgf.map(d => d.bloc)])
        unique(ids);
    const validBank = (id: string) => banks.some(b => b.id === id), validAccount = (id: string) => accounts.some(a => a.id === id);
    if (!banks.length || banks.some(b => !accounts.some(a => a.id === b.ownerAccountId && a.bankId === null) || !dgf.some(d => d.bloc === b.bloc)) || accounts.some(a => a.bankId !== null && !validBank(a.bankId)) || notes.some(n => !validBank(n.bankId) || !validAccount(n.creditor)))
        throw new Error("LIQUIDITY_REFERENCE");
    for (const a of accounts)
        if (accounts.some(b => a.owner === b.owner && (a.group !== b.group || a.control !== b.control || a.sector !== b.sector)) || accounts.some(b => a.group === b.group && a.sector !== b.sector))
            throw new Error("LIQUIDITY_HOLDER_IDENTITY");
    for (const a of assets) {
        unique(a.holdings.map(h => h.bankId === null ? "A/" + h.accountId : "B/" + h.bankId));
        if (a.holdings.some(h => (h.bankId === null) === (h.accountId === null) || (h.bankId !== null && !validBank(h.bankId)) || (h.accountId !== null && !accounts.some(x => x.id === h.accountId && x.bankId === null))))
            throw new Error("LIQUIDITY_ASSET_OWNER");
        if (a.collateralFor !== null && (!notes.some(n => n.id === a.collateralFor && n.rank === "SECURED") || a.holdings.some(h => h.bankId !== notes.find(n => n.id === a.collateralFor)!.bankId)))
            throw new Error("LIQUIDITY_COLLATERAL");
        if (a.kind === "L1" && a.rwPpm !== 0)
            throw new Error("LIQUIDITY_L1_WEIGHT");
    }
    return { world: text(g.world), ccy: g.ccy, banks, accounts, assets, notes, dgf };
}
const observationKeys = ["bankId", "publishedCet1Ppm", "publishedRwa", "publicLoss", "equityReturnPpm", "cdsBps", "rumors", "stigma", "exposures", "ccybPpm", "rrPpm", "mlfrPpm", "intangibles", "dta", "unbookedLoss", "rwaAddon", "commitments", "financialCommitments", "derivativeExposure", "loanInflows", "interbankInflows", "maturingLiabilities", "regulatorFailure"];
function facts(v: LiquidityJson, g: LiquidityGenesis): LiquidityFacts {
    const f = record(v, ["banks", "marks", "bids"]);
    const banks: LiquidityObservation[] = list(f.banks).map(v => {
        const b = record(v, observationKeys);
        const rumors = list(b.rumors).map(v => {
            const r = record(v, ["source", "intensityPpm"]);
            return { source: text(r.source), intensityPpm: integer(r.intensityPpm) };
        });
        const exposures = list(b.exposures).map(v => {
            const x = record(v, ["bankId", "amount"]);
            return { bankId: text(x.bankId), amount: money(x.amount) };
        });
        unique(rumors.map(r => r.source));
        unique(exposures.map(x => x.bankId));
        return { bankId: text(b.bankId), publishedCet1Ppm: integer(b.publishedCet1Ppm, -1000000000, 1000000000), publishedRwa: money(b.publishedRwa), publicLoss: money(b.publicLoss), equityReturnPpm: b.equityReturnPpm === null ? null : integer(b.equityReturnPpm, -1000000, 1000000000), cdsBps: b.cdsBps === null ? null : integer(b.cdsBps, 0, 1000000000), rumors, exposures, stigma: flag(b.stigma), ccybPpm: integer(b.ccybPpm, 0, 25000), rrPpm: integer(b.rrPpm), mlfrPpm: integer(b.mlfrPpm), intangibles: money(b.intangibles), dta: money(b.dta), unbookedLoss: money(b.unbookedLoss), rwaAddon: money(b.rwaAddon), commitments: money(b.commitments), financialCommitments: money(b.financialCommitments), derivativeExposure: money(b.derivativeExposure), loanInflows: money(b.loanInflows), interbankInflows: money(b.interbankInflows), maturingLiabilities: money(b.maturingLiabilities), regulatorFailure: flag(b.regulatorFailure) };
    });
    if (banks.some(b => b.publishedRwa === BigInt(0) && b.publicLoss !== BigInt(0)))
        throw new Error("LIQUIDITY_PUBLIC_CAPITAL_DENOMINATOR");
    const marks = list(f.marks).map(v => {
        const m = record(v, ["assetId", "markPpm"]);
        return { assetId: text(m.assetId), markPpm: integer(m.markPpm, 0, 1000000000) };
    });
    const bids = list(f.bids).map(v => {
        const b = record(v, ["id", "buyer", "assetId", "quantity", "pricePpm"]), buyer = record(b.buyer, ["kind", "id"]);
        return { id: text(b.id), buyer: { kind: oneOf(buyer.kind, ["BANK", "ACCOUNT"] as const), id: text(buyer.id) }, assetId: text(b.assetId), quantity: money(b.quantity), pricePpm: integer(b.pricePpm, 1, 1000000000) };
    });
    unique(banks.map(b => b.bankId));
    unique(marks.map(m => m.assetId));
    unique(bids.map(b => b.id));
    if (banks.length !== g.banks.length || banks.some(b => !g.banks.some(x => x.id === b.bankId) || b.exposures.some(e => e.bankId === b.bankId || !g.banks.some(x => x.id === e.bankId))) || marks.length !== g.assets.length || marks.some(m => !g.assets.some(a => a.id === m.assetId)) || bids.some(b => !g.assets.some(a => a.id === b.assetId) || (b.buyer.kind === "BANK" ? !g.banks.some(x => x.id === b.buyer.id) : !g.accounts.some(a => a.id === b.buyer.id && a.bankId === null))))
        throw new Error("LIQUIDITY_FACT_COVERAGE");
    return { banks, marks, bids };
}
function command(v: LiquidityJson): LiquidityIntent {
    if (!v || typeof v !== "object" || Array.isArray(v))
        throw new Error("LIQUIDITY_COMMAND");
    const common = { id: text(v.id), actor: text(v.actor) };
    switch (v.kind) {
        case "MOVE": {
            const c = record(v, ["id", "actor", "kind", "from", "to", "amount"]);
            const amount = money(c.amount);
            if (amount === BigInt(0))
                throw new Error("LIQUIDITY_POSITIVE");
            return { ...common, kind: v.kind, from: reference(c.from), to: reference(c.to), amount };
        }
        case "CAPITAL": {
            const c = record(v, ["id", "actor", "kind", "bankId", "accountId", "amount"]);
            return { ...common, kind: v.kind, bankId: text(c.bankId), accountId: text(c.accountId), amount: money(c.amount) };
        }
        case "BID": {
            const c = record(v, ["id", "actor", "kind", "bankId", "buyerBankId", "price", "capitalInjection"]);
            return { ...common, kind: v.kind, bankId: text(c.bankId), buyerBankId: text(c.buyerBankId), price: money(c.price, true), capitalInjection: money(c.capitalInjection) };
        }
        default: throw new Error("LIQUIDITY_COMMAND");
    }
}
export function decodeLiquidityFrames(raw: unknown, g: LiquidityGenesis): LiquidityFrame[] {
    const frames = list(strictJson(raw)).map(v => {
        const f = record(v, ["tick", "facts", "commands"]), tick = liquidityTick(f.tick), commands = list(f.commands).map(command);
        unique(commands.map(c => c.id));
        if ((tick % 30 === 0 || tick % 720 === 719) && f.facts === null)
            throw new Error("LIQUIDITY_FACTS_REQUIRED");
        return { tick, facts: f.facts === null ? null : facts(f.facts, g), commands };
    });
    unique(frames.map(f => String(f.tick)));
    return frames;
}
