#!/usr/bin/env bash
# Spec 1 S1-21: Spec 1 PRs never touch src/city/** or tests/**/city/** (owned by Spec 2).
set -euo pipefail
base="${1:-origin/main}"
bad=$(git diff --name-only "$(git merge-base "$base" HEAD)" HEAD | grep -E '^(src/city/|tests/.*/city/)' || true)
if [ -n "$bad" ]; then echo "FAIL: Spec 1 must not touch City paths:"; echo "$bad"; exit 1; fi
echo "ok: no path under src/city/** or tests/**/city/** changed vs $base"
