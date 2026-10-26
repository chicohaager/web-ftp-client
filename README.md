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

Access at `https://<zima-host>:8089` (see *HTTPS* below for the certificate warning on the first visit).

Alternatively, install the zpkg module (`web-ftp-client.raw`) — see
[INSTALL-ZPKG.md](INSTALL-ZPKG.md).

### On plain Docker hosts

```bash
cp .env.example .env   # optional: edit values
docker compose up -d --build
```

Access at `https://localhost:8089`.

### Sign-in

The app has one account, protected by a password. On the first visit it shows a
setup page; creating the account needs a one-time **setup code**, so nobody else
who reaches the port first can claim the app:

- ZimaOS (zpkg module): `sudo web-ftp-client setup-code`
- Docker: `docker logs web-ftp-client` shows `Setup code: …`

After that, the sign-in page asks for user name and password. A session lasts
7 days; *Change password* (user menu, top right) signs out every other browser.
Five wrong attempts from one address lock it for 15 minutes. Forgot the password?
`sudo web-ftp-client reset-account` (Docker: `docker exec web-ftp-client node
packages/backend/dist/reset-account.js`, then restart the container) removes the
account — saved connections stay — and the next start prints a new setup code.

### HTTPS

The app speaks HTTPS on port 8089, so password, session cookie and files are
encrypted on the network. Plain HTTP on the same port only redirects to HTTPS
(and answers `/healthz` for the ZimaOS tile) — a sign-in sent in clear is never
handled.

Without your own certificate the app makes a **self-signed** one on the first
start (kept in the data folder). The browser warns once per device: compare the
SHA-256 fingerprint it shows with `sudo web-ftp-client tls-fingerprint` (ZimaOS)
or the `TLS certificate SHA-256` line in `docker logs web-ftp-client`, then
accept it. Same fingerprint means nobody sits in between.

Options (container environment):

- `TLS_CERT` / `TLS_KEY` — paths inside the container to your own certificate
  and key (e.g. mounted from your reverse proxy or Let's Encrypt); no warning
  then. Set both: with one alone, or files that don't load or don't belong
  together, the app refuses to start and names the file. Docker Compose installs
  only; the ZimaOS module uses the self-signed certificate.
- `TLS_HOSTNAMES` — extra host names/IPs written into the self-signed
  certificate (comma-separated); takes effect for a new certificate (delete
  `tls/` in the data folder).
- `TLS=off` (also `false`, `0`, `no`) — plain HTTP, only behind a reverse
  proxy that does HTTPS.

### Behind a reverse proxy

Set `TLS=off` if the proxy talks plain HTTP to the app (or keep TLS and let the
proxy accept the app's certificate), and `TRUST_PROXY` to the proxy's address:
`loopback`, an IP or a subnet, comma-separated (Express syntax; e.g.
`172.16.0.0/12` for a proxy container on a Docker network). A hop count such as
`1` is refused: port 8089 is reachable from the LAN directly, and every client
could then set its own `X-Forwarded-For` and escape the lock after failed
sign-ins. Then the app takes the client address (for
the lock after failed attempts), HTTPS (the cookie becomes `Secure`) and the host
the browser used (`X-Forwarded-Host`, for the origin check) from the proxy.
Without `TRUST_PROXY` these headers are ignored — anyone could send them.

### Development

```bash
pnpm install
pnpm dev
```

Backend runs on `http://localhost:3000` (`pnpm dev` sets `TLS=off`), Frontend dev server on `http://localhost:5173` (proxied).

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

---

## ☕ Support

If this project saves you time, you can buy me a coffee — it keeps the side projects going.

<!-- bmc-button -->
[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=holgi18114&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://buymeacoffee.com/holgi18114)

… or scan the code:

<a href="https://buymeacoffee.com/holgi18114"><img src=".github/bmc-qr.png" alt="Buy Me a Coffee QR code" width="160"></a>
