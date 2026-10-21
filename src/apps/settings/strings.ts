// Settings copy (17B SET-02 / SET-08), EN + FR. Kept here so src/shell/strings.ts stays untouched [P].
// [P] = proposed copy pending Studio; FR = proposed translations pending review.
import type { PaletteId } from "@/styles/tokens";
import { formatVersion } from "./about-data";

export type SettingsLocale = "en" | "fr";

const cosmeticBase = (id: string) => id.replace(/^cos_shell_/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const EN = {
  title: "Settings",
  backToSettings: "Back to Settings",
  sections: "Settings sections",
  section: {
    "SET-01": "Account", "SET-02": "Appearance", "SET-03": "Sound", "SET-04": "Notifications",
    "SET-05": "Keys", "SET-06": "Privacy", "SET-07": "Trading", "SET-08": "About",
  },
  comingLater: "Coming later",
  palette: "Palette",
  paletteNames: { "ink-brass": "Ink & Brass", broadsheet: "Broadsheet", phosphor: "Phosphor", riviera: "Riviera" } satisfies Record<PaletteId, string>,
  paletteHint: "Palette is saved on this device.", // [P]
  shell: "Shell",
  purchased: "Purchased",
  shellName: (n: number, rankName: string) => `Quay ${n} · ${rankName}`,
  // Studio ruling: "Glass · Cosmetic", derived from the id until the server catalog names cosmetics (Systems).
  cosmeticName: (id: string) => `${cosmeticBase(id)} · Cosmetic`,
  shellThumb: "Shell artwork coming later", // [P] placeholder alt
  textScale: "Text scale",
  percent: (n: number) => `${n} percent`,
  previewLabel: "Preview",
  previewNw: "Net worth",
  previewRow: "Halcyon Shipping",
  highContrast: "High contrast",
  colorBlind: "Colour-blind pair",
  colorBlindHint: "Phosphor is designed for this.",
  usePhosphor: "Use Phosphor",
  reduceMotion: "Reduce motion",
  reduceTransparency: "Reduce transparency",
  modes: { system: "System", on: "On", off: "Off" },
  systemState: (on: boolean) => `System: ${on ? "on" : "off"}`,
  // About (SET-08)
  version: "Version",
  versionLine: formatVersion,
  copyVersion: "Copy version",
  copied: "Copied",
  disclaimers: "Disclaimers",
  disclaimerGame: "A multiplayer finance game. Fictional markets and companies, no real money.",
  disclaimerAdvice: "Nothing here is financial advice.", // [P]
  licences: "Licences",
  colComponent: "Component", colLicence: "Licence", colLink: "Link",
  chartsBy: "Charts by TradingView",
  credits: "Credits",
  roles: { design: "design", shellApps: "shell and apps", city: "Port Avalon", markets: "markets", quay: "Quay" },
  integrity: "Public integrity report",
  newTab: "(opens in a new tab)",
};

type Strings = typeof EN;

const FR: Strings = {
  title: "Réglages",
  backToSettings: "Retour aux réglages",
  sections: "Sections des réglages",
  section: {
    "SET-01": "Compte", "SET-02": "Apparence", "SET-03": "Son", "SET-04": "Notifications",
    "SET-05": "Raccourcis", "SET-06": "Confidentialité", "SET-07": "Ordres", "SET-08": "À propos",
  },
  comingLater: "Bientôt",
  palette: "Palette",
  paletteNames: { "ink-brass": "Ink & Brass", broadsheet: "Broadsheet", phosphor: "Phosphor", riviera: "Riviera" },
  paletteHint: "La palette est enregistrée sur cet appareil.",
  shell: "Coque",
  purchased: "Achetée",
  shellName: (n: number, rankName: string) => `Quay ${n} · ${rankName}`,
  cosmeticName: (id: string) => `${cosmeticBase(id)} · Cosmétique`,
  shellThumb: "Illustration de la coque à venir",
  textScale: "Taille du texte",
  percent: (n: number) => `${n} pour cent`,
  previewLabel: "Aperçu",
  previewNw: "Patrimoine net",
  previewRow: "Halcyon Shipping",
  highContrast: "Contraste élevé",
  colorBlind: "Mode daltonien",
  colorBlindHint: "Phosphor est pensée pour ça.",
  usePhosphor: "Utiliser Phosphor",
  reduceMotion: "Réduire les animations",
  reduceTransparency: "Réduire la transparence",
  modes: { system: "Système", on: "Activé", off: "Désactivé" },
  systemState: (on: boolean) => `Système\u00A0: ${on ? "activé" : "désactivé"}`,
  version: "Version",
  versionLine: formatVersion,
  copyVersion: "Copier la version",
  copied: "Copiée",
  disclaimers: "Avertissements",
  disclaimerGame: "Un jeu de finance multijoueur. Marchés et sociétés fictifs, sans argent réel.",
  disclaimerAdvice: "Rien ici ne constitue un conseil financier.",
  licences: "Licences",
  colComponent: "Composant", colLicence: "Licence", colLink: "Lien",
  chartsBy: "Charts by TradingView", // attribution line stays verbatim (licence requirement)
  credits: "Crédits",
  roles: { design: "conception", shellApps: "interface et applis", city: "Port Avalon", markets: "marchés", quay: "Quay" },
  integrity: "Rapport d’intégrité public",
  newTab: "(s’ouvre dans un nouvel onglet)",
};

export const SETTINGS_STRINGS: Record<SettingsLocale, Strings> = { en: EN, fr: FR };
export const settingsStrings = (locale: string): Strings => SETTINGS_STRINGS[locale === "fr" ? "fr" : "en"];
