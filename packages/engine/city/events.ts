// T10A-01: the 10 §5 event kinds, their visibility, and zod payload schemas for every kind whose §5 payload names its fields.
// Money is a decimal string (G3). Objects are strict: no undeclared key can ride along. Kinds whose §5 payload is prose
// ("loan fields", "project summary", "island or right", …) or whose field types §5 does not fix are in DEFERRED_EVENT_KINDS
// (visibility only) until the owning 10A/10B task or a spec answer fixes them.
import type { Visibility } from '@tycoon/engine-core';
import { z } from 'zod';
import { BLOC_ORDER } from '@tycoon/engine-macro';
import { PROPERTY_TYPES, TENANT_KINDS, LEASE_STATUSES, TRANSITION_CAUSES, USE_CLASSES } from './schema';

const money = z.string().regex(/^-?(0|[1-9][0-9]*)$/);   // decimal string of a bigint (G3)
const num = z.number().refine(Number.isFinite);
const int = z.number().int();
const tick = int.nonnegative();
const id = z.string().min(1);
const o = z.strictObject;
const e = <T extends string>(xs: readonly T[]) => z.enum(xs as unknown as [T, ...T[]]);
const use = e(USE_CLASSES);
const byUse = <S extends z.ZodType>(v: S) => z.partialRecord(use, v);   // §5 does not say every use is present

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

/** §5 kinds with no payload schema yet, and why (spec question in the T10A-01 PR). */
export const DEFERRED_EVENT_KINDS: Readonly<Record<string, string>> = Object.freeze({
  'city.employmentDelta': '`sector` and `cause` value sets not fixed (09/16 EmploymentDelta)',
  'prop.tenantDefault': '`arrears`: Money or rent-days (LeaseRow.arrearsGD) not fixed',
  'prop.eviction': '`arrears`: Money or rent-days (LeaseRow.arrearsGD) not fixed',
  'prop.exception': '`kind` value set not fixed; `propId | groupId` shape not fixed',
  'prop.damage': '`peril` value set is 08\'s',
  'mortgage.originated': '"loan fields": 10B mortgage record', 'mortgage.paid': '"loan fields": 10B mortgage record',
  'mortgage.late': '"loan fields": 10B mortgage record', 'mortgage.covenantBreach': '"loan fields": 10B mortgage record',
  'mortgage.cureStarted': '"loan fields": 10B mortgage record', 'mortgage.cured': '"loan fields": 10B mortgage record',
  'dev.planned': '"project summary": 10B project record',
  'dev.permitDecision': '`status` / `reason` value sets: 10B permits',
  'dev.phaseStart': '`phase` / `overrun` types: 10B development phases', 'dev.phaseEnd': '`phase` / `overrun` types: 10B development phases',
  'land.auction': '`parcels` shape: 10B land auctions', 'land.auctionResult': '`parcels` shape: 10B land auctions',
  'unique.auction': '"island or right": 10B unique assets', 'unique.sold': '"island or right": 10B unique assets',
  'hall.snapshot': '`seats` shape: Hall of Patrons (§3.25)',
  'prop.relatedPartyLease': '"lease id, deviation": field names not fixed',
  'prop.appraisalByPlayerFirm': '"appraisal, firm, client": field names not fixed',
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
