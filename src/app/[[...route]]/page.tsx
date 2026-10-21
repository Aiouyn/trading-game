import { QuayShell } from "@/components/shell/QuayShell";

// One optional catch-all route: `/` is home, `/{appId}/{screenId}?{params}` deep-links (17 §2.4).
export default async function Page({ params, searchParams }: PageProps<"/[[...route]]">) {
  const { route = [] } = await params;
  const sp = await searchParams;
  const query = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])),
  ).toString();
  return <QuayShell route={route} query={query} />;
}
