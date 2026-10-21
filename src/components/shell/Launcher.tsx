"use client";
import { useEffect, useMemo, useState } from "react";
import { search, type LauncherItem } from "@/shell/launcher";
import { S } from "@/shell/strings";
import { viewportOf } from "@/shell/wm";
import { Glyph } from "./Glyph";
import { useShell, useShellStore } from "./ShellContext";

/** Launcher (SH-04): combobox + listbox. Desktop 640 px panel, phone full screen. Navigation only. */
export function Launcher() {
  const store = useShellStore();
  const vis = useShell((s) => s.vis);
  const recent = useShell((s) => s.recent);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const items = useMemo(() => search(q, vis, recent), [q, vis, recent]);
  const groups = [...new Set(items.map((i) => i.group))];
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const close = () => store.getState().setLauncher(false);
  // T4-01: focus returns to whatever had it before the launcher opened (Esc, Cancel, scrim, or choosing).
  const [prev] = useState(() => (typeof document === "undefined" ? null : document.activeElement as HTMLElement | null));
  useEffect(() => {
    return () => { if (prev && prev.isConnected && prev !== document.body) prev.focus(); };
  }, [prev]);

  const choose = (it: LauncherItem | undefined) => {
    if (!it) return;
    const s = store.getState();
    s.setLauncher(false);
    s.open(it.app, it.context);
  };

  return (
    <div className="scrim" data-testid="launcher-scrim" onPointerDown={(e) => e.target === e.currentTarget && store.getState().setLauncher(false)}>
      <div className="launcher" role="dialog" aria-modal="true" aria-label={S.launcherPlaceholder} data-testid="launcher">
        {phone && (
          <div className="launcher-bar" data-testid="launcher-bar">
            <button className="icon-btn" aria-label={S.back} data-testid="launcher-back" onClick={close}><Glyph name="chevLeft" size={20} /></button>
            <button className="cancel" data-testid="launcher-cancel" onClick={close}>{S.cancel}</button>
          </div>
        )}
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="launcher-list"
          aria-autocomplete="list"
          aria-activedescendant={items[sel] ? `li-${items[sel].id}` : undefined}
          aria-label={S.launcherPlaceholder}
          placeholder={S.launcherPlaceholder}
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((n) => Math.min(n + 1, items.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((n) => Math.max(n - 1, 0)); }
            if (e.key === "Enter") choose(items[sel]);
          }}
        />
        <div id="launcher-list" role="listbox" aria-label={S.launcherPlaceholder} data-testid="launcher-list">
          {groups.map((g) => (
            <div key={g} role="group" aria-labelledby={`lg-${g}`}>
              <div className="label" id={`lg-${g}`} role="presentation">{g}</div>
              {items.filter((i) => i.group === g).map((it) => (
                <div
                  key={it.id}
                  id={`li-${it.id}`}
                  role="option"
                  aria-selected={items[sel] === it}
                  className={items[sel] === it ? "sel" : ""}
                  onClick={() => choose(it)}
                >
                  {it.label}
                </div>
              ))}
            </div>
          ))}
        </div>
        {items.length === 0 && <p className="muted empty">{q ? S.nothingFound : S.noRecent}</p>}
      </div>
    </div>
  );
}
