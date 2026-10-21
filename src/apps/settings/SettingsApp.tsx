"use client";
// Settings frame (17 §7.2, 17B SET-01): desktop = section list + content; phone = list root with a push stack.
import { useEffect } from "react";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { About } from "./About";
import { Appearance } from "./Appearance";
import { BUILT_SECTIONS, SECTION_IDS, settingsNav, useSettingsNav, type SectionId } from "./sections";
import { useSettingsStrings } from "./useSettingsStrings";
import "./settings.css";
import "./about.css";

function SectionBody({ id }: { id: SectionId }) {
  const locale = useShell((s) => s.prefs.locale);
  const t = useSettingsStrings();
  if (id === "SET-02") return <Appearance />;
  if (id === "SET-08") return <About locale={locale} />;
  return (
    <section className="coming-later" data-testid="coming-later">
      <h2 className="section-title">{t.section[id]}</h2>
      <p className="muted">{t.comingLater}</p>
    </section>
  );
}

export function SettingsApp() {
  const t = useSettingsStrings();
  const store = useShellStore();
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const nav = useSettingsNav();
  const current = phone ? nav.pushed : nav.desktop;

  // Phone: a pushed section titles the app bar and its chevron pops back to the list (SR T4).
  useEffect(() => {
    if (!phone) return;
    store.getState().setPhoneSub(nav.pushed ? { title: t.section[nav.pushed], backLabel: t.backToSettings, onBack: () => settingsNav.back() } : null);
  }, [phone, nav.pushed, store, t]);
  useEffect(() => () => store.getState().setPhoneSub(null), [store]);

  const list = (
    <nav className="set-nav" aria-label={t.sections}>
      <ul>
        {SECTION_IDS.map((id) => (
          <li key={id}>
            <button type="button" className="set-nav-item" data-testid={`set-nav-${id}`} data-built={BUILT_SECTIONS.has(id) ? "1" : "0"}
              aria-current={!phone && current === id ? "page" : undefined} onClick={() => settingsNav.open(id)}>
              {t.section[id]}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
  if (phone) {
    return <div className="settings settings-phone" data-testid="settings">{current ? <div className="set-content"><SectionBody id={current} /></div> : list}</div>;
  }
  return (
    <div className="settings settings-desktop" data-testid="settings">
      {list}
      <div className="set-content" data-testid={`set-section-${current}`}><SectionBody id={current ?? "SET-02"} /></div>
    </div>
  );
}
