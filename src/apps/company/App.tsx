"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { presentNote } from "@/components/ui/format";
import { act, useSimSnap, type ActNote, type SimCompany } from "@/shell/simSession";
import { Because, Field, Fig, Note, centsOf, moneyTitle, titleCase, usePhone, useWhy } from "@/apps/businesses/sheet";
import "@/apps/businesses/sheet.css";
import { edgeOf } from "@/apps/research/edge";
import { Stakes } from "./Stakes";

function runs(c: SimCompany): boolean {
  return c.role === "chief executive" || c.role === "chairman" || (c.shares > 0 && c.stake * 2 > c.shares);
}

export default function CompanyApp({ context }: { context?: string }) {
  const phone = usePhone();
  const { view } = useSimSnap();
  const why = useWhy();
  const posts = view?.companies ?? [];
  const [id, setId] = useState(context ?? "");
  useEffect(() => { if (context) setId(context); }, [context]);
  const [note, setNote] = useState<ActNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState("");
  const [hires, setHires] = useState("");
  const [dividend, setDividend] = useState("");
  const [invest, setInvest] = useState("");
  const [chief, setChief] = useState("");
  const [slice, setSlice] = useState("10");
  const [into, setInto] = useState("");
  const firm = posts.find((c) => c.id === id) ?? posts[0];
  const others = posts.filter((c) => runs(c) && c.id !== firm?.id);

  const go = async (cmd: unknown) => {
    setBusy(true);
    const n = await act(cmd);
    setNote(n);
    setBusy(false);
    return n;
  };

  const strategy = async () => {
    if (!firm) return;
    const cmds: unknown[] = [];
    if (price.trim()) {
      const cents = centsOf(price);
      if (cents === null || cents < 1) { setNote({ ok: false, text: "Name a price in dollars." }); return; }
      cmds.push({ kind: "ceo", firm: firm.id, op: "price", value: cents });
    }
    if (hires.trim()) {
      const n = Number(hires);
      if (!Number.isInteger(n) || n < 1) { setNote({ ok: false, text: "Hiring is a number of people." }); return; }
      cmds.push({ kind: "ceo", firm: firm.id, op: "hires", value: n });
    }
    if (dividend.trim()) {
      const n = Number(dividend);
      if (!Number.isFinite(n) || n < 0 || n > 100) { setNote({ ok: false, text: "A dividend is a percent of the surplus, up to 100." }); return; }
      cmds.push({ kind: "ceo", firm: firm.id, op: "dividend", value: n / 100 });
    }
    if (invest.trim()) {
      const n = Number(invest);
      if (!Number.isInteger(n) || n < 1) { setNote({ ok: false, text: "Investment is a number of machines." }); return; }
      cmds.push({ kind: "ceo", firm: firm.id, op: "invest", value: n });
    }
    if (!cmds.length) { setNote({ ok: false, text: "Name a price, a hiring number, a dividend, or machines to buy." }); return; }
    setBusy(true);
    const lines: string[] = [];
    let ok = true;
    for (const cmd of cmds) {
      const n = await act(cmd);
      lines.push(n.text);
      if (!n.ok) { ok = false; break; }
    }
    setNote({ ok, text: lines.join("\n\n") });
    setBusy(false);
  };

  const bids = (view?.bids ?? []).filter((b) => posts.some((c) => runs(c) && (c.id === b.firm || c.name === b.name)));
  const cityBids = view?.bids ?? [];

  return (
    <div className="qa" data-phone={phone ? "1" : "0"} data-testid="company">
      <Note note={note} testId="company-note" />
      <Stakes stakes={edgeOf(view).stake} run={go} busy={busy} onWhy={why.open} />
      {!posts.length ? (
        <p className="qa-empty">You do not run a firm yet. Found one in Businesses.</p>
      ) : (
        <>
          <div className="qa-head"><h2 className="qa-title">Firms you sit on</h2></div>
          <div className="qa-list">
            {posts.map((c) => (
              <div key={c.id} className="qa-row" data-on={firm?.id === c.id ? "1" : "0"}>
                <button type="button" className="qa-row-main" onClick={() => setId(c.id)}>
                  <strong>{c.name}</strong>
                  <span className="qa-muted"> · {c.role} · {titleCase(c.sector)} · {c.listed ? "Listed" : "Private"} · price {c.quote} · {c.workers.toLocaleString("en-US")} workers · cash {moneyTitle(c.cash)} · hiring {c.hire} · dividend {c.dividend}</span>
                </button>
                <Fig word={c.profit > 100 ? "In profit" : c.profit < -100 ? "Losing" : "Even"} title={moneyTitle(c.profit)} eventId={c.profitEv} onWhy={why.open} />
              </div>
            ))}
          </div>
          {firm && runs(firm) ? (
            <div className="qa-block">
              <h2 className="qa-title">{firm.name}</h2>
              <Field label="Price"><input className="qa-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={firm.quote} data-testid="company-price" /></Field>
              <Field label="Hiring"><input className="qa-input" inputMode="numeric" value={hires} onChange={(e) => setHires(e.target.value)} placeholder={firm.hire} data-testid="company-hires" /></Field>
              <Field label="Dividend, percent of the surplus"><input className="qa-input" inputMode="decimal" value={dividend} onChange={(e) => setDividend(e.target.value)} placeholder={firm.dividend} data-testid="company-dividend" /></Field>
              <Field label="Machines to buy"><input className="qa-input" inputMode="numeric" value={invest} onChange={(e) => setInvest(e.target.value)} data-testid="company-invest" /></Field>
              <Button variant="primary" disabled={busy} data-testid="company-strategy" onClick={() => void strategy()}>Set strategy</Button>
              <Field label="Chief"><input className="qa-input" value={chief} placeholder="A name, or leave this and appoint yourself" onChange={(e) => setChief(e.target.value)} data-testid="company-chief" /></Field>
              <div className="qa-actions">
                <Button variant="secondary" disabled={busy} onClick={() => void go({ kind: "board", op: "chief", firm: firm.id, person: chief.trim() || "me" })}>Appoint</Button>
                <Button variant="secondary" disabled={busy} onClick={() => void go({ kind: "board", op: "list" })}>Read the seats</Button>
              </div>
              <Field label="Stake to sell, percent">
                <input className="qa-input" inputMode="decimal" value={slice} onChange={(e) => setSlice(e.target.value)} data-testid="company-ipo" />
              </Field>
              <Button variant="secondary" disabled={busy || firm.listed} onClick={() => {
                const n = Number(slice);
                if (!Number.isFinite(n) || n <= 0 || n > 90) { setNote({ ok: false, text: "You can sell at most nine tenths of your stake." }); return; }
                void go({ kind: "ipo", firm: firm.id, fraction: n / 100 });
              }}>{firm.listed ? "Already listed" : "Take it public"}</Button>
            </div>
          ) : firm ? <p className="qa-muted">You sit here, and you do not control {firm.name}.</p> : null}
          <div className="qa-block">
            <h2 className="qa-title">A bid</h2>
            {bids.length ? bids.map((b) => {
              const text = presentNote(b.text);
              const word = b.kind === "firm.resist" ? "The board resists" : b.kind === "firm.whiteKnight" ? "A white knight" : "A bid";
              return (
                <p key={b.eventId}>
                  <Fig word={word} title={text} eventId={b.eventId} onWhy={why.open} />
                  {text.length > 72 ? <span className="qa-muted">{text}</span> : null}
                </p>
              );
            }) : <p className="qa-empty">No bid on your firms.</p>}
            {!bids.length && cityBids.length ? cityBids.slice(0, 4).map((b) => {
              const text = presentNote(b.text);
              return (
                <p key={b.eventId}>
                  <Fig word="In the city" title={text} eventId={b.eventId} onWhy={why.open} />
                  {text.length > 72 ? <span className="qa-muted">{text}</span> : null}
                </p>
              );
            }) : null}
            {firm && runs(firm) && others.length ? (
              <>
                <Field label="Fold into">
                  <select className="qa-select" value={into} onChange={(e) => setInto(e.target.value)}>
                    <option value="">A firm you also control</option>
                    {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Button variant="secondary" disabled={busy || !into} onClick={() => void go({ kind: "board", op: "merge", firm: firm.id, into })}>Fold the firm</Button>
              </>
            ) : null}
          </div>
        </>
      )}
      <Because id={why.id} lines={why.lines} />
    </div>
  );
}
