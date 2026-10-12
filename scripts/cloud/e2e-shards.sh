#!/usr/bin/env bash
# Sharded e2e run: one production build, then N shards of the main projects and one run of the close projects, all in parallel.
# Each shard and the close run have their own web app and world (ports and data folders), so nothing is shared. See
# tests/e2e/README.md ("Sharded runs").
#
#   scripts/cloud/e2e-shards.sh [options] [spec files or regexes...]
#     --shards N            main shards (default 4)
#     --workers W           workers per shard (default 4)
#     --close-workers C     workers for the close run (default 16: one per close project)
#     --web-base P          first web port (default 3500): shard i serves on P+i, the close run uses P+N+100..P+N+115
#     --world-base R        first world port (default 9040): as --web-base, for the worlds
#     --out DIR             output folder (default test-results/shards)
#     --grep RE             only tests whose title matches RE (passed to every run)
#     --projects a,b        only these main projects (default: all of them)
#     --close-projects a,b  only these close projects (default: all 16), e.g. close-card,close-card-phone
#     --no-close            skip the close run
#     --no-build            use the existing .next build
#     --rerun-failed        no run: re-run each failed test of the last run alone (--workers=1) and print TIMING-ONLY or REAL
#
# Exit status: 0 when nothing failed and nothing did not run; 1 otherwise (a shard or the close run may be missing its report).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1

SHARDS=4
WORKERS=4
CLOSE_WORKERS=16
WEB_BASE=3500
WORLD_BASE=9040
OUT="test-results/shards"
GREP=""
MAIN_PROJECTS=""
CLOSE_PROJECTS=""
CLOSE=1
BUILD=1
RERUN=0
FILES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --shards) SHARDS="$2"; shift 2 ;;
    --workers) WORKERS="$2"; shift 2 ;;
    --close-workers) CLOSE_WORKERS="$2"; shift 2 ;;
    --web-base) WEB_BASE="$2"; shift 2 ;;
    --world-base) WORLD_BASE="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --grep) GREP="$2"; shift 2 ;;
    --projects) MAIN_PROJECTS="$2"; shift 2 ;;
    --close-projects) CLOSE_PROJECTS="$2"; shift 2 ;;
    --no-close) CLOSE=0; shift ;;
    --no-build) BUILD=0; shift ;;
    --rerun-failed) RERUN=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) FILES+=("$1"); shift ;;
  esac
done

mkdir -p "$OUT"
# The build is the web app without a world baked in: each server reads its world's port at start (TG_WORLD_PORT).
unset NEXT_PUBLIC_WORLD_URL

# Kills the runs still going when the script is interrupted (their servers go with them).
trap 'kill $(jobs -p) 2>/dev/null; exit 130' INT TERM

build() {
  echo "build: next build (Turbopack)"
  if npx next build > "$OUT/build.log" 2>&1; then
    echo "build: ok (Turbopack)"
    return 0
  fi
  echo "build: Turbopack failed (see $OUT/build.log), trying --webpack"
  if npx next build --webpack > "$OUT/build-webpack.log" 2>&1; then
    echo "build: ok (--webpack)"
    return 0
  fi
  echo "build: FAILED (see $OUT/build-webpack.log)"
  return 1
}

run_shard() {
  local i=$1 web=$((WEB_BASE + i)) world=$((WORLD_BASE + i))
  E2E_SCOPE=main E2E_BUILD_CMD=true E2E_PORT="$web" E2E_WORLD_PORT="$world" E2E_OUT_DIR="$OUT/shard-$i" \
    E2E_PROJECTS="$MAIN_PROJECTS" PLAYWRIGHT_JSON_OUTPUT_NAME="$OUT/shard-$i.json" \
    npx playwright test --shard="$((i + 1))/$SHARDS" --workers="$WORKERS" --reporter=list,json \
    ${GREP:+--grep "$GREP"} ${FILES[@]+"${FILES[@]}"} > "$OUT/shard-$i.log" 2>&1
}

run_close() {
  local port=$((WEB_BASE + SHARDS)) world=$((WORLD_BASE + SHARDS))
  E2E_SCOPE=close E2E_BUILD_CMD=true E2E_PORT="$port" E2E_WORLD_PORT="$world" E2E_OUT_DIR="$OUT/close" \
    E2E_PROJECTS="$CLOSE_PROJECTS" PLAYWRIGHT_JSON_OUTPUT_NAME="$OUT/close.json" \
    npx playwright test --workers="$CLOSE_WORKERS" --reporter=list,json \
    ${GREP:+--grep "$GREP"} ${FILES[@]+"${FILES[@]}"} > "$OUT/close.log" 2>&1
}

full_run() {
  rm -f "$OUT"/shard-*.json "$OUT"/shard-*.log "$OUT"/close.json "$OUT"/close.log "$OUT/summary.json"
  local start pids=() names=() i
  start=$(date +%s)
  echo "run: $SHARDS shard(s) x $WORKERS worker(s)$([ "$CLOSE" = 1 ] && echo ", the close run with $CLOSE_WORKERS worker(s)"), web $WEB_BASE, worlds $WORLD_BASE"
  for ((i = 0; i < SHARDS; i++)); do
    run_shard "$i" &
    pids+=("$!")
    names+=("shard-$i")
  done
  if [ "$CLOSE" = 1 ]; then
    run_close &
    pids+=("$!")
    names+=("close")
  fi

  local k
  for k in "${!pids[@]}"; do
    wait "${pids[$k]}"
    local rc=$?
    echo "  ${names[$k]} finished (exit $rc) after $(( $(date +%s) - start ))s"
  done

  E2E_WALL_SECONDS=$(( $(date +%s) - start )) node scripts/cloud/e2e-report.mjs summarize "$OUT" "${names[@]}"
}

rerun_failed() {
  if [ ! -f "$OUT/summary.json" ]; then
    echo "rerun: no $OUT/summary.json (run the suite first)"
    return 1
  fi
  node scripts/cloud/e2e-report.mjs failed "$OUT" > "$OUT/rerun-list.tsv" || return 1
  : > "$OUT/rerun.txt"
  local n=0 real=0 project file rgx title dir scope verdict
  rm -rf "$OUT/rerun"
  while IFS=$'\t' read -r project file rgx title; do
    [ -z "$project" ] && continue
    n=$((n + 1))
    dir="$OUT/rerun/$n"
    mkdir -p "$dir"
    scope=main
    case "$project" in close-*) scope=close ;; esac
    # One test, alone, one worker, a fresh world of its own (the close projects have theirs too).
    E2E_SCOPE=$scope E2E_BUILD_CMD=true E2E_PORT="$WEB_BASE" E2E_WORLD_PORT="$WORLD_BASE" E2E_OUT_DIR="$dir" \
      E2E_PROJECTS="$project" PLAYWRIGHT_JSON_OUTPUT_NAME="$dir.json" \
      npx playwright test "$file" --project="$project" --grep "$rgx" --workers=1 --reporter=list,json > "$dir.log" 2>&1
    verdict=$(node scripts/cloud/e2e-report.mjs verdict "$dir.json")
    [ "$verdict" = "REAL" ] && real=$((real + 1))
    printf '%s  [%s] %s > %s\n' "$verdict" "$project" "$file" "$title" | tee -a "$OUT/rerun.txt"
  done < "$OUT/rerun-list.tsv"
  echo "rerun: $n test(s) re-run alone, $real REAL"
  [ "$real" -eq 0 ]
}

if [ "$RERUN" = 1 ]; then
  rerun_failed
  exit $?
fi

if [ "$BUILD" = 1 ]; then
  build || exit 1
fi
full_run
exit $?
