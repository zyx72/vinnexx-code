#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="${ROOT_DIR}/apps/client"

fail() { printf '[x] %s\n' "$*" >&2; exit 1; }
say() { printf '[>_] %s\n' "$*"; }
command -v node >/dev/null 2>&1 || fail "Node.js 20 or newer is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."
major="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "${major}" -ge 20 ]] || fail "Node.js 20 or newer is required."

say "Installing client dependencies..."
npm ci --prefix "${CLIENT_DIR}"
say "Building Vinnexx Code v0.3.0..."
npm run build --prefix "${CLIENT_DIR}"
say "Installing global command..."
npm install -g "${CLIENT_DIR}"

installed="$(vinnexx --version 2>/dev/null || true)"
[[ "${installed}" == "0.3.0" ]] || fail "Global command validation failed."
say "Installed successfully. Run: vinnexx"
