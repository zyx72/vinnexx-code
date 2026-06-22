#!/usr/bin/env bash
set -Eeuo pipefail
for app in client server dashboard; do
  echo "[>_] Typechecking apps/$app"
  npm run typecheck --prefix "apps/$app"
done
