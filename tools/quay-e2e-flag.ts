/** Official-e2e consent skip: inlined at build time. A normal production build cannot turn the prompt off. */
export function resolveQuayE2eFlag(env: Record<string, string | undefined> = process.env): "1" | "0" {
  const wants = env.NEXT_PUBLIC_QUAY_E2E === "1";
  const official = env.QUAY_OFFICIAL_E2E_BUILD === "1";
  if (wants && !official) {
    throw new Error(
      "NEXT_PUBLIC_QUAY_E2E=1 is only allowed for the official Playwright e2e build (set QUAY_OFFICIAL_E2E_BUILD=1 in playwright.config webServer.env). A normal production build cannot turn the consent prompt off.",
    );
  }
  return wants && official ? "1" : "0";
}
