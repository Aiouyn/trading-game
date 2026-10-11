#!/usr/bin/env bash
# VM startup script (runs as root on first boot): Node 22, git, build tools, Playwright's Chromium deps.
set -euo pipefail
if [ -f /opt/tg-ready ]; then exit 0; fi
apt-get update
apt-get install -y curl git build-essential tmux htop
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npx -y playwright@1 install-deps chromium
touch /opt/tg-ready
