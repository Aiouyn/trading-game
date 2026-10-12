import type { Metadata } from "next";
import { connection } from "next/server";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PALETTE_BOOT_SCRIPT } from "@/components/os/paletteBoot";

const serif = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-instrument-serif" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: "Trading Game",
  description: "A simulated finance and trading game. Fictional markets, no real money.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The world's port is read per request (TG_WORLD_PORT, set by `npm run play`), so a phone on the LAN finds the world without
  // a rebuild. The build-time NEXT_PUBLIC_WORLD_URL still wins when it is set (e2e). The page's own host is used for the address.
  await connection();
  const worldPort = /^\d{1,5}$/.test(process.env.TG_WORLD_PORT ?? "") ? process.env.TG_WORLD_PORT! : "";
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {worldPort ? <script dangerouslySetInnerHTML={{ __html: `window.__TG_WORLD_PORT__=${worldPort};` }} /> : null}
        <script dangerouslySetInnerHTML={{ __html: PALETTE_BOOT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
