// Label (17 §3.3.2): Inter 500, 10.5 px, uppercase, 0.14em, --fg-faint. On a --win2 surface it switches to
// --fg-muted in Ink & Brass, where --fg-faint on --win2 misses 4.5:1 (17 §3.3.1) [P].
import type { HTMLAttributes } from "react";

export interface LabelProps extends HTMLAttributes<HTMLSpanElement> {
  /** Set when the label sits on a --win2 surface. */
  onWin2?: boolean;
}

export function Label({ onWin2 = false, className, ...rest }: LabelProps) {
  const cls = ["label", onWin2 && "label-win2", className].filter(Boolean).join(" ");
  return <span {...rest} className={cls} />;
}
