// Wire feed (UI card 1 · WIR-A): filters, breaking strip, newest-first list and the channel states.
// While the list is scrolled down new items are held back (rows never move, CLS 0) and counted on a "{n} new" pill;
// tapping it scrolls to the top and lets them in. At the top they insert with a --dur-base fade (0 under reduced motion).
// Card 9 (WIR-9): a row opens its detail. A Wire box >= 720 px shows it beside the feed; narrower it replaces the feed
// (the list stays mounted, hidden, so its scroll position and held-back items survive); on phone it is a pushed screen.
"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import type { NewsBody, WireItem } from "@/shell/contracts/channels";
import { getFeed, type ChannelView } from "@/shell/contracts/useChannel";
import { BreakingStrip } from "./BreakingStrip";
import { FilterChips, filterItems } from "./FilterChips";
import { ItemDetail } from "./ItemDetail";
import { fill, type WireFilter, type WireStrings } from "./strings";
import { WireItemRow } from "./WireItemRow";
import { WireSkeletonList } from "./Skeleton";

/** Newest first by tick; equal ticks keep array order. */
export function orderNewest(items: readonly WireItem[]): WireItem[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => b.item.tick - a.item.tick || a.i - b.i).map((x) => x.item);
}

/** The newest breaking item, if any. */
export const newestBreaking = (items: readonly WireItem[]): WireItem | null => orderNewest(items).find((i) => i.breaking) ?? null;

const NONE: ReadonlySet<string> = new Set();
interface Track { body: NewsBody | null; seen: ReadonlySet<string>; fresh: ReadonlySet<string> }

/** Wire box width at which the detail sits beside the feed (spec: >= 720 px; the feed keeps >= 360). */
export const SPLIT_MIN = 720;

export interface PhoneSub { title: string; backLabel: string; onBack: () => void }
/** What the feed needs from the shell (App.tsx binds it to the store and the filings channel; tests pass fakes). */
export interface WireHost {
  phone: boolean;
  openAsset(assetId: string): void;
  /** Section 6 for an open FILING item; App mounts the filings channel only inside it. */
  filing(filingId: string): ReactNode;
  pushPhone(sub: PhoneSub | null): void;
}
const NO_HOST: WireHost = { phone: false, openAsset: () => undefined, filing: () => null, pushPhone: () => undefined };

/** True while the Wire box is at least SPLIT_MIN wide (never on phone). */
function useSplit(ref: RefObject<HTMLElement | null>, phone: boolean): boolean {
  const [split, setSplit] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (phone || !el) { setSplit(false); return; }
    const check = () => setSplit(el.clientWidth >= SPLIT_MIN);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, phone]);
  return split;
}

interface Open { id: string; last: WireItem }

/** `select`: a story id to open (UI card 10). Each new value opens that item once the feed has it; an id that is not
 * in the ring shows the feed with nothing selected. */
export function Feed({ view, t, host = NO_HOST, select }: { view: ChannelView<NewsBody>; t: WireStrings; host?: WireHost; select?: string }) {
  const [filter, setFilter] = useState<WireFilter>("all");
  const [scrolled, setScrolled] = useState(false);
  const [track, setTrack] = useState<Track>({ body: null, seen: NONE, fresh: NONE });
  const [open, setOpen] = useState<Open | null>(null);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const savedTop = useRef(0);
  /** The open id at the last commit: closing returns focus to that row's button. */
  const prevOpen = useRef<string | null>(null);
  const split = useSplit(root, host.phone);

  const body = view.body;
  // Derived during render: a new `select` is applied once there is a body to look it up in.
  if (body && select !== selected) {
    setSelected(select);
    if (select !== undefined) {
      const it = body.items.find((i) => i.id === select);
      setOpen(it ? { id: select, last: it } : null);
    }
  }
  // The open item as the feed has it now; once it leaves the ring the last snapshot stays (WIR-9-08).
  const current = open && body ? body.items.find((i) => i.id === open.id) ?? null : null;
  if (open && current && current !== open.last) setOpen({ id: open.id, last: current });
  const pending = body ? body.items.filter((i) => !track.seen.has(i.id)) : [];
  // Derived during render (React "adjust state on prop change"): the first body and, at the top, every new item
  // become visible; scrolled down, the visible set is frozen.
  if (body && track.body === null) setTrack({ body, seen: new Set(body.items.map((i) => i.id)), fresh: NONE });
  else if (body && !scrolled && (body !== track.body || pending.length > 0)) {
    setTrack({ body, seen: new Set(body.items.map((i) => i.id)), fresh: new Set(pending.map((i) => i.id)) });
  } else if (body && body !== track.body) setTrack({ ...track, body });

  const close = useCallback(() => setOpen(null), []);
  const item = open?.last ?? null;
  const replaced = item !== null && !split;
  const { pushPhone, phone } = host;
  const phoneTitle = item && phone ? t.kind[item.kind] : null;
  // Phone: the open detail is a pushed screen (shell app bar Back = close); cleared on close and on unmount.
  useEffect(() => {
    if (phoneTitle === null) return;
    pushPhone({ title: phoneTitle, backLabel: t.backToWire, onBack: close });
    return () => pushPhone(null);
  }, [pushPhone, phoneTitle, t.backToWire, close]);
  const openId = open?.id ?? null;
  useEffect(() => { if (openId !== null) heading.current?.focus(); }, [openId]);
  // Back from a replaced detail: the list shows again where it was, then the row's button takes focus.
  useLayoutEffect(() => {
    const id = prevOpen.current;
    prevOpen.current = openId;
    if (replaced) return;
    if (list.current && list.current.scrollTop !== savedTop.current) list.current.scrollTop = savedTop.current;
    if (id === null || openId !== null) return;
    const btn = list.current?.querySelector<HTMLElement>(`[data-testid="wire-row"][data-id="${CSS.escape(id)}"] [data-testid="wire-open"]`);
    (btn ?? list.current)?.focus();
  }, [replaced, openId]);

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
    savedTop.current = 0;
    setScrolled(false);
  };
  const onOpen = (id: string) => {
    const it = visible.find((i) => i.id === id);
    if (it) setOpen({ id, last: it });
  };

  return (
    <div ref={root} className="wire" data-testid="wire" data-state={view.state} data-layout={split ? "split" : "single"} data-open={item ? item.id : undefined}>
      <div className="wire-feed" data-testid="wire-feed" hidden={replaced}>
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
          <WireSkeletonList label={t.loading} />
        ) : rows.length === 0 ? (
          <p className="wire-state" data-testid="wire-empty">{t.empty}</p>
        ) : (
          <ul className="wire-list" data-testid="wire-list" tabIndex={0} aria-label={t.listLabel} ref={list}
            onScroll={(e) => { if (!replaced) savedTop.current = e.currentTarget.scrollTop; setScrolled(e.currentTarget.scrollTop > 0); }}>
            {rows.map((r) => <WireItemRow key={r.id} item={r} t={t} fresh={track.fresh.has(r.id)} selected={r.id === item?.id} onOpen={onOpen} />)}
          </ul>
        )}
      </div>
      </div>
      {item ? (
        <div className="wire-pane" data-testid="wire-pane">
          <ItemDetail item={item} t={t} gone={body !== null && current === null} stale={view.state === "stale"} updating={replaced && view.state === "stale"}
            onBack={replaced && !phone ? close : null} onClose={close} openAsset={host.openAsset}
            filing={item.kind === "FILING" && item.filingId !== undefined ? host.filing(item.filingId) : null} headingRef={heading} />
        </div>
      ) : split ? (
        <div className="wire-pane" data-testid="wire-pane">
          <p className="wire-no-selection" data-testid="wire-no-selection">{t.noSelection}</p>
        </div>
      ) : null}
    </div>
  );
}
