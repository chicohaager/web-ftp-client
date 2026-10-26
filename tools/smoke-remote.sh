#!/bin/bash
# shellcheck disable=SC2015  # ok/bad never fail, so A && ok || bad is safe
# End-to-end smoke test of the remote side against real servers: a throwaway FTP server and SFTP server in Docker,
# the built backend (pnpm run build first), then per protocol connect -> upload -> list -> download (same sha256)
# -> delete, and the /ws socket must report the transfers. Test account values are made up; nothing leaves this host.
#   bash tools/smoke-remote.sh       exit 0 = all passed
set -u
cd "$(dirname "$0")/.." || exit 2
F=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; F=$((F + 1)); }
T=$(mktemp -d) || exit 2
P=3999
FTP=wfc-smoke-ftp
SFTP=wfc-smoke-sftp
# shellcheck disable=SC2329  # called by the EXIT trap
cleanup() {
  [ -n "${BPID:-}" ] && kill "$BPID" 2> /dev/null
  [ -n "${WPID:-}" ] && kill "$WPID" 2> /dev/null
  docker rm -f "$FTP" "$SFTP" > /dev/null 2>&1
  rm -rf "$T"
}
trap cleanup EXIT
! nc -z 127.0.0.1 "$P" 2> /dev/null || { echo "port $P is already in use - stop that process first"; exit 2; }
[ -f packages/backend/dist/index.js ] || { echo "packages/backend/dist/index.js missing - run pnpm run build"; exit 2; }

docker run -d --name "$FTP" -p 127.0.0.1:2121:21 -p 127.0.0.1:21000-21010:21000-21010 \
  -e USERS="smoke|smoke-pass-1|/srv/ftp" -e ADDRESS=127.0.0.1 -e MIN_PORT=21000 -e MAX_PORT=21010 \
  delfer/alpine-ftp-server:latest > /dev/null || { echo "FTP server did not start"; exit 2; }
docker run -d --name "$SFTP" -p 127.0.0.1:2222:22 atmoz/sftp:alpine "smoke:smoke-pass-1:::upload" > /dev/null \
  || { echo "SFTP server did not start"; exit 2; }

mkdir -p "$T/data/up" "$T/data/down" "$T/app"
head -c 300000 /dev/urandom > "$T/data/up/smoke.bin"
WANT=$(sha256sum < "$T/data/up/smoke.bin" | cut -c1-64)
PORT=$P DATA_DIR="$T/data" APP_DATA="$T/app" node packages/backend/dist/index.js > "$T/backend.log" 2>&1 &
BPID=$!
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$P/" && break; sleep 0.2; done
kill -0 "$BPID" 2> /dev/null || { echo "backend did not start:"; cat "$T/backend.log"; exit 2; }
for _ in $(seq 1 50); do nc -z 127.0.0.1 2121 && nc -z 127.0.0.1 2222 && break; sleep 0.2; done
sleep 2

# the socket: every message the server pushes goes into a file
node -e '
const WebSocket = require(require.resolve("ws", { paths: ["packages/backend"] }));
const fs = require("fs");
const ws = new WebSocket("ws://127.0.0.1:" + process.argv[1] + "/ws");
ws.on("message", m => fs.appendFileSync(process.argv[2], m.toString() + "\n"));
ws.on("error", e => fs.appendFileSync(process.argv[2], "ERROR " + e.message + "\n"));
' "$P" "$T/ws.log" &
WPID=$!

api() { # <method> <path> [json] [session]
  curl -s -X "$1" "http://127.0.0.1:$P/api$2" -H 'Content-Type: application/json' ${4:+-H "x-session-id: $4"} ${3:+-d "$3"}
}
field() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }
wait_done() { # <session> <name> <direction>
  for _ in $(seq 1 100); do
    s=$(api GET /remote/transfers | python3 -c "
import json,sys; d=json.load(sys.stdin)['data']
m=[t for t in d if t.get('fileName')==sys.argv[1] and t.get('direction')==sys.argv[2]]
print(m[-1]['status'] if m else '')" "$2" "$3")
    case "$s" in completed|failed|error) echo "$s"; return ;; esac
    sleep 0.2
  done
  echo timeout
}

for proto in ftp sftp; do
  port=2121; [ "$proto" = sftp ] && port=2222
  rdir=/srv/ftp; [ "$proto" = sftp ] && rdir=/upload   # the FTP server does not chroot: "/" is its real root
  r=$(api POST /remote/connect "{\"host\":\"127.0.0.1\",\"port\":$port,\"protocol\":\"$proto\",\"username\":\"smoke\",\"password\":\"smoke-pass-1\"}")
  sid=$(echo "$r" | field "d['data']['sessionId'] if d.get('ok') else ''" 2> /dev/null)
  if [ -n "$sid" ]; then ok "$proto: connect"; else bad "$proto: connect: $r"; continue; fi
  api POST /remote/upload "{\"localPath\":\"/up\",\"remotePath\":\"$rdir\",\"files\":[\"smoke.bin\"]}" "$sid" > /dev/null
  st=$(wait_done "$sid" smoke.bin upload)
  [ "$st" = completed ] && ok "$proto: upload" || bad "$proto: upload ended '$st'"
  size=$(api GET "/remote/list?path=$rdir" "" "$sid" | field "[f['size'] for f in d['data']['files'] if f['name']=='smoke.bin']")
  [ "$size" = "[300000]" ] && ok "$proto: list shows 300000 bytes" || bad "$proto: list size $size"
  rm -f "$T/data/down/smoke.bin"
  api POST /remote/download "{\"localPath\":\"/down\",\"remotePath\":\"$rdir\",\"files\":[\"smoke.bin\"]}" "$sid" > /dev/null
  st=$(wait_done "$sid" smoke.bin download)
  got=$(sha256sum < "$T/data/down/smoke.bin" 2> /dev/null | cut -c1-64)
  [ "$st" = completed ] && [ "$got" = "$WANT" ] && ok "$proto: download, same sha256" || bad "$proto: download '$st', sha256 ${got:0:12} vs ${WANT:0:12}"
  api DELETE /remote/delete "{\"path\":\"$rdir\",\"names\":[\"smoke.bin\"],\"types\":[\"file\"]}" "$sid" > "$T/del.json"
  n=$(api GET "/remote/list?path=$rdir" "" "$sid" | field "len([f for f in d['data']['files'] if f['name']=='smoke.bin'])")
  [ "$n" = 0 ] && [ "$(field "d.get('ok')" < "$T/del.json")" = True ] && ok "$proto: delete" || bad "$proto: delete: $(cat "$T/del.json")"
  api POST /remote/disconnect "{}" "$sid" > /dev/null
done
c=$(grep -c . "$T/ws.log" 2> /dev/null || echo 0)
if [ "$c" -gt 0 ] && ! grep -q '^ERROR' "$T/ws.log"; then ok "/ws pushed $c transfer messages"; else bad "/ws: $(head -3 "$T/ws.log" 2> /dev/null)"; fi
kill -TERM "$BPID"
for _ in $(seq 1 15); do kill -0 "$BPID" 2> /dev/null || break; sleep 0.2; done
if kill -0 "$BPID" 2> /dev/null; then bad "backend still runs 3 s after SIGTERM"; kill -9 "$BPID"; else ok "backend exits on SIGTERM"; fi
BPID=
[ "$F" = 0 ] && echo "✓ remote smoke: all checks passed" || { echo "✗ remote smoke: $F failed"; tail -20 "$T/backend.log"; }
exit "$F"
