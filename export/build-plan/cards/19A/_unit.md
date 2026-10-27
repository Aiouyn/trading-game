# Unit 19A: monorepo, toolchain, lint rules, protocol skeleton, CI (stage S0)

## Purpose
Creates the repository every other unit builds in: pnpm workspaces and Turborepo with the `@tycoon/*` packages of GLOBAL-CONTEXT G2, shared TypeScript, Vitest and fast-check presets, the determinism and import-boundary lint rules that keep `packages/engine` replayable (19 Rule 3.6.2, Rule 3.1.2, §12), the `packages/protocol` skeleton with the canonical encoder used for every hash and wire frame, and the CI pipeline with the static-invariant registry (`verify:static`). Root scripts `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test` exist from T19A-01 on.

## Tasks (build order)
1. T19A-01 Workspace skeleton: packages and apps, config presets, root scripts, local docker compose, docs/spec copy.
2. T19A-02 `@tycoon/protocol` skeleton: canonEncode/canonDecode, canonJson, scalars, intent envelope, client/server messages, kind registries, platform codes.
3. T19A-03 ESLint plugin `tycoon`: determinism rule set for `packages/engine/**` (19#2).
4. T19A-04 Dependency graph from 19 §12.2, generated boundary config, resolved-import check, INV-STR-001 (19#64).
5. T19A-05 CI workflows (PR and nightly), static-check registry, CI summary.

## Internal DAG
- T19A-01 -> T19A-02, T19A-03
- T19A-01, T19A-03 -> T19A-04
- T19A-01..04 -> T19A-05

## Exports to downstream units
- Workspace contract and package names (T19A-01); `definePreset`, `fcRuns` presets.
- `canonEncode`, `canonDecode`, `canonJson`, `IntentSchema`, `ClientMsgSchema`, `ServerMsgSchema`, `registerIntentKind`, `registerEventKind`, `registerSystemKind`, `PLATFORM_CODES` (T19A-02); 02 re-exports `canonEncode` from `@tycoon/engine/core`.
- `@tycoon/eslint-config` configs `base` and `deterministic` (T19A-03).
- `HARD_DEPS`, `ENGINE_MODULE_FOLDER` (incl. `'19': 'sys'`), `PACKAGE_RULES`, generated `boundaries.json`, `checkGraph` (T19A-04).
- `registerStaticCheck`, `runStaticChecks`, stable CI job names (T19A-05).

## Acceptance tests split
- 19#2 (determinism lint) -> T19A-03.
- 19#64 (dependency graph) -> T19A-04.
- Invariant INV-STR-001 -> T19A-04.
- All other 19 tests are in units 19B, 19C, 19D.

## Spec contradictions resolved
- 19 Rule 3.6.2 lists `Math.sqrt` as forbidden and `Math.round` as allowed raw; 02 §3.7.1 and GLOBAL-CONTEXT G8 (binding for code shape) allow `Math.sqrt` (IEEE correctly rounded) and forbid raw `Math.round` (money rounding only via `toMoney`). The lint follows 02 / G8 (02 owns the engine coding standard).
