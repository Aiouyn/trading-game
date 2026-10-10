/**
 * Pure helpers of the Company app (no React). The founder view is private, so the market side is built here from the
 * public fields only: `marketOf` keeps exactly the keys of `CompanyPublic`, and the compiler checks that the key table
 * below is complete. The screens never read a private field for the market side.
 */

import type { Ack } from '@/net/client';
import type { CompanyFounderView, CompanyPublic } from '@/world/company/views';

export const VIEWS = ['overview', 'products', 'rd', 'people', 'deals', 'capital', 'filings', 'public'] as const;
export type CompanyViewId = (typeof VIEWS)[number];

export function isCompanyView(x: unknown): x is CompanyViewId {
  return typeof x === 'string' && (VIEWS as readonly string[]).includes(x);
}

/** Every key of CompanyPublic. `satisfies` makes a missing or extra key a compile error. */
const PUBLIC_KEYS = {
  id: true, name: true, sector: true, foundedDay: true, tier: true, listed: true, cities: true, products: true,
  headcountBand: true, debt: true, cashDebt: true, filings: true, registry: true, revenueBand: true, signals: true, credibility: true,
  insiderTrades: true, distressFlag: true, buybackPrograms: true, plans: true, planSkips: true, window: true,
} satisfies Record<keyof CompanyPublic, true>;

/** The market side of a company: exactly what another player may see (CompanyPublic), nothing else. */
export function marketOf(view: CompanyFounderView): CompanyPublic {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(PUBLIC_KEYS) as (keyof CompanyPublic)[]) {
    if (k in view) out[k] = view[k];
  }
  return out as unknown as CompanyPublic;
}

/** A command's refusal as the screens show it: the code and the reject's own numbers (the copy keys are built from it). */
export interface Refusal {
  code: string;
  [key: string]: string | number | undefined;
}

/** The refusal of an ack, or null when the command went through. */
export function refusalOf(ack: Ack): Refusal | null {
  if (ack.ok) return null;
  const out: Refusal = { code: ack.error ?? 'unknownAction' };
  if (ack.data && typeof ack.data === 'object') {
    for (const [k, v] of Object.entries(ack.data as Record<string, unknown>)) {
      if (k === 'code' && typeof v === 'string') out.code = v;
      else if (typeof v === 'number' || typeof v === 'string') out[k] = v;
    }
  }
  return out;
}

/** Whole-number percent for a rate as a fraction (0.05 to 5). The reject copy uses percentages. */
export function percentOf(fraction: number): number {
  return Math.round(fraction * 100);
}

/** The values a numeric form field holds, parsed. Empty or non-finite input is null (the form is then not sent). */
export function numberOrNull(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
