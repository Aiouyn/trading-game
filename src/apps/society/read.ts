// Read the society view and mirror the calendar the simulation already keeps.
// Months are 30 days, years 360. The server calendar is the next 60 days only,
// so a month grid also plans days that have already passed.

export interface RichRow {
  rank: number;
  person: number;
  name: string;
  worth: number;
  change: number;
  why: string;
  eventId: number;
}
export interface RankView {
  person: number;
  name: string;
  worth: number;
  nextPerson: number;
  next: string;
  gap: number;
  ahead: boolean;
  rank: number;
  households: number;
  eventId: number;
}
export interface PowerRow {
  person: number;
  name: string;
  role: string;
  standing: number;
  word: string;
  eventId: number;
}
export interface StandingWhy { day: number; kind: string; delta: number; text: string; eventId: number }
export interface Standing {
  score: number;
  word: string;
  line: string;
  whys: StandingWhy[];
  eventId: number;
}
export interface Story {
  day: number;
  person: number;
  name: string;
  dir: "rise" | "fall";
  change: number;
  worth: number;
  text: string;
  eventId: number;
}
export interface Society {
  rich: RichRow[];
  rank: RankView | null;
  powerful: PowerRow[];
  standing: Standing | null;
  stories: Story[];
  marketsOpen: boolean;
}
export interface CalItem { kind: string; title: string; eventId: number }
export interface CalDay {
  day: number;
  year: number;
  month: number;
  date: number;
  closed: boolean;
  items: CalItem[];
}
export interface Door { who: number; name: string; come: boolean; line: string }
export interface TextBit { kind: "text" | "firm"; text: string; id?: string }
export interface FirmName { id: string; name: string }

const HOLIDAY: Record<number, string> = {
  0: "New Year. The exchange is closed",
  120: "Founding Day. The exchange is closed",
  195: "The harbour festival. The exchange is closed",
  240: "Harvest. The exchange is closed",
  354: "Christmas. The exchange is closed",
  359: "The year's last day. The exchange is closed",
};

function num(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? v as Record<string, unknown> : null;
}

export function parseSociety(raw: unknown): Society | null {
  const o = rec(raw);
  if (!o) return null;
  const rich = Array.isArray(o.rich) ? o.rich.flatMap((row) => {
    const r = rec(row);
    if (!r || typeof r.person !== "number") return [];
    const item: RichRow = {
      rank: num(r.rank),
      person: r.person,
      name: str(r.name),
      worth: num(r.worth),
      change: num(r.change),
      why: str(r.why),
      eventId: num(r.eventId, -1),
    };
    return [item];
  }) : [];
  const rankRaw = rec(o.rank);
  const rank: RankView | null = rankRaw ? {
    person: num(rankRaw.person, -1),
    name: str(rankRaw.name),
    worth: num(rankRaw.worth),
    nextPerson: num(rankRaw.nextPerson, -1),
    next: str(rankRaw.next),
    gap: num(rankRaw.gap),
    ahead: rankRaw.ahead === true,
    rank: num(rankRaw.rank),
    households: num(rankRaw.households),
    eventId: num(rankRaw.eventId, -1),
  } : null;
  const powerful = Array.isArray(o.powerful) ? o.powerful.flatMap((row) => {
    const r = rec(row);
    if (!r || typeof r.person !== "number") return [];
    const item: PowerRow = {
      person: r.person,
      name: str(r.name),
      role: str(r.role),
      standing: num(r.standing),
      word: str(r.word),
      eventId: num(r.eventId, -1),
    };
    return [item];
  }) : [];
  const st = rec(o.standing);
  const standing: Standing | null = st ? {
    score: num(st.score),
    word: str(st.word) || "Thin",
    line: str(st.line),
    eventId: num(st.eventId, -1),
    whys: Array.isArray(st.whys) ? st.whys.flatMap((row) => {
      const w = rec(row);
      if (!w) return [];
      const item: StandingWhy = { day: num(w.day), kind: str(w.kind), delta: num(w.delta), text: str(w.text), eventId: num(w.eventId, -1) };
      return [item];
    }) : [],
  } : null;
  const stories = Array.isArray(o.stories) ? o.stories.flatMap((row) => {
    const r = rec(row);
    if (!r || typeof r.person !== "number") return [];
    const item: Story = {
      day: num(r.day),
      person: r.person,
      name: str(r.name),
      dir: r.dir === "fall" ? "fall" : "rise",
      change: num(r.change),
      worth: num(r.worth),
      text: str(r.text),
      eventId: num(r.eventId, -1),
    };
    return [item];
  }) : [];
  return { rich, rank, powerful, standing, stories, marketsOpen: o.marketsOpen !== false };
}

export function parseCalendar(raw: unknown): CalDay[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((row) => {
    const r = rec(row);
    if (!r || typeof r.day !== "number") return [];
    const item: CalDay = {
      day: r.day,
      year: num(r.year),
      month: num(r.month),
      date: num(r.date),
      closed: r.closed === true,
      items: Array.isArray(r.items) ? r.items.flatMap((it) => {
        const x = rec(it);
        if (!x) return [];
        const line: CalItem = { kind: str(x.kind), title: str(x.title), eventId: num(x.eventId, -1) };
        return [line];
      }) : [],
    };
    return [item];
  });
}

function planDay(day: number): { closed: boolean; items: { kind: string; title: string }[] } {
  const doy = ((day % 360) + 360) % 360;
  const dom = doy % 30;
  const moy = Math.floor(doy / 30);
  const absM = Math.floor(day / 30);
  const items: { kind: string; title: string }[] = [];
  const closed = HOLIDAY[doy] !== undefined;
  if (closed) items.push({ kind: "society.holiday", title: HOLIDAY[doy] });
  if (dom === 29) items.push({ kind: "society.meeting", title: "The central bank meets" });
  if (moy % 3 === 0 && dom <= 6) items.push({ kind: "society.earnings", title: dom === 0 ? "Earnings season opens" : "Earnings season" });
  if (moy === 3 && dom === 14) items.push({ kind: "society.tax", title: "Tax returns are due" });
  if (moy === 6 && dom === 14) items.push({ kind: "society.festival", title: "The harbour festival opens on the quay" });
  if (moy === 6 && dom === 15) items.push({ kind: "society.meet", title: "Notable people meet at the harbour festival" });
  if (moy === 6 && dom === 16) items.push({ kind: "society.festival", title: "The last day of the harbour festival" });
  if (moy === 11 && dom === 18) {
    items.push({ kind: "society.gala", title: "The charity gala" });
    items.push({ kind: "society.meet", title: "Notable people meet at the charity gala" });
  }
  if (absM >= 47 && absM % 48 === 47 && dom === 14) items.push({ kind: "society.election", title: "Election day" });
  if (absM % 48 === 36 && dom === 0) items.push({ kind: "society.campaign", title: "The campaign opens" });
  if (absM % 48 >= 36 && absM % 48 < 47 && dom === 9) items.push({ kind: "society.campaign", title: "A campaign rally" });
  return { closed, items };
}

function stamp(day: number, plan: { closed: boolean; items: { kind: string; title: string }[] }, eventIds: number[]): CalDay {
  const doy = ((day % 360) + 360) % 360;
  return {
    day,
    year: Math.floor(day / 360),
    month: Math.floor(doy / 30) + 1,
    date: (doy % 30) + 1,
    closed: plan.closed,
    items: plan.items.map((item, i) => ({ kind: item.kind, title: item.title, eventId: eventIds[i] ?? -1 })),
  };
}

export function monthDays(abs: number, calendar: CalDay[] | null): CalDay[] {
  const start = abs - ((abs % 30) + 30) % 30;
  const by = new Map((calendar ?? []).map((d) => [d.day, d]));
  const out: CalDay[] = [];
  for (let i = 0; i < 30; i++) {
    const day = start + i;
    const plan = planDay(day);
    const server = by.get(day);
    const ids = server ? server.items.map((it) => it.eventId) : [];
    const row = stamp(day, plan, ids);
    if (server) row.closed = server.closed;
    out.push(row);
  }
  return out;
}

function ahead(abs: number, n: number): CalDay[] {
  const out: CalDay[] = [];
  for (let i = 0; i < n; i++) out.push(stamp(abs + i, planDay(abs + i), []));
  return out;
}

function phraseOf(title: string): string {
  let t = title.replace(/^The /, "");
  const dot = t.indexOf(".");
  if (dot > 0) t = t.slice(0, dot);
  t = t.trim();
  if (!t) return title;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const FILLER = new Set(["Earnings season"]);

export function chipText(abs: number, calendar: CalDay[] | null): string {
  const fromServer = calendar?.some((d) => d.day >= abs) ? calendar.filter((d) => d.day >= abs) : null;
  const days = (fromServer && fromServer.length ? fromServer : ahead(abs, 60)).slice().sort((a, b) => a.day - b.day);
  for (const d of days) {
    const item = d.items.find((it) => it.title && !FILLER.has(it.title));
    if (!item) continue;
    const phrase = phraseOf(item.title);
    const n = d.day - abs;
    if (n <= 0) return `${phrase} today`;
    if (n === 1) return `${phrase} in 1 day`;
    return `${phrase} in ${n} days`;
  }
  return "";
}

export function holidayReason(abs: number, calendar: CalDay[] | null): string {
  const day = Math.floor(abs);
  const known = calendar?.find((d) => d.day === day);
  if (known) {
    if (!known.closed) return "";
    return known.items.find((i) => i.kind === "society.holiday")?.title || "The exchange is closed";
  }
  const doy = ((day % 360) + 360) % 360;
  return HOLIDAY[doy] ?? "";
}

export function rankWord(rank: number, households: number): string {
  if (rank <= 0) return "Unranked";
  if (rank === 1) return "The richest";
  if (rank <= 10) return "Near the top";
  if (households > 0 && rank / households <= 0.1) return "High";
  if (households > 0 && rank / households < 0.4) return "Comfortable";
  return "Further down";
}

export function opensLine(score: number): string {
  if (score >= 72) return "Office will sit with you, and so will anyone with a seat.";
  if (score >= 66) return "Heads of banks will sit with you. Office still will not.";
  if (score >= 64) return "Chief executives will sit with you. Bank heads and office still will not.";
  if (score >= 58) return "The top of the rich list will sit with you.";
  if (score >= 52) return "Landlords will sit with you. The top of the rich list still will not.";
  if (score >= 48) return "Most of the rich list will sit with you.";
  if (score >= 18) return "People with no seat will sit with you. The powerful still will not.";
  return "Only family will come.";
}

function roleBar(role: string): number {
  if (/government|finance seat|central bank|regulator/i.test(role)) return 72;
  if (/^head of /i.test(role)) return 66;
  if (/^chief executive of /i.test(role)) return 64;
  if (/landlord/i.test(role)) return 52;
  return 0;
}

export function barFor(person: number, rich: RichRow[], powerful: PowerRow[]): number {
  let bar = 0;
  const row = rich.find((r) => r.person === person);
  if (row) bar = row.rank <= 10 ? 58 : 48;
  const seat = powerful.find((p) => p.person === person);
  if (seat) bar = Math.max(bar, roleBar(seat.role));
  return bar;
}

export function acceptLine(score: number, family: boolean, bar: number): { come: boolean; line: string } {
  if (family) return { come: true, line: "They will come, and they will make an introduction." };
  if (score < 18) return { come: false, line: "Your name is too thin. They will not come." };
  if (score < bar) return { come: false, line: "They will not sit with you." };
  return { come: true, line: "They will come, and they will make an introduction." };
}

export function doorsOf(
  score: number,
  rich: RichRow[],
  powerful: PowerRow[],
  contacts: { who?: number; name: string; kind?: string }[],
): { come: Door[]; stay: Door[] } {
  const come: Door[] = [];
  const stay: Door[] = [];
  const seen = new Set<number>();
  for (const c of contacts) {
    if (typeof c.who !== "number" || c.who < 0 || !c.name || seen.has(c.who)) continue;
    seen.add(c.who);
    const door = acceptLine(score, c.kind === "family", barFor(c.who, rich, powerful));
    const row: Door = { who: c.who, name: c.name, come: door.come, line: door.line };
    (door.come ? come : stay).push(row);
  }
  return { come, stay };
}

export function powerGroups(rows: PowerRow[]): { title: string; rows: PowerRow[] }[] {
  const office: PowerRow[] = [];
  const firms: PowerRow[] = [];
  const land: PowerRow[] = [];
  for (const row of rows) {
    if (/government|finance seat|central bank|regulator/i.test(row.role)) office.push(row);
    else if (/chief executive|^head of /i.test(row.role)) firms.push(row);
    else land.push(row);
  }
  return [
    { title: "Office", rows: office },
    { title: "Firms", rows: firms },
    { title: "Land", rows: land },
  ].filter((g) => g.rows.length);
}

export function monthStories(stories: Story[], abs: number): Story[] {
  if (!stories.length) return [];
  const latest = stories.reduce((m, s) => Math.max(m, s.day), 0);
  const recent = stories.filter((s) => s.day <= abs && abs - s.day < 30);
  const batch = recent.length ? recent : stories.filter((s) => s.day === latest);
  return batch.slice().sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.person - b.person);
}

export function roleFirm(role: string): string | null {
  const m = /^(?:chief executive of |head of )(.+)$/.exec(role);
  return m ? m[1] : null;
}

export function linkFirms(text: string, firms: FirmName[]): TextBit[] {
  const names = firms.filter((f) => f.name.length > 1).slice().sort((a, b) => b.name.length - a.name.length);
  const out: TextBit[] = [];
  let i = 0;
  while (i < text.length) {
    const hit = names.find((f) => text.startsWith(f.name, i));
    if (hit) {
      out.push({ kind: "firm", text: hit.name, id: hit.id });
      i += hit.name.length;
      continue;
    }
    let j = i + 1;
    while (j < text.length && !names.some((f) => text.startsWith(f.name, j))) j++;
    out.push({ kind: "text", text: text.slice(i, j) });
    i = j;
  }
  return out;
}

export function shortMoney(cents: number): string {
  const n = Math.round(cents) / 100;
  const sign = n < 0 ? "\u2212" : n > 0 ? "+" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}m`;
  if (a >= 10_000) return `${sign}$${Math.round(a / 1000)}k`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}

interface CityView {
  name: string;
  date: { abs: number };
  speed?: string;
  society?: unknown;
  calendar?: unknown;
  news?: { eventId: number; day: number; text: string }[];
}

interface Mem {
  player: string;
  day: number;
  lines: string[];
  seen: Set<string>;
  roles: Map<string, string>;
  seeded: boolean;
}

let mem: Mem = { player: "", day: -1, lines: [], seen: new Set(), roles: new Map(), seeded: false };

function pushLine(key: string, line: string): void {
  if (!line || mem.seen.has(key)) return;
  mem.seen.add(key);
  mem.lines.push(line);
  if (mem.lines.length > 24) mem.lines.splice(0, mem.lines.length - 24);
}

function resetMem(player: string, day: number): void {
  mem = { player, day, lines: [], seen: new Set(), roles: new Map(), seeded: false };
}

/** Notable moves shared by the Wire and the phone home. Idempotent across mounts. */
export function noteCity(view: CityView | null): string[] {
  if (!view) return mem.lines;
  if (view.name !== mem.player || view.date.abs + 5 < mem.day) resetMem(view.name, view.date.abs);
  const soc = parseSociety(view.society);
  const cal = parseCalendar(view.calendar);
  const abs = view.date.abs;
  if (soc && !mem.seeded) {
    for (const p of soc.powerful) mem.roles.set(String(p.person), p.role);
    const ranked = soc.rich.filter((r) => r.change).slice().sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const top = new Set(ranked.slice(0, 3).map((r) => r.person));
    for (const r of ranked) {
      const key = `rich:${r.person}:${r.change}`;
      const verb = r.change > 0 ? "rose" : "fell";
      if (top.has(r.person)) pushLine(key, `${r.name} ${verb} on the rich list, on ${r.why}`);
      else mem.seen.add(key);
    }
    const stories = soc.stories.filter((s) => abs - s.day <= 40 && abs - s.day >= 0)
      .slice().sort((a, b) => a.day - b.day || Math.abs(a.change) - Math.abs(b.change));
    for (const s of stories) pushLine(`story:${s.eventId}`, s.text);
    mem.seeded = true;
  } else if (soc) {
    for (const p of soc.powerful) {
      const key = String(p.person);
      const prev = mem.roles.get(key);
      if (prev && prev !== p.role && /chief executive of |head of /.test(p.role)) {
        pushLine(`role:${key}:${p.role}`, `${p.name} is the new ${p.role}`);
      }
      mem.roles.set(key, p.role);
    }
    for (const r of soc.rich) {
      if (!r.change) continue;
      const verb = r.change > 0 ? "rose" : "fell";
      pushLine(`rich:${r.person}:${r.change}`, `${r.name} ${verb} on the rich list, on ${r.why}`);
    }
    for (const s of soc.stories) pushLine(`story:${s.eventId}`, s.text);
  }
  if (cal) {
    for (const d of cal) {
      if (d.day > abs || abs - d.day > 2) continue;
      for (const item of d.items) {
        if (!item.title || FILLER.has(item.title)) continue;
        if (!/gala|festival|meet|holiday|election|meeting|campaign/i.test(item.kind + item.title)) continue;
        pushLine(`cal:${d.day}:${item.kind}:${item.title}`, item.title);
      }
    }
  }
  for (const n of view.news ?? []) {
    if (/chief executive/i.test(n.text)) pushLine(`news:${n.eventId}`, n.text);
  }
  mem.day = abs;
  return mem.lines;
}
