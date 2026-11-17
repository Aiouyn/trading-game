#!/bin/sh
# Finds a Node 22.6 or newer, then starts the game. Below 22.18, type stripping is still a flag.
set -e
APP=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$APP/.." && pwd)
cd "$ROOT"
export PA_WORLDS="$ROOT/app/worlds"
unset SIM_POP

version_ok() {
  "$1" -p "process.versions.node" 2>/dev/null | awk -F. '{
    major = $1 + 0
    minor = $2 + 0
    if (major > 22 || (major == 22 && minor >= 6)) ok = 1
  } END { exit ok ? 0 : 1 }'
}

pick=""
try() {
  if [ -n "$pick" ] || [ -z "$1" ] || [ ! -x "$1" ]; then
    return 0
  fi
  case "$1" in
    *WindowsApps*) return 0 ;;
  esac
  if version_ok "$1"; then
    pick=$1
  fi
}

try "$ROOT/node/node"
try "$ROOT/node/bin/node"
try "$APP/node/node"
if command -v node >/dev/null 2>&1; then
  try "$(command -v node)"
fi
try /usr/local/bin/node
try /opt/homebrew/bin/node
try "$HOME/.local/bin/node"

if [ -z "$pick" ]; then
  echo "Install Node.js 22.6 or newer from https://nodejs.org/ and run this again."
  exit 1
fi

VER=$("$pick" -p "process.versions.node")
MAJOR=${VER%%.*}
REST=${VER#*.}
MINOR=${REST%%.*}
FLAGS=""
if [ "$MAJOR" -lt 22 ] || { [ "$MAJOR" -eq 22 ] && [ "$MINOR" -lt 18 ]; }; then
  FLAGS="--experimental-strip-types"
fi

exec "$pick" $FLAGS "$APP/launch.ts"
