// T10A-01: the 10 §5 event kinds, their visibility, and zod payload schemas for every kind whose §5 payload names its fields.
// Money is a decimal string (G3). Objects are strict: no undeclared key can ride along. Kinds whose §5 payload is prose
// ("loan fields", "project summary", "island or right", …) or whose field types §5 does not fix are in DEFERRED_EVENT_KINDS, each
// mapped to its owner card (E-88 (2d)); emitting one throws CITY_EVENT_SCHEMA_MISSING. checkCityEvent is the emit-time gate: schema,
// the §3.24 opt-ins (E-88 (2a)/(2e)) and the byUse presence rule (E-88 (2f)).
import { EngineFault, type Visibility } from '@tycoon/engine-core';
import type { SectorId } from '@tycoon/content';
import { z } from 'zod';
import { BLOC_ORDER } from '@tycoon/engine-macro';
import { effectivePublicRecord, DEFAULT_PUBLIC_RECORD, PROPERTY_TYPES, TENANT_KINDS, LEASE_STATUSES, TRANSITION_CAUSES, USE_CLASSES,
  type Area, type DistrictUseMarket, type PublicPropertyRecord, type UseClass } from './schema';

/** 22 SectorId values (content SECTOR_IDS, derived.ts; content is type-only in this package). The check below stops compiling if 22's
 *  SectorId gains a value this list lacks. */
export const CITY_SECTOR_IDS = ['TECH', 'SEMI', 'ENERGY', 'MATERIALS', 'INDUSTRIALS', 'FINANCIALS', 'HEALTH', 'STAPLES', 'DISCRETIONARY',
  'REAL_ESTATE', 'MEDIA', 'SECURITY'] as const satisfies readonly SectorId[];
const SECTORS_COMPLETE: [Exclude<SectorId, (typeof CITY_SECTOR_IDS)[number]>] extends [never] ? true : never = true;
void SECTORS_COMPLETE;

const money = z.string().regex(/^-?(0|[1-9][0-9]*)$/);   // decimal string of a bigint (G3)
const num = z.number().refine(Number.isFinite);
const int = z.number().int();
const tick = int.nonnegative();
const id = z.string().min(1);
const o = z.strictObject;
const e = <T extends string>(xs: readonly T[]) => z.enum(xs as unknown as [T, ...T[]]);
const use = e(USE_CLASSES);
const byUse = <S extends z.ZodType>(v: S) => z.partialRecord(use, v);   // E-88 (2f): a key iff that use has supply > 0 in the scope

/** §2.11 CityTransition (also the `city.transition` payload). */
export const cityTransitionSchema = o({ id, parcelId: id, cause: e(TRANSITION_CAUSES), fromState: z.string(), toState: z.string(), publishedTick: tick, sourceEventId: id });
/** §2.3 Appraisal with Money as decimal strings. */
export const appraisalSchema = o({ tick, valueIncome: money, valueComp: money, weightIncome: num, value: money, priceIndexAtAppraisal: num,
  appraiser: z.enum(['SYSTEM', 'NPC_FIRM', 'PLAYER_FIRM']) });
/** §2.4 Lease with Money as decimal strings ("lease fields", §5 prop.leaseSigned / prop.leaseEnded). */
export const leaseSchema = o({ id, propId: id, unitIds: z.array(id), landlordId: id, tenantId: id, tenantKind: e(TENANT_KINDS), use, rentPerGD: money,
  revenueSharePct: num, startTick: tick, endTick: tick, indexation: z.enum(['CPI', 'FIXED']), depositHeld: money, breakFeeGD: num, status: e(LEASE_STATUSES),
  arrearsGD: num, relatedParty: z.boolean(), contractId: id.nullable() });
const listing = o({ listingId: id, propId: id, type: e(PROPERTY_TYPES), districtId: id, ask: money });
const opened = o({ cityId: id, bloc: e(BLOC_ORDER).nullable() /* null: Isla Serena */, openTick: tick });

export const CITY_EVENTS: Readonly<Record<string, z.ZodType>> = Object.freeze({
  'city.dayClose': o({ cityId: id, population: num, households: num, jobs: num, priceIndex: num, vacancyByUse: byUse(num), rentIndexByUse: byUse(num) }),
  'city.districtMarket': o({ districtId: id, byUse: byUse(o({ rentIndex: num, vacancy: num, pressure: num, capRate: num, priceIndex: num })) }),
  /** E-88 (2d): 10 §2.9 EmploymentDelta; jobs is a signed integer. */
  'city.employmentDelta': o({ cityId: id, districtId: id.nullable(), jobs: int, sector: e(CITY_SECTOR_IDS), cause: id }),
  'city.opened': opened,
  'city.opening': opened,
  'city.transition': cityTransitionSchema,
  'city.manifestPublished': o({ cityId: id, stateVersion: int.nonnegative() }),
  'prop.listed': listing,
  'prop.delisted': listing,
  'prop.purchased': o({ propId: id, type: e(PROPERTY_TYPES), districtId: id, price: money, buyerDisplay: z.string().optional() }),
  'prop.leaseSigned': leaseSchema,
  'prop.leaseEnded': leaseSchema,
  'prop.appraised': appraisalSchema,
  'prop.conditionLow': o({ propId: id, condition: num }),
  'mortgage.foreclosure': o({ loanId: id, propId: id, saleValue: money, shortfall: money }),
  'dev.completed': o({ projectId: id, buildingId: id, appraisal: appraisalSchema }),
  'dev.cancelled': o({ projectId: id }),
  'dev.stalled': o({ projectId: id }),
});

/** E-88 (2d): §5 kinds with no payload schema yet, each mapped to the card that owns its schema. */
export const DEFERRED_EVENT_KINDS: Readonly<Record<string, string>> = Object.freeze({
  // T10A-06 (arrears / amount are money strings; peril is 08's enum)
  'prop.tenantDefault': 'T10A-06', 'prop.eviction': 'T10A-06', 'prop.exception': 'T10A-06', 'prop.damage': 'T10A-06', 'prop.relatedPartyLease': 'T10A-06',
  'prop.appraisalByPlayerFirm': 'T10A-07',
  'hall.snapshot': 'T10A-10',
  'mortgage.originated': 'T10B-01', 'mortgage.paid': 'T10B-01', 'mortgage.late': 'T10B-01', 'mortgage.covenantBreach': 'T10B-01',
  'mortgage.cureStarted': 'T10B-01', 'mortgage.cured': 'T10B-01',
  'dev.planned': 'T10B-01', 'dev.permitDecision': 'T10B-01', 'dev.phaseStart': 'T10B-01', 'dev.phaseEnd': 'T10B-01',
  'land.auction': 'T10B-01', 'land.auctionResult': 'T10B-01', 'unique.auction': 'T10B-01', 'unique.sold': 'T10B-01',
});

/** 10 §5 visibility column. Where §5 gives two (a public record plus a fuller copy), this is the envelope's primary visibility and the
 *  comment carries the rest; the publisher (10A city transitions, 16 Wire) emits the second form. */
export const CITY_EVENT_VISIBILITY: Readonly<Record<string, Visibility>> = Object.freeze({
  'city.dayClose': 'PUBLIC', 'city.districtMarket': 'PUBLIC', 'city.employmentDelta': 'PUBLIC', 'city.opened': 'PUBLIC', 'city.opening': 'PUBLIC',
  'city.transition': 'PUBLIC', 'city.manifestPublished': 'PUBLIC',
  'prop.listed': 'PUBLIC', 'prop.delisted': 'PUBLIC',
  'prop.purchased': 'PUBLIC',            // + PARTIES full record
  'prop.leaseSigned': 'PARTIES', 'prop.leaseEnded': 'PARTIES', 'prop.tenantDefault': 'PARTIES', 'prop.eviction': 'PARTIES',
  'prop.appraised': 'PRIVATE',           // owner; lender as PARTIES
  'prop.exception': 'PRIVATE', 'prop.conditionLow': 'PRIVATE', 'prop.damage': 'PARTIES',
  'mortgage.originated': 'PARTIES', 'mortgage.paid': 'PARTIES', 'mortgage.late': 'PARTIES', 'mortgage.covenantBreach': 'PARTIES',
  'mortgage.cureStarted': 'PARTIES', 'mortgage.cured': 'PARTIES',
  'mortgage.foreclosure': 'PARTIES',     // + PUBLIC anonymous "foreclosure sale in District X"
  'dev.planned': 'PRIVATE',
  'dev.permitDecision': 'PARTIES',       // + PUBLIC for approved projects over 10,000 m²
  'dev.phaseStart': 'PRIVATE', 'dev.phaseEnd': 'PRIVATE',   // construction start PUBLIC as a transition
  'dev.completed': 'PRIVATE',            // carries the PRIVATE appraisal; the PUBLIC part is its city.transition
  'dev.cancelled': 'PUBLIC', 'dev.stalled': 'PUBLIC',
  'land.auction': 'PUBLIC', 'land.auctionResult': 'PUBLIC', 'unique.auction': 'PUBLIC', 'unique.sold': 'PUBLIC', 'hall.snapshot': 'PUBLIC',
  'prop.relatedPartyLease': 'SEALED', 'prop.appraisalByPlayerFirm': 'SEALED',
});

/** E-88 (2e) / AC-10A-01-8: the 10 §3.24 allowlist as payload keys, each with the §3.24 item (or §3.24 rule) it is published under.
 *  A PUBLIC payload carries only these keys; the opt-in keys also need their PUBLIC_OPT_IN flag. */
export const PUBLIC_PAYLOAD_KEYS: Readonly<Record<string, string>> = Object.freeze({
  cityId: 'geometry, roads, parcels, buildings', districtId: 'geometry, roads, parcels, buildings', parcelId: 'geometry, roads, parcels, buildings',
  propId: 'geometry, roads, parcels, buildings', buildingId: 'geometry, roads, parcels, buildings', type: 'geometry, roads, parcels, buildings',
  bloc: 'geometry, roads, parcels, buildings', openTick: 'geometry, roads, parcels, buildings', stateVersion: 'geometry, roads, parcels, buildings',
  id: 'parcel lifecycle', cause: 'parcel lifecycle', fromState: 'parcel lifecycle', toState: 'parcel lifecycle', publishedTick: 'parcel lifecycle',
  sourceEventId: 'parcel lifecycle', projectId: 'parcel lifecycle',
  population: 'rule (4) pooled aggregate', households: 'rule (4) pooled aggregate', jobs: 'rule (4) pooled aggregate',
  priceIndex: 'rule (4) pooled aggregate', vacancyByUse: 'rule (4) pooled aggregate', rentIndexByUse: 'rule (4) pooled aggregate',
  byUse: 'rule (4) pooled aggregate', rentIndex: 'rule (4) pooled aggregate', vacancy: 'rule (4) pooled aggregate',
  pressure: 'rule (4) pooled aggregate', capRate: 'rule (4) pooled aggregate', sector: 'rule (4) pooled aggregate',
  listingId: 'public market record (§5 prop.listed)', ask: 'public market record (§5 prop.listed)', price: 'public market record (§5 prop.purchased)',
  buyerDisplay: 'owner name of a property (opt-in)', ownerDisplay: 'owner name of a property (opt-in)', address: 'home location street address (opt-in)',
});
/** E-88 (2a): the opt-in each owner-identifying key needs (publicAddress counts only with visitableEstate). */
export const PUBLIC_OPT_IN: Readonly<Record<string, keyof PublicPropertyRecord>> = Object.freeze({
  buyerDisplay: 'publicOwnership', ownerDisplay: 'publicOwnership', address: 'publicAddress' });
const OPT_IN_KEYS: readonly string[] = ['buyerDisplay', 'ownerDisplay', 'address'];
/** True when `key` may be published under the record's (effective) opt-ins; keys with no opt-in are always true. */
export function optInAllows(key: string, rec: PublicPropertyRecord = DEFAULT_PUBLIC_RECORD): boolean {
  const flag = PUBLIC_OPT_IN[key];
  return flag === undefined || effectivePublicRecord(rec)[flag];
}

/** E-88 (2f): the byUse fields of each emitted kind, checked against the scope's supply. */
const BY_USE_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'city.dayClose': ['vacancyByUse', 'rentIndexByUse'], 'city.districtMarket': ['byUse'] });
/** The scope (city or district) of an emitted event: the supply area by use (E-88 (2f)) and, for a property event, its opt-ins. */
export interface CityEventScope { supplyByUse?: Partial<Record<UseClass, Area>>; publicRecord?: PublicPropertyRecord }

/** A district's supply by use (only uses with supply > 0). */
export function supplyByUseOf(market: Readonly<Record<UseClass, DistrictUseMarket>>): Partial<Record<UseClass, Area>> {
  const out: Partial<Record<UseClass, Area>> = {};
  for (const u of USE_CLASSES) if (market[u].supplyArea > 0) out[u] = market[u].supplyArea;
  return out;
}
/** E-88 (2f): a byUse map with a key iff that use has supply > 0; never zero-filled. */
export function byUseOf<V>(supply: Partial<Record<UseClass, Area>>, f: (u: UseClass) => V): Partial<Record<UseClass, V>> {
  const out: Partial<Record<UseClass, V>> = {};
  for (const u of USE_CLASSES) if ((supply[u] ?? 0) > 0) out[u] = f(u);
  return out;
}

const bad = (code: string, msg: string, kind: string): never => { throw new EngineFault(code, msg, [kind]); };
/** The emit-time gate. Throws CITY_EVENT_SCHEMA_MISSING for a deferred or unknown kind (E-88 (2d)), CITY_EVENT_BAD_PAYLOAD when the
 *  schema rejects, CITY_EVENT_NOT_OPTED_IN for an owner/address key without its opt-in, CITY_EVENT_SCOPE_MISSING when a byUse kind has
 *  no supplyByUse, and CITY_EVENT_BYUSE_PRESENCE when a use key is present without supply or absent with supply. Returns the parsed payload. */
export function checkCityEvent(kind: string, payload: unknown, scope: CityEventScope = {}): Record<string, unknown> {
  const schema = CITY_EVENTS[kind];
  if (schema === undefined) {
    const owner = DEFERRED_EVENT_KINDS[kind];
    return bad('CITY_EVENT_SCHEMA_MISSING', owner === undefined ? `${kind} is not a 10 §5 kind` : `${kind} has no payload schema yet (owner ${owner})`, kind);
  }
  const r = schema.safeParse(payload);
  if (!r.success) return bad('CITY_EVENT_BAD_PAYLOAD', `${kind}: ${r.error.issues[0]?.path.join('.') ?? ''} ${r.error.issues[0]?.message ?? ''}`, kind);
  const p = r.data as Record<string, unknown>;
  for (const k of OPT_IN_KEYS) if (k in p && !optInAllows(k, scope.publicRecord)) bad('CITY_EVENT_NOT_OPTED_IN', `${kind}.${k} needs ${PUBLIC_OPT_IN[k]}`, kind);
  const fields = BY_USE_FIELDS[kind];
  if (fields !== undefined) {
    const supply = scope.supplyByUse;
    if (supply === undefined) return bad('CITY_EVENT_SCOPE_MISSING', `${kind} needs the scope's supplyByUse`, kind);
    for (const f of fields) {
      const m = p[f] as Partial<Record<UseClass, unknown>>;
      for (const u of USE_CLASSES) {
        const has = (supply[u] ?? 0) > 0;
        if ((u in m) !== has) bad('CITY_EVENT_BYUSE_PRESENCE', `${kind}.${f}.${u}: ${has ? 'missing for a use with supply' : 'present with no supply'}`, kind);
      }
    }
  }
  return p;
}
