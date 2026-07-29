# clankerdev.vpsfree.cz – Deployment notes (Ubuntu 24.04)

This deployment serves WebUI Next at the **origin root**:

- `https://clankerdev.vpsfree.cz/`

## Components

- **Static SPA (nginx)** served from `/var/www/clankerdev.vpsfree.cz/current`
- **OAuth BFF** (`webui-next/bff/server.js`) bound to `127.0.0.1:3001` behind nginx
  - endpoints: `/config.js`, `/session.json`, `/oauth/login`, `/oauth/callback`, `/oauth/logout`

The BFF only handles OAuth. It does **not** proxy HaveAPI.

## Why BFF exists

The OAuth2 `authorization_code` token exchange for this deployment uses a **client secret**. A static SPA cannot keep secrets, so the BFF exchanges the code for tokens server-side. Public runtime settings are served by `/config.js`; the current access token is returned only by the non-executable, same-origin `/session.json` endpoint.

## OAuth client settings

- client_id: `clankerdev.vpsfree.cz`
- redirect URI: `https://clankerdev.vpsfree.cz/oauth/callback`

## HaveAPI auth header

Browser calls to HaveAPI must use:

- `X-HaveAPI-OAuth2-Token`

The BFF injects this into the SPA via `/config.js` as:

- `window.vpsAdmin.webuiNext.haveApi.authHeader`

## Node.js version

Ubuntu 24.04 ships Node 18 by default, but this project requires Node 22+ (Vite 7 toolchain). The deployment script installs Node 22 via NodeSource.

## Let's Encrypt

The deployment script uses **certbot via apt** (snap was unusable on the first deployment).

Validation is HTTP-01, so port **80** must be reachable publicly.

If you publish an AAAA record, make sure IPv6 80/443 works too.

## One-command deployment (tarball)

Use the script shipped with the repo:

```bash
bash /opt/webui-next/current-release/vpsadmin/webui-next/deploy/deploy-clankerdev-ubuntu24.sh \
  /root/webui-next.tar.gz you@example.com
```

It will:

- build the SPA
- install and start the BFF (systemd: `webui-next-bff`)
- configure nginx
- issue/renew certificates when DNS is ready

## Operational history

See `docs/clankerdev/FIXES.md`.
