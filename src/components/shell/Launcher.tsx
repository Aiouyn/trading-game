"use client";
import { useEffect, useMemo, useState } from "react";
import { prefersCommand, search, type LauncherItem, type SearchDir } from "@/shell/launcher";
import { actLine, useSimSnap } from "@/shell/simSession";
import { APP_NAMES, GROUP_LABELS, S } from "@/shell/strings";
import { APP_IDS, APPS, GROUPS } from "@/shell/registry";
import { isBuiltApp } from "@/shell/appModules";
import { viewportOf } from "@/shell/wm";
import { openSheet } from "@/shell/sheetHost";
import { Glyph } from "./Glyph";
import { useShell, useShellStore } from "./ShellContext";

/** Launcher (SH-04): combobox + listbox. Desktop 640 px panel, phone full screen. Navigation only. */
export function Launcher() {
  const store = useShellStore();
  const vis = useShell((s) => s.vis);
  const recent = useShell((s) => s.recent);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const view = useSimSnap().view;
  const dir = useMemo<SearchDir | undefined>(() => {
    if (!view) return undefined;
    const quotes = view.quotes ?? [];
    return {
      tickers: quotes.filter((x) => x.symbol).slice(0, 80).map((x) => ({ symbol: x.symbol as string, name: x.name || x.symbol as string })),
      people: (view.contacts ?? []).filter((c) => c.name).map((c) => ({ name: c.name, word: c.word, line: c.line })),
      firms: (view.firms ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        symbol: quotes.find((x) => x.issuer === f.id)?.symbol,
      })),
    };
  }, [view]);
  const items = useMemo(() => search(q, vis, recent, dir), [q, vis, recent, dir]);
  useEffect(() => {
    if (!prefersCommand(q)) return;
    const i = items.findIndex((it) => it.command);
    if (i >= 0) setSel(i);
  }, [q, items]);
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
    if (it.command) {
      void actLine(it.command);
      return;
    }
    if (it.app && s.vis[it.app] === "unlocked") {
      s.open(it.app, it.context);
      return;
    }
    openSheet({
      label: it.label,
      testId: "launcher-detail",
      content: <p>{it.detail || it.label}</p>,
    });
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
        {!q.trim() && (
          <div className="launcher-all" data-testid="launcher-all">
            {GROUPS.map((g) => {
              const apps = APP_IDS.filter((a) => APPS[a].group === g && isBuiltApp(a) && vis[a] === "unlocked");
              if (!apps.length) return null;
              return (
                <section key={g}>
                  <div className="label">{GROUP_LABELS[g]}</div>
                  <div className="launcher-grid">
                    {apps.map((a) => (
                      <button key={a} type="button" className="launcher-app" data-testid={`launch-${a}`} onClick={() => choose({ id: `all:${a}`, group: "Apps", label: APP_NAMES[a], app: a })}>
                        <Glyph name={a} size={18} />
                        <span>{APP_NAMES[a]}</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        {items.length === 0 && q && <p className="muted empty">{S.nothingFound}</p>}
      </div>
    </div>
  );
}
