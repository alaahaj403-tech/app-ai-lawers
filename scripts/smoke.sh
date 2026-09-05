#!/usr/bin/env bash
# Post-deploy smoke test. Fails fast on the first broken gate.
#   scripts/smoke.sh https://api.voxeli.app https://app.voxeli.app
set -euo pipefail
API="${1:?api base url}"; WEB="${2:-}"
step() { printf '%-28s' "$1"; }
ok() { echo "ok"; }

step "api /health"; curl -fsS --max-time 10 "$API/health" | grep -q '"status":"ok"' && ok
step "api /ready (db + provider)"; READY=$(curl -fsS --max-time 10 "$API/ready"); echo "$READY" | grep -q '"database":"ok"' && ok
step "ai provider is not mock"; echo "$READY" | grep -q '"aiProvider":"openai"' && ok || { echo "FAIL: production must not run the mock provider"; exit 1; }
step "auth rejects anonymous"; [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API/v1/auth/me")" = "401" ] && ok
step "flags are public"; curl -fsS --max-time 10 "$API/v1/flags" | grep -q '"flags"' && ok
step "security headers"; curl -fsSI --max-time 10 "$API/health" | grep -qi "x-content-type-options: nosniff" && ok
if [ -n "$WEB" ]; then
  step "web renders"; curl -fsS --max-time 15 "$WEB/" | grep -q "Voxeli" && ok
  step "web bff blocks cross-site"; [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'origin: https://evil.example' "$WEB/api/bff/v1/translate")" = "403" ] && ok
fi
echo "smoke: all gates passed"
