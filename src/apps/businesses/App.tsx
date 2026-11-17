"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Named } from "@/components/ui/Named";
import { act, useSimSnap, type ActNote, type SimCompany } from "@/shell/simSession";
import { Because, Field, Fig, Note, centsOf, moneyTitle, titleCase, usePanel, usePhone, useWhy } from "./sheet";
import "./sheet.css";

interface FirmRow {
  id: string; name: string; sector: string; goodName: string; sizeWord: string; owner: string; chief: string;
  profit: number; profitWord: string; profitEv: number; listed: boolean; family: boolean;
}
interface Directory { firms: FirmRow[]; sectors: string[] }
interface Person { index: number; name: string }
interface FirmPage {
  id: string; name: string; goodName?: string; sector?: string; family?: boolean; listed?: boolean; kind?: string;
  staff?: number; price?: number; sales?: number;
  events?: { price?: number; sales?: number; revenue?: number; profit?: number; debt?: number };
  accounts?: { revenue: number; cost: number; profit: number; cash: number; debt: number };
  people?: Person[];
  plant?: { units: number; word: string; eventId: number };
  suppliers?: { id: string; name: string; goodName: string }[];
  holders?: { id: string; name: string; shares: number }[];
  board?: { id: string; name: string; role: string }[];
}

function runs(list: SimCompany[] | undefined, id: string): boolean {
  const c = list?.find((x) => x.id === id);
  if (!c) return false;
  return c.role === "chief executive" || c.role === "chairman" || (c.shares > 0 && c.stake * 2 > c.shares);
}

export default function BusinessesApp() {
  const phone = usePhone();
  const { view } = useSimSnap();
  const why = useWhy();
  const dir = usePanel<Directory>("name=directory", view?.date.abs ?? 0);
  const [mode, setMode] = useState<"list" | "found" | "firm">("list");
  const [firmId, setFirmId] = useState("");
  const [page, setPage] = useState<FirmPage | null>(null);
  const [firmErr, setFirmErr] = useState("");
  const [note, setNote] = useState<ActNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("RETAIL");
  const [cash, setCash] = useState("5000");
  const [loan, setLoan] = useState(false);
  const [bidPx, setBidPx] = useState("");
  const [paper, setPaper] = useState(false);
  const [buyer, setBuyer] = useState("");

  useEffect(() => {
    if (mode !== "firm" || !firmId) return;
    let stop = false;
    setFirmErr("");
    void fetch("/api/sim/firm/" + encodeURIComponent(firmId), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() as Promise<FirmPage> : null))
      .then((d) => {
        if (stop) return;
        if (!d?.id) setFirmErr("The firm page did not open.");
        else { setPage(d); setFirmErr(""); }
      })
      .catch(() => { if (!stop) setFirmErr("The firm page did not open."); });
    return () => { stop = true; };
  }, [mode, firmId, view?.date.abs, note?.text]);

  const go = async (cmd: unknown) => {
    setBusy(true);
    const n = await act(cmd);
    setNote(n);
    setBusy(false);
    return n;
  };

  const found = async () => {
    const cents = centsOf(cash);
    if (name.trim().length < 2) { setNote({ ok: false, text: "Give the firm a name." }); return; }
    if (cents === null) { setNote({ ok: false, text: "Name the cash you put in, in dollars." }); return; }
    const n = await go({ kind: "found", name: name.trim(), sector, cents, loan });
    const id = /\((frm_[^)]+)\)/.exec(n.text)?.[1];
    if (n.ok && id) { setFirmId(id); setPage(null); setMode("firm"); }
  };

  const firms = dir.data?.firms ?? [];
  const controlled = page ? runs(view?.companies, page.id) : false;
  const buyers = firms.filter((f) => f.id !== page?.id);

  const bid = async () => {
    if (!page) return;
    const cents = centsOf(bidPx);
    if (cents === null || cents < 1) { setNote({ ok: false, text: "Name a price per share." }); return; }
    await go({ kind: "bid", firm: page.id, cents, multiple: 0, paper });
  };

  const sellDivision = async () => {
    if (!page || !buyer) { setNote({ ok: false, text: "Name the firm that buys the division." }); return; }
    await go({ kind: "board", op: "sell", firm: page.id, into: buyer });
  };

  return (
    <div className="qa" data-phone={phone ? "1" : "0"} data-testid="businesses">
      <Note note={note} testId="businesses-note" />
      {mode === "list" ? (
        <>
          <div className="qa-head">
            <h2 className="qa-title">Every firm</h2>
            <Button variant="primary" disabled={busy} onClick={() => setMode("found")}>Found a firm</Button>
          </div>
          {dir.error ? <p className="quay-state" data-kind="error">{dir.error}</p> : null}
          {!dir.data && !dir.error ? <p className="quay-state">Reading the directory…</p> : null}
          {dir.data && !firms.length ? <p className="quay-empty">No firms on the book.</p> : null}
          <div className="qa-list">
            {firms.map((f) => (
              <div key={f.id} className="qa-row">
                <button type="button" className="qa-row-main" onClick={() => { setFirmId(f.id); setPage(null); setMode("firm"); }}>
                  <strong>{f.name}</strong>
                  <span className="qa-muted"> · {titleCase(f.sector)} · {f.sizeWord} · {f.owner} · {f.chief} · {f.listed ? "Listed" : "Private"}{f.family ? " · A family firm" : ""}</span>
                </button>
                <Fig word={f.profitWord} title={moneyTitle(f.profit)} eventId={f.profitEv} onWhy={why.open} />
              </div>
            ))}
          </div>
        </>
      ) : null}
      {mode === "found" ? (
        <div className="qa-block">
          <h2 className="qa-title">Found a firm</h2>
          <Field label="Name"><input className="qa-input" value={name} onChange={(e) => setName(e.target.value)} data-testid="businesses-name" /></Field>
          <Field label="Sector">
            <select className="qa-select" value={sector} onChange={(e) => setSector(e.target.value)} data-testid="businesses-sector">
              {(dir.data?.sectors ?? [sector]).map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
          </Field>
          <Field label="Cash you put in"><input className="qa-input" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} data-testid="businesses-cash" /></Field>
          <label className="qa-check"><input type="checkbox" checked={loan} onChange={(e) => setLoan(e.target.checked)} /> Borrow the rest</label>
          <div className="qa-actions">
            <Button variant="primary" disabled={busy} data-testid="businesses-found" onClick={() => void found()}>Found the firm</Button>
            <Button variant="ghost" onClick={() => setMode("list")}>Back to the city</Button>
          </div>
        </div>
      ) : null}
      {mode === "firm" && !page && !firmErr ? <p className="quay-state">Reading the firm…</p> : null}
      {mode === "firm" && !page && firmErr ? <p className="quay-state" data-kind="error">{firmErr}</p> : null}
      {mode === "firm" && page ? (
        <div className="qa-block">
          <div className="qa-head">
            <h2 className="qa-title">{page.name}</h2>
            <Button variant="ghost" onClick={() => setMode("list")}>Every firm</Button>
          </div>
          <p className="qa-muted">{page.kind === "bank" ? "The city bank" : `${titleCase(page.sector ?? "")} · ${page.goodName ?? ""} · ${page.listed ? "Listed" : "Private"}${page.family ? " · A family firm" : ""}`}</p>
          {page.accounts ? (
            <div className="qa-kv">
              <p><span className="label">Revenue</span><Fig word="Taken in" title={moneyTitle(page.accounts.revenue)} eventId={page.events?.revenue} onWhy={why.open} /></p>
              <p><span className="label">Cost</span><Fig word="Spent" title={moneyTitle(page.accounts.cost)} eventId={page.events?.profit} onWhy={why.open} /></p>
              <p><span className="label">Profit</span><Fig word={page.accounts.profit > 100 ? "In profit" : page.accounts.profit < -100 ? "Losing" : "Even"} title={moneyTitle(page.accounts.profit)} eventId={page.events?.profit} onWhy={why.open} /></p>
              <p><span className="label">Cash</span><Fig word={page.accounts.cash > 0 ? "In the till" : "Empty"} title={moneyTitle(page.accounts.cash)} eventId={page.events?.profit} onWhy={why.open} /></p>
              <p><span className="label">Debt</span><Fig word={page.accounts.debt > 0 ? "Borrowed" : "Clear"} title={moneyTitle(page.accounts.debt)} eventId={page.events?.debt} onWhy={why.open} /></p>
            </div>
          ) : null}
          {page.plant ? <p><span className="label">Plant</span> <Fig word={page.plant.word} title={`${page.plant.units.toFixed(1)} units`} eventId={page.plant.eventId} onWhy={why.open} /></p> : null}
          <p><span className="label">Staff</span> {page.people?.length ? page.people.map((p, i) => <span key={p.index}>{i ? ", " : " "}<Named name={p.name} /></span>) : " No one named"}{page.staff && page.people && page.staff > page.people.length ? ` · ${page.staff.toLocaleString("en-US")} on the books` : ""}</p>
          <p><span className="label">Suppliers</span> {page.suppliers?.length ? page.suppliers.map((s, i) => <span key={s.id}>{i ? ", " : " "}<Named name={s.name} /> ({s.goodName})</span>) : " None on the book"}</p>
          <p><span className="label">Holders</span> {page.holders?.length ? page.holders.map((h, i) => <span key={h.id}>{i ? ", " : " "}<Named name={h.name} /> ({h.shares.toLocaleString("en-US")})</span>) : " No holders"}</p>
          <p><span className="label">Board</span> {page.board?.length ? page.board.map((b, i) => <span key={b.id}>{i ? " · " : " "}<Named name={b.name} />, {b.role}</span>) : " No seat named"}</p>
          {page.kind !== "bank" && controlled ? (
            <div className="qa-block">
              <Field label="Buyer of the division">
                <select className="qa-select" value={buyer} onChange={(e) => setBuyer(e.target.value)} data-testid="businesses-buyer">
                  <option value="">Choose a firm</option>
                  {buyers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
              <Button variant="primary" disabled={busy} data-testid="businesses-sell" onClick={() => void sellDivision()}>Sell the division</Button>
            </div>
          ) : null}
          {page.kind !== "bank" && !controlled && page.listed ? (
            <div className="qa-block">
              <div className="qa-seg" role="group" aria-label="Kind of bid">
                <button type="button" aria-pressed={!paper} onClick={() => setPaper(false)}>Friendly</button>
                <button type="button" aria-pressed={paper} onClick={() => setPaper(true)}>Hostile</button>
              </div>
              <p className="qa-muted">{paper ? "Hostile pays with shares of a listed firm you run." : "Friendly pays cash."}</p>
              <Field label="Price per share"><input className="qa-input" inputMode="decimal" value={bidPx} onChange={(e) => setBidPx(e.target.value)} data-testid="businesses-bid-price" /></Field>
              <Button variant="primary" disabled={busy} data-testid="businesses-bid" onClick={() => void bid()}>Bid</Button>
            </div>
          ) : null}
          {page.kind !== "bank" && !controlled && !page.listed ? <p className="qa-muted">This firm is private. A bid needs a listing.</p> : null}
        </div>
      ) : null}
      <Because id={why.id} lines={why.lines} />
    </div>
  );
}
