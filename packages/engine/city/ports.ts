// T10A-01 step 5: dependency-inversion ports (G6.1) through which 10A reads modules built after it or owned elsewhere.
// Every function is pure over StoreRead; null = input missing (the caller holds its last value). The signatures are the narrowest the
// card's one-line descriptions support; each is listed as a spec question in the PR until the owning task fixes it.
import type { Ccy, Id, StoreRead } from '@tycoon/engine-core';
import type { ContentView } from '@tycoon/content';
import type { BlocId } from '@tycoon/engine-macro';
import type { UseClass } from './schema';

/** 22 (T22A-02, E-86): city names and personalities. Today ContentView has cities() / serena() / sectors();
 *  MISSING EXPORT: T22A-02 city personality getter (10 §3.19) — added to this port when it lands. */
export type CityContentPort = Pick<ContentView, 'cities' | 'serena' | 'sectors'>;

/** 04: the 10-year yield and inflation (cap rates §3.8.2, CPI lease indexation §2.4) and the city allocation of bloc GDP (§3.3). */
export interface CityMacroPort {
  y10(s: StoreRead, ccy: Ccy): number | null;                  // per GY
  inflation(s: StoreRead, bloc: BlocId): number | null;        // π, per GY
  cityAllocation(s: StoreRead, cityId: Id): number | null;     // the city's share of its bloc's GDP
}

/** 09: business premises demand by district and use (§3.4), in m². */
export interface CityBizPort { premisesDemand(s: StoreRead, districtId: Id, use: UseClass): number | null }

/** 16: household demand by district and use (§3.4), in m². */
export interface CityHhPort { householdDemand(s: StoreRead, districtId: Id, use: UseClass): number | null }

export interface CityPorts { content22: CityContentPort; macro04: CityMacroPort; biz09: CityBizPort; hh16: CityHhPort }
