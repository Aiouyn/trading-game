import { notFound } from "next/navigation";

// /__ds/notices (17A T5 [P]): dev-only demo of the banner, sheet and overlay components before their shell
// mount points land (sixth micro-PR). Build-time gate: NODE_ENV and QUAY_DS (always defined "1"/"0" in
// next.config.ts) are inlined, so a production build without QUAY_DS=1 folds DS_ENABLED to false and the
// dynamic import below is dead code: the demo sheet (mock order entry, halt toggle) never reaches the bundle.
export const dynamic = "force-dynamic";
const DS_ENABLED = process.env.NODE_ENV !== "production" || process.env.QUAY_DS === "1";

export default async function Page({ searchParams }: PageProps<"/__ds/notices">) {
  if (!DS_ENABLED) notFound();
  const { NoticesSheet } = await import("@ds/notices-sheet");
  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  return <NoticesSheet show={one("show")} palette={one("palette") || "ink-brass"} />;
}
