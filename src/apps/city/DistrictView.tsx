"use client";
// M1-10 City app: a static, read-only view of Port Avalon's districts, opening on the Financial Mile (the board's
// documented static fallback; see districts.ts). No WebGL, no three.js, no network, no animation; nothing to buy,
// own or change: the only controls pick a district to read its landmark and go back to Broker.
// The 3D renderer seam (CityWindow, src/city) is kept for when city data is published; the shell does not mount it.
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { BAY, DISTRICTS, FIRST_DISTRICT } from "./districts";
import { DV } from "./districtStrings";
import "./district.css";

// Map frame in metres (x east, z south): every district centre and its label fit, and the top of the bay shows.
const VIEW = { x: -400, z: -360, w: 800, h: 680 } as const;
const brief = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function DistrictView() {
  const store = useShellStore();
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const [sel, setSel] = useState(FIRST_DISTRICT);
  const d = DISTRICTS.find((x) => x.distId === sel) ?? DISTRICTS[0]!;
  const back = () => {
    const s = store.getState();
    // Desktop: bring this workspace's Broker to the front (the Trade layout already has one); open it only if none.
    const w = s.local.windows.filter((x) => x.app === "broker" && x.workspace === s.local.activeWorkspace && !x.collapsed).at(-1);
    if (w && viewportOf(s.vw) === "desktop") s.focus(w); else s.open("broker");
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
            const east = cx > 150; // eastern labels hang below their dot, ending at it, so they stay in the frame and clear their neighbours
            return (
              <g key={x.distId} aria-hidden="true" data-testid="dv-marker" data-id={x.distId} data-on={on || undefined}>
                {on && <circle className="dv-ring" cx={cx} cy={cz} r={20} />}
                <circle className={`dv-dot${on ? " on" : ""}`} cx={cx} cy={cz} r={on ? 11 : 8} onClick={() => setSel(x.distId)} />
                <text className={`dv-label${on ? " on" : ""}`} x={east ? cx + 10 : cx + 18} y={east ? cz + 40 : cz + 8} textAnchor={east ? "end" : "start"}>{x.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="dv-panel">
        <div className="dv-head">
          <h2 data-testid="dv-name">{d.name}</h2>
          <p className="muted">{DV.city}</p>
        </div>
        <p className="dv-status" role="note" data-testid="dv-readonly">{DV.readOnly}</p>
        <div className="dv-detail" data-testid="dv-detail" aria-live="polite">
          <h3 data-testid="dv-landmark">{`${DV.landmark}: ${d.landmark}`}</h3>
          <p className="muted" data-testid="dv-brief">{`${brief(d.brief)}.`}</p>
        </div>
        <ul className="dv-list" aria-label={DV.districts} data-testid="dv-list">
          {DISTRICTS.map((x) => (
            <li key={x.distId}>
              <Button size="sm" className={x.distId === d.distId ? "dv-on" : undefined} aria-pressed={x.distId === d.distId}
                data-testid="dv-pick" data-id={x.distId} onClick={() => setSel(x.distId)}>{x.name}</Button>
            </li>
          ))}
        </ul>
        <Button className="dv-back" data-testid="dv-back" onClick={back}>{DV.backToBroker}</Button>
      </div>
    </div>
  );
}
