#!/usr/bin/env bash
# Build an IceWhale-submission bundle for the Web FTP Client zpkg module.
#
# Output:
#   dist/web-ftp-client-icewhale-v<version>/          — submission directory
#   dist/web-ftp-client-icewhale-v<version>.tar.gz    — single drop-off artifact
#
# The bundle contains:
#   - web-ftp-client.raw                     (the squashfs zpkg module, stable name)
#   - web-ftp-client.raw.sha256
#   - VERSION                                (plain-text version string)
#   - mod-v2-entry.json                      (snippet for IceWhaleTech/Mod-Store PR)
#   - SUBMISSION.md                          (cover letter for the IceWhale team)
#   - README.md                              (end-user install / uninstall)
#   - LICENSE                                (MIT)
#   - icon.svg                               (square brand logo)
#   - checksums.txt                          (SHA256 of every file)
#
# IMPORTANT: the .raw filename must be the unversioned "web-ftp-client.raw",
# because `zpkg install` derives the extension name from the filename-stem and
# looks for `extension-release.<stem>` inside the squashfs — the marker is
# `extension-release.web-ftp-client` (stable, systemd-sysext convention).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

NAME="web-ftp-client"
TITLE="Web FTP Client"
VERSION="$(node -p "require('./package.json').version")"
REPO_SLUG="${MAINTAINER_REPO:-chicohaager/web-ftp-client}"
MAINTAINER_NAME="${MAINTAINER_NAME:-Holger Kuehn}"
MAINTAINER_CONTACT="${MAINTAINER_CONTACT:-https://github.com/${REPO_SLUG%%/*}}"

OUT_DIR="${REPO_ROOT}/dist"
BUNDLE_DIR="${OUT_DIR}/${NAME}-icewhale-v${VERSION}"
BUNDLE_TGZ="${OUT_DIR}/${NAME}-icewhale-v${VERSION}.tar.gz"

RAW_SRC="${OUT_DIR}/${NAME}-v${VERSION}.raw"

# --- 1. Ensure the .raw exists (build it if not) ---
if [ ! -f "$RAW_SRC" ]; then
  echo "==> No .raw in dist/ — building via package:zpkg"
  bash "${REPO_ROOT}/scripts/package-zpkg.sh"
fi

if [ ! -f "$RAW_SRC" ]; then
  echo "ERROR: ${RAW_SRC} still missing after package:zpkg" >&2
  exit 1
fi

# Verify it's a valid squashfs before shipping it to IceWhale
if ! file "$RAW_SRC" | grep -q "Squashfs filesystem"; then
  echo "ERROR: ${RAW_SRC} is not a valid squashfs image" >&2
  file "$RAW_SRC"
  exit 1
fi

echo "==> Assembling IceWhale submission bundle (v${VERSION})"
rm -rf "$BUNDLE_DIR" "$BUNDLE_TGZ"
mkdir -p "$BUNDLE_DIR"

# --- 2. Copy the binary artifact + its checksum ---
# NOTE: zpkg install expects filename-stem to match the extension-release marker
# inside the squashfs. The marker is "extension-release.web-ftp-client" (stable,
# unversioned — systemd-sysext convention). Therefore the .raw in the bundle MUST
# be named "web-ftp-client.raw" — a versioned filename breaks `sudo zpkg install`.
# Version information lives in VERSION and in the CasaOS manifest, not the filename.
cp "$RAW_SRC" "${BUNDLE_DIR}/${NAME}.raw"
echo "${VERSION}" > "${BUNDLE_DIR}/VERSION"
( cd "$BUNDLE_DIR" && sha256sum "${NAME}.raw" > "${NAME}.raw.sha256" )

# --- 3. Copy repo-level files end users / reviewers expect ---
cp "${REPO_ROOT}/LICENSE"  "${BUNDLE_DIR}/LICENSE"
cp "${REPO_ROOT}/icon.svg" "${BUNDLE_DIR}/icon.svg"

# --- 4. mod-v2-entry.json — the snippet IceWhale appends to Mod-Store/mod-v2.json ---
cat > "${BUNDLE_DIR}/mod-v2-entry.json" <<JSON
{
  "name": "${NAME}",
  "title": "${TITLE}",
  "repo": "${REPO_SLUG}"
}
JSON

# --- 5. SUBMISSION.md — cover letter ---
cat > "${BUNDLE_DIR}/SUBMISSION.md" <<MD
# ${TITLE} — IceWhale Mod-Store Submission

**Module name:** \`${NAME}\`
**Version:** \`${VERSION}\`
**Maintainer:** ${MAINTAINER_NAME} (${MAINTAINER_CONTACT})
**License:** MIT
**Upstream:** https://github.com/${REPO_SLUG}

---

## What it is

${TITLE} is a professional dual-pane FTP / FTPS / SFTP client built as a native
ZimaOS module. It fills a gap in the ZimaOS / CasaOS ecosystem — there is
currently no first-class web-based FTP client in the App Store or Mod-Store.

Once installed, it appears as a tile in the ZimaOS dashboard and opens in a
zoomed modal card (\`formality.type: newtab\`). Behind the tile, the actual
service is a Docker-Compose stack (Node/Express backend + React frontend) that
the module bootstraps on first run.

## Why Mod-Store and not App-Store

The module ships two things in one \`.raw\`:

1. A **CasaOS module manifest** under \`/usr/share/casaos/modules/\` so the
   dashboard tile + auto-launch "just work" — this is Mod-Store territory.
2. A **compose source bundle** under \`/usr/lib/${NAME}/\` that the on-disk CLI
   (\`/usr/bin/${NAME}\`) copies to \`/DATA/AppData/${NAME}/\` and launches with
   \`docker compose up -d --build\` — same UX as App-Store apps, but self-contained.

Packaging it as a zpkg gives users a single \`sudo zpkg install ${NAME}.raw\`
experience instead of manually creating app-data directories.

## Installation (after merge)

\`\`\`bash
# Via Mod-Store UI
# (tile appears under Settings → Modules once the PR is merged)

# Or manually:
sudo zpkg install /path/to/${NAME}.raw
sudo systemctl enable --now ${NAME}.service
\`\`\`

**Important:** the \`.raw\` file MUST be named \`${NAME}.raw\` when passed to
\`zpkg install\`. The \`zpkg\` CLI derives the extension name from the
filename-stem and looks for \`extension-release.<stem>\` inside the squashfs;
a versioned filename like \`${NAME}-v${VERSION}.raw\` will fail with
\"Extract filename … can't be resolved\". Version lives in the \`VERSION\`
file alongside the \`.raw\` and in the CasaOS manifest.

The service is a \`oneshot\` unit that runs the bootstrap CLI. First launch
takes ~60 s (pnpm install + build); subsequent launches are instant.

## Uninstall

\`\`\`bash
sudo zpkg remove ${NAME}
\`\`\`

This removes the dashboard tile, the CLI, and the systemd unit. User data in
\`/DATA/AppData/${NAME}/\` is intentionally preserved — users remove it manually.

## ZimaOS compatibility

- Tested on ZimaOS 1.3.x (Buildroot, read-only root FS)
- Exports \`DOCKER_CONFIG=/DATA/.docker\` to respect the read-only root
- Uses \`/DATA/AppData/${NAME}/\` for persistent data (standard path)
- No kernel / systemd-sysext reload quirks — standard zpkg lifecycle

## Security posture

- **No inbound internet exposure by default** — binds to LAN only
- **Credentials at rest:** AES-256-GCM, key from \`ENCRYPTION_KEY\` env var
- **Protocols:** FTP, FTPS (TLS), SFTP (SSH) — all via \`basic-ftp\` and
  \`ssh2-sftp-client\`, no custom crypto
- **Runs as PUID/PGID 1000 by default**, configurable

## Files in this bundle

| File | Purpose |
|------|---------|
| \`${NAME}.raw\` | The squashfs/sysext module (the thing to install) |
| \`${NAME}.raw.sha256\` | SHA256 of the above |
| \`VERSION\` | Plain-text version string (\`${VERSION}\`) |
| \`mod-v2-entry.json\` | Snippet to append to \`Mod-Store/mod-v2.json\` |
| \`SUBMISSION.md\` | This document |
| \`README.md\` | End-user install / quickstart |
| \`LICENSE\` | MIT |
| \`icon.svg\` | Square brand logo (used in the dashboard tile) |
| \`checksums.txt\` | SHA256 for every file in the bundle |

## Next steps for IceWhale

1. Review the \`.raw\` (optionally: \`unsquashfs -l ${NAME}.raw\`)
2. Host it on a CDN of choice — or we host via GitHub Releases on
   \`${REPO_SLUG}\` (recommended; change \`repo\` → \`url\` in the entry if
   you prefer a pinned CDN URL)
3. Append the snippet from \`mod-v2-entry.json\` to \`mod-v2.json\`
4. Merge the PR — the tile appears on next Mod-Store sync

Happy to iterate on anything — naming, metadata, icon size, compression. Just
say the word.

— ${MAINTAINER_NAME}
MD

# --- 6. README.md — end-user facing ---
cat > "${BUNDLE_DIR}/README.md" <<MD
# ${TITLE}

Dual-pane FTP / FTPS / SFTP client for ZimaOS.

## Install via zpkg

\`\`\`bash
sudo zpkg install ./${NAME}.raw
sudo systemctl enable --now ${NAME}.service
\`\`\`

Open the tile from the ZimaOS dashboard, or visit \`http://<zima-host>:8089\`.

## Features

- Dual-pane file manager (local NAS ↔ remote server)
- FTP, FTPS (TLS), SFTP (SSH) — including SSH key authentication
- Parallel transfer queue with real-time WebSocket progress
- Saved connections with AES-256-GCM credential encryption
- Drag & drop, context menus, keyboard shortcuts (F2, F5, Del, Tab, Ctrl+A)
- Light / dark theme, follows OS preference

## Ports

| Port | Purpose |
|------|---------|
| 8089 | WebUI (configurable via \`WEBUI_PORT\`) |

## Data

Persistent data lives in \`/DATA/AppData/${NAME}/\`:
- \`db.sqlite\` — saved connections (encrypted)
- \`logs/\` — service logs

## Uninstall

\`\`\`bash
sudo zpkg remove ${NAME}
\`\`\`

User data in \`/DATA/AppData/${NAME}/\` is preserved — remove manually if desired.

## License

MIT — see \`LICENSE\`.

## Upstream

https://github.com/${REPO_SLUG}
MD

# --- 7. checksums.txt — everything in the bundle ---
( cd "$BUNDLE_DIR" && sha256sum * > checksums.txt.tmp && mv checksums.txt.tmp checksums.txt )

# --- 8. Roll it up into a single tarball ---
( cd "$OUT_DIR" && tar -czf "$(basename "$BUNDLE_TGZ")" "$(basename "$BUNDLE_DIR")" )
( cd "$OUT_DIR" && sha256sum "$(basename "$BUNDLE_TGZ")" > "$(basename "$BUNDLE_TGZ").sha256" )

# --- 9. Summary ---
echo ""
echo "==> Submission bundle ready"
echo "    Directory: ${BUNDLE_DIR}"
echo "    Tarball:   ${BUNDLE_TGZ}"
echo ""
echo "    Contents:"
( cd "$BUNDLE_DIR" && ls -la | sed 's/^/      /' )
echo ""
echo "    Tarball size: $(du -h "$BUNDLE_TGZ" | cut -f1)"
echo ""
echo "    → Send ${BUNDLE_TGZ} to the IceWhale team,"
echo "      or open a PR on https://github.com/IceWhaleTech/Mod-Store"
echo "      with the snippet from ${BUNDLE_DIR}/mod-v2-entry.json"
