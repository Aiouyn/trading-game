import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import quay from "./tools/lint/no-hex-literal.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Spec 1 §9: colour literals live only in src/styles/tokens.css / tokens.ts.
    files: ["src/**/*.{ts,tsx}", "tools/lint/fixtures/**/*.{ts,tsx}"],
    ignores: ["src/styles/tokens.ts"],
    plugins: { quay },
    rules: {
      "quay/no-hex-literal": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Spec 1 §9 / AT-01: no raw JSX text in the shell; copy comes from src/shell/strings.ts.
    files: ["src/shell/**/*.tsx", "src/components/shell/**/*.tsx", "src/apps/**/*.tsx", "src/app/**/*.tsx"],
    rules: { "react/jsx-no-literals": ["error", { noStrings: false, ignoreProps: true }] },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "coverage/**",
    "sim-out/**",
    ".next-*/**",
    "engine-staging/**",
    "engine-drops/**",
    "design/**",
    "tools/lint/fixtures/**",
  ]),
]);

export default eslintConfig;
