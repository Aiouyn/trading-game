// AC-HOOKS-PROD matcher (tools/check-hooks.mjs): what a no-flag production bundle may and may not contain.
import { describe, expect, it } from "vitest";
import { scan, QUERY_KEYS, HOOK_STRINGS, DS_STRINGS } from "../../../tools/check-hooks.mjs";

type Hit = { hook: string; index: number };
const hooks = (text: string) => (scan(text) as Hit[]).map((h) => h.hook);

describe("check-hooks matcher", () => {
  it("does not flag the prefs store read (prefsClient.get(PREFS_ACCOUNT) minified to .get(\"guest\").then)", () => {
    // Exact minified snippet from the #38 + #50 combined no-flag build (src/shell/store.ts:133).
    expect(hooks('y.get("guest").then(e=>y.put({...e,...t().prefs}))')).toEqual([]);
    expect(hooks("a.get('guest') .then(f)")).toEqual([]);
  });

  it("still flags a query read of the same key", () => {
    expect(hooks('e.get("guest")')).toEqual(['.get("guest")']);
    expect(hooks('const g=e.get("guest");g.then')).toEqual(['.get("guest")']);
  });

  it("flags the FEED_HOOKS demo-sheet read in QuayShell", () => {
    expect(hooks('new URLSearchParams(window.location.search).get("sheet")==="demo"')).toEqual(['.get("sheet")']);
  });

  it("flags every listed query key with any quote style", () => {
    for (const k of QUERY_KEYS as string[]) {
      expect(hooks(`p.get("${k}")`)).toEqual([`.get("${k}")`]);
      expect(hooks(`p.get('${k}')`)).toEqual([`.get("${k}")`]);
      expect(hooks(`p.get(\`${k}\`)`)).toEqual([`.get("${k}")`]);
    }
  });

  it("covers the mock feed, shells and palette keys", () => {
    for (const k of ["sheet", "feed", "seed", "reject", "tier", "empty", "shells", "owned", "palette"]) expect(QUERY_KEYS).toContain(k);
  });

  it("does not flag real deep-link params or near-miss keys", () => {
    expect(hooks('s.get("asset")')).toEqual([]);
    expect(hooks('s.get("sheets")')).toEqual([]);
    expect(hooks('m.get(e)')).toEqual([]);
  });

  it("flags hook strings and the dev-only /__ds markers", () => {
    for (const h of [...(HOOK_STRINGS as string[]), ...(DS_STRINGS as string[])]) expect(hooks(`x("${h}")`)).toContain(h);
    expect(DS_STRINGS).toEqual(expect.arrayContaining(["QUAY_DS", "ds-ready", "mock-orderpad"]));
  });
});
