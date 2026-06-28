#!/usr/bin/env bash
set -Eeuo pipefail
for app in client server dashboard; do
  echo "[>_] Installing apps/$app"
  npm ci --prefix "apps/$app"
done
