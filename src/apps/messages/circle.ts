// The circle as /view sends it. Threads, pending asks, and the bond on each contact.
export interface BondWhy { day: number; delta: number; text: string; eventId: number }
export interface TogetherNote { day: number; text: string; eventId: number }
export interface CircleMsg {
  id: number;
  day: number;
  text: string;
  eventId: number;
  source: number;
  requestId: number;
  /** A letter the player wrote. */
  mine?: boolean;
  /** A journalist's request for comment. A reply is the comment, not a yes or no. */
  press?: boolean;
  /** The request a press reply answers. */
  pressId?: number;
}
export interface CircleThread {
  who: number;
  name: string;
  role: string;
  stance: string;
  messages: CircleMsg[];
}
export interface CircleAsk {
  id: number;
  msg: number;
  from: number;
  name: string;
  role: string;
  kind: string;
  day: number;
  status: string;
  cents: number;
  place: string;
  other: number;
  otherName: string;
  eventId: number;
  note: string;
  actions: string[];
  /** Day the ask lapses. Absent on an older view; invite is 21 days, a loan 90. */
  due: number;
}
export interface CircleContact {
  slot: number;
  who: number;
  name: string;
  kind: string;
  word: string;
  line: string;
  sentence?: string;
  role: string;
  stance: string;
  job?: string;
  bond: { word: string; score: number; why: BondWhy[] };
  together: TogetherNote[];
}
export interface CircleSnap {
  abs: number;
  name: string;
  cash: number;
  firm: string;
  threads: CircleThread[];
  pending: CircleAsk[];
  contacts: CircleContact[];
  firms: { id: string; name: string }[];
  homes: { neighbourhood?: string; owner?: { index: number; name: string } | null }[];
}
export interface LocalReply { key: string; who: number; afterId: number; text: string; day: number }

const CLOSE = new Set(["Close", "Warm", "Confides", "Trusts you"]);

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function whyList(v: unknown): BondWhy[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    return [{ day: num(r.day), delta: num(r.delta), text: str(r.text), eventId: num(r.eventId, -1) }];
  });
}
function notes(v: unknown): TogetherNote[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    return [{ day: num(r.day), text: str(r.text), eventId: num(r.eventId, -1) }];
  });
}

export function readCircle(life: unknown): CircleSnap | null {
  if (!life || typeof life !== "object") return null;
  const v = life as Record<string, unknown>;
  const date = v.date as { abs?: unknown } | undefined;
  if (!date || typeof date.abs !== "number") return null;
  const inbox = (v.inbox && typeof v.inbox === "object" ? v.inbox : {}) as Record<string, unknown>;
  const threads = Array.isArray(inbox.threads) ? inbox.threads.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const t = row as Record<string, unknown>;
    const messages = Array.isArray(t.messages) ? t.messages.flatMap((m) => {
      if (!m || typeof m !== "object") return [];
      const msg = m as Record<string, unknown>;
      return [{
        id: num(msg.id, -1),
        day: num(msg.day),
        text: str(msg.text),
        eventId: num(msg.eventId, -1),
        source: num(msg.source, -1),
        requestId: num(msg.requestId, -1),
        mine: msg.mine === true,
      }];
    }) : [];
    return [{
      who: num(t.who, -1),
      name: str(t.name),
      role: str(t.role) || "colleague",
      stance: str(t.stance),
      messages,
    }];
  }) : [];
  const pending = Array.isArray(inbox.pending) ? inbox.pending.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const a = row as Record<string, unknown>;
    if (str(a.status) && str(a.status) !== "pending") return [];
    return [{
      id: num(a.id, -1),
      msg: num(a.msg, -1),
      from: num(a.from, -1),
      name: str(a.name),
      role: str(a.role) || "colleague",
      kind: str(a.kind),
      day: num(a.day),
      status: str(a.status) || "pending",
      cents: num(a.cents),
      place: str(a.place),
      other: num(a.other, -1),
      otherName: str(a.otherName),
      eventId: num(a.eventId, -1),
      note: str(a.note),
      actions: Array.isArray(a.actions) ? a.actions.filter((x): x is string => typeof x === "string") : [],
      due: num(a.due, num(a.day) + (str(a.kind) === "invite" ? 21 : 90)),
    }];
  }) : [];
  const contacts = Array.isArray(v.contacts) ? v.contacts.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const c = row as Record<string, unknown>;
    const bond = (c.bond && typeof c.bond === "object" ? c.bond : {}) as Record<string, unknown>;
    const who = num(c.who, -1);
    if (who < 0 || !str(c.name)) return [];
    return [{
      slot: num(c.slot, -1),
      who,
      name: str(c.name),
      kind: str(c.kind),
      word: str(c.word),
      line: str(c.line),
      sentence: str(c.sentence) || undefined,
      role: str(c.role) || (str(c.kind) === "family" ? "family" : "colleague"),
      stance: str(c.stance),
      job: str(c.job) || undefined,
      bond: { word: str(bond.word) || str(c.word), score: num(bond.score), why: whyList(bond.why) },
      together: notes(c.together),
    }];
  }) : [];
  const firms = Array.isArray(v.firms) ? v.firms.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const f = row as Record<string, unknown>;
    const id = str(f.id);
    if (!id) return [];
    return [{ id, name: str(f.name) || id }];
  }) : [];
  const homes = Array.isArray(v.homes) ? v.homes.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const h = row as Record<string, unknown>;
    const owner = h.owner && typeof h.owner === "object"
      ? { index: num((h.owner as Record<string, unknown>).index, -1), name: str((h.owner as Record<string, unknown>).name) }
      : null;
    return [{ neighbourhood: str(h.neighbourhood), owner }];
  }) : [];
  return {
    abs: date.abs,
    name: str(v.name),
    cash: num(v.cash),
    firm: str(v.firm),
    threads,
    pending,
    contacts,
    firms,
    homes,
  };
}

export interface PressAsk {
  request: number;
  eventId: number;
  day: number;
  until: number;
  open: boolean;
  journalist: string;
  journalistIndex: number;
  outlet: string;
  voice: string;
  about: string;
  stance: string;
  said: string;
}

export function readPress(raw: unknown): PressAsk[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const a = row as Record<string, unknown>;
    const journalist = str(a.journalist);
    if (!journalist) return [];
    return [{
      request: num(a.request, -1),
      eventId: num(a.eventId, -1),
      day: num(a.day),
      until: num(a.until),
      open: a.open === true,
      journalist,
      journalistIndex: num(a.journalistIndex, -1),
      outlet: str(a.outlet) || "The paper",
      voice: str(a.voice),
      about: str(a.about),
      stance: str(a.stance),
      said: str(a.said),
    }];
  });
}

function pressMessage(ask: PressAsk): CircleMsg {
  const text = ask.open
    ? `${ask.journalist} of ${ask.outlet} asks for comment on ${ask.about}. A sentence is the comment.`
    : `${ask.journalist} of ${ask.outlet} asked for comment on ${ask.about}`;
  return {
    id: -(ask.eventId + 1),
    day: ask.day,
    text,
    eventId: ask.eventId,
    source: ask.eventId,
    requestId: -1,
    press: ask.open,
    pressId: ask.request,
  };
}

/** Threads plus any journalist who has asked for comment. */
export function withPress(threads: CircleThread[], asks: PressAsk[]): CircleThread[] {
  const seen = new Set(threads.map((t) => t.who));
  const extra: CircleThread[] = [];
  for (const ask of asks) {
    if (ask.journalistIndex < 0 || seen.has(ask.journalistIndex)) continue;
    seen.add(ask.journalistIndex);
    extra.push({
      who: ask.journalistIndex,
      name: ask.journalist,
      role: "journalist",
      stance: ask.outlet,
      messages: [pressMessage(ask)],
    });
  }
  const merged = threads.map((t) => {
    const ask = asks.find((a) => a.journalistIndex === t.who);
    if (!ask || t.messages.some((m) => m.id === -(ask.eventId + 1))) return t;
    return {
      ...t,
      role: t.role === "family" ? t.role : "journalist",
      stance: t.stance || ask.outlet,
      messages: [...t.messages, pressMessage(ask)],
    };
  });
  return [...extra, ...merged];
}

export function roleWord(role: string, stance = ""): string {
  const base = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Someone";
  if (stance && stance !== role) return `${base} · ${stance}`;
  return base;
}

export function initial(name: string): string {
  const first = name.trim().split(/\s+/)[0] || "?";
  return first.slice(0, 1).toUpperCase();
}

export function moneyLabel(cents: number): string {
  const n = Math.abs(Math.round(cents)) / 100;
  const body = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? "−" : ""}$${body}`;
}

export function slotOf(contacts: CircleContact[], who: number): number {
  return contacts.find((c) => c.who === who)?.slot ?? -1;
}

export function contactOf(contacts: CircleContact[], who: number): CircleContact | undefined {
  return contacts.find((c) => c.who === who);
}

export function isClose(role: string, word: string): boolean {
  if (role === "rival") return false;
  return CLOSE.has(word);
}

/** The bond tier as the player reads it. The sim keeps "Close" as its key; the screen says "Close friend" so it is not the Close button. */
export function tierWord(word: string): string {
  return word === "Close" ? "Close friend" : word;
}

export function isRivalMove(role: string, text: string): boolean {
  if (role === "rival") return true;
  return /short|your name is the one falling|bid for a /i.test(text);
}

/** A family loan is someone in trouble with a clock on it. The bar also lists invitations. */
export function familyTrouble(snap: CircleSnap): CircleAsk | null {
  for (const ask of snap.pending) {
    if (ask.role !== "family" || ask.kind !== "loan") continue;
    return ask;
  }
  return null;
}

/** An invitation or a loan still waiting, soonest deadline first. */
export function waitingOn(snap: CircleSnap): CircleAsk[] {
  return snap.pending
    .filter((a) => a.kind === "invite" || a.kind === "loan")
    .slice()
    .sort((a, b) => a.due - b.due || a.id - b.id);
}

/** Family, or a friend the bond already calls close, stops the clock. */
export function pausesClock(ask: CircleAsk, snap: CircleSnap): boolean {
  if (ask.kind !== "invite" && ask.kind !== "loan") return false;
  if (ask.role === "family") return true;
  if (ask.role !== "friend") return false;
  const person = snap.contacts.find((c) => c.who === ask.from);
  return isClose(ask.role, person?.bond.word || person?.word || "");
}

export function deadlineWord(abs: number, due: number): string {
  const left = due - abs;
  if (left <= 0) return "The deadline has passed";
  if (left === 1) return "Due tomorrow";
  if (left < 14) return `${left} days left`;
  if (left < 40) return "A few weeks left";
  if (left < 100) return "Due this season";
  return "Due this half year";
}

export function askTitle(ask: CircleAsk): string {
  if (ask.kind === "loan") return "A loan";
  if (ask.kind === "invite") return ask.place ? `A ${ask.place}` : "An invitation";
  return "A request";
}

export function placeWord(place: string): string {
  if (place === "gala" || place === "club" || place === "dinner") return place;
  return "dinner";
}

export interface AskButton {
  id: string;
  label: string;
  testId: string;
  kind: "lend" | "accept" | "yes" | "decline";
  cents: number;
  place: string;
}

export function askButtons(ask: CircleAsk): AskButton[] {
  const lend = ask.actions.find((a) => a.startsWith("lend "));
  const invite = ask.actions.find((a) => a.startsWith("invite "));
  const buttons: AskButton[] = [];
  if (ask.kind === "loan" || lend) {
    const dollars = lend ? Number(lend.slice(5)) : ask.cents / 100;
    const cents = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : ask.cents;
    buttons.push({ id: "lend", label: "Lend", testId: "lend-send", kind: "lend", cents, place: "" });
  } else if (ask.kind === "invite" || invite) {
    const place = placeWord(invite ? invite.slice(7).trim() : ask.place);
    buttons.push({ id: "accept", label: "Accept", testId: "accept-invite", kind: "accept", cents: ask.cents, place });
  } else if (ask.kind === "intro") {
    buttons.push({
      id: "meet",
      label: ask.otherName ? `Meet ${ask.otherName}` : "Meet them",
      testId: "accept-intro",
      kind: "yes",
      cents: 0,
      place: "",
    });
  } else {
    buttons.push({ id: "yes", label: "Yes", testId: "ask-yes", kind: "yes", cents: ask.cents, place: "" });
  }
  buttons.push({ id: "no", label: "Decline", testId: "ask-decline", kind: "decline", cents: 0, place: "" });
  return buttons;
}

function inviteAsk(ask: CircleAsk): boolean {
  return ask.kind === "invite" || ask.actions.some((a) => a.startsWith("invite "));
}

export function commandFor(ask: CircleAsk, button: AskButton, slot: number, cents: number): Record<string, unknown> {
  if (button.kind === "decline") {
    if (inviteAsk(ask)) return { kind: "decline", id: ask.id, msg: ask.msg };
    return { kind: "reply", msg: ask.msg, text: "no" };
  }
  if (button.kind === "lend") {
    if (ask.kind === "loan" && Math.abs(cents - button.cents) < 2) return { kind: "reply", msg: ask.msg, text: "yes" };
    return { kind: "lend", slot, cents };
  }
  if (button.kind === "accept") return { kind: "accept", id: ask.id, msg: ask.msg };
  if (button.kind === "yes") return { kind: "reply", msg: ask.msg, text: "yes" };
  return { kind: "reply", msg: ask.msg, text: "yes" };
}

export function askForMessage(pending: CircleAsk[], message: CircleMsg): CircleAsk | undefined {
  return pending.find((a) => a.msg === message.id || (message.requestId >= 0 && a.id === message.requestId));
}
