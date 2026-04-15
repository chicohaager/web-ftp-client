#!/usr/bin/env bash
# Web FTP Client — automated installer / launcher.
#
# Handles everything the docker compose stack needs on any host:
#   - Detects ZimaOS layout and sets DOCKER_CONFIG=/DATA/.docker
#   - Seeds .env defaults so compose doesn't warn about unset variables
#   - Creates the AppData subdirectory with correct ownership
#   - Runs docker compose up -d --build
#   - Health-checks http://localhost:${WEBUI_PORT}/ for up to 120s
#   - Reports final URL or shows container logs on failure
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ACTION="${1:-up}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m ⚠\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; }

# --- 1. Environment detection ---
IS_ZIMAOS=0
if [ -d "/DATA/.docker" ] || [ -f "/etc/casaos/env" ]; then
  IS_ZIMAOS=1
  export DOCKER_CONFIG="${DOCKER_CONFIG:-/DATA/.docker}"
  log "ZimaOS layout detected — DOCKER_CONFIG=${DOCKER_CONFIG}"
fi

# --- 2. Load or seed env ---
if [ -f ".env" ]; then
  log "Loading .env"
  set -a; . ./.env; set +a
else
  log "No .env found — seeding defaults (run: cp .env.example .env to customize)"
  export AppID="${AppID:-web-ftp-client}"
  export WEBUI_PORT="${WEBUI_PORT:-8089}"
  export ENCRYPTION_KEY="${ENCRYPTION_KEY:-auto}"
  export PUID="${PUID:-1000}"
  export PGID="${PGID:-1000}"
  export TZ="${TZ:-Europe/Berlin}"
fi

# --- 3. AppData bootstrap (ZimaOS) ---
if [ "$IS_ZIMAOS" = "1" ] && [ -d "/DATA/AppData" ]; then
  APPDATA="/DATA/AppData/${AppID}"
  if [ ! -d "$APPDATA" ]; then
    log "Creating $APPDATA"
    mkdir -p "$APPDATA"
    chown -R "${PUID}:${PGID}" "$APPDATA" 2>/dev/null || true
  fi
fi

# --- 4. Docker check ---
if ! command -v docker >/dev/null; then
  err "docker not found in PATH"
  exit 1
fi

# --- 5. Action ---
case "$ACTION" in
  up|start|install)
    log "Building and starting stack"
    docker compose up -d --build

    # --- 6. Health check ---
    URL="http://localhost:${WEBUI_PORT}/"
    log "Waiting for ${URL}"
    DEADLINE=$(( $(date +%s) + 120 ))
    while [ "$(date +%s)" -lt "$DEADLINE" ]; do
      CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$URL" || true)"
      if [ "$CODE" = "200" ]; then
        ok "Service reachable at $URL"
        echo ""
        ok "Web FTP Client is running."
        echo "    Local:  $URL"
        if [ "$IS_ZIMAOS" = "1" ]; then
          HOSTIP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
          [ -n "$HOSTIP" ] && echo "    LAN:    http://${HOSTIP}:${WEBUI_PORT}/"
        fi
        exit 0
      fi
      printf '.'
      sleep 2
    done
    echo ""
    err "Service did not become healthy within 120s."
    warn "Last 40 lines of container logs:"
    docker compose logs --tail=40 || true
    exit 1
    ;;

  down|stop)
    log "Stopping stack"
    docker compose down
    ok "Stopped."
    ;;

  restart)
    log "Restarting stack"
    docker compose down
    exec "$0" up
    ;;

  logs)
    docker compose logs -f --tail=200
    ;;

  status|ps)
    docker compose ps
    ;;

  *)
    echo "Usage: $0 {up|down|restart|logs|status}"
    exit 1
    ;;
esac
