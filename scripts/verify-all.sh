#!/usr/bin/env bash
set -Eeuo pipefail
bash scripts/install-all.sh
bash scripts/typecheck-all.sh
bash scripts/test-all.sh
bash scripts/build-all.sh
bash scripts/deploy-check.sh
node scripts/package-release.mjs

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
VINNEXX_LOCAL_CLIENT="$PWD/apps/client/dist/vinnexx.mjs" \
VINNEXX_INSTALL_DIR="$TMP_DIR/app" \
VINNEXX_BIN_DIR="$TMP_DIR/bin" \
VINNEXX_API_URL="https://api.vinnexx.zone.id/api/v1" \
bash install.sh
"$TMP_DIR/bin/vinnexx" --version | grep -qx '0.2.0'
node scripts/package-source.mjs

echo "[>_] Vinnexx Code v0.2.0 verification completed."
