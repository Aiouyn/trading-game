import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test and sim output:
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "coverage/**",
    "sim-out/**",
    ".next-*/**",
    // the Grok team canon (specs, mocks, staging engine) is reference material
    "docs/team/**",
    "world-data/**",
    "tour-out/**",
  ]),
  {
    // every user-facing string goes through t() (src/i18n); a warning until every screen is migrated
    files: ["src/components/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": ["warn", {
        noStrings: true,
        ignoreProps: true,
        allowedStrings: ["·", "—", "–", "/", "×", "%", "$", "+", ":", "(", ")", "★", "✕", "…", "|", "#", "@", ",", "."],
      }],
    },
  },
]);

export default eslintConfig;
