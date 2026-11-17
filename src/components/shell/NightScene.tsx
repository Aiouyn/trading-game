"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { DriftLine, SceneData } from "@/shell/simSession";

// Port Avalon at night, drawn from the live world: one building per listed firm along the
// harbour (height from its market value, lit windows from its staff), the exchange in the
// middle with the index, the ships by where they are, and one real line at a time beneath.

const W = 720;
const H = 340;
const WATER = 252;

/** A small deterministic hash, so the same firm always gets the same windows. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Tower { x: number; w: number; h: number; name: string; lit: [number, number][] }

function towers(scene: SceneData): Tower[] {
  const firms = scene.firms.slice(0, 28);
  if (!firms.length) return [];
  const caps = firms.map((f) => Math.max(1, f.cap));
  const lo = Math.log(Math.min(...caps));
  const hi = Math.log(Math.max(...caps));
  const span = Math.max(0.0001, hi - lo);
  const maxStaff = Math.max(1, ...firms.map((f) => f.staff));
  // Leave the middle for the exchange.
  const gapL = W / 2 - 46;
  const gapR = W / 2 + 46;
  const slots = firms.length;
  const usable = W - 40 - (gapR - gapL);
  const step = usable / slots;
  const out: Tower[] = [];
  firms.forEach((f, i) => {
    let x = 20 + i * step;
    if (x + step > gapL) x += gapR - gapL;
    const h0 = hash(f.name);
    const w = Math.max(10, step - 4 - (h0 % 4));
    const t = (Math.log(Math.max(1, f.cap)) - lo) / span;
    const h = 46 + t * 150 + (h0 % 13);
    const lit: [number, number][] = [];
    const cols = Math.max(1, Math.floor((w - 4) / 5));
    const rows = Math.max(1, Math.floor((h - 8) / 7));
    const share = f.staff > 0 ? 0.12 + 0.6 * (f.staff / maxStaff) : 0.25;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = hash(`${f.name}:${r}:${c}`) % 1000;
        if (v < share * 1000) lit.push([x + 3 + c * 5, WATER - h + 6 + r * 7]);
      }
    }
    out.push({ x, w, h, name: f.name, lit });
  });
  return out;
}

function Ships({ scene }: { scene: SceneData }) {
  const docked = Math.min(scene.berthed, 8);
  const waiting = Math.min(scene.waiting, 5);
  const out: ReactElement[] = [];
  for (let i = 0; i < docked; i++) {
    const x = 60 + i * 34;
    out.push(<path key={`b${i}`} className="ns-ship" d={`M${x} ${WATER + 14} h22 l-4 6 h-14 z M${x + 6} ${WATER + 14} v-7 h8 v7`} />);
  }
  for (let i = 0; i < waiting; i++) {
    const x = W - 70 - i * 40;
    const y = WATER + 52 + (i % 2) * 12;
    out.push(
      <g key={`w${i}`} className="ns-drift" style={{ animationDelay: `${i * 1.7}s` }}>
        <path className="ns-ship ns-far" d={`M${x} ${y} h18 l-3 5 h-12 z M${x + 5} ${y} v-6 h7 v6`} />
        <circle className="ns-light" cx={x + 9} cy={y - 8} r={1.4} />
      </g>,
    );
  }
  return <g>{out}</g>;
}

export default function NightScene({ scene, lines }: { scene?: SceneData; lines: DriftLine[] }) {
  const built = useMemo(() => (scene ? towers(scene) : []), [scene]);
  const said = useMemo(() => lines.filter((l) => l.text && l.text.length > 12).slice(0, 12), [lines]);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (said.length < 2) return;
    const id = window.setInterval(() => setAt((n) => (n + 1) % said.length), 4200);
    return () => window.clearInterval(id);
  }, [said.length]);
  const line = said.length ? said[at % said.length] : null;
  const ex = W / 2;
  return (
    <figure className="ns" data-testid="title-scene">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Port Avalon at night: the exchange, the firms along the harbour and the ships">
        <g className="ns-stars">
          {Array.from({ length: 26 }, (_, i) => {
            const h = hash(`star${i}`);
            return <circle key={i} cx={(h % W)} cy={10 + ((h >> 10) % 120)} r={(h % 3) === 0 ? 1.1 : 0.7} />;
          })}
        </g>
        {built.map((t) => (
          <g key={t.name}>
            <title>{t.name}</title>
            <rect className="ns-tower" x={t.x} y={WATER - t.h} width={t.w} height={t.h} />
            {t.lit.map(([x, y], i) => <rect key={i} className="ns-win" x={x} y={y} width={2.4} height={3} />)}
          </g>
        ))}
        <g className="ns-exchange">
          <path d={`M${ex - 40} ${WATER} v-118 h80 v118 z`} />
          <path className="ns-pediment" d={`M${ex - 46} ${WATER - 118} L${ex} ${WATER - 146} L${ex + 46} ${WATER - 118} z`} />
          {[-28, -14, 0, 14, 28].map((dx) => <rect key={dx} className="ns-column" x={ex + dx - 2} y={WATER - 108} width={4} height={98} />)}
          {scene?.index != null ? (
            <text className="ns-index" x={ex} y={WATER - 124} textAnchor="middle">{scene.index.toFixed(1)}</text>
          ) : null}
        </g>
        <line className="ns-quay" x1={0} y1={WATER} x2={W} y2={WATER} />
        <g className="ns-reflect">
          {built.filter((_, i) => i % 2 === 0).map((t) => (
            <line key={t.name} x1={t.x + t.w / 2} y1={WATER + 6} x2={t.x + t.w / 2} y2={WATER + 6 + Math.min(40, t.h / 4)} />
          ))}
        </g>
        {scene ? <Ships scene={scene} /> : null}
      </svg>
      <figcaption>
        {line ? <p key={at} className="ns-line" data-testid="title-line">{line.text}</p> : null}
        {scene && scene.index != null ? (
          <p className="ns-legend muted">
            {scene.firms.length} firms on the exchange · {scene.berthed} ships at berth · {scene.waiting} waiting · {scene.sailing} at sea
          </p>
        ) : null}
      </figcaption>
    </figure>
  );
}
