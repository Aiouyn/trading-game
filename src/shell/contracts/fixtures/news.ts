// 17B CH-00 seeded Wire items (15 §2.9 WireItem projection, Q5/Q7). Headline keys and slots are demo data; the client
// renders them through strings when the Wire card lands. Never a 0–1 credibility (Q5).
import type { Filing, WireItem } from "../channels";

// Seeded stamps sit at or before the mock clock (START_TICK = Day 38 · 11:20, the top bar at boot); n-4 is "now".
export const NEWS: readonly WireItem[] = [
  { id: "n-1", kind: "NEWS", headlineKey: "wire.news.earningsBeat", slots: { company: "Halcyon Shipping" }, entities: [{ id: "HALC", kind: "asset", label: "HALC" }], tick: 27_680, breaking: false, causeEventIds: ["ev-101"] },
  { id: "n-2", kind: "RUMOR", headlineKey: "wire.rumor.takeover", slots: { company: "Orca Biologics" }, entities: [{ id: "ORCA", kind: "asset", label: "ORCA" }], tick: 27_690, breaking: false, causeEventIds: ["ev-102"], sourceRecord: { hits: 3, resolved: 7 }, sourceBand: "mixed" },
  { id: "n-3", kind: "FILING", headlineKey: "wire.filing.ownership5", slots: { filer: "Northwind Capital", company: "Avalon Bank" }, entities: [{ id: "AVB", kind: "asset", label: "AVB" }], tick: 27_695, breaking: false, causeEventIds: ["ev-103"], filingId: "f-1" },
  { id: "n-4", kind: "MARKET", headlineKey: "wire.market.blockTrade", slots: { qty: "50000", asset: "KILN" }, entities: [{ id: "KILN", kind: "asset", label: "KILN" }], tick: 27_700, breaking: true, causeEventIds: ["ev-104"] },
];

/** Headlines the mock rotates in, one every NEWS_EVERY ticks (ring). */
export const NEWS_ROTATION: readonly Omit<WireItem, "id" | "tick">[] = [
  { kind: "NEWS", headlineKey: "wire.news.guidanceRaised", slots: { company: "Voltaic Grid" }, entities: [{ id: "VOLT", kind: "asset", label: "VOLT" }], breaking: false, causeEventIds: ["ev-201"] },
  { kind: "STATEMENT", headlineKey: "wire.statement.ceo", slots: { company: "Meridian Foods" }, entities: [{ id: "MRDN", kind: "asset", label: "MRDN" }], breaking: false, causeEventIds: ["ev-202"], sourceRecord: { hits: 9, resolved: 10 }, sourceBand: "solid" },
  { kind: "RUMOR", headlineKey: "wire.rumor.downgrade", slots: { company: "Tidewater REIT" }, entities: [{ id: "TIDE", kind: "asset", label: "TIDE" }], breaking: false, causeEventIds: ["ev-203"], sourceRecord: { hits: 0, resolved: 2 }, sourceBand: "low" },
];
export const NEWS_EVERY = 12;

export const FILINGS: readonly Filing[] = [
  { id: "f-1", type: "ownership_5pct", filer: { id: "p-northwind", label: "Northwind Capital" }, subject: { id: "AVB", label: "Avalon Bank" }, tick: 27_695, fields: { pct: "5.20", qty: "410000" } },
  { id: "f-2", type: "insider", filer: { id: "p-okafor", label: "R. Okafor" }, subject: { id: "HALC", label: "Halcyon Shipping" }, tick: 27_650, fields: { side: "BUY", qty: "12000", price: "41.10" } },
];

export const BOARD_ROWS = [
  { rank: 1, handle: "northwind", country: "AT", nwiBand: "top1", npc: true },
  { rank: 2, handle: "cassia", country: "NO" },
  { rank: 3, handle: "brightwater", country: "PA", npc: true },
] as const;
