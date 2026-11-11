import { AsyncLocalStorage } from "node:async_hooks";

type Store = { skipAnalytics: boolean };

const als = new AsyncLocalStorage<Store>();

export function requestSkipsAnalytics(request: Request): boolean {
  const dnt = request.headers.get("dnt");
  const gpc = request.headers.get("sec-gpc");
  return dnt === "1" || gpc === "1";
}

export function runTelemetryContext<T>(request: Request, fn: () => T): T {
  return als.run({ skipAnalytics: requestSkipsAnalytics(request) }, fn);
}

export function analyticsSkipped(): boolean {
  return als.getStore()?.skipAnalytics === true;
}
