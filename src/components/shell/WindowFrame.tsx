"use client";
import { useId, useRef, type PointerEvent as RPointerEvent } from "react";
import { subPalette } from "@/shell/registry";
import { APP_NAMES, S } from "@/shell/strings";
import type { WindowRect } from "@/shell/types";
import type { Area } from "@/shell/wm";
import { AppBody } from "./AppBody";
import { Glyph } from "./Glyph";
import { useShellStore } from "./ShellContext";

interface Props { win: WindowRect; z: number; active: boolean; rect: Area; movable: boolean }

/** One window: role=dialog + aria-labelledby (17 §3.16). Drag by the title bar, resize from the corner. */
export function WindowFrame({ win, z, active, rect, movable }: Props) {
  const store = useShellStore();
  const titleId = useId();
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; mode: "move" | "resize" } | null>(null);

  const start = (e: RPointerEvent, mode: "move" | "resize") => {
    if (!movable || (e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: mode === "move" ? win.x : win.w, oy: mode === "move" ? win.y : win.h, mode };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = store.getState();
    const cur = s.local.windows.find((w) => w.app === win.app && w.instance === win.instance);
    if (!cur) return;
    if (d.mode === "move") s.move(cur, d.ox + e.clientX - d.x, d.oy + e.clientY - d.y);
    else s.resize(cur, d.ox + e.clientX - d.x, d.oy + e.clientY - d.y);
  };
  const end = () => { drag.current = null; };

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className={`win${active ? " active" : ""}${win.collapsed ? " collapsed" : ""}`}
      data-testid={`win-${win.app}`}
      data-instance={win.instance}
      data-subpalette={subPalette(win.app)}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: win.collapsed ? 32 : rect.h, zIndex: 10 + z }}
      onPointerDown={() => !active && store.getState().focus(win)}
    >
      <div className="titlebar" onPointerDown={(e) => start(e, "move")} onPointerMove={onMove} onPointerUp={end}>
        <span className="tb-glyph"><Glyph name={win.app} size={15} /></span>
        <span className="tb-name" id={titleId}>{APP_NAMES[win.app]}</span>
        {win.context && <span className="tb-context">{win.context}</span>}
        <span className="tb-controls">
          <button aria-label={S.collapse} onClick={() => store.getState().toggleCollapse(win)}><Glyph name="collapse" size={14} /></button>
          <button aria-label={S.fill} onClick={() => store.getState().snap(win, "FILL")}><Glyph name="fill" size={14} /></button>
          <button aria-label={S.close} data-testid="win-close" onClick={() => store.getState().close(win)}><Glyph name="close" size={14} /></button>
        </span>
      </div>
      {!win.collapsed && (
        <div className="win-body">
          <AppBody app={win.app} state={{ focused: active, collapsed: win.collapsed, background: false }} />
        </div>
      )}
      {movable && !win.collapsed && (
        <div className="resize-handle" data-testid="resize-handle" onPointerDown={(e) => start(e, "resize")} onPointerMove={onMove} onPointerUp={end} aria-hidden="true" />
      )}
    </div>
  );
}
