"use client";
import { useShellStore } from "@/components/shell/ShellContext";
import { useSimSnap } from "@/shell/simSession";
import { noteCity } from "./read";
import "./society.css";

export function CityTicker({ where }: { where: "wire" | "home" }) {
  const view = useSimSnap().view;
  const store = useShellStore();
  const lines = noteCity(view);
  if (!view || !lines.length) return null;
  const run = view.speed !== "pause";
  const latest = lines[lines.length - 1] ?? "";
  const text = run ? lines.join("   ·   ") : latest;
  return (
    <button
      type="button"
      className="city-ticker"
      data-testid={`city-ticker-${where}`}
      data-run={run ? "1" : "0"}
      title={latest}
      onClick={() => store.getState().open("society")}
    >
      <span className="city-ticker-track">
        {text}
        {run ? <span aria-hidden="true">{"   ·   "}{text}</span> : null}
      </span>
    </button>
  );
}
