/** First-party telemetry client: no third-party scripts, no new cookies. */

export const OPT_OUT_KEY = "quay.telemetry.optout";
export const ANON_KEY = "quay.telemetry.anon";
export const WIRE_OPEN_KEY = "quay.telemetry.wire_open";

function browserAnalyticsAllowed(): boolean {
  try {
    if (window.localStorage.getItem(OPT_OUT_KEY)) return false;
  } catch {
    return false;
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  if (nav.doNotTrack === "1" || nav.doNotTrack === "yes") return false;
  if (nav.globalPrivacyControl === true) return false;
  return true;
}

export function isTelemetryOptedOut(): boolean {
  try {
    return !!window.localStorage.getItem(OPT_OUT_KEY);
  } catch {
    return false;
  }
}

export function guestAnonId(): string | null {
  try {
    const existing = window.localStorage.getItem(ANON_KEY);
    if (existing && /^anon_[a-f0-9]{16,64}$/.test(existing)) return existing;
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const id = `anon_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
    window.localStorage.setItem(ANON_KEY, id);
    return id;
  } catch {
    return null;
  }
}

function postJson(path: string, body: Record<string, unknown>): void {
  const headers: Record<string, string> = { "content-type": "application/json" };
  void fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

export function reportClientError(message: string, route = typeof window !== "undefined" ? window.location.pathname : "/"): void {
  postJson("/api/telemetry/error", { message: String(message).slice(0, 2000), route: String(route).slice(0, 200) });
}

export function recordFirstWireOpen(): void {
  try {
    if (!browserAnalyticsAllowed()) return;
    if (window.localStorage.getItem(WIRE_OPEN_KEY)) return;
    window.localStorage.setItem(WIRE_OPEN_KEY, "1");
  } catch {
    return;
  }
  const anonId = guestAnonId();
  postJson("/api/telemetry/event", { event: "first_wire_open", ...(anonId ? { anonId } : {}) });
}

export function setTelemetryOptOut(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    return;
  }
  if (on) {
    const anonId = guestAnonId();
    postJson("/api/telemetry/optout", anonId ? { anonId } : {});
  }
}

export async function sendFeedback(text: string, route: string): Promise<boolean> {
  try {
    const res = await fetch("/api/telemetry/feedback", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, route }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
