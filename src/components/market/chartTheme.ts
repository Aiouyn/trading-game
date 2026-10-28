// Price chart theme (UI card 7): every colour the canvas paints is a design token, read at runtime with
// getComputedStyle from inside the chart's own element (a sub-palette or data-hc scope applies). No colour literal
// lives here: tokens.css is the only file that names a colour.

/** The tokens the chart paints with. */
export const CHART_TOKENS = {
  bg: "--win",
  text: "--fg-faint",
  grid: "--grid",
  crosshair: "--line",
  series: "--fg",
  lastLine: "--fg-muted",
  label: "--win2",
} as const;
export type ChartColours = Record<keyof typeof CHART_TOKENS, string>;

export interface ChartTheme {
  readonly colours: ChartColours;
  /** data-hc: a 2 px line, no grid (the plot's border is CSS). */
  readonly hc: boolean;
  readonly reducedMotion: boolean;
  readonly fontFamily: string;
  readonly fontSize: number;
}

/** Resolve each token to the computed rgb() text, in `host`'s cascade. Null when a token does not resolve (no
 *  stylesheet, e.g. a DOM without CSS): the library cannot paint an empty colour, so the chart shows its error state. */
export function readChartTheme(host: HTMLElement): ChartTheme | null {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  const colours = {} as ChartColours;
  for (const [k, v] of Object.entries(CHART_TOKENS) as [keyof ChartColours, string][]) {
    probe.style.color = `var(${v})`;
    colours[k] = getComputedStyle(probe).color;
  }
  if (Object.values(colours).some((c) => c === "")) { probe.remove(); return null; }
  // The axis text size: --fs-11_5 (already times --text-scale), measured as a width so no CSS text is parsed.
  probe.style.cssText = "position:absolute;visibility:hidden;display:block;height:0;width:var(--fs-11_5)";
  const fontSize = Math.round(probe.getBoundingClientRect().width) || 12;
  probe.style.fontFamily = "var(--font-num)";
  const fontFamily = getComputedStyle(probe).fontFamily;
  probe.remove();
  const html = document.documentElement;
  return {
    colours,
    hc: html.dataset.hc === "1",
    reducedMotion: html.dataset.motion === "reduce",
    fontFamily,
    fontSize,
  };
}

/** The html attributes that change the theme. */
export const THEME_ATTRS = ["data-palette", "data-hc", "data-cb", "data-motion", "class", "style"];
