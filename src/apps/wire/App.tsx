"use client";
// Wire on the simulation: the city's news and the player's story, each with its cause.
import { useMemo, useRef, useState } from "react";
import { dateLabel, explain, useSimSnap, type ExplainLine, type SimView } from "@/shell/simSession";
import "./wire.css";

interface Item { eventId: number; day: number; tag: string; text: string }

const FILTERS = ["all", "you", "city", "firm", "family"] as const;
type Filter = (typeof FILTERS)[number];

function itemsOf(view: SimView): Item[] {
  const map = new Map<number, Item>();
  for (const n of view.news ?? []) {
    const tag = n.firms && n.firms.length ? "firm" : "city";
    map.set(n.eventId, { eventId: n.eventId, day: n.day, tag, text: n.text });
  }
  for (const f of view.feed ?? []) map.set(f.eventId, f);
  for (const p of view.private ?? []) {
    map.set(p.eventId, { eventId: p.eventId, day: p.day, tag: "you", text: p.from ? `${p.from}: ${p.text}` : p.text });
  }
  return [...map.values()].sort((a, b) => b.day - a.day || b.eventId - a.eventId);
}

export default function WireApp() {
  const { view } = useSimSnap();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const [why, setWhy] = useState<ExplainLine[]>([]);
  const req = useRef(0);
  const items = useMemo(() => (view ? itemsOf(view) : []), [view]);
  const shown = items.filter((item) => filter === "all" || item.tag === filter || (filter === "city" && item.tag === "wire"));

  const onOpen = (id: number) => {
    const n = ++req.current;
    setOpen(id);
    setWhy([]);
    void explain(id).then((lines) => {
      if (req.current === n) setWhy(lines);
    });
  };

  return (
    <div className="sim-wire" data-testid="wire">
      <div className="sim-wire-filters" role="group" aria-label="Wire">
        {FILTERS.map((f) => (
          <button key={f} type="button" data-on={filter === f ? "1" : "0"} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      {shown.length ? shown.map((item) => (
        <article key={item.eventId} className="sim-wire-item">
          <button type="button" data-testid="wire-item" onClick={() => onOpen(item.eventId)}>
            <span className="label">{item.tag} · {dateLabel(item.day)}</span>
            <span>{item.text}</span>
          </button>
          {open === item.eventId ? (
            <div className="sim-wire-why" data-testid="wire-why">
              {why.length ? why.map((line) => (
                <p key={`${line.id}-${line.depth}`} style={{ paddingLeft: line.depth * 12 }}>
                  {line.missing ? line.msg : `${line.name ? `${line.name}: ` : ""}${line.msg}`}
                </p>
              )) : <p className="muted">Reading the cause…</p>}
            </div>
          ) : null}
        </article>
      )) : <p className="muted">Nothing on the wire.</p>}
    </div>
  );
}
