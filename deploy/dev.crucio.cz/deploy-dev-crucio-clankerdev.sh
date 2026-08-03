#!/usr/bin/env bash
set -euo pipefail

src="${1:-/srv/clankerdev-deploy/repo}"
dst="/var/www/dev.crucio.cz/current"
nginx_conf_src="deploy/dev.crucio.cz/nginx-dev.crucio.cz.conf"
nginx_conf_dst="/etc/nginx/sites-available/dev.crucio.cz"

if [[ ! -d "$src/.git" ]]; then
  echo "Source is not a git checkout: $src" >&2
  exit 2
fi

if [[ "$dst" != /var/www/dev.crucio.cz/current ]]; then
  echo "Refusing unexpected destination: $dst" >&2
  exit 2
fi

cd "$src"

npm ci
npm run build

if [[ -f bff/package-lock.json ]]; then
  npm --prefix bff ci --omit=dev
else
  npm --prefix bff install --omit=dev
fi

install -d -m 0755 "$dst"
rsync -a --delete dist/ "$dst"/

if [[ -f "$nginx_conf_src" ]]; then
  install -m 0644 "$nginx_conf_src" "$nginx_conf_dst"
  ln -sfn "$nginx_conf_dst" /etc/nginx/sites-enabled/dev.crucio.cz
  nginx -t
  systemctl reload nginx
fi

systemctl daemon-reload
systemctl restart webui-next-bff.service

echo "Checking public authentication endpoints..."
bash deploy/smoke-auth-endpoints.sh https://dev.crucio.cz --insecure
