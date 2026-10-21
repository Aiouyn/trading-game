"use client";
// §5 shell states, stubbed: Held overlay (z 150) and halted-world system overlay (z 160, SH-12).
// Both leave read-only screens usable underneath (AT-32): they are non-modal banners over the surface.
import { S } from "@/shell/strings";
import { useShell } from "./ShellContext";

export function SystemOverlays() {
  const sys = useShell((s) => s.channels.system);
  return (
    <>
      {sys.held && (
        <div className="overlay overlay-held" role="status" data-testid="overlay-held">
          <h2 className="section-title">{S.held}</h2>
          <p className="muted">{S.heldBody}</p>
        </div>
      )}
      {sys.halted && (
        <div className="overlay overlay-system" role="status" data-testid="overlay-halted">
          <h2 className="section-title">{S.halted}</h2>
          <p className="muted">{S.haltedReason}</p>
        </div>
      )}
    </>
  );
}
