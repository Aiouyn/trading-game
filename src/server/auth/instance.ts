import path from "node:path";
import { AuthService } from "./service";
import { FileAuthStore, MemoryAuthStore } from "./store";

const globalForAuth = globalThis as typeof globalThis & {
  __quayAuthService?: AuthService;
};

function createDefaultService(): AuthService {
  // A set QUAY_AUTH_DATA_DIR always uses the file store, including in unit tests that
  // replay a restart where getAuthService() is the first thing to open the saved posts.
  const root = process.env.QUAY_AUTH_DATA_DIR;
  if (root) {
    return new AuthService({ store: new FileAuthStore(path.join(root, "store.json")) });
  }
  if (process.env.QUAY_AUTH_STORE === "memory" || process.env.NODE_ENV === "test") {
    return new AuthService({ store: new MemoryAuthStore() });
  }
  return new AuthService({ store: new FileAuthStore(path.join(process.cwd(), ".data", "auth", "store.json")) });
}

/** Existing singleton, or undefined — does not create a FileAuthStore. */
export function peekAuthService(): AuthService | undefined {
  return globalForAuth.__quayAuthService;
}

/** Process-singleton AuthService for route handlers (survives HMR via globalThis). */
export function getAuthService(): AuthService {
  if (!globalForAuth.__quayAuthService) {
    globalForAuth.__quayAuthService = createDefaultService();
  }
  return globalForAuth.__quayAuthService;
}

/** Test-only: replace the singleton. */
export function setAuthServiceForTests(service: AuthService | undefined): void {
  globalForAuth.__quayAuthService = service;
}
