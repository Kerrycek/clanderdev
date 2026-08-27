#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-}"
tls_mode="${2:-}"

if [[ -z "$base_url" ]]; then
  echo "Usage: $0 https://example.test [--insecure]" >&2
  exit 2
fi

base_url="${base_url%/}"
curl_args=(--silent --show-error --max-time 20)
health_attempts="${AUTH_SMOKE_HEALTH_ATTEMPTS:-20}"
health_delay="${AUTH_SMOKE_HEALTH_DELAY_SECONDS:-1}"

if ! [[ "$health_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "AUTH_SMOKE_HEALTH_ATTEMPTS must be a positive integer." >&2
  exit 2
fi

if ! [[ "$health_delay" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "AUTH_SMOKE_HEALTH_DELAY_SECONDS must be a non-negative number." >&2
  exit 2
fi

if [[ "$tls_mode" == "--insecure" ]]; then
  curl_args+=(--insecure)
elif [[ -n "$tls_mode" ]]; then
  echo "Unknown option: $tls_mode" >&2
  exit 2
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

request() {
  local path="$1"
  local body_file="$2"
  local headers_file="$3"
  shift 3

  curl "${curl_args[@]}" \
    --dump-header "$headers_file" \
    --output "$body_file" \
    --write-out '%{http_code}' \
    "$@" \
    "${base_url}${path}"
}

health_status="000"
health_ready=false

for ((attempt = 1; attempt <= health_attempts; attempt += 1)); do
  if health_status="$(request "/healthz" "$tmp_dir/health.body" \
      "$tmp_dir/health.headers" \
      --connect-timeout 1 \
      --max-time 2)" && \
      [[ "$health_status" == "200" ]] && \
      [[ "$(cat "$tmp_dir/health.body")" == "ok" ]]; then
    health_ready=true
    break
  fi

  if ((attempt < health_attempts)); then
    sleep "$health_delay"
  fi
done

if [[ "$health_ready" != true ]]; then
  echo "Auth smoke failed: /healthz is not healthy (HTTP $health_status)." >&2
  exit 1
fi

session_status="$(request "/session.json" "$tmp_dir/session.body" \
  "$tmp_dir/session.headers" \
  --header 'Sec-Fetch-Site: same-origin' \
  --header "Referer: ${base_url}/")"

session_content_type="$(awk '
  tolower($1) == "content-type:" {
    sub(/^[^:]+:[[:space:]]*/, "")
    sub(/\r$/, "")
    value = $0
  }
  END { print value }
' "$tmp_dir/session.headers")"

if [[ "$session_status" != "200" ]] || \
   [[ "$session_content_type" != application/json* ]]; then
  echo "Auth smoke failed: /session.json returned HTTP $session_status" \
    "with Content-Type '$session_content_type' instead of JSON." >&2
  exit 1
fi

python3 - "$tmp_dir/session.body" <<'PY'
import json
import sys

path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
except (OSError, json.JSONDecodeError) as exc:
    raise SystemExit(f"Auth smoke failed: invalid session JSON: {exc}")

if not isinstance(payload, dict):
    raise SystemExit("Auth smoke failed: session response is not an object")

missing = {"accessToken", "sessionExpiresAt"} - payload.keys()
if missing:
    names = ", ".join(sorted(missing))
    raise SystemExit(f"Auth smoke failed: session JSON misses: {names}")
PY

login_status="$(request "/oauth/login" "$tmp_dir/login.body" \
  "$tmp_dir/login.headers")"
login_location="$(awk '
  tolower($1) == "location:" {
    sub(/^[^:]+:[[:space:]]*/, "")
    sub(/\r$/, "")
    value = $0
  }
  END { print value }
' "$tmp_dir/login.headers")"

if [[ "$login_status" != "302" && "$login_status" != "303" ]] || \
   [[ -z "$login_location" ]]; then
  echo "Auth smoke failed: /oauth/login did not return a redirect" \
    "(HTTP $login_status)." >&2
  exit 1
fi

echo "Auth endpoints OK: ${base_url}"
