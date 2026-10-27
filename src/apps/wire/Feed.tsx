// Wire feed (UI card 1 · WIR-A): filters, breaking strip, newest-first list and the channel states.
// While the list is scrolled down new items are held back (rows never move, CLS 0) and counted on a "{n} new" pill;
// tapping it scrolls to the top and lets them in. At the top they insert with a --dur-base fade (0 under reduced motion).
"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { NewsBody, WireItem } from "@/shell/contracts/channels";
import { getFeed, type ChannelView } from "@/shell/contracts/useChannel";
import { BreakingStrip } from "./BreakingStrip";
import { FilterChips, filterItems } from "./FilterChips";
import { fill, type WireFilter, type WireStrings } from "./strings";
import { WireItemRow } from "./WireItemRow";

/** Newest first by tick; equal ticks keep array order. */
export function orderNewest(items: readonly WireItem[]): WireItem[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => b.item.tick - a.item.tick || a.i - b.i).map((x) => x.item);
}

/** The newest breaking item, if any. */
export const newestBreaking = (items: readonly WireItem[]): WireItem | null => orderNewest(items).find((i) => i.breaking) ?? null;

const NONE: ReadonlySet<string> = new Set();
interface Track { body: NewsBody | null; seen: ReadonlySet<string>; fresh: ReadonlySet<string> }

export function Feed({ view, t }: { view: ChannelView<NewsBody>; t: WireStrings }) {
  const [filter, setFilter] = useState<WireFilter>("all");
  const [scrolled, setScrolled] = useState(false);
  const [track, setTrack] = useState<Track>({ body: null, seen: NONE, fresh: NONE });
  const list = useRef<HTMLUListElement>(null);

  const body = view.body;
  const pending = body ? body.items.filter((i) => !track.seen.has(i.id)) : [];
  // Derived during render (React "adjust state on prop change"): the first body and, at the top, every new item
  // become visible; scrolled down, the visible set is frozen.
  if (body && track.body === null) setTrack({ body, seen: new Set(body.items.map((i) => i.id)), fresh: NONE });
  else if (body && !scrolled && (body !== track.body || pending.length > 0)) {
    setTrack({ body, seen: new Set(body.items.map((i) => i.id)), fresh: new Set(pending.map((i) => i.id)) });
  } else if (body && body !== track.body) setTrack({ ...track, body });

  if (view.state === "denied") return <div className="wire"><p className="wire-state" data-testid="wire-denied">{t.denied}</p></div>;
  if (view.state === "error") {
    return (
      <div className="wire">
        <p className="wire-state" data-testid="wire-error">
          <span role="alert">{t.couldntLoad}</span>
          <span aria-hidden="true">{" · "}</span>
          <Button variant="secondary" size="sm" data-testid="wire-retry" onClick={() => getFeed().resync("news")}>{t.retry}</Button>
        </p>
      </div>
    );
  }

  const visible = body ? body.items.filter((i) => track.seen.has(i.id)) : [];
  const rows = orderNewest(filterItems(visible, filter));
  const waiting = filterItems(pending, filter).length;
  const breaking = newestBreaking(visible);
  const toTop = () => {
    if (list.current) list.current.scrollTop = 0;
    setScrolled(false);
  };

  return (
    <div className="wire" data-testid="wire" data-state={view.state}>
      {breaking && <BreakingStrip item={breaking} t={t} />}
      <FilterChips value={filter} onChange={setFilter} t={t} />
      {view.state === "stale" && <p className="wire-updating" data-testid="wire-updating">{t.updating}</p>}
      <div className="wire-body">
        <div className="wire-pill-slot" aria-live="polite">
          {scrolled && waiting > 0 && (
            <Button variant="secondary" size="sm" className="wire-pill wire-hit" data-testid="wire-new-pill" onClick={toTop}>
              {fill(t.newItems, { n: String(waiting) })}
            </Button>
          )}
        </div>
        {view.state === "loading" ? (
          <ul className="wire-list" aria-busy="true" data-testid="wire-loading">
            <li className="sr-only">{t.loading}</li>
            {[0, 1, 2].map((k) => <li key={k} className="wire-skel" aria-hidden="true" data-testid="wire-skeleton" />)}
          </ul>
        ) : rows.length === 0 ? (
          <p className="wire-state" data-testid="wire-empty">{t.empty}</p>
        ) : (
          <ul className="wire-list" data-testid="wire-list" tabIndex={0} aria-label={t.listLabel} ref={list} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
            {rows.map((item) => <WireItemRow key={item.id} item={item} t={t} fresh={track.fresh.has(item.id)} />)}
          </ul>
        )}
      </div>
    </div>
  );
}
