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

### Docker (recommended)

```bash
docker compose up -d
```

Access at `http://localhost:8089`

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

Add as a custom app store or import the `docker-compose.yml` directly.

## License

MIT — (c) 2026 Virtual Services - Holger Kuehn
