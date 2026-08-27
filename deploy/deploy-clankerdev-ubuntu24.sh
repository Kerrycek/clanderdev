#!/usr/bin/env bash
set -euo pipefail

# WebUI Next deployment (frontend + OAuth BFF)
# Target: Ubuntu 24.04 LTS
# Host: https://clankerdev.vpsfree.cz/

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

DOMAIN="clankerdev.vpsfree.cz"
EXPECTED_IPV4="37.205.15.4"
EXPECTED_IPV6="2a03:3b40:fe:438::1"
DNS_RESOLVER="1.1.1.1"

TARBALL="${1:-/root/webui-next.tar.gz}"
EMAIL="${2:-}"  # optional

BASE_DIR="/opt/webui-next"
RELEASES_DIR="${BASE_DIR}/releases"
CURRENT_RELEASE_LINK="${BASE_DIR}/current-release"

WEBROOT="/var/www/${DOMAIN}/current"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}.conf"
NGINX_GZIP_CONF="/etc/nginx/conf.d/webui-next-gzip.conf"

BFF_USER="webui-bff"
BFF_GROUP="webui-bff"
BFF_PORT="3001"
BFF_STATE_DIR="/var/lib/webui-next-bff"
BFF_SESSIONS_DIR="${BFF_STATE_DIR}/sessions"

ENV_DIR="/etc/webui-next"
ENV_FILE="${ENV_DIR}/oauth.env"

# vpsFree SSO
OAUTH_AUTHORIZE_URL="https://auth.vpsfree.cz/_auth/oauth2/authorize"
OAUTH_TOKEN_URL="https://auth.vpsfree.cz/_auth/oauth2/token"
OAUTH_REVOKE_URL="https://auth.vpsfree.cz/_auth/oauth2/revoke"
OAUTH_CLIENT_ID="${DOMAIN}"
OAUTH_REDIRECT_URI="https://${DOMAIN}/oauth/callback"
OAUTH_SCOPE="all"
OAUTH_TYPE="web_server"

# HaveAPI
API_URL="https://api.vpsfree.cz"
API_VERSION="7.0"
HAVEAPI_AUTH_HEADER_DEFAULT="X-HaveAPI-OAuth2-Token"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if [[ ! -f "${TARBALL}" ]]; then
  echo "Tarball not found: ${TARBALL}" >&2
  echo "Usage: $0 /path/to/webui-next.tar.gz [email]" >&2
  exit 1
fi

node_version_ok() {
  # Vite 7 toolchain: Node 20.19+ or 22.12+ (or >=24)
  local ver="$1" major minor patch
  IFS='.' read -r major minor patch <<<"${ver}"
  patch="${patch%%[^0-9]*}"
  [[ -n "${major:-}" && -n "${minor:-}" && -n "${patch:-}" ]] || return 1

  if (( major == 20 )); then
    (( minor >= 19 )) && return 0
    return 1
  fi
  if (( major == 22 )); then
    (( minor >= 12 )) && return 0
    return 1
  fi
  if (( major >= 24 )); then
    return 0
  fi
  return 1
}

ensure_node() {
  local ver
  if command -v node >/dev/null 2>&1; then
    ver="$(node -p 'process.versions.node' 2>/dev/null || true)"
    if [[ -n "${ver}" ]] && node_version_ok "${ver}"; then
      echo "==> Node.js OK: v${ver} (npm $(npm -v))"
      return 0
    fi
    echo "==> Node.js too old (v${ver:-unknown}), installing Node 22.x..."
  else
    echo "==> Node.js not found, installing Node 22.x..."
  fi

  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  apt-get install -y nodejs
  echo "==> Node.js: $(node -v), npm: $(npm -v)"
}

patch_lockfile_to_public_npm() {
  local lockfile="$1"
  if [[ ! -f "${lockfile}" ]]; then return 0; fi

  # Replaces any internal mirror URLs (e.g. OpenAI artifactory) with public npm registry.
  python3 - <<PY
import re, pathlib
p = pathlib.Path("${lockfile}")
t = p.read_text()
t2 = re.sub(r"https://packages\.[^/]*openai\.org/artifactory/api/npm/npm-public/", "https://registry.npmjs.org/", t)
if t2 != t:
    p.write_text(t2)
    print("==> Patched package-lock.json resolved URLs to registry.npmjs.org")
PY
}

write_nginx_gzip_conf() {
  cat > "${NGINX_GZIP_CONF}" <<'NG'
# WebUI Next serves large hashed JavaScript chunks. The base nginx.conf keeps
# `gzip on`; this snippet expands compression to JS/CSS/JSON assets.
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_types
    text/plain
    text/css
    text/javascript
    application/javascript
    application/json
    application/xml
    application/xml+rss
    image/svg+xml;
NG
}

write_nginx_http_only() {
  cat > "${NGINX_CONF}" <<NG
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};

  root ${WEBROOT};
  index index.html;

  location ^~ /.well-known/acme-challenge/ {
    default_type "text/plain";
    allow all;
    try_files \$uri =404;
  }

  # BFF endpoints
  location = /config.js {
    proxy_pass http://127.0.0.1:${BFF_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    add_header Cache-Control "no-store, max-age=0" always;
    add_header Cross-Origin-Resource-Policy same-origin always;
    add_header X-Content-Type-Options nosniff always;
  }

  location = /session.json {
    proxy_pass http://127.0.0.1:${BFF_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    add_header Cache-Control "no-store, max-age=0" always;
    add_header Cross-Origin-Resource-Policy same-origin always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-wyf6w6jZL1nQnvQ3z5xyWt1FnxVZMXcEAzprShSzkQY='; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https:; form-action 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
  }

  location = /healthz {
    proxy_pass http://127.0.0.1:${BFF_PORT}/healthz;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location ^~ /oauth/ {
    proxy_pass http://127.0.0.1:${BFF_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  }

  location ^~ /assets/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
    try_files \$uri =404;
  }

  location = /index.html {
    add_header Cache-Control "no-cache";
  }

  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
NG
}

write_nginx_https() {
  cat > "${NGINX_CONF}" <<NG
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};

  root ${WEBROOT};

  location ^~ /.well-known/acme-challenge/ {
    default_type "text/plain";
    allow all;
    try_files \$uri =404;
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name ${DOMAIN};

  root ${WEBROOT};
  index index.html;

  ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options SAMEORIGIN always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-wyf6w6jZL1nQnvQ3z5xyWt1FnxVZMXcEAzprShSzkQY='; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https:; form-action 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;

  location ^~ /.well-known/acme-challenge/ {
    default_type "text/plain";
    allow all;
    try_files \$uri =404;
  }

  # BFF endpoints
  location = /config.js {
    proxy_pass http://127.0.0.1:${BFF_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    add_header Cache-Control "no-store, max-age=0" always;
    add_header Cross-Origin-Resource-Policy same-origin always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-wyf6w6jZL1nQnvQ3z5xyWt1FnxVZMXcEAzprShSzkQY='; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https:; form-action 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
  }

  location = /session.json {
    proxy_pass http://127.0.0.1:${BFF_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    add_header Cache-Control "no-store, max-age=0" always;
    add_header Cross-Origin-Resource-Policy same-origin always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-wyf6w6jZL1nQnvQ3z5xyWt1FnxVZMXcEAzprShSzkQY='; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https:; form-action 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
  }

  location = /healthz {
    proxy_pass http://127.0.0.1:${BFF_PORT}/healthz;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
  }

  location ^~ /oauth/ {
    proxy_pass http://127.0.0.1:${BFF_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  }

  location ^~ /assets/ {
    expires 30d;
    add_header Cache-Control "public, immutable" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-wyf6w6jZL1nQnvQ3z5xyWt1FnxVZMXcEAzprShSzkQY='; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https:; form-action 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
    try_files \$uri =404;
  }

  location = /index.html {
    add_header Cache-Control "no-cache" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-wyf6w6jZL1nQnvQ3z5xyWt1FnxVZMXcEAzprShSzkQY='; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https:; form-action 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
  }

  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
NG
}

obtain_cert_if_dns_ready() {
  local cert_dir="/etc/letsencrypt/live/${DOMAIN}"
  if [[ -d "${cert_dir}" && -f "${cert_dir}/fullchain.pem" ]]; then
    echo "==> Let's Encrypt certificate already present."
    return 0
  fi

  local A_RECS AAAA_RECS
  A_RECS="$(dig @${DNS_RESOLVER} +short A ${DOMAIN} | tr '\n' ' ')"
  AAAA_RECS="$(dig @${DNS_RESOLVER} +short AAAA ${DOMAIN} | tr '\n' ' ')"

  local dns_ok=1
  if [[ "${A_RECS}" != *"${EXPECTED_IPV4}"* ]]; then
    echo "!! A record mismatch (expected ${EXPECTED_IPV4}, got: ${A_RECS:-<none>})"
    dns_ok=0
  fi
  if [[ -n "${AAAA_RECS// }" ]]; then
    if [[ "${AAAA_RECS}" != *"${EXPECTED_IPV6}"* ]]; then
      echo "!! AAAA record mismatch (expected ${EXPECTED_IPV6}, got: ${AAAA_RECS})"
      dns_ok=0
    fi
  else
    echo "==> No public AAAA record seen yet (OK if you haven't set it)."
  fi

  if [[ ${dns_ok} -ne 1 ]]; then
    echo "==> DNS not ready for ${DOMAIN}. Skipping certificate issuance."
    return 1
  fi

  echo "==> Obtaining Let's Encrypt certificate (HTTP-01 via webroot)..."
  if [[ -z "${EMAIL}" ]]; then
    certbot certonly --webroot -w "${WEBROOT}" -d "${DOMAIN}" \
      --agree-tos --non-interactive --register-unsafely-without-email
  else
    certbot certonly --webroot -w "${WEBROOT}" -d "${DOMAIN}" -m "${EMAIL}" \
      --agree-tos --non-interactive
  fi

  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
systemctl reload nginx
SH
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  return 0
}

echo "==> Installing base packages (nginx, certbot, build tools)..."
apt-get update
apt-get install -y nginx certbot dnsutils rsync ca-certificates curl build-essential python3

ensure_node

echo "==> Creating release/webroot dirs..."
mkdir -p "${RELEASES_DIR}" "${WEBROOT}" "${WEBROOT}/.well-known/acme-challenge"

# BFF user
if ! id -u "${BFF_USER}" >/dev/null 2>&1; then
  groupadd --system "${BFF_GROUP}" || true
  useradd --system --no-create-home --gid "${BFF_GROUP}" --shell /usr/sbin/nologin "${BFF_USER}"
fi
mkdir -p "${BFF_SESSIONS_DIR}"
chown -R "${BFF_USER}:${BFF_GROUP}" "${BFF_STATE_DIR}"
chmod 0700 "${BFF_STATE_DIR}"
chmod 0700 "${BFF_SESSIONS_DIR}"

echo "==> Extracting tarball to a new release..."
TS="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="${RELEASES_DIR}/${TS}"
mkdir -p "${RELEASE_DIR}"
tar -xzf "${TARBALL}" -C "${RELEASE_DIR}"
ln -sfn "${RELEASE_DIR}" "${CURRENT_RELEASE_LINK}"

FRONTEND_DIR="${CURRENT_RELEASE_LINK}/vpsadmin/webui-next"
BFF_DIR="${FRONTEND_DIR}/bff"

if [[ ! -f "${FRONTEND_DIR}/package.json" ]]; then
  echo "ERROR: Could not find frontend at ${FRONTEND_DIR}" >&2
  exit 1
fi
if [[ ! -f "${BFF_DIR}/package.json" ]]; then
  echo "ERROR: Could not find BFF at ${BFF_DIR}" >&2
  exit 1
fi

# Build frontend (force public npm registry, IPv4-first)
echo "==> Building frontend..."
cd "${FRONTEND_DIR}"
patch_lockfile_to_public_npm "${FRONTEND_DIR}/package-lock.json"
export NODE_OPTIONS="--dns-result-order=ipv4first"
npm config set registry "https://registry.npmjs.org/"

npm ci --no-audit --no-fund --progress=false
npm run build

if [[ ! -d "${FRONTEND_DIR}/dist" ]]; then
  echo "ERROR: Frontend build did not produce dist/." >&2
  exit 1
fi

echo "==> Deploying dist/ to ${WEBROOT}..."
rsync -a --delete "${FRONTEND_DIR}/dist/" "${WEBROOT}/"
chown -R www-data:www-data "/var/www/${DOMAIN}"
find "/var/www/${DOMAIN}" -type d -exec chmod 2755 {} \;
find "/var/www/${DOMAIN}" -type f -exec chmod 0644 {} \;

# Build BFF deps
echo "==> Installing BFF dependencies..."
cd "${BFF_DIR}"
npm ci --no-audit --no-fund --progress=false

# Write BFF env file (root-only)
mkdir -p "${ENV_DIR}"
chmod 0700 "${ENV_DIR}"

EXISTING_CLIENT_SECRET=""
EXISTING_SESSION_SECRET=""
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}" || true
  EXISTING_CLIENT_SECRET="${OAUTH_CLIENT_SECRET:-}"
  EXISTING_SESSION_SECRET="${SESSION_SECRET:-}"
fi

CLIENT_SECRET="${OAUTH_CLIENT_SECRET:-${EXISTING_CLIENT_SECRET}}"
if [[ -z "${CLIENT_SECRET}" ]]; then
  echo
  echo "Enter OAuth client secret for client_id=${OAUTH_CLIENT_ID}"
  echo "(stored root-only in ${ENV_FILE})"
  read -r -s -p "Client secret: " CLIENT_SECRET
  echo
fi

SESSION_SECRET_VAL="${EXISTING_SESSION_SECRET}"
if [[ -z "${SESSION_SECRET_VAL}" ]]; then
  SESSION_SECRET_VAL="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
)"
fi

cat > "${ENV_FILE}" <<ENV
PORT=${BFF_PORT}
DOMAIN=${DOMAIN}

API_URL=${API_URL}
API_VERSION=${API_VERSION}

OAUTH_AUTHORIZE_URL=${OAUTH_AUTHORIZE_URL}
OAUTH_TOKEN_URL=${OAUTH_TOKEN_URL}
OAUTH_REVOKE_URL=${OAUTH_REVOKE_URL}

OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID}
OAUTH_CLIENT_SECRET=${CLIENT_SECRET}
OAUTH_REDIRECT_URI=${OAUTH_REDIRECT_URI}
OAUTH_SCOPE=${OAUTH_SCOPE}
OAUTH_TYPE=${OAUTH_TYPE}

SESSION_SECRET=${SESSION_SECRET_VAL}
SESSION_STORE_PATH=${BFF_SESSIONS_DIR}
SESSION_COOKIE_NAME=webui_next_sess

HAVEAPI_AUTH_HEADER=${HAVEAPI_AUTH_HEADER_DEFAULT}
ENV
chmod 0600 "${ENV_FILE}"

# Systemd unit for BFF
echo "==> Installing systemd unit for BFF..."
cat > /etc/systemd/system/webui-next-bff.service <<UNIT
[Unit]
Description=WebUI Next OAuth BFF
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${BFF_USER}
Group=${BFF_GROUP}
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${BFF_DIR}
ExecStart=/usr/bin/node ${BFF_DIR}/server.js
Restart=on-failure
RestartSec=2

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${BFF_STATE_DIR}

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now webui-next-bff

# Nginx
echo "==> Configuring nginx..."
write_nginx_gzip_conf
write_nginx_http_only
ln -sfn "${NGINX_CONF}" "/etc/nginx/sites-enabled/${DOMAIN}.conf"
rm -f /etc/nginx/sites-enabled/default || true
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# HTTPS
if obtain_cert_if_dns_ready; then
  write_nginx_https
  nginx -t
  systemctl reload nginx
fi

PUBLIC_URL="http://${DOMAIN}"
if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  PUBLIC_URL="https://${DOMAIN}"
fi

echo "==> Checking public authentication endpoints..."
bash "${SCRIPT_DIR}/smoke-auth-endpoints.sh" "${PUBLIC_URL}"

echo
echo "✅ Deployment complete."
echo "- Web:   http://${DOMAIN}/  (https if cert issued)"
echo "- BFF:   http://127.0.0.1:${BFF_PORT}/healthz"
echo "- Webroot: ${WEBROOT}"
echo "- Release: ${RELEASE_DIR}"
