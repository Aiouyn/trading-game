// One client session for the simulation: the view, the event stream, and the shell channels.
"use client";
import { useSyncExternalStore } from "react";
import type { Channels } from "./channels";
import { channelsFromView } from "./simChannels";

export interface BookLevel { px: number; qty: number }
export interface Quote {
  instr: string;
  symbol?: string;
  name?: string;
  issuer?: string;
  sector?: string;
  px: number;
  prev: number;
  chg: number;
  vol: number;
  pe?: number | null;
  pos?: number;
  eventId?: number;
  spark?: number[];
  bid?: number;
  ask?: number;
  book?: { bids: BookLevel[]; asks: BookLevel[] };
}
export interface Holding { instr: string; qty: number; px: number; eventId: number }
export interface OrderRow { id: number; book: string; instr: string; side: string; qty: number; limit: number | null; eventId: number }
export interface FeedLine { eventId: number; day: number; tag: string; text: string }
export interface PauseAction { label: string; line: string }
export interface StoryBeat { title: string; text: string; cause: string }
export interface ScenarioView {
  id: string;
  name?: string;
  goal?: string;
  story?: string;
  progress?: number;
  meter?: string;
  first?: string;
  fresh?: boolean;
  begun?: number;
  daysLeft?: number;
  timeLeft?: string;
  beat?: number;
  outcome?: "win" | "loss";
  reason?: string;
  score?: { worth: number; worthX: number; indexX: number; firms: number; reputation: number; convictions: number; events?: string[] };
  code?: string;
  lines?: StoryBeat[];
  chronicle?: string;
}
export interface NewsLine { eventId: number; day: number; text: string; firms?: { id: string; name: string }[] }
export interface PrivLine { eventId: number; day: number; from?: string; text: string }
export interface StatRow { id: string; label: string; word: string; hover: string; trend: -1 | 0 | 1; note?: string; eventId: number }
export interface SimView {
  date: { year: number; month: number; day: number; abs: number };
  name: string;
  netWorth: number;
  cash: number;
  nwChange?: number;
  sinceOpen?: number;
  speed: "pause" | "day" | "week" | "month";
  pause: { why: string; eventId: number; kind?: string; text?: string; actions?: PauseAction[] } | null;
  scenario?: ScenarioView | null;
  contacts?: { slot: number; name: string; kind?: string; word?: string; line?: string }[];
  firms?: { id: string; name: string }[];
  employer?: string;
  firm?: string;
  final?: string;
  stats: StatRow[];
  quotes: Quote[];
  shares: Holding[];
  bonds: { instr: string; face: number; eventId: number; px?: number; prev?: number; tenor?: string }[];
  futures: { good: string; monthsAhead: number; net: number; px: number; eventId: number }[];
  coins: { id: string; name: string; qty: number; px: number; eventId: number }[];
  loans: { kind: string; owed: number; rate: number; eventId: number }[];
  homes: {
    id: number; neighbourhood: string; price: number; rent: number; mine: boolean; live: boolean; vacant: boolean;
    size?: number; condition?: number; missed?: number; mortgage?: number; eventId?: number;
    owner?: { index: number; name: string } | null; tenant?: { index: number; name: string } | null;
  }[];
  companies?: SimCompany[];
  bids?: SimBid[];
  districts?: SimDistrict[];
  chain?: { id: string; instr: string; right: string; strike: number; months: number; net: number; bid: number; ask: number; oi?: number; eventId: number }[];
  score?: { day: number; worth: number }[];
  curve?: { tenor: string; yield: number; id: string; px: number; prev?: number; coupon: number; eventId: number }[];
  futuresBoard?: { good: string; name: string; lot: number; eventId: number; tenors: { monthsAhead: number; px: number; prev: number }[] }[];
  coinBoard?: { id: string; name: string; px: number; prev: number; live: boolean; eventId: number }[];
  tape?: { fx: number; fxName: string; currency: string; policy: number; foreignRate: number; index: number; indexChg: number; events: { fx: number; rate: number; index: number } };
  fx?: { name: string; currency: string; mid: number; bid: number; ask: number; held: number; bonds: number; eventId: number; homeRate: number; foreignRate: number };
  risk?: {
    open: boolean; word: string; cash: number; limit: number; loanOwed: number; loanRate: number; sale: number;
    futPosted: number; futInit: number; futMaint: number; futNote: number;
    optPosted: number; optNeed: number; optMaint: number;
    distance: number; distanceKind: string; used: number; eventId: number;
    sold: { instr: string; symbol: string; name: string; qty: number; proceeds: number; eventId: number }[];
  };
  fills?: { day: number; kind: string; text: string; eventId: number }[];
  orders: OrderRow[];
  news: NewsLine[];
  private?: PrivLine[];
  feed: FeedLine[];
  deposits?: { bank: string; cents: number; eventId: number }[];
  marginPosted?: number;
  stockLoans?: { instr: string; qty: number; face: number; eventId: number }[];
  alive?: boolean;
  over?: boolean;
}
export interface ScenarioCard {
  id: string;
  name: string;
  story: string;
  goal: string;
  limit: string;
  difficulty: string;
  beginner: boolean;
  sandbox: boolean;
}
export interface SaveMeta {
  id: string;
  label: string;
  scenario: string;
  scenarioId?: string;
  player: string;
  date: string;
  netWorth: number;
}
export interface TitleData { scenarios: ScenarioCard[]; saves: SaveMeta[]; last: SaveMeta | null }
export type GateMode = "boot" | "menu" | "new" | "load" | "challenge" | "progress" | "play";
export interface GenState { text: string; lines: string[]; error: string }
export interface ActNote { ok: boolean; text: string; lines?: string[] }
export interface SimCompany {
  id: string; name: string; good: string; sector: string; role: string;
  listed: boolean; workers: number; price: number; cash: number;
  sales: number; cost: number; profit: number; stake: number; shares: number;
  dividend: string; hire: string; quote: string;
  family?: boolean; goodName?: string;
  workerEv?: number; priceEv?: number; profitEv?: number; cashEv?: number; salesEv?: number;
}
export interface SimBid { eventId: number; day: number; kind: string; text: string; firm: string; name: string }
export interface SimDistrict { name: string; distance: number; desirability: number; price: number; eventId?: number }

export interface SimSnap {
  mode: GateMode;
  title: TitleData | null;
  gen: GenState;
  view: SimView | null;
  note: ActNote | null;
  /** Bumps only when a new scenario is started, so the first-minute windows replace a saved layout once. */
  layoutNonce: number;
}

const EMPTY_GEN: GenState = { text: "", lines: [], error: "" };
let snap: SimSnap = { mode: "boot", title: null, gen: EMPTY_GEN, view: null, note: null, layoutNonce: 0 };
const listeners = new Set<() => void>();
let shell: { getState(): { channels: Channels; setChannels(c: Channels): void } } | null = null;
let started = false;
let es: EventSource | null = null;
let refetchTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const fn of listeners) fn();
}
function publish(next: SimSnap) {
  snap = next;
  emit();
}

export function simOwnsShell(): boolean {
  return shell !== null;
}

export function bindShell(s: { getState(): { channels: Channels; setChannels(c: Channels): void } }): void {
  shell = s;
  if (snap.view) pushChannels(snap.view);
}

function pushChannels(view: SimView) {
  if (!shell) return;
  const state = shell.getState();
  state.setChannels(channelsFromView(state.channels, view));
}

function asView(raw: unknown): SimView | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as SimView;
  if (!v.date || typeof v.netWorth !== "number") return null;
  v.quotes = v.quotes ?? [];
  v.shares = v.shares ?? [];
  v.bonds = v.bonds ?? [];
  v.futures = v.futures ?? [];
  v.coins = v.coins ?? [];
  v.loans = v.loans ?? [];
  v.homes = v.homes ?? [];
  v.orders = v.orders ?? [];
  v.news = v.news ?? [];
  v.feed = v.feed ?? [];
  v.stats = v.stats ?? [];
  v.speed = v.speed ?? "pause";
  v.pause = v.pause ?? null;
  return v;
}

function adopt(view: SimView) {
  pushChannels(view);
  snap = { ...snap, view, mode: snap.mode === "boot" ? snap.mode : snap.mode };
}

function mergeDay(frame: SimView) {
  const cur = snap.view;
  if (!cur) {
    adopt(frame);
    publish({ ...snap, view: frame });
    return;
  }
  const by = new Map((frame.quotes ?? []).map((q) => [q.instr, q]));
  const quotes = cur.quotes.map((q) => {
    const u = by.get(q.instr);
    if (!u) return q;
    return { ...q, px: u.px, prev: u.prev, chg: u.chg, vol: u.vol, spark: u.spark ?? q.spark, bid: u.bid ?? q.bid, ask: u.ask ?? q.ask, book: u.book ?? q.book };
  });
  const view: SimView = {
    ...cur,
    date: frame.date ?? cur.date,
    name: frame.name || cur.name,
    cash: frame.cash ?? cur.cash,
    netWorth: frame.netWorth ?? cur.netWorth,
    nwChange: frame.nwChange,
    sinceOpen: frame.sinceOpen,
    speed: frame.speed ?? cur.speed,
    pause: frame.pause ?? null,
    stats: frame.stats?.length ? frame.stats : cur.stats,
    shares: frame.shares ?? cur.shares,
    orders: frame.orders ?? cur.orders,
    news: frame.news ?? cur.news,
    feed: frame.feed ?? cur.feed,
    quotes,
    alive: frame.alive ?? cur.alive,
    over: frame.over ?? cur.over,
    scenario: "scenario" in frame ? frame.scenario ?? null : cur.scenario,
    contacts: frame.contacts ?? cur.contacts,
    firms: frame.firms ?? cur.firms,
    employer: frame.employer || cur.employer,
    firm: frame.firm || cur.firm,
    final: frame.final ?? cur.final,
  };
  adopt(view);
  publish({ ...snap, view });
}

async function readView(): Promise<SimView | null> {
  const res = await fetch("/api/sim/view", { cache: "no-store" });
  if (!res.ok) return null;
  return asView(await res.json());
}

function scheduleRefetch() {
  if (refetchTimer) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    void readView().then((view) => {
      if (!view) return;
      adopt(view);
      publish({ ...snap, view, mode: "play" });
    });
  }, 60);
}

function onGen(msg: { phase?: string; year?: number; text?: string; error?: string }) {
  const gen = { ...snap.gen };
  if (msg.phase === "line") {
    const line = `Year ${msg.year ?? ""}: ${msg.text ?? ""}`.trim();
    gen.lines = [...gen.lines, line].slice(-40);
    gen.text = line;
  } else if (msg.phase === "error") {
    gen.error = msg.error || "the city could not be written";
  } else if (msg.text) {
    gen.text = msg.text;
  }
  const mode = msg.phase === "ready" ? snap.mode : snap.mode === "play" ? "play" : "progress";
  publish({ ...snap, gen, mode });
  if (msg.phase === "ready") {
    void readView().then((view) => {
      if (!view) {
        publish({ ...snap, gen: { ...snap.gen, error: "the city was written but could not be read" } });
        return;
      }
      adopt(view);
      publish({ ...snap, view, mode: "play", gen: { ...snap.gen, text: "The city is open.", error: "" } });
    });
  }
}

function startStream() {
  if (es) return;
  const stream = new EventSource("/api/sim/events");
  es = stream;
  stream.addEventListener("day", (ev) => {
    const view = asView(JSON.parse((ev as MessageEvent).data));
    if (view) mergeDay(view);
  });
  stream.addEventListener("speed", (ev) => {
    const msg = JSON.parse((ev as MessageEvent).data) as {
      speed?: SimView["speed"]; why?: string; eventId?: number; quiet?: boolean;
      kind?: string; text?: string; actions?: PauseAction[];
    };
    if (!snap.view || !msg.speed) return;
    const view: SimView = {
      ...snap.view,
      speed: msg.speed,
      pause: msg.why
        ? { why: msg.why, eventId: msg.eventId ?? 0, kind: msg.kind, text: msg.text, actions: msg.actions }
        : msg.quiet ? null : snap.view.pause,
    };
    adopt(view);
    publish({ ...snap, view });
    if (msg.speed === "pause") scheduleRefetch();
  });
  stream.addEventListener("gen", (ev) => {
    onGen(JSON.parse((ev as MessageEvent).data) as { phase?: string; year?: number; text?: string; error?: string });
  });
  stream.onerror = () => {
    if (snap.mode === "progress") void readView().then((view) => {
      if (!view) return;
      adopt(view);
      publish({ ...snap, view, mode: "play" });
    });
  };
}

async function boot() {
  const titleRes = await fetch("/api/sim/title", { cache: "no-store" });
  const title = titleRes.ok ? await titleRes.json() as TitleData : { scenarios: [], saves: [], last: null };
  title.scenarios = title.scenarios ?? [];
  title.saves = title.saves ?? [];
  const view = await readView();
  if (view) {
    adopt(view);
    publish({ ...snap, title, view, mode: "play" });
    return;
  }
  publish({ ...snap, title, mode: snap.mode === "progress" ? "progress" : "menu" });
}

/** Connect the event stream and read whatever world is already open. Safe to call once. */
export function startSim(): () => void {
  if (started) return () => {};
  started = true;
  startStream();
  void boot();
  return () => {};
}

export function useSimSnap(): SimSnap {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => snap, () => snap);
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch("/api/sim/" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

function beginProgress(text: string, opts?: { fresh?: boolean }) {
  publish({
    ...snap,
    mode: "progress",
    gen: { text, lines: [], error: "" },
    layoutNonce: opts?.fresh ? snap.layoutNonce + 1 : snap.layoutNonce,
  });
}

export async function startScenario(id: string, extra?: { cash?: number; difficulty?: number; again?: boolean }): Promise<void> {
  beginProgress("Writing the city…", { fresh: true });
  const body: Record<string, unknown> = { id };
  if (extra?.cash !== undefined) body.cash = extra.cash;
  if (extra?.difficulty !== undefined) body.difficulty = extra.difficulty;
  if (extra?.again) body.again = true;
  const { ok, data } = await post("start", body);
  if (!ok) publish({ ...snap, gen: { ...snap.gen, error: typeof data.error === "string" ? data.error : "could not start" } });
}

export async function startChallenge(code: string): Promise<void> {
  beginProgress("Writing the city…");
  const { ok, data } = await post("challenge", { code });
  if (!ok) publish({ ...snap, gen: { ...snap.gen, error: typeof data.error === "string" ? data.error : "could not start" } });
}

export async function continueGame(): Promise<void> {
  beginProgress("Reading the save…");
  const { ok, data } = await post("continue", {});
  const view = asView(data.view);
  if (!ok || !view) {
    publish({ ...snap, gen: { ...snap.gen, error: typeof data.error === "string" ? data.error : "no save to continue" } });
    return;
  }
  adopt(view);
  publish({ ...snap, view, mode: "play" });
}

export async function loadGame(id: string): Promise<void> {
  beginProgress("Reading the save…");
  const { ok, data } = await post("load", { id });
  const view = asView(data.view);
  if (!ok || !view) {
    publish({ ...snap, gen: { ...snap.gen, error: typeof data.error === "string" ? data.error : "could not load" } });
    return;
  }
  adopt(view);
  publish({ ...snap, view, mode: "play" });
}

export function openGate(mode: GateMode) {
  publish({ ...snap, mode, gen: mode === "progress" ? snap.gen : { ...snap.gen, error: "" } });
}

export async function setSpeed(speed: SimView["speed"]): Promise<void> {
  const word = speed === "pause" ? "Paused." : speed === "day" ? "A day is passing." : speed === "week" ? "A week is passing." : "A month is passing.";
  publish({ ...snap, note: { ok: true, text: word } });
  const { ok, data } = await post("speed", { speed });
  if (!ok) {
    publish({ ...snap, note: { ok: false, text: typeof data.error === "string" ? data.error : "the clock did not change" } });
    return;
  }
  if (snap.view) {
    const view = { ...snap.view, speed, pause: speed === "pause" ? snap.view.pause : null };
    adopt(view);
    publish({ ...snap, view });
  }
}

function noteOf(ok: boolean, data: Record<string, unknown>): ActNote {
  const lines = Array.isArray(data.lines) ? data.lines.filter((x): x is string => typeof x === "string") : undefined;
  const text = typeof data.why === "string" ? data.why
    : typeof data.text === "string" && data.text ? data.text
    : lines && lines.length ? lines.join("\n")
    : ok ? "done" : "the order was not taken";
  return { ok: ok && data.status !== "rejected", text, lines };
}

async function commitAct(body: unknown): Promise<ActNote> {
  const { ok, data } = await post("act", body);
  const view = asView(data.view);
  if (view) {
    adopt(view);
    snap = { ...snap, view };
  }
  const note = noteOf(ok, data);
  publish({ ...snap, note });
  return note;
}

export async function act(cmd: unknown): Promise<ActNote> {
  return commitAct(cmd);
}

export async function actLine(line: string): Promise<ActNote> {
  return commitAct({ line });
}

export function clearNote(): void {
  if (snap.note) publish({ ...snap, note: null });
}

/** Drop the open world and return to the scenario list. */
export async function leaveGame(): Promise<void> {
  await post("release", {});
  publish({ ...snap, mode: "menu", view: null, note: null });
}

export interface ExplainLine { depth: number; id: number; day: number; kind: string; msg: string; name?: string; missing?: boolean }

export async function explain(id: number): Promise<ExplainLine[]> {
  const res = await fetch(`/api/sim/explain/${id}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json() as { lines?: ExplainLine[] };
  return data.lines ?? [];
}

export function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return sign + (Math.abs(Math.round(cents)) / 100).toFixed(2);
}

export function symbolOf(instr: string): string {
  if (instr === "eq:bank_1") return "BANK";
  if (instr.startsWith("eq:frm_")) return instr.slice(7).toUpperCase();
  return instr;
}

export function dateLabel(abs: number): string {
  const doy = ((abs % 360) + 360) % 360;
  return `Y${Math.floor(abs / 360) + 1} M${Math.floor(doy / 30) + 1} D${(doy % 30) + 1}`;
}
