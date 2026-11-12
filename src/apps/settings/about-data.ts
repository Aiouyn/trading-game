// SET-08 About: static licences and credits [P]. Licence fields of npm packages are verified against
// node_modules/<pkg>/package.json by tests/unit/settings/17b-S2-about.test.tsx.
export interface LicenceRow {
  component: string; licence: string; href: string; pkg?: string; attribution?: string;
  /** The component's NOTICE file, verbatim (Apache-2.0 §4(d)), shown in About with a link to the licence text (§4(a)). */
  notice?: string; licenceHref?: string;
}

/**
 * lightweight-charts v5.2.1 NOTICE, byte for byte from the upstream tag (the npm package does not ship it):
 * https://github.com/tradingview/lightweight-charts/blob/v5.2.1/NOTICE (file + final newline: sha256 f76c6afa…3036e,
 * checked in tests/unit/settings/17b-S2-about.test.tsx). Upstream writes "(с)" with a Cyrillic с (U+0441): kept as is.
 */
export const LIGHTWEIGHT_CHARTS_NOTICE = "TradingView Lightweight Charts\u2122\nCopyright (\u0441) 2025 TradingView, Inc. https://www.tradingview.com/";

export const LICENCES: readonly LicenceRow[] = [
  { component: "Instrument Serif", licence: "SIL OFL 1.1", href: "https://openfontlicense.org/open-font-license-official-text/" },
  { component: "Inter", licence: "SIL OFL 1.1", href: "https://openfontlicense.org/open-font-license-official-text/" },
  { component: "JetBrains Mono", licence: "SIL OFL 1.1", href: "https://openfontlicense.org/open-font-license-official-text/" },
  {
    component: "TradingView Lightweight Charts", licence: "Apache-2.0", href: "https://www.tradingview.com", pkg: "lightweight-charts", attribution: "chartsBy",
    notice: LIGHTWEIGHT_CHARTS_NOTICE, licenceHref: "https://www.apache.org/licenses/LICENSE-2.0",
  },
  { component: "three.js", licence: "MIT", href: "https://github.com/mrdoob/three.js/blob/dev/LICENSE", pkg: "three" },
];

/** Team roles only, never personal data [P]. */
export type CreditRole = "design" | "shellApps" | "city" | "markets" | "quay";
export interface Credit { name: string; roleKey: CreditRole }
export const CREDITS: readonly Credit[] = [
  { name: "Avalon Studio", roleKey: "design" },
  { name: "Front Dev", roleKey: "shellApps" },
  { name: "City Dev", roleKey: "city" },
  { name: "Engine Dev", roleKey: "markets" },
  { name: "Producer", roleKey: "quay" },
];

/** Release shown in the version line [P]: package version, injected at build (next.config env). */
export const release = () => process.env.NEXT_PUBLIC_RELEASE || "dev";
/** Build commit [P]: NEXT_PUBLIC_BUILD_SHA at build, else "dev". */
export const buildSha = () => process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
