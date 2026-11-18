"use client";
// Research: one listed firm on one screen. Its price, the street's number, your private readings of its coming quarter,
// and how past prints went against them. Inside information is marked, and an order on that firm asks first.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sparkline } from "@/components/shell/Sparkline";
import { useShellStore } from "@/components/shell/ShellContext";
import { useSimSnap, type Quote } from "@/shell/simSession";
import { presentNote } from "@/components/ui/format";
import { Because, Field, Fig, moneyTitle, titleCase, usePhone, useWhy } from "@/apps/businesses/sheet";
import "@/apps/businesses/sheet.css";
import { ageWord, edgeOf, kindWord, legalWord, outcomeWord, signedFraction, type RevealRow, type SignalRow } from "./edge";
import "./research.css";

/** Markets and other apps open a firm as "eq:frm_x"; the research key is the bare issuer id. */
function keyOf(context?: string): string {
  return context ? context.replace(/^eq:/, "") : "";
}

/** The sim's word for the street's tilt, as a sentence. */
function hopefulSentence(word: string): string {
  if (word === "runs hopeful") return "The street is hoping for more than the books show.";
  if (word === "runs cautious") return "The street is expecting less than it used to.";
  return "The street's number looks about right.";
}

function moveWord(chg: number): string {
  if (chg > 0.001) return "Up on the day";
  if (chg < -0.001) return "Down on the day";
  return "Flat on the day";
}

export default function ResearchApp({ context }: { context?: string }) {
  const phone = usePhone();
  const { view } = useSimSnap();
  const store = useShellStore();
  const why = useWhy();
  const edge = edgeOf(view);
  const listed = useMemo(
    () => [...(view?.quotes ?? [])].sort((a, b) => (a.name || a.symbol || a.instr).localeCompare(b.name || b.symbol || b.instr)),
    [view?.quotes],
  );
  const [picked, setPicked] = useState(keyOf(context));
  const [warnFor, setWarnFor] = useState("");
  useEffect(() => { if (context) setPicked(keyOf(context)); }, [context]);

  const key = picked || listed[0]?.issuer || "";
  const quote: Quote | undefined = listed.find((q) => q.issuer === key);
  if (!view) return <div className="rs" data-testid="research"><p className="qa-muted">The desk is not open.</p></div>;
  if (!listed.length) return <div className="rs" data-testid="research"><p className="qa-empty">Nothing is listed yet, so there is nothing to research.</p></div>;

  const cons = edge.consensus.find((c) => c.issuer === key);
  const sigs = edge.signals.filter((s) => s.issuer === key);
  const reveals = edge.reveals.filter((r) => r.issuer === key);
  const insideOpen = sigs.filter((s) => s.legal === "inside" && s.outcome === "open");
  const name = quote?.name || quote?.symbol || key;
  const symbol = quote?.symbol || key.replace(/^frm_/, "").toUpperCase();
  const go = () => {
    setWarnFor("");
    store.getState().open("markets", `eq:${key}`);
  };

  return (
    <div className="rs" data-testid="research" data-phone={phone ? "1" : "0"}>
      <Field label="Firm">
        <select className="qa-select" value={key} onChange={(e) => { setPicked(e.target.value); setWarnFor(""); }} data-testid="research-firm">
          {listed.map((q) => <option key={q.issuer} value={q.issuer}>{q.name || q.symbol}</option>)}
        </select>
      </Field>

      <div className="rs-head">
        <h2 className="qa-title">{name}</h2>
        <span className="qa-muted">{symbol}{quote?.sector ? ` · ${titleCase(quote.sector)}` : ""}</span>
      </div>
      {quote ? (
        <div className="qa-kv" data-testid="research-price">
          <p>
            <span className="label">Price</span>
            <Fig word={moveWord(quote.chg)} title={moneyTitle(quote.px)} eventId={quote.eventId} onWhy={why.open} />
          </p>
          <p>
            <span className="label">Yours</span>
            <span className="qa-muted">{(quote.pos ?? 0) > 0 ? `${(quote.pos ?? 0).toLocaleString("en-US")} shares held` : (quote.pos ?? 0) < 0 ? `Short ${Math.abs(quote.pos ?? 0).toLocaleString("en-US")} shares` : "None held"}</span>
          </p>
          <Sparkline points={quote.spark} />
        </div>
      ) : <p className="qa-muted">{name} is not listed, so there is no price.</p>}

      <div className="qa-block" data-testid="research-street">
        <h2 className="qa-title">The street&apos;s number</h2>
        {cons && cons.due ? (
          <>
            <p>
              <Fig word={`Expected profit, prints in ${cons.printInDays} day${cons.printInDays === 1 ? "" : "s"}`} title={moneyTitle(cons.profit)} eventId={cons.eventId >= 0 ? cons.eventId : undefined} onWhy={why.open} />
            </p>
            <p className="qa-muted">
              {cons.analysts} analysts, between {moneyTitle(cons.low)} and {moneyTitle(cons.high)}. Their books are {cons.lagDays} days old. {hopefulSentence(cons.hopeful)}
            </p>
          </>
        ) : cons && cons.actual !== null ? (
          <>
            <p>
              <Fig word="Last printed" title={moneyTitle(cons.actual)} eventId={cons.eventId >= 0 ? cons.eventId : undefined} onWhy={why.open} />
            </p>
            <p className="qa-muted">
              The street had {moneyTitle(cons.profit)}. The print came {cons.surprise !== null && cons.surprise > 0.008 ? "in above it" : cons.surprise !== null && cons.surprise < -0.008 ? "below it" : "about where it was expected"}.
            </p>
          </>
        ) : (
          <p className="qa-empty">No street number for the coming quarter yet. It comes out a few days before the print.</p>
        )}
      </div>

      <div className="qa-block" data-testid="research-readings">
        <h2 className="qa-title">Your readings</h2>
        {insideOpen.length ? (
          <p className="rs-warn" role="note" data-testid="research-inside-warn">
            You hold inside information on {name}. Trading on it before the print is insider dealing.
          </p>
        ) : null}
        {sigs.length ? sigs.map((s) => (
          <SignalLine key={s.id} signal={s} onWhy={why.open} />
        )) : <p className="qa-empty">No reading on {name} this quarter. Readings come from your own job, a friend at a firm that prints, and the street.</p>}
      </div>

      <div className="qa-actions" data-testid="research-trade">
        {warnFor === key ? (
          <>
            <p className="rs-warn" role="alert" data-testid="research-trade-warn">
              You are about to trade {name} on inside information. Trading on it before the print is insider dealing, and the law can see who knew.
            </p>
            <Button variant="secondary" data-testid="research-trade-anyway" onClick={go}>Open Markets anyway</Button>
            <Button variant="ghost" onClick={() => setWarnFor("")}>Keep reading</Button>
          </>
        ) : (
          <Button variant="secondary" data-testid="research-trade" onClick={() => (insideOpen.length ? setWarnFor(key) : go())}>
            Trade {symbol} in Markets
          </Button>
        )}
      </div>

      <div className="qa-block" data-testid="research-reveals">
        <h2 className="qa-title">Past prints</h2>
        {reveals.length ? reveals.map((r) => (
          <RevealLine key={r.eventId} reveal={r} onWhy={why.open} />
        )) : <p className="qa-empty">No print has settled your readings on {name} yet.</p>}
      </div>

      <Because id={why.id} lines={why.lines} />
    </div>
  );
}

function SignalLine({ signal: s, onWhy }: { signal: SignalRow; onWhy: (id: number) => void }) {
  const inside = s.legal === "inside";
  return (
    <div className="rs-sig" data-legal={inside ? "inside" : "fair"} data-outcome={s.outcome} data-testid="research-signal">
      <p className="rs-tags">
        <span className="rs-tag">{kindWord(s.kind)} · {s.clearWord} reading</span>
        <span className="rs-tag" data-legal={inside ? "inside" : "fair"}>{legalWord(s.legal)}</span>
        <span className="qa-muted">{ageWord(s.age)}</span>
      </p>
      <p>{presentNote(s.text)}</p>
      <p className="qa-muted">{presentNote(s.legalLine)}</p>
      <p>
        <Fig word={outcomeWord(s.outcome)} eventId={s.eventId} onWhy={onWhy} title={outcomeWord(s.outcome)} />
      </p>
    </div>
  );
}

function verdictOf(outcome: string): string {
  if (outcome === "right") return "It pointed the right way.";
  if (outcome === "wrong") return "It pointed the wrong way.";
  return "It is not settled yet.";
}

function RevealLine({ reveal: r, onWhy }: { reveal: RevealRow; onWhy: (id: number) => void }) {
  const moved = r.px > 0 && r.pxAfter > 0 ? (r.pxAfter - r.px) / r.px : null;
  const beat = r.surprise > 0.008 ? "above" : r.surprise < -0.008 ? "below" : "in line with";
  return (
    <div className="rs-rev" data-testid="research-reveal">
      <p>
        <Fig word="Printed" title={moneyTitle(r.actual)} eventId={r.eventId} onWhy={onWhy} />
      </p>
      <p className="qa-muted">
        {`The street had ${moneyTitle(r.consensus)}, so the print came ${beat} it (${signedFraction(r.surprise)}).`}
        {moved !== null ? ` The price went from ${moneyTitle(r.px)} to ${moneyTitle(r.pxAfter)}, ${signedFraction(moved)}.` : ""}
      </p>
      {r.mine.map((m, i) => (
        <p key={i} className="rs-said">
          You said: {presentNote(m.text)} <span className="qa-muted">{verdictOf(m.outcome)}</span>
        </p>
      ))}
      {r.story ? (
        <p className="qa-muted" data-testid="research-paper">
          The paper said: {presentNote(r.story)}. {r.storyRight ? "That was what moved it." : "That was not what moved it."}
        </p>
      ) : null}
    </div>
  );
}
