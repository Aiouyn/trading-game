import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, START_CASH_CENTS, setAuthServiceForTests } from "@/server/auth";
import { LiveMarket } from "@/server/market/clock";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as wireGet, POST as wirePost } from "@/app/api/wire/route";
import {
  WIRE_POST_FEE_CENTS,
  WIRE_POST_MAX_BODY_BYTES,
  WirePostError,
  hasPersonalData,
  loadPlayerWirePosts,
  loadWirePostIntents,
  parsePlayerWirePosts,
  parseWirePostIntents,
  playerPostToWireItem,
  publicHandleId,
  remainingPostsToday,
  sanitizeWireText,
} from "@/server/wire/playerStatements";
import { EN } from "@/apps/wire/strings";
import { isPlayerStatementItem } from "@/apps/wire/WireItemRow";

const TICK = 27_700;
const DAY_END = 28_079; // last tick of day 38 (same day as TICK)
const NEXT_DAY = 28_080;
const PASS = "password1";

async function account(store = new MemoryAuthStore(), handle = "PosterA") {
  const auth = new AuthService({ store });
  const a = await auth.register({ handle, password: PASS });
  return { auth, store, ...a };
}

describe("gatekeeper probes: money / idempotency / quarantine / PII / CSRF", () => {
  const temps: string[] = [];
  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("20 parallel distinct keys: never exceeds cap, never double-charges, never negative", async () => {
    const { auth, view } = await account();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        auth.postWireStatement({
          accountId: view.account.accountId,
          handle: view.account.handle,
          idempotencyKey: `par-key-${String(i).padStart(2, "0")}`,
          text: `parallel ${i}`,
          assetTags: ["HALC"],
          tick: TICK,
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ cashCents: number; replayed: boolean }>[];
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok.length).toBe(3);
    expect(ok.every((r) => r.value.replayed === false)).toBe(true);
    expect(rejected.length).toBe(17);
    expect(rejected.every((r) => r.reason instanceof WirePostError && r.reason.code === "DAY_CAP")).toBe(true);
    const posts = await auth.listPublicWirePosts();
    expect(posts.length).toBe(3);
    const led = await auth.getPlayerPrivate(view, view.account.accountId);
    expect(led.cashCents).toBe(START_CASH_CENTS - 3 * WIRE_POST_FEE_CENTS);
    expect(led.cashCents).toBeGreaterThanOrEqual(0);
  });

  it("20 parallel same key+body: one charge, one row, rest replay", async () => {
    const { auth, view } = await account();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        auth.postWireStatement({
          accountId: view.account.accountId,
          handle: view.account.handle,
          idempotencyKey: "same-key-01",
          text: "same body",
          assetTags: ["HALC"],
          tick: TICK,
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ cashCents: number; replayed: boolean; post: { id: string } }>[];
    expect(ok.length).toBe(20);
    expect(ok.filter((r) => r.value.replayed).length).toBe(19);
    expect(ok.filter((r) => !r.value.replayed).length).toBe(1);
    const ids = new Set(ok.map((r) => r.value.post.id));
    expect(ids.size).toBe(1);
    expect((await auth.listPublicWirePosts()).length).toBe(1);
    const led = await auth.getPlayerPrivate(view, view.account.accountId);
    expect(led.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
  });

  it("20 parallel same key different bodies: one accepted, rest 409, one charge", async () => {
    const { auth, view } = await account();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        auth.postWireStatement({
          accountId: view.account.accountId,
          handle: view.account.handle,
          idempotencyKey: "conflict-k1",
          text: `body ${i}`,
          assetTags: ["HALC"],
          tick: TICK,
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok.length).toBe(1);
    expect(rejected.length).toBe(19);
    expect(rejected.every((r) => r.reason instanceof WirePostError && r.reason.code === "IDEMPOTENCY_CONFLICT")).toBe(true);
    expect((await auth.listPublicWirePosts()).length).toBe(1);
    const led = await auth.getPlayerPrivate(view, view.account.accountId);
    expect(led.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
  });

  it("idempotency keys are scoped per account", async () => {
    const store = new MemoryAuthStore();
    const auth = new AuthService({ store });
    const a = await auth.register({ handle: "AliceP", password: PASS });
    const b = await auth.register({ handle: "BobPxx", password: PASS });
    const first = await auth.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "shared-key",
      text: "alice says",
      assetTags: ["HALC"],
      tick: TICK,
    });
    const second = await auth.postWireStatement({
      accountId: b.view.account.accountId,
      handle: b.view.account.handle,
      idempotencyKey: "shared-key",
      text: "bob says something else",
      assetTags: ["NMBS"],
      tick: TICK,
    });
    expect(second.replayed).toBe(false);
    expect(second.post.id).not.toBe(first.post.id);
    expect((await auth.listPublicWirePosts()).length).toBe(2);
    const aLed = await auth.getPlayerPrivate(a.view, a.view.account.accountId);
    const bLed = await auth.getPlayerPrivate(b.view, b.view.account.accountId);
    expect(aLed.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    expect(bLed.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
  });

  it("exact $500 spendable posts to zero cash; cannot go negative", async () => {
    const { auth, view } = await account();
    await auth.updateOwnPrivateState(view, (cur) => ({ ...cur, cashCents: WIRE_POST_FEE_CENTS }));
    const out = await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: "exact-500",
      text: "all in",
      assetTags: ["HALC"],
      tick: TICK,
    });
    expect(out.cashCents).toBe(0);
    const led = await auth.getPlayerPrivate(view, view.account.accountId);
    expect(led.cashCents).toBe(0);
  });

  it("cap holds at the last tick of the day and resets at the first tick of the next", async () => {
    const { auth, view } = await account();
    for (let i = 0; i < 3; i++) {
      await auth.postWireStatement({
        accountId: view.account.accountId,
        handle: view.account.handle,
        idempotencyKey: `bound-${i}xx`,
        text: `post ${i}`,
        assetTags: ["HALC"],
        tick: TICK,
      });
    }
    await expect(
      auth.postWireStatement({
        accountId: view.account.accountId,
        handle: view.account.handle,
        idempotencyKey: "bound-end",
        text: "still same day",
        assetTags: ["HALC"],
        tick: DAY_END,
      }),
    ).rejects.toMatchObject({ code: "DAY_CAP" });
    const next = await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: "bound-nxt",
      text: "new day",
      assetTags: ["HALC"],
      tick: NEXT_DAY,
    });
    expect(next.remainingToday).toBe(2);
    expect(remainingPostsToday(await auth.listPublicWirePosts(), view.account.accountId, NEXT_DAY)).toBe(2);
  });

  it("persist failure on the post (after a successful register) rolls back cash+row+intent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "wire-fail2-"));
    temps.push(dir);
    const file = path.join(dir, "auth.json");
    const inner = new FileAuthStore(file);
    let saves = 0;
    const store = {
      load: () => inner.load(),
      save: async (snap: Awaited<ReturnType<FileAuthStore["load"]>>) => {
        saves += 1;
        // register is save 1; the post is save 2
        if (saves === 2) throw new Error("injected persist failure");
        return inner.save(snap);
      },
    };
    const auth = new AuthService({ store });
    const a = await auth.register({ handle: "FailPxy", password: PASS });
    await expect(
      auth.postWireStatement({
        accountId: a.view.account.accountId,
        handle: a.view.account.handle,
        idempotencyKey: "fail-key1",
        text: "will not stick",
        assetTags: ["HALC"],
        tick: TICK,
      }),
    ).rejects.toThrow(/injected persist failure/);
    expect(await auth.listPublicWirePosts()).toEqual([]);
    const led = await auth.getPlayerPrivate(a.view, a.view.account.accountId);
    expect(led.cashCents).toBe(START_CASH_CENTS);
    // a later post with the same key must be able to succeed (intent was rolled back)
    const ok = await auth.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "fail-key1",
      text: "will not stick",
      assetTags: ["HALC"],
      tick: TICK,
    });
    expect(ok.replayed).toBe(false);
    expect(ok.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
  });

  it("corrupt paid wirePosts row is quarantined: cash stays taken, public post omitted, replay does not 500 or charge again", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "wire-skip-"));
    temps.push(dir);
    const file = path.join(dir, "auth.json");
    const first = new AuthService({ store: new FileAuthStore(file) });
    const a = await first.register({ handle: "SkipPxx", password: PASS });
    const posted = await first.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "skip-key1",
      text: "paid then lost",
      assetTags: ["HALC"],
      tick: TICK,
    });
    const raw = JSON.parse(await readFile(file, "utf8")) as {
      wirePosts: Array<Record<string, unknown>>;
      wirePostIntents: unknown[];
      players: Array<{ cashCents: number; accountId: string }>;
    };
    expect(raw.wirePosts.length).toBe(1);
    raw.wirePosts[0]!.id = "w-x-not-a-valid-id"; // fails parse; must be quarantined, not skipped
    await writeFile(file, JSON.stringify(raw));
    const hashBefore = await readFile(file);
    const second = new AuthService({ store: new FileAuthStore(file) });
    await second.reload();
    const posts = await second.listPublicWirePosts();
    expect(posts).toEqual([]);
    const onDisk = JSON.parse(await readFile(file, "utf8")) as { wirePosts: unknown[] };
    expect(loadPlayerWirePosts(onDisk.wirePosts).quarantined.length).toBeGreaterThanOrEqual(1);
    const led = await second.getPlayerPrivate(a.view, a.view.account.accountId);
    expect(led.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    await expect(
      second.postWireStatement({
        accountId: a.view.account.accountId,
        handle: a.view.account.handle,
        idempotencyKey: "skip-key1",
        text: "paid then lost",
        assetTags: ["HALC"],
        tick: TICK,
      }),
    ).rejects.toMatchObject({ code: "STORED_UNREADABLE", status: 409 });
    expect(await second.listPublicWirePosts()).toEqual([]);
    expect((await second.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents).toBe(
      START_CASH_CENTS - WIRE_POST_FEE_CENTS,
    );
    expect((await readFile(file)).equals(hashBefore)).toBe(true);
    void posted;
  });

  it("corrupt post AND intent fail closed on retry: no double-charge, no 500", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "wire-dbl-"));
    temps.push(dir);
    const file = path.join(dir, "auth.json");
    const first = new AuthService({ store: new FileAuthStore(file) });
    const a = await first.register({ handle: "DblPxxx", password: PASS });
    await first.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "dbl-key-1",
      text: "paid twice risk",
      assetTags: ["HALC"],
      tick: TICK,
    });
    const raw = JSON.parse(await readFile(file, "utf8")) as {
      wirePosts: Array<Record<string, unknown>>;
      wirePostIntents: Array<Record<string, unknown>>;
      players: Array<{ cashCents: number }>;
    };
    raw.wirePosts[0]!.id = "w-x-bad";
    raw.wirePostIntents[0]!.result = "NOT_A_RESULT";
    await writeFile(file, JSON.stringify(raw));
    expect(parsePlayerWirePosts(raw.wirePosts)).toEqual([]);
    expect(parseWirePostIntents(raw.wirePostIntents)).toEqual([]);
    expect(loadPlayerWirePosts(raw.wirePosts).quarantined.length).toBe(1);
    expect(loadWirePostIntents(raw.wirePostIntents).quarantined.length).toBe(1);
    const second = new AuthService({ store: new FileAuthStore(file) });
    await second.reload();
    await expect(
      second.postWireStatement({
        accountId: a.view.account.accountId,
        handle: a.view.account.handle,
        idempotencyKey: "dbl-key-1",
        text: "paid twice risk",
        assetTags: ["HALC"],
        tick: TICK,
      }),
    ).rejects.toMatchObject({ code: "STORED_UNREADABLE", status: 409 });
    const led = await second.getPlayerPrivate(a.view, a.view.account.accountId);
    expect(led.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    expect(await second.listPublicWirePosts()).toEqual([]);
  });

  it("public item uses a public handle id and does not expose the account id", async () => {
    const { auth, view } = await account();
    const out = await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: "pub-id-01",
      text: "hello world",
      assetTags: ["HALC"],
      tick: TICK,
    });
    const item = playerPostToWireItem(out.post);
    const pub = publicHandleId(view.account.accountId);
    expect(item.slots?.authorId).toBeUndefined();
    expect(item.slots?.publicId).toBe(pub);
    expect(item.slots?.handle).toBe("PosterA");
    expect(item.entities.some((e) => e.id === `player:${pub}`)).toBe(true);
    expect(isPlayerStatementItem(item)).toBe(true);
    expect(EN.playerPost).toBe("Player");
    const publicJson = JSON.stringify(item);
    expect(publicJson).not.toContain(view.account.accountId);
    expect(publicJson).not.toMatch(/acc_/);
    expect(publicJson).not.toMatch(/cashCents|password|token/i);
    expect(pub).not.toBe(view.account.accountId);
  });

  it("PII and obfuscation: what is rejected vs what slips through", () => {
    const rejected = [
      "email me at foo@bar.com",
      "FOO@BAR.COM",
      "call +1 415 555 0100 now",
      "555.123.4567",
      "5551234567",
      "+1 (555) 123-4567",
    ];
    const slipped: string[] = [];
    const held: string[] = [];
    for (const s of rejected) {
      if (!hasPersonalData(s) && !hasPersonalData(sanitizeWireText(s))) slipped.push(`SHOULD_REJECT:${s}`);
      else held.push(s);
    }
    const formerBypasses = [
      "write me at foo [at] bar.com",
      "foo(at)bar.com",
      "foo＠bar.com", // U+FF20 fullwidth commercial at
      "foo@exam\u200bple.com", // zero-width space inside the domain
      "foo @ bar.com",
      "name at domain.com",
      "５５５１２３４５６７", // fullwidth digits
      "555－123－4567", // fullwidth hyphen
      "call me at five five five one two three four five six seven",
    ];
    const stillOpen: string[] = [];
    const nowHeld: string[] = [];
    for (const s of formerBypasses) {
      const raw = hasPersonalData(s);
      const san = hasPersonalData(sanitizeWireText(s));
      if (raw || san) nowHeld.push(s);
      else stillOpen.push(s);
    }
    expect(held.length).toBe(rejected.length);
    expect(slipped).toEqual([]);
    expect(stillOpen, stillOpen.join(" | ")).toEqual([]);
    expect(nowHeld).toEqual(formerBypasses);
    (globalThis as { __pii?: unknown }).__pii = { held, slipped, nowHeld, stillOpen };
  });

  it("XSS / bidi / zwj payload is stored as text, not stripped (except C0/C1)", () => {
    const payload = "<script>alert(1)</script> **bold** \u202eRIGHT-TO-LEFT\u202c \u200bzwsp \u200d";
    const out = sanitizeWireText(payload);
    expect(out).toContain("<script>alert(1)</script>");
    expect(out).toContain("**bold**");
    expect(out).toContain("\u202e");
    expect(out).toContain("\u200b");
  });

  it("does not touch LiveMarket marks or digest when a statement is posted (via merge only)", async () => {
    const { auth, view } = await account();
    const m = new LiveMarket({ persistStorms: false });
    const beforeMarks = Object.fromEntries(Object.entries(m.snapshot().quotes.rows).map(([id, r]) => [id, r.last]));
    const beforeWire = m.wire();
    await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: "digest-01",
      text: "no price please",
      assetTags: ["HALC"],
      tick: beforeWire.tick,
    });
    const after = m.snapshot();
    const afterMarks = Object.fromEntries(Object.entries(after.quotes.rows).map(([id, r]) => [id, r.last]));
    expect(afterMarks).toEqual(beforeMarks);
    expect(m.wire().items.map((i) => i.id)).toEqual(beforeWire.items.map((i) => i.id));
  });

  it("does not persist a rejected intent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "wire-rej-"));
    temps.push(dir);
    const file = path.join(dir, "auth.json");
    const auth = new AuthService({ store: new FileAuthStore(file) });
    const a = await auth.register({ handle: "RejPxxx", password: PASS });
    await expect(
      auth.postWireStatement({
        accountId: a.view.account.accountId,
        handle: a.view.account.handle,
        idempotencyKey: "rej-key-1",
        text: "email me at foo@bar.com",
        assetTags: ["HALC"],
        tick: TICK,
      }),
    ).rejects.toMatchObject({ code: "TEXT_FILTER" });
    const raw = JSON.parse(await readFile(file, "utf8")) as { wirePostIntents?: Array<{ result?: string }>; wirePosts?: unknown[] };
    expect(raw.wirePosts ?? []).toEqual([]);
    expect((raw.wirePostIntents ?? []).filter((i) => i.result === "REJECTED")).toEqual([]);
    expect((await auth.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents).toBe(START_CASH_CENTS);
  });

  it("POST /api/wire without Origin/Referer is 403; evil Origin is 403; cash unchanged", async () => {
    const store = new MemoryAuthStore();
    setAuthServiceForTests(new AuthService({ store }));
    try {
      const reg = await register(new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ handle: "CsrfPxx", password: PASS }),
      }));
      expect(reg.status).toBe(201);
      const cookie = (reg.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
      const body = JSON.stringify({ idempotencyKey: "csrf-key-01", text: "hello world", assetTags: ["HALC"] });
      const noOrigin = await wirePost(new Request("http://localhost/api/wire", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body,
      }));
      expect(noOrigin.status).toBe(403);
      const evil = await wirePost(new Request("http://localhost/api/wire", {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin: "https://evil.example" },
        body,
      }));
      expect(evil.status).toBe(403);
      const ok = await wirePost(new Request("http://localhost/api/wire", {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin: "http://localhost" },
        body,
      }));
      expect(ok.status).toBe(201);
      const paid = (await ok.json()) as { cashCents: number };
      expect(paid.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    } finally {
      setAuthServiceForTests(undefined);
    }
  });

  it("POST /api/wire rejects a body over the raw byte cap without charging", async () => {
    const store = new MemoryAuthStore();
    setAuthServiceForTests(new AuthService({ store }));
    try {
      const reg = await register(new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ handle: "HugePxx", password: PASS }),
      }));
      const cookie = (reg.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
      const huge = "x".repeat(WIRE_POST_MAX_BODY_BYTES + 50);
      const res = await wirePost(new Request("http://localhost/api/wire", {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin: "http://localhost" },
        body: JSON.stringify({ idempotencyKey: "huge-key-01", text: huge, assetTags: ["HALC"] }),
      }));
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("BODY_TOO_LARGE");
      const svc = new AuthService({ store });
      const login = await svc.login({ handle: "HugePxx", password: PASS });
      expect((await svc.getPlayerPrivate(login.view, login.view.account.accountId)).cashCents).toBe(START_CASH_CENTS);
    } finally {
      setAuthServiceForTests(undefined);
    }
  });

  it("signed-in GET /api/wire reports server remainingToday after a refresh", async () => {
    const store = new MemoryAuthStore();
    const auth = new AuthService({ store });
    setAuthServiceForTests(auth);
    try {
      const reg = await register(new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ handle: "LeftPxx", password: PASS }),
      }));
      const cookie = (reg.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
      for (const n of [1, 2]) {
        const res = await wirePost(new Request("http://localhost/api/wire", {
          method: "POST",
          headers: { "content-type": "application/json", cookie, origin: "http://localhost" },
          body: JSON.stringify({ idempotencyKey: `left-key-0${n}`, text: `note number ${n}`, assetTags: ["HALC"] }),
        }));
        expect(res.status).toBe(201);
      }
      const fresh = await wireGet(new Request("http://localhost/api/wire", { headers: { cookie, accept: "application/json" } }));
      expect(fresh.status).toBe(200);
      const body = (await fresh.json()) as { remainingToday?: number; items: { slots?: Record<string, string> }[] };
      expect(body.remainingToday).toBe(1);
      const mine = body.items.filter((i) => i.slots?.player === "1");
      expect(mine.length).toBe(2);
      expect(JSON.stringify(mine)).not.toMatch(/acc_/);
    } finally {
      setAuthServiceForTests(undefined);
    }
  });

});
