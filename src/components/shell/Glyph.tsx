// Quay glyph family from Studio's design (design/redesign/src/glyphs.js): 24 px grid, 1.5 px line.
// Apps without a Studio glyph yet use the neutral `app` frame (open question Q6).
import type { AppId } from "@/shell/registry";

const P: Record<string, string[]> = {
  quay: ["M3 9h18M7 9v7M17 9v7", "M3 19.5h3.5M10.25 19.5h3.5M17.5 19.5H21"],
  broker: ["M8 3.5v3.5M8 15v5.5M16 5.5V10M16 16v3", "M6.6 7h2.8a.6.6 0 0 1 .6.6v6.8a.6.6 0 0 1-.6.6H6.6a.6.6 0 0 1-.6-.6V7.6a.6.6 0 0 1 .6-.6zM14.6 10h2.8a.6.6 0 0 1 .6.6v4.8a.6.6 0 0 1-.6.6h-2.8a.6.6 0 0 1-.6-.6v-4.8a.6.6 0 0 1 .6-.6z"],
  portfolio: ["M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5z", "M12 3.75V12h8.25"],
  wire: ["M8.5 7.5h11M8.5 12h11M8.5 16.5h7", "M5 7.5h.01M5 12h.01M5 16.5h.01"],
  businesses: ["M4 9.5h16M5.5 4.5h13L20 9.5M5.5 4.5 4 9.5M5.5 9.5v10h13v-10M10.25 19.5v-5h3.5v5"],
  ailab: ["M6 4.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5zM18 4.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5zM12 15.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5z", "M8.25 7h7.5M7.1 9 10.9 16M16.9 9l-3.8 7"],
  research: ["M11 20.5H5.5v-17h8l4 4V10M13.5 3.5v4h4", "M15.5 12.25a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5zM18 18l2.75 2.75"],
  bank: ["M3.5 9 12 4l8.5 5zM6 11.5v6M10 11.5v6M14 11.5v6M18 11.5v6M3.5 20h17"],
  legal: ["M12 4v15.5M8 19.5h8M5 7.5h14M5 7.5 2.75 13.25h4.5zM19 7.5l-2.25 5.75h4.5z"],
  security: ["M12 3.25 19 6v5.25c0 4.5-3 7.9-7 9.5-4-1.6-7-5-7-9.5V6z", "M12 10.25v3.5M12 9.5h.01"],
  messages: ["M4 5h16v11H10.5L6.5 19.25V16H4z", "M8 9h8M8 12h5"],
  settings: ["M4 7h3M11 7h9M4 12h9M17 12h3M4 17h1M9 17h11", "M9 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM15 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"],
  company: ["M7 20.5v-16h10v16M4 20.5h16M10 8h1M13 8h1M10 11.5h1M13 11.5h1M10 15h1M13 15h1"],
  bell: ["M6.5 16v-4.5a5.5 5.5 0 0 1 11 0V16l1.5 2h-14z", "M10 20.5h4"],
  search: ["M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5"],
  focus: ["M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"],
  layout: ["M5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 5zM14 5v14M14 12h6.5"],
  chevLeft: ["m15 6-6 6 6 6"],
  app: ["M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5z", "M9 12h6"],
};
const SMALL: Record<string, string> = {
  collapse: "M4.5 12h7", fill: "M6.5 4H4v8h2.5M9.5 4H12v8H9.5", close: "m4.5 4.5 7 7M11.5 4.5l-7 7",
};

export type GlyphName = AppId | keyof typeof P | keyof typeof SMALL;

export function Glyph({ name, size = 18 }: { name: GlyphName; size?: number }) {
  if (name in SMALL) {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round">
        <path d={SMALL[name]} />
      </svg>
    );
  }
  const paths = P[name] ?? P.app;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d} opacity={name === "quay" && i === 1 ? 0.55 : 1} />)}
    </svg>
  );
}
