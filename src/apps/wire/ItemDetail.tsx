// Wire item detail (UI card 9 · WIR-9): kind · Breaking · time, the headline, then only the sections the item
// carries: assets (each with Open in Broker), source record + band, priced in (Terminal), the linked filing. No body,
// cause chain, related items or Follow (spec Gaps 1-3). The pane is a region named by its h2, which takes focus on open.
"use client";
import { useId, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import type { WireItem } from "@/shell/contracts/channels";
import { fill, headline, timeLabel, type WireStrings } from "./strings";
import { KindChip, PricedIn, showsRecord } from "./WireItemRow";
import "./itemDetail.css";

export interface ItemDetailProps {
  item: WireItem;
  t: WireStrings;
  /** The item has left the news ring: the last snapshot is shown with a note (ENGINE-TBD detail fetch by id). */
  gone: boolean;
  /** The news channel is stale: the detail is dimmed; `updating` shows the line here (the feed is hidden). */
  stale: boolean;
  updating: boolean;
  /** "Back to Wire" bar (window narrower than the split); null when the feed is beside the pane or on phone. */
  onBack: (() => void) | null;
  onClose: () => void;
  openAsset: (assetId: string) => void;
  /** Section 6 for a FILING item (App binds it to the filings channel). */
  filing: ReactNode;
  headingRef: Ref<HTMLHeadingElement>;
}

function Section({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <div className="wire-detail-section" data-testid={testId}>
      <h3 className="wire-detail-label">{label}</h3>
      {children}
    </div>
  );
}

export function ItemDetail({ item, t, gone, stale, updating, onBack, onClose, openAsset, filing, headingRef }: ItemDetailProps) {
  const hId = useId();
  const record = showsRecord(item) ? item.sourceRecord! : null;
  const band = record && item.sourceBand ? item.sourceBand : null;
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };
  return (
    <section className="wire-detail" data-testid="wire-detail" data-id={item.id} data-kind={item.kind} data-stale={stale ? "1" : undefined}
      aria-labelledby={hId} onKeyDown={onKey}>
      {onBack && (
        <div className="wire-detail-bar">
          <Button variant="ghost" size="sm" className="wire-back" data-testid="wire-back" onClick={onBack}>{t.backToWire}</Button>
          <span className="wire-detail-bar-title" data-testid="wire-detail-bar-title">{t.kind[item.kind]}</span>
        </div>
      )}
      {updating && <p className="wire-updating" data-testid="wire-detail-updating">{t.updating}</p>}
      <div className="wire-detail-body">
        {gone && <p className="wire-detail-note" data-testid="wire-not-in-feed">{t.notInFeed}</p>}
        <div className="wire-detail-head">
          <KindChip kind={item.kind} t={t} />
          {item.breaking && <Chip tone="steel" outline className="wire-detail-breaking" data-testid="wire-detail-breaking">{t.breaking}</Chip>}
          <time className="wire-detail-time" data-testid="wire-detail-time">{timeLabel(item.tick, t)}</time>
        </div>
        <h2 id={hId} ref={headingRef} tabIndex={-1} className="wire-detail-hl" data-testid="wire-detail-headline">{headline(item, t)}</h2>
        {item.entities.length > 0 && (
          <Section label={t.assets} testId="wire-detail-assets">
            <ul className="wire-assets">
              {item.entities.map((e) => (
                <li key={e.id} className="wire-asset" data-testid="wire-asset" data-id={e.id}>
                  <span className="wire-asset-label">{e.label}</span>
                  {e.kind === "asset" && (
                    <Button variant="secondary" size="sm" className="wire-open-broker" data-testid="wire-open-broker"
                      aria-label={fill(t.openInBrokerAria, { ticker: e.label }) ?? t.openInBroker} onClick={() => openAsset(e.id)}>
                      {t.openInBroker}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {record && (
          <Section label={t.source} testId="wire-detail-source">
            <p className="wire-detail-line">
              <span data-testid="wire-detail-record">{fill(t.recordLine, { hits: String(record.hits), resolved: String(record.resolved) })}</span>
              {band && <Chip className="wire-band" data-testid="wire-detail-band" data-band={band}>{t.band[band]}</Chip>}
            </p>
          </Section>
        )}
        {item.pricedInBand !== undefined && (
          <Section label={t.pricedInTitle} testId="wire-detail-priced">
            <p className="wire-detail-line"><PricedIn item={item} t={t} /></p>
          </Section>
        )}
        {item.kind === "FILING" && item.filingId !== undefined && filing}
      </div>
    </section>
  );
}
