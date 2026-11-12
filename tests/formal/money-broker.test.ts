// Formal money check for the server Broker door (src/server/broker).
// Tool: fast-check on decidePlace, sweepLedger, and sweepListed — the functions the BrokerService
// commits inside AuthService's lock. fast-check is the cheap fit: the bugs live in the TypeScript
// cent rounding and the idempotency journal, and no verifier runs on this language. A TLA+ model
// would not execute bookFill.
//
// Catalog names (HALC) trade against an untracked NPC. The identity is
//   cash' = cash − signedNotional − fee
// with fee = exchangeFeeMinor(notional, taker) once. The notional is the price of the shares.
// Listed coins (the book in src/server/broker/book.ts) are a closed system: player cash + book cash
// is unchanged (the fee stays in the book) and player qty + book tokens is unchanged.
// The same idempotency key, including after parsePlayerPrivateRow (the restart load), is one journal
// row, the same fills, and the same cash.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { ASSET_BY_ID, ASSETS, WATCHLISTS } from "@/market/catalog";
import { centsOf } from "@/market/valuation";
import { parseMinor } from "@/market/quoteSnapshot";
import { appendAsset, listedDef, resetListingsForTests } from "@/market/listings";
import { AuthError, type AccountId, type PlayerPrivateRecord } from "@/server/auth/types";
import { feeOf, fillOnBook, type BookAccount } from "@/server/broker/book";
import {
  decidePlace,
  sweepLedger,
  sweepListed,
  type IdSource,
  type ServerQuote,
} from "@/server/broker/execution";
import { buildPlayerPrivate, parsePlayerPrivateRow, type PlayerPrivateInput } from "@/server/player/privateState";
import type { MyFill, OrderDraft } from "@/shell/contracts/channels";
import { exchangeFeeMinor, FEE_BP, fmt } from "@/shell/contracts/mockFeed";

const ACCOUNT = "acc_fmny0001" as AccountId;
const OTHER = "acc_fmny0002" as AccountId;
const COIN = "FMNY";
const MARK = 100_000_000; // $1.00 at the listed coin's 8 decimal places

/** True when `after` is `before` moved by exactly one notional and one fee. */
export function chargedOnce(before: number, after: number, side: "BUY" | "SELL", notional: number, fee: number): boolean {
  const sign = side === "BUY" ? 1 : -1;
  return after === before - sign * notional - fee;
}

function makeIds(): IdSource & { readonly calls: string[] } {
  const calls: string[] = [];
  let n = 0;
  return {
    calls,
    next(kind: "o" | "x" | "i") {
      calls.push(kind);
      n += 1;
      return `${kind}${n}`;
    },
  };
}

function empty(accountId: AccountId, cashCents: number): PlayerPrivateRecord {
  return buildPlayerPrivate(accountId, { cashCents, positions: {}, openOrders: {} });
}

/** The on-disk load (parsePlayerPrivateRow). `dropRing` keeps the journal and drops the last-50 receipts. */
function restart(accountId: AccountId, rec: PlayerPrivateRecord, dropRing: boolean): PlayerPrivateRecord {
  const raw = structuredClone(rec) as unknown as Record<string, unknown>;
  if (dropRing) delete raw.intents;
  const parsed = parsePlayerPrivateRow(raw);
  if (!parsed.ok) throw new Error(parsed.reason);
  if (parsed.record.accountId !== accountId) throw new Error("restart changed account");
  return parsed.record;
}

function newFills(before: PlayerPrivateRecord, after: PlayerPrivateRecord): MyFill[] {
  const had = new Set((before.fills ?? []).map((f) => f.fillId));
  return (after.fills ?? []).filter((f) => !had.has(f.fillId));
}

function qtyOf(rec: PlayerPrivateRecord, assetId: string): number {
  return Number(rec.positions[assetId]?.qty ?? 0);
}

/**
 * Cash and qty after `after` are explained by each new fill exactly once.
 * Returns a counterexample sentence, or null when the identity holds.
 */
function fillGap(before: PlayerPrivateRecord, after: PlayerPrivateRecord): string | null {
  const fills = newFills(before, after);
  let cash = before.cashCents;
  const qty = new Map<string, number>();
  for (const [asset, p] of Object.entries(before.positions)) qty.set(asset, Number(p.qty));
  for (const f of fills) {
    const a = ASSET_BY_ID[f.assetId];
    if (!a) return `fill ${f.fillId} names an asset the catalog does not have`;
    const q = Number(f.qty);
    const px = parseMinor(f.price, a.displayDecimals);
    if (px === null || !Number.isSafeInteger(px * q)) return `fill ${f.fillId} price is not a safe minor notional`;
    const notional = centsOf(a.displayDecimals, px * q, f.side === "BUY");
    const fee = exchangeFeeMinor(notional, FEE_BP.taker);
    if (feeOf(notional) !== fee) return `feeOf(${notional}) is not the taker fee`;
    if (f.fee !== fmt(fee, 2)) return `fill ${f.fillId} fee ${f.fee} is not ${fmt(fee, 2)} charged once`;
    cash = f.side === "BUY" ? cash - notional - fee : cash + notional - fee;
    qty.set(f.assetId, (qty.get(f.assetId) ?? 0) + (f.side === "BUY" ? q : -q));
  }
  if (after.cashCents !== cash) return `cash ${before.cashCents} -> ${after.cashCents}, fills explain ${cash}`;
  for (const [asset, q] of qty) {
    if (qtyOf(after, asset) !== q) return `${asset} qty ${qtyOf(after, asset)} != ${q}`;
  }
  for (const asset of Object.keys(after.positions)) {
    if (!qty.has(asset)) return `${asset} appeared without a fill`;
  }
  const seen = new Set<string>();
  for (const row of after.idempotency ?? []) {
    if (seen.has(row.key)) return `idempotency key ${row.key} is in the journal twice`;
    seen.add(row.key);
  }
  return null;
}

function closedGap(beforeCash: number, afterCash: number, beforeQty: number, afterQty: number, beforeBook: BookAccount, afterBook: BookAccount): string | null {
  const cashLeak = (afterCash - beforeCash) + (afterBook.cash - beforeBook.cash);
  if (cashLeak !== 0) return `player cash + book cash changed by ${cashLeak}`;
  const supplyLeak = (afterQty - beforeQty) + (afterBook.tokens - beforeBook.tokens);
  if (supplyLeak !== 0) return `player qty + book tokens changed by ${supplyLeak}`;
  return null;
}

function quote(tick: number, assetId: string, mark: number): ServerQuote {
  return { tick, last: (id) => (id === assetId ? mark : null), tradable: (id) => id === assetId };
}

function commit(accountId: AccountId, input: PlayerPrivateInput): PlayerPrivateRecord {
  return buildPlayerPrivate(accountId, input);
}

describe("formal money: Broker order, fill, fee", () => {
  beforeAll(() => {
    resetListingsForTests();
    const ok = appendAsset(listedDef(COIN, "Formal Coin", MARK), { ASSETS, ASSET_BY_ID, WATCHLISTS });
    expect(ok).toBe(true);
  });
  afterAll(() => { resetListingsForTests(); });

  it("rejects a cash figure that took the fee twice (the check can fail)", () => {
    const notional = 5_000;
    const fee = exchangeFeeMinor(notional, FEE_BP.taker);
    const before = 10_000;
    const once = before - notional - fee;
    const twice = before - notional - 2 * fee;
    expect(chargedOnce(before, once, "BUY", notional, fee)).toBe(true);
    expect(chargedOnce(before, twice, "BUY", notional, fee)).toBe(false);
    expect(closedGap(before, twice, 0, 1, { cash: 0, tokens: 10 }, { cash: notional + fee, tokens: 9 })).toMatch(/changed by/);
  });

  it("catalog orders: one fee per fill, qty matches the fills, and a key replays once after restart", () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        op: fc.constantFrom("buy" as const, "sell" as const, "rest" as const, "replay" as const, "restart" as const, "sweep" as const, "conflict" as const),
        qty: fc.integer({ min: 1, max: 8 }),
      }), { minLength: 1, maxLength: 10 }),
      (steps) => {
        let rec = empty(ACCOUNT, 5_000_000);
        let mark = 5_000;
        let tick = 1;
        let n = 0;
        let last: { key: string; draft: OrderDraft } | null = null;
        const ids = makeIds();
        const halc = () => quote(tick, "HALC", mark);
        const place = (key: string, draft: OrderDraft, conflict = false) => {
          const calls = ids.calls.length;
          if (conflict) {
            expect(() => decidePlace(rec, key, draft, halc(), ids)).toThrow(AuthError);
            expect(ids.calls.length).toBe(calls);
            return;
          }
          const before = rec;
          const decision = decidePlace(before, key, draft, halc(), ids);
          const next = commit(ACCOUNT, decision.next);
          expect(fillGap(before, next)).toBeNull();
          if (decision.replayed) {
            expect(ids.calls.length).toBe(calls);
            expect(next.cashCents).toBe(before.cashCents);
            expect(next.fills ?? []).toEqual(before.fills ?? []);
            expect(next.openOrders).toEqual(before.openOrders);
            expect(decision.book).toBeUndefined();
          } else if (decision.result.status === "ACCEPTED") {
            const named = (decision.result.effects ?? []).filter((e) => e.startsWith("fill:")).map((e) => e.slice(5));
            expect(named).toEqual(newFills(before, next).map((f) => f.fillId));
          } else {
            expect(newFills(before, next)).toEqual([]);
            expect(next.cashCents).toBe(before.cashCents);
          }
          const rows = (next.idempotency ?? []).filter((row) => row.key === key);
          expect(rows).toHaveLength(1);
          rec = next;
          tick += 1;
        };
        for (const step of steps) {
          const key = `idem${(n += 1).toString().padStart(8, "0")}`;
          switch (step.op) {
            case "buy": {
              const draft: OrderDraft = { assetId: "HALC", side: "BUY", type: "market", qty: String(step.qty), tif: "day" };
              place(key, draft);
              last = { key, draft };
              break;
            }
            case "sell": {
              const draft: OrderDraft = { assetId: "HALC", side: "SELL", type: "market", qty: String(step.qty), tif: "day" };
              place(key, draft);
              last = { key, draft };
              break;
            }
            case "rest": {
              const limit = mark - 250;
              if (limit <= 0) break;
              const draft: OrderDraft = { assetId: "HALC", side: "BUY", type: "limit", qty: String(step.qty), limit: fmt(limit, 2), tif: "day" };
              place(key, draft);
              last = { key, draft };
              break;
            }
            case "replay":
            case "restart": {
              if (!last) break;
              if (step.op === "restart") rec = restart(ACCOUNT, rec, n % 2 === 0);
              place(last.key, last.draft);
              break;
            }
            case "sweep": {
              mark = 100;
              tick += 1;
              const before = rec;
              const swept = sweepLedger(before, halc(), ids);
              if (!swept) break;
              const next = commit(ACCOUNT, swept);
              expect(fillGap(before, next)).toBeNull();
              const filled = new Set(newFills(before, next).map((f) => f.orderId));
              rec = next;
              // A second sweep at the same mark may fill a different resting order. It must not fill one it just filled.
              const twice = sweepLedger(rec, halc(), ids);
              if (!twice) break;
              const after = commit(ACCOUNT, twice);
              expect(fillGap(rec, after)).toBeNull();
              for (const f of newFills(rec, after)) expect(filled.has(f.orderId)).toBe(false);
              rec = after;
              break;
            }
            case "conflict": {
              if (!last) break;
              const draft: OrderDraft = { ...last.draft, qty: String(step.qty + 9) };
              place(last.key, draft, true);
              place(last.key, last.draft);
              break;
            }
            default: {
              const never: never = step.op;
              throw new Error(never);
            }
          }
        }
      },
    ), { numRuns: 50, seed: 20261112 });
  });

  it("the same key past the last-50 receipt ring is still one fill after a restart", () => {
    let rec = empty(ACCOUNT, 2_000_000);
    const ids = makeIds();
    const drafts: { key: string; draft: OrderDraft }[] = [];
    for (let i = 1; i <= 51; i++) {
      const draft: OrderDraft = { assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" };
      const key = `ringkey${i.toString().padStart(4, "0")}`;
      const before = rec;
      const decision = decidePlace(before, key, draft, quote(i, "HALC", 1_000), ids);
      expect(decision.replayed).toBe(false);
      rec = commit(ACCOUNT, decision.next);
      expect(fillGap(before, rec)).toBeNull();
      drafts.push({ key, draft });
    }
    expect(rec.intents).toHaveLength(50);
    expect(rec.idempotency).toHaveLength(51);
    expect(rec.fills).toHaveLength(50);
    const cash = rec.cashCents;
    const loaded = restart(ACCOUNT, rec, true);
    expect(loaded.intents).toBeUndefined();
    expect(loaded.idempotency).toHaveLength(51);
    const calls = ids.calls.length;
    const first = drafts[0]!;
    const replay = decidePlace(loaded, first.key, first.draft, quote(99, "HALC", 1_000), ids);
    expect(replay.replayed).toBe(true);
    expect(replay.result).toEqual(loaded.idempotency?.find((row) => row.key === first.key)?.result);
    expect(commit(ACCOUNT, replay.next).cashCents).toBe(cash);
    expect(ids.calls.length).toBe(calls);
    expect(newFills(loaded, commit(ACCOUNT, replay.next))).toEqual([]);
  });

  it("listed fills keep player cash + book cash and player qty + book tokens; a replay does not fill again", () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        side: fc.constantFrom("BUY" as const, "SELL" as const),
        qty: fc.integer({ min: 1, max: 400 }),
        restart: fc.boolean(),
      }), { minLength: 1, maxLength: 8 }),
      (steps) => {
        let rec = empty(ACCOUNT, 50_000_000);
        let book: BookAccount = { cash: 1e15, tokens: 50_000_000 };
        const openedCash = rec.cashCents + book.cash;
        const openedTokens = book.tokens;
        const ids = makeIds();
        let n = 0;
        let tick = 10;
        for (const step of steps) {
          const key = `bookkey${(n += 1).toString().padStart(4, "0")}`;
          const draft: OrderDraft = { assetId: COIN, side: step.side, type: "market", qty: String(step.qty), tif: "day" };
          const before = rec;
          const beforeBook = book;
          const decision = decidePlace(before, key, draft, quote(tick, COIN, MARK), ids, beforeBook);
          const next = commit(ACCOUNT, decision.next);
          const afterBook = decision.book ?? beforeBook;
          expect(fillGap(before, next)).toBeNull();
          expect(closedGap(before.cashCents, next.cashCents, qtyOf(before, COIN), qtyOf(next, COIN), beforeBook, afterBook)).toBeNull();
          expect(decision.replayed).toBe(false);
          rec = step.restart ? restart(ACCOUNT, next, true) : next;
          book = afterBook;
          tick += 1;
          const calls = ids.calls.length;
          const replay = decidePlace(rec, key, draft, quote(tick, COIN, MARK), ids, book);
          expect(replay.replayed).toBe(true);
          expect(replay.book).toBeUndefined();
          expect(commit(ACCOUNT, replay.next).cashCents).toBe(rec.cashCents);
          expect(ids.calls.length).toBe(calls);
          expect(newFills(rec, commit(ACCOUNT, replay.next))).toEqual([]);
        }
        expect(rec.cashCents + book.cash).toBe(openedCash);
        expect(qtyOf(rec, COIN) + book.tokens).toBe(openedTokens);
      },
    ), { numRuns: 40, seed: 20261112 });
  });

  it("a resting listed limit does not move cash until the sweep, and the sweep charges the fee once", () => {
    const ids = makeIds();
    let rec = empty(ACCOUNT, 50_000_000);
    const book: BookAccount = { cash: 1e15, tokens: 50_000_000 };
    const limit = fmt(MARK, 8); // at the mark: the ladder price is above it, so the buy rests
    const draft: OrderDraft = { assetId: COIN, side: "BUY", type: "limit", qty: "1000", limit, tif: "day" };
    const opened = decidePlace(rec, "restkey001", draft, quote(1, COIN, MARK), ids, book);
    expect(opened.result.status).toBe("ACCEPTED");
    expect(opened.book).toBeUndefined();
    rec = commit(ACCOUNT, opened.next);
    expect(rec.cashCents).toBe(50_000_000);
    expect(qtyOf(rec, COIN)).toBe(0);
    expect(Object.keys(rec.openOrders)).toHaveLength(1);
    const probe = fillOnBook(ASSET_BY_ID[COIN]!, "BUY", 1000, Math.floor(MARK / 5), book, 2, MARK);
    expect(probe).not.toBeNull();
    const swept = sweepListed(new Map([[ACCOUNT, rec]]), new Map([[COIN, book]]), quote(2, COIN, Math.floor(MARK / 5)), ids);
    expect(swept.ledgers.size).toBe(1);
    const next = commit(ACCOUNT, swept.ledgers.get(ACCOUNT)!);
    const nextBook = swept.books.get(COIN)!;
    expect(fillGap(rec, next)).toBeNull();
    expect(closedGap(rec.cashCents, next.cashCents, 0, qtyOf(next, COIN), book, nextBook)).toBeNull();
    expect(newFills(rec, next).length).toBeGreaterThan(0);
    const again = sweepListed(new Map([[ACCOUNT, next]]), new Map([[COIN, nextBook]]), quote(3, COIN, Math.floor(MARK / 5)), ids);
    if (again.ledgers.size > 0) {
      const more = commit(ACCOUNT, again.ledgers.get(ACCOUNT)!);
      const moreBook = again.books.get(COIN) ?? nextBook;
      expect(fillGap(next, more)).toBeNull();
      expect(closedGap(next.cashCents, more.cashCents, qtyOf(next, COIN), qtyOf(more, COIN), nextBook, moreBook)).toBeNull();
      const seen = new Set((next.fills ?? []).map((f) => f.fillId));
      for (const f of newFills(next, more)) expect(seen.has(f.fillId)).toBe(false);
    }
    const settled = again.ledgers.get(ACCOUNT) ? commit(ACCOUNT, again.ledgers.get(ACCOUNT)!) : next;
    const settledBook = again.books.get(COIN) ?? nextBook;
    const calls = ids.calls.length;
    const replay = decidePlace(restart(ACCOUNT, settled, true), "restkey001", draft, quote(4, COIN, MARK), ids, settledBook);
    expect(replay.replayed).toBe(true);
    expect(ids.calls.length).toBe(calls);
    expect(commit(ACCOUNT, replay.next).cashCents).toBe(settled.cashCents);
  });

  it("two players and one book conserve cash and tokens across both sides", () => {
    const ids = makeIds();
    let a = empty(ACCOUNT, 20_000_000);
    let b = empty(OTHER, 20_000_000);
    let book: BookAccount = { cash: 1e12, tokens: 10_000_000 };
    const openedCash = a.cashCents + b.cashCents + book.cash;
    const openedTokens = book.tokens;
    const trade = (who: "a" | "b", side: "BUY" | "SELL", qty: number, key: string) => {
      const rec = who === "a" ? a : b;
      const accountId = who === "a" ? ACCOUNT : OTHER;
      const beforeBook = book;
      const decision = decidePlace(rec, key, { assetId: COIN, side, type: "market", qty: String(qty), tif: "day" }, quote(1, COIN, MARK), ids, book);
      expect(decision.result.status).toBe("ACCEPTED");
      const next = commit(accountId, decision.next);
      expect(fillGap(rec, next)).toBeNull();
      expect(closedGap(rec.cashCents, next.cashCents, qtyOf(rec, COIN), qtyOf(next, COIN), beforeBook, decision.book ?? beforeBook)).toBeNull();
      if (who === "a") a = next; else b = next;
      if (decision.book) book = decision.book;
      const loaded = restart(accountId, next, true);
      const replay = decidePlace(loaded, key, { assetId: COIN, side, type: "market", qty: String(qty), tif: "day" }, quote(2, COIN, MARK), ids, book);
      expect(replay.replayed).toBe(true);
      expect(commit(accountId, replay.next).cashCents).toBe(next.cashCents);
    };
    trade("a", "BUY", 2_000, "twokey0001");
    trade("b", "BUY", 1_500, "twokey0002");
    trade("a", "SELL", 700, "twokey0003");
    trade("b", "SELL", 400, "twokey0004");
    expect(a.cashCents + b.cashCents + book.cash).toBe(openedCash);
    expect(qtyOf(a, COIN) + qtyOf(b, COIN) + book.tokens).toBe(openedTokens);
  });
});
