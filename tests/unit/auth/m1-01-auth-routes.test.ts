import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthService, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests } from "@/server/auth";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";

function cookieFrom(res: Response): string | null {
  const raw = res.headers.getSetCookie?.() ?? [];
  const list = raw.length ? raw : [res.headers.get("set-cookie")].filter(Boolean) as string[];
  const hit = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!hit) return null;
  return hit.split(";")[0] ?? null;
}

describe("M1-01 auth HTTP routes", () => {
  beforeEach(() => {
    setAuthServiceForTests(new AuthService({ store: new MemoryAuthStore() }));
  });
  afterEach(() => {
    setAuthServiceForTests(undefined);
  });

  it("register → me → logout → me 401; second player isolated", async () => {
    const reg = await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: "Helix", password: "password1" }),
      }),
    );
    expect(reg.status).toBe(201);
    const cookie = cookieFrom(reg);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);

    const meOk = await me(
      new Request("http://localhost/api/auth/me", { headers: { cookie: cookie! } }),
    );
    expect(meOk.status).toBe(200);
    const meBody = (await meOk.json()) as { account: { handle: string }; player: { cashCents: number } };
    expect(meBody.account.handle).toBe("Helix");
    expect(meBody.player.cashCents).toBe(1_000_000);

    const regB = await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: "Ion", password: "password1" }),
      }),
    );
    const cookieB = cookieFrom(regB)!;
    const meB = await me(new Request("http://localhost/api/auth/me", { headers: { cookie: cookieB } }));
    const bodyB = (await meB.json()) as { account: { accountId: string; handle: string } };
    expect(bodyB.account.handle).toBe("Ion");
    expect(bodyB.account.accountId).not.toBe((await (await me(new Request("http://localhost/api/auth/me", { headers: { cookie: cookie! } }))).json() as { account: { accountId: string } }).account.accountId);

    const out = await logout(
      new Request("http://localhost/api/auth/logout", { method: "POST", headers: { cookie: cookie! } }),
    );
    expect(out.status).toBe(200);
    const meGone = await me(new Request("http://localhost/api/auth/me", { headers: { cookie: cookie! } }));
    expect(meGone.status).toBe(401);

    const loginRes = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: "Helix", password: "password1" }),
      }),
    );
    expect(loginRes.status).toBe(200);
    expect(cookieFrom(loginRes)).toContain(SESSION_COOKIE_NAME);
  });
});
