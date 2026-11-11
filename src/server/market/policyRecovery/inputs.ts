import { isProxy } from "node:util/types";
import type { Regime } from "../world";

export type Reading<T> = { kind: "LIVE"; value: T; observedHour: number; source: string } | { kind: "MISSING"; source: string; reason: string };
export type Bloc = "FDL" | "EUN" | "PYN" | "NKR" | "SRL";
export const BLOCS: readonly Bloc[] = ["FDL", "EUN", "PYN", "NKR", "SRL"];
export interface Valuation { bloc: Bloc; z: number; gdpShare: number }
export interface Credit { bloc: Bloc; z: number }
export interface Bank { bloc: Bloc; below12x: number }
export interface Fx { bloc: Bloc; reserveCover: number; currentAccount: number }
export interface Sovereign { bloc: Bloc; hazard: number }
export interface Housing { bloc: Bloc; gap: number; z: number }
export interface LaunchpadAggregate { graduated: number; cashCents: number; poolSamples: number; liquidating: number }
export interface Emergency { id: string; hour: number; blocs: Bloc[] }
export interface CatalogValues {
  fear: number; regime: Regime; gx: number; gxHigh: number; crisisWeek: boolean; fsi: number; tension: number; cryptoHype: number; minStablecoinBacking: number;
  semisValuationZ: number; aiRace: number; worldHeadlineInflation: number; poolUnderwritingQuality: number; repoLeverageIndex: number;
  defaultRateRising: boolean; valuation: Valuation[]; credit: Credit[]; banks: Bank[]; fx: Fx[]; sovereign: Sovereign[]; housing: Housing[];
  launchpad: LaunchpadAggregate; emergencies: Emergency[];
}
export type CatalogKey = keyof CatalogValues;
export type CatalogInputs = { epoch: string; hour: number } & { [K in CatalogKey]: Reading<CatalogValues[K]> };
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Boundary-only JSON tree check: no holes, exotic prototypes, hidden keys, accessors or coercion hooks. */
export function isPlainJson(v: unknown, ancestors = new Set<object>()): boolean {
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v) && !Object.is(v, -0);
  if (typeof v !== "object" || isProxy(v) || ancestors.has(v)) return false;
  const array = Array.isArray(v);
  if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)) return false;
  const keys = Reflect.ownKeys(v);
  if (array && (keys.length !== v.length + 1)) return false;
  ancestors.add(v);
  const valid = keys.every((key) => {
    if (array && key === "length") return true;
    if (array && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= v.length)) return false;
    const d = Object.getOwnPropertyDescriptor(v, key);
    return typeof key === "string" && !!d && d.enumerable === true && "value" in d && isPlainJson(d.value, ancestors);
  });
  ancestors.delete(v);
  return valid;
}
export const hasFields = (v: object, fields: readonly string[]) => Object.keys(v).length === fields.length && fields.every((k) => Object.hasOwn(v, k));
export const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const integer = (v: unknown): v is number => Number.isSafeInteger(v) && typeof v === "number" && v >= 0;
export const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 160;
const range = (lo: number, hi: number) => (v: unknown): v is number => finite(v) && v >= lo && v <= hi;
const bloc = (v: unknown): v is Bloc => v === "FDL" || v === "EUN" || v === "PYN" || v === "NKR" || v === "SRL";
const regime = (v: unknown): v is Regime => v === "EXPANSION" || v === "OVERHEATING" || v === "CONTRACTION" || v === "RECOVERY";
const rows = <T>(guard: (v: unknown) => v is T) => (v: unknown): v is T[] => Array.isArray(v) && v.length === BLOCS.length && v.every(guard)
  && new Set(v.map((r) => object(r) ? r.bloc : undefined)).size === BLOCS.length;
const validators: { [K in CatalogKey]: (v: unknown) => v is CatalogValues[K] } = {
  crisisWeek: (v: unknown): v is boolean => typeof v === "boolean",
  fear: range(0, 100), regime, gx: (v: unknown): v is number => integer(v) && v > 0, gxHigh: (v: unknown): v is number => integer(v) && v > 0, fsi: range(0, 1), tension: range(0, 100),
  cryptoHype: range(0, 1), minStablecoinBacking: range(0, 100), semisValuationZ: finite, aiRace: range(0, 100),
  worldHeadlineInflation: range(-1, 100), poolUnderwritingQuality: range(0, 1), repoLeverageIndex: range(0, 1e6),
  defaultRateRising: (v: unknown): v is boolean => typeof v === "boolean",
  valuation: rows((v: unknown): v is Valuation => object(v) && hasFields(v, ["bloc", "z", "gdpShare"]) && bloc(v.bloc) && finite(v.z) && range(0, 1)(v.gdpShare)),
  credit: rows((v: unknown): v is Credit => object(v) && hasFields(v, ["bloc", "z"]) && bloc(v.bloc) && finite(v.z)),
  banks: rows((v: unknown): v is Bank => object(v) && hasFields(v, ["bloc", "below12x"]) && bloc(v.bloc) && integer(v.below12x)),
  fx: rows((v: unknown): v is Fx => object(v) && hasFields(v, ["bloc", "reserveCover", "currentAccount"]) && bloc(v.bloc) && range(0, 1e6)(v.reserveCover) && range(-100, 100)(v.currentAccount)),
  sovereign: rows((v: unknown): v is Sovereign => object(v) && hasFields(v, ["bloc", "hazard"]) && bloc(v.bloc) && range(0, 100)(v.hazard)),
  housing: rows((v: unknown): v is Housing => object(v) && hasFields(v, ["bloc", "gap", "z"]) && bloc(v.bloc) && finite(v.gap) && finite(v.z)),
  launchpad: (v: unknown): v is LaunchpadAggregate => object(v) && hasFields(v, ["graduated", "cashCents", "poolSamples", "liquidating"]) && integer(v.graduated) && integer(v.cashCents) && integer(v.poolSamples)
    && integer(v.liquidating) && v.poolSamples <= v.graduated && v.liquidating <= v.poolSamples,
  emergencies: (v: unknown): v is Emergency[] => Array.isArray(v) && v.length <= 100 && v.every((e) => object(e) && hasFields(e, ["id", "hour", "blocs"]) && text(e.id) && integer(e.hour)
    && Array.isArray(e.blocs) && e.blocs.length > 0 && e.blocs.every(bloc) && new Set(e.blocs).size === e.blocs.length),
};
export function isKey(k: string): k is CatalogKey { return Object.hasOwn(validators, k); }
function readingOk(v: unknown, guard: (x: unknown) => boolean, hour: number): boolean {
  if (!object(v) || !text(v.source)) return false;
  if (v.kind === "MISSING") return hasFields(v, ["kind", "source", "reason"]) && text(v.reason);
  return v.kind === "LIVE" && hasFields(v, ["kind", "source", "observedHour", "value"]) && integer(v.observedHour) && v.observedHour <= hour && guard(v.value);
}
function isInputs(v: unknown): v is CatalogInputs {
  if (!object(v) || !text(v.epoch) || !integer(v.hour) || Object.keys(v).length !== Object.keys(validators).length + 2) return false;
  const hour = v.hour;
  if (!Object.entries(validators).every(([k, guard]) => readingOk(v[k], guard, hour))) return false;
  const gx = v.gx, high = v.gxHigh;
  // An observed intra-hour high cannot sit below the same hour's last print.
  if (object(gx) && object(high) && gx.kind === "LIVE" && high.kind === "LIVE" && gx.observedHour === high.observedHour && Number(high.value) < Number(gx.value)) return false;
  const emergencies = v.emergencies;
  if (!object(emergencies)) return false;
  if (emergencies.kind === "MISSING") return true;
  const observedHour = emergencies.observedHour;
  return integer(observedHour) && Array.isArray(emergencies.value) && emergencies.value.every((e) => object(e) && integer(e.hour) && e.hour <= observedHour);

}
export function parseInputs(v: unknown): CatalogInputs {
  if (!isPlainJson(v) || !isInputs(v)) throw new Error("INVALID_CATALOG_INPUTS");
  return structuredClone(v);
}
export const missing = (source: string, reason = "source not implemented on base"): Reading<never> => ({ kind: "MISSING", source, reason });
export const observed = <T>(value: T, hour: number, source: string): Reading<T> => ({ kind: "LIVE", value, observedHour: hour, source });
export function missingInputs(epoch: string, hour: number): CatalogInputs {
  const raw: Record<string, unknown> = { epoch, hour };
  for (const k of Object.keys(validators)) raw[k] = missing(k);
  return parseInputs(raw);
}
export function fresh<K extends CatalogKey>(s: CatalogInputs, key: K): boolean { const r = s[key]; return r.kind === "LIVE" && r.observedHour === s.hour; }
export function live<K extends CatalogKey>(s: CatalogInputs, key: K): CatalogValues[K] {
  const r = s[key];
  if (r.kind !== "LIVE" || r.observedHour !== s.hour) throw new Error(`UNAVAILABLE_INPUT:${key}`);
  const value: unknown = r.value;
  if (!validValue(key, value)) throw new Error(`INVALID_INPUT_VALUE:${key}`);
  return value;
}

function validValue<K extends CatalogKey>(key: K, value: unknown): value is CatalogValues[K] { return validators[key](value); }
