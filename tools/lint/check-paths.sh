#!/usr/bin/env bash
# Spec 1 S1-21: Spec 1 PRs never touch src/city/** or tests/**/city/** (owned by Spec 2).
# Exits non-zero on a forbidden path AND whenever a git command fails (bad ref, shallow clone, not a repo).
set -euo pipefail
base="${1:-origin/main}"

if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null; then
  echo "FAIL: base ref '${base}' not found (fetch it, e.g. git fetch origin main)" >&2; exit 2
fi
if ! mb=$(git merge-base "$base" HEAD); then
  echo "FAIL: git merge-base ${base} HEAD failed (shallow clone? use fetch-depth: 0)" >&2; exit 2
fi
if ! files=$(git diff --name-only "$mb" HEAD); then
  echo "FAIL: git diff ${mb} HEAD failed" >&2; exit 2
fi

bad=$(printf '%s\n' "$files" | grep -E '^(src/city/|tests/.*/city/)' || true)
if [ -n "$bad" ]; then echo "FAIL: Spec 1 must not touch City paths:"; echo "$bad"; exit 1; fi
echo "ok: $(printf '%s\n' "$files" | grep -c . || true) changed files vs ${base}; none under src/city/** or tests/**/city/**"
