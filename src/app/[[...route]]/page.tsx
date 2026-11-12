import { notFound } from "next/navigation";
import { QuayShell } from "@/components/shell/QuayShell";
import { flagsFromSearch, routeShrouded } from "@/shell/v1Shroud";

// One optional catch-all route: `/` is home, `/{appId}/{screenId}?{params}` deep-links (17 §2.4).
// Out-of-scope systems 404 unless their flag is on (M1-11). The query is honored only in a QUAY_HOOKS build.
export default async function Page({ params, searchParams }: PageProps<"/[[...route]]">) {
  const { route = [] } = await params;
  const sp = await searchParams;
  const query = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])),
  );
  if (routeShrouded(route, flagsFromSearch(query))) notFound();
  return <QuayShell route={route} query={query.toString()} />;
}
