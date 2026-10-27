// QA #34 follow-up (mutant K3): a mid-path node that is not a plain object or array must throw DeltaError, and
// set must never create a container. Deleting the "not a container" check in delta.ts makes these fail.
import { describe, expect, it } from "vitest";
import { applyOps, DeltaError } from "@/shell/contracts/delta";

const set = (body: unknown, path: string) => () => applyOps(body as never, [{ op: "set", path, v: 2 } as never]);
const SCALARS: [string, unknown][] = [["number", 1], ["zero", 0], ["string", "s"], ["empty string", ""], ["true", true], ["false", false], ["null", null]];

describe("delta: mid-path must be a container", () => {
  it.each(SCALARS)("set /a/b/c with b = %s throws DeltaError and leaves the body untouched", (_n, b) => {
    const body = { a: { b } };
    expect(set(body, "/a/b/c")).toThrow(DeltaError);
    expect(body).toEqual({ a: { b } });
  });
  it.each(SCALARS)("set /a/0/c through an array element = %s throws DeltaError", (_n, el) => {
    expect(set({ a: [el] }, "/a/0/c")).toThrow(DeltaError);
  });
  it.each(SCALARS)("set /b/c with a top-level scalar b = %s throws DeltaError", (_n, b) => {
    expect(set({ b }, "/b/c")).toThrow(DeltaError);
  });
  it("set never creates containers for a missing mid-path key", () => {
    expect(set({ a: {} }, "/a/b/c")).toThrow(DeltaError);
    expect(set({}, "/x/y")).toThrow(DeltaError);
  });
  it("still sets through real containers (object and array)", () => {
    expect(applyOps({ a: { b: { c: 1 } } } as never, [{ op: "set", path: "/a/b/c", v: 2 } as never])).toEqual({ a: { b: { c: 2 } } });
    expect(applyOps({ a: [{ c: 1 }] } as never, [{ op: "set", path: "/a/0/c", v: 2 } as never])).toEqual({ a: [{ c: 2 }] });
  });
});
