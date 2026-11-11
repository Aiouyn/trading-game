// One Wire row (UI card 1): kind chip · headline · entity labels · game time; source record and priced-in bands
// only when the item carries them. Bands are words, never a score or a %. Card 9: the headline is the row's open
// button, and its hit area is the whole row (wire.css); entity labels stay plain text. `wire-headline` stays on the
// headline text itself (a span whose first child is the text node), as card 1's layout and line-break checks read it.
"use client";
import type { Ref } from "react";
import { Chip } from "@/components/ui/Chip";
import type { WireItem } from "@/shell/contracts/channels";
import { fill, headline, pctLabel, timeLabel, type WireStrings } from "./strings";
import { KindChip } from "./KindChip";

/** Re-exported for the detail and existing imports; Broker imports ./KindChip alone, so the row stays out of its route. */
export { KindChip };


/** Source record shows for RUMOR, STATEMENT, and outlet NEWS when the item carries one. */
export const showsRecord = (i: WireItem) => (i.kind === "RUMOR" || i.kind === "STATEMENT" || i.kind === "NEWS") && i.sourceRecord !== undefined;

/** t0 history rows (`w-h-*`): already on the feed, not a move this clock applied. */
export const isHistoryItem = (i: WireItem): boolean => i.id.startsWith("w-h-");

export function HistoryLabel({ item, t }: { item: WireItem; t: WireStrings }) {
  if (!isHistoryItem(item)) return null;
  return <Chip tone="neutral" outline className="wire-earlier" data-testid="wire-earlier">{t.earlier}</Chip>;
}

/** M1-09: a server story's outcome on the row when it moved nothing: Forecast / No effect (a realized effect sits
 *  beside its asset label, see EntityLabel). */
export function StoryOutcome({ item, t }: { item: WireItem; t: WireStrings }) {
  if (item.phase === "forecast") return <Chip tone="neutral" outline className="wire-outcome" data-testid="wire-forecast">{t.forecast}</Chip>;
  if (item.phase === "eased") return <Chip tone="neutral" outline className="wire-outcome" data-testid="wire-no-effect">{t.eased}</Chip>;
  return null;
}

/** An entity label; with the realized effect on that asset beside it ("ORCA −4.48%"). */
function EntityLabel({ item, e }: { item: WireItem; e: WireItem["entities"][number] }) {
  const fx = item.effects?.find((x) => x.assetId === e.id);
  return (
    <span className="wire-entity" data-testid="wire-entity">
      {e.label}
      {fx && <span className="wire-effect" data-testid="wire-effect" data-asset={fx.assetId} data-pct={fx.pct}> {pctLabel(fx.pct)}</span>}
    </span>
  );
}

/** Priced-in band chip + "as of {time}" (Terminal tier; the row and the detail share it). */
export function PricedIn({ item, t }: { item: WireItem; t: WireStrings }) {
  const priced = item.pricedInBand;
  if (priced === undefined) return null;
  return (
    <span className="wire-priced" data-testid="wire-priced">
      <Chip className="wire-priced-chip" data-testid="wire-priced-band" aria-label={`${t.pricedInLabel}: ${t.pricedIn[priced]}`}>{t.pricedIn[priced]}</Chip>
      {item.pricedInAsOf !== undefined && (
        <span className="wire-asof" data-testid="wire-asof">{fill(t.asOf, { time: timeLabel(item.pricedInAsOf, t) })}</span>
      )}
    </span>
  );
}

interface RowProps {
  item: WireItem;
  t: WireStrings;
  fresh: boolean;
  selected?: boolean;
  onOpen?: (id: string) => void;
  /** The open button, for focus return when the detail closes. */
  buttonRef?: Ref<HTMLButtonElement>;
}

export function WireItemRow({ item, t, fresh, selected = false, onOpen, buttonRef }: RowProps) {
  const record = showsRecord(item) ? item.sourceRecord! : null;
  const band = record && item.sourceBand ? item.sourceBand : null;
  const text = headline(item, t);
  const cls = ["wire-row", fresh && "is-new", selected && "is-selected"].filter(Boolean).join(" ");
  return (
    <li className={cls} data-testid="wire-row" data-id={item.id} data-kind={item.kind} aria-current={selected || undefined}>
      <span className="wire-row-kind"><KindChip kind={item.kind} t={t} /></span>
      <p className="wire-row-hl">
        <button ref={buttonRef} type="button" className="wire-row-open" data-testid="wire-open" aria-label={fill(t.openItem, { headline: text }) ?? text}
          onClick={() => onOpen?.(item.id)}><span data-testid="wire-headline">{text}</span></button>
      </p>
      <time className="wire-row-time" data-testid="wire-time">{timeLabel(item.tick, t)}</time>
      <div className="wire-row-meta">
        {item.entities.map((e) => <EntityLabel key={e.id} item={item} e={e} />)}
        {record && (
          <span className="wire-record" data-testid="wire-record">
            {fill(t.sourceRecord, { hits: String(record.hits), resolved: String(record.resolved) })}
          </span>
        )}
        {band && <Chip className="wire-band" data-testid="wire-band" data-band={band}>{t.band[band]}</Chip>}
        <PricedIn item={item} t={t} />
        <HistoryLabel item={item} t={t} />
        <StoryOutcome item={item} t={t} />
      </div>
    </li>
  );
}
