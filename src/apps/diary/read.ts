// Plans as /view sends them. Pure: the diary, messages, people and society all read this.

export interface PlanWho { person: number; name: string; self: boolean }
export interface DiaryPlan {
  key: string;
  ask: number;
  msg: number;
  day: number;
  kind: string;
  title: string;
  place: string;
  who: PlanWho[];
  host: number;
  hostName: string;
  invite: boolean;
  open: boolean;
  status: string;
  cents: number;
  reason: string;
  said: string;
  fallout: string;
  came: string;
  cost: string;
  past: boolean;
  skipped: boolean;
  eventId: number;
  answer: string;
}

const KIND: Record<string, string> = {
  dinner: "Dinner", drinks: "Drinks", birthday: "Birthday", wedding: "Wedding", funeral: "Funeral",
  gala: "Gala", party: "Party", meeting: "Central bank", earnings: "Earnings", job: "Your job",
  loan: "Loan", deal: "A deal", leaving: "Leaving drinks", interview: "Interview", move: "Housewarming",
  fallout: "A falling out", application: "An application", course: "Your course",
};

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function flag(v: unknown): boolean {
  return v === true;
}

const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Quiet days as one line: "Jan 2–5: nothing planned". */
export function quietLabel(start: number, end: number): string {
  const md = (abs: number) => {
    const day = Math.floor(abs);
    const doy = ((day % 360) + 360) % 360;
    return { m: SHORT_MONTH[Math.floor(doy / 30)] ?? "Jan", d: (doy % 30) + 1 };
  };
  const a = md(start);
  const b = md(end);
  const when = start === end ? `${a.m} ${a.d}` : a.m === b.m ? `${a.m} ${a.d}\u2013${b.d}` : `${a.m} ${a.d}\u2013${b.m} ${b.d}`;
  return `${when}: nothing planned`;
}

export function kindWord(kind: string): string {
  return KIND[kind] ?? (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "A plan");
}

export function cleanTitle(title: string): string {
  return title
    .replace(/\s*You are invited\.?/g, "")
    .replace(/\s*You went\.?/g, "")
    .replace(/\s*You stayed away\.?/g, "")
    .replace(/\s*I'll get this one\.?/g, "")
    .trim();
}

const HANG = new Set(["a", "an", "the", "and", "or", "to", "of", "for", "at", "in", "on", "with", "who", "by", "from"]);

/** Cut at a word, never mid-name. */
export function clipWords(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  let cut = flat.slice(0, Math.max(1, max - 1));
  const sp = cut.lastIndexOf(" ");
  if (sp > 8) cut = cut.slice(0, sp);
  cut = cut.replace(/[\s,;:.–—-]+$/g, "");
  const parts = cut.split(" ");
  while (parts.length > 2 && HANG.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  const out = parts.join(" ").replace(/[\s,;:.–—-]+$/g, "");
  return out ? `${out}…` : `${flat.slice(0, Math.max(1, max - 1))}…`;
}

const QUIET_COST = /^(nothing|nothing to attend|nothing for you|nothing more to pay|it costs nothing|it cost nothing|it cost you nothing)\.?$/i;
const CIVIC = new Set(["earnings", "meeting", "job", "loan", "course", "application"]);

export function showWho(plan: DiaryPlan): boolean {
  return plan.who.some((w) => w.person >= 0 && !w.self);
}

export function namedWho(plan: DiaryPlan): PlanWho[] {
  return plan.who.filter((w) => w.person >= 0);
}

export function showPlace(plan: DiaryPlan): boolean {
  return !!plan.place && !CIVIC.has(plan.kind);
}

export function showReason(plan: DiaryPlan): boolean {
  const r = plan.reason.trim();
  return !!r && r !== "It is on the books.";
}

export function costOnce(plan: DiaryPlan): string {
  const blob = `${plan.title} ${plan.cost} ${plan.said}`;
  if (/I'll get this one/i.test(blob)) return "I'll get this one.";
  if (plan.kind === "earnings" || plan.kind === "meeting" || plan.kind === "course" || plan.kind === "application" || plan.kind === "fallout" || plan.kind === "interview") return "";
  const cost = plan.cost.trim();
  if (!cost || QUIET_COST.test(cost)) return "";
  return cost;
}

export function parsePlans(raw: unknown): DiaryPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: DiaryPlan[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const p = row as Record<string, unknown>;
    const day = num(p.day, -1);
    if (day < 0) continue;
    const who = Array.isArray(p.who) ? p.who.flatMap((w) => {
      if (!w || typeof w !== "object") return [];
      const r = w as Record<string, unknown>;
      const name = str(r.name);
      if (!name) return [];
      return [{ person: num(r.person, -1), name, self: flag(r.self) }];
    }) : [];
    out.push({
      key: str(p.key) || `${str(p.kind)}:${day}:${num(p.ask, -1)}`,
      ask: num(p.ask, -1),
      msg: num(p.msg, -1),
      day,
      kind: str(p.kind),
      title: str(p.title),
      place: str(p.place),
      who,
      host: num(p.host, -1),
      hostName: str(p.hostName),
      invite: flag(p.invite),
      open: flag(p.open),
      status: str(p.status),
      cents: num(p.cents),
      reason: str(p.reason),
      said: str(p.said),
      fallout: str(p.fallout),
      came: str(p.came),
      cost: str(p.cost),
      past: flag(p.past),
      skipped: flag(p.skipped),
      eventId: num(p.eventId, -1),
      answer: str(p.answer),
    });
  }
  return out;
}

/** This week and the next four, from the week's start. */
export function diaryWindow(abs: number): { start: number; end: number } {
  const day = Number.isFinite(abs) ? Math.floor(abs) : 0;
  const start = day - (day % 7);
  return { start, end: start + 35 };
}

export function plansFor(plans: DiaryPlan[], index: number): DiaryPlan[] {
  return plans
    .filter((p) => p.host === index || p.who.some((w) => w.person === index))
    .filter((p) => p.open || p.answer || p.invite)
    .sort((a, b) => Number(b.open) - Number(a.open) || a.day - b.day)
    .slice(0, 4);
}

export function planForMessage(plans: DiaryPlan[], message: { id: number; requestId: number }): DiaryPlan | undefined {
  return plans.find((p) => (p.msg >= 0 && p.msg === message.id) || (message.requestId >= 0 && p.ask === message.requestId));
}

export function answerCmd(plan: DiaryPlan, yes: boolean): Record<string, unknown> {
  return { kind: yes ? "accept" : "decline", id: plan.ask, msg: plan.msg };
}
