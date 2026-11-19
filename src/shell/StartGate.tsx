"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import "./startGate.css";
import { continueGame, loadGame, openGate, startChallenge, startScenario, useSimSnap, type BackgroundOption, type SaveMeta, type ScenarioCard } from "./simSession";

function money(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return sign + "$" + (Math.abs(Math.round(cents)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ScenarioButton({ sc }: { sc: ScenarioCard }) {
  return (
    <button type="button" className="sim-card" data-testid={`scenario-${sc.id}`} onClick={() => void startScenario(sc.id)}>
      <b>{sc.name}</b>
      <span className="label">{sc.goal} · {sc.limit}</span>
      <span className="muted">{sc.story}</span>
    </button>
  );
}

function SaveButton({ save }: { save: SaveMeta }) {
  return (
    <button type="button" className="sim-card" data-testid={`save-${save.id}`} onClick={() => void loadGame(save.id)}>
      <b>{save.label}</b>
      <span className="muted">{save.scenario} · {save.player} · {save.date} · {money(save.netWorth)}</span>
    </button>
  );
}

export function ArrivalForm({ onBack, className = "qy-panel" }: { onBack: () => void; className?: string }) {
  const { title } = useSimSnap();
  const pasts = title?.pasts ?? [];
  const origins = title?.origins ?? [];
  const [name, setName] = useState("");
  const [age, setAge] = useState("24");
  const [pastId, setPast] = useState("");
  const [originId, setOrigin] = useState("");
  const past = pasts.find((choice) => choice.id === pastId);
  const origin = origins.find((choice) => choice.id === originId);
  const years = Number(age);
  const valid = /[\p{L}\p{N}]/u.test(name) && Number.isInteger(years) && years >= 18 && years <= 60 && past && origin;

  return (
    <form className={`${className} sim-arrival-form`} data-testid="sim-newgame" onSubmit={(event) => {
      event.preventDefault();
      if (valid) void startScenario("arrival", { name: name.trim(), age: years, past: past.id, origin: origin.id });
    }}>
      <button type="button" className="qy-back" onClick={onBack}>Back</button>
      <h2>Start a life in Port Avalon</h2>
      <p className="muted">You arrive on Monday morning with $5,000. Your past shapes what you know and who might recognise you.</p>
      <label className="qy-field">
        Name
        <input data-testid="sim-name" value={name} autoFocus autoComplete="off" required maxLength={40} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="qy-field">
        Age
        <input data-testid="sim-age" type="number" min={18} max={60} required value={age} onChange={(event) => setAge(event.target.value)} />
      </label>
      <BackgroundPicker label="What did you do before?" kind="past" options={pasts} value={past} onChange={setPast} />
      <BackgroundPicker label="Where are you from?" kind="origin" options={origins} value={origin} onChange={setOrigin} />
      <Button variant="primary" type="submit" data-testid="sim-begin" disabled={!valid}>Board the ferry</Button>
    </form>
  );
}

function BackgroundPicker({ label, kind, options, value, onChange }: {
  label: string; kind: string; options: BackgroundOption[]; value?: BackgroundOption; onChange: (id: string) => void;
}) {
  return (
    <div className="sim-background-picker">
      <label className="qy-field">
        {label}
        <select required data-testid={`sim-${kind}`} value={value?.id ?? ""} aria-describedby={`sim-${kind}-details`} onChange={(event) => onChange(event.target.value)}>
          <option value="" disabled>Choose an answer</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      <p className="muted sim-background-details" id={`sim-${kind}-details`}>{value?.line}</p>
    </div>
  );
}

/** Scenario, sandbox, continue, load, and a challenge code. History prints while the city is written. */
export function StartGate() {
  const { mode, title, gen } = useSimSnap();
  const [cash, setCash] = useState("100000");
  const [difficulty, setDifficulty] = useState("1");
  const [code, setCode] = useState("");
  const scenarios = (title?.scenarios ?? []).filter((s) => !s.sandbox && s.id !== "arrival");
  const sandbox = (title?.scenarios ?? []).find((s) => s.sandbox);
  const saves = title?.saves ?? [];
  const last = title?.last ?? null;

  const onSandbox = (e: FormEvent) => {
    e.preventDefault();
    if (!sandbox) return;
    const c = Number(cash);
    const d = Number(difficulty);
    void startScenario(sandbox.id, {
      cash: Number.isFinite(c) ? c : undefined,
      difficulty: Number.isFinite(d) && d > 0 ? d : undefined,
    });
  };
  const onCode = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) void startChallenge(code.trim());
  };

  let body;
  if (mode === "boot") {
    body = <p className="muted">Opening the books…</p>;
  } else if (mode === "progress") {
    const pct = Math.min(92, 8 + gen.lines.length * 3);
    body = (
      <div data-testid="sim-progress">
        <p>{gen.text || "Writing the city…"}</p>
        <div className="sim-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        <div className="sim-lines" data-testid="sim-history">
          {gen.lines.slice(-12).map((line, i) => <div key={`${i}-${line}`}>{line}</div>)}
        </div>
        {gen.error ? <p className="sim-err" data-testid="sim-error">{gen.error}</p> : null}
        {gen.error ? <button type="button" className="sim-back" onClick={() => openGate("menu")}>Back</button> : null}
      </div>
    );
  } else if (mode === "new") {
    body = <ArrivalForm onBack={() => openGate("menu")} className="sim-sandbox" />;
  } else if (mode === "load") {
    body = (
      <>
        <h2 className="section-title">Load</h2>
        <div className="sim-cards">
          {saves.length ? saves.map((s) => <SaveButton key={s.id} save={s} />) : <p className="muted">No saves yet.</p>}
        </div>
        <button type="button" className="sim-back" onClick={() => openGate("menu")}>Back</button>
      </>
    );
  } else if (mode === "challenge") {
    body = (
      <>
        <h2 className="section-title">Challenge code</h2>
        <form className="sim-code" onSubmit={onCode}>
          <span className="muted">PA1.scenario.seed.difficulty.score.hash</span>
          <label>Code <input value={code} autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} data-testid="challenge-code" /></label>
          <Button variant="primary" type="submit">Begin</Button>
        </form>
        {gen.error ? <p className="sim-err">{gen.error}</p> : null}
        <button type="button" className="sim-back" onClick={() => openGate("menu")}>Back</button>
      </>
    );
  } else {
    body = (
      <div data-testid="sim-menu">
        <Button variant="primary" onClick={() => openGate("new")}>Start a new life</Button>
        <div className="sim-cards">{scenarios.map((sc) => <ScenarioButton key={sc.id} sc={sc} />)}</div>
        {sandbox ? (
          <form className="sim-sandbox" onSubmit={onSandbox}>
            <b className="section-title">Sandbox</b>
            <span className="muted">No goal. You choose the cash and the difficulty.</span>
            <label>Start money <input value={cash} inputMode="decimal" onChange={(e) => setCash(e.target.value)} /></label>
            <label>Difficulty <input value={difficulty} inputMode="decimal" onChange={(e) => setDifficulty(e.target.value)} /></label>
            <Button variant="primary" type="submit">Begin sandbox</Button>
          </form>
        ) : null}
        <div className="sim-acts">
          <button type="button" data-testid="sim-continue" disabled={!last} onClick={() => void continueGame()}>
            Continue{last ? ` · ${last.label} · ${last.date}` : ""}
          </button>
          <button type="button" data-testid="sim-load" onClick={() => openGate("load")}>Load</button>
          <button type="button" data-testid="sim-challenge" onClick={() => openGate("challenge")}>Challenge code</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sim-gate" data-testid="start-gate">
      <div className="sim-gate-wrap">
        <p className="label">Port Avalon</p>
        <h1 className="sim-brand">Quay</h1>
        <p className="muted">Your life in this city.</p>
        {body}
      </div>
    </div>
  );
}
