"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { act, useSimSnap, type ActNote } from "@/shell/simSession";
import { Because, Field, Fig, Note, centsOf, moneyTitle, usePanel, usePhone, useWhy } from "@/apps/businesses/sheet";
import "@/apps/businesses/sheet.css";

interface Home {
  id: number; neighbourhood: string; price: number; rent: number; mine: boolean; live: boolean; vacant: boolean;
  size?: number; condition?: number; missed?: number; mortgage?: number; eventId?: number;
  owner?: { name: string } | null; tenant?: { name: string } | null;
}
interface District { name: string; distance: number; desirability: number; price: number; eventId?: number }
interface Homes { homes: Home[]; districts: District[] }

function place(d: District): string {
  if (d.distance < 1) return "By the water";
  if (d.distance < 2.5) return "In the city";
  return "On the hill";
}
function desire(d: District): string {
  if (d.desirability < 1) return "Plain";
  if (d.desirability < 1.5) return "Comfortable";
  if (d.desirability < 2) return "Desired";
  return "The best streets";
}
function fabric(h: Home): string {
  const c = h.condition ?? 0;
  if (c < 40) return "Worn";
  if (c < 75) return "Fair";
  return "Sound";
}

export default function PropertyApp() {
  const phone = usePhone();
  const { view } = useSimSnap();
  const why = useWhy();
  const panel = usePanel<Homes>("name=homes", `${view?.date.abs ?? 0}:${view?.cash ?? 0}`);
  const [id, setId] = useState<number | null>(null);
  const [offer, setOffer] = useState("");
  const [rent, setRent] = useState("");
  const [note, setNote] = useState<ActNote | null>(null);
  const [busy, setBusy] = useState(false);
  const homes = panel.data?.homes ?? [];
  const districts = panel.data?.districts ?? [];
  const forSale = homes.filter((h) => !h.mine && (h.vacant || !h.owner));
  const toLet = homes.filter((h) => !h.mine && !h.vacant && !!h.owner);
  const mine = homes.filter((h) => h.mine);
  const home = homes.find((h) => h.id === id) ?? null;
  const listing = home && !home.mine ? home : null;

  const go = async (cmd: unknown) => {
    setBusy(true);
    const n = await act(cmd);
    setNote(n);
    setBusy(false);
  };

  const bid = () => {
    if (!listing) { setNote({ ok: false, text: "Choose a home that is for sale or to let." }); return; }
    const cents = offer.trim() ? centsOf(offer) : 0;
    if (cents === null) { setNote({ ok: false, text: "Name a price, or leave it blank to pay the asking price." }); return; }
    void go({ kind: "homebid", id: listing.id, cents });
  };

  return (
    <div className="qa" data-phone={phone ? "1" : "0"} data-testid="property">
      <Note note={note} testId="property-note" />
      <h2 className="qa-title">Districts</h2>
      <div className="qa-list">
        {districts.map((d) => (
          <div key={d.name} className="qa-row">
            <span className="qa-row-main"><strong>{d.name}</strong> <span className="qa-muted">· {place(d)} · {desire(d)}</span></span>
            <Fig word="The index" title={moneyTitle(d.price)} eventId={d.eventId} onWhy={why.open} />
          </div>
        ))}
      </div>
      <HomeList title="For sale" rows={forSale} id={id} setId={setId} onWhy={why.open} />
      <HomeList title="To let" rows={toLet} id={id} setId={setId} onWhy={why.open} />
      <HomeList title="Your homes" rows={mine} id={id} setId={setId} onWhy={why.open} empty="You own no home yet. Bid on one." />
      {listing ? (
        <div className="qa-block">
          <Field label="Your price, or blank for the asking price">
            <input className="qa-input" inputMode="decimal" value={offer} onChange={(e) => setOffer(e.target.value)} data-testid="property-offer" />
          </Field>
          <Button variant="primary" disabled={busy} data-testid="property-bid" onClick={bid}>Bid</Button>
        </div>
      ) : null}
      {home?.mine ? (
        <div className="qa-block">
          <p>{home.live ? "You live here." : "You do not live here."} {fabric(home)}. {home.mortgage ? "Mortgaged." : "No mortgage."}</p>
          <Field label="Monthly rent"><input className="qa-input" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} data-testid="property-rent" /></Field>
          <div className="qa-actions">
            <Button variant="secondary" disabled={busy} onClick={() => void go({ kind: "move", id: home.id })}>Move</Button>
            <Button variant="secondary" disabled={busy} onClick={() => {
              const cents = centsOf(rent);
              if (cents === null || cents < 1) { setNote({ ok: false, text: "Name a monthly rent." }); return; }
              void go({ kind: "let", id: home.id, cents });
            }}>Let</Button>
            <Button variant="secondary" disabled={busy} onClick={() => void go({ kind: "homesell", id: home.id })}>Sell</Button>
            <Button variant="secondary" disabled={busy} onClick={() => void go({ kind: "mortgage", id: home.id, cents: 0 })}>Mortgage</Button>
          </div>
        </div>
      ) : null}
      {!homes.length && !panel.error ? <p className="qa-empty">No homes on the board yet.</p> : null}
      {panel.error ? <p className="qa-muted">{panel.error}</p> : null}
      <Because id={why.id} lines={why.lines} />
    </div>
  );
}

function HomeList({ title, rows, id, setId, onWhy, empty }: {
  title: string; rows: Home[]; id: number | null; setId: (n: number) => void; onWhy: (id: number) => void; empty?: string;
}) {
  return (
    <div className="qa-block">
      <h2 className="qa-title">{title}</h2>
      {!rows.length && empty ? <p className="qa-empty">{empty}</p> : null}
      <div className="qa-list">
        {rows.map((h) => (
          <div key={h.id} className="qa-row" data-on={id === h.id ? "1" : "0"}>
            <button type="button" className="qa-row-main" onClick={() => setId(h.id)}>
              <strong>{h.neighbourhood}</strong>
              <span className="qa-muted"> · {h.vacant ? "Empty" : h.tenant ? `Let to ${h.tenant.name}` : "Occupied"}{h.live ? " · You live here" : ""}{h.mine ? " · Yours" : ""}</span>
            </button>
            <Fig word={h.mine ? "Yours" : "Asking"} title={moneyTitle(h.price)} eventId={h.eventId} onWhy={onWhy} />
          </div>
        ))}
      </div>
    </div>
  );
}
