"use client";
// Wire on the simulation. Filters: you, contacts, holdings, city, markets.
// Each item opens its cause chain.
import { useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { explain, useSimSnap, type ExplainLine } from "@/shell/simSession";
import { gameDate, presentNote } from "@/components/ui/format";
import { EntityText } from "@/components/ui/Named";
import "./wire.css";

interface Item { eventId: number; day: number; text: string; tags: string[] }

const FILTERS = ["you", "contacts", "holdings", "city", "markets"] as const;
type Filter = (typeof FILTERS)[number];

function titleOf(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [why, setWhy] = useState<ExplainLine[]>([]);
  const req = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=wire", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() as Promise<{ items?: Item[] }> : null))
      .then((j) => {
        if (j?.items) { setItems(j.items); setFailed(false); }
        else setFailed(true);
        setReady(true);
      })
      .catch(() => { if (!ac.signal.aborted) { setFailed(true); setReady(true); } });
    return () => ac.abort();
  }, [tick, attempt]);

  const shown = useMemo(
    () => items.filter((item) => item.tags.includes(filter)).slice().sort((a, b) => b.day - a.day || b.eventId - a.eventId),
    [items, filter],
  );
  const newest = shown[0]?.eventId;

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
      {!ready ? <p className="quay-state" role="status">Reading the wire…</p> : null}
      {ready && failed && !shown.length ? (
        <p className="quay-state" data-kind="error" role="alert">
          The wire did not answer. <button type="button" className="name-link" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </p>
      ) : null}
      {shown.length ? shown.map((item) => (
        <article
          key={item.eventId}
          className="sim-wire-item"
          data-newest={item.eventId === newest ? "1" : "0"}
          onClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; onOpen(item.eventId); }}
        >
          <div className="sim-wire-hit" data-testid="wire-item">
            <span className="sim-wire-meta">{item.tags.map((t) => LABEL[t as Filter] ?? titleOf(t)).join(" · ")} · {gameDate(item.day)}</span>
            <EntityText text={item.text} />
          </div>
          {open === item.eventId ? (
            <div className="sim-wire-why" data-testid="wire-why">
              {why.length ? why.map((line, i) => (
                <p key={`${line.id}-${line.depth}-${i}`} style={{ paddingLeft: line.depth * 12 }}>
                  <span className="label">{gameDate(line.day)}</span>{" "}
                  {line.missing ? presentNote(line.msg) : `${line.name ? `${line.name}: ` : ""}${presentNote(line.msg)}`}
                </p>
              )) : <p className="quay-state">Reading the cause…</p>}
            </div>
          ) : null}
        </article>
      )) : ready && !failed ? <p className="quay-empty">Nothing on {LABEL[filter].toLowerCase()} yet.</p> : null}
    </div>
  );
}
