#!/bin/bash
# web-ftp-client — ZimaOS CLI wrapper
# Manages the Web FTP Client Docker stack bundled inside the zpkg module.
set -euo pipefail

APP_NAME="web-ftp-client"
APP_DIR="/DATA/AppData/${APP_NAME}"
SRC_DIR="/usr/lib/${APP_NAME}"
COMPOSE="${APP_DIR}/docker-compose.yml"

GUARD="/usr/libexec/${APP_NAME}/appdata-guard.sh"

export DOCKER_CONFIG="${DOCKER_CONFIG:-/DATA/.docker}"

# Root reads docker-compose.yml, the Dockerfile (and an .env, if there is one) from APP_DIR and builds from it. /DATA/AppData is
# writable by everyone on ZimaOS 1.8 (0777 without the sticky bit) and the /DATA share is writable over
# SMB, so another user could rename this folder and put one of their own in its place. Before any
# command touches APP_DIR, lintux-modkit's appdata-guard.sh sets the sticky bit on /DATA/AppData and
# refuses a folder that is a symlink, does not belong to root or is writable by others.
guard() {
  /bin/sh "${GUARD}" "${APP_DIR}" || { echo "Refusing to use ${APP_DIR} (see the message above)." >&2; exit 1; }
}

ensure_installed() {
  if [ ! -f "${COMPOSE}" ]; then
    echo "==> Installing ${APP_NAME} to ${APP_DIR}"
    mkdir -p "${APP_DIR}"
    cp -a "${SRC_DIR}/." "${APP_DIR}/"
  fi
}

case "${1:-help}" in
  install|up|start|stop|restart|down|uninstall|logs|status) guard ;;
esac

case "${1:-help}" in
  install|up)
    ensure_installed
    cd "${APP_DIR}"
    docker compose up -d --build
    ;;
  start)
    cd "${APP_DIR}"
    docker compose start
    ;;
  stop)
    cd "${APP_DIR}"
    docker compose stop
    ;;
  restart)
    cd "${APP_DIR}"
    docker compose restart
    ;;
  down)
    cd "${APP_DIR}"
    docker compose down
    ;;
  uninstall)
    cd "${APP_DIR}"
    docker compose down -v
    echo "Data kept in ${APP_DIR}. Remove manually if desired."
    ;;
  logs)
    cd "${APP_DIR}"
    docker compose logs -f --tail=200
    ;;
  status)
    if [ -f "${COMPOSE}" ]; then cd "${APP_DIR}" && docker compose ps; else echo "Not installed. Run: web-ftp-client install"; fi
    ;;
  help|*)
    cat <<EOF
web-ftp-client — ZimaOS control CLI

Usage: web-ftp-client <command>

Commands:
  install    Bootstrap /DATA/AppData/${APP_NAME} and run 'docker compose up -d --build'
  up         Alias for install
  start      docker compose start
  stop       docker compose stop
  restart    docker compose restart
  down       docker compose down (keeps volumes)
  uninstall  docker compose down -v (drops volumes)
  logs       Follow combined container logs
  status     docker compose ps
  help       Show this message
EOF
    ;;
esac
