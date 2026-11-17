"use client";
// Why on a number: the same explain chain the text game prints. Shared by the trading apps.
import { useRef, useState, type ReactNode } from "react";
import { dateLabel, explain, type ExplainLine } from "@/shell/simSession";
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
          <span className="label">{dateLabel(line.day)}</span>{" "}
          {line.missing ? line.msg : `${line.name ? `${line.name}: ` : ""}${line.msg}`}
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

export function LineChart({ points, up, label }: { points: number[]; up?: boolean; label: string }) {
  if (points.length < 2) return <p className="muted">One point so far.</p>;
  const w = 640;
  const h = 160;
  const pad = 6;
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const d = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p - min) / span) * (h - pad * 2);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const stroke = up === false ? "var(--loss)" : up === true ? "var(--gain)" : "var(--acc)";
  return (
    <svg className="line-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
