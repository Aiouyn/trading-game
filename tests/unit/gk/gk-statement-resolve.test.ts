import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthService, FileAuthStore, MemoryAuthStore, START_CASH_CENTS } from "@/server/auth";
import { LiveMarket } from "@/server/market/clock";
import { EN, FR } from "@/apps/wire/strings";
import { isPlayerStatementItem } from "@/apps/wire/WireItemRow";
import {
  WIRE_POST_FEE_CENTS,
  mergePlayerStatements,
  playerPostToWireItem,
  publicHandleId,
  loadPlayerWirePosts,
} from "@/server/wire/playerStatements";
import {
  STATEMENT_RESOLVE_TICKS,
  classifyStatementClaim,
  resolvePlayerWirePost,
  statementDueTick,
  trackRecordByPublicId,
} from "@/server/wire/statementResolve";

const TICK = 27_700;
const DUE = statementDueTick(TICK);
const PASS = "password1";

async function account(store = new MemoryAuthStore(), handle = "PosterA") {
  const auth = new AuthService({ store });
  const a = await auth.register({ handle, password: PASS });
  return { auth, store, ...a };
}

describe("statement claim lexicon", () => {
  it("classifies the closed UP/DOWN lists and treats mixed or empty as opinion", () => {
    expect(classifyStatementClaim("HALC will rise")).toBe("UP");
    expect(classifyStatementClaim("Bullish on HALC")).toBe("UP");
    expect(classifyStatementClaim("ça va monter")).toBe("UP");
    expect(classifyStatementClaim("HALC will fall")).toBe("DOWN");
    expect(classifyStatementClaim("Bearish, I would sell")).toBe("DOWN");
    expect(classifyStatementClaim("ça va chuter")).toBe("DOWN");
    expect(classifyStatementClaim("hello world")).toBeNull();
    expect(classifyStatementClaim("it may rise or fall")).toBeNull();
    expect(classifyStatementClaim("update the book")).toBeNull();
    // Negation is OPINION (no direction flip).
    expect(classifyStatementClaim("HALC will not rise")).toBeNull();
    expect(classifyStatementClaim("won't go up")).toBeNull();
    expect(classifyStatementClaim("wont go up")).toBeNull();
    expect(classifyStatementClaim("HALC will never fall")).toBeNull();
    expect(classifyStatementClaim("no gain")).toBeNull();
    expect(classifyStatementClaim("HALC doesn't rise")).toBeNull();
    expect(classifyStatementClaim("HALC isn’t falling")).toBeNull(); // typographic apostrophe
    expect(classifyStatementClaim("HALC ne va pas monter")).toBeNull();
    expect(classifyStatementClaim("jamais de hausse")).toBeNull();
    expect(classifyStatementClaim("pas de baisse")).toBeNull();
    expect(classifyStatementClaim("nothing will rise")).toBeNull();
    expect(classifyStatementClaim("none will fall")).toBeNull();
    expect(classifyStatementClaim("nobody is bullish")).toBeNull();
    expect(classifyStatementClaim("neither name will rise")).toBeNull();
    expect(classifyStatementClaim("HALC will rise nor fall")).toBeNull();
    expect(classifyStatementClaim("rien ne montera")).toBeNull();
    expect(classifyStatementClaim("aucun gain")).toBeNull();
    expect(classifyStatementClaim("personne n'est haussier")).toBeNull();
  });

  it("a posted negated claim is OPINION immediately even when marks exist", async () => {
    const { auth, view } = await account(new MemoryAuthStore(), "NegPost");
    const out = await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: "neg-01",
      text: "HALC will not rise",
      assetTags: ["HALC"],
      tick: TICK,
      marks: { HALC: "100" },
    });
    expect(out.post.verdict).toBe("OPINION");
    expect(out.post.claimDir).toBeUndefined();
  });
});

describe("5-game-day TRUE/FALSE/OPINION resolve", () => {
  const temps: string[] = [];
  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("assigns OPINION immediately for a non-checkable body; cash and quotes stay put", async () => {
    const { auth, view } = await account();
    const market = new LiveMarket({ persistStorms: false });
    const beforeMarks = Object.fromEntries(Object.entries(market.snapshot().quotes.rows).map(([id, r]) => [id, r.last]));
    const beforeCash = START_CASH_CENTS;
    const out = await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: "op-01",
      text: "hello world",
      assetTags: ["HALC"],
      tick: TICK,
      marks: { HALC: "100" },
    });
    expect(out.post.verdict).toBe("OPINION");
    expect(out.post.resolvedTick).toBe(TICK);
    const item = playerPostToWireItem(out.post);
    expect(item.slots?.verdict).toBe("opinion");
    expect(item.slots?.authorId).toBeUndefined();
    expect(JSON.stringify(item)).not.toMatch(/acc_/);
    const led = await auth.getPlayerPrivate(view, view.account.accountId);
    expect(led.cashCents).toBe(beforeCash - WIRE_POST_FEE_CENTS);
    const afterMarks = Object.fromEntries(Object.entries(market.snapshot().quotes.rows).map(([id, r]) => [id, r.last]));
    expect(afterMarks).toEqual(beforeMarks);
    const n = await auth.resolveDueWireStatements({ tick: DUE, marks: { HALC: "200" } });
    expect(n).toBe(0);
    expect((await auth.listPublicWirePosts())[0]!.verdict).toBe("OPINION");
    expect((await auth.getPlayerPrivate(view, view.account.accountId)).cashCents).toBe(led.cashCents);
    expect(Object.fromEntries(Object.entries(market.snapshot().quotes.rows).map(([id, r]) => [id, r.last]))).toEqual(beforeMarks);
  });

  it("stays unresolved at dueTick-1 and becomes TRUE or FALSE at dueTick, then freezes", async () => {
    const { auth, view } = await account();
    const up = await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: "up-01",
      text: "HALC will rise",
      assetTags: ["HALC"],
      tick: TICK,
      marks: { HALC: "100" },
    });
    expect(up.post.verdict).toBe("UNRESOLVED");
    expect(up.post.claimDir).toBe("UP");
    expect(up.post.marksAtPost).toEqual({ HALC: "100" });

    const early = await auth.resolveDueWireStatements({ tick: DUE - 1, marks: { HALC: "150" } });
    expect(early).toBe(0);
    expect((await auth.listPublicWirePosts())[0]!.verdict).toBe("UNRESOLVED");

    const cashBefore = (await auth.getPlayerPrivate(view, view.account.accountId)).cashCents;
    const due = await auth.resolveDueWireStatements({ tick: DUE, marks: { HALC: "150" } });
    expect(due).toBe(1);
    const truePost = (await auth.listPublicWirePosts())[0]!;
    expect(truePost.verdict).toBe("TRUE");
    expect(truePost.resolvedTick).toBe(DUE);
    expect((await auth.getPlayerPrivate(view, view.account.accountId)).cashCents).toBe(cashBefore);

    const again = await auth.resolveDueWireStatements({ tick: DUE + 10, marks: { HALC: "10" } });
    expect(again).toBe(0);
    expect((await auth.listPublicWirePosts())[0]!.verdict).toBe("TRUE");

    const { auth: authB, view: viewB } = await account(new MemoryAuthStore(), "PosterB");
    await authB.postWireStatement({
      accountId: viewB.account.accountId,
      handle: viewB.account.handle,
      idempotencyKey: "dn-01",
      text: "HALC will rise",
      assetTags: ["HALC"],
      tick: TICK,
      marks: { HALC: "100" },
    });
    await authB.resolveDueWireStatements({ tick: DUE, marks: { HALC: "100" } });
    expect((await authB.listPublicWirePosts())[0]!.verdict).toBe("FALSE");
    await authB.resolveDueWireStatements({ tick: DUE + 1, marks: { HALC: "200" } });
    expect((await authB.listPublicWirePosts())[0]!.verdict).toBe("FALSE");
  });

  it("pure resolve matches the service window and direction rules", () => {
    const base = {
      id: "w-p-aaaaaaaaaaaaaaaa",
      accountId: "acc_x",
      handle: "X",
      text: "HALC will fall",
      assetTags: ["HALC"] as const,
      tick: TICK,
      verdict: "UNRESOLVED" as const,
      claimDir: "DOWN" as const,
      marksAtPost: { HALC: "100" },
    };
    expect(resolvePlayerWirePost(base, DUE - 1, { HALC: "80" }).verdict).toBe("UNRESOLVED");
    expect(resolvePlayerWirePost(base, DUE, { HALC: "80" }).verdict).toBe("TRUE");
    expect(resolvePlayerWirePost(base, DUE, { HALC: "100" }).verdict).toBe("FALSE");
    expect(resolvePlayerWirePost(base, DUE, { HALC: "120" }).verdict).toBe("FALSE");
    expect(STATEMENT_RESOLVE_TICKS).toBe(3600);
  });

  it("persists the verdict across FileAuthStore restart and does not charge again", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "stmt-res-"));
    temps.push(dir);
    const file = path.join(dir, "auth.json");
    const first = new AuthService({ store: new FileAuthStore(file) });
    const a = await first.register({ handle: "PosterF", password: PASS });
    await first.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "file-01",
      text: "HALC will rise",
      assetTags: ["HALC"],
      tick: TICK,
      marks: { HALC: "100" },
    });
    await first.resolveDueWireStatements({ tick: DUE, marks: { HALC: "110" } });
    const onDisk = JSON.parse(await readFile(file, "utf8")) as { wirePosts: unknown };
    expect(loadPlayerWirePosts(onDisk.wirePosts).posts[0]!.verdict).toBe("TRUE");

    const second = new AuthService({ store: new FileAuthStore(file) });
    await second.reload();
    const posts = await second.listPublicWirePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.verdict).toBe("TRUE");
    expect(posts[0]!.marksAtPost).toEqual({ HALC: "100" });
    const led = await second.getPlayerPrivate(a.view, a.view.account.accountId);
    expect(led.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    const n = await second.resolveDueWireStatements({ tick: DUE + 50, marks: { HALC: "1" } });
    expect(n).toBe(0);
    expect((await second.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents).toBe(led.cashCents);
    expect((await second.listPublicWirePosts())[0]!.verdict).toBe("TRUE");
  });

  it("public track record is keyed by public handle, never the account id, and is isolated per poster", async () => {
    const store = new MemoryAuthStore();
    const a = await account(store, "PosterA");
    const b = await a.auth.register({ handle: "PosterB", password: PASS });
    await a.auth.postWireStatement({
      accountId: a.view.account.accountId, handle: a.view.account.handle,
      idempotencyKey: "a-1", text: "HALC will rise", assetTags: ["HALC"], tick: TICK, marks: { HALC: "100" },
    });
    await a.auth.postWireStatement({
      accountId: a.view.account.accountId, handle: a.view.account.handle,
      idempotencyKey: "a-2", text: "HALC will rise", assetTags: ["HALC"], tick: TICK, marks: { HALC: "200" },
    });
    await a.auth.postWireStatement({
      accountId: b.view.account.accountId, handle: b.view.account.handle,
      idempotencyKey: "b-1", text: "hello world", assetTags: ["HALC"], tick: TICK, marks: { HALC: "100" },
    });
    // a-1 UP from 100 → 150 TRUE; a-2 UP from 200 → 150 FALSE; b OPINION
    await a.auth.resolveDueWireStatements({ tick: DUE, marks: { HALC: "150" } });
    const posts = await a.auth.listPublicWirePosts();
    const recs = trackRecordByPublicId(posts);
    const aId = publicHandleId(a.view.account.accountId);
    const bId = publicHandleId(b.view.account.accountId);
    expect(recs.get(aId)).toEqual({ hits: 1, resolved: 2 });
    expect(recs.get(bId)).toBeUndefined();
    const items = mergePlayerStatements([], posts);
    const aItems = items.filter((i) => i.slots?.publicId === aId);
    expect(aItems).toHaveLength(2);
    expect(aItems.every((i) => i.sourceRecord?.hits === 1 && i.sourceRecord?.resolved === 2)).toBe(true);
    expect(items.find((i) => i.slots?.publicId === bId)?.sourceRecord).toBeUndefined();
    expect(JSON.stringify(items)).not.toMatch(/acc_/);
    expect(JSON.stringify(items)).not.toContain(a.view.account.accountId);
    expect(isPlayerStatementItem(aItems[0]!)).toBe(true);
    expect(EN.verdict.true).toBe("True");
    expect(FR.verdict.true).toBe("Vrai");
    expect(EN.verdict.unresolved).toBe("Open");
    expect(FR.verdict.unresolved).toBe("En cours");
    const bLed = await a.auth.getPlayerPrivate(b.view, b.view.account.accountId);
    expect(bLed.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    await expect(a.auth.getPlayerPrivate(b.view, a.view.account.accountId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a legacy row without a snapshot becomes OPINION, not a guessed FALSE", () => {
    const legacy = {
      id: "w-p-bbbbbbbbbbbbbbbb",
      accountId: "acc_y",
      handle: "Y",
      text: "HALC will rise",
      assetTags: ["HALC"] as const,
      tick: TICK,
    };
    const out = resolvePlayerWirePost(legacy, DUE, { HALC: "80" });
    expect(out.verdict).toBe("OPINION");
  });
});
