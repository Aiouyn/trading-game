"use client";
// Why on a number: the same explain chain the text game prints. Shared by the trading apps.
import { useRef, useState, type ReactNode } from "react";
import { explain, type ExplainLine } from "@/shell/simSession";
import { gameDate, presentNote } from "@/components/ui/format";
import { SeriesChart, type SeriesPoint } from "@/components/ui/SeriesChart";
import "./why.css";

export function useCause() {
  const [cause, setCause] = useState<{ title: string; lines: ExplainLine[] | null } | null>(null);
  const req = useRef(0);
  const ask = (id: number, title: string) => {
    const n = ++req.current;
    setCause({ title, lines: null });
    void explain(id).then((lines) => {
      if (req.current === n) setCause({ title, lines });
    });
  };
  return { cause, ask, close: () => setCause(null) };
}

export function Cause({ cause, onClose }: { cause: { title: string; lines: ExplainLine[] | null } | null; onClose: () => void }) {
  if (!cause) return null;
  return (
    <aside className="cause" data-testid="why-panel">
      <div className="cause-bar">
        <p className="cause-title">{cause.title}</p>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {cause.lines === null ? <p className="muted">Reading the cause…</p> : cause.lines.length ? cause.lines.map((line) => (
        <p key={`${line.id}-${line.depth}`} className="cause-line" style={{ paddingLeft: line.depth * 12 }}>
          <span className="label">{gameDate(line.day)}</span>{" "}
          {line.missing ? presentNote(line.msg) : `${line.name ? `${line.name}: ` : ""}${presentNote(line.msg)}`}
        </p>
      )) : <p className="muted">No earlier cause is on the log.</p>}
    </aside>
  );
}

export function NumBtn({ id, title, ask, children }: { id?: number; title: string; ask: (id: number, title: string) => void; children: ReactNode }) {
  if (id === undefined || id < 0) return <span className="num">{children}</span>;
  return (
    <button type="button" className="num-btn" title="Why?" onClick={() => ask(id, title)}>
      {children}
      <span className="num-why"> Why?</span>
    </button>
  );
}

export function tone(n: number): string {
  if (n > 0) return "gain";
  if (n < 0) return "loss";
  return "muted";
}

export function signedPct(chg: number): string {
  const n = Math.abs(chg * 100).toFixed(2);
  if (chg > 0) return `+${n}%`;
  if (chg < 0) return `\u2212${n}%`;
  return `${n}%`;
}

export function LineChart({ points, days, labels, up, label, format, height, neutral }: {
  points: number[];
  days?: number[];
  labels?: string[];
  up?: boolean;
  label: string;
  format?: (v: number) => string;
  height?: number;
  neutral?: boolean;
}) {
  const series: SeriesPoint[] = points.map((v, i) => ({ v, day: days?.[i], label: labels?.[i] }));
  return <SeriesChart points={series} up={up} label={label} format={format} height={height} neutral={neutral} />;
}
