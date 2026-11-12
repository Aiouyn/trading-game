"use client";
import { useId, useRef, type PointerEvent as RPointerEvent } from "react";
import { subPalette } from "@/shell/registry";
import { APP_NAMES, S } from "@/shell/strings";
import type { WindowRect } from "@/shell/types";
import { EDGES, minWindowTop, type Area, type Edge } from "@/shell/wm";
import { AppBody } from "./AppBody";
import { Glyph } from "./Glyph";
import { useShellStore } from "./ShellContext";

interface Props { win: WindowRect; z: number; active: boolean; rect: Area; movable: boolean; background: boolean }

/** One window: role=dialog + aria-labelledby (17 §3.16). Drag by the title bar; resize from any edge or corner
 *  (desktop; a maximised window leaves Fill when resized); Ctrl Shift arrows resize the active window from the keyboard (keys.ts). */
export function WindowFrame({ win, z, active, rect, movable, background }: Props) {
  const store = useShellStore();
  const titleId = useId();
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; mode: "move" } | { x: number; y: number; mode: "resize"; edge: Edge; from: Area } | null>(null);

  const start = (e: RPointerEvent, mode: "move" | "resize", edge: Edge = "se") => {
    if (!movable || (e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = mode === "move"
      ? { x: e.clientX, y: e.clientY, ox: win.x, oy: win.y, mode }
      : { x: e.clientX, y: e.clientY, mode, edge, from: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = store.getState();
    const cur = s.local.windows.find((w) => w.app === win.app && w.instance === win.instance);
    if (!cur) return;
    if (d.mode === "move") s.move(cur, d.ox + e.clientX - d.x, d.oy + e.clientY - d.y);
    else s.resizeEdge(cur, d.edge, d.from, e.clientX - d.x, e.clientY - d.y);
  };
  const end = () => { drag.current = null; };

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className={`win${active ? " active" : ""}${win.collapsed ? " collapsed" : ""}`}
      hidden={background}
      data-testid={`win-${win.app}`}
      data-instance={win.instance}
      data-subpalette={subPalette(win.app)}
      style={{ left: rect.x, top: Math.max(rect.y, minWindowTop(store.getState().local.focusMode)), width: rect.w, height: win.collapsed ? 32 : rect.h, zIndex: 10 + z }}
      onPointerDown={() => !active && store.getState().focus(win)}
    >
      <div className="titlebar" onPointerDown={(e) => start(e, "move")} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}>
        <span className="tb-glyph"><Glyph name={win.app} size={15} /></span>
        <span className="tb-name" id={titleId}>{APP_NAMES[win.app]}</span>
        {win.context && <span className="tb-context">{win.context}</span>}
        <span className="tb-controls">
          <button aria-label={S.collapse} onClick={() => store.getState().toggleCollapse(win)}><Glyph name="collapse" size={14} /></button>
          <button aria-label={S.fill} onClick={() => store.getState().snap(win, "FILL")}><Glyph name="fill" size={14} /></button>
          <button aria-label={S.close} data-testid="win-close" onClick={() => store.getState().close(win)}><Glyph name="close" size={14} /></button>
        </span>
      </div>
      {/* The body stays mounted while collapsed or in the background so City can report visibility. */}
      <div className="win-body" hidden={win.collapsed}>
        <AppBody app={win.app} context={win.context} state={{ focused: active && !background, collapsed: win.collapsed, background }} />
      </div>
      {movable && !win.collapsed && EDGES.map((edge) => (
        <div key={edge} className={`resize-handle rh-${edge}`} data-testid={edge === "se" ? "resize-handle" : `resize-${edge}`} data-edge={edge}
          onPointerDown={(e) => start(e, "resize", edge)} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} aria-hidden="true" />
      ))}
    </div>
  );
}
