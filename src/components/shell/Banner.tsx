"use client";
// 17A T5 §3/§4: alert banner (P0/P1, SH-07) and world-event banner (SH-08). Each renders into its own 34 px
// slot under the strip, in the flow, so it pushes the desktop down and never covers an OrderPad (17-AT-40).
import { useMemo } from "react";
import { S } from "@/shell/strings";
import { Glyph } from "./Glyph";
import { PctText } from "./MoneyText";

export type AlertPriority = "P0" | "P1";
/** P0 glyph. Studio 08:31 wants the triangle-with-bar in --loss; it isn't in the glyph set yet, so this is the one swap point. */
export const ALERT_ICON = "bell" as const;
export interface Alert { id: string; priority: AlertPriority; text: string; action: { label: string; href: string } }

/** At most one alert banner at a time: P0 before P1, then arrival order. The rest stay queued. */
export function pickAlert(queue: readonly Alert[]): { shown: Alert | null; queued: Alert[] } {
  const order = [...queue].sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "P0" ? -1 : 1));
  return { shown: order[0] ?? null, queued: order.slice(1) };
}

export function Banner({ alerts, onNavigate, extra = 0, onMore }: { alerts: readonly Alert[]; onNavigate?: (href: string) => void; extra?: number; onMore?: () => void }) {
  const { shown, queued } = useMemo(() => pickAlert(alerts), [alerts]);
  return (
    <div className="alert-slot" data-testid="alert-slot" data-open={!!shown} data-queued={queued.length}>
      {shown && (
        <div className={`alert-banner alert-${shown.priority.toLowerCase()}`} data-testid="alert-banner" data-priority={shown.priority}
          role={shown.priority === "P0" ? "alert" : "status"} aria-live={shown.priority === "P0" ? "assertive" : "polite"}>
          {/* Always icon + text, never colour alone (17 §3.1.3). */}
          <span className="alert-icon" data-testid="alert-icon"><Glyph name={ALERT_ICON} size={16} /></span>
          <span className="alert-text">{shown.text}</span>
          {/* A real link (keyboard, a11y), routed through the shell's deep-link handling when one is given. */}
          <a className="alert-action" href={shown.action.href} onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(shown.action.href); } }}>{shown.action.label}</a>
          {extra > 0 && <MoreButton n={extra} onMore={onMore} />}
        </div>
      )}
    </div>
  );
}

export interface WorldEvent { name: string; day: number; index: string; sincePct: string; todayPct: string }

/** Plain text of the world-event banner. Elapsed time only, never remaining (17-AT-20). */
export function worldEventText(e: WorldEvent): string {
  const pct = (v: string) => `${v.startsWith("-") ? "\u2212" : "+"}${v.replace(/^[-+]/, "")}%`;
  return `● ${e.name.toUpperCase()} · ${S.worldDay} ${e.day} · ${e.index} ${pct(e.sincePct)} ${S.worldSince} · ${S.worldToday} ${pct(e.todayPct)}`;
}

/** "+N" count on the last visible phone banner; opens the alerts sheet (Producer 08:20). */
export function MoreButton({ n, onMore }: { n: number; onMore?: () => void }) {
  return <button className="banner-more" data-testid="banner-more" aria-label={`+${n} ${S.moreAlerts}`} onClick={onMore}>{`+${n}`}</button>;
}

export function WorldEventBanner({ event, extra = 0, onMore }: { event: WorldEvent | null; extra?: number; onMore?: () => void }) {
  return (
    <div className="world-slot" data-testid="world-slot" data-open={!!event}>
      {event && (
        <div className="world-banner" data-testid="world-banner" role="status" aria-live="polite" aria-label={worldEventText(event)}>
          <span className="world-dot" aria-hidden="true">{"●"}</span>
          <span className="world-name">{`${event.name.toUpperCase()} · ${S.worldDay} ${event.day}`}</span>
          <span aria-hidden="true">{"·"}</span>
          <span>{event.index} <PctText value={event.sincePct} /> {S.worldSince}</span>
          <span aria-hidden="true">{"·"}</span>
          <span>{S.worldToday} <PctText value={event.todayPct} /></span>
          {extra > 0 && <MoreButton n={extra} onMore={onMore} />}
        </div>
      )}
    </div>
  );
}
