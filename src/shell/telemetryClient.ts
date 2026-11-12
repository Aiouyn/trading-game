/** First-party error reporter used by the shell error boundary. Keep this module small: it is on the first-load graph. */
export function reportClientError(message: string, route = typeof window !== "undefined" ? window.location.pathname : "/"): void {
  void fetch("/api/telemetry/error", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: String(message).slice(0, 2000), route: String(route).slice(0, 200) }),
    keepalive: true,
  }).catch(() => {});
}
