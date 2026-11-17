"use client";
// City on the simulation: the district map, real parcels, firms' plants and the port.
// @city-e2e-seam stays a dynamic import of the renderer only when NEXT_PUBLIC_CITY_E2E=1.
// This view does not mount the WebGL city.
import "@city-e2e-seam";
import { useEffect, useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { dollars, explain, useSimSnap, type ExplainLine } from "@/shell/simSession";
import { BAY, DISTRICTS, FIRST_DISTRICT } from "./districts";
import { DV } from "./districtStrings";
import "./district.css";

const VIEW = { x: -400, z: -360, w: 800, h: 680 } as const;
const PAGE = 40;

interface SimDistrict {
  name: string;
  distance: number;
  desirability: number;
  price: number;
  eventId: number;
  homes: number;
  plants: number;
  vacant: number;
}
interface ParcelRow {
  id: number;
  kind: "home" | "plant";
  price: number;
  rent: number;
  mine: boolean;
  live: boolean;
  vacant: boolean;
  owner: string;
  who: string;
}
interface Person { index: number; name: string }
interface ParcelPage {
  id: number;
  kind?: string;
  neighbourhood?: string;
  price?: number;
  rent?: number;
  vacant?: boolean;
  mine?: boolean;
  live?: boolean;
  owner?: Person | null;
  tenant?: Person | null;
  ownerName?: string;
  firm?: { id: string; name: string } | null;
  lives?: Person[];
  eventId?: number;
}
interface CityPanel {
  eventId: number;
  homeDistrict: string;
  districts: SimDistrict[];
  parcels: ParcelRow[];
  port: {
    name: string;
    berths: number;
    berthed: number;
    cranes: number;
    freight: number;
    closed: boolean;
    strike: boolean;
    eventId: number;
    ships: { name: string; way: string; line: string; eta: number }[];
  };
  plants: { name: string; fuel: string; utility: string; down: boolean }[];
  power: { wholesale: number; tariff: number; marginal: string; eventId: number };
}

function nearWord(km: number): string {
  if (km < 1) return "On the port";
  if (km < 2) return "Near the port";
  return "Inland";
}
function desireWord(d: number): string {
  if (d > 1.8) return "Sought";
  if (d > 1.2) return "Comfortable";
  return "Working";
}
function countWord(n: number): string {
  if (n <= 0) return "None";
  if (n < 20) return "A few";
  if (n < 200) return "A street";
  return "Crowded";
}
function placeWord(p: ParcelRow): string {
  if (p.kind === "plant") return "A plant";
  if (p.live) return "Your home";
  if (p.mine) return "Yours";
  if (p.vacant) return "Empty";
  return "A home";
}

export default function DistrictView() {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const tick = useSimSnap().view?.date.abs;
  const [sel, setSel] = useState(FIRST_DISTRICT);
  const [picked, setPicked] = useState(false);
  const [panel, setPanel] = useState<CityPanel | null>(null);
  const [page, setPage] = useState(PAGE);
  const [detail, setDetail] = useState<ParcelPage | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const [whyId, setWhyId] = useState<number | null>(null);
  const [why, setWhy] = useState<ExplainLine[]>([]);
  const req = useRef(0);
  const d = DISTRICTS.find((x) => x.distId === sel) ?? DISTRICTS[0]!;

  useEffect(() => {
    const ac = new AbortController();
    const q = encodeURIComponent(d.name);
    void fetch(`/api/sim/panel?name=city&district=${q}`, { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() as Promise<CityPanel> : null))
      .then((j) => { if (j && Array.isArray(j.districts)) setPanel(j); })
      .catch(() => {});
    return () => ac.abort();
  }, [d.name, tick]);

  useEffect(() => {
    if (picked || !panel?.homeDistrict) return;
    const hit = DISTRICTS.find((x) => x.name === panel.homeDistrict);
    if (hit) setSel(hit.distId);
  }, [panel, picked]);

  const choose = (id: string) => {
    setPicked(true);
    setSel(id);
    setPage(PAGE);
    setDetail(null);
    setDetailErr("");
  };

  const ask = (id: number) => {
    const n = ++req.current;
    setWhyId(id);
    setWhy([]);
    void explain(id).then((lines) => { if (req.current === n) setWhy(lines); });
  };

  const openParcel = (id: number) => {
    setDetail(null);
    setDetailErr("");
    void fetch(`/api/sim/parcel/${id}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) { setDetailErr("No such parcel."); return; }
        setDetail(await r.json() as ParcelPage);
      })
      .catch(() => setDetailErr("The parcel could not be read."));
  };

  const sim = panel?.districts.find((x) => x.name === d.name);
  const plants = (panel?.parcels ?? []).filter((p) => p.kind === "plant");
  const homes = (panel?.parcels ?? []).filter((p) => p.kind === "home");
  const shown = homes.slice(0, page);
  const port = panel?.port;

  const ownerOf = (p: ParcelPage): string => p.ownerName || p.owner?.name || "a bank or a fund";
  const livesOf = (p: ParcelPage): string => {
    const names = (p.lives ?? []).map((x) => x.name).filter(Boolean);
    if (names.length) return names.slice(0, 8).join(", ") + (names.length > 8 ? ` and ${names.length - 8} more` : "");
    if (p.tenant?.name) return p.tenant.name;
    if (p.vacant) return "nobody";
    return "nobody on the roll";
  };

  return (
    <div className={`dv${phone ? " dv-phone" : ""}`} data-testid="city" data-district={d.distId}>
      <div className="dv-map">
        <svg viewBox={`${VIEW.x} ${VIEW.z} ${VIEW.w} ${VIEW.h}`} role="img" aria-label={DV.map} data-testid="dv-map">
          <circle className="dv-water" cx={BAY.cx} cy={BAY.cz} r={BAY.r} />
          <text className="dv-water-label" x={BAY.cx} y={VIEW.z + VIEW.h - 24} textAnchor="middle" aria-hidden="true">{DV.bay}</text>
          {DISTRICTS.map((x) => {
            const on = x.distId === d.distId;
            const [cx, cz] = x.center;
            const east = cx > 150;
            return (
              <g key={x.distId} aria-hidden="true" data-testid="dv-marker" data-id={x.distId} data-on={on || undefined}>
                {on && <circle className="dv-ring" cx={cx} cy={cz} r={20} />}
                <circle className={`dv-dot${on ? " on" : ""}`} cx={cx} cy={cz} r={on ? 11 : 8} onClick={() => choose(x.distId)} />
                <text className={`dv-label${on ? " on" : ""}`} x={east ? cx + 10 : cx + 18} y={east ? cz + 40 : cz + 8} textAnchor={east ? "end" : "start"}>{x.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="dv-panel">
        <div className="dv-head">
          <h2 data-testid="dv-name">{d.name}</h2>
          <p className="muted">{DV.city} · {d.landmark}</p>
        </div>
        {sim ? (
          <div className="dv-facts">
            <p><span className="dv-word" title={`${sim.distance.toFixed(1)} km`}>{nearWord(sim.distance)}</span></p>
            <p>
              <span className="dv-word" title={dollars(sim.price)}>{desireWord(sim.desirability)}</span>
              <button type="button" className="q-why" data-testid="city-why" onClick={() => ask(sim.eventId)}>why?</button>
            </p>
            <p className="muted">
              <span title={`${sim.homes} homes`}>{countWord(sim.homes)}</span>
              {" · "}
              <span title={`${sim.plants} plants`}>{sim.plants ? `${sim.plants === 1 ? "One plant" : "Plants"}` : "No plant"}</span>
              {" · "}
              <span title={`${sim.vacant} empty`}>{sim.vacant ? "Some empty" : "Lived in"}</span>
            </p>
            {whyId === sim.eventId ? (
              <div className="q-why-body">
                {why.length ? why.map((line, i) => (
                  <p key={`${line.id}-${line.depth}-${i}`} style={{ paddingLeft: line.depth * 12 }}>
                    {line.missing ? line.msg : `${line.name ? `${line.name}: ` : ""}${line.msg}`}
                  </p>
                )) : <p className="muted">Reading the cause…</p>}
              </div>
            ) : null}
          </div>
        ) : <p className="muted">Reading the district…</p>}

        <h3>Parcels</h3>
        <ul className="dv-parcels" aria-label="Parcels">
          {[...plants, ...shown].map((p) => (
            <li key={p.id}>
              <button type="button" data-testid="city-parcel" data-id={p.id} onClick={() => openParcel(p.id)}>
                <span>{placeWord(p)}</span>
                <span className="muted" title={dollars(p.price)}>{p.owner || "a bank or a fund"}{p.who ? ` · ${p.who}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {homes.length > page ? (
          <button type="button" className="dv-more" onClick={() => setPage((n) => n + PAGE)}>More homes</button>
        ) : null}
        {!panel ? null : plants.length + homes.length === 0 ? <p className="muted">No parcel in this district.</p> : null}

        {detailErr ? <p className="muted">{detailErr}</p> : null}
        {detail ? (
          <div className="dv-detail" data-testid="city-detail" aria-live="polite">
            <h3>{detail.kind === "plant" ? "Plant" : "Home"} #{detail.id}</h3>
            <p>Owned by <b title={detail.price !== undefined ? dollars(detail.price) : undefined}>{ownerOf(detail)}</b></p>
            <p>{detail.live ? "You live here. " : ""}Lives here: {livesOf(detail)}</p>
            {detail.firm?.name ? <p>The firm {detail.firm.name}</p> : null}
            {detail.eventId !== undefined ? (
              <button type="button" className="q-why" onClick={() => ask(detail.eventId!)}>why?</button>
            ) : null}
            {detail.eventId !== undefined && whyId === detail.eventId ? (
              <div className="q-why-body">
                {why.length ? why.map((line, i) => (
                  <p key={`${line.id}-${line.depth}-${i}`} style={{ paddingLeft: line.depth * 12 }}>
                    {line.missing ? line.msg : `${line.name ? `${line.name}: ` : ""}${line.msg}`}
                  </p>
                )) : <p className="muted">Reading the cause…</p>}
              </div>
            ) : null}
          </div>
        ) : null}

        {port ? (
          <div className="dv-card">
            <h3>{port.name}</h3>
            <p>
              <span className="dv-word" title={`${port.berthed} of ${port.berths} berths · ${port.ships.length} ships`}>
                {port.strike ? "On strike" : port.closed ? "Closed" : "Open"}
              </span>
              <button type="button" className="q-why" onClick={() => ask(port.eventId)}>why?</button>
            </p>
            <p className="muted">{port.cranes} cranes · {port.ships.slice(0, 4).map((s) => s.name).join(", ") || "no ship in sight"}</p>
          </div>
        ) : null}

        {panel?.plants?.length ? (
          <div className="dv-card">
            <h3>Power</h3>
            <ul className="dv-list">
              {panel.plants.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <span>{p.name}</span>
                  <span className="muted" title={p.utility}>{p.down ? "Down" : "Running"} · {p.fuel}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
