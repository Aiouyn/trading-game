"use client";
// The city's long story: real GDP, productivity, real wages, unemployment, inflation and the policy rate over the years.
// Each chart has one plain sentence about what the series says, and a Why? that opens its cause chain.
import { useRef, useState, type ReactNode } from "react";
import { explain, type ExplainLine } from "@/shell/simSession";
import { gameDate, levelPct, presentNote } from "@/components/ui/format";
import { SeriesChart } from "@/components/ui/SeriesChart";
import "./story.css";

export interface StoryPt { day: number; v: number; eventId: number }
export interface CityStory {
  unemployment: StoryPt[];
  inflation: StoryPt[];
  policy: StoryPt[];
  realGdp: StoryPt[];
  prod: StoryPt[];
  realWage: StoryPt[];
  recordFrom: number;
  today: number;
}

const DAY_YEAR = 360;
const ORDINAL = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** The point on or before `day`, else the first point. */
function at(pts: StoryPt[], day: number): StoryPt | undefined {
  let hit: StoryPt | undefined;
  for (const p of pts) { if (p.day <= day) hit = p; else break; }
  return hit ?? pts[0];
}

/** The change over the last year of a series, and the one before it, if both are on the record. */
function yoy(pts: StoryPt[]): { now: number; then: number | null; change: number | null; abs: number | null } {
  const last = pts[pts.length - 1];
  if (!last) return { now: 0, then: null, change: null, abs: null };
  const past = at(pts, last.day - DAY_YEAR);
  if (!past || past.day > last.day - DAY_YEAR + 30 || past.day === last.day) return { now: last.v, then: null, change: null, abs: null };
  return { now: last.v, then: past.v, change: past.v > 0 ? last.v / past.v - 1 : null, abs: last.v - past.v };
}

/** Consecutive years, counting back from the latest, in which a series rose (sign 1) or fell (sign -1) on the year before. */
function run(pts: StoryPt[], sign: 1 | -1): number {
  const last = pts[pts.length - 1];
  if (!last) return 0;
  let n = 0;
  let day = last.day;
  for (let k = 0; k < 10; k++) {
    const now = at(pts, day);
    const then = at(pts, day - DAY_YEAR);
    if (!now || !then || then.day >= day - DAY_YEAR + 30 || now.day > day) break;
    const d = now.v - then.v;
    if (sign * d <= 0) break;
    n++;
    day -= DAY_YEAR;
  }
  return n;
}

function yearsWord(n: number): string {
  return n === 1 ? "" : ` for the ${ORDINAL[n] ?? `${n}th`} year running`;
}
function pct(x: number): string {
  return `${Math.abs(x * 100).toFixed(1)}%`;
}
function moneyYear(v: number): string {
  const n = Math.round(v);
  const body = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `−$${body}` : `$${body}`;
}
function dollarsDay(v: number): string {
  return `$${v.toFixed(2)} a day`;
}
function points(v: number): string {
  return v.toFixed(1);
}

interface Card {
  key: string;
  label: string;
  word: string;
  figure: string;
  reading: string;
  pts: StoryPt[];
  format: (v: number) => string;
  eventId: number;
}

function cards(s: CityStory): Card[] {
  const gdp = yoy(s.realGdp);
  const prod = yoy(s.prod);
  const wage = yoy(s.realWage);
  const unemp = yoy(s.unemployment);
  const infl = yoy(s.inflation);
  const rate = yoy(s.policy);
  const last = (pts: StoryPt[]) => pts[pts.length - 1];
  const lastOf = (pts: StoryPt[]) => (last(pts)?.eventId ?? 0);

  const gdpWord = gdp.change == null ? "Opening" : gdp.change > 0.005 ? "Growing" : gdp.change < -0.005 ? "Shrinking" : "Steady";
  const gdpRead = gdp.change == null
    ? `Output is measured from ${gameDate(s.recordFrom)}, so a year of it is not yet on the record.`
    : `Real output is ${gdp.change >= 0 ? "up" : "down"} ${pct(gdp.change)} on the year.`;

  const prodWord = prod.change == null ? "Opening" : prod.change > 0.002 ? "Rising" : prod.change < -0.002 ? "Falling" : "Flat";
  const prodRead = prod.change == null
    ? "Output per worker has not yet been measured for a full year."
    : `Output per worker is ${prod.change >= 0 ? "up" : "down"} ${pct(prod.change)} on the year.`;

  const wageUp = run(s.realWage, 1), wageDown = run(s.realWage, -1);
  const wageWord = wage.change == null ? "Opening" : wage.change > 0.002 ? "Rising" : wage.change < -0.002 ? "Falling" : "Flat";
  const wageRead = wage.change == null
    ? "Real wages have not yet been measured for a full year."
    : wageUp > 0
      ? `Wages are rising faster than prices${yearsWord(wageUp)}.`
      : wageDown > 0
        ? `Prices are rising faster than wages${yearsWord(wageDown)}.`
        : `Real wages are ${wage.change >= 0 ? "up" : "down"} ${pct(wage.change)} on the year.`;

  const u = unemp.now;
  const unempWord = u >= 9 ? "High" : u >= 5 ? "Ordinary" : "Low";
  const unempRead = unemp.abs == null
    ? `Unemployment is ${levelPct(u, 1)}.`
    : `Unemployment is ${levelPct(u, 1)}, ${Math.abs(unemp.abs) < 0.05 ? "unchanged" : unemp.abs > 0 ? `up ${Math.abs(unemp.abs).toFixed(1)} points` : `down ${Math.abs(unemp.abs).toFixed(1)} points`} on a year ago.`;

  const inf = infl.now;
  const inflWord = inf >= 4 ? "Hot" : inf <= 0.5 ? "Cool" : "Steady";
  const inflRead = infl.abs == null
    ? `Prices are up ${levelPct(inf, 1)} on the year.`
    : `Prices are up ${levelPct(inf, 1)} on the year, ${Math.abs(infl.abs) < 0.1 ? "about where they were" : infl.abs > 0 ? "faster than a year ago" : "slower than a year ago"}.`;

  const r = rate.now;
  const rateWord = r >= 6 ? "Tight" : r <= 2 ? "Easy" : "Neutral";
  const rateRead = rate.abs == null
    ? `The policy rate is ${levelPct(r, 2)}.`
    : `The policy rate is ${levelPct(r, 2)}, ${Math.abs(rate.abs) < 0.05 ? "where it was a year ago" : rate.abs > 0 ? "up" : "down"}${Math.abs(rate.abs) < 0.05 ? "" : ` ${Math.abs(rate.abs).toFixed(2)} points on a year ago`}.`;

  return [
    { key: "gdp", label: "Real GDP", word: gdpWord, figure: last(s.realGdp) ? `${moneyYear(last(s.realGdp)!.v)} a year, in today's prices` : "Not counted", reading: gdpRead, pts: s.realGdp, format: moneyYear, eventId: lastOf(s.realGdp) },
    { key: "prod", label: "Productivity", word: prodWord, figure: last(s.prod) ? `${points(last(s.prod)!.v)} (opening = 100)` : "Not counted", reading: prodRead, pts: s.prod, format: points, eventId: lastOf(s.prod) },
    { key: "wage", label: "Real wages", word: wageWord, figure: last(s.realWage) ? `${dollarsDay(last(s.realWage)!.v)}, after prices` : "Not counted", reading: wageRead, pts: s.realWage, format: dollarsDay, eventId: lastOf(s.realWage) },
    { key: "unemp", label: "Unemployment", word: unempWord, figure: levelPct(u, 1), reading: unempRead, pts: s.unemployment, format: (v) => levelPct(v, 1), eventId: lastOf(s.unemployment) },
    { key: "infl", label: "Inflation", word: inflWord, figure: levelPct(inf, 1), reading: inflRead, pts: s.inflation, format: (v) => levelPct(v, 1), eventId: lastOf(s.inflation) },
    { key: "rate", label: "Policy rate", word: rateWord, figure: levelPct(r, 2), reading: rateRead, pts: s.policy, format: (v) => levelPct(v, 2), eventId: lastOf(s.policy) },
  ];
}

export function CityStoryPanel({ story }: { story: CityStory | null | undefined }) {
  const [open, setOpen] = useState<string | null>(null);
  const [why, setWhy] = useState<ExplainLine[]>([]);
  const req = useRef(0);

  if (!story) return null;
  const ask = (key: string, id: number) => {
    const n = ++req.current;
    setOpen(key);
    setWhy([]);
    void explain(id).then((lines) => { if (req.current === n) setWhy(lines); });
  };
  const chain = (key: string): ReactNode => open !== key ? null : (
    <div className="q-why-body">
      {why.length ? why.map((line, i) => (
        <p key={`${line.id}-${line.depth}-${i}`} style={{ paddingLeft: line.depth * 12 }}>
          <span className="label">{gameDate(line.day)}</span>{" "}
          {line.missing ? presentNote(line.msg) : `${line.name ? `${line.name}: ` : ""}${presentNote(line.msg)}`}
        </p>
      )) : <p className="muted">Reading the cause…</p>}
    </div>
  );

  return (
    <section className="story" data-testid="city-story" aria-labelledby="story-title">
      <div className="story-head">
        <h3 id="story-title">The city&apos;s long story</h3>
        <p className="muted">Measured monthly from {gameDate(story.recordFrom)}.</p>
      </div>
      <div className="story-grid">
        {cards(story).map((c) => (
          <article key={c.key} className="story-card" data-testid="story-card" data-key={c.key}>
            <span className="label">{c.label}</span>
            <span className="story-word" title={c.figure}>{c.word}</span>
            <span className="num story-figure">{c.figure}</span>
            <SeriesChart points={c.pts.map((p) => ({ v: p.v, day: p.day }))} label={c.label} format={c.format} height={72} />
            <p className="story-read">{c.reading}</p>
            <button type="button" className="q-why" data-testid="story-why" onClick={() => ask(c.key, c.eventId)}>Why?</button>
            {chain(c.key)}
          </article>
        ))}
      </div>
    </section>
  );
}
