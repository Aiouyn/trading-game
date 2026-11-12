export { scrubTelemetryText, foldTelemetryText, TELEMETRY_MESSAGE_CAP } from "./scrub";
export {
  anonIdForAccount,
  isAnonId,
  requestIdFrom,
  ANON_ID_RE,
  telemetrySecret,
  resetTelemetrySecretCache,
  MissingTelemetrySecretError,
  TELEMETRY_SECRET_FILE,
} from "./ids";
export { runTelemetryContext, requestSkipsAnalytics, analyticsSkipped } from "./context";
export {
  appendError,
  appendEvent,
  appendFeedback,
  addOptOut,
  addConsent,
  isOptedOut,
  isConsented,
  resetOptOutCache,
  setTelemetryBypassConsentForTests,
  flushTelemetry,
  telemetryDir,
  TelemetryDirFullError,
  TELEMETRY_MAX_BODY_BYTES,
  TELEMETRY_FEEDBACK_MAX_CHARS,
  TELEMETRY_ROUTE_MAX,
  TELEMETRY_FILE_MAX_BYTES,
  TELEMETRY_FILE_ROTATIONS,
  TELEMETRY_DIR_MAX_BYTES,
} from "./log";
export {
  recordEvent,
  recordEventSafe,
  isAnalyticsEvent,
  isClientAnalyticsEvent,
  ANALYTICS_EVENTS,
  CLIENT_EVENTS,
  type AnalyticsEvent,
} from "./events";
export { checkTelemetryRate, resetTelemetryLimits, setTelemetryLimits, setTelemetryGlobalLimits, clientKey } from "./ratelimit";
export { handleTelemetry, withRequestId, jsonResponse, readJsonObjectCappedStreaming } from "./http";
