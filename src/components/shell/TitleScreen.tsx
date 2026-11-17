"use client";
// Title, new game, loading words, and the first minute on the desk.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { useShell, useShellStore } from "./ShellContext";
import { actLine, continueGame, loadGame, openGate, refreshTitle, startChallenge, startScenario, setSpeed, useSimSnap, type AgeBand, type DriftLine, type GenState, type SaveMeta, type ScenarioCard, type TitleData } from "@/shell/simSession";
import { lessonDo } from "@/shell/lessonDo";
import { PALETTE_IDS, type PaletteId } from "@/styles/tokens";
import type { AppId } from "@/shell/registry";
import type { ShellStore } from "@/shell/store";
import type { SnapSlot } from "@/shell/types";
import { viewportOf } from "@/shell/wm";
import "./title.css";

type Page = "night" | "new" | "who" | "load" | "settings" | "sandbox" | "code";
type Clock = "pause" | "day" | "week" | "month";

const SCENARIO_APPS: Record<string, AppId[]> = {
  "first-paycheck": ["portfolio", "bank", "academy"],
  "heir-debts": ["businesses", "messages", "portfolio"],
  "struggling-ceo": ["businesses", "markets", "portfolio"],
  "hedge-fund": ["broker", "markets", "portfolio"],
  "property-developer": ["property", "portfolio", "bank"],
  activist: ["broker", "markets", "businesses"],
  sandbox: ["portfolio", "broker", "wire"],
};

export function applySound(): void {
  try {
    document.documentElement.dataset.sound = localStorage.getItem("quay.sound") === "on" ? "on" : "off";
  } catch { /* the page still runs with sound off */ }
}

export function arrangeScenario(store: ShellStore, id?: string): void {
  const s = store.getState();
  if (s.vw < 100) return;
  const plan: AppId[] = (id && SCENARIO_APPS[id]) || ["portfolio", "wire", "academy"];
  const open = plan.filter((a) => s.vis[a] === "unlocked");
  if (open.length === 0) {
    s.arrangeFirst();
    return;
  }
  if (viewportOf(s.vw) !== "desktop") {
    s.open(open[0]);
    return;
  }
  let guard = 0;
  while (store.getState().local.windows.length && guard++ < 12) {
    store.getState().close(store.getState().local.windows[0]);
  }
  const primary = open[0];
  const rest = open.slice(1);
  for (const app of rest) store.getState().open(app);
  store.getState().open(primary);
  const slots: SnapSlot[] = open.length === 1 ? ["FILL"] : open.length === 2 ? ["L2/3", "R1/3"] : ["L2/3", "TR", "BR"];
  const order = [primary, ...rest];
  order.forEach((app, i) => {
    const win = store.getState().local.windows.find((w) => w.app === app);
    const slot = slots[i];
    if (win && slot) store.getState().snap(win, slot);
  });
}

let ackedNonce = 0;
const arrivalListeners = new Set<() => void>();
function ackArrival(nonce: number) {
  ackedNonce = nonce;
  for (const fn of arrivalListeners) fn();
}

export function useArrivalPending(): boolean {
  const { mode, layoutNonce, view } = useSimSnap();
  const acked = useSyncExternalStore(
    (fn) => { arrivalListeners.add(fn); return () => arrivalListeners.delete(fn); },
    () => ackedNonce,
    () => 0,
  );
  const lines = view?.arrival;
  return mode === "play" && layoutNonce > 0 && !!view?.scenario?.fresh && Array.isArray(lines) && lines.length >= 3 && acked !== layoutNonce;
}

export function useSavedClock(active: boolean): void {
  const done = useRef(false);
  useEffect(() => {
    if (!active || done.current) return;
    done.current = true;
    try {
      const raw = localStorage.getItem("quay.clock");
      if (raw === "day" || raw === "week" || raw === "month") void setSpeed(raw);
    } catch { /* leave the clock paused */ }
  }, [active]);
}

function money(cents: number): string {
  const sign = cents < 0 ? "\u2212" : "";
  return sign + "$" + (Math.abs(Math.round(cents)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function when(save: SaveMeta): string {
  if (typeof save.savedAt === "number") {
    const d = new Date(save.savedAt);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return save.date;
}

function SaveRow({ save }: { save: SaveMeta }) {
  return (
    <button type="button" className="qy-save" data-testid={`save-${save.id}`} onClick={() => void loadGame(save.id)}>
      <b>{save.label}</b>
      <span className="muted">{when(save)} · {save.scenario} · <span className="num">{money(save.netWorth)}</span></span>
    </button>
  );
}

function Lines({ lines }: { lines: DriftLine[] }) {
  const shown = lines.slice(0, 16);
  if (!shown.length) return <ul className="qy-drift" data-testid="title-lines" />;
  return (
    <ul className="qy-drift" data-testid="title-lines">
      {shown.map((line, i) => (
        <li key={`${line.k}-${i}`} className={line.k === "exchange" ? "num" : undefined}>{line.text}</li>
      ))}
    </ul>
  );
}

function Night({ title, onPage }: { title: TitleData | null; onPage: (p: Page) => void }) {
  const last = title?.last ?? null;
  const sandbox = (title?.scenarios ?? []).find((s) => s.sandbox);
  return (
    <div className="qy-night">
      <div className="qy-copy">
        <p className="label">At night</p>
        <h1>Port Avalon</h1>
        <p className="muted">The harbour, the exchange, and the names the city already keeps.</p>
        <div className="qy-acts" data-testid="sim-menu">
          {last ? (
            <Button variant="primary" data-testid="sim-continue" onClick={() => void continueGame()}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" data-testid="sim-new" onClick={() => onPage("new")}>New game</Button>
          )}
          {last ? <button type="button" className="qy-sec" data-testid="sim-new" onClick={() => onPage("new")}>New game</button> : null}
          <button type="button" className="qy-sec" data-testid="sim-load" onClick={() => onPage("load")}>Load</button>
          <button type="button" className="qy-sec" data-testid="sim-settings" onClick={() => onPage("settings")}>Settings</button>
        </div>
        {last ? <p className="muted">{last.scenario} · <span className="num">{money(last.netWorth)}</span></p> : null}
        <p className="qy-links">
          {sandbox ? <button type="button" data-testid="sim-sandbox" onClick={() => onPage("sandbox")}>Sandbox</button> : null}
          <button type="button" data-testid="sim-challenge" onClick={() => onPage("code")}>Challenge</button>
        </p>
      </div>
      <Lines lines={title?.lines ?? []} />
    </div>
  );
}

function Cards({ title, onPick, onPage }: { title: TitleData | null; onPick: (sc: ScenarioCard) => void; onPage: (p: Page) => void }) {
  const scenarios = (title?.scenarios ?? []).filter((s) => !s.sandbox);
  return (
    <div className="qy-panel" data-testid="sim-new">
      <button type="button" className="qy-back" onClick={() => onPage("night")}>Back</button>
      <h2>New game</h2>
      <div className="qy-cards">
        {scenarios.map((sc) => (
          <button type="button" key={sc.id} className="qy-card" data-testid={`scenario-${sc.id}`} onClick={() => onPick(sc)}>
            <b>{sc.name}</b>
            <span>{sc.story}</span>
            <span className="label">Goal</span>
            <span>{sc.goal}</span>
            <span className="label">Difficulty</span>
            <span>{sc.difficulty}</span>
            {sc.different ? <span>{sc.different}</span> : null}
            {sc.limit ? <span className="muted">{sc.limit}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function Who({ sc, title, onPage }: { sc: ScenarioCard; title: TitleData | null; onPage: (p: Page) => void }) {
  const names = title?.names ?? [];
  const districts = title?.districts ?? [];
  const bands = useMemo(() => {
    const list: AgeBand[] = [...(title?.ages ?? [])];
    if (sc.age && !list.some((a) => a.years === sc.age)) list.push({ years: sc.age, label: `${sc.age}, this scenario` });
    return list.sort((a, b) => a.years - b.years);
  }, [title?.ages, sc.age]);
  const [name, setName] = useState("");
  const [age, setAge] = useState(() => (sc.age && bands.some((b) => b.years === sc.age) ? sc.age : bands[0]?.years ?? 30));
  const [district, setDistrict] = useState(districts[0] ?? "");
  const known = !name.trim() || names.length === 0 || names.includes(name.trim());
  const begin = () => {
    if (!known) return;
    void startScenario(sc.id, {
      ...(name.trim() ? { name: name.trim() } : {}),
      age,
      ...(district ? { district } : {}),
    });
  };
  return (
    <div className="qy-panel" data-testid="sim-who">
      <button type="button" className="qy-back" onClick={() => onPage("new")}>Back</button>
      <h2>{sc.name}</h2>
      <p className="muted">{sc.story}</p>
      <label className="qy-field">
        Name
        <input data-testid="sim-name" list="quay-names" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} placeholder="The city will choose" />
        <datalist id="quay-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      {!known ? <p className="qy-err">That name is not in the city&apos;s book.</p> : <p className="muted">Leave this blank to keep the name the city gives you.</p>}
      <label className="qy-field">
        Age
        <select data-testid="sim-age" value={age} onChange={(e) => setAge(Number(e.target.value))}>
          {bands.map((b) => <option key={b.years} value={b.years}>{b.label}</option>)}
        </select>
      </label>
      <label className="qy-field">
        District
        <select data-testid="sim-district" value={district} onChange={(e) => setDistrict(e.target.value)}>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <Button variant="primary" data-testid="sim-begin" disabled={!known} onClick={begin}>Begin</Button>
    </div>
  );
}

function Load({ title, onPage }: { title: TitleData | null; onPage: (p: Page) => void }) {
  const saves = title?.saves ?? [];
  return (
    <div className="qy-panel" data-testid="sim-load-page">
      <button type="button" className="qy-back" onClick={() => onPage("night")}>Back</button>
      <h2>Load</h2>
      <div className="qy-saves">
        {saves.length ? saves.map((s) => <SaveRow key={s.id} save={s} />) : <p className="muted">No saves yet.</p>}
      </div>
    </div>
  );
}

function Picks({ label, value, options, onChange }: { label: string; value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <div className="qy-field">
      <span className="label">{label}</span>
      <div className="qy-row" role="group" aria-label={label}>
        {options.map((o) => (
          <button type="button" key={o.id} className="qy-pick" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function Settings({ title, onPage }: { title: TitleData | null; onPage: (p: Page) => void }) {
  const store = useShellStore();
  const palette = useShell((s) => s.local.palette);
  const prefs = useShell((s) => s.prefs);
  const [clock, setClock] = useState<Clock>("pause");
  const [sound, setSound] = useState<"off" | "on">("off");
  const [auto, setAuto] = useState(title?.autosave !== false);
  useEffect(() => { setAuto(title?.autosave !== false); }, [title?.autosave]);
  useEffect(() => {
    try {
      const c = localStorage.getItem("quay.clock");
      if (c === "pause" || c === "day" || c === "week" || c === "month") setClock(c);
      setSound(localStorage.getItem("quay.sound") === "on" ? "on" : "off");
    } catch { /* defaults stand */ }
  }, []);
  const chooseClock = (id: string) => {
    const next = id as Clock;
    setClock(next);
    try { localStorage.setItem("quay.clock", next); } catch { /* this sitting only */ }
  };
  const chooseSound = (id: string) => {
    const next = id === "on" ? "on" : "off";
    setSound(next);
    try { localStorage.setItem("quay.sound", next); } catch { /* this sitting only */ }
    document.documentElement.dataset.sound = next;
  };
  const chooseAuto = (id: string) => {
    const on = id === "on";
    setAuto(on);
    void fetch("/api/sim/autosave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ on }),
    });
  };
  const scale = prefs.textScale >= 1.5 ? "1.5" : prefs.textScale >= 1.25 ? "1.25" : "1";
  return (
    <div className="qy-panel" data-testid="sim-settings-page">
      <button type="button" className="qy-back" onClick={() => onPage("night")}>Back</button>
      <h2>Settings</h2>
      <Picks label="Palette" value={palette} options={PALETTE_IDS.map((id) => ({ id, label: id }))} onChange={(id) => store.getState().setPalette(id as PaletteId)} />
      <Picks
        label="Text size"
        value={scale}
        options={[{ id: "1", label: "Desk" }, { id: "1.25", label: "Large" }, { id: "1.5", label: "Larger" }]}
        onChange={(id) => store.getState().setPrefs({ textScale: Number(id) })}
      />
      <Picks
        label="Reduced motion"
        value={prefs.reducedMotion}
        options={[{ id: "system", label: "System" }, { id: "on", label: "On" }, { id: "off", label: "Off" }]}
        onChange={(id) => store.getState().setPrefs({ reducedMotion: id as "system" | "on" | "off" })}
      />
      <Picks
        label="Game speed"
        value={clock}
        options={[{ id: "pause", label: "Pause" }, { id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]}
        onChange={chooseClock}
      />
      <Picks label="Autosave" value={auto ? "on" : "off"} options={[{ id: "on", label: "On" }, { id: "off", label: "Off" }]} onChange={chooseAuto} />
      <Picks label="Sound" value={sound} options={[{ id: "off", label: "Off" }, { id: "on", label: "On" }]} onChange={chooseSound} />
      <h2>Saves</h2>
      <div className="qy-saves">
        {(title?.saves ?? []).length ? (title?.saves ?? []).map((s) => <SaveRow key={s.id} save={s} />) : <p className="muted">No saves yet.</p>}
      </div>
    </div>
  );
}

function Sandbox({ title, onPage }: { title: TitleData | null; onPage: (p: Page) => void }) {
  const sandbox = (title?.scenarios ?? []).find((s) => s.sandbox);
  const [cash, setCash] = useState("100000");
  const [difficulty, setDifficulty] = useState("1");
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!sandbox) return;
    const c = Number(cash);
    const d = Number(difficulty);
    void startScenario(sandbox.id, {
      cash: Number.isFinite(c) ? c : undefined,
      difficulty: Number.isFinite(d) && d > 0 ? d : undefined,
    });
  };
  return (
    <form className="qy-panel" data-testid="sim-sandbox-page" onSubmit={onSubmit}>
      <button type="button" className="qy-back" onClick={() => onPage("night")}>Back</button>
      <h2>Sandbox</h2>
      <p className="muted">No goal. You choose the cash and the difficulty.</p>
      <label className="qy-field">Start money <input value={cash} inputMode="decimal" onChange={(e) => setCash(e.target.value)} /></label>
      <label className="qy-field">Difficulty <input value={difficulty} inputMode="decimal" onChange={(e) => setDifficulty(e.target.value)} /></label>
      <Button variant="primary" type="submit" disabled={!sandbox}>Begin sandbox</Button>
    </form>
  );
}

function Code({ onPage }: { onPage: (p: Page) => void }) {
  const [code, setCode] = useState("");
  const { gen } = useSimSnap();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) void startChallenge(code.trim());
  };
  return (
    <form className="qy-panel" onSubmit={onSubmit}>
      <button type="button" className="qy-back" onClick={() => onPage("night")}>Back</button>
      <h2>Challenge code</h2>
      <p className="muted">PA1.scenario.seed.difficulty.score.hash</p>
      <label className="qy-field">Code <input value={code} data-testid="challenge-code" autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} /></label>
      {gen.error ? <p className="qy-err" data-testid="sim-error">{gen.error}</p> : null}
      <Button variant="primary" type="submit">Begin</Button>
    </form>
  );
}

function Loading({ gen, onBack }: { gen: GenState; onBack: () => void }) {
  const earlier = gen.lines.filter((line) => line !== gen.text).slice(-8);
  return (
    <div className="qy-panel" data-testid="sim-progress">
      <p className="qy-now">{gen.text || "Opening the harbour"}</p>
      {earlier.length ? (
        <ul className="qy-earlier">
          {earlier.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}
        </ul>
      ) : null}
      {gen.error ? <p className="qy-err" data-testid="sim-error">{gen.error}</p> : null}
      {gen.error ? <button type="button" className="qy-back" onClick={onBack}>Back</button> : null}
    </div>
  );
}

export function TitleScreen() {
  const { mode, title, gen } = useSimSnap();
  const [page, setPage] = useState<Page>("night");
  const [picked, setPicked] = useState<ScenarioCard | null>(null);
  useEffect(() => {
    applySound();
    document.documentElement.dataset.hydrated = "1";
  }, []);
  useEffect(() => { if (mode === "menu") void refreshTitle(); }, [mode]);
  let body;
  if (page === "new") body = <Cards title={title} onPage={setPage} onPick={(sc) => { setPicked(sc); setPage("who"); }} />;
  else if (page === "who" && picked) body = <Who sc={picked} title={title} onPage={setPage} />;
  else if (page === "load") body = <Load title={title} onPage={setPage} />;
  else if (page === "settings") body = <Settings title={title} onPage={setPage} />;
  else if (page === "sandbox") body = <Sandbox title={title} onPage={setPage} />;
  else if (page === "code") body = <Code onPage={setPage} />;
  else body = <Night title={title} onPage={setPage} />;
  return (
    <div className="qy" data-testid="start-gate">
      {mode === "progress" ? <Loading gen={gen} onBack={() => { setPage("night"); openGate("menu"); }} /> : body}
    </div>
  );
}

export function Arrival() {
  const { view, layoutNonce } = useSimSnap();
  const lines = (view?.arrival ?? []).slice(0, 3);
  return (
    <div className="qy-arrive" data-testid="arrival" role="dialog" aria-label="Arrival">
      <p className="label">You have arrived</p>
      {lines.map((line, i) => <p key={i}>{line}</p>)}
      <Button variant="primary" data-testid="arrival-open" onClick={() => ackArrival(layoutNonce)}>Open the desk</Button>
    </div>
  );
}

export function FirstStep() {
  const sc = useSimSnap().view?.scenario;
  const tut = sc?.tutorial;
  if (!tut || tut.done || tut.step !== "sheet") return null;
  const action = lessonDo(tut.hint);
  if (!action) return null;
  return (
    <div className="qy-first" data-testid="lesson-first">
      <p>{tut.goal || "See the job and the wage."}</p>
      <Button variant="primary" onClick={() => void actLine(action.line)}>{action.label}</Button>
    </div>
  );
}
