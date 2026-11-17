"use client";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { useSimSnap } from "@/shell/simSession";
import { clipWords } from "@/apps/diary/read";
import { chipText, parseCalendar } from "./read";
import "./society.css";

export function CalendarChip() {
  const view = useSimSnap().view;
  const store = useShellStore();
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  if (!view) return null;
  const full = chipText(view.date.abs, parseCalendar(view.calendar));
  if (!full) return null;
  const text = clipWords(full, phone ? 36 : 44);
  return (
    <button
      type="button"
      className="chip chip-outline chip-info soc-chip"
      data-testid="calendar-chip"
      title={full}
      onClick={() => store.getState().open("society")}
    >
      {text}
    </button>
  );
}
