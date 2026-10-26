#!/bin/sh
# shellcheck disable=SC2016  # the grep patterns are literal lines of the CLI and the packaging script, variables unexpanded
# Checks for the folder check (lintux-modkit appdata-guard.sh, ZIMAOS-KNOWLEDGE §79.11): /DATA/AppData is 0777
# without the sticky bit on ZimaOS 1.8, and the CLI runs `docker compose up --build` as root in
# /DATA/AppData/web-ftp-client — so it has to check that folder before it touches it.
#   sh tools/test-appdata-guard.sh      exit 0 = all passed
set -u
cd "$(dirname "$0")/.." || exit 2
F=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; F=$((F + 1)); }
C=zpkg/web-ftp-client-cli.sh

# 1 the CLI calls the guard for every command that touches APP_DIR, before the command runs
if grep -q '^  /bin/sh "${GUARD}" "${APP_DIR}" ||' "$C"; then ok "guard() runs appdata-guard.sh on APP_DIR"; else bad "guard() does not run the guard on APP_DIR"; fi
gl=$(grep -n '^  install|up|start|stop|restart|down|uninstall|logs|status) guard ;;$' "$C" | cut -d: -f1)
cl=$(grep -n '^case "${1:-help}" in$' "$C" | head -1 | cut -d: -f1)          # executed part starts at the first case
fl=$(awk -v c="${cl:-0}" 'NR > c && /cd "\$\{APP_DIR\}"|^    ensure_installed$/ { print NR; exit }' "$C")
if [ -n "$gl" ] && [ -n "$fl" ] && [ "$gl" -lt "$fl" ]; then ok "the guard runs before the first use of APP_DIR (line $gl < $fl)"; else bad "guard line '$gl' not before the first use of APP_DIR '$fl'"; fi
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
[ "$F" = 0 ] && echo "✓ appdata guard: all checks passed" || echo "✗ appdata guard: $F failed"
exit "$F"
