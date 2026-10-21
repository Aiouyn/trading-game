import { notFound } from "next/navigation";
import { NoticesSheet } from "./NoticesSheet";

// /__ds/notices (17A T5 [P]): dev-only demo of the banner, sheet and overlay components before their shell
// mount points land (sixth micro-PR). Production serves it only with QUAY_DS=1 (e2e screenshots).
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/__ds/notices">) {
  if (process.env.NODE_ENV === "production" && process.env.QUAY_DS !== "1") notFound();
  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  return <NoticesSheet show={one("show")} palette={one("palette") || "ink-brass"} />;
}
