#!/usr/bin/env bash
# Web FTP Client — idempotent one-shot installer.
#
# Run this on any Docker host (ZimaOS, CasaOS, plain Linux):
#
#     sudo ./install.sh
#
# It detects current state and does the right thing:
#   - not installed     → install + start
#   - installed, down   → start
#   - installed, up     → verify health, report URL
#   - unhealthy         → rebuild and restart
#
# On ZimaOS it additionally:
#   - exports DOCKER_CONFIG=/DATA/.docker (required on read-only root FS)
#   - installs the zpkg .raw module if present next to the script
#   - enables the systemd unit for auto-start on boot
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

APP_NAME="web-ftp-client"
WEBUI_PORT="${WEBUI_PORT:-8089}"
APP_DIR_DEFAULT="/DATA/AppData/${APP_NAME}"
APP_DIR="${APP_DIR:-${APP_DIR_DEFAULT}}"

# -------- pretty output --------
if [ -t 1 ]; then
  C_BLUE='\033[1;34m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'
  C_RED='\033[1;31m'; C_DIM='\033[2m'; C_RESET='\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_DIM=''; C_RESET=''
fi
step() { printf "${C_BLUE}==>${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN} ✓${C_RESET} %s\n" "$*"; }
warn() { printf "${C_YELLOW} ⚠${C_RESET} %s\n" "$*"; }
err()  { printf "${C_RED} ✗${C_RESET} %s\n" "$*" >&2; }
dim()  { printf "${C_DIM}%s${C_RESET}\n" "$*"; }

banner() {
  cat <<'EOF'

   ╭──────────────────────────────────────╮
   │   Web FTP Client — Installer         │
   │   Dual-pane FTP/FTPS/SFTP for Zima   │
   ╰──────────────────────────────────────╯

EOF
}

# -------- root check --------
require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    err "This script needs root. Re-run with: sudo ./install.sh"
    exit 1
  fi
}

# -------- environment detection --------
detect_env() {
  IS_ZIMAOS=0
  if [ -d "/DATA/.docker" ] || [ -f "/etc/casaos/env" ]; then
    IS_ZIMAOS=1
    export DOCKER_CONFIG="${DOCKER_CONFIG:-/DATA/.docker}"
    ok "ZimaOS detected — DOCKER_CONFIG=${DOCKER_CONFIG}"
  else
    ok "Generic Docker host (no ZimaOS layout)"
  fi

  if ! command -v docker >/dev/null; then
    err "docker not found in PATH — cannot continue."
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    err "docker compose v2 plugin not available — cannot continue."
    exit 1
  fi
}

# -------- state detection --------
detect_state() {
  STATE="fresh"
  if [ -f "${APP_DIR}/docker-compose.yml" ]; then
    STATE="installed"
    if ( cd "${APP_DIR}" && docker compose ps --status=running 2>/dev/null | grep -q "${APP_NAME}" ); then
      STATE="running"
    fi
  fi

  if [ "$STATE" = "running" ]; then
    local code
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${WEBUI_PORT}/" || true)"
    if [ "$code" != "200" ]; then
      STATE="unhealthy"
    fi
  fi

  case "$STATE" in
    fresh)     step "State: not installed — will do a fresh install" ;;
    installed) step "State: installed but stopped — will start" ;;
    running)   step "State: already running and healthy" ;;
    unhealthy) step "State: running but HTTP not responding — will rebuild" ;;
  esac
}

# -------- env seeding --------
seed_env() {
  export AppID="${AppID:-${APP_NAME}}"
  export WEBUI_PORT="${WEBUI_PORT:-8089}"
  export ENCRYPTION_KEY="${ENCRYPTION_KEY:-auto}"
  export PUID="${PUID:-1000}"
  export PGID="${PGID:-1000}"
  export TZ="${TZ:-Europe/Berlin}"
}

# -------- copy source to APP_DIR --------
bootstrap_appdir() {
  step "Preparing ${APP_DIR}"
  mkdir -p "${APP_DIR}"

  # Copy everything needed for docker compose build
  local need="docker-compose.yml Dockerfile .dockerignore package.json pnpm-lock.yaml pnpm-workspace.yaml"
  for f in $need; do
    if [ ! -f "${SCRIPT_DIR}/${f}" ]; then
      err "Missing ${f} — are you running install.sh from the unpacked tarball root?"
      exit 1
    fi
    cp "${SCRIPT_DIR}/${f}" "${APP_DIR}/"
  done

  # Optional files (nice to have)
  for f in README.md LICENSE icon.svg .env.example start.sh; do
    [ -f "${SCRIPT_DIR}/${f}" ] && cp "${SCRIPT_DIR}/${f}" "${APP_DIR}/"
  done

  # packages/ source tree (source-only, no node_modules / dist)
  mkdir -p "${APP_DIR}/packages"
  if command -v rsync >/dev/null; then
    rsync -a --delete \
      --exclude='node_modules' --exclude='dist' --exclude='.vite' \
      --exclude='*.tsbuildinfo' --exclude='*.db' --exclude='*.sqlite' \
      "${SCRIPT_DIR}/packages/" "${APP_DIR}/packages/"
  else
    cp -a "${SCRIPT_DIR}/packages/." "${APP_DIR}/packages/"
  fi

  # Seed .env once if missing
  if [ ! -f "${APP_DIR}/.env" ] && [ -f "${APP_DIR}/.env.example" ]; then
    cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
    ok "Seeded ${APP_DIR}/.env from .env.example"
  fi

  chown -R "${PUID}:${PGID}" "${APP_DIR}" 2>/dev/null || true
}

# -------- docker compose up --------
compose_up() {
  step "Running docker compose up -d --build (first build takes 2–5 min)"
  ( cd "${APP_DIR}" && docker compose up -d --build )
}

compose_start() {
  step "Starting existing stack"
  ( cd "${APP_DIR}" && docker compose up -d )
}

# -------- health check --------
wait_healthy() {
  local url="http://localhost:${WEBUI_PORT}/"
  step "Waiting for ${url}"
  local deadline=$(( $(date +%s) + 180 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local code
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$url" || true)"
    if [ "$code" = "200" ]; then
      ok "Service reachable (HTTP 200)"
      return 0
    fi
    printf '.'
    sleep 2
  done
  echo ""
  err "Service did not respond within 180 s."
  warn "Last 40 log lines:"
  ( cd "${APP_DIR}" && docker compose logs --tail=40 ) || true
  return 1
}

# -------- zpkg module install --------
maybe_install_zpkg() {
  [ "$IS_ZIMAOS" = "1" ] || return 0
  command -v zpkg >/dev/null || { dim "  (no zpkg CLI — skipping native module install)"; return 0; }

  local raw
  raw="$(ls "${SCRIPT_DIR}"/${APP_NAME}*.raw 2>/dev/null | head -1 || true)"
  if [ -z "$raw" ]; then
    dim "  (no .raw file next to install.sh — skipping zpkg module install)"
    return 0
  fi

  step "Installing ZimaOS zpkg module: $(basename "$raw")"
  zpkg remove "${APP_NAME}" >/dev/null 2>&1 || true
  zpkg install "$raw"

  if command -v systemctl >/dev/null; then
    systemctl daemon-reload || true
    if systemctl list-unit-files 2>/dev/null | grep -q "^${APP_NAME}.service"; then
      systemctl enable "${APP_NAME}.service" >/dev/null 2>&1 || true
      ok "systemd unit enabled for boot"
    fi
  fi
}

# -------- final report --------
print_success() {
  echo ""
  echo "   ╭──────────────────────────────────────╮"
  printf "   │   ${C_GREEN}✓ Web FTP Client is running${C_RESET}        │\n"
  echo "   ╰──────────────────────────────────────╯"
  echo ""
  printf "     Local:     http://localhost:%s/\n" "${WEBUI_PORT}"
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  [ -n "$ip" ] && printf "     LAN:       http://%s:%s/\n" "$ip" "${WEBUI_PORT}"
  [ "$IS_ZIMAOS" = "1" ] && printf "     Dashboard: open the ZimaOS home screen\n"
  echo ""
  printf "   ${C_DIM}Control:${C_RESET}\n"
  printf "     sudo %s/start.sh {up|down|restart|logs|status}\n" "${APP_DIR}"
  echo ""
}

# ===========================================================================
main() {
  banner
  require_root
  detect_env
  seed_env
  detect_state

  case "$STATE" in
    fresh)
      bootstrap_appdir
      compose_up
      wait_healthy || exit 1
      maybe_install_zpkg
      print_success
      ;;
    installed)
      compose_start
      wait_healthy || exit 1
      maybe_install_zpkg
      print_success
      ;;
    running)
      ok "Already running and healthy — nothing to do."
      maybe_install_zpkg
      print_success
      ;;
    unhealthy)
      warn "Container running but not responding — rebuilding."
      bootstrap_appdir
      compose_up
      wait_healthy || exit 1
      maybe_install_zpkg
      print_success
      ;;
  esac
}

main "$@"
