"use client";
// Shared pieces for the six building apps. Words on the page, the figure in the title, why? opens the cause.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { explain, type ActNote, type ExplainLine } from "@/shell/simSession";
import { gameDate, presentNote } from "@/components/ui/format";
import { LiveNum } from "@/components/ui/LiveNum";
import { viewportOf } from "@/shell/wm";

export function usePhone(): boolean {
  return useShell((s) => viewportOf(s.vw) === "phone");
}

export function moneyTitle(cents: number): string {
  const n = Math.abs(Math.round(cents)) / 100;
  const body = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (cents < 0 ? "−$" : "$") + body;
}

/** Dollars typed in a field, as integer cents. Empty or junk is null. */
export function centsOf(raw: string): number | null {
  const t = raw.trim().replace(/[$,]/g, "");
  if (!t || !/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100);
  return Number.isSafeInteger(n) ? n : null;
}

export function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function usePanel<T>(query: string, watch: unknown): { data: T | null; error: string } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stop = false;
    void fetch("/api/sim/panel?" + query, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("The book did not answer.");
        return r.json() as Promise<T>;
      })
      .then((d) => { if (!stop) { setData(d); setError(""); } })
      .catch((e: unknown) => { if (!stop) setError(e instanceof Error ? e.message : "The book did not answer."); });
    return () => { stop = true; };
  }, [query, watch]);
  return { data, error };
}

export function useWhy(): { id: number | null; lines: ExplainLine[] | null; open: (id: number) => void } {
  const [id, setId] = useState<number | null>(null);
  const [lines, setLines] = useState<ExplainLine[] | null>(null);
  const req = useRef(0);
  const open = (eventId: number) => {
    const n = ++req.current;
    setId(eventId);
    setLines(null);
    void explain(eventId).then((rows) => { if (req.current === n) setLines(rows); });
  };
  return { id, lines, open };
}

export function Fig({ word, title, eventId, onWhy }: { word: string; title: string; eventId?: number; onWhy: (id: number) => void }) {
  const id = eventId ?? -1;
  const figure = title && title !== word && title.length <= 72 ? title : "";
  const body = (
    <>
      <span>{word}</span>
      {figure ? <LiveNum value={figure}><span className="num qa-fig-num">{figure}</span></LiveNum> : null}
      {id >= 0 ? <span className="qa-why">Why?</span> : null}
    </>
  );
  if (!(id >= 0)) return <span className="qa-fig" title={title}>{body}</span>;
  return (
    <button type="button" className="qa-fig" title={title} onClick={() => onWhy(id)}>
      {body}
    </button>
  );
}

export function Because({ id, lines }: { id: number | null; lines: ExplainLine[] | null }) {
  if (id === null) return null;
  return (
    <div className="qa-because" data-testid="qa-why">
      {lines && lines.length ? lines.map((line) => (
        <p key={`${line.id}-${line.depth}`} style={{ paddingLeft: line.depth * 12 }}>
          <span className="label">{gameDate(line.day)}</span>{" "}
          {line.missing ? presentNote(line.msg) : `${line.name ? `${line.name}: ` : ""}${presentNote(line.msg)}`}
        </p>
      )) : <p className="qa-muted">{lines ? "No cause on record." : "Reading the cause…"}</p>}
    </div>
  );
}

export function Note({ note, testId }: { note: ActNote | null; testId: string }) {
  return <p className="qa-note" data-ok={note ? (note.ok ? "1" : "0") : ""} data-testid={testId}>{note ? presentNote(note.text) : ""}</p>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="qa-field"><span className="label">{label}</span>{children}</label>;
}
