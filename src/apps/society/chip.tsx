"use client";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { useSimSnap } from "@/shell/simSession";
import { clipWords } from "@/apps/diary/read";
import { chipItem, chipText, parseCalendar, parseHosted, withHosted } from "./read";
import "./society.css";

export function CalendarChip() {
  const view = useSimSnap().view;
  const store = useShellStore();
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  if (!view) return null;
  const cal = withHosted(parseCalendar(view.calendar), parseHosted((view as { hosted?: unknown }).hosted));
  const item = chipItem(view.date.abs, cal);
  const full = chipText(view.date.abs, cal);
  if (!full || !item) return null;
  // the bank's meeting opens its story on the Wire (the preview, then the decision as it lands), not the calendar
  const rate = item.kind === "society.meeting";
  const text = clipWords(full, phone ? 36 : 44);
  return (
    <button
      type="button"
      className="chip chip-outline chip-info soc-chip"
      data-testid="calendar-chip"
      title={full}
      onClick={() => (rate ? store.getState().open("wire", "rates") : store.getState().open("society", `day:${item.day}`))}
    >
      {text}
    </button>
  );
}
