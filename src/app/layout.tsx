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
  // Standalone iOS: a translucent system status bar so the dark shell, and the top safe-area inset, are real.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Quay" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: PWA_BG };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
