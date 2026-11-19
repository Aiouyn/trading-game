"use client";
// What a command printed, as a panel that closes: Help with a button for every app, homes as a table, other lists as
// plain lines. Money and names are formatted; internal ids never show.
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { presentNote } from "@/components/ui/format";
import type { AppId } from "@/shell/registry";
import type { ActNote } from "@/shell/simSession";
import { useShell, useShellStore } from "./ShellContext";

const HELP: { title: string; text: string; app: AppId; button: string }[] = [
  { title: "Work", text: "See who is hiring and ask for a job. Courses lift your skill.", app: "careers", button: "Careers" },
  { title: "Money", text: "What you have and owe. Savings, loans and the bank rates.", app: "bank", button: "Bank" },
  { title: "A home", text: "Places to rent or buy, and the one you live in.", app: "property", button: "Home & property" },
  { title: "Markets", text: "Shares, bonds, futures and currencies. Buy, sell and watch the prices.", app: "broker", button: "Broker" },
  { title: "New coins", text: "Launch a coin or trade the ones other people launched.", app: "launchpad", button: "Launchpad" },
  { title: "People", text: "Everyone you have met. Ask them things, invite them out.", app: "people", button: "People" },
  { title: "Letters", text: "Write to anyone you know, or answer what they wrote.", app: "messages", button: "Messages" },
  { title: "Your evenings", text: "Places to go, people to meet and what the city offers.", app: "citylife", button: "City life" },
  { title: "Learning", text: "Courses and what they lead to.", app: "academy", button: "Academy" },
  { title: "What happened", text: "The news, the story of your days and why things moved.", app: "wire", button: "Wire" },
  { title: "Your wealth", text: "Net worth, cash and holdings, with the reason behind each figure.", app: "portfolio", button: "Portfolio" },
];

function Help({ onClose }: { onClose: () => void }) {
  const store = useShellStore();
  const vis = useShell((s) => s.vis);
  return (
    <div className="res-help" data-testid="help-panel">
      <p className="res-lead">Nothing here is required. Do any of it, in any order, or none of it. Every part of the game is an app: open it from the dock, or press Ctrl K and type its name.</p>
      <ul className="res-list">
        {HELP.filter((h) => vis[h.app] === "unlocked").map((h) => (
          <li key={h.app}>
            <div>
              <strong>{h.title}</strong>
              <span>{h.text}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { store.getState().open(h.app); onClose(); }}>{h.button}</Button>
          </li>
        ))}
      </ul>
      <p className="res-foot">Time runs from the top bar: Pause, then x1 to x25. The game pauses by itself when something needs you.</p>
    </div>
  );
}

const money = (s: string) => s.replace(/\$(\d{4,})(?![\d,])/g, (_, n: string) => "$" + Number(n).toLocaleString("en-US"));

interface HomeRow { place: string; price: string; rent: string; state: string; n: number }
function homeRow(line: string): HomeRow | null {
  const m = /^#?\d+\s+(.+?)\s+price\s+(\$[\d,.]+)\s+rent\s+(\$[\d,.]+)(?:\s+(.*))?$/i.exec(line.trim());
  if (!m) return null;
  return { place: m[1], price: money(m[2]), rent: money(m[3]), state: (m[4] ?? "").trim(), n: 1 };
}

function Homes({ rows }: { rows: HomeRow[] }) {
  return (
    <table className="res-table" data-testid="homes-table">
      <thead><tr><th>Where</th><th>To buy</th><th>Rent a month</th><th /></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}><td>{r.place}</td><td className="num">{r.price}</td><td className="num">{r.rent}</td><td>{r.state || (r.n > 1 ? `${r.n} like this` : "")}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <div className="res-lines">
      {lines.map((raw, i) => {
        if (!raw.trim()) return <div key={i} className="res-gap" />;
        const line = presentNote(raw).trim();
        if (!line) return null;
        const m = /^([A-Z][A-Za-z' ]{1,28}):\s+(.+)$/.exec(line);
        return m ? <p key={i}><strong>{m[1]}.</strong> {money(m[2])}</p> : <p key={i}>{money(line)}</p>;
      })}
    </div>
  );
}

export function isResult(note: ActNote): boolean {
  return (note.lines?.length ?? 0) > 1 || note.text.includes("\n");
}

export function ResultPanel({ note, onClose }: { note: ActNote; onClose: () => void }) {
  const title = note.title || "Result";
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const lines = note.lines?.length ? note.lines : note.text.split("\n");
  const homes = lines.map(homeRow);
  const found = homes.filter(Boolean).length;
  const table = found >= 2 && found >= lines.filter((l) => l.trim()).length - 1;
  const rows: HomeRow[] = [];
  if (table) {
    for (const r of homes) {
      if (!r) continue;
      const same = rows.find((x) => x.place === r.place && x.price === r.price && x.rent === r.rent && x.state === r.state);
      if (same) same.n++; else rows.push({ ...r });
    }
  }
  const rest = table ? lines.filter((_, i) => !homes[i]) : lines;
  return (
    <aside className="res-panel" role="dialog" aria-label={title} data-testid="result-panel">
      <header>
        <h2>{title}</h2>
        <button type="button" className="res-close" aria-label="Close" data-testid="result-close" onClick={onClose}>Close</button>
      </header>
      <div className="res-body">
        {note.title === "Help" ? <Help onClose={onClose} /> : (
          <>
            {table ? <><p className="res-lead">{found} places{rows.length > 40 ? ", the first 40 kinds shown" : ""}. Open Home &amp; property to rent, buy or move.</p><Homes rows={rows.slice(0, 40)} /></> : null}
            {rest.length ? <Lines lines={rest} /> : null}
          </>
        )}
      </div>
    </aside>
  );
}
