// Wire detail section 6 (UI card 9 · WIR-9-06): the filing an item links to, from the `filings` channel body by id.
// Labels come from copy; field values are server strings shown as sent or regrouped by decText (no maths, no parse).
"use client";
import { Button } from "@/components/ui/Button";
import { decText } from "@/apps/portfolio/positions/format";
import type { Filing, FilingsBody } from "@/shell/contracts/channels";
import { getFeed, type ChannelView } from "@/shell/contracts/useChannel";
import { fill, timeLabel, type FilingField, type WireStrings } from "./strings";

const KNOWN: ReadonlySet<string> = new Set<FilingField>(["pct", "qty", "price", "side"]);
const isKnown = (k: string): k is FilingField => KNOWN.has(k);
const isSide = (v: string, t: WireStrings): v is keyof WireStrings["side"] => Object.hasOwn(t.side, v);

/** One `fields` value for display. pct / qty / price: decText (locale grouping and decimal sign only); side: the
 *  Broker's arrow labels; an unknown side value is shown as sent. */
export function fieldValue(key: FilingField, value: string, t: WireStrings): string {
  if (key === "side") return isSide(value, t) ? t.side[value] : value;
  const text = decText(value, t.locale);
  return key === "pct" ? fill(t.pctValue, { v: text })! : text;
}

function FilingBody({ filing, t }: { filing: Filing; t: WireStrings }) {
  return (
    <>
      <p className="wire-filing-type" data-testid="wire-filing-type">{t.filingType[filing.type]}</p>
      <dl className="wire-filing-fields">
        <div className="wire-field" data-testid="wire-filing-filer"><dt>{t.filedBy}</dt><dd>{filing.filer.label}</dd></div>
        <div className="wire-field" data-testid="wire-filing-subject"><dt>{t.subject}</dt><dd>{filing.subject.label}</dd></div>
        {Object.entries(filing.fields).map(([k, v]) => (
          <div key={k} className="wire-field" data-testid="wire-filing-field" data-key={k}>
            {isKnown(k) ? <><dt>{t.field[k]}</dt><dd className="num">{fieldValue(k, v, t)}</dd></> : <><dt>{k}</dt><dd>{v}</dd></>}
          </div>
        ))}
      </dl>
      <time className="wire-filing-time" data-testid="wire-filing-time">{timeLabel(filing.tick, t)}</time>
    </>
  );
}

export function FilingSummary({ view, filingId, t }: { view: ChannelView<FilingsBody>; filingId: string; t: WireStrings }) {
  const filing = view.body?.items.find((f) => f.id === filingId) ?? null;
  return (
    <div className="wire-detail-section wire-filing" data-testid="wire-filing" data-state={view.state} aria-busy={view.state === "loading" || undefined}>
      <h3 className="wire-detail-label">{t.filing}</h3>
      {view.state === "loading" ? (
        <div className="wire-filing-skel" data-testid="wire-filing-skel" />
      ) : view.state === "error" || view.state === "denied" ? (
        <p className="wire-filing-error" data-testid="wire-filing-error">
          <span role="alert">{t.couldntLoad}</span>
          <Button variant="secondary" size="sm" data-testid="wire-filing-retry" onClick={() => getFeed().resync("filings")}>{t.retry}</Button>
        </p>
      ) : filing === null ? (
        <p className="wire-filing-missing" data-testid="wire-filing-missing">{t.filingMissing}</p>
      ) : (
        <FilingBody filing={filing} t={t} />
      )}
    </div>
  );
}
