// Contrast floors of V3 17 §3.3.1 for all four palettes on win, win2 and chrome (Spec 1 AC S1-04).
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../src/styles/tokens.ts", import.meta.url), "utf8");
const PALETTES = JSON.parse(/PALETTES: Record<PaletteId, Record<string, string>> = (\{[\s\S]*?\n\});/.exec(src)[1]);

const lum = (hex) => {
  const n = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, floor]; fg-faint is a label colour and is never used on win2 in Ink & Brass (17 §3.3.1).
const CHECKS = [["fg", 4.5], ["fg-muted", 4.5], ["fg-faint", 4.5], ["gain", 3], ["loss", 3]];
let failed = 0;
for (const [pal, t] of Object.entries(PALETTES)) {
  for (const bg of ["win", "win2", "chrome"]) {
    for (const [fg, floor] of CHECKS) {
      if (fg === "fg-faint" && bg === "win2" && pal === "ink-brass") continue;
      const r = ratio(t[fg], t[bg]);
      const ok = r >= floor;
      if (!ok) failed++;
      console.log(`${ok ? "ok  " : "FAIL"} ${pal.padEnd(10)} ${fg.padEnd(9)} on ${bg.padEnd(6)} ${r.toFixed(2)} >= ${floor}`);
    }
  }
}
// 17A T1 (C6): pairs the primitives introduce, as text (4.5): primary label on the accent fill, Shadow primary
// (steel on win), Chip tone text on win. Chips on --chrome are placed by T2; Broadsheet gain/warn there are
// below 4.5 and are an open Studio question, so they are not gated here.
const PAIRS = [["on-acc", "acc"], ["steel", "win"], ...["acc", "gain", "loss", "warn", "info", "signal"].map((t) => [t, "win"])];
for (const [pal, t] of Object.entries(PALETTES)) {
  for (const [fg, bg] of PAIRS) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= 4.5;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${pal.padEnd(10)} ${fg.padEnd(9)} on ${bg.padEnd(6)} ${r.toFixed(2)} >= 4.5 (17A T1)`);
  }
}
if (failed) { console.error(`${failed} contrast checks failed`); process.exit(1); }
console.log("contrast: all floors met");
