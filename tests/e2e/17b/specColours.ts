/** Studio spec colour literals, copied by hand from 17 §3.3.1 (token table) and 17A step 83 (cb / hc blocks).
 *  They are never read from tokens.css: an edit made to both token files must still fail the colour asserts. */
const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

export const SPEC_COLOUR = {
  /** html[data-cb="1"] --gain */
  cbGain: rgb("#5CE1E6"),
  /** html[data-cb="1"] --loss */
  cbLoss: rgb("#FF5C8A"),
  /** html[data-hc="1"] --line = --fg-disabled, Ink & Brass */
  hcLine: rgb("#5F656E"),
  /** --fg-muted, Ink & Brass (the hc row rule) */
  fgMuted: rgb("#9AA0A8"),
} as const;
