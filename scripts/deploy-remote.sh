#!/usr/bin/env bash
# One-shot remote deploy of the Web FTP Client to a ZimaOS / Docker host.
#
# Usage:
#   ./scripts/deploy-remote.sh user@host              # deploy latest tarball
#   ./scripts/deploy-remote.sh user@host --zpkg       # deploy the zpkg .raw instead
#   ./scripts/deploy-remote.sh user@host --both       # deploy both
#
# What it does:
#   1. Ensures dist/ is up-to-date (runs pnpm run package:all)
#   2. scp's the chosen artifact(s) to the target
#   3. ssh's in and runs the installer
#   4. Tails the health check and reports the final URL
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TARGET="${1:-}"
MODE="${2:---tarball}"

if [ -z "$TARGET" ]; then
  cat <<EOF
Usage: $0 user@host [--tarball|--zpkg|--both]

Examples:
  $0 root@192.168.1.147
  $0 root@zimaos.local --zpkg
  $0 holgi@zimaos-147.lan --both
EOF
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
TARBALL="dist/web-ftp-client-v${VERSION}.tar.gz"
RAW="dist/web-ftp-client-v${VERSION}.raw"

# --- 1. Ensure artifacts exist / are fresh ---
if [ ! -f "$TARBALL" ] || [ ! -f "$RAW" ]; then
  echo "==> Building release artifacts (pnpm run package:all)"
  pnpm run package:all >/dev/null
fi

echo "==> Deploying to ${TARGET} (mode: ${MODE})"

case "$MODE" in
  --tarball)
    scp "$TARBALL" "${TARGET}:/tmp/"
    ssh -t "$TARGET" bash -s <<REMOTE
set -euo pipefail
cd /tmp
echo "==> Extracting tarball"
rm -rf /tmp/web-ftp-client-v${VERSION}
tar -xzf web-ftp-client-v${VERSION}.tar.gz
cd web-ftp-client-v${VERSION}
echo "==> Running start.sh"
sudo ./start.sh up
REMOTE
    ;;

  --zpkg)
    scp "$RAW" "${TARGET}:/tmp/"
    ssh -t "$TARGET" bash -s <<REMOTE
set -euo pipefail
cd /tmp
if command -v zpkg >/dev/null; then
  echo "==> Installing via zpkg"
  sudo zpkg remove web-ftp-client 2>/dev/null || true
  sudo zpkg install /tmp/web-ftp-client-v${VERSION}.raw
  sudo systemctl daemon-reload
  sudo systemctl enable --now web-ftp-client.service
  sudo web-ftp-client status || true
else
  echo "ERROR: zpkg CLI not found — is this a ZimaOS host?"
  exit 1
fi
REMOTE
    ;;

  --both)
    scp "$TARBALL" "$RAW" "${TARGET}:/tmp/"
    ssh -t "$TARGET" bash -s <<REMOTE
set -euo pipefail
cd /tmp
echo "==> Extracting tarball"
rm -rf /tmp/web-ftp-client-v${VERSION}
tar -xzf web-ftp-client-v${VERSION}.tar.gz
cd web-ftp-client-v${VERSION}
echo "==> Running start.sh"
sudo ./start.sh up
if command -v zpkg >/dev/null; then
  echo "==> Also installing zpkg module for dashboard tile"
  sudo zpkg remove web-ftp-client 2>/dev/null || true
  sudo zpkg install /tmp/web-ftp-client-v${VERSION}.raw
  sudo systemctl daemon-reload
fi
REMOTE
    ;;

  *)
    echo "Unknown mode: $MODE (use --tarball, --zpkg, or --both)"
    exit 1
    ;;
esac

echo ""
echo "✓ Deploy finished."
TARGET_HOST="${TARGET#*@}"
echo "  URL: http://${TARGET_HOST}:8089/"
