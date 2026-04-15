# Web FTP Client — zpkg Installation

The `web-ftp-client.raw` file is a **systemd-sysext module** in ZimaOS zpkg
format. It bundles:

- CasaOS dashboard tile (`/modules/web-ftp-client/`)
- CLI wrapper `/usr/bin/web-ftp-client`
- systemd oneshot unit `web-ftp-client.service`
- Full compose source under `/usr/lib/web-ftp-client/`

## Install

```bash
# 1. Copy the .raw to the ZimaOS host — it MUST be named `web-ftp-client.raw`.
#    zpkg derives the extension name from the filename-stem and looks for
#    `extension-release.<stem>` inside the squashfs; a versioned filename like
#    `web-ftp-client-v0.1.0.raw` will fail with
#    "Extract filename … extension-release.web-ftp-client-v0.1.0 can't be resolved".
scp web-ftp-client.raw root@zima-host:/tmp/

# 2. Install the zpkg module
ssh root@zima-host
sudo zpkg install /tmp/web-ftp-client.raw

# 3. Start the stack (not automatic — zpkg only mounts the overlay)
sudo systemctl daemon-reload
sudo systemctl enable --now web-ftp-client.service

# or equivalently via the CLI wrapper:
sudo web-ftp-client install
```

The first start copies the compose source to `/DATA/AppData/web-ftp-client/`,
then runs `docker compose up -d --build` with `DOCKER_CONFIG=/DATA/.docker`
pre-set. Initial build takes 2–5 minutes.

## Verify

```bash
# Container running?
sudo web-ftp-client status

# HTTP responding?
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:8089/
# → 200

# Dashboard tile visible?
# Open ZimaOS UI → "Web FTP Client" tile should appear.
```

## CLI Reference

```
web-ftp-client install    # Bootstrap AppData and run compose up -d --build
web-ftp-client start      # docker compose start
web-ftp-client stop       # docker compose stop
web-ftp-client restart    # docker compose restart
web-ftp-client down       # docker compose down (keeps volumes)
web-ftp-client uninstall  # docker compose down -v (drops volumes)
web-ftp-client logs       # Follow container logs
web-ftp-client status     # docker compose ps
```

## Uninstall

```bash
sudo systemctl disable --now web-ftp-client.service
sudo web-ftp-client uninstall
sudo zpkg remove web-ftp-client
# Optional: remove data
sudo rm -rf /DATA/AppData/web-ftp-client
```

## Troubleshooting

**Dashboard tile shows "Service not reachable on port 8089"** — The compose
stack isn't running. `sudo web-ftp-client install` or
`sudo systemctl restart web-ftp-client`.

**`mkdir /root/.docker: read-only file system`** — Should not happen via the
zpkg CLI (it pre-sets `DOCKER_CONFIG=/DATA/.docker`). If you see this, you
ran raw `docker compose` somewhere — use the CLI wrapper instead.

**Chrome: `Unsafe attempt to load URL ... from frame with URL chrome-error://`** —
The iframe tried to navigate to a service that was down. Start the stack,
then reload the dashboard tile. The tile's JavaScript probes port 8089
before navigating and will show the start command if unreachable.
