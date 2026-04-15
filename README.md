# Web FTP Client

A professional web-based FTP/FTPS/SFTP client for ZimaOS and CasaOS.

## Features

- **Dual-Pane File Manager** — Local (NAS) and Remote side-by-side
- **Protocols** — FTP, FTPS (TLS), SFTP (SSH)
- **SSH Key Authentication** — Paste or load private keys for SFTP
- **Transfer Queue** — Parallel transfers with real-time progress via WebSocket
- **Connection Manager** — Save and manage server connections (credentials encrypted at rest)
- **Context Menus** — Right-click for upload, download, rename, delete, new folder
- **Drag & Drop** — Drag files between panels to transfer
- **Keyboard Shortcuts** — Delete, F2 (rename), F5 (refresh), Tab (switch panel), Ctrl+A
- **File Search** — Instant filter in each panel
- **Light/Dark Theme** — Toggle with persistence, follows OS preference
- **Docker Ready** — Multi-stage Alpine build, `docker-compose.yml` with `x-casaos` metadata

## Quick Start

### On ZimaOS (recommended)

```bash
./start.sh
```

The `start.sh` wrapper auto-detects ZimaOS, exports `DOCKER_CONFIG=/DATA/.docker`
(required because ZimaOS has a read-only root filesystem), seeds sensible
defaults for `AppID`/`PUID`/`PGID`/`TZ`, and runs `docker compose up -d --build`.

Access at `http://<zima-host>:8089`.

Alternatively, install the zpkg module (`web-ftp-client.raw`) — see
[INSTALL-ZPKG.md](INSTALL-ZPKG.md).

### On plain Docker hosts

```bash
cp .env.example .env   # optional: edit values
docker compose up -d --build
```

Access at `http://localhost:8089`.

### Development

```bash
pnpm install
pnpm dev
```

Backend runs on `http://localhost:3000`, Frontend dev server on `http://localhost:5173` (proxied).

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, basic-ftp, ssh2-sftp-client, better-sqlite3
- **Frontend**: React 18, shadcn/ui, Tailwind CSS, Zustand, Vite
- **Security**: AES-256-GCM credential encryption, path traversal protection, non-root Docker

## ZimaOS / CasaOS Installation

Two paths:

1. **Docker Compose import** — paste `docker-compose.yml` into the CasaOS
   "Install a customized app" dialog. Icon is embedded as a data-URI.
2. **zpkg module** — `sudo zpkg install web-ftp-client.raw`, then
   `sudo systemctl enable --now web-ftp-client.service`. Adds a native
   dashboard tile and a `web-ftp-client` CLI.

## Troubleshooting

**`mkdir /root/.docker: read-only file system`** — You're on ZimaOS and ran
`docker compose` without the config override. Use `./start.sh` instead, or
prefix manually:

```bash
sudo DOCKER_CONFIG=/DATA/.docker docker compose up -d --build
```

## License

MIT — (c) 2026 Virtual Services - Holger Kuehn
