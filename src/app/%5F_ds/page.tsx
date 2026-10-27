import { notFound } from "next/navigation";

// /__ds (17A T1 [P]): dev-only primitives sheet. Production serves it only with QUAY_DS=1 (e2e screenshots).
// Build-time gate, same as /__ds/notices: without QUAY_DS=1 next.config.ts aliases `@ds/primitives-sheet` to an empty
// stub, so the sheet (and its demo strings) never reaches .next/static or .next/server; a static import here shipped it.
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/__ds">) {
  if (process.env.NODE_ENV === "production" && process.env.QUAY_DS !== "1") notFound();
  const { DesignSystemSheet } = await import("@ds/primitives-sheet");
  const { palette } = await searchParams;
  return <DesignSystemSheet palette={typeof palette === "string" ? palette : "ink-brass"} />;
}
