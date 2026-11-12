import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ExposedBindError,
  EXPOSED_HOST_MESSAGE,
  assertTrustProxyForExposedHost,
  decodeProcAddress,
} from "@/server/auth/bind";
import { spawnBootRegister } from "../../helpers/spawnBootRegister";

function boot(script: string, args: string[], extra: Record<string, string>): { status: number | null; stderr: string } {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.QUAY_SPEND_OPT_IN;
  delete env.QUAY_KILL_SWITCH;
  delete env.QUAY_PUBLIC_HOST;
  delete env.QUAY_TRUST_PROXY;
  delete env.QUAY_TRUSTED_HOSTS;
  delete env.VERCEL;
  delete env.DATABASE_URL;
  Object.assign(env, extra);
  const result = spawnSync(
    path.join(process.cwd(), "node_modules", ".bin", "tsx"),
    [script, ...args],
    { cwd: process.cwd(), env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 30_000 },
  );
  return { status: result.status, stderr: result.stderr ?? "" };
}

describe("trust-proxy boot", () => {
  it("decodes proc listen addresses", () => {
    expect(decodeProcAddress("0100007F:AA85", false)).toBe("127.0.0.1");
    expect(decodeProcAddress("00000000:8AE1", false)).toBe("0.0.0.0");
    expect(decodeProcAddress("00000000000000000000000001000000:9CFD", true)).toBe("::1");
    expect(decodeProcAddress("00000000000000000000000000000000:A8A9", true)).toBe("::");
  });

  it("refuses a non-loopback host unless the flag is exactly 1", () => {
    for (const host of ["0.0.0.0", "::", "192.0.2.10", "play.example"]) {
      expect(() => assertTrustProxyForExposedHost({}, [host])).toThrow(ExposedBindError);
      try {
        assertTrustProxyForExposedHost({}, [host]);
      } catch (error) {
        expect((error as Error).message).toBe(EXPOSED_HOST_MESSAGE);
      }
      expect(() => assertTrustProxyForExposedHost({ QUAY_TRUST_PROXY: "1" }, [host])).not.toThrow();
      for (const flag of [" 1", "1 ", "true", "yes"]) {
        expect(() => assertTrustProxyForExposedHost({ QUAY_TRUST_PROXY: flag }, [host])).toThrow(ExposedBindError);
      }
    }
  });

  it("leaves loopback hosts alone", () => {
    for (const host of ["127.0.0.1", "localhost", "::1", "[::1]:3000", "localhost:3000", "127.0.0.8:9"]) {
      expect(() => assertTrustProxyForExposedHost({}, [host])).not.toThrow();
    }
    expect(() => assertTrustProxyForExposedHost({}, [])).not.toThrow();
  });

  it("boot-register exits 1 for a public host and 0 for loopback or an exact flag", () => {
    const secret = "super-secret-host.example";
    const refused = spawnBootRegister({ QUAY_PUBLIC_HOST: secret });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('QUAY_TRUST_PROXY is not exactly "1"');
    expect(refused.stderr).not.toContain(secret);
    expect(refused.stderr.trim().split("\n")).toHaveLength(1);

    expect(spawnBootRegister({ QUAY_PUBLIC_HOST: secret, QUAY_TRUST_PROXY: "1" }).status).toBe(0);
    expect(spawnBootRegister({ QUAY_PUBLIC_HOST: secret, QUAY_TRUST_PROXY: "true" }).status).toBe(1);
    expect(spawnBootRegister({ QUAY_PUBLIC_HOST: "127.0.0.1:3000" }).status).toBe(0);
    expect(spawnBootRegister({ QUAY_PUBLIC_HOST: "localhost" }).status).toBe(0);
    expect(spawnBootRegister({ QUAY_PUBLIC_HOST: "[::1]:3000" }).status).toBe(0);
  });

  it("a real listen socket refuses 0.0.0.0 and ::, and allows loopback", () => {
    for (const host of ["0.0.0.0", "::"]) {
      const refused = boot("tools/ops/boot-bind.ts", [host], {});
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("QUAY_TRUST_PROXY");
      expect(refused.stderr).not.toContain("0.0.0.0");
      expect(refused.stderr.trim().split("\n")).toHaveLength(1);
      expect(boot("tools/ops/boot-bind.ts", [host], { QUAY_TRUST_PROXY: "1" }).status).toBe(0);
    }
    for (const host of ["127.0.0.1", "localhost", "::1"]) {
      expect(boot("tools/ops/boot-bind.ts", [host], {}).status).toBe(0);
    }
  });
});
