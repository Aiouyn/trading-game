// Chip / pill (17 §3.5). `acc` only for rank and wealth (17 §3.1.1); `signal` only for icon or short-text
// outlines (17 §3.3.1). `steel` = restricted cash (Studio PF fix a): --steel outline, --fg-muted text, never brass.
import type { HTMLAttributes } from "react";

export type ChipTone = "neutral" | "acc" | "gain" | "loss" | "warn" | "info" | "signal" | "steel";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  outline?: boolean;
}

export function Chip({ tone = "neutral", outline = false, className, ...rest }: ChipProps) {
  const cls = ["chip", tone !== "neutral" && `chip-${tone}`, outline && "chip-outline", className].filter(Boolean).join(" ");
  return <span {...rest} className={cls} />;
}
