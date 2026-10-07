import { APP_NAME } from "@/lib/app";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="text-sm opacity-70">Phase 0 sandbox. Engine and Ink &amp; Brass styling land next.</p>
    </main>
  );
}