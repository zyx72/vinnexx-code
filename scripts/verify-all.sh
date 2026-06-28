#!/usr/bin/env bash
set -Eeuo pipefail

bash scripts/install-all.sh
bash scripts/typecheck-all.sh
bash scripts/test-all.sh
bash scripts/build-all.sh
bash scripts/deploy-check.sh
node scripts/security-scan.mjs

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
VINNEXX_HOME="$TMP_DIR/home" node apps/client/dist/vinnexx.mjs --smoke | grep -q '"version":"0.3.0"'
VINNEXX_HOME="$TMP_DIR/home" node apps/client/dist/vinnexx.mjs --version | grep -qx '0.3.0'

test "$(head -n 1 apps/client/dist/vinnexx.mjs)" = '#!/usr/bin/env node'
test "$(sed -n '2p' apps/client/dist/vinnexx.mjs)" != '#!/usr/bin/env node'
test -x apps/client/dist/vinnexx.mjs

npm install -g --prefix "$TMP_DIR/client-prefix" ./apps/client >/dev/null
"$TMP_DIR/client-prefix/bin/vinnexx" --version | grep -qx '0.3.0'
npm install -g --prefix "$TMP_DIR/root-prefix" . >/dev/null
"$TMP_DIR/root-prefix/bin/vinnexx" --version | grep -qx '0.3.0'

if command -v script >/dev/null 2>&1; then
  ( sleep 0.5; printf '/exit\r' ) | timeout 15s script -qefc \
    "env VINNEXX_HOME='$TMP_DIR/pty-home' node apps/client/dist/vinnexx.mjs" \
    "$TMP_DIR/tui.log" >/dev/null
  node - "$TMP_DIR/tui.log" <<'NODE'
const { readFileSync } = require("node:fs");
const data = readFileSync(process.argv[2]);
for (const sequence of ["\u001b[?1049h", "\u001b[?1049l", "\u001b[?25h"]) {
  if (!data.includes(Buffer.from(sequence))) process.exit(1);
}
NODE
fi

echo "[>_] Vinnexx Code v0.3.0 verification completed."
