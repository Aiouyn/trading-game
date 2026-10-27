// @vitest-environment happy-dom
// Studio art ruling (a): every Wire kind chip is a neutral chip (--line outline, --fg-muted text, from `.chip`); no
// tone class (so no brass / --acc, no --signal), and RUMOR alone gets the dashed modifier (wire.css). e2e checks the
// computed colours in all four palettes.
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { EN } from "@/apps/wire/strings";
import { KindChip } from "@/apps/wire/WireItemRow";
import type { WireKind } from "@/shell/contracts/channels";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const KINDS = Object.keys(EN.kind) as WireKind[];

it("covers all 15 kinds", () => expect(KINDS).toHaveLength(15));

it.each(KINDS)("%s chip is neutral: `.chip` plus its kind class, no tone class", async (kind) => {
  const el = document.createElement("div");
  const root = createRoot(el);
  await act(async () => root.render(createElement(KindChip, { kind, t: EN })));
  const chip = el.querySelector<HTMLElement>("[data-testid=wire-kind]")!;
  expect([...chip.classList].sort()).toEqual(["chip", "wire-kind", `wire-kind-${kind.toLowerCase()}`].sort());
  await act(async () => root.unmount());
});

it("wire.css gives kind chips no colour of their own; only RUMOR's dashed border", () => {
  const css = readFileSync("src/apps/wire/wire.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const kindRules = css.match(/[^{}]*\.wire-kind[^{]*\{[^}]*\}/g) ?? [];
  expect(kindRules.map((r) => r.trim())).toEqual([expect.stringMatching(/^\.chip\.wire-kind-rumor \{ border-style: dashed; \}$/)]);
  expect(css).not.toMatch(/wire-kind[^{]*\{[^}]*(--acc|--signal|color)/);
});
