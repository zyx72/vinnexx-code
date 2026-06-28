#!/usr/bin/env bash
set -Eeuo pipefail
for app in client server dashboard; do
  echo "[>_] Building apps/$app"
  npm run build --prefix "apps/$app"
done
