"use client";
import { KEY_SHEET } from "@/shell/keys";
import { S } from "@/shell/strings";
import { useShellStore } from "./ShellContext";

export function KeySheet() {
  const store = useShellStore();
  return (
    <div className="scrim" onPointerDown={() => store.getState().setKeySheet(false)}>
      <div className="keysheet" role="dialog" aria-modal="true" aria-labelledby="keysheet-title">
        <h2 className="section-title" id="keysheet-title">{S.keySheet}</h2>
        <dl>
          {KEY_SHEET.map(([k, v]) => (
            <div key={k} className="row"><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>
          ))}
        </dl>
        <p className="muted">{S.keySheetFooter}</p>
      </div>
    </div>
  );
}
