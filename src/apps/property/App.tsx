"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { gameDate } from "@/components/ui/format";
import type { Residence, RentalRow } from "../../../sim/modules/property/index";
import { useAct, useLife } from "@/apps/profile/data";
import { Because, Field, Fig, Note, centsOf, moneyTitle, usePanel, usePhone, useWhy } from "@/apps/businesses/sheet";
import "@/apps/businesses/sheet.css";

interface Home {
  id: number; neighbourhood: string; price: number; rent: number; mine: boolean; live: boolean; vacant: boolean;
  size?: number; condition?: number; missed?: number; mortgage?: number; eventId?: number;
  owner?: { name: string } | null; tenant?: { name: string } | null;
}
interface District { name: string; distance: number; desirability: number; price: number; eventId?: number }
interface Homes { homes: Home[]; districts: District[]; rentals: RentalRow[]; current: Residence | null }
type Tab = "rent" | "buy" | "manage" | "districts";

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
function fabric(h: { condition?: number }): string {
  const c = h.condition ?? 0;
  if (c < 40) return "Worn";
  if (c < 75) return "Fair";
  return "Sound";
}

export function ResidenceDetails({ home }: { home: Residence | null | undefined }) {
  if (!home) return <p className="qa-muted">You have no home recorded.</p>;
  return (
    <div data-testid="home-current">
      <p><strong>{home.neighbourhood}</strong> · {fabric(home)}{home.tenure === "owned" ? " · You own it" : home.tenure === "shared" ? " · Shared home" : ""}</p>
      {home.due !== null ? <p><span className="num">{moneyTitle(home.rent)}</span> a month · Rent due {gameDate(home.due)}</p> : null}
    </div>
  );
}

export default function PropertyApp() {
  const phone = usePhone();
  const { life } = useLife();
  const { note, busy, go } = useAct();
  const why = useWhy();
  const [rev, setRev] = useState(0);
  const [tab, setTab] = useState<Tab>("rent");
  const panel = usePanel<Homes>("name=homes", `${life?.date.abs ?? 0}:${rev}`);
  const [id, setId] = useState<number | null>(null);
  const [offer, setOffer] = useState("");
  const [rent, setRent] = useState("");
  const [draw, setDraw] = useState("");
  const [error, setError] = useState("");
  const homes = panel.data?.homes ?? [];
  const districts = panel.data?.districts ?? [];
  const forSale = homes.filter((h) => !h.mine && !h.live);
  const rentals = (() => {
    const groups = new Map<string, RentalRow & { count: number }>();
    for (const r of panel.data?.rentals ?? []) {
      const key = [r.neighbourhood, r.rent, r.size, fabric(r)].join("|");
      const seen = groups.get(key);
      if (seen) seen.count += 1; else groups.set(key, { ...r, count: 1 });
    }
    return [...groups.values()].sort((a, b) => a.rent - b.rent || a.neighbourhood.localeCompare(b.neighbourhood));
  })();
  const nowRent = panel.data?.current?.rent ?? 0;
  const mine = homes.filter((h) => h.mine);
  const home = homes.find((h) => h.id === id) ?? null;
  const listing = home && !home.mine ? home : null;

  const send = async (cmd: unknown) => {
    setError("");
    const result = await go(cmd);
    if (result.ok) setRev((value) => value + 1);
  };

  const bid = () => {
    if (!listing) { setError("Choose a home to buy."); return; }
    const cents = offer.trim() ? centsOf(offer) : 0;
    if (cents === null) { setError("Name a price, or leave it blank to pay the asking price."); return; }
    void send({ kind: "homebid", id: listing.id, cents });
  };

  return (
    <div className="qa" data-phone={phone ? "1" : "0"} data-testid="property">
      <Note note={error ? { ok: false, text: error } : note} testId="property-note" />
      <h2 className="qa-title">Your home</h2>
      {panel.data ? <ResidenceDetails home={panel.data.current} /> : <p className="qa-muted">Opening the housing register…</p>}
      <div className="qa-actions" role="group" aria-label="Housing">
        {(["rent", "buy", "manage", "districts"] as const).map((option) => (
          <Button key={option} variant={tab === option ? "primary" : "secondary"} aria-pressed={tab === option} onClick={() => { setTab(option); setId(null); }}>
            {{ rent: "Rent", buy: "Buy", manage: "Your properties", districts: "Districts" }[option]}
          </Button>
        ))}
      </div>
      {tab === "rent" && panel.data ? (
        <div className="qa-block">
          <h2 className="qa-title">Homes to rent</h2>
          {rentals.length ? (
            <div className="qa-list">
              {rentals.map((h) => (
                <div className="qa-row" key={h.id} data-testid="rental-listing">
                  <span className="qa-row-main"><strong>{h.neighbourhood}</strong> <span className="qa-muted">· {districts.find((d) => d.name === h.neighbourhood) ? place(districts.find((d) => d.name === h.neighbourhood)!) + " · " : ""}{fabric(h)} · {h.size <= 2 ? "Small" : h.size <= 4 ? "Mid-size" : "Large"}{h.count > 1 ? ` · ${h.count} available` : ""}</span></span>
                  <span className="num">{moneyTitle(h.rent)} / month{nowRent && h.rent !== nowRent ? <span className="qa-muted"> · {moneyTitle(Math.abs(h.rent - nowRent))} {h.rent < nowRent ? "less" : "more"}</span> : null}</span>
                  <Button size="sm" variant="secondary" disabled={busy} data-testid="rent-home" onClick={() => void send({ kind: "rentHome", id: h.id })}>Rent and move in</Button>
                </div>
              ))}
            </div>
          ) : <p className="qa-empty">No vacant rentals today.</p>}
        </div>
      ) : null}
      {tab === "buy" && panel.data ? (
        <HomeList title="For sale" rows={forSale} id={id} setId={setId} onWhy={why.open} empty="No homes listed for sale today." />
      ) : null}
      {tab === "manage" && panel.data ? (
        <HomeList title="Your properties" rows={mine} id={id} setId={setId} onWhy={why.open} empty="You own no home yet." />
      ) : null}
      {tab === "districts" ? (
        <div className="qa-list">
          {districts.map((d) => (
            <div key={d.name} className="qa-row">
              <span className="qa-row-main"><strong>{d.name}</strong> <span className="qa-muted">· {place(d)} · {desire(d)}</span></span>
              <Fig word="The index" title={moneyTitle(d.price)} eventId={d.eventId} onWhy={why.open} />
            </div>
          ))}
        </div>
      ) : null}
      {listing ? (
        <div className="qa-block">
          <Field label="Your price, or blank for the asking price">
            <input className="qa-input" inputMode="decimal" value={offer} onChange={(e) => setOffer(e.target.value)} data-testid="property-offer" />
          </Field>
          <Button variant="primary" disabled={busy} data-testid="property-bid" onClick={bid}>{busy ? "Sending…" : "Bid"}</Button>
        </div>
      ) : null}
      {home?.mine ? (
        <div className="qa-block">
          <p>{home.live ? "You live here." : "You do not live here."} {fabric(home)}. {home.mortgage ? "Mortgaged." : "No mortgage. Name an amount, or leave it blank and the bank lends all it will."}</p>
          <Field label="Monthly rent"><input className="qa-input" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} data-testid="property-rent" /></Field>
          <Field label="Mortgage, in dollars. Blank takes all the bank will lend.">
            <input className="qa-input" inputMode="decimal" value={draw} onChange={(e) => setDraw(e.target.value)} data-testid="property-mortgage" />
          </Field>
          <div className="qa-actions">
            <Button variant="secondary" disabled={busy || home.live || !home.vacant} onClick={() => void send({ kind: "move", id: home.id })}>{busy ? "Sending…" : "Move in"}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => {
              const cents = centsOf(rent);
              if (cents === null || cents < 1) { setError("Name a monthly rent."); return; }
              void send({ kind: "let", id: home.id, cents });
            }}>{busy ? "Sending…" : "Let it"}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => void send({ kind: "homesell", id: home.id })}>{busy ? "Sending…" : "Sell"}</Button>
            <Button variant="secondary" disabled={busy} data-testid="property-mortgage-go" onClick={() => {
              const raw = draw.trim();
              const cents = raw ? centsOf(raw) : 0;
              if (cents === null || (raw && cents < 1)) { setError("Name an amount in dollars, or leave it blank."); return; }
              void send({ kind: "mortgage", id: home.id, cents });
            }}>{busy ? "Sending…" : "Take the mortgage"}</Button>
          </div>
        </div>
      ) : null}
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
              <span className="qa-muted"> · {h.vacant ? "Empty" : h.tenant ? `Let to ${h.tenant.name}` : "Occupied"}{h.live ? " · You live here" : ""}{h.mine ? " · Yours" : ""}{h.owner?.name && !h.mine ? ` · ${h.owner.name}` : null}</span>
            </button>
            <Fig word={h.mine ? "Yours" : "Asking"} title={moneyTitle(h.price)} eventId={h.eventId} onWhy={onWhy} />
          </div>
        ))}
      </div>
    </div>
  );
}
