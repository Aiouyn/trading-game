import type { NextConfig } from "next";
import path from "node:path";

// Pin the project root: a stray package-lock.json in the home folder otherwise makes Next guess the wrong root.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  // The credits moved into the Settings window (P2-119). Server mode, so a redirect is enough.
  async redirects() {
    return [{ source: "/credits", destination: "/settings/about", permanent: false }];
  },
};

export default nextConfig;
