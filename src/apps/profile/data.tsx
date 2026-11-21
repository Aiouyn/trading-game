"use client";
// Shared reader for the life apps. The view is the simulation's /view; every action is /act.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Residence } from "../../../sim/modules/property/index";
import type { CareerCard } from "@/apps/careers/App";
import { MoneyText } from "@/components/shell/MoneyText";
import { Button } from "@/components/ui/Button";
import { act, explain, useSimSnap, type ActNote, type ExplainLine } from "@/shell/simSession";
import { gameDate, moneyFromCents, presentNote, scrubIds, seedDebug } from "@/components/ui/format";

export interface LifeStat {
  id: string;
  label: string;
  word: string;
  hover: string;
  trend: -1 | 0 | 1;
  note?: string;
  eventId: number;
}
export interface LifeChoice {
  id: "holiday" | "donate" | "lawyer" | "clinic" | "overtime" | string;
  label: string;
  cost: number;
  left: number;
  line: string;
}
export interface LifePerson {
  index: number;
  name: string;
  alive?: boolean;
  age?: number;
  role?: string;
  school?: number;
  worth?: number;
  eventId?: number;
}
export interface Told { factId: number; eventId: number; day: number; text: string }
export interface LifeContact {
  slot: number;
  who?: number;
  name: string;
  kind: string;
  word: string;
  line: string;
  sentence?: string;
  knows?: { who: number; name: string; why: string }[];
  told?: Told[];
}
export interface LifeStory { day: number; text: string; eventId: number; weight?: number }
export interface LifeTutorial { step: string; goal: string; hint: string; done: boolean }
export interface CareVisit {
  day: number;
  kind: string;
  who?: number;
  text: string;
  eventId: number;
  hospital?: string;
  owed?: number;
  until?: number;
}
export interface CareWave { day: number; text: string; eventId: number }
export interface HealthHouse {
  index: number;
  name: string;
  role: string;
  alive: boolean;
  age: number;
  health: number;
  illness: string;
  cover: string;
  owed: number;
  eventId: number;
}
export interface HealthPanel {
  health: number;
  illness: string;
  cover: string;
  owed: number;
  eventId: number;
  epidemic: { name: string; eventId: number; quarantine: boolean; cases: number; until: number } | null;
  house?: HealthHouse[];
  visits?: CareVisit[];
  waves?: CareWave[];
}
export interface LifeCompany {
  id: string;
  name: string;
  role?: string;
  family?: boolean;
}
export interface LifeView {
  date: { year: number; month: number; day: number; abs: number };
  epoch?: string;
  name: string;
  age?: number;
  alive?: boolean;
  employer?: string;
  firm?: string;
  career?: CareerCard;
  residence?: Residence | null;
  links?: { a: number; b: number; why: string; kind: string }[];
  life?: {
    past: { name: string; line: string } | null;
    origin: { name: string; line: string } | null;
    skills: { school: number; years: number; trade: string } | null;
    knows: string[];
    arrived: number;
  } | null;
  cash?: number;
  netWorth?: number;
  ageEvent?: number;
  jobEvent?: number;
  stats?: LifeStat[];
  choices?: LifeChoice[];
  contacts?: LifeContact[];
  family?: {
    spouse: { index: number; name: string; alive: boolean; age: number } | null;
    children: { index: number; name: string; alive: boolean; age: number; school: number }[];
    will: string;
  };
  dynasty?: {
    generation: number;
    worth: number;
    founded: number;
    controlled: number;
    offices: number;
    convictions: number;
    eventId: number;
    people: LifePerson[];
  };
  heir?: { index: number; name: string; eventId: number } | null;
  story?: LifeStory[];
  tutorial?: LifeTutorial;
  healthPanel?: HealthPanel;
  private?: { eventId: number; factId?: number; day: number; from?: string; text: string; fromIndex?: number }[];
  companies?: LifeCompany[];
  firms?: { id: string; name: string }[];
  tape?: { events?: { wage?: number } };
  budget?: {
    weekly: number;
    cash: number;
    runwayWeeks: number;
    gross: number;
    tax: number;
    takeHome: number;
    benefit: number;
    benefitEnd: string;
    why: string[];
    lines: { id: string; label: string; cents: number; note: string }[];
  };
}

function isLife(v: unknown): v is LifeView {
  return !!v && typeof v === "object" && "date" in v && "name" in v;
}

// One copy for every life window. useAct and the app each call useLife, and both must see the view after /act.
let lifeNow: LifeView | null = null;
const lifeEars = new Set<(v: LifeView) => void>();

function publishLife(v: LifeView) {
  lifeNow = v;
  for (const ear of lifeEars) ear(v);
}

export function useLife() {
  const snap = useSimSnap();
  const day = snap.view?.date.abs ?? -1;
  const epoch = snap.view?.epoch;
  const [copy, setCopy] = useState<LifeView | null>(lifeNow);
  useEffect(() => {
    lifeEars.add(setCopy);
    if (lifeNow) setCopy(lifeNow);
    return () => { lifeEars.delete(setCopy); };
  }, []);
  useEffect(() => {
    let stop = false;
    const t = setTimeout(() => {
      void fetch("/api/sim/view", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: unknown) => { if (!stop && isLife(v)) publishLife(v); })
        .catch(() => {});
    }, 40);
    return () => { stop = true; clearTimeout(t); };
  }, [day, epoch]);
  const run = useCallback(async (cmd: unknown): Promise<ActNote> => {
    const note = await act(cmd);
    try {
      const res = await fetch("/api/sim/view", { cache: "no-store" });
      if (res.ok) {
        const v: unknown = await res.json();
        if (isLife(v)) publishLife(v);
      }
    } catch { /* the shell already holds the act view */ }
    return note;
  }, []);
  const life = copy && copy.date.abs === day && copy.epoch === epoch ? copy : isLife(snap.view) ? snap.view : null;
  return { life, run };
}

export function useAct() {
  const { run } = useLife();
  const [note, setNote] = useState<ActNote | null>(null);
  const [busy, setBusy] = useState(false);
  const today = useSimSnap().view?.date.abs;
  useEffect(() => { setNote((old) => (old && old.text !== "Sending…" ? null : old)); }, [today]);
  const go = useCallback(async (cmd: unknown) => {
    setBusy(true);
    setNote({ ok: true, text: "Sending…" });
    try {
      const next = await run(cmd);
      setNote(next);
      return next;
    } catch {
      const fail: ActNote = { ok: false, text: "That did not go through." };
      setNote(fail);
      return fail;
    } finally {
      setBusy(false);
    }
  }, [run]);
  return { note, busy, go };
}

export function money(cents: number): string {
  return moneyFromCents(cents);
}

/** A figure beside the word. A bare ledger id is not a figure. */
function figureOf(word: string, hover: string): string {
  const fig = scrubIds(hover);
  if (!fig || fig === word) return "";
  if (!/\d/.test(fig)) return "";
  if (/^no\b/i.test(word) && /^0(?:\.0+)?$/.test(fig)) return "";
  return fig;
}

export function ageWord(age: number): string {
  if (age < 2) return "An infant";
  if (age < 13) return "A child";
  if (age < 18) return "Young";
  if (age < 30) return "Young adult";
  if (age < 45) return "In their prime";
  if (age < 65) return "Settled";
  if (age < 80) return "Older";
  return "Elderly";
}

export function schoolWord(years: number): string {
  if (years <= 0) return "Not in school";
  if (years < 6) return "Starting school";
  if (years < 12) return "At school";
  if (years < 18) return "Later school";
  return "Schooled";
}

export function coolWord(days: number): string {
  if (days <= 0) return "Ready";
  if (days < 40) return "Not for a month";
  if (days < 100) return "Not this season";
  if (days < 200) return "Not this half year";
  return "Not this year";
}

export function fortuneWord(cents: number): string {
  if (cents < 0) return "Ruined";
  if (cents < 500_000) return "Thin";
  if (cents < 5_000_000) return "Modest";
  if (cents < 50_000_000) return "Comfortable";
  return "Wealthy";
}

export function generationWord(n: number): string {
  if (n <= 1) return "First generation";
  if (n === 2) return "Second generation";
  if (n === 3) return "Third generation";
  return "An old house";
}

export function tallyWord(n: number, none: string, one: string, many: string): string {
  if (n <= 0) return none;
  if (n === 1) return one;
  return many;
}

export function healthWord(n: number): string {
  if (n >= 75) return "Sound";
  if (n >= 45) return "Worn";
  return "Failing";
}

export function sentenceOf(c: LifeContact): string {
  if (c.sentence) return c.sentence;
  const who = c.name.trim().split(/\s+/)[0] || "Someone";
  const tie = c.kind === "family" ? "you are family" : "you know each other";
  if (c.word === "Trusts you") return `${who} trusts you; ${tie}`;
  if (c.word === "Confides") return `${who} confides in you; ${tie}`;
  if (c.word === "Unsure") return `${who} is unsure of you; ${tie}`;
  if (c.word === "Wary") return `${who} is wary of you; ${tie}`;
  return c.line || `You know ${who}`;
}

export function CauseLines({ lines }: { lines: ExplainLine[] }) {
  const shown = lines.flatMap((line) => {
    if (seedDebug(line.msg)) return [];
    const body = line.missing ? presentNote(line.msg) : `${line.name ? `${line.name}: ` : ""}${presentNote(line.msg)}`.trim();
    if (!body) return [];
    return [{ ...line, body }];
  });
  if (!shown.length) return <p>The city was already here.</p>;
  return (
    <>
      {shown.map((line) => (
        <p key={`${line.id}-${line.depth}`} style={{ paddingLeft: line.depth * 12 }}>
          <span className="label">{gameDate(line.day)}</span>{" "}
          {line.body}
        </p>
      ))}
    </>
  );
}

export function Why({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<ExplainLine[] | null>(null);
  if (!Number.isFinite(id) || id < 0) return null;
  const on = () => {
    setOpen((v) => !v);
    if (!lines) void explain(id).then(setLines);
  };
  return (
    <span className="qy-why">
      <button type="button" className="qy-why-btn why-link" onClick={on} data-testid="why">Why?</button>
      {open ? (
        <span className="qy-why-chain" data-testid="why-chain">
          {lines ? <CauseLines lines={lines} /> : <p>Reading the cause…</p>}
        </span>
      ) : null}
    </span>
  );
}

export function WordNum({ word, hover, eventId }: { word: string; hover: string; eventId?: number }) {
  const fig = figureOf(word, hover);
  return (
    <span className="qy-pair">
      <span className="qy-hover" tabIndex={0} title={hover}>
        {word}
        {fig ? <span className="qy-num num">{fig}</span> : null}
      </span>
      {eventId !== undefined ? <Why id={eventId} /> : null}
    </span>
  );
}

export function StatLine({ s }: { s: LifeStat }) {
  const arrow = s.trend > 0 ? "↑" : s.trend < 0 ? "↓" : "→";
  const tone = s.trend > 0 ? "gain" : s.trend < 0 ? "loss" : "flat";
  const trend = s.trend > 0 ? "rising" : s.trend < 0 ? "falling" : "steady";
  const fig = figureOf(s.word, s.hover);
  return (
    <div className="qy-stat" data-testid={`stat-${s.id}`}>
      <span className="label">{s.label}</span>
      <span className="qy-pair">
        <span className="qy-hover" tabIndex={0} title={s.hover}>
          {s.word}
          <span className={`qy-arrow ${tone}`} aria-label={trend}>{arrow}</span>
          {fig ? <span className="qy-num num">{fig}</span> : null}
        </span>
        <Why id={s.eventId} />
      </span>
    </div>
  );
}

export function Result({ note }: { note: ActNote | null }) {
  if (!note) return null;
  const body = note.lines?.join("\n");
  return (
    <div className="qy-result" data-ok={note.ok ? "1" : "0"} data-testid="life-result">
      <p>{presentNote(note.text)}</p>
      {body && body !== note.text ? <pre className="qy-lines">{body}</pre> : null}
    </div>
  );
}

export function Closed({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="qy-life" data-testid={title.toLowerCase()}>
      <h2>{title}</h2>
      <p className="qy-muted">{children ?? "The books are not open."}</p>
    </div>
  );
}

export function Cost({ cents, eventId }: { cents: number; eventId?: number }) {
  return (
    <span className="qy-pair">
      <MoneyText amount={money(cents)} ctx="list" />
      {eventId !== undefined ? <Why id={eventId} /> : null}
    </span>
  );
}

export function when(day: number): string {
  return gameDate(day);
}

export const LESSON = [
  { id: "sheet", goal: "Check your sheet" },
  { id: "bank", goal: "Open a bank account" },
  { id: "share", goal: "Buy your first share" },
  { id: "why", goal: "Read why it moved" },
  { id: "ask", goal: "Ask a contact" },
  { id: "loan", goal: "Take a loan" },
  { id: "repay", goal: "Pay it back" },
] as const;

export const HELP = [
  { id: "markets", title: "Markets", about: "The desk, a quote, buy, sell, short, cancel" },
  { id: "bonds", title: "Bonds", about: "Buy or sell the bond on the run" },
  { id: "futures", title: "Futures", about: "A commodity, long or short" },
  { id: "options", title: "Options", about: "Calls, puts, writing, closing" },
  { id: "coins", title: "Coins", about: "Buy, sell, or launch a coin" },
  { id: "bank", title: "Bank", about: "Deposit, withdraw, borrow, repay, the sheet" },
  { id: "property", title: "Property", about: "Homes, bids, rent, a mortgage" },
  { id: "people", title: "People", about: "Talk, ask, court, marry, a child, school, the will" },
  { id: "company", title: "Company", about: "Found a firm, the desk, a bid, the board" },
  { id: "news", title: "News", about: "The paper, why, a tip, a report" },
  { id: "life", title: "Life", about: "Holiday, clinic, overtime, a gift, a lawyer" },
  { id: "time", title: "Time", about: "Let the city run" },
  { id: "help", title: "Help", about: "Topics, hints, the chronicle" },
  { id: "talk", title: "Talk", about: "Talk to a contact" },
  { id: "ask", title: "Ask", about: "Ask a contact about a firm" },
  { id: "tip", title: "Tip", about: "Give a paper a fact you know" },
  { id: "marry", title: "Marry", about: "Marry a contact" },
  { id: "child", title: "Child", about: "Have a child" },
  { id: "will", title: "Will", about: "Name who inherits" },
  { id: "hand", title: "Hand", about: "Hand a family firm to the next generation" },
  { id: "holiday", title: "Holiday", about: "A month away" },
  { id: "clinic", title: "Clinic", about: "See a doctor" },
  { id: "story", title: "Story", about: "The chronicle of this life" },
] as const;

export function ChoiceButton({ primary, disabled, testId, onClick, children }: {
  primary: boolean;
  disabled: boolean;
  testId: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant={primary ? "primary" : "secondary"} disabled={disabled} data-testid={testId} onClick={onClick}>
      {children}
    </Button>
  );
}
