// The Wire kind chip, in its own module: Broker's asset news (AssetNews) needs only this, not the Wire row (M1-09
// route budget).
"use client";
import { Glyph } from "@/components/shell/Glyph";
import { Chip } from "@/components/ui/Chip";
import type { WireKind } from "@/shell/contracts/channels";
import type { WireStrings } from "./strings";

/** Every kind chip is neutral (--line outline, --fg-muted text; Studio: brass is only wealth, rank and the primary
 *  action). RUMOR alone is dashed (wire.css). Never a tone, never --acc or --signal. */
export function KindChip({ kind, t }: { kind: WireKind; t: WireStrings }) {
  return (
    <Chip tone="neutral" className={`wire-kind wire-kind-${kind.toLowerCase()}`} data-testid="wire-kind" data-kind={kind}>
      {kind === "WORLD_EVENT" && <Glyph name="world" size={12} />}
      {t.kind[kind]}
    </Chip>
  );
}
