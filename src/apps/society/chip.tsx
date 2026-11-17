"use client";
import { useShellStore } from "@/components/shell/ShellContext";
import { useSimSnap } from "@/shell/simSession";
import { chipText, parseCalendar } from "./read";
import "./society.css";

export function CalendarChip() {
  const view = useSimSnap().view;
  const store = useShellStore();
  if (!view) return null;
  const text = chipText(view.date.abs, parseCalendar(view.calendar));
  if (!text) return null;
  return (
    <button
      type="button"
      className="chip chip-outline chip-info soc-chip"
      data-testid="calendar-chip"
      title={text}
      onClick={() => store.getState().open("society")}
    >
      {text}
    </button>
  );
}
