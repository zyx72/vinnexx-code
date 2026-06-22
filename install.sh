#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="Vinnexx Code"
VERSION="0.2.0"
RELEASE_URL="${VINNEXX_RELEASE_URL:-https://github.com/zyx72/vinnexx-code/releases/latest/download/vinnexx-code.zip}"
CHECKSUM_URL="${VINNEXX_CHECKSUM_URL:-${RELEASE_URL}.sha256}"
INSTALL_DIR="${VINNEXX_INSTALL_DIR:-${HOME}/.local/share/vinnexx-code}"
DATA_DIR="${INSTALL_DIR}/.vinnexx"
API_URL="${VINNEXX_API_URL:-https://api.vinnexx.zone.id/api/v1}"

if [[ -n "${PREFIX:-}" && "${PREFIX}" == *"com.termux"* ]]; then
  BIN_DIR="${VINNEXX_BIN_DIR:-${PREFIX}/bin}"
else
  BIN_DIR="${VINNEXX_BIN_DIR:-${HOME}/.local/bin}"
fi

TEMP_DIR=""
cleanup() {
  if [[ -n "${TEMP_DIR:-}" && -d "${TEMP_DIR}" ]]; then
    rm -rf -- "${TEMP_DIR}"
  fi
}
trap cleanup EXIT

say() { printf '[>_]%s\n' "$*"; }
fail() { printf '[x] %s\n' "$*" >&2; exit 1; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

install_termux_prerequisites() {
  if [[ -n "${PREFIX:-}" && "${PREFIX}" == *"com.termux"* ]] && command_exists pkg; then
    say "Installing required Termux packages..."
    pkg install -y nodejs-lts curl unzip >/dev/null
  fi
}

ensure_prerequisites() {
  if ! command_exists node || ! command_exists curl || ! command_exists unzip; then
    install_termux_prerequisites
  fi
  command_exists node || fail "Node.js 20 or newer is required."
  command_exists curl || fail "curl is required."
  command_exists unzip || fail "unzip is required."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "${major}" -ge 20 ]] || fail "Node.js 20 or newer is required; found $(node -v)."
  if ! command_exists sha256sum && ! command_exists shasum; then
    fail "sha256sum or shasum is required to verify the release archive."
  fi
}

verify_checksum() {
  local archive="$1"
  local checksum_file="$2"
  local expected actual
  expected="$(awk '{print $1}' "${checksum_file}" | head -n1)"
  [[ "${expected}" =~ ^[A-Fa-f0-9]{64}$ ]] || fail "Release checksum file is invalid."
  if command_exists sha256sum; then
    actual="$(sha256sum "${archive}" | awk '{print $1}')"
  else
    actual="$(shasum -a 256 "${archive}" | awk '{print $1}')"
  fi
  [[ "${actual}" == "${expected}" ]] || fail "Release checksum verification failed."
}

main() {
  ensure_prerequisites
  local temp archive checksum client_source launcher
  temp="$(mktemp -d)"
  TEMP_DIR="${temp}"
  archive="${temp}/vinnexx-code.zip"
  checksum="${temp}/vinnexx-code.zip.sha256"

  if [[ -n "${VINNEXX_LOCAL_CLIENT:-}" ]]; then
    client_source="${VINNEXX_LOCAL_CLIENT}"
    [[ -f "${client_source}" ]] || fail "VINNEXX_LOCAL_CLIENT does not point to a file."
  else
    say "Downloading ${APP_NAME} v${VERSION}..."
    curl --retry 5 --retry-delay 2 --retry-all-errors --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      "${RELEASE_URL}" --output "${archive}"
    if [[ "${VINNEXX_SKIP_CHECKSUM:-0}" == "1" ]]; then
      say "Warning: checksum verification was explicitly disabled."
    else
      curl --retry 5 --retry-delay 2 --retry-all-errors --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
        "${CHECKSUM_URL}" --output "${checksum}" \
        || fail "Checksum file could not be downloaded: ${CHECKSUM_URL}"
      verify_checksum "${archive}" "${checksum}"
      say "Release checksum verified."
    fi
    unzip -q "${archive}" -d "${temp}/release"
    client_source="$(find "${temp}/release" -type f -name 'vinnexx.mjs' -print -quit)"
    [[ -n "${client_source}" ]] || fail "The release archive does not contain vinnexx.mjs."
  fi

  mkdir -p "${INSTALL_DIR}/client" "${DATA_DIR}/auth" "${DATA_DIR}/cache" \
    "${DATA_DIR}/history" "${DATA_DIR}/temp" "${BIN_DIR}"

  install -m 0755 "${client_source}" "${INSTALL_DIR}/client/vinnexx.mjs.new"
  mv -f "${INSTALL_DIR}/client/vinnexx.mjs.new" "${INSTALL_DIR}/client/vinnexx.mjs"
  printf '%s\n' "${VERSION}" > "${INSTALL_DIR}/VERSION"

  if [[ ! -f "${DATA_DIR}/config.json" ]]; then
    cat > "${DATA_DIR}/config.json" <<JSON
{
  "serverBaseUrl": "${API_URL}",
  "trustedWorkspaces": [],
  "language": "en"
}
JSON
    chmod 600 "${DATA_DIR}/config.json" 2>/dev/null || true
  fi

  launcher="${BIN_DIR}/vinnexx"
  cat > "${launcher}" <<LAUNCHER
#!/usr/bin/env sh
export VINNEXX_HOME="${DATA_DIR}"
exec node "${INSTALL_DIR}/client/vinnexx.mjs" "\$@"
LAUNCHER
  chmod 0755 "${launcher}"

  local installed
  installed="$("${launcher}" --version)"
  [[ "${installed}" == "${VERSION}" ]] || fail "Installation validation failed."

  say "${APP_NAME} v${installed} installed successfully."
  say "Command: vinnexx"
  if [[ ":${PATH}:" != *":${BIN_DIR}:"* ]]; then
    say "Add ${BIN_DIR} to PATH, then restart the terminal."
  fi
}

main "$@"
