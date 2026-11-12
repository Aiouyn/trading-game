"use client";
// Card 41: the shell's fill-ack toasts (17 §3.10.2) for Places whose ticket unmounted before showing the outcome.
// Lazy chunk, mounted by components/shell/FillAckHost only while placedAcks holds a shell-owned entry.
// - Resolves each released entry once against `me` (the same IntentResult + MyFill the ticket's AckPanel reads), or
//   its door failure, or "no answer" after ACK_WAIT_MS; the copy is then fixed, so later polls never repeat it.
// - Shows the same copy as AckPanel / ReviewBlock. PARAM.ui_toast_ms = 4000 each (hover pauses), Esc dismisses the top
//   one. Phone: one at a time, in flow under the status bar (it pushes content, so it never covers a control).
//   Desktop: at most PARAM.ui_toast_max_visible = 3, top-right under the strip; if a Broker ticket sits there the
//   column moves to the first corner that covers no ticket (17-AT-40).
import { Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { decText } from "@/apps/portfolio/positions/format";
import { Glyph } from "@/components/shell/Glyph";
import { useShell } from "@/components/shell/ShellContext";
import type { MeTradingBody } from "@/shell/contracts/channels";
import { useChannel } from "@/shell/contracts/useChannel";
import { ACK_WAIT_MS, dismissPlaced, placedAcksSnapshot, showPlaced, subscribePlacedAcks, type AckShown, type PlacedEntry } from "./placedAcks";
import { rejectCopy, type BrStrings } from "./strings-en";
import { fillOf, orderIdOf } from "./ticketResult";
import { useBrStrings } from "./useBrStrings";
import "./fillAck.css";

/** PARAM.ui_toast_ms (23-PARAMETER-REGISTRY:1106). */
export const TOAST_MS = 4000;
/** PARAM.ui_toast_max_visible (23-PARAMETER-REGISTRY:1105); phone shows one at a time. */
export const TOAST_MAX_VISIBLE = 3;

export type FillAckVariant = "phone" | "desktop";

/** The toast's copy for a released entry, or null while it still waits for `me` (and has not expired). */
export function resolveAck(e: PlacedEntry, body: MeTradingBody | null, nowMs: number): AckShown | null {
  if (e.failed) return { kind: "failed", why: e.failed };
  if (e.intentId && body) {
    const result = body.intents.find((i) => i.intentId === e.intentId);
    if (result) {
      if (result.status === "REJECTED") return { kind: "rejected", code: result.rejectCode ?? "", params: result.rejectParams };
      const fill = fillOf(result, body.fills);
      if (result.status === "ACCEPTED" && fill) return { kind: "filled", side: fill.side, qty: fill.qty, price: fill.price, fee: fill.fee };
      const waitsFill = (result.effects ?? []).some((x) => x.startsWith("fill:"));
      if (!waitsFill || nowMs - e.placedAtMs > ACK_WAIT_MS) {
        const id = orderIdOf(result);
        const o = id !== null ? body.orders[id] : undefined;
        return { kind: "accepted", queued: o?.status === "QUEUED_AUCTION", resting: o !== undefined && o.status !== "QUEUED_AUCTION" };
      }
    }
  }
  return nowMs - e.placedAtMs > ACK_WAIT_MS ? { kind: "expired" } : null;
}

/** Title and second line, the AckPanel / ReviewBlock strings verbatim. */
export function ackLines(t: BrStrings, locale: string, ticker: string, s: AckShown): { title: string; line: string | null } {
  switch (s.kind) {
    case "filled": return { title: (s.side === "BUY" ? t.bought : t.sold)(decText(s.qty, locale), ticker, decText(s.price, locale)), line: t.feeLine(decText(s.fee, locale)) };
    case "rejected": { const copy = rejectCopy(t, s.code, s.params); return copy === null ? { title: t.rejectedCode(s.code), line: null } : { title: t.rejected, line: copy }; }
    case "accepted": return { title: s.resting ? t.restingAck : t.received, line: s.queued ? t.haltedQueued : null };
    case "failed": return { title: s.why === "offline" ? t.placeOffline : s.why === "unknown" ? t.placeUnknown : t.couldntLoad, line: null };
    case "expired": return { title: t.placeUnknown, line: null };
  }
}

type Corner = "tr" | "tl" | "br" | "bl";
const GAP = 8;
function cssPx(name: string, fallback: number): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}
/** Desktop: the first corner whose box covers no visible Broker ticket; else the one covering the least. */
function pickCorner(el: HTMLElement): { corner: Corner; style: CSSProperties } {
  const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  const top = cssPx("--strip-h", 34) + GAP, bottom = vh - cssPx("--shelf-h", 52) - GAP - h;
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

function Toasts({ variant }: { variant: FillAckVariant }) {
  const locale = useShell((s) => s.prefs.locale);
  const t = useBrStrings(locale);
  const all = useSyncExternalStore(subscribePlacedAcks, placedAcksSnapshot, placedAcksSnapshot);
  const me = useChannel("me");
  const body = me.body;
  const mine = all.filter((e) => e.owner === "shell");
  const waiting = mine.some((e) => e.shown === null);

  // Resolve released entries against `me` (and the expiry clock while any still waits).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [waiting]);
  useEffect(() => {
    const at = Date.now();
    for (const e of placedAcksSnapshot()) {
      if (e.owner !== "shell" || e.shown !== null) continue;
      const s = resolveAck(e, body, at);
      if (s) showPlaced(e.id, s);
    }
  }, [all, body, now]);

  const visible = mine.filter((e) => e.shown !== null).slice(0, variant === "phone" ? 1 : TOAST_MAX_VISIBLE);
  const visibleKey = visible.map((e) => e.id).join(",");

  // Each visible toast lives TOAST_MS from when it is first visible (a queued phone toast starts when it shows).
  const timers = useRef(new Map<number, number>());
  const [paused, setPaused] = useState<number | null>(null);
  useEffect(() => {
    const live = new Set(visible.map((e) => e.id));
    for (const [id, h] of timers.current) if (!live.has(id) || id === paused) { window.clearTimeout(h); timers.current.delete(id); }
    for (const id of live) if (id !== paused && !timers.current.has(id)) timers.current.set(id, window.setTimeout(() => { timers.current.delete(id); dismissPlaced(id); }, TOAST_MS));
    // visibleKey stands for `visible`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, paused]);
  useEffect(() => { const m = timers.current; return () => { for (const h of m.values()) window.clearTimeout(h); m.clear(); }; }, []);

  // Esc dismisses the top toast (17 §3.10.2; 17-UX:340), unless something else already handled the key.
  const top = visible[0]?.id ?? null;
  useEffect(() => {
    if (top === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) dismissPlaced(top); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [top]);

  // Desktop placement: never over an open ticket (17-AT-40). Re-checked while shown, since windows move.
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ corner: Corner; style: CSSProperties }>({ corner: "tr", style: {} });
  useLayoutEffect(() => {
    if (variant !== "desktop" || visible.length === 0) return;
    const pick = () => {
      const el = ref.current;
      if (!el) return;
      const nx = pickCorner(el);
      setPlace((p) => (p.corner === nx.corner && p.style.left === nx.style.left && p.style.top === nx.style.top ? p : nx));
    };
    pick();
    const id = window.setInterval(pick, 250);
    window.addEventListener("resize", pick);
    return () => { window.clearInterval(id); window.removeEventListener("resize", pick); };
    // visibleKey stands for `visible`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, visibleKey]);

  return (
    <div ref={ref} className={`fill-ack-region fill-ack-${variant}`} data-testid="fill-ack-region" data-corner={variant === "desktop" ? place.corner : undefined}
      role="status" aria-live="assertive" aria-label={t.toastRegion} style={variant === "desktop" ? place.style : undefined}>
      {visible.map((e) => {
        const { title, line } = ackLines(t, locale, e.assetId, e.shown!);
        return (
          <div key={e.id} className="fill-ack" data-testid="fill-ack" data-kind={e.shown!.kind}
            onMouseEnter={() => setPaused(e.id)} onMouseLeave={() => setPaused((p) => (p === e.id ? null : p))}>
            <div className="fill-ack-text">
              <p className="fill-ack-title" data-testid="fill-ack-title">{title}</p>
              {line && <p className="fill-ack-line num" data-testid="fill-ack-line">{line}</p>}
            </div>
            <button type="button" className="fill-ack-dismiss" aria-label={t.toastDismiss} data-testid="fill-ack-dismiss" onClick={() => dismissPlaced(e.id)}>
              <Glyph name="close" size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function FillAckToasts({ variant }: { variant: FillAckVariant }) {
  // useBrStrings suspends while the French pack loads.
  return <Suspense fallback={null}><Toasts variant={variant} /></Suspense>;
}
