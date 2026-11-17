"use client";
// A person or a firm, clickable when the desk has a page for them.
// The player opens Profile. A listed firm opens Markets. A firm you sit on opens Company.
// Anyone else has no page in the view the simulation sends.
import { Fragment, useMemo, type ReactNode } from "react";
import { useShellStore } from "@/components/shell/ShellContext";
import { useSimSnap } from "@/shell/simSession";
import { presentNote } from "./format";
import "./named.css";

interface Hit { name: string; kind: "you" | "firm" | "co"; id?: string }

function useHits(): Hit[] {
  const { view } = useSimSnap();
  return useMemo(() => {
    const hits: Hit[] = [];
    if (view?.name) hits.push({ name: view.name, kind: "you" });
    for (const q of view?.quotes ?? []) {
      if (q.name && q.name.length > 2) hits.push({ name: q.name, kind: "firm", id: q.instr });
    }
    for (const c of view?.companies ?? []) {
      if (c.name) hits.push({ name: c.name, kind: "co", id: c.id });
    }
    const seen = new Set<string>();
    return hits
      .sort((a, b) => b.name.length - a.name.length)
      .filter((h) => {
        if (seen.has(h.name)) return false;
        seen.add(h.name);
        return true;
      });
  }, [view]);
}

export function Named({ name, children }: { name: string; children?: ReactNode }) {
  const store = useShellStore();
  const hits = useHits();
  const hit = hits.find((h) => h.name === name);
  const label = children ?? name;
  if (!hit) return <span>{label}</span>;
  const open = () => {
    if (hit.kind === "you") store.getState().open("profile");
    else if (hit.kind === "firm" && hit.id) store.getState().open("markets", hit.id);
    else if (hit.id) store.getState().open("company", hit.id);
  };
  return <button type="button" className="name-link" onClick={open}>{label}</button>;
}

/** Prose with the known names turned into links. Ledger ids are scrubbed first. */
export function EntityText({ text }: { text: string }) {
  const store = useShellStore();
  const hits = useHits();
  const clean = presentNote(text);
  if (!hits.length || !clean) return <>{clean}</>;
  const re = new RegExp(hits.map((h) => h.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const parts: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of clean.matchAll(re)) {
    const index = m.index ?? 0;
    if (index > last) parts.push(clean.slice(last, index));
    const hit = hits.find((h) => h.name === m[0]);
    parts.push(
      <button
        type="button"
        className="name-link"
        key={`${k++}-${index}`}
        onClick={() => {
          if (!hit) return;
          if (hit.kind === "you") store.getState().open("profile");
          else if (hit.kind === "firm" && hit.id) store.getState().open("markets", hit.id);
          else if (hit.id) store.getState().open("company", hit.id);
        }}
      >
        {m[0]}
      </button>,
    );
    last = index + m[0].length;
  }
  if (last < clean.length) parts.push(clean.slice(last));
  return <>{parts.map((part, i) => <Fragment key={i}>{part}</Fragment>)}</>;
}
