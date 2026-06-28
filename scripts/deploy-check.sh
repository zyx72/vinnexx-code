#!/usr/bin/env bash
set -Eeuo pipefail

for app in client server dashboard; do
  test -f "apps/$app/package.json" || { echo "Missing apps/$app/package.json" >&2; exit 1; }
  test -f "apps/$app/package-lock.json" || { echo "Missing apps/$app/package-lock.json" >&2; exit 1; }
done

if grep -R --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude="*.md" --exclude="*.txt" --exclude="deploy-check.sh" -- "npm install --prefix=../.." . >/dev/null; then
  echo "Forbidden cross-directory install command found." >&2
  exit 1
fi

node -e 'const p=require("./apps/server/package.json"); if(!p.devDependencies?.typescript) process.exit(1)'
node -e 'const p=require("./apps/dashboard/package.json"); if(!p.devDependencies?.typescript) process.exit(1)'
node -e 'const p=require("./apps/client/package.json"); if(!p.devDependencies?.typescript) process.exit(1)'

test -f apps/server/src/index.ts
test -f apps/server/vercel.json
test -f apps/dashboard/vercel.json
test -f apps/dashboard/dist/index.html
test -f apps/client/dist/vinnexx.mjs

echo "[>_] Deployment structure check passed."
