// Wire filter chips (UI card 1): a single-select radiogroup. Holdings / Follows wait on a server match field.
"use client";
import type { KeyboardEvent } from "react";
import type { WireItem, WireKind } from "@/shell/contracts/channels";
import type { WireFilter, WireStrings } from "./strings";

/** Filter → kinds; `null` = everything. Trades = MARKET, Milestones = RECORD | RANK, World events = WORLD_EVENT. */
export const FILTER_KINDS: Readonly<Record<WireFilter, readonly WireKind[] | null>> = {
  all: null,
  news: ["NEWS"],
  filings: ["FILING"],
  trades: ["MARKET"],
  verdicts: ["VERDICT"],
  purchases: ["PURCHASE"],
  milestones: ["RECORD", "RANK"],
  rumors: ["RUMOR"],
  world: ["WORLD_EVENT"],
  statements: ["STATEMENT"],
};
export const FILTERS = Object.keys(FILTER_KINDS) as WireFilter[];

export function filterItems(items: readonly WireItem[], f: WireFilter): WireItem[] {
  const kinds = FILTER_KINDS[f];
  return kinds === null ? [...items] : items.filter((i) => kinds.includes(i.kind));
}

export function FilterChips({ value, onChange, t }: { value: WireFilter; onChange: (f: WireFilter) => void; t: WireStrings }) {
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = FILTERS.indexOf(value);
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % FILTERS.length
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + FILTERS.length) % FILTERS.length
      : e.key === "Home" ? 0 : e.key === "End" ? FILTERS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(FILTERS[next]!);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-filter="${FILTERS[next]}"]`)?.focus();
  };
  return (
    <div className="wire-filters">
      <div className="wire-chips" role="radiogroup" aria-label={t.filtersLabel} data-testid="wire-filters" onKeyDown={move}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={f === value}
            tabIndex={f === value ? 0 : -1}
            className="wire-chip wire-hit"
            data-filter={f}
            data-testid={`wire-filter-${f}`}
            onClick={() => onChange(f)}
          >
            {t.filter[f]}
          </button>
        ))}
      </div>
    </div>
  );
}
