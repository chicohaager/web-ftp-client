#!/usr/bin/env bash
# Build a ZimaOS zpkg-compatible systemd-sysext module (.raw) for Web FTP Client.
#
# The resulting image is a squashfs containing:
#   - /usr/lib/extension-release.d/extension-release.web-ftp-client   (sysext marker)
#   - /usr/share/casaos/modules/web-ftp-client.json                   (CasaOS manifest)
#   - /usr/share/casaos/www/modules/web-ftp-client/index.html         (dashboard redirect)
#   - /usr/share/casaos/www/modules/web-ftp-client/logo.svg
#   - /usr/bin/web-ftp-client                                          (CLI wrapper)
#   - /usr/lib/systemd/system/web-ftp-client.service                   (oneshot bootstrap)
#   - /usr/lib/web-ftp-client/{docker-compose.yml,Dockerfile,packages/,...} (compose source)
#
# Install on ZimaOS:  sudo zpkg install ./web-ftp-client.raw
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

NAME="web-ftp-client"
VERSION="$(node -p "require('./package.json').version")"
OUT_DIR="${REPO_ROOT}/dist"
STAGE="${OUT_DIR}/${NAME}-zpkg-build"
RAW_DIR="${STAGE}/raw"
OUTPUT="${OUT_DIR}/${NAME}.raw"
OUTPUT_VERSIONED="${OUT_DIR}/${NAME}-v${VERSION}.raw"

command -v mksquashfs >/dev/null || { echo "ERROR: mksquashfs not installed (apt-get install squashfs-tools)"; exit 1; }

echo "==> Building ${NAME}.raw (v${VERSION})"

rm -rf "${STAGE}" "${OUTPUT}" "${OUTPUT_VERSIONED}" "${OUTPUT_VERSIONED}.sha256"
mkdir -p "${OUT_DIR}"

# Directory skeleton
mkdir -p "${RAW_DIR}/usr/bin"
mkdir -p "${RAW_DIR}/usr/lib/extension-release.d"
mkdir -p "${RAW_DIR}/usr/lib/systemd/system"
mkdir -p "${RAW_DIR}/usr/lib/${NAME}"
mkdir -p "${RAW_DIR}/usr/share/casaos/modules"
mkdir -p "${RAW_DIR}/usr/share/casaos/www/modules/${NAME}"

# 1. systemd-sysext extension release marker
echo "ID=_any" > "${RAW_DIR}/usr/lib/extension-release.d/extension-release.${NAME}"

# 2. CasaOS module manifest
cp "${REPO_ROOT}/zpkg/${NAME}.json" "${RAW_DIR}/usr/share/casaos/modules/${NAME}.json"

# 3. Dashboard redirect + logo
cp "${REPO_ROOT}/zpkg/index.html" "${RAW_DIR}/usr/share/casaos/www/modules/${NAME}/index.html"
cp "${REPO_ROOT}/icon.svg"        "${RAW_DIR}/usr/share/casaos/www/modules/${NAME}/logo.svg"

# 4. CLI wrapper + systemd unit
install -m 755 "${REPO_ROOT}/zpkg/${NAME}-cli.sh" "${RAW_DIR}/usr/bin/${NAME}"
cp "${REPO_ROOT}/zpkg/${NAME}.service" "${RAW_DIR}/usr/lib/systemd/system/${NAME}.service"

# 5. Compose source bundle (what 'web-ftp-client install' copies to /DATA/AppData/...)
echo "==> Staging compose source bundle"
SRC_STAGE="${RAW_DIR}/usr/lib/${NAME}"
cp "${REPO_ROOT}/docker-compose.yml" "${REPO_ROOT}/Dockerfile" "${REPO_ROOT}/.dockerignore" "${SRC_STAGE}/"
cp "${REPO_ROOT}/package.json" "${REPO_ROOT}/pnpm-lock.yaml" "${REPO_ROOT}/pnpm-workspace.yaml" "${SRC_STAGE}/"
cp "${REPO_ROOT}/README.md" "${REPO_ROOT}/LICENSE" "${REPO_ROOT}/icon.svg" "${SRC_STAGE}/"

mkdir -p "${SRC_STAGE}/packages"
for pkg in shared frontend backend; do
  mkdir -p "${SRC_STAGE}/packages/${pkg}"
  rsync -a \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.vite' \
    --exclude='*.tsbuildinfo' \
    --exclude='*.db' \
    --exclude='*.sqlite' \
    "packages/${pkg}/" "${SRC_STAGE}/packages/${pkg}/"
done

# 6. Build squashfs
echo "==> Creating squashfs image"
mksquashfs "${RAW_DIR}" "${OUTPUT}" -comp gzip -noappend -quiet
cp "${OUTPUT}" "${OUTPUT_VERSIONED}"

# 7. Checksum
( cd "${OUT_DIR}" && sha256sum "$(basename "${OUTPUT_VERSIONED}")" > "$(basename "${OUTPUT_VERSIONED}").sha256" )

SIZE=$(du -h "${OUTPUT_VERSIONED}" | cut -f1)

# Cleanup staging
rm -rf "${STAGE}"

echo ""
echo "✓ zpkg .raw built"
echo "  File:      ${OUTPUT_VERSIONED}"
echo "  Alias:     ${OUTPUT}"
echo "  Size:      ${SIZE}"
echo "  Checksum:  ${OUTPUT_VERSIONED}.sha256"
echo ""
echo "Deploy:   scp ${OUTPUT_VERSIONED} root@zima-host:/tmp/"
echo "Install:  sudo zpkg install /tmp/${NAME}-v${VERSION}.raw"
echo "Start:    sudo systemctl enable --now ${NAME}.service"
echo "Or CLI:   sudo web-ftp-client install"
