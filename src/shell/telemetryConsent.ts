/** First-party analytics consent and client events. Do not import from the shell first-load graph. */

export const OPT_OUT_KEY = "quay.telemetry.optout";
/** "1" = accepted, "0" = declined. Absent means no first-launch decision yet. */
export const CONSENT_KEY = "quay.telemetry.consent";
export const ANON_KEY = "quay.telemetry.anon";
export const WIRE_OPEN_KEY = "quay.telemetry.wire_open";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // private mode
  }
}

/** Migrate the V1 opt-out flag into a recorded Decline. */
function migratedConsent(): "1" | "0" | null {
  const raw = readStorage(CONSENT_KEY);
  if (raw === "1" || raw === "0") return raw;
  if (readStorage(OPT_OUT_KEY)) {
    writeStorage(CONSENT_KEY, "0");
    return "0";
  }
  return null;
}

export function telemetryConsent(): "1" | "0" | null {
  if (typeof window === "undefined") return null;
  return migratedConsent();
}

export function browserHasDntOrGpc(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  if (nav.doNotTrack === "1" || nav.doNotTrack === "yes") return true;
  if (nav.globalPrivacyControl === true) return true;
  return false;
}

function browserAnalyticsAllowed(): boolean {
  if (telemetryConsent() !== "1") return false;
  if (browserHasDntOrGpc()) return false;
  return true;
}

export function isTelemetryOptedOut(): boolean {
  return telemetryConsent() === "0";
}

export function hasAnalyticsConsent(): boolean {
  return telemetryConsent() === "1";
}

/** True when the first-launch prompt should be offered (no decision, and DNT/GPC is off). */
export function needsTelemetryConsentPrompt(): boolean {
  if (browserHasDntOrGpc()) return false;
  return telemetryConsent() === null;
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
  void fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
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

function postConsent(granted: boolean): void {
  const anonId = guestAnonId();
  postJson("/api/telemetry/consent", { granted, ...(anonId ? { anonId } : {}) });
}

export function setTelemetryOptOut(on: boolean): void {
  writeStorage(CONSENT_KEY, on ? "0" : "1");
  if (on) writeStorage(OPT_OUT_KEY, "1");
  else writeStorage(OPT_OUT_KEY, null);
  postConsent(!on);
}

export function setTelemetryConsent(granted: boolean): void {
  setTelemetryOptOut(!granted);
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
