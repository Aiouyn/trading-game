#!/usr/bin/env bash
# Spec 1 S1-02: the hex fixtures MUST make ESLint and Stylelint fail.
set -u
cd "$(dirname "$0")/../.."
if npx eslint --no-ignore --rule '{"quay/no-hex-literal":"error"}' tools/lint/fixtures/hex.fixture.ts >/dev/null 2>&1; then
  echo "FAIL: ESLint accepted tools/lint/fixtures/hex.fixture.ts"; exit 1; fi
echo "ok: ESLint rejects '#fff' fixture"
if npx stylelint --config .stylelintrc.json tools/lint/fixtures/hex.fixture.css >/dev/null 2>&1; then
  echo "FAIL: Stylelint accepted tools/lint/fixtures/hex.fixture.css"; exit 1; fi
echo "ok: Stylelint rejects '#fff' fixture"
