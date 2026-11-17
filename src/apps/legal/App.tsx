"use client";
// Open investigations and trials, the regulator's people, your record, and a lawyer.
// Hiring goes through /act {kind:'lawyer'}.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useShell } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { act, explain, useSimSnap, type ExplainLine } from "@/shell/simSession";
import { gameDate, moneyFromCents, presentNote } from "@/components/ui/format";
import { Named } from "@/components/ui/Named";
import "./legal.css";

interface CaseRow {
  phase: string;
  kind: string;
  who: string;
  investigator: string;
  firm: string;
  day: number;
  eventId: number;
  mine: boolean;
}
interface Staff { index: number; name: string; role: string; files: number }
interface Legal {
  open: CaseRow[];
  staff: Staff[];
  record: {
    word: string;
    hover: string;
    line: string;
    eventId: number;
    convictions: number;
    prison: boolean;
    cases: CaseRow[];
  };
  lawyer: { cost: number; left: number; line: string } | null;
}

export default function LegalApp() {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const tick = useSimSnap().view?.date.abs;
  const noteTick = useSimSnap().note?.text;
  const [data, setData] = useState<Legal | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [why, setWhy] = useState<ExplainLine[]>([]);
  const req = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=legal", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() as Promise<Legal> : null))
      .then((j) => { if (j?.record) { setData(j); setFailed(false); } else if (!ac.signal.aborted) setFailed(true); })
      .catch(() => { if (!ac.signal.aborted) setFailed(true); });
    return () => ac.abort();
  }, [tick, noteTick]);

  const ask = (id: number) => {
    const n = ++req.current;
    setOpen(id);
    setWhy([]);
    void explain(id).then((lines) => { if (req.current === n) setWhy(lines); });
  };

  const hire = async () => {
    setBusy(true);
    const res = await act({ kind: "lawyer" });
    setNote(res.text);
    setBusy(false);
  };

  if (!data) {
    return <div className={`leg${phone ? " q-phone" : ""}`} data-testid="legal"><p className="quay-state" data-kind={failed ? "error" : undefined} role={failed ? "alert" : "status"}>{failed ? "The docket did not answer." : "Reading the docket…"}</p></div>;
  }

  const chain = (id: number) => open === id ? (
    <div className="q-why-body" data-testid="legal-why">
      {why.length ? why.map((line, i) => (
        <p key={`${line.id}-${line.depth}-${i}`} style={{ paddingLeft: line.depth * 12 }}>
          <span className="label">{gameDate(line.day)}</span> {line.missing ? presentNote(line.msg) : `${line.name ? `${line.name}: ` : ""}${presentNote(line.msg)}`}
        </p>
      )) : <p className="muted">Reading the cause…</p>}
    </div>
  ) : null;

  return (
    <div className={`leg${phone ? " q-phone" : ""}`} data-testid="legal">
      <h2>The court</h2>

      <section>
        <h3>Your record</h3>
        <p className="leg-word" title={data.record.hover}>{data.record.word}</p>
        <p>{data.record.line}</p>
        <p className="muted" title={`${data.record.convictions} convictions`}>{data.record.convictions ? "Convicted" : "No conviction"} · {data.record.prison ? "In prison" : "At liberty"}</p>
        <button type="button" className="q-why" onClick={() => ask(data.record.eventId)}>Why?</button>
        {chain(data.record.eventId)}
      </section>

      <section>
        <h3>Open cases</h3>
        {data.open.length ? (
          <ul className="leg-cases">
            {data.open.map((c) => (
              <li key={`${c.eventId}-${c.who}`}>
                <span className="leg-word">{c.phase}</span>
                <span>{c.kind}{c.mine ? " · yours" : ""}</span>
                <span className="muted"><Named name={c.who} />{c.firm ? <> · <Named name={c.firm} /></> : null}{c.investigator ? <> · <Named name={c.investigator} /></> : null}</span>
                <span className="num">{gameDate(c.day)}</span>
                <button type="button" className="q-why" onClick={() => ask(c.eventId)}>Why?</button>
                {chain(c.eventId)}
              </li>
            ))}
          </ul>
        ) : <p className="muted">No open investigation.</p>}
      </section>

      <section>
        <h3>The regulator</h3>
        <ul className="leg-staff">
          {data.staff.map((s) => (
            <li key={s.index}>
              <b><Named name={s.name} /></b>
              <span className="muted">{s.role}</span>
              <span title={`${s.files} files`}>{s.files ? "On a file" : "Clear"}</span>
            </li>
          ))}
        </ul>
        {data.staff.length ? null : <p className="muted">No one is seated.</p>}
      </section>

      <div className="leg-acts">
        <Button
          variant="primary"
          data-testid="legal-lawyer"
          disabled={busy || !data.lawyer || data.lawyer.left > 0}
          title={data.lawyer ? moneyFromCents(data.lawyer.cost) : undefined}
          onClick={() => void hire()}
        >
          Hire a lawyer
        </Button>
      </div>
      {data.lawyer?.left ? <p className="muted">{data.lawyer.line}</p> : null}
      {data.lawyer ? <p className="muted">The fee is {moneyFromCents(data.lawyer.cost)}.</p> : null}
      {note ? <p data-testid="legal-result">{presentNote(note)}</p> : null}
    </div>
  );
}
