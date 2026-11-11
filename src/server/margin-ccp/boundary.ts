import { createHash } from "node:crypto";
import { types } from "node:util";
export type MarginCcpJson = null | boolean | number | string | MarginCcpJson[] | {
    [key: string]: MarginCcpJson;
};
function jsonTree(input: unknown, encodeMoney: boolean): MarginCcpJson {
    const seen = new Set<object>();
    const walk = (value: unknown): MarginCcpJson => {
        if (types.isProxy(value))
            throw new Error("MARGIN_CCP_PROXY_INPUT");
        if (encodeMoney && typeof value === "bigint")
            return value.toString();
        if (value === null || typeof value === "string" || typeof value === "boolean")
            return value;
        if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0))
            return value;
        if (typeof value !== "object" || value === null || seen.has(value))
            throw new Error("MARGIN_CCP_JSON_TREE");
        seen.add(value);
        if (Array.isArray(value)) {
            if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1)
                throw new Error("MARGIN_CCP_DENSE_ARRAY");
            const out: MarginCcpJson[] = [];
            for (let i = 0; i < value.length; i++) {
                const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
                if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
                    throw new Error("MARGIN_CCP_DENSE_ARRAY");
                out.push(walk(descriptor.value));
            }
            return out;
        }
        if (Object.getPrototypeOf(value) !== Object.prototype)
            throw new Error("MARGIN_CCP_PLAIN_OBJECT");
        const out: {
            [key: string]: MarginCcpJson;
        } = {};
        const keys = Reflect.ownKeys(value);
        if (keys.some((key) => typeof key !== "string"))
            throw new Error("MARGIN_CCP_JSON_KEY");
        for (const key of (keys as string[]).sort()) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
            if (!descriptor.enumerable || !("value" in descriptor) || ["__proto__", "constructor", "prototype"].includes(key))
                throw new Error("MARGIN_CCP_JSON_PROPERTY");
            out[key] = walk(descriptor.value);
        }
        return out;
    };
    return walk(input);
}
export function strictJson(input: unknown): MarginCcpJson {
    return jsonTree(input, false);
}
export function canonicalJson(value: unknown): string {
    return JSON.stringify(strictJson(value));
}
// Domain money is explicitly encoded; no toJSON/accessor/proxy can run before validation.
export function marginCcpWire(value: unknown): MarginCcpJson {
    return jsonTree(value, true);
}
export function marginCcpFingerprint(domainValue: unknown): string {
    return createHash("sha256").update(canonicalJson(marginCcpWire(domainValue))).digest("hex");
}
import type { Money } from "../../../packages/engine/core/types";
import type { MarginCcpGenesis, MarginCcpFrame, MarginCcpFacts, MarginCcpServiceId, MarginCcpCommand } from "./model";
export function record(v: MarginCcpJson, keys: string[]): {
    [key: string]: MarginCcpJson;
} {
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k)))
        throw new Error("MARGIN_CCP_FIELDS");
    return v;
}
const list = (v: MarginCcpJson): MarginCcpJson[] => {
    if (!Array.isArray(v))
        throw new Error("MARGIN_CCP_ARRAY");
    return v;
};
const text = (v: MarginCcpJson): string => {
    if (typeof v !== "string" || !/^[A-Za-z0-9_./-]{1,160}$/.test(v))
        throw new Error("MARGIN_CCP_ID");
    return v;
};
const reference = (v: MarginCcpJson): string => {
    if (typeof v !== "string" || !/^[A-Za-z0-9_./%~-]{1,2000}$/.test(v))
        throw new Error("MARGIN_CCP_REFERENCE_ID");
    return v;
};
const flag = (v: MarginCcpJson): boolean => {
    if (typeof v !== "boolean")
        throw new Error("MARGIN_CCP_BOOLEAN");
    return v;
};
const integer = (v: unknown, min: number, max: number): number => {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || Object.is(v, -0) || v < min || v > max)
        throw new Error("MARGIN_CCP_INTEGER");
    return v;
};
export const marginCcpTick = (v: unknown): number => integer(v, 0, Number.MAX_SAFE_INTEGER - 2000000);
const money = (v: MarginCcpJson, signed = false): Money => {
    if (typeof v !== "string" || !(signed ? /^(0|-?[1-9][0-9]{0,29})$/ : /^(0|[1-9][0-9]{0,29})$/).test(v))
        throw new Error("MARGIN_CCP_MONEY");
    return BigInt(v);
};
function service(v: MarginCcpJson): MarginCcpServiceId {
    if (v === "LD" || v === "OTC" || v === "CDS" || v === "REPO")
        return v;
    throw new Error("MARGIN_CCP_SERVICE");
}
const unique = (ids: string[]): void => {
    if (new Set(ids).size !== ids.length)
        throw new Error("MARGIN_CCP_DUPLICATE");
};
export function decodeMarginCcpGenesis(raw: unknown): MarginCcpGenesis {
    const g = record(strictJson(raw), ["world", "ccy", "members", "services"]);
    if (g.ccy !== "FDL")
        throw new Error("MARGIN_CCP_FDL_ONLY");
    const members = list(g.members).map(v => {
        const m = record(v, ["id", "owner", "npc", "wallet", "accounts"]), accounts = list(m.accounts).map(v => {
            const a = record(v, ["service", "targetDf", "marginCash", "df"]);
            return { service: service(a.service), targetDf: money(a.targetDf), marginCash: money(a.marginCash), df: money(a.df) };
        });
        unique(accounts.map(a => a.service));
        return { id: text(m.id), owner: text(m.owner), npc: flag(m.npc), wallet: money(m.wallet), accounts };
    });
    const services = list(g.services).map(v => {
        const s = record(v, ["id", "sitg1", "sitg2", "owners"]), owners = list(s.owners).map(v => {
            const o = record(v, ["memberId", "weightPpm"]);
            return { memberId: text(o.memberId), weightPpm: integer(o.weightPpm, 1, 1000000) };
        });
        unique(owners.map(o => o.memberId));
        return { id: service(s.id), sitg1: money(s.sitg1), sitg2: money(s.sitg2), owners };
    });
    unique(members.map(m => m.id));
    unique(services.map(s => s.id));
    if (!members.length || !services.length || members.some(m => m.accounts.some(a => !services.some(s => s.id === a.service) || a.df > a.targetDf)) || services.some(s => s.owners.reduce((n, o) => n + o.weightPpm, 0) !== 1000000 || s.owners.some(o => !members.some(m => m.id === o.memberId && m.accounts.some(a => a.service === s.id)))))
        throw new Error("MARGIN_CCP_REFERENCE");
    for (const s of services) {
        const df = members.flatMap(m => m.accounts).filter(a => a.service === s.id).reduce((n, a) => n + a.targetDf, BigInt(0)), q = df / BigInt(10), r = df % BigInt(10), required = q + (r > BigInt(5) || (r === BigInt(5) && q % BigInt(2) !== BigInt(0)) ? BigInt(1) : BigInt(0));
        if (s.sitg1 !== required || s.sitg2 !== required)
            throw new Error("MARGIN_CCP_SITG_PREFUNDING");
    }
    return { world: text(g.world), ccy: g.ccy, members, services };
}
function facts(v: MarginCcpJson, g: MarginCcpGenesis): MarginCcpFacts {
    const f = record(v, ["risks", "defaults", "closeouts", "vm"]), valid = (memberId: string, s: MarginCcpServiceId) => g.members.some(m => m.id === memberId && m.accounts.some(a => a.service === s));
    const risks = list(f.risks).map(v => {
        const r = record(v, ["memberId", "service", "im", "equityAdjustment", "held", "positions"]), positions = list(r.positions).map(v => {
            const p = record(v, ["assetId", "quantity", "fairValue", "marginalIm", "expectedCost", "sigmaPpm", "expectedTickVolume", "marketOpen", "opening", "openingVolume"]);
            return { assetId: text(p.assetId), quantity: money(p.quantity, true), fairValue: money(p.fairValue), marginalIm: money(p.marginalIm), expectedCost: money(p.expectedCost), sigmaPpm: integer(p.sigmaPpm, 0, 1000000), expectedTickVolume: money(p.expectedTickVolume), marketOpen: flag(p.marketOpen), opening: flag(p.opening), openingVolume: money(p.openingVolume) };
        });
        unique(positions.map(p => p.assetId));
        return { memberId: text(r.memberId), service: service(r.service), im: money(r.im), equityAdjustment: money(r.equityAdjustment, true), held: flag(r.held), positions };
    });
    const defaults = list(f.defaults).map(v => {
        const d = record(v, ["memberId", "service", "reason"]);
        if (d.reason !== "BANK_RESOLUTION" && d.reason !== "REGULATOR")
            throw new Error("MARGIN_CCP_DEFAULT_REASON");
        return { memberId: text(d.memberId), service: service(d.service), reason: d.reason as "BANK_RESOLUTION" | "REGULATOR" };
    });
    const closeouts = list(f.closeouts).map(v => {
        const c = record(v, ["defaultId", "sourceId", "loss", "claims", "scores"]), claims = list(c.claims).map(v => {
            const x = record(v, ["memberId", "amount"]);
            return { memberId: text(x.memberId), amount: money(x.amount) };
        }), scores = list(c.scores).map(v => {
            const x = record(v, ["memberId", "distance"]);
            return { memberId: text(x.memberId), distance: money(x.distance) };
        });
        unique(claims.map(c => c.memberId));
        unique(scores.map(c => c.memberId));
        const loss = money(c.loss);
        if (claims.reduce((n, c) => n + c.amount, BigInt(0)) !== loss || claims.some(c => !g.members.some(m => m.id === c.memberId)) || scores.some(c => !g.members.some(m => m.id === c.memberId)))
            throw new Error("MARGIN_CCP_CLOSEOUT_SUM");
        return { defaultId: reference(c.defaultId), sourceId: text(c.sourceId), loss, claims, scores };
    });
    const vm = list(f.vm).map(v => {
        const x = record(v, ["service", "fromMemberId", "toMemberId", "amount"]);
        return { service: service(x.service), fromMemberId: text(x.fromMemberId), toMemberId: text(x.toMemberId), amount: money(x.amount) };
    });
    unique(risks.map(r => r.service + "/" + r.memberId));
    unique(defaults.map(d => d.service + "/" + d.memberId));
    unique(closeouts.map(c => c.defaultId));
    if (risks.length !== g.members.reduce((n, m) => n + m.accounts.length, 0) || risks.some(r => !valid(r.memberId, r.service)) || defaults.some(d => !valid(d.memberId, d.service)) || vm.some(x => !valid(x.fromMemberId, x.service) || !valid(x.toMemberId, x.service) || x.fromMemberId === x.toMemberId))
        throw new Error("MARGIN_CCP_FACT_COVERAGE");
    return { risks, defaults, closeouts, vm };
}
function command(v: MarginCcpJson): MarginCcpCommand {
    if (!v || typeof v !== "object" || Array.isArray(v))
        throw new Error("MARGIN_CCP_COMMAND");
    const common = { id: text(v.id), actor: text(v.actor) };
    if (v.kind === "POST_MARGIN") {
        const c = record(v, ["id", "actor", "kind", "memberId", "service", "amount"]);
        return { ...common, kind: v.kind, memberId: text(c.memberId), service: service(c.service), amount: money(c.amount) };
    }
    if (v.kind === "PAY_CALL") {
        const c = record(v, ["id", "actor", "kind", "callId", "amount"]);
        return { ...common, kind: v.kind, callId: reference(c.callId), amount: money(c.amount) };
    }
    throw new Error("MARGIN_CCP_COMMAND");
}
export function decodeMarginCcpFrames(raw: unknown, g: MarginCcpGenesis): MarginCcpFrame[] {
    const frames = list(strictJson(raw)).map(v => {
        const f = record(v, ["tick", "facts", "commands"]), commands = list(f.commands).map(command);
        unique(commands.map(c => c.id));
        return { tick: marginCcpTick(f.tick), facts: facts(f.facts, g), commands };
    });
    unique(frames.map(f => String(f.tick)));
    return frames;
}
