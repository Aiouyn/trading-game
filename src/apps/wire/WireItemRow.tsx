// One Wire row (UI card 1): kind chip · headline · entity labels · game time; source record and priced-in bands
// only when the item carries them. Bands are words, never a score or a %. Card 9: the headline is the row's open
// button, and its hit area is the whole row (wire.css); entity labels stay plain text. `wire-headline` stays on the
// headline text itself (a span whose first child is the text node), as card 1's layout and line-break checks read it.
"use client";
import type { Ref } from "react";
import { Glyph } from "@/components/shell/Glyph";
import { Chip } from "@/components/ui/Chip";
import type { WireItem, WireKind } from "@/shell/contracts/channels";
import { fill, headline, timeLabel, type WireStrings } from "./strings";


/** Source record shows for RUMOR, and for STATEMENT when it carries one. */
export const showsRecord = (i: WireItem) => (i.kind === "RUMOR" || i.kind === "STATEMENT") && i.sourceRecord !== undefined;

/** Every kind chip is neutral (--line outline, --fg-muted text; Studio: brass is only wealth, rank and the primary
 *  action). RUMOR alone is dashed (wire.css). Never a tone, never --acc or --signal. */
export function KindChip({ kind, t }: { kind: WireKind; t: WireStrings }) {
  return (
    <Chip tone="neutral" className={`wire-kind wire-kind-${kind.toLowerCase()}`} data-testid="wire-kind" data-kind={kind}>
      {kind === "WORLD_EVENT" && <Glyph name="world" size={12} />}
      {t.kind[kind]}
    </Chip>
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
        {item.entities.map((e) => <span key={e.id} className="wire-entity" data-testid="wire-entity">{e.label}</span>)}
        {record && (
          <span className="wire-record" data-testid="wire-record">
            {fill(t.sourceRecord, { hits: String(record.hits), resolved: String(record.resolved) })}
          </span>
        )}
        {band && <Chip className="wire-band" data-testid="wire-band" data-band={band}>{t.band[band]}</Chip>}
        <PricedIn item={item} t={t} />
      </div>
    </li>
  );
}
