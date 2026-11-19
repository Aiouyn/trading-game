"use client";
// Your people. Filter the circle, see who knows whom, and open one person.
import { useEffect, useState } from "react";
import type { AppBodyProps } from "@/shell/appModules";
import { Closed, useLife } from "@/apps/profile/data";
import "@/apps/profile/life.css";
import { initial, readCircle, roleWord, type CircleContact } from "@/apps/messages/circle";
import { CircleMap } from "./Map";
import { Person } from "./Person";
import "./people.css";

const FILTERS = ["all", "acquaintance", "friend", "family", "rival", "mentor", "colleague"] as const;
type Filter = (typeof FILTERS)[number];

function whoFrom(context?: string): number | null {
  if (!context?.startsWith("who:")) return null;
  const n = Number(context.slice(4));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function matches(person: CircleContact, filter: Filter): boolean {
  if (filter === "all") return true;
  return person.role === filter;
}

export default function PeopleApp({ context }: AppBodyProps) {
  const { life } = useLife();
  const snap = readCircle(life);
  const hinted = whoFrom(context);
  const [filter, setFilter] = useState<Filter>("all");
  const [who, setWho] = useState<number | null>(hinted);
  useEffect(() => { if (hinted !== null) setWho(hinted); }, [hinted]);
  if (!life || !snap) return <Closed title="People" />;

  const shown = snap.contacts.filter((c) => matches(c, filter));
  const selected = who === null ? undefined : snap.contacts.find((c) => c.who === who);
  const knows = life.contacts?.find((c) => c.who === who)?.knows ?? [];
  const preview = (c: CircleContact) => c.bond.why[c.bond.why.length - 1]?.text || c.line || c.sentence || "";

  return (
    <div className="peo" data-testid="people" data-pane={who === null ? "list" : "person"}>
      <div className="peo-filters" role="tablist" aria-label="Circle">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="peo-chip"
            role="tab"
            data-role={f}
            data-on={filter === f ? "1" : "0"}
            aria-selected={filter === f}
            data-testid={`filter-${f}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="peo-body">
        <div className="peo-side">
          <CircleMap you={snap.name} people={shown} pending={snap.pending} links={life.links ?? []} selected={who} onPick={setWho} />
          <div className="peo-scroll" aria-label="People">
            {shown.length ? shown.map((c) => (
              <button
                key={c.who}
                type="button"
                className="peo-row"
                data-testid="person-row"
                data-on={c.who === who ? "1" : "0"}
                onClick={() => setWho(c.who)}
              >
                <span className="avatar" data-role={c.role}>{initial(c.name)}</span>
                <span className="peo-row-text">
                  <strong>{c.name}</strong>
                  <span>{roleWord(c.role, c.stance)}{c.bond.word ? ` · ${c.bond.word}` : ""}</span>
                  <span>{preview(c)}</span>
                </span>
              </button>
            )) : <p className="peo-empty">Your circle is still forming. People write when they have a reason.</p>}
          </div>
        </div>
        {who !== null ? (
          <Person
            key={who}
            index={who}
            knows={knows}
            onPick={setWho}
            contact={selected}
            firms={snap.firms}
            homes={snap.homes}
            onBack={() => setWho(null)}
          />
        ) : (
          <section className="peo-person" aria-label="Person">
            <p className="peo-empty">Choose someone. Their bond, what you have done, and what you can ask sit here.</p>
          </section>
        )}
      </div>
    </div>
  );
}
