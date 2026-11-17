"use client";
// Parties, the poll, the next election, taxes and spending. Donate goes through /act.
// The vote is the ballot the city already counts. There is no separate vote command.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useShell } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { act, dollars, explain, useSimSnap, type ExplainLine } from "@/shell/simSession";
import "./civic.css";

interface Party {
  id: string;
  name: string;
  tax: number;
  profit: number;
  dividend: number;
  benefit: number;
  regulation: number;
  votes: number;
  share: number;
  governing: boolean;
}
interface Office { index: number; name: string; role: string; eventId: number }
interface Civic {
  parties: Party[];
  ballotName: string;
  votedName: string;
  monthsToElection: number;
  electionNow: boolean;
  offices: Office[];
  tax: { income: number; profit: number; dividend: number; benefit: number; scale: number; eventId: number };
  spend: { name: string; share: number; weight: number }[];
  donate: { cost: number; left: number; line: string } | null;
  turned: number;
  eligible: number;
}

function electWord(months: number, now: boolean): string {
  if (now || months <= 0) return "This month";
  if (months <= 2) return "Imminent";
  if (months <= 12) return "This year";
  if (months <= 24) return "Next year";
  return "This term";
}
function taxWord(rate: number): string {
  const p = rate * 100;
  if (p < 11) return "Light";
  if (p > 16) return "Heavy";
  return "Ordinary";
}
function leadWord(parties: Party[]): string {
  const sorted = [...parties].sort((a, b) => b.share - a.share);
  const gap = (sorted[0]?.share ?? 0) - (sorted[1]?.share ?? 0);
  if (!sorted[0]?.votes) return "Uncounted";
  if (gap >= 0.08) return "A clear lead";
  if (gap <= 0.02) return "Neck and neck";
  return "A narrow lead";
}
function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function CivicApp() {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const tick = useSimSnap().view?.date.abs;
  const noteTick = useSimSnap().note?.text;
  const [data, setData] = useState<Civic | null>(null);
  const [note, setNote] = useState("");
  const [vote, setVote] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<ExplainLine[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=civic", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() as Promise<Civic> : null))
      .then((j) => { if (j?.parties) setData(j); })
      .catch(() => {});
    return () => ac.abort();
  }, [tick, noteTick]);

  const donate = async () => {
    setBusy(true);
    const res = await act({ kind: "donate" });
    setNote(res.text);
    setBusy(false);
  };

  const showVote = () => {
    if (!data) return;
    if (data.votedName) setVote(`You voted for ${data.votedName}`);
    else if (data.ballotName) setVote(`The city counts your vote for ${data.ballotName}`);
    else setVote("You cannot vote");
  };

  if (!data) {
    return <div className={`civ${phone ? " q-phone" : ""}`} data-testid="civic"><p className="muted">Reading the poll…</p></div>;
  }

  const maxSpend = Math.max(0.0001, ...data.spend.map((s) => s.share));

  return (
    <div className={`civ${phone ? " q-phone" : ""}`} data-testid="civic">
      <h2>The city</h2>
      <p className="civ-word" title={`${data.monthsToElection} months`}>{electWord(data.monthsToElection, data.electionNow)}</p>
      <p className="muted" title={`${data.turned} of ${data.eligible}`}>{leadWord(data.parties)}</p>

      <ul className="civ-parties">
        {data.parties.map((p) => (
          <li key={p.id}>
            <div className="civ-party-head">
              <b>{p.name}</b>
              <span className="muted" title={pct(p.share)}>{p.governing ? "In office" : "Out"}</span>
            </div>
            <div className="civ-bar" title={`${p.votes} votes · ${pct(p.share)}`} aria-hidden="true">
              <span style={{ width: `${Math.max(2, Math.round(p.share * 100))}%` }} />
            </div>
            <p className="muted" title={`tax ${pct(p.tax)} · profit ${pct(p.profit)} · dividend ${pct(p.dividend)} · benefits ${pct(p.benefit)}`}>
              Their platform
            </p>
          </li>
        ))}
      </ul>

      <h3>Offices</h3>
      <ul className="civ-offices">
        {data.offices.map((o) => (
          <li key={o.role}><b>{o.name}</b> <span className="muted">{o.role}</span></li>
        ))}
      </ul>

      <h3>The government</h3>
      <div className="civ-taxes">
        <p><span className="civ-word" title={pct(data.tax.income)}>{taxWord(data.tax.income)}</span> <span className="muted">income tax</span></p>
        <p><span className="civ-word" title={pct(data.tax.profit)}>{taxWord(data.tax.profit)}</span> <span className="muted">profit tax</span></p>
        <p><span className="civ-word" title={pct(data.tax.dividend)}>{taxWord(data.tax.dividend)}</span> <span className="muted">dividend tax</span></p>
        <p><span className="civ-word" title={pct(data.tax.benefit)}>{taxWord(data.tax.benefit)}</span> <span className="muted">benefits</span></p>
        <button type="button" className="q-why" data-testid="civic-why" onClick={() => { setWhy(null); void explain(data.tax.eventId).then(setWhy); }}>why?</button>
        {why ? (
          <div className="q-why-body">
            {why.length ? why.map((line, i) => (
              <p key={`${line.id}-${line.depth}-${i}`} style={{ paddingLeft: line.depth * 12 }}>
                {line.missing ? line.msg : `${line.name ? `${line.name}: ` : ""}${line.msg}`}
              </p>
            )) : <p className="muted">Reading the cause…</p>}
          </div>
        ) : null}
      </div>

      <h3>Spending</h3>
      <ul className="civ-spend">
        {data.spend.map((s) => (
          <li key={s.name}>
            <span>{s.name}</span>
            <span className="civ-bar" title={s.weight.toFixed(2)} aria-hidden="true">
              <span style={{ width: `${Math.max(2, Math.round((s.share / maxSpend) * 100))}%` }} />
            </span>
          </li>
        ))}
      </ul>

      <div className="civ-acts">
        <Button variant="primary" data-testid="civic-donate" disabled={busy || !data.donate || data.donate.left > 0} title={data.donate ? dollars(data.donate.cost) : undefined} onClick={() => void donate()}>
          Donate
        </Button>
        <Button variant="secondary" data-testid="civic-vote" onClick={showVote}>Your vote</Button>
      </div>
      {data.donate?.left ? <p className="muted">{data.donate.line}</p> : null}
      {note ? <p data-testid="civic-result">{note}</p> : null}
      {vote ? <p data-testid="civic-vote-line">{vote}</p> : null}
    </div>
  );
}
