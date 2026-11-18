// The read side of the edge (orders 99 to 104): what /view now carries for the player's readings, the street's
// number, past prints, credit and stakes. Words only; the numbers come from the sim as cents or fractions.
import type { SimView } from "@/shell/simSession";

export type SignalKind = "work" | "contact" | "street";
export interface SignalRow {
  id: number; text: string; kind: SignalKind | string; clarity: number; clearWord: string;
  legal: "fair" | "inside" | string; legalLine: string; firm: string; issuer: string; day: number; age: number;
  outcome: "open" | "right" | "wrong" | string; eventId: number;
}
export interface ConsensusRow {
  issuer: string; firm: string; profit: number; high: number; low: number; analysts: number; lagDays: number;
  hopeful: string; due: boolean; printInDays: number; employer: boolean; actual: number | null; surprise: number | null; eventId: number;
}
export interface RevealRow {
  issuer: string; firm: string; day: number; consensus: number; actual: number; surprise: number; px: number; pxAfter: number;
  signals: number; right: number; story: string; storyRight: boolean; mine: { text: string; outcome: string }[]; eventId: number;
}
export interface CreditProduct { product: string; owed: number; rate: number; loans: number; open: boolean; note: string; haircut?: number }
export interface CreditView { tightness: number; word: string; limit: number; owed: number; room: number; products: CreditProduct[] }
export interface StakeChoice { op: string; text: string; day: number; eventId: number }
export interface StakeRemember { name: string; role: string; what: string; warm: boolean; acted: boolean; eventId: number }
export interface StakeView {
  firm: string; name: string; shares: number; issued: number; percent: number; value: number; controls: boolean; chair: boolean;
  how: string; choices: StakeChoice[]; remembers: StakeRemember[]; city: string[];
  /** Market value, when /view names it beside the sale value (order 106). Otherwise `value` is the market value. */
  marketValue?: number;
  /** What selling the stake into the bids would fetch, in cents, when /view sends it. */
  saleValue?: number;
  /** The sim's one-line reason for the gap between the two, when it sends one. */
  saleWhy?: string;
}

export interface EdgeView {
  signals?: SignalRow[];
  consensus?: ConsensusRow[];
  reveals?: RevealRow[];
  credit?: CreditView;
  stake?: StakeView[];
}

/** The edge fields of the current view, with empty defaults so a screen reads them without checks. */
export function edgeOf(view: SimView | null): Required<Omit<EdgeView, "credit">> & { credit: CreditView | null } {
  const v = view as (SimView & EdgeView) | null;
  return {
    signals: v?.signals ?? [],
    consensus: v?.consensus ?? [],
    reveals: v?.reveals ?? [],
    stake: v?.stake ?? [],
    credit: v?.credit ?? null,
  };
}

export function kindWord(kind: string): string {
  if (kind === "work") return "Your own job";
  if (kind === "contact") return "A contact at the firm";
  if (kind === "street") return "The street";
  return "A reading";
}

export function legalWord(legal: string): string {
  return legal === "inside" ? "Inside information" : "Fair game";
}

export function outcomeWord(outcome: string): string {
  if (outcome === "right") return "Pointed the right way";
  if (outcome === "wrong") return "Pointed the wrong way";
  return "Not settled until the print";
}

export function ageWord(age: number): string {
  if (age <= 0) return "today";
  return age === 1 ? "1 day ago" : `${age} days ago`;
}

/** Credit tightness in plain words, from the sim's own word (easy, steady, tight, shut). */
export function creditSentence(word: string): string {
  if (word === "easy") return "Lenders are lending freely.";
  if (word === "steady") return "Lenders are steady, and writing lines as usual.";
  if (word === "tight") return "Lenders are pulling back: credit lines may not roll.";
  return "Lenders are barely lending against shares.";
}

/**
 * The haircut a lender takes off what the shares would fetch, as a fraction. The server's per-product haircut wins when
 * /view carries it (a fraction, or a percent if it is above one). Otherwise this mirrors lendHaircut and TERM_HAIRCUT in
 * sim/modules/banking/index.ts, so the screen still reads before the server sends it.
 */
export function haircutOf(product: string, tightness: number, server?: number): number {
  if (typeof server === "number" && Number.isFinite(server) && server >= 0) return server > 1 ? server / 100 : server;
  return product === "term" ? 0.55 + 0.2 * tightness : 0.5 + 0.25 * tightness;
}

/** The sale-versus-market reason in one line, from the two cents amounts (the sim's own line wins when it sends one). */
export function saleReason(market: number, sale: number, why?: string): string {
  if (why && why.trim()) return why.trim();
  if (market <= 0) return "Nothing is priced for this stake yet.";
  const gap = (sale - market) / market;
  if (gap < -0.02) return "The bids for a block this size are thin, so a sale would take a discount to the market price.";
  if (gap > 0.02) return "The bids are above the market price for this stake, so a sale would fetch more than it is marked at.";
  return "The bids cover the block at about the market price.";
}

/** A percentage with its sign, for a fraction (0.035 is +3.5%). */
export function signedFraction(f: number, digits = 1): string {
  const n = Math.abs(f * 100).toFixed(digits);
  if (f > 0.0005) return `+${n}%`;
  if (f < -0.0005) return `−${n}%`;
  return `${n}%`;
}
