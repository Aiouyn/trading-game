// One Wire row (UI card 1): kind chip · headline · entity labels · game time; source record and priced-in bands
// only when the item carries them. Bands are words, never a score or a %.
"use client";
import { Glyph } from "@/components/shell/Glyph";
import { Chip } from "@/components/ui/Chip";
import type { WireItem, WireKind } from "@/shell/contracts/channels";
import { fill, headline, timeLabel, type WireStrings } from "./strings";


/** Source record shows for RUMOR, and for STATEMENT when it carries one. */
const showsRecord = (i: WireItem) => (i.kind === "RUMOR" || i.kind === "STATEMENT") && i.sourceRecord !== undefined;

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

export function WireItemRow({ item, t, fresh }: { item: WireItem; t: WireStrings; fresh: boolean }) {
  const record = showsRecord(item) ? item.sourceRecord! : null;
  const band = record && item.sourceBand ? item.sourceBand : null;
  const priced = item.pricedInBand ?? null;
  return (
    <li className={fresh ? "wire-row is-new" : "wire-row"} data-testid="wire-row" data-id={item.id} data-kind={item.kind}>
      <span className="wire-row-kind"><KindChip kind={item.kind} t={t} /></span>
      <p className="wire-row-hl" data-testid="wire-headline">{headline(item, t)}</p>
      <time className="wire-row-time" data-testid="wire-time">{timeLabel(item.tick, t)}</time>
      <div className="wire-row-meta">
        {item.entities.map((e) => <span key={e.id} className="wire-entity" data-testid="wire-entity">{e.label}</span>)}
        {record && (
          <span className="wire-record" data-testid="wire-record">
            {fill(t.sourceRecord, { hits: String(record.hits), resolved: String(record.resolved) })}
          </span>
        )}
        {band && <Chip className="wire-band" data-testid="wire-band" data-band={band}>{t.band[band]}</Chip>}
        {priced && (
          <span className="wire-priced" data-testid="wire-priced">
            <Chip className="wire-priced-chip" data-testid="wire-priced-band" aria-label={`${t.pricedInLabel}: ${t.pricedIn[priced]}`}>{t.pricedIn[priced]}</Chip>
            {item.pricedInAsOf !== undefined && (
              <span className="wire-asof" data-testid="wire-asof">{fill(t.asOf, { time: timeLabel(item.pricedInAsOf, t) })}</span>
            )}
          </span>
        )}
      </div>
    </li>
  );
}
