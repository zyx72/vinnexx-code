#!/usr/bin/env bash
set -Eeuo pipefail
echo "[>_] Testing client"
npm test --prefix apps/client
echo "[>_] Testing server security"
npm test --prefix apps/server
echo "[>_] Testing server HTTP shell"
npm run smoke --prefix apps/server
echo "[>_] Testing dashboard output"
npm run build --prefix apps/dashboard
npm test --prefix apps/dashboard
