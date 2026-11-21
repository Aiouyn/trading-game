"use client";
// Why? for a story: the causes in the order they happened (a rumour, then the decision, then the price), each named for
// what it is, and what the story led to. The story's own headline is never repeated, and no line says its outlet twice.
import { useEffect, useState } from "react";
import { gameDate, presentNote, seedDebug } from "@/components/ui/format";
import { moveWords, splitDrivers } from "@/apps/research/drivers";

interface Line { depth: number; id: number; day: number; kind: string; msg: string; name?: string; missing?: boolean }
interface Effect { id: number; day: number; kind: string; msg: string }

const RUMOUR = /^(rumour\b|sources say\b)|\bunchecked\b|\bwhisper\b/i;

/** "The Daily Herald: The Daily Herald: the story — Ana Fell, rates" reads "the story". */
function clean(msg: string, name?: string): string {
  let t = msg.replace(/\s+[—-]\s+[^—-]+$/, "").trim();
  if (name && t.toLowerCase().startsWith(`${name.toLowerCase()}: `)) t = t.slice(name.length + 2);
  for (let i = 0; i < 3; i++) {
    const next = t.replace(/^(?:The )?[A-Z][\w'&., -]{1,42}:\s+/, "");
    if (next === t || next.length < 8) break;
    t = next;
  }
  return presentNote(t);
}

function stepWord(kind: string, msg: string): string {
  if (kind.startsWith("media.") || kind === "news.story") return RUMOUR.test(msg) ? "Rumour" : /^correction\b/i.test(msg) ? "Correction" : "Story";
  if (kind === "cb.rate" || kind === "cb.hold" || kind === "cb.desk") return "Decision";
  if (kind === "mkt.news") return "Forecast";
  if (kind.startsWith("mkt.")) return "Price";
  if (kind.startsWith("shock.") || kind.startsWith("energy.")) return "Event";
  if (kind.startsWith("macro.")) return "Data";
  if (kind.startsWith("earnings.")) return "Results";
  if (kind.startsWith("firm.")) return "Company";
  if (kind.startsWith("society.")) return "Calendar";
  if (kind.startsWith("labour.")) return "Labour";
  if (kind.startsWith("law.") || kind.startsWith("court.")) return "Courts";
  return "Cause";
}

export function StoryWhy({ id, text }: { id: number; text: string }) {
  const [data, setData] = useState<{ lines: Line[]; effects: Effect[] } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    setData(null);
    void fetch(`/api/sim/explain/${id}`, { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ lines?: Line[]; effects?: Effect[] }>) : null))
      .then((j) => setData({ lines: j?.lines ?? [], effects: j?.effects ?? [] }))
      .catch(() => { if (!ac.signal.aborted) setData({ lines: [], effects: [] }); });
    return () => ac.abort();
  }, [id]);
  if (!data) return <p className="quay-state">Reading the cause…</p>;
  const own = clean(text).toLowerCase().slice(0, 60);
  const seen = new Set<string>();
  const steps: { key: string; word: string; day: number; body: string; depth: number; drivers?: string[] }[] = [];
  for (const l of data.lines) {
    if (l.id === id || l.depth === 0 || l.depth > 2 || l.kind === "media.edition" || l.kind === "mkt.who" || l.kind === "mkt.open" || seedDebug(l.msg)) continue;
    const split = l.kind === "mkt.move" || l.kind === "mkt.mark" ? splitDrivers(l.msg) : null;
    const body = split ? "What moved the price:" : clean(l.msg, l.name);
    const k = body.toLowerCase().slice(0, 60);
    if (!body || k === own || seen.has(k)) continue;
    seen.add(k);
    steps.push({ key: `c${l.id}-${l.depth}`, word: stepWord(l.kind, l.msg), day: l.day, body, depth: l.depth, drivers: split?.drivers });
  }
  // the direct causes in the order they happened; their own causes stay under them
  const top = steps.filter((s) => s.depth === 1).sort((a, b) => a.day - b.day);
  const after: { key: string; word: string; day: number; body: string }[] = [];
  for (const e of data.effects) {
    let body = clean(e.msg);
    if (e.kind === "mkt.move") {
      const head = splitDrivers(e.msg).head, at = head.search(/close \d/);
      body = at >= 0 ? clean(`${head.slice(0, at).trim()} ${moveWords(head.slice(at))}`) : clean(head);
    }
    const k = body.toLowerCase().slice(0, 60);
    if (!body || seen.has(k) || k === own) continue;
    seen.add(k);
    after.push({ key: `e${e.id}`, word: stepWord(e.kind, e.msg), day: e.day, body });
  }
  if (!top.length && !after.length) return <p className="wire-why-none">Nothing came before this: it is where the chain starts.</p>;
  return (
    <ol className="wire-why-steps" data-testid="wire-why-steps">
      {top.map((s) => (
        <li key={s.key} data-step={s.word}>
          <span className="wire-why-word">{s.word}</span>
          <span className="label">{gameDate(s.day)}</span> {s.body}
          {s.drivers?.length ? <ul className="wire-why-deep" data-testid="wire-why-drivers">{s.drivers.map((d, i) => <li key={i}>{d}</li>)}</ul> : null}
          {steps.filter((x) => x.depth === 2 && x.day <= s.day).length && top.length === 1 ? (
            <ul className="wire-why-deep">
              {steps.filter((x) => x.depth === 2).slice(0, 3).map((x) => <li key={x.key}><span className="wire-why-word">{x.word}</span> {x.body}</li>)}
            </ul>
          ) : null}
        </li>
      ))}
      <li className="wire-why-this" data-step="This story"><span className="wire-why-word">This story</span></li>
      {after.map((s) => (
        <li key={s.key} data-step={s.word}>
          <span className="wire-why-word">{s.word}</span>
          <span className="label">{gameDate(s.day)}</span> {s.body}
        </li>
      ))}
    </ol>
  );
}
