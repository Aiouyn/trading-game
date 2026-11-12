// Card 41: where the desktop fill-ack column goes (17 §3.10.2 "top-right under the strip"; "never cover an active
// OrderPad: the column moves top-left when a ticket sits under it"; 17-AT-40). Layout only: measures the strip, the shelf
// and every visible Broker ticket, and picks the first corner whose box covers no ticket (else the least covered).
import type { CSSProperties } from "react";

export type Corner = "tr" | "tl" | "br" | "bl";
const GAP = 8;

export function pickCorner(el: HTMLElement): { corner: Corner; style: CSSProperties } {
  const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  const stripBottom = document.querySelector('[data-testid="strip"]')?.getBoundingClientRect().bottom ?? 0;
  const shelfTop = document.querySelector('[data-testid="shelf"]')?.getBoundingClientRect().top ?? vh;
  const top = stripBottom + GAP, bottom = shelfTop - GAP - h;
  const spots: Record<Corner, { x: number; y: number }> = { tr: { x: vw - GAP - w, y: top }, tl: { x: GAP, y: top }, br: { x: vw - GAP - w, y: bottom }, bl: { x: GAP, y: bottom } };
  const tickets = [...document.querySelectorAll<HTMLElement>('[data-testid="broker"]')].map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  const cover = (x: number, y: number) => tickets.reduce((a, r) => a + Math.max(0, Math.min(x + w, r.right) - Math.max(x, r.left)) * Math.max(0, Math.min(y + h, r.bottom) - Math.max(y, r.top)), 0);
  let best: Corner = "tr", bestA = Infinity;
  for (const c of ["tr", "tl", "br", "bl"] as const) {
    const a = cover(spots[c].x, spots[c].y);
    if (a < bestA) { best = c; bestA = a; }
    if (a === 0) break;
  }
  return { corner: best, style: { left: spots[best].x, top: spots[best].y } };
}
