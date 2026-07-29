# Deploying WebUI Next (tarball) to clankerdev.vpsfree.cz

This directory contains a deployment script for **Ubuntu 24.04 LTS**.

It deploys a **static SPA at `/`** plus a tiny **OAuth BFF** bound to `127.0.0.1`.

## What it does

- installs nginx + build deps
- installs a supported Node.js (22+) via NodeSource if needed
- unpacks a tarball into `/opt/webui-next/releases/<timestamp>`
- patches `package-lock.json` to use `https://registry.npmjs.org/...` (not an internal mirror)
- builds the SPA (`npm ci && npm run build`) and rsyncs `dist/` to `/var/www/clankerdev.vpsfree.cz/current`
- installs and runs the OAuth BFF via systemd (`webui-next-bff`)
- configures nginx:
  - serves the SPA with history fallback
  - proxies `/config.js`, `/session.json`, and `/oauth/*` to the BFF
- obtains Let's Encrypt certificate when DNS is ready and reloads nginx on renew

## Quick start

1) Upload the tarball to the VPS:

```bash
scp vpsadmin_ui_next_*.tar.gz root@clankerdev.vpsfree.cz:/root/webui-next.tar.gz
```

2) Run the deployment script as root:

```bash
bash /opt/webui-next/current-release/vpsadmin/webui-next/deploy/deploy-clankerdev-ubuntu24.sh \
  /root/webui-next.tar.gz you@example.com
```

3) DNS (must resolve publicly for Let's Encrypt HTTP-01):

- `A clankerdev.vpsfree.cz -> 37.205.15.4`
- `AAAA clankerdev.vpsfree.cz -> 2a03:3b40:fe:438::1`

If you publish AAAA, make sure IPv6 80/443 works.

## Certbot note

The script tries to use **snap** for certbot when available. If snap isn't usable, it falls back to `apt-get install certbot`.

## OAuth/BFF config

The script writes `/etc/webui-next/oauth.env` (root-only) with:

- `OAUTH_CLIENT_ID` (for clankerdev: `clankerdev.vpsfree.cz`)
- `OAUTH_CLIENT_SECRET` (prompted)
- `OAUTH_REDIRECT_URI` (must match client registration)
- `SESSION_SECRET`
- `HAVEAPI_AUTH_HEADER` (defaults to `X-HaveAPI-OAuth2-Token`)

The secret is **not** embedded in the frontend build.
