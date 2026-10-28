// T10A-01 step 5: dependency-inversion ports (G6.1) through which 10A reads modules built after it or owned elsewhere.
// Signatures are E-88 (2b) verbatim. Every function is pure over StoreRead; null = input missing (the caller holds its last value).
// 10 computes cityGdpShare (§3.3 step 4) and district demand (§3.4, from §2.9 CityDemandInputs) itself, so no port returns a city
// allocation or a demand in m². EmploymentDelta items arrive as `city.employmentDelta` events (events.ts), not through a port.
import type { Id, Money, StoreRead } from '@tycoon/engine-core';
import type { ContentView } from '@tycoon/content';
import type { BlocId } from '@tycoon/engine-macro';
import type { UseClass } from './schema';

/** 04 bloc-level inputs (10 §3.3): rates per GY; c in [−1, 1]. */
export interface BlocMacroInputs { g: number; pi: number; u: number; i: number; y10: number; c: number }

/** 04 (E-88 (2b)). Bloc-keyed only: no currency- or city-keyed method. */
export interface CityMacroPort {
  blocInputs(s: StoreRead, bloc: BlocId): BlocMacroInputs | null;   // Isla Serena (bloc null) reads 'FDL'
  fearIndex(s: StoreRead): number | null;                            // F, 0..100
}

/** 09 (E-88 (2b)): staff by cityId and use. */
export interface CityBizPort { jobsByUse(s: StoreRead, cityId: Id): Partial<Record<UseClass, number>> | null }

/** 16 (E-88 (2b)): aggregate frm employment, and household inputs; medianHhIncomePerGY is Money (bigint), never a JS number. */
export interface CityHhPort {
  frmJobsByUse(s: StoreRead, cityId: Id): Partial<Record<UseClass, number>> | null;
  householdInputs(s: StoreRead, cityId: Id): { medianHhIncomePerGY: Money; retailSpendIndex: number; tourismIndex: number } | null;
}

/** 22 (T22A-01 + T22A-02, E-88 (2b)). */
export type CityContentPort = Pick<ContentView, 'cities' | 'serena' | 'sectors' | 'districts' | 'personality' | 'cityProfile'>;

/** The bundle a 10A phase receives (not a port). */
export interface CityPorts { content22: CityContentPort; macro04: CityMacroPort; biz09: CityBizPort; hh16: CityHhPort }
