"use client";
// The economy: unemployment, inflation, the policy rate, GDP, the yield curve,
// the exchange rate and the power price, each with a chart and why. The desk's last decision.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { explain, useSimSnap, type ExplainLine } from "@/shell/simSession";
import "./institutions.css";

interface Pt { day: number; v: number; eventId: number }
interface Series { v: number; eventId: number; points: Pt[] }
interface Inst {
  unemployment: Series;
  inflation: Series;
  policy: Series;
  gdp: Series & { counted: boolean };
  fx: Series & { name: string; currency: string };
  power: Series & { wholesale: number; marginal: string };
  curve: { tenor: string; v: number; eventId: number }[];
  bank: {
    text: string;
    eventId: number;
    governor: { index: number; name: string } | null;
    reasons: { id: number; msg: string; name: string }[];
  };
}

function jobsWord(v: number): string {
  if (v >= 12) return "Slack";
  if (v >= 6) return "Ordinary";
  return "Tight";
}
function inflWord(v: number): string {
  if (v >= 4) return "Hot";
  if (v <= 0.5) return "Cool";
  return "Steady";
}
function rateWord(v: number): string {
  if (v >= 6) return "Tight";
  if (v <= 2) return "Easy";
  return "Neutral";
}
function gdpWord(s: Inst["gdp"]): string {
  if (!s.counted) return "Uncounted";
  if (s.points.length < 2) return "Opening";
  const a = s.points[s.points.length - 2]!.v;
  const b = s.points[s.points.length - 1]!.v;
  const d = (b - a) / Math.max(1, Math.abs(a));
  if (d > 0.005) return "Growing";
  if (d < -0.005) return "Shrinking";
  return "Steady";
}
function fxWord(points: Pt[]): string {
  if (points.length < 2) return "Steady";
  const a = points[points.length - 2]!.v;
  const b = points[points.length - 1]!.v;
  if (b > a * 1.002) return "Weaker";
  if (b < a * 0.998) return "Stronger";
  return "Steady";
}
function powerWord(tariff: number, wholesale: number): string {
  if (wholesale > 0 && tariff < wholesale * 0.98) return "Capped";
  return "Set";
}
function curveWord(curve: Inst["curve"]): string {
  const y2 = curve.find((c) => c.tenor === "2y")?.v ?? 0;
  const y10 = curve.find((c) => c.tenor === "10y")?.v ?? 0;
  const gap = y10 - y2;
  if (gap < -0.2) return "Inverted";
  if (gap < 0.4) return "Flat";
  return "Upward";
}
function signOf(word: string): "up" | "down" | "flat" {
  if (word === "Growing" || word === "Stronger" || word === "Tight" || word === "Cool") return "up";
  if (word === "Shrinking" || word === "Weaker" || word === "Slack" || word === "Hot" || word === "Inverted" || word === "Capped") return "down";
  return "flat";
}
function moneyYear(v: number): string {
  const n = Math.round(v);
  return (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US");
}

function Chart({ points }: { points: Pt[] }) {
  if (points.length < 2) {
    return <svg className="q-chart" viewBox="0 0 120 36" aria-hidden="true"><circle cx="8" cy="18" r="2" /></svg>;
  }
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min || 1;
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * 118 + 1;
    const y = 32 - ((p.v - min) / span) * 28;
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="q-chart" viewBox="0 0 120 36" aria-hidden="true">
      <path d={d} fill="none" />
    </svg>
  );
}

function Curve({ curve }: { curve: Inst["curve"] }) {
  const max = Math.max(0.01, ...curve.map((c) => Math.abs(c.v)));
  return (
    <svg className="q-chart q-curve" viewBox="0 0 120 36" aria-hidden="true">
      {curve.map((c, i) => {
        const h = Math.max(1, (Math.abs(c.v) / max) * 28);
        const x = 8 + i * 28;
        return <rect key={c.tenor} x={x} y={32 - h} width="16" height={h} fill="currentColor" stroke="none" />;
      })}
    </svg>
  );
}

export default function InstitutionsApp() {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const tick = useSimSnap().view?.date.abs;
  const [data, setData] = useState<Inst | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [why, setWhy] = useState<ExplainLine[]>([]);
  const req = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=institutions", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() as Promise<Inst> : null))
      .then((j) => { if (j?.unemployment) setData(j); })
      .catch(() => {});
    return () => ac.abort();
  }, [tick]);

  const ask = (token: string, id: number) => {
    const n = ++req.current;
    setOpen(token);
    setWhy([]);
    void explain(id).then((lines) => { if (req.current === n) setWhy(lines); });
  };

  const chain = open ? (
    <div className="q-why-body">
      {why.length ? why.map((line, i) => (
        <p key={`${line.id}-${line.depth}-${i}`} style={{ paddingLeft: line.depth * 12 }}>
          {line.missing ? line.msg : `${line.name ? `${line.name}: ` : ""}${line.msg}`}
        </p>
      )) : <p className="muted">Reading the cause…</p>}
    </div>
  ) : null;

  if (!data) {
    return <div className={`inst${phone ? " q-phone" : ""}`} data-testid="institutions"><p className="muted">Reading the books…</p></div>;
  }

  const cards: { key: string; label: string; word: string; title: string; eventId: number; chart: ReactNode }[] = [
    { key: "jobs", label: "Unemployment", word: jobsWord(data.unemployment.v), title: `${data.unemployment.v.toFixed(1)}%`, eventId: data.unemployment.eventId, chart: <Chart points={data.unemployment.points} /> },
    { key: "cpi", label: "Inflation", word: inflWord(data.inflation.v), title: `${data.inflation.v.toFixed(1)}%`, eventId: data.inflation.eventId, chart: <Chart points={data.inflation.points} /> },
    { key: "rate", label: "Policy rate", word: rateWord(data.policy.v), title: `${data.policy.v.toFixed(2)}%`, eventId: data.policy.eventId, chart: <Chart points={data.policy.points} /> },
    { key: "gdp", label: "GDP", word: gdpWord(data.gdp), title: data.gdp.counted ? `${moneyYear(data.gdp.v)} a year` : "not counted", eventId: data.gdp.eventId, chart: <Chart points={data.gdp.points} /> },
    { key: "fx", label: data.fx.name || "Exchange rate", word: fxWord(data.fx.points), title: `${data.fx.v.toFixed(4)} home per ${data.fx.currency || "foreign"}`, eventId: data.fx.eventId, chart: <Chart points={data.fx.points} /> },
    { key: "power", label: "Power", word: powerWord(data.power.v, data.power.wholesale), title: `${data.power.v.toFixed(2)} a unit${data.power.marginal ? ` · ${data.power.marginal}` : ""}`, eventId: data.power.eventId, chart: <Chart points={data.power.points} /> },
    { key: "curve", label: "Yield curve", word: curveWord(data.curve), title: data.curve.map((c) => `${c.tenor} ${c.v.toFixed(2)}%`).join(" · "), eventId: data.curve[0]?.eventId ?? data.policy.eventId, chart: <Curve curve={data.curve} /> },
  ];

  return (
    <div className={`inst${phone ? " q-phone" : ""}`} data-testid="institutions">
      <h2>The economy</h2>
      <div className="inst-grid">
        {cards.map((c) => (
          <article key={c.key} className="inst-card" data-sign={signOf(c.word)}>
            <span className="label">{c.label}</span>
            <span className="inst-word" title={c.title}>{c.word}</span>
            {c.chart}
            <button type="button" className="q-why" data-testid="inst-why" onClick={() => ask(c.key, c.eventId)}>why?</button>
            {open === c.key ? chain : null}
          </article>
        ))}
      </div>
      <article className="inst-card inst-bank">
        <span className="label">Central bank</span>
        <p className="inst-decision">{data.bank.text}</p>
        {data.bank.governor ? <p className="muted">{data.bank.governor.name}, governor</p> : null}
        {data.bank.reasons.length ? (
          <ul className="inst-reasons">
            {data.bank.reasons.map((r, i) => <li key={`${r.id}-${i}`}>{r.name ? `${r.name}: ` : ""}{r.msg}</li>)}
          </ul>
        ) : <p className="muted">The desk has not written a reason.</p>}
        <button type="button" className="q-why" data-testid="inst-why" onClick={() => ask("bank", data.bank.eventId)}>why?</button>
        {open === "bank" ? chain : null}
      </article>
    </div>
  );
}
