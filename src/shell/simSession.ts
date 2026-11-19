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
  ahead?: boolean;
  pullback?: string;
  score?: { worth: number; worthX: number; indexX: number; firms: number; reputation: number; convictions: number; events?: string[] };
  code?: string;
  lines?: StoryBeat[];
  chronicle?: string;
  tutorial?: { step: string; goal: string; hint: string; done: boolean };
}
export interface NewsLine { eventId: number; day: number; text: string; firms?: { id: string; name: string }[] }
export interface PrivLine { eventId: number; day: number; from?: string; text: string }
export interface StatRow { id: string; label: string; word: string; hover: string; trend: -1 | 0 | 1; note?: string; eventId: number }
export interface LiveClock {
  abs: number; day: number; min: number; weekday: string; label: string;
  session: "open" | "closed" | "pre" | "after";
  open: number; close: number; speed: SimView["speed"]; rate: number; tick: number; ticks: number;
  /** Latest minute price of every instrument, by id. */
  px?: Record<string, number>;
}
export interface SimView {
  date: { year: number; month: number; day: number; abs: number };
  live?: LiveClock;
  name: string;
  netWorth: number;
  cash: number;
  nwChange?: number;
  sinceOpen?: number;
  speed: "pause" | "x1" | "x2" | "x5" | "x10" | "x25" | "day" | "week" | "month";
  pause: { why: string; eventId: number; kind?: string; text?: string; actions?: PauseAction[] } | null;
  scenario?: ScenarioView | null;
  contacts?: { slot: number; who?: number; name: string; kind?: string; word?: string; line?: string }[];
  society?: unknown;
  calendar?: unknown;
  plans?: unknown;
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
  chainPartial?: boolean;
  booksPartial?: boolean;
  epoch?: string;
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
    taken?: { symbol: string; name: string; qty: number; close: number; day: number; how: string }[];
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
  arrival?: string[];
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
  different?: string;
  age?: number;
}
export interface SaveMeta {
  id: string;
  label: string;
  scenario: string;
  scenarioId?: string;
  player: string;
  date: string;
  netWorth: number;
  savedAt?: number;
}
export interface AgeBand { years: number; label: string }
export interface DriftLine { k: string; text: string }
export interface SceneData {
  index: number | null;
  firms: { name: string; cap: number; staff: number; sector: string }[];
  berthed: number;
  waiting: number;
  sailing: number;
}
export interface BackgroundOption { id: string; name: string; line: string }
export interface TitleData {
  pasts?: BackgroundOption[];
  origins?: BackgroundOption[];
  scene?: SceneData;
  scenarios: ScenarioCard[];
  saves: SaveMeta[];
  last: SaveMeta | null;
  lines?: DriftLine[];
  names?: string[];
  ages?: AgeBand[];
  districts?: string[];
  autosave?: boolean;
}
export type GateMode = "boot" | "menu" | "new" | "load" | "challenge" | "progress" | "play";
export interface GenState { text: string; lines: string[]; error: string }
export interface ActNote { ok: boolean; text: string; lines?: string[]; title?: string }
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
  /** True when a newer window took the game. This one is read-only until the player takes it back. */
  taken: boolean;
}

const EMPTY_GEN: GenState = { text: "", lines: [], error: "" };
let snap: SimSnap = { mode: "boot", title: null, gen: EMPTY_GEN, view: null, note: null, layoutNonce: 0, taken: false };
const listeners = new Set<() => void>();
let shell: { getState(): { channels: Channels; setChannels(c: Channels): void } } | null = null;
let started = false;
let es: EventSource | null = null;
let refetchTimer: ReturnType<typeof setTimeout> | null = null;
let chainTimer: ReturnType<typeof setTimeout> | null = null;
let paintQueued = false;
let pending = snap;
let epoch = "";
let recovering = false;
let quietUntil = 0;
let acting = false;

const STOPPED = "The simulation stopped, so wait a moment and try again.";
const BUSY_NOTE = "That is already in, so wait a moment and try once more.";

function emit() {
  for (const fn of listeners) fn();
}
function flush() {
  snap = pending;
  if (snap.view) pushChannels(snap.view);
  emit();
}
function publish(next: SimSnap, coalesce = false) {
  pending = next;
  if (!coalesce) {
    paintQueued = false;
    flush();
    return;
  }
  if (paintQueued) return;
  paintQueued = true;
  // A hidden or unfocused page may never get an animation frame, so a timer paints too: the first of the two wins.
  let done = false;
  const paint = () => {
    if (done) return;
    done = true;
    paintQueued = false;
    flush();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(paint);
  setTimeout(paint, 60);
}

export function simOwnsShell(): boolean {
  return shell !== null;
}

export function bindShell(s: { getState(): { channels: Channels; setChannels(c: Channels): void } }): void {
  shell = s;
  if (pending.view) pushChannels(pending.view);
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
  return applyLive(v, v.live);
}

/** Put the latest minute prices on the quotes and coins, so what is on screen moves with the clock. */
function applyLive(v: SimView, live: LiveClock | undefined): SimView {
  const px = live?.px;
  if (!px) return v;
  const quotes = v.quotes.map((q) => {
    const p = px[q.instr];
    return p && p > 0 && p !== q.px ? { ...q, px: p, chg: q.prev > 0 ? p / q.prev - 1 : q.chg } : q;
  });
  const coins = v.coins.map((c) => {
    const p = px[c.id];
    return p && p > 0 ? { ...c, px: p } : c;
  });
  const board = v.coinBoard?.map((c) => {
    const p = px[c.id];
    return p && p > 0 ? { ...c, px: p, } : c;
  });
  return { ...v, quotes, coins, ...(board ? { coinBoard: board } : {}) };
}

function tabId(): string {
  try {
    const key = "quay.tab";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(key, id);
    }
    return id.replace(/[^\w.-]/g, "").slice(0, 40) || "tab";
  } catch {
    return "tab";
  }
}

function simHeaders(extra?: Record<string, string>): HeadersInit {
  return { "x-quay-tab": tabId(), ...extra };
}

function holdLists(view: SimView): SimView {
  const cur = pending.view;
  if (!cur) return view;
  let next = view;
  if (view.chainPartial && cur.chain && cur.chain.length > (view.chain?.length ?? 0)) {
    next = { ...next, chain: cur.chain };
  }
  if (view.booksPartial && cur.quotes?.length) {
    const old = new Map(cur.quotes.map((q) => [q.instr, q]));
    next = {
      ...next,
      quotes: next.quotes.map((q) => {
        const prev = old.get(q.instr);
        return prev ? { ...q, book: q.book ?? prev.book, spark: q.spark ?? prev.spark } : q;
      }),
    };
  }
  return next;
}

function adopt(view: SimView): SimView {
  const next = holdLists(view);
  if (next.epoch) epoch = next.epoch;
  return applyLive(next, next.live);
}

function newerFeed(cur: FeedLine[], frame: FeedLine[] | undefined): FeedLine[] {
  if (!frame?.length) return cur;
  const ids = new Set(cur.map((l) => l.eventId));
  const extra = frame.filter((l) => !ids.has(l.eventId));
  const merged = extra.length ? [...cur, ...extra] : cur;
  return merged.length > 100 ? merged.slice(-100) : merged;
}

function mergeDay(frame: SimView) {
  const cur = pending.view;
  if (!cur) {
    const view = adopt(frame);
    publish({ ...pending, view }, true);
    return;
  }
  if (frame.epoch && epoch && frame.epoch !== epoch) {
    void recoverFromStream();
    return;
  }
  if (frame.date && cur.date && frame.date.abs + 1 < cur.date.abs) {
    void recoverFromStream();
    return;
  }
  const by = new Map((frame.quotes ?? []).map((q) => [q.instr, q]));
  const quotes = cur.quotes.map((q) => {
    const u = by.get(q.instr);
    if (!u) return q;
    return { ...q, px: u.px, prev: u.prev, chg: u.chg, vol: u.vol, pos: u.pos ?? q.pos, spark: u.spark ?? q.spark, bid: u.bid ?? q.bid, ask: u.ask ?? q.ask, book: u.book ?? q.book };
  });
  for (const u of frame.quotes ?? []) if (!by.has(u.instr) || !cur.quotes.some((q) => q.instr === u.instr)) {
    if (!quotes.some((q) => q.instr === u.instr)) quotes.push(u);
  }
  const view = adopt({
    ...cur,
    date: frame.date ?? cur.date,
    name: frame.name || cur.name,
    cash: frame.cash ?? cur.cash,
    netWorth: frame.netWorth ?? cur.netWorth,
    nwChange: frame.nwChange,
    sinceOpen: frame.sinceOpen,
    speed: frame.speed ?? cur.speed,
    live: frame.live ?? cur.live,
    pause: frame.pause ?? null,
    stats: frame.stats?.length ? frame.stats : cur.stats,
    shares: frame.shares ?? cur.shares,
    orders: frame.orders ?? cur.orders,
    news: frame.news ?? cur.news,
    feed: newerFeed(cur.feed, frame.feed),
    quotes,
    alive: frame.alive ?? cur.alive,
    over: frame.over ?? cur.over,
    scenario: "scenario" in frame ? frame.scenario ?? null : cur.scenario,
    contacts: frame.contacts ?? cur.contacts,
    firms: frame.firms ?? cur.firms,
    employer: frame.employer || cur.employer,
    firm: frame.firm || cur.firm,
    final: frame.final ?? cur.final,
    society: frame.society ?? cur.society,
    calendar: frame.calendar ?? cur.calendar,
    plans: frame.plans ?? cur.plans,
    epoch: frame.epoch ?? cur.epoch,
  });
  publish({ ...pending, view }, true);
}

async function readView(): Promise<SimView | null> {
  try {
    const res = await fetch("/api/sim/view", { cache: "no-store", headers: simHeaders() });
    if (res.status === 409 && pending.mode === "play") {
      void recoverFromStream();
      return null;
    }
    if (!res.ok) return null;
    return asView(await res.json());
  } catch {
    return null;
  }
}

// The day frame carries prices and news, not the player's readings, the street's numbers, credit or stakes. Those come
// from /view, so each tick re-reads it (one read in flight; a tick during a read queues one more). Order 106.
let edgeInFlight = false;
let edgeAgain = false;
const EDGE_FIELDS = ["signals", "consensus", "reveals", "credit", "stake"] as const;
function withEdge(cur: SimView, from: SimView): SimView {
  const out: SimView = { ...cur };
  const src = from as unknown as Record<string, unknown>;
  const dst = out as unknown as Record<string, unknown>;
  for (const k of EDGE_FIELDS) if (src[k] !== undefined) dst[k] = src[k];
  return out;
}
function refreshEdge() {
  if (edgeInFlight) { edgeAgain = true; return; }
  edgeInFlight = true;
  void readView().then((view) => {
    const cur = pending.view;
    if (!view || !cur || pending.mode !== "play" || view.date.abs < cur.date.abs) return;
    publish({ ...pending, view: adopt(withEdge(cur, view)) }, true);
  }).catch(() => {}).finally(() => {
    edgeInFlight = false;
    if (edgeAgain) { edgeAgain = false; refreshEdge(); }
  });
}

function scheduleRefetch() {
  if (refetchTimer) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    void readView().then((view) => {
      if (!view) return;
      const next = adopt(view);
      publish({ ...pending, view: next, mode: "play" });
    }).catch(() => {});
  }, 60);
}

function markLink(up: boolean) {
  if (!shell) return;
  const state = shell.getState();
  state.setChannels({
    ...state.channels,
    system: { ...state.channels.system, connection: up ? "live" : "reconnecting" },
  });
}

function sameWorld(view: SimView, heldDay: number, heldEpoch: string): boolean {
  if (view.date.abs < heldDay) return false;
  if (heldEpoch && view.epoch && view.epoch !== heldEpoch) return false;
  return true;
}

function sayOnPause(view: SimView, sentence: string): SimView {
  if (!view.pause) return view;
  const line = sentence.replace(/\s+$/, "");
  const text = view.pause.text ? `${line} ${view.pause.text}` : line;
  return { ...view, pause: { ...view.pause, text } };
}

async function recoverFromStream() {
  if (recovering || pending.mode !== "play") return;
  recovering = true;
  const heldDay = pending.view?.date.abs ?? 0;
  const heldEpoch = epoch;
  const first = await readView();
  if (first && sameWorld(first, heldDay, heldEpoch)) {
    quietUntil = Date.now() + 1500;
    recovering = false;
    return;
  }
  markLink(false);
  publish({ ...pending, note: { ok: false, text: "The simulation stopped, so the last autosave is opening.\n" } });
  for (let i = 0; i < 8; i++) {
    const probed = await readView();
    if (probed && sameWorld(probed, heldDay, heldEpoch)) {
      markLink(true);
      const view = sayOnPause(adopt(probed), "The simulation is back, so carry on.");
      publish({ ...pending, view, mode: "play", note: { ok: true, text: "The simulation is back, so carry on.\n" } });
      quietUntil = Date.now() + 2500;
      recovering = false;
      return;
    }
    const { ok, data } = await post("continue", {});
    const loaded = asView(data.view);
    if (ok && loaded) {
      markLink(true);
      const view = sayOnPause(adopt(loaded), "Opened the last autosave, so carry on from the last month.");
      publish({ ...pending, view, mode: "play", note: { ok: true, text: "Opened the last autosave, so carry on from the last month.\n" } });
      quietUntil = Date.now() + 2500;
      recovering = false;
      return;
    }
    await new Promise((r) => setTimeout(r, 350 + i * 200));
  }
  recovering = false;
  markLink(true);
  publish({ ...pending, mode: "menu", view: null, note: { ok: false, text: "The simulation stopped, so wait a moment and try Continue.\n" } });
}

function onGen(msg: { phase?: string; year?: number; text?: string; error?: string }) {
  const gen = { ...pending.gen, lines: pending.gen.lines.slice() };
  const keep = () => {
    if (gen.text && gen.lines[gen.lines.length - 1] !== gen.text) gen.lines.push(gen.text);
  };
  if (msg.phase === "line") {
    keep();
    const line = `Year ${msg.year ?? ""}: ${msg.text ?? ""}`.trim();
    gen.lines = [...gen.lines, line].slice(-40);
    gen.text = line;
  } else if (msg.phase === "error") {
    gen.error = msg.error || "The city could not be written, so try again.";
  } else if (msg.text) {
    keep();
    gen.text = msg.text;
    gen.lines = gen.lines.slice(-40);
  }
  const mode = msg.phase === "ready" ? pending.mode : pending.mode === "play" ? "play" : "progress";
  publish({ ...pending, gen, mode });
  if (msg.phase === "ready") {
    void readView().then((view) => {
      if (!view) {
        publish({ ...pending, gen: { ...pending.gen, error: "The city was written but could not be read, so try again." } });
        return;
      }
      const next = adopt(view);
      publish({ ...pending, view: next, mode: "play", gen: { ...pending.gen, text: "The city is open.", error: "" } });
    }).catch(() => {});
  }
}

function startStream() {
  if (es) return;
  const stream = new EventSource("/api/sim/events?tab=" + encodeURIComponent(tabId()));
  es = stream;
  stream.addEventListener("day", (ev) => {
    try {
      const view = asView(JSON.parse((ev as MessageEvent).data));
      if (view) {
        mergeDay(view);
        if (pending.mode === "play") refreshEdge();
      }
    } catch { /* a bad frame is not a crash */ }
  });
  stream.addEventListener("clock", (ev) => {
    let msg: LiveClock;
    try { msg = JSON.parse((ev as MessageEvent).data); }
    catch { return; }
    const cur = pending.view;
    if (!cur || typeof msg.min !== "number") return;
    const view = applyLive({ ...cur, live: msg, speed: msg.speed ?? cur.speed }, msg);
    publish({ ...pending, view: adopt(view) }, true);
  });
  stream.addEventListener("speed", (ev) => {
    let msg: {
      speed?: SimView["speed"]; why?: string; eventId?: number; quiet?: boolean;
      kind?: string; text?: string; actions?: PauseAction[];
    };
    try { msg = JSON.parse((ev as MessageEvent).data); }
    catch { return; }
    if (!pending.view || !msg.speed) return;
    const view = adopt({
      ...pending.view,
      speed: msg.speed,
      pause: msg.why
        ? { why: msg.why, eventId: msg.eventId ?? 0, kind: msg.kind, text: msg.text, actions: msg.actions }
        : msg.quiet ? null : pending.view.pause,
    });
    publish({ ...pending, view });
    if (msg.speed === "pause") scheduleRefetch();
  });
  stream.addEventListener("gen", (ev) => {
    try { onGen(JSON.parse((ev as MessageEvent).data) as { phase?: string; year?: number; text?: string; error?: string }); }
    catch { /* ignore a bad progress frame */ }
  });
  stream.addEventListener("taken", () => markTaken());
  stream.onerror = () => {
    if (pending.taken) return;
    if (recovering || Date.now() < quietUntil) return;
    if (pending.mode === "progress") {
      void readView().then((view) => {
        if (!view) return;
        const next = adopt(view);
        publish({ ...pending, view: next, mode: "play" });
      }).catch(() => {});
      return;
    }
    if (pending.mode === "play") void recoverFromStream();
  };
}

/** A newer window took the game: stop listening and say so. Nothing here writes until the player takes it back. */
function markTaken() {
  if (es) { es.close(); es = null; }
  if (!pending.taken) publish({ ...pending, taken: true, note: null });
}

/** Take the game back into this window. The other window, if it is still open, is told in its turn. */
export async function takeBack(): Promise<void> {
  const { ok } = await post("claim", {});
  if (!ok) return;
  publish({ ...pending, taken: false });
  startStream();
  const view = await readView();
  if (view) publish({ ...pending, view: adopt(view), taken: false });
}

function armChain() {
  if (chainTimer) return;
  chainTimer = setTimeout(() => {
    chainTimer = null;
    if (pending.mode === "play" && pending.view) {
      void fetch("/api/sim/panel?name=options", { cache: "no-store", headers: simHeaders() })
        .then((r) => r.ok ? r.json() : null)
        .then((data: { chain?: SimView["chain"] } | null) => {
          if (!data?.chain || !pending.view || pending.mode !== "play") return;
          const view = adopt({ ...pending.view, chain: data.chain, chainPartial: false });
          publish({ ...pending, view });
        })
        .catch(() => {});
    }
    armChain();
  }, 15000);
}

function takeTitle(raw: TitleData): TitleData {
  raw.scenarios = raw.scenarios ?? [];
  raw.saves = raw.saves ?? [];
  raw.lines = raw.lines ?? [];
  raw.names = raw.names ?? [];
  raw.ages = raw.ages ?? [];
  raw.districts = raw.districts ?? [];
  return raw;
}

async function boot() {
  try {
    const titleRes = await fetch("/api/sim/title", { cache: "no-store", headers: simHeaders() });
    const title = titleRes.ok ? takeTitle(await titleRes.json() as TitleData) : takeTitle({ scenarios: [], saves: [], last: null });
    const view = await readView();
    if (view) {
      const next = adopt(view);
      publish({ ...pending, title, view: next, mode: "play" });
      return;
    }
    publish({ ...pending, title, mode: pending.mode === "progress" ? "progress" : "menu" });
  } catch {
    publish({ ...pending, title: takeTitle({ scenarios: [], saves: [], last: null }), mode: "menu", note: { ok: false, text: STOPPED + "\n" } });
  }
}

/** Connect the event stream and read whatever world is already open. Safe to call once. */
export function startSim(): () => void {
  if (started) return () => {};
  started = true;
  // A page that opens or reloads takes the game at once, whatever window held it before.
  void post("claim", {}).then(() => { startStream(); });
  armChain();
  void boot();
  return () => {};
}

export function useSimSnap(): SimSnap {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => snap, () => snap);
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch("/api/sim/" + path, {
      method: "POST",
      headers: simHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.status === 409 && data.taken === true) markTaken();
    if ((res.status === 502 || res.status === 503) && typeof data.error !== "string") data.error = STOPPED;
    if (typeof data.error === "string" && /failed to fetch|fetch failed/i.test(data.error)) data.error = STOPPED;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: STOPPED } };
  }
}

function takeLock(): boolean {
  if (acting) return false;
  acting = true;
  return true;
}
function dropLock() {
  acting = false;
}

function beginProgress(text: string, opts?: { fresh?: boolean }) {
  publish({
    ...pending,
    mode: "progress",
    gen: { text, lines: [], error: "" },
    layoutNonce: opts?.fresh ? pending.layoutNonce + 1 : pending.layoutNonce,
  });
}

export async function refreshTitle(): Promise<void> {
  try {
    const titleRes = await fetch("/api/sim/title", { cache: "no-store", headers: simHeaders() });
    if (!titleRes.ok) return;
    publish({ ...pending, title: takeTitle(await titleRes.json() as TitleData) });
  } catch { /* the menu keeps the list it has */ }
}

export async function startScenario(id: string, extra?: { cash?: number; difficulty?: number; again?: boolean; name?: string; age?: number; district?: string; past?: string; origin?: string }): Promise<void> {
  if (!takeLock()) {
    publish({ ...pending, note: { ok: false, text: BUSY_NOTE } });
    return;
  }
  try {
    beginProgress("Opening the harbour", { fresh: true });
    const body: Record<string, unknown> = { id };
    if (extra?.cash !== undefined) body.cash = extra.cash;
    if (extra?.difficulty !== undefined) body.difficulty = extra.difficulty;
    if (extra?.again) body.again = true;
    if (extra?.name) body.name = extra.name;
    if (extra?.age !== undefined) body.age = extra.age;
    if (extra?.district) body.district = extra.district;
    if (extra?.past) body.past = extra.past;
    if (extra?.origin) body.origin = extra.origin;
    const { ok, data } = await post("start", body);
    if (!ok) publish({ ...pending, gen: { ...pending.gen, error: typeof data.error === "string" ? data.error : "The city could not be opened, so try again." } });
  } finally { dropLock(); }
}

export async function startChallenge(code: string): Promise<void> {
  if (!takeLock()) {
    publish({ ...pending, note: { ok: false, text: BUSY_NOTE } });
    return;
  }
  try {
    beginProgress("Opening the harbour");
    const { ok, data } = await post("challenge", { code });
    if (!ok) publish({ ...pending, gen: { ...pending.gen, error: typeof data.error === "string" ? data.error : "The city could not be opened, so try again." } });
  } finally { dropLock(); }
}

export async function continueGame(): Promise<void> {
  if (!takeLock()) {
    publish({ ...pending, note: { ok: false, text: BUSY_NOTE } });
    return;
  }
  try {
    beginProgress("Reading the save…");
    const { ok, data } = await post("continue", {});
    const view = asView(data.view);
    if (!ok || !view) {
      publish({ ...pending, gen: { ...pending.gen, error: typeof data.error === "string" ? data.error : "There is no save to continue, so start a new city." } });
      return;
    }
    const next = adopt(view);
    publish({ ...pending, view: next, mode: "play" });
  } finally { dropLock(); }
}

export async function loadGame(id: string): Promise<void> {
  if (!takeLock()) {
    publish({ ...pending, note: { ok: false, text: BUSY_NOTE } });
    return;
  }
  try {
    beginProgress("Reading the save…");
    const { ok, data } = await post("load", { id });
    const view = asView(data.view);
    if (!ok || !view) {
      publish({ ...pending, gen: { ...pending.gen, error: typeof data.error === "string" ? data.error : "That save could not be opened, so pick another or start a new city." } });
      return;
    }
    const next = adopt(view);
    publish({ ...pending, view: next, mode: "play" });
  } finally { dropLock(); }
}

export function openGate(mode: GateMode) {
  publish({ ...pending, mode, gen: mode === "progress" ? pending.gen : { ...pending.gen, error: "" } });
}

export async function setSpeed(speed: SimView["speed"]): Promise<void> {
  if (!takeLock()) return;
  try {
    const word = speed === "pause" ? "Paused." : speed === "month" ? "A month is passing." : speed === "week" ? "A week is passing." : speed === "day" ? "A day is passing." : `Time runs at ${speed}.`;
    publish({ ...pending, note: { ok: true, text: word } });
    const { ok, data } = await post("speed", { speed });
    if (!ok) {
      publish({ ...pending, note: { ok: false, text: typeof data.error === "string" ? data.error : "The clock did not change, so try again." } });
      return;
    }
    const next = typeof data.speed === "string" && ["pause", "x1", "x2", "x5", "x10", "x25", "day", "week", "month"].includes(data.speed) ? (data.speed as SimView["speed"]) : speed;
    if (pending.view) {
      const view = adopt({ ...pending.view, speed: next, pause: next === "pause" ? pending.view.pause : null });
      publish({ ...pending, view, note: next === "pause" && speed !== "pause" ? null : pending.note });
    }
  } finally { dropLock(); }
}

const RESULT_TITLES: Record<string, string> = {
  help: "Help", homes: "Homes to rent or buy", sheet: "What you have and owe", jobs: "Who is hiring", news: "The news",
  desk: "The desk", mail: "Your letters", story: "Your story", chronicle: "The chronicle", quote: "Quote", hints: "Hints",
};
function titleOf(body: unknown): string | undefined {
  const b = body as { line?: unknown; kind?: unknown } | null;
  const word = typeof b?.line === "string" ? b.line.trim().split(/\s+/)[0]?.toLowerCase() : typeof b?.kind === "string" ? b.kind : "";
  if (!word) return undefined;
  return RESULT_TITLES[word] ?? word.charAt(0).toUpperCase() + word.slice(1);
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
  const loaded = asView(data.view);
  if (loaded) {
    const view = adopt(loaded);
    pending = { ...pending, view };
  }
  const note = { ...noteOf(ok, data), title: titleOf(body) };
  publish({ ...pending, note });
  return note;
}

export async function act(cmd: unknown): Promise<ActNote> {
  if (!takeLock()) return { ok: false, text: BUSY_NOTE };
  try { return await commitAct(cmd); }
  finally { dropLock(); }
}

export async function actLine(line: string): Promise<ActNote> {
  if (!takeLock()) return { ok: false, text: BUSY_NOTE };
  try { return await commitAct({ line }); }
  finally { dropLock(); }
}

export function clearNote(): void {
  if (pending.note) publish({ ...pending, note: null });
}

/** Drop the open world and return to the scenario list. */
export async function leaveGame(): Promise<void> {
  if (!takeLock()) return;
  try {
    await post("release", {});
    publish({ ...pending, mode: "menu", view: null, note: null });
  } finally { dropLock(); }
}

export interface ExplainLine { depth: number; id: number; day: number; kind: string; msg: string; name?: string; missing?: boolean }

export async function explain(id: number): Promise<ExplainLine[]> {
  try {
    const res = await fetch(`/api/sim/explain/${id}`, { cache: "no-store", headers: simHeaders() });
    if (!res.ok) return [];
    const data = await res.json() as { lines?: ExplainLine[] };
    return data.lines ?? [];
  } catch {
    return [];
  }
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
