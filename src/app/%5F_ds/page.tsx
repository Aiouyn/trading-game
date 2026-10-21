import { notFound } from "next/navigation";
import { DesignSystemSheet } from "./DesignSystemSheet";

// /__ds (17A T1 [P]): dev-only primitives sheet. Production serves it only with QUAY_DS=1 (e2e screenshots).
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/__ds">) {
  if (process.env.NODE_ENV === "production" && process.env.QUAY_DS !== "1") notFound();
  const { palette } = await searchParams;
  return <DesignSystemSheet palette={typeof palette === "string" ? palette : "ink-brass"} />;
}
