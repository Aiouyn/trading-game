import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PWA_BG } from "@/pwa/manifest";

const serif = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-instrument-serif" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: "Quay · Port Avalon",
  description: "A simulated finance and trading game. Fictional markets, no real money.",
  // Standalone iOS: served meta is black-translucent (default dark theme). applyAppearance switches it to
  // default on light palettes. capable: true emits mobile-web-app-capable; the Apple-prefixed name is in <head>.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Quay" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: PWA_BG };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        {/* Next 16 emits mobile-web-app-capable from appleWebApp.capable; iOS reads the Apple-prefixed name. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
