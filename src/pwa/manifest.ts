// M2-05: the web app manifest (served by src/app/manifest.ts at /manifest.webmanifest). The icon is the existing
// quay glyph (src/components/shell/glyphs/ui.ts) on the --bg0 / --fg tokens; tests/unit/pwa pins it to the glyph.
import type { MetadataRoute } from "next";
import { PALETTES } from "@/styles/tokens";

export const PWA_BG = PALETTES["ink-brass"].bg0; // the default (dark) palette's --bg0

export const MANIFEST: MetadataRoute.Manifest = {
  id: "/",
  name: "Quay · Port Avalon",
  short_name: "Quay",
  description: "A simulated finance and trading game. Fictional markets, no real money.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: PWA_BG,
  theme_color: PWA_BG,
  icons: [{ src: "/quay-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
};
