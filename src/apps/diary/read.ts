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

export function kindWord(kind: string): string {
  return KIND[kind] ?? (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "A plan");
}

export function cleanTitle(title: string): string {
  return title.replace(/\s*You are invited\.?/g, "").replace(/\s*You went\.?/g, "").replace(/\s*You stayed away\.?/g, "").trim();
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
