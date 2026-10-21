// Mock intent log (Spec 1 AC S1-17). The shell never writes here: only explicit confirms in
// real apps will. Tests read window.__quayIntents to prove launcher/layout/keys submit nothing.
export interface Intent { kind: string; payload: Record<string, string> }

const log: Intent[] = [];

export function submitIntent(i: Intent): void {
  log.push(i);
}

export function intentLog(): readonly Intent[] {
  return log;
}

if (typeof window !== "undefined") {
  (window as Window & { __quayIntents?: () => readonly Intent[] }).__quayIntents = intentLog;
}
