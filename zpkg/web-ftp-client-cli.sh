#!/bin/bash
# web-ftp-client — ZimaOS CLI wrapper
# Manages the Web FTP Client Docker stack bundled inside the zpkg module.
set -euo pipefail

APP_NAME="web-ftp-client"
APP_DIR="/DATA/AppData/${APP_NAME}"
SRC_DIR="/usr/lib/${APP_NAME}"
COMPOSE="${SRC_DIR}/docker-compose.yml"
# uid/gid of the "node" user in node:20-alpine — the container runs as it and writes its database to /app/data
DATA_UID=1000

GUARD="/usr/libexec/${APP_NAME}/appdata-guard.sh"

export DOCKER_CONFIG="${DOCKER_CONFIG:-/DATA/.docker}"

# Root builds and starts the stack from the read-only module image (SRC_DIR) — never from APP_DIR. APP_DIR is
# only the container's data volume and belongs to the container user: if root built from it, the container
# (or anyone in group 1000 over SMB) could change the Dockerfile or the compose file root runs next time.
# /DATA/AppData is writable by everyone on ZimaOS 1.8 (0777 without the sticky bit), so before dockerd mounts
# APP_DIR, lintux-modkit's appdata-guard.sh sets the sticky bit on /DATA/AppData and refuses a folder that is
# a symlink, belongs to someone other than root or the container user, or is writable by others.
# Up to v0.1.0 the CLI copied the sources into APP_DIR; those copies stay there, unused.
prepare_data() {
  local parent
  parent=$(dirname "${APP_DIR}")
  # Sticky bit first: from then on only root and the folder's owner can rename or replace APP_DIR, so the
  # checks and changes below cannot be raced by swapping the folder (appdata-guard.sh sets it too, later).
  if [ -d "${parent}" ] && [ ! -L "${parent}" ] && [ "$(stat -c %u "${parent}")" = 0 ]; then
    chmod +t "${parent}"
  fi
  if [ ! -e "${APP_DIR}" ] && [ ! -L "${APP_DIR}" ]; then
    mkdir -m 700 "${APP_DIR}"
    chown -h "${DATA_UID}:${DATA_UID}" "${APP_DIR}"
  elif [ -d "${APP_DIR}" ] && [ ! -L "${APP_DIR}" ] && [ "$(stat -c %u "${APP_DIR}")" = "${DATA_UID}" ]; then
    chmod 700 "${APP_DIR}"    # v0.1.0 installs left it 775; the database in it needs no other reader
  elif [ -d "${APP_DIR}" ] && [ ! -L "${APP_DIR}" ] && [ "$(stat -c %u "${APP_DIR}")" = 0 ]; then
    # made by root (sudo mkdir, or dockerd creating a missing bind source): the container could not write to it
    chown -h "${DATA_UID}:${DATA_UID}" "${APP_DIR}"
    chmod 700 "${APP_DIR}"
  fi
  if [ -e "${APP_DIR}/.env" ]; then
    echo "Note: ${APP_DIR}/.env is no longer read (since v0.2.0 the stack runs from ${SRC_DIR}). See INSTALL-ZPKG.md, Update." >&2
  fi
  APPDATA_GUARD_UID="${DATA_UID}" APPDATA_GUARD_PATH_UID=0 /bin/sh "${GUARD}" --no-create "${APP_DIR}" \
    || { echo "Refusing to use ${APP_DIR} (see the message above)." >&2; exit 1; }
}

compose() {
  docker compose -f "${COMPOSE}" --project-directory "${SRC_DIR}" "$@"
}

case "${1:-help}" in
  install|up|start|restart|reset-account) prepare_data ;;
esac

case "${1:-help}" in
  install|up)
    compose up -d --build
    ;;
  start)
    compose start
    ;;
  stop)
    compose stop
    ;;
  restart)
    compose restart
    ;;
  down)
    compose down
    ;;
  uninstall)
    compose down -v
    echo "Data kept in ${APP_DIR}. Remove manually if desired."
    ;;
  logs)
    compose logs -f --tail=200
    ;;
  status)
    compose ps
    ;;
  reset-account)
    # forgotten password: drop the account inside the container, restart for a new setup code
    docker exec web-ftp-client node packages/backend/dist/reset-account.js
    compose restart
    echo "Now: sudo web-ftp-client setup-code"
    ;;
  setup-code)
    # read inside the container (as its user), not from APP_DIR on the host
    docker exec web-ftp-client cat /app/data/setup-code 2> /dev/null \
      || { echo "No setup code: the account exists already, or the app is not running (sudo web-ftp-client status)." >&2; exit 1; }
    ;;
  help|*)
    cat <<EOF
web-ftp-client — ZimaOS control CLI

Usage: web-ftp-client <command>

Commands:
  install    Prepare the data folder /DATA/AppData/${APP_NAME} and run 'docker compose up -d --build'
  up         Alias for install
  start      docker compose start
  stop       docker compose stop
  restart    docker compose restart
  down       docker compose down (keeps volumes)
  uninstall  docker compose down -v (drops volumes)
  logs       Follow combined container logs
  status     docker compose ps
  setup-code Print the one-time code that creates the account on the first visit
  reset-account  Forgot the password: remove the account (saved connections stay)
  help       Show this message
EOF
    ;;
esac
