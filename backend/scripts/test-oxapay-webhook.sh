#!/usr/bin/env bash
set -euo pipefail

if [ -z "${OXAPAY_MERCHANT_KEY:-}" ]; then
  echo "Missing OXAPAY_MERCHANT_KEY env var" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:8080}"

BODY='{"status":"expired","trackId":"test_track_123"}'

SIG="$(python3 - <<'PY'
import hmac, hashlib, os
body = os.environ["BODY"].encode()
key = os.environ["OXAPAY_MERCHANT_KEY"].encode()
print(hmac.new(key, body, hashlib.sha512).hexdigest())
PY
)"

curl -sS -i -X POST "${BASE_URL}/v1/payments/webhook/oxapay" \
  -H "Content-Type: application/json" \
  -H "HMAC: ${SIG}" \
  -d "${BODY}"
