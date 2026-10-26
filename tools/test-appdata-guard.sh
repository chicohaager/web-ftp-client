#!/bin/sh
# shellcheck disable=SC2016  # the grep patterns are literal lines of the CLI and the packaging script, variables unexpanded
# Checks for the folder check (lintux-modkit appdata-guard.sh, ZIMAOS-KNOWLEDGE §79.11): /DATA/AppData is 0777
# without the sticky bit on ZimaOS 1.8, and the CLI runs `docker compose up --build` as root. Root must build only
# from the read-only module image, never from /DATA/AppData/web-ftp-client (the container's data volume, owned by
# the container user), and must check that folder before dockerd mounts it.
#   sh tools/test-appdata-guard.sh      exit 0 = all passed
set -u
cd "$(dirname "$0")/.." || exit 2
F=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; F=$((F + 1)); }
C=zpkg/web-ftp-client-cli.sh

# 1 root never reads from APP_DIR: every compose call goes through compose() with the image's compose file
if grep -q '^  docker compose -f "${COMPOSE}" --project-directory "${SRC_DIR}" "$@"$' "$C" && grep -q '^COMPOSE="${SRC_DIR}/docker-compose.yml"$' "$C"; then ok "compose runs from the module image (SRC_DIR)"; else bad "compose() does not use the image's compose file"; fi
n=$(grep -cE 'cd "\$\{APP_DIR\}"|\$\{APP_DIR\}/(docker-compose|Dockerfile|\.env)' "$C")
if [ "$n" = 0 ]; then ok "nothing in the CLI reads compose, Dockerfile or .env from APP_DIR"; else bad "$n line(s) use APP_DIR as source"; fi
n=$(grep -cE '^ *docker compose' "$C")
if [ "$n" = 1 ]; then ok "exactly one docker compose call (inside compose())"; else bad "$n docker compose calls — one bypasses compose()"; fi
# the guard runs for every command that lets dockerd mount APP_DIR, before it
if grep -q '^  install|up|start|restart) prepare_data ;;$' "$C"; then ok "prepare_data runs for install|up|start|restart"; else bad "prepare_data not called for the commands that start the container"; fi
if grep -q 'APPDATA_GUARD_UID="${DATA_UID}" APPDATA_GUARD_PATH_UID=0 /bin/sh "${GUARD}" --no-create "${APP_DIR}"' "$C"; then ok "guard trusts the container user for the folder, root for the path"; else bad "guard call in prepare_data"; fi
# 2 the image carries the guard where the CLI looks for it
# shellcheck disable=SC2016  # the literal line of the packaging script, variables unexpanded
if grep -q 'sysext/appdata-guard.sh" "${RAW_DIR}/usr/libexec/${NAME}/appdata-guard.sh"' scripts/package-zpkg.sh; then ok "package-zpkg.sh puts the guard into the image"; else bad "package-zpkg.sh does not install sysext/appdata-guard.sh"; fi
if grep -q '^GUARD="/usr/libexec/${APP_NAME}/appdata-guard.sh"$' "$C"; then ok "CLI looks for it in /usr/libexec/web-ftp-client"; else bad "CLI GUARD path"; fi
# 3 the copy is lintux-modkit's
M=../lintux-modkit/sysext/appdata-guard.sh
if [ ! -f sysext/appdata-guard.sh ]; then bad "sysext/appdata-guard.sh missing"
elif [ ! -f "$M" ]; then ok "guard copy present (lintux-modkit not next to the repo, not compared)"
elif cmp -s "$M" sysext/appdata-guard.sh; then ok "sysext/appdata-guard.sh is lintux-modkit's"
else bad "sysext/appdata-guard.sh differs from $M — copy it again"; fi
# 4 the guard itself refuses a symlink and a foreign folder, and accepts a proper one (as this user, test uids)
T=$(mktemp -d) || exit 2
trap 'rm -rf "$T"' EXIT
U=$(id -u)
mkdir -m 755 "$T/AppData" && mkdir -m 700 "$T/AppData/web-ftp-client" "$T/real"
g() { APPDATA_GUARD_UID=$U APPDATA_GUARD_PATH_UID=$U sh sysext/appdata-guard.sh "$1" 2>&1; }
if g "$T/AppData/web-ftp-client" > /dev/null; then ok "accepts a folder of its owner"; else bad "refuses a proper folder: $(g "$T/AppData/web-ftp-client")"; fi
mv "$T/AppData/web-ftp-client" "$T/moved" && ln -s "$T/real" "$T/AppData/web-ftp-client"
if g "$T/AppData/web-ftp-client" | grep -q 'ist ein Symlink'; then ok "refuses a symlink in place of the folder"; else bad "symlink not refused"; fi
rm "$T/AppData/web-ftp-client" && mkdir -m 700 "$T/AppData/web-ftp-client"
if APPDATA_GUARD_UID=4242 APPDATA_GUARD_PATH_UID=$U sh sysext/appdata-guard.sh "$T/AppData/web-ftp-client" 2>&1 | grep -q 'nicht root - verweigert'; then ok "refuses a folder of someone else"; else bad "foreign folder not refused"; fi
# 5 the CLI itself, in a test folder: docker and chown are stand-ins that log their call
mkdir -p "$T/bin" "$T/img" "$T/libexec" && cp sysext/appdata-guard.sh "$T/libexec/"
printf '#!/bin/sh\necho "docker $PWD $*" >> "%s/log"\n' "$T" > "$T/bin/docker"
printf '#!/bin/sh\necho "chown $*" >> "%s/log"\n' "$T" > "$T/bin/chown"
chmod +x "$T/bin/docker" "$T/bin/chown"
rm -rf "$T/AppData" && mkdir "$T/AppData" && chmod 777 "$T/AppData"   # as on ZimaOS 1.8: 0777, no sticky bit
sed -e "s|^APP_DIR=.*|APP_DIR=\"$T/AppData/web-ftp-client\"|" -e "s|^SRC_DIR=.*|SRC_DIR=\"$T/img\"|" \
    -e "s|^GUARD=.*|GUARD=\"$T/libexec/appdata-guard.sh\"|" -e "s|^DATA_UID=.*|DATA_UID=$U|" \
    -e "s|APPDATA_GUARD_PATH_UID=0|APPDATA_GUARD_PATH_UID=$U|" \
    -e "s|\"\$(stat -c %u \"\${parent}\")\" = 0|\"\$(stat -c %u \"\${parent}\")\" = $U|" "$C" > "$T/cli"
[ "$(grep -c "$T" "$T/cli")" = 3 ] && [ "$(grep -c "= $U ]; then" "$T/cli")" = 1 ] || bad "test copy of the CLI: path substitution did not apply"
cli() { : > "$T/log"; PATH="$T/bin:$PATH" bash "$T/cli" "$@" > "$T/out" 2>&1; }
D="$T/AppData/web-ftp-client"
if cli install && [ -d "$D" ] && [ "$(stat -c %a "$D")" = 700 ] && grep -q "^chown -h $U:$U $D$" "$T/log" && [ "$(stat -c %a "$T/AppData")" = 1777 ]; then ok "fresh install creates the data folder 700 for the container user"; else bad "fresh install: $(cat "$T/out" "$T/log")"; fi
if grep -q "^docker .* compose -f $T/img/docker-compose.yml --project-directory $T/img up -d --build$" "$T/log"; then ok "install builds from the image folder"; else bad "install compose call: $(cat "$T/log")"; fi
chmod 775 "$D"
if cli start && [ "$(stat -c %a "$D")" = 700 ] && grep -q "compose -f $T/img/docker-compose.yml.* start$" "$T/log"; then ok "a v0.1.0 folder (775) is tightened to 700 and used"; else bad "775 folder: $(stat -c %a "$D") $(cat "$T/out")"; fi
mv "$D" "$T/old" && ln -s "$T/real" "$D"
if ! cli start && grep -q 'ist ein Symlink' "$T/out" && ! grep -q '^docker' "$T/log"; then ok "a symlink in place of the folder stops start before docker runs"; else bad "symlink: $(cat "$T/out" "$T/log")"; fi
if cli status && grep -q "compose -f $T/img/docker-compose.yml.* ps$" "$T/log"; then ok "status needs no data folder check"; else bad "status: $(cat "$T/out")"; fi
[ "$F" = 0 ] && echo "✓ appdata guard: all checks passed" || echo "✗ appdata guard: $F failed"
exit "$F"
