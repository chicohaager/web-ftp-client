#!/usr/bin/env bash
# Build a distributable release tarball for Web FTP Client.
# Produces: dist/web-ftp-client-vX.Y.Z.tar.gz + SHA256 checksum.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="$(node -p "require('./package.json').version")"
NAME="web-ftp-client-v${VERSION}"
OUT_DIR="${REPO_ROOT}/dist"
STAGE_DIR="${OUT_DIR}/${NAME}"
ARCHIVE="${OUT_DIR}/${NAME}.tar.gz"

echo "==> Packaging ${NAME}"

# Fresh staging dir
rm -rf "${STAGE_DIR}" "${ARCHIVE}" "${ARCHIVE}.sha256"
mkdir -p "${STAGE_DIR}"

# Sanity: make sure everything still compiles before packaging
echo "==> Type-check"
pnpm -r run type-check >/dev/null

echo "==> Build"
pnpm --filter=shared build >/dev/null
pnpm --filter=frontend build >/dev/null
pnpm --filter=backend build >/dev/null

echo "==> Staging files"

# Top-level files the recipient needs
cp docker-compose.yml Dockerfile .dockerignore README.md LICENSE icon.svg "${STAGE_DIR}/"
cp package.json pnpm-lock.yaml pnpm-workspace.yaml "${STAGE_DIR}/"
cp .env.example "${STAGE_DIR}/"
install -m 755 start.sh "${STAGE_DIR}/start.sh"
install -m 755 install.sh "${STAGE_DIR}/install.sh"
[ -f INSTALL-ZPKG.md ] && cp INSTALL-ZPKG.md "${STAGE_DIR}/"
# Include the zpkg .raw if it was built — lets install.sh do native ZimaOS integration
if [ -f "${OUT_DIR}/${NAME}.raw" ]; then
  cp "${OUT_DIR}/${NAME}.raw" "${STAGE_DIR}/"
  echo "  Including ${NAME}.raw (zpkg module)"
fi

# Source packages (copy then strip node_modules / dist)
mkdir -p "${STAGE_DIR}/packages"
for pkg in shared frontend backend; do
  mkdir -p "${STAGE_DIR}/packages/${pkg}"
  # Copy everything except node_modules, dist, build caches
  rsync -a \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.vite' \
    --exclude='*.tsbuildinfo' \
    --exclude='*.db' \
    --exclude='*.sqlite' \
    "packages/${pkg}/" "${STAGE_DIR}/packages/${pkg}/"
done

# Install instructions specific to the release bundle
cat > "${STAGE_DIR}/INSTALL.md" <<'EOF'
# Web FTP Client — Install

## ZimaOS (recommended)

```bash
./start.sh
```

The wrapper auto-detects ZimaOS, sets `DOCKER_CONFIG=/DATA/.docker`
(required on ZimaOS — root FS is read-only), seeds the four CasaOS-managed
variables (`AppID`, `PUID`, `PGID`, `TZ`) to sensible defaults, and runs
`docker compose up -d --build`.

Then open `http://<zima-host>:8089`.

## Plain Docker host

```bash
cp .env.example .env       # optional: edit values
docker compose up -d --build
```

Then open `http://localhost:8089`.

## CasaOS / ZimaOS app store import

Paste `docker-compose.yml` into the CasaOS "Install a customized app"
dialog. Icon is embedded as a data-URI — no external hosting needed.

## Troubleshooting

**`mkdir /root/.docker: read-only file system`** — ZimaOS has a read-only
root FS. Docker tries to write config to `/root/.docker`. Either use
`./start.sh` (which handles this) or prefix manually:

```bash
sudo DOCKER_CONFIG=/DATA/.docker docker compose up -d --build
```

**Warnings about `AppID`/`PUID`/`PGID`/`TZ` not set** — These are supplied
by CasaOS at import time. For a manual `docker compose` run copy
`.env.example` to `.env`, or use `./start.sh` which seeds them.

## Environment

| Variable         | Default          | Purpose                                |
|------------------|------------------|----------------------------------------|
| `WEBUI_PORT`     | `8089`           | Host port the UI is exposed on         |
| `AppID`          | `web-ftp-client` | AppData subdirectory name              |
| `ENCRYPTION_KEY` | `auto`           | Key for stored credentials (AES-256)   |
| `PUID` / `PGID`  | `1000`           | User/group container runs as           |
| `TZ`             | `Europe/Berlin`  | Container timezone                     |

## Volumes

- `/DATA/AppData/${AppID}` → `/app/data` — SQLite DB + encryption key
- `/DATA` → `/mnt/nas` — files managed by the FTP client

## Verify

```bash
curl -sS http://localhost:8089/api/connections
# → {"ok":true,"data":[]}
```
EOF

echo "==> Creating archive"
tar -C "${OUT_DIR}" -czf "${ARCHIVE}" "${NAME}"

echo "==> SHA256"
( cd "${OUT_DIR}" && sha256sum "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256" )

SIZE_HUMAN=$(du -h "${ARCHIVE}" | awk '{print $1}')

echo ""
echo "✓ Release built"
echo "  Archive:   ${ARCHIVE}"
echo "  Size:      ${SIZE_HUMAN}"
echo "  Checksum:  ${ARCHIVE}.sha256"
echo ""
FILE_LIST=$(tar -tzf "${ARCHIVE}")
FILE_COUNT=$(echo "${FILE_LIST}" | wc -l)
echo "  Contents (first 30 of ${FILE_COUNT}):"
echo "${FILE_LIST}" | sed -n '1,30p' | sed 's/^/    /'
echo "    ..."

# Clean the staging dir, keep only the archive
rm -rf "${STAGE_DIR}"
