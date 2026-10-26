#!/bin/bash
# Everything that must pass before a commit, a PR or an image build:
# type-check, build, dependency audit, folder check, passive FTP, sign-in, HTTPS, real FTP/SFTP servers, browser.
# Needs Docker (test servers) and Python Playwright (browser test).
#   bash scripts/check.sh        exit 0 = all passed
set -u
cd "$(dirname "$0")/.." || exit 2
failed=()
step() { # <name> <command...>
  local name=$1; shift
  echo "── $name"
  if "$@"; then echo "   ✓ $name"; else echo "   ✗ $name"; failed+=("$name"); fi
}
step type-check pnpm run type-check
step build pnpm run build
step "audit (all dependencies)" pnpm audit
step "folder check" sh tools/test-appdata-guard.sh
step "passive FTP behind NAT" node tools/test-ftp-passive.mjs
step "sign-in" node tools/test-auth.mjs
step "HTTPS" node tools/test-tls.mjs
step "real FTP/SFTP servers" bash tools/smoke-remote.sh
step "browser sign-in" python3 tools/e2e-signin.py
if [ ${#failed[@]} -eq 0 ]; then echo "✓ check: all steps passed"; exit 0; fi
echo "✗ check: ${#failed[@]} step(s) failed: ${failed[*]}"
exit 1
