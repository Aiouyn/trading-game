import { afterEach, describe, expect, it } from "vitest";
import { AuthError, allowedAuthHosts, assertSameOriginMutation } from "@/server/auth";
import { believedForwardedHost } from "@/server/auth/http";

const PORT = "4173";

function mutation(urlHost: string, origin: string, extra?: Record<string, string>): Request {
  return new Request(`http://${urlHost}/api/auth/register`, {
    method: "POST",
    headers: { origin, ...extra },
  });
}

function allows(request: Request): boolean {
  try {
    assertSameOriginMutation(request);
    return true;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    return false;
  }
}

describe("local origin allowlist", () => {
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV;

  afterEach(() => {
    delete env.QUAY_PUBLIC_HOST;
    delete env.QUAY_TRUST_PROXY;
    delete env.QUAY_TRUSTED_HOSTS;
    delete env.VERCEL;
    if (nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = nodeEnv;
  });

  describe("local default", () => {
    it("allows 127.0.0.1 and localhost on the same port, including under production", () => {
      env.NODE_ENV = "production";
      for (const [urlHost, originHost] of [
        [`localhost:${PORT}`, `127.0.0.1:${PORT}`],
        [`127.0.0.1:${PORT}`, `localhost:${PORT}`],
        [`localhost:${PORT}`, `localhost:${PORT}`],
        [`127.0.0.1:${PORT}`, `127.0.0.1:${PORT}`],
        [`[::1]:${PORT}`, `127.0.0.1:${PORT}`],
      ] as const) {
        expect(allows(mutation(urlHost, `http://${originHost}`))).toBe(true);
      }
      expect(allows(mutation(`0.0.0.0:${PORT}`, `http://localhost:${PORT}`))).toBe(true);
    });

    it("rejects a foreign Origin and a different port", () => {
      expect(allows(mutation(`127.0.0.1:${PORT}`, "https://evil.example"))).toBe(false);
      expect(allows(mutation(`localhost:${PORT}`, `http://127.0.0.1:9`))).toBe(false);
      expect(allows(mutation("evil.example", "https://evil.example"))).toBe(false);
    });

    it("does not believe X-Forwarded-Host", () => {
      const request = mutation(`localhost:${PORT}`, "https://evil.example", { "x-forwarded-host": "evil.example" });
      expect(believedForwardedHost(request)).toBeNull();
      expect([...allowedAuthHosts(request)]).not.toContain("evil.example");
      expect(allows(request)).toBe(false);
    });

    it("accepts a loopback Referer when Origin is absent", () => {
      const request = new Request(`http://localhost:${PORT}/api/auth/register`, {
        method: "POST",
        headers: { referer: `http://127.0.0.1:${PORT}/settings` },
      });
      expect(allows(request)).toBe(true);
    });
  });

  describe("QUAY_TRUSTED_HOSTS", () => {
    it("allows the listed host without QUAY_TRUST_PROXY and ignores an unlisted forwarded host", () => {
      env.QUAY_TRUSTED_HOSTS = "play.example, audit.example:8443";
      const ok = mutation(`localhost:${PORT}`, "https://play.example", { "x-forwarded-host": "evil.example" });
      expect(believedForwardedHost(ok)).toBeNull();
      expect(allows(ok)).toBe(true);
      expect([...allowedAuthHosts(ok)]).not.toContain("evil.example");
      expect(allows(mutation("localhost", "https://evil.example", { "x-forwarded-host": "evil.example" }))).toBe(false);
      expect(allows(mutation("localhost", "https://audit.example:8443"))).toBe(true);
    });

    it("with QUAY_TRUST_PROXY=1 believes only a forwarded host that is already configured", () => {
      env.QUAY_TRUST_PROXY = "1";
      env.QUAY_TRUSTED_HOSTS = "play.example";
      const believed = mutation("127.0.0.1:3000", "https://play.example", { "x-forwarded-host": "play.example" });
      expect(believedForwardedHost(believed)).toBe("play.example");
      expect(allows(believed)).toBe(true);
      const spoof = mutation("127.0.0.1:3000", "https://evil.example", { "x-forwarded-host": "evil.example, play.example" });
      expect(believedForwardedHost(spoof)).toBeNull();
      expect([...allowedAuthHosts(spoof)]).not.toContain("evil.example");
      expect(allows(spoof)).toBe(false);
    });

    it("does not treat a near miss as the flag", () => {
      env.QUAY_TRUSTED_HOSTS = "play.example";
      for (const value of [" 1", "1 ", "true", "yes"]) {
        env.QUAY_TRUST_PROXY = value;
        const request = mutation("localhost:3000", "https://play.example", { "x-forwarded-host": "play.example" });
        expect(believedForwardedHost(request)).toBeNull();
        expect(allows(request)).toBe(true);
      }
    });

    it("trust proxy alone does not allow a forwarded host", () => {
      env.QUAY_TRUST_PROXY = "1";
      const request = mutation("localhost:3000", "https://evil.example", { "x-forwarded-host": "evil.example" });
      expect(believedForwardedHost(request)).toBeNull();
      expect(allows(request)).toBe(false);
    });
  });

  describe("QUAY_PUBLIC_HOST", () => {
    it("pins that host and does not add the other loopback name", () => {
      env.QUAY_PUBLIC_HOST = "127.0.0.1:3000";
      const ok = mutation("localhost:3000", "http://127.0.0.1:3000", { "x-forwarded-host": "evil.example" });
      expect([...allowedAuthHosts(ok)]).toEqual(["127.0.0.1:3000"]);
      expect(allows(ok)).toBe(true);
      expect(allows(mutation("127.0.0.1:3000", "http://localhost:3000"))).toBe(false);
      expect(allows(mutation("evil.example", "https://evil.example"))).toBe(false);
    });

    it("keeps a pinned localhost as the only host when a forwarded host is present", () => {
      env.QUAY_PUBLIC_HOST = "localhost:3000";
      const request = mutation("localhost:3000", "http://localhost:3000", { "x-forwarded-host": "evil.example" });
      expect([...allowedAuthHosts(request)]).toEqual(["localhost:3000"]);
      expect(allows(request)).toBe(true);
    });
  });

  describe("production mode", () => {
    it("rejects localhost and a spoofed host", () => {
      env.VERCEL = "1";
      env.NODE_ENV = "production";
      expect(allows(mutation("localhost:3000", "http://localhost:3000"))).toBe(false);
      expect(allows(mutation("127.0.0.1:3000", "http://127.0.0.1:3000"))).toBe(false);
      const spoof = mutation("evil.example", "https://evil.example", {
        host: "evil.example",
        "x-forwarded-host": "evil.example",
      });
      expect(allows(spoof)).toBe(false);
      expect([...allowedAuthHosts(spoof)]).toEqual([]);
      env.QUAY_TRUST_PROXY = "1";
      expect(allows(mutation("play.example", "https://play.example", { "x-forwarded-host": "play.example" }))).toBe(false);
    });

    it("allows only the configured host once one is set", () => {
      env.VERCEL = "1";
      env.NODE_ENV = "production";
      env.QUAY_PUBLIC_HOST = "play.example";
      env.QUAY_TRUSTED_HOSTS = "admin.example";
      expect(allows(mutation("localhost:3000", "https://play.example"))).toBe(true);
      expect(allows(mutation("evil.example", "https://admin.example", { host: "evil.example" }))).toBe(true);
      expect(allows(mutation("play.example", "http://localhost:3000"))).toBe(false);
      expect(allows(mutation("evil.example", "https://evil.example", { host: "evil.example" }))).toBe(false);
    });
  });
});
