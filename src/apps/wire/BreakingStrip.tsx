// Breaking strip (UI card 1): 32 px, 3 px --loss left rule, alert glyph, "Breaking" + the newest breaking headline.
"use client";
import { Glyph } from "@/components/shell/Glyph";
import type { WireItem } from "@/shell/contracts/channels";
import { headline, type WireStrings } from "./strings";

export function BreakingStrip({ item, t }: { item: WireItem; t: WireStrings }) {
  return (
    <div className="wire-breaking" data-testid="wire-breaking" data-id={item.id}>
      <Glyph name="alert" size={16} />
      <strong className="wire-breaking-label">{t.breaking}</strong>
      <span className="wire-breaking-hl">{headline(item, t)}</span>
    </div>
  );
}
