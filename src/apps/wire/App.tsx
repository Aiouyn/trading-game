"use client";
// Wire on the simulation. Filters: you, contacts, holdings, city, markets.
// Each item opens its cause chain.
import { useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { dateLabel, explain, useSimSnap, type ExplainLine } from "@/shell/simSession";
import "./wire.css";

interface Item { eventId: number; day: number; text: string; tags: string[] }

const FILTERS = ["you", "contacts", "holdings", "city", "markets"] as const;
type Filter = (typeof FILTERS)[number];

const LABEL: Record<Filter, string> = {
  you: "You",
  contacts: "Contacts",
  holdings: "Holdings",
  city: "City",
  markets: "Markets",
};

export default function WireApp() {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const tick = useSimSnap().view?.date.abs;
  const [filter, setFilter] = useState<Filter>("you");
  const [items, setItems] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [why, setWhy] = useState<ExplainLine[]>([]);
  const req = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=wire", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() as Promise<{ items?: Item[] }> : null))
      .then((j) => {
        if (j?.items) setItems(j.items);
        setReady(true);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [tick]);

  const shown = useMemo(() => items.filter((item) => item.tags.includes(filter)), [items, filter]);

  const onOpen = (id: number) => {
    const n = ++req.current;
    setOpen(id);
    setWhy([]);
    void explain(id).then((lines) => { if (req.current === n) setWhy(lines); });
  };

  return (
    <div className={`sim-wire${phone ? " q-phone" : ""}`} data-testid="wire">
      <div className="sim-wire-filters" role="group" aria-label="Wire">
        {FILTERS.map((f) => (
          <button key={f} type="button" data-on={filter === f ? "1" : "0"} onClick={() => setFilter(f)}>{LABEL[f]}</button>
        ))}
      </div>
      {!ready ? <p className="muted">Reading the wire…</p> : null}
      {shown.length ? shown.map((item) => (
        <article key={item.eventId} className="sim-wire-item">
          <button type="button" data-testid="wire-item" onClick={() => onOpen(item.eventId)}>
            <span className="label">{item.tags.map((t) => LABEL[t as Filter] ?? t).join(" · ")} · {dateLabel(item.day)}</span>
            <span>{item.text}</span>
          </button>
          {open === item.eventId ? (
            <div className="sim-wire-why" data-testid="wire-why">
              {why.length ? why.map((line, i) => (
                <p key={`${line.id}-${line.depth}-${i}`} style={{ paddingLeft: line.depth * 12 }}>
                  {line.missing ? line.msg : `${line.name ? `${line.name}: ` : ""}${line.msg}`}
                </p>
              )) : <p className="muted">Reading the cause…</p>}
            </div>
          ) : null}
        </article>
      )) : ready ? <p className="muted">Nothing on {LABEL[filter].toLowerCase()}.</p> : null}
    </div>
  );
}
