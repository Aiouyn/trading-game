import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import type { Money } from "../../../../../packages/engine/core/types";
import type { BankCommand, BankingFrame, BankingGenesis, HourlyBankMarket, ClientSeed } from "./model";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export function strictJson(input: unknown): Json {
  const seen = new Set<object>();
  const walk = (value: unknown): Json => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (typeof value !== "object" || value === null || isProxy(value) || seen.has(value)) throw new Error("BANK_JSON_TREE");
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) throw new Error("BANK_DENSE_ARRAY");
      const out: Json[] = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error("BANK_DENSE_ARRAY");
        out.push(walk(descriptor.value));
      }
      return out;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("BANK_PLAIN_OBJECT");
    const out: { [key: string]: Json } = {};
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) throw new Error("BANK_JSON_KEY");
    for (const key of (keys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !("value" in descriptor) || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error("BANK_JSON_PROPERTY");
      out[key] = walk(descriptor.value);
    }
    return out;
  };
  return walk(input);
}
export function canonicalJson(value: unknown): string { return JSON.stringify(strictJson(value)); }
// Only trusted domain values reach this explicit bigint -> canonical decimal wire encoding.
export function bankWire(value: unknown): Json { return strictJson(JSON.parse(JSON.stringify(value, (_key, v) => typeof v === "bigint" ? v.toString() : v))); }
export function bankFingerprint(domainValue: unknown): string { return createHash("sha256").update(canonicalJson(bankWire(domainValue))).digest("hex"); }
export function record(v: Json, keys: string[]): { [key: string]: Json } {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join("|") !== [...keys].sort().join("|")) throw new Error("BANK_FIELDS");
  return v;
}
function list(v: Json): Json[] { if (!Array.isArray(v)) throw new Error("BANK_ARRAY"); return v; }
function text(v: Json): string { if (typeof v !== "string" || v.length === 0) throw new Error("BANK_ID"); return v; }
export function bankTick(v: unknown, min = 0): number { if (typeof v !== "number" || !Number.isSafeInteger(v) || Object.is(v, -0) || v < min || v > Number.MAX_SAFE_INTEGER - 1440) throw new Error("BANK_TICK"); return v; }
function ppm(v: Json): number { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > 1_000_000) throw new Error("BANK_PPM"); return v; }
function cash(v: Json, positive = false): Money { if (typeof v !== "string" || !/^(0|[1-9][0-9]*)$/.test(v) || (positive && v === "0")) throw new Error("BANK_MICRO_MONEY"); return BigInt(v); }
function flag(v: Json): boolean { if (typeof v !== "boolean") throw new Error("BANK_BOOLEAN"); return v; }
function product(v: Json): "SIGHT" | "SAVINGS" { if (v !== "SIGHT" && v !== "SAVINGS") throw new Error("BANK_PRODUCT"); return v; }
function unique(values: string[]): void { if (new Set(values).size !== values.length) throw new Error("BANK_DUPLICATE"); }
export function decodeGenesis(raw: unknown): BankingGenesis {
  const g = record(strictJson(raw), ["world", "ccy", "initialPolicyPpm", "initialOnrPpm", "banks", "clients"]);
  if (g.ccy !== "FDL") throw new Error("BANK_FDL_ONLY");
  const banks = list(g.banks).map((row) => {
    const b = record(row, ["id", "cash", "sightRatePpm", "savingsRatePpm", "tolerancePpm", "enabled"]);
    return { id: text(b.id), cash: cash(b.cash), sightRatePpm: ppm(b.sightRatePpm), savingsRatePpm: ppm(b.savingsRatePpm), tolerancePpm: ppm(b.tolerancePpm), enabled: flag(b.enabled) };
  });
  unique(banks.map((b) => b.id));
  const clients = list(g.clients).map((row): ClientSeed => {
    const c = record(row, ["kind", "id", "cash", "presence"]), presence = list(c.presence).map(text);
    unique(presence);
    if (presence.some((id) => !banks.some((b) => b.id === id))) throw new Error("BANK_PRESENCE");
    if (c.kind !== "PERSON" && c.kind !== "BUSINESS") throw new Error("BANK_CLIENT_KIND");
    return { kind: c.kind, id: text(c.id), cash: cash(c.cash), presence };
  });
  unique(clients.map((c) => c.id));
  return { world: text(g.world), ccy: g.ccy, initialPolicyPpm: ppm(g.initialPolicyPpm), initialOnrPpm: ppm(g.initialOnrPpm), banks, clients };
}
function command(v: Json): BankCommand {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("BANK_COMMAND");
  const common = ["id", "actor", "kind"];
  if (v.kind === "OPEN") {
    const c = record(v, [...common, "depositId", "bankId", "product"]);
    return { id: text(c.id), actor: text(c.actor), kind: "OPEN", depositId: text(c.depositId), bankId: text(c.bankId), product: product(c.product) };
  }
  if (v.kind === "DEPOSIT" || v.kind === "WITHDRAW") {
    const c = record(v, [...common, "depositId", "amount"]);
    return { id: text(c.id), actor: text(c.actor), kind: v.kind, depositId: text(c.depositId), amount: cash(c.amount, true) };
  }
  if (v.kind === "MOVE" || v.kind === "PAY") {
    const c = record(v, [...common, "from", "to", "amount"]);
    return { id: text(c.id), actor: text(c.actor), kind: v.kind, from: text(c.from), to: text(c.to), amount: cash(c.amount, true) };
  }
  throw new Error("BANK_COMMAND");
}
export function decodeFrames(raw: unknown, genesis: BankingGenesis): BankingFrame[] {
  return list(strictJson(raw)).map((value) => {
    const f = record(value, ["tick", "commands", "market"]), tick = bankTick(f.tick), commands = list(f.commands).map(command);
    unique(commands.map((c) => c.id));
    let market: HourlyBankMarket | null = null;
    if (f.market !== null) {
      const m = record(f.market, ["fearPpm", "policyPpm", "dfrPpm", "mlfrPpm", "risks"]);
      const risks = list(m.risks).map((row) => { const r = record(row, ["bankId", "pdPpm"]); return { bankId: text(r.bankId), pdPpm: ppm(r.pdPpm) }; });
      unique(risks.map((r) => r.bankId));
      if (risks.length !== genesis.banks.length || risks.some((r) => !genesis.banks.some((b) => b.id === r.bankId))) throw new Error("BANK_RISK_COVERAGE");
      market = { fearPpm: ppm(m.fearPpm), policyPpm: ppm(m.policyPpm), dfrPpm: ppm(m.dfrPpm), mlfrPpm: ppm(m.mlfrPpm), risks };
      if (market.dfrPpm > market.policyPpm || market.policyPpm > market.mlfrPpm) throw new Error("BANK_CORRIDOR");
    }
    if ((tick % 30 === 29) !== (market !== null)) throw new Error("BANK_HOURLY_INPUT");
    return { tick, commands, market };
  });
}
