// SET-08 About: static licences and credits [P]. Licence fields of npm packages are verified against
// node_modules/<pkg>/package.json by tests/unit/settings/17b-S2-about.test.tsx.
export interface LicenceRow { component: string; licence: string; href: string; pkg?: string; attribution?: string }

export const LICENCES: readonly LicenceRow[] = [
  { component: "Instrument Serif", licence: "SIL OFL 1.1", href: "https://openfontlicense.org/open-font-license-official-text/" },
  { component: "Inter", licence: "SIL OFL 1.1", href: "https://openfontlicense.org/open-font-license-official-text/" },
  { component: "JetBrains Mono", licence: "SIL OFL 1.1", href: "https://openfontlicense.org/open-font-license-official-text/" },
  { component: "TradingView Lightweight Charts", licence: "Apache-2.0", href: "https://www.tradingview.com", pkg: "lightweight-charts", attribution: "chartsBy" },
  { component: "three.js", licence: "MIT", href: "https://github.com/mrdoob/three.js/blob/dev/LICENSE", pkg: "three" },
];

/** Team roles only, never personal data [P]. */
export const CREDITS: readonly string[] = ["Avalon Studio · design", "Front Dev · shell and apps", "City Dev · Port Avalon", "Engine Dev · markets", "Producer · Quay"];

/** Release shown in the version line [P]: package version, injected at build (next.config env). */
export const release = () => process.env.NEXT_PUBLIC_RELEASE || "dev";
/** Build commit [P]: NEXT_PUBLIC_BUILD_SHA at build, else "dev". */
export const buildSha = () => process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
