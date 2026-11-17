"use client";
// The economy: unemployment, inflation, the policy rate, GDP, the yield curve,
// the exchange rate and the power price, each with a chart and why. The desk's last decision.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { explain, useSimSnap, type ExplainLine } from "@/shell/simSession";
import { gameDate, levelPct, presentNote } from "@/components/ui/format";
import { EntityText, Named } from "@/components/ui/Named";
import { SeriesChart } from "@/components/ui/SeriesChart";
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
  const body = Math.abs(n).toLocaleString("en-US");
  if (n < 0) return `\u2212$${body}`;
  return `$${body}`;
}

function seriesOf(points: Pt[], format: (v: number) => string, label: string) {
  return <SeriesChart points={points.map((p) => ({ v: p.v, day: p.day }))} label={label} format={format} height={72} />;
}

export default function InstitutionsApp() {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const tick = useSimSnap().view?.date.abs;
  const [data, setData] = useState<Inst | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [why, setWhy] = useState<ExplainLine[]>([]);
  const req = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=institutions", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() as Promise<Inst> : null))
      .then((j) => { if (j?.unemployment) { setData(j); setFailed(false); } else if (!ac.signal.aborted) setFailed(true); })
      .catch(() => { if (!ac.signal.aborted) setFailed(true); });
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
          <span className="label">{gameDate(line.day)}</span>{" "}
          {line.missing ? presentNote(line.msg) : `${line.name ? `${line.name}: ` : ""}${presentNote(line.msg)}`}
        </p>
      )) : <p className="muted">Reading the cause…</p>}
    </div>
  ) : null;

  if (!data) {
    return (
      <div className={`inst${phone ? " q-phone" : ""}`} data-testid="institutions">
        <p className={failed ? "quay-state" : "quay-state"} data-kind={failed ? "error" : undefined} role={failed ? "alert" : "status"}>
          {failed ? "The books did not answer." : "Reading the books…"}
        </p>
      </div>
    );
  }

  const cards: { key: string; label: string; word: string; title: string; eventId: number; chart: ReactNode }[] = [
    { key: "jobs", label: "Unemployment", word: jobsWord(data.unemployment.v), title: levelPct(data.unemployment.v, 1), eventId: data.unemployment.eventId, chart: seriesOf(data.unemployment.points, (v) => levelPct(v, 1), "Unemployment") },
    { key: "cpi", label: "Inflation", word: inflWord(data.inflation.v), title: levelPct(data.inflation.v, 1), eventId: data.inflation.eventId, chart: seriesOf(data.inflation.points, (v) => levelPct(v, 1), "Inflation") },
    { key: "rate", label: "Policy rate", word: rateWord(data.policy.v), title: levelPct(data.policy.v, 2), eventId: data.policy.eventId, chart: seriesOf(data.policy.points, (v) => levelPct(v, 2), "Policy rate") },
    { key: "gdp", label: "GDP", word: gdpWord(data.gdp), title: data.gdp.counted ? `${moneyYear(data.gdp.v)} a year` : "Not counted", eventId: data.gdp.eventId, chart: seriesOf(data.gdp.points, moneyYear, "GDP") },
    { key: "fx", label: data.fx.name || "Exchange rate", word: fxWord(data.fx.points), title: `${data.fx.v.toFixed(4)} home per ${data.fx.currency || "foreign"}`, eventId: data.fx.eventId, chart: seriesOf(data.fx.points, (v) => v.toFixed(4), data.fx.name || "Exchange rate") },
    { key: "power", label: "Power", word: powerWord(data.power.v, data.power.wholesale), title: `${data.power.v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a unit${data.power.marginal ? ` · ${data.power.marginal}` : ""}`, eventId: data.power.eventId, chart: seriesOf(data.power.points, (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "Power") },
    { key: "curve", label: "Yield curve", word: curveWord(data.curve), title: data.curve.map((c) => `${c.tenor} ${levelPct(c.v, 2)}`).join(" · "), eventId: data.curve[0]?.eventId ?? data.policy.eventId, chart: <SeriesChart neutral points={data.curve.map((c) => ({ v: c.v, label: c.tenor }))} label="Yield curve" format={(v) => levelPct(v, 2)} height={72} /> },
  ];

  return (
    <div className={`inst${phone ? " q-phone" : ""}`} data-testid="institutions">
      <h2>The economy</h2>
      <div className="inst-grid">
        {cards.map((c) => (
          <article key={c.key} className="inst-card" data-sign={signOf(c.word)}>
            <span className="label">{c.label}</span>
            <span className="inst-word" title={c.title}>{c.word}</span>
            <span className="num inst-figure">{c.title}</span>
            {c.chart}
            <button type="button" className="q-why" data-testid="inst-why" onClick={() => ask(c.key, c.eventId)}>Why?</button>
            {open === c.key ? chain : null}
          </article>
        ))}
      </div>
      <article className="inst-card inst-bank">
        <span className="label">Central bank</span>
        <p className="inst-decision"><EntityText text={data.bank.text} /></p>
        {data.bank.governor ? <p className="muted"><Named name={data.bank.governor.name} />, governor</p> : null}
        {data.bank.reasons.length ? (
          <ul className="inst-reasons">
            {data.bank.reasons.slice(0, 4).map((r, i) => <li key={`${r.id}-${i}`}>{r.name ? <><Named name={r.name} />: </> : null}<EntityText text={r.msg} /></li>)}
          </ul>
        ) : <p className="quay-empty">The desk has not written a reason.</p>}
        <button type="button" className="q-why" data-testid="inst-why" onClick={() => ask("bank", data.bank.eventId)}>Why?</button>
        {open === "bank" ? chain : null}
      </article>
    </div>
  );
}
