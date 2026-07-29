# WebUI Next OAuth BFF

This is a **minimal backend-for-frontend** service used only for OAuth2:

- Starts OAuth login (`/oauth/login`)
- Handles OAuth callback & exchanges code for tokens (`/oauth/callback`)
- Stores access/refresh tokens in a server-side session (keeps `client_secret` secret)
- Exposes public runtime config from `/config.js`
- Exposes the current access token only as same-origin JSON from `/session.json`

It **does not proxy** HaveAPI calls. The SPA still calls `https://api.vpsfree.cz` directly.

## Why it exists

The OAuth2 token exchange for this deployment uses the **authorization code** grant with a
**client secret**. A static SPA cannot safely keep a secret, so we do the code→token exchange
server-side. The browser reads the **access token** from a non-executable,
same-origin JSON response; it is never embedded in `config.js`.

## HaveAPI auth header (important)

The deployed environment needs the SPA to use a specific auth header when calling HaveAPI:

- `X-HaveAPI-OAuth2-Token`

The BFF sets this via `/config.js` as:

- `window.vpsAdmin.webuiNext.haveApi.authHeader`

Without this, the SPA may attempt to use `Authorization`, which can be blocked by CORS preflight
depending on API configuration.

You can override the header name via:

- `HAVEAPI_AUTH_HEADER` (default: `X-HaveAPI-OAuth2-Token`)

## Required environment variables

The deployment script writes `/etc/webui-next/oauth.env` on the server.

Required:
- `OAUTH_CLIENT_ID`
- `OAUTH_CLIENT_SECRET`
- `OAUTH_REDIRECT_URI` (must match the OAuth client registration)
- `OAUTH_AUTHORIZE_URL`
- `OAUTH_TOKEN_URL`
- `SESSION_SECRET`

Optional:
- `API_URL` (default: `https://api.vpsfree.cz`)
- `API_VERSION` (default: `7.0`)
- `SESSION_STORE_PATH`
- `HAVEAPI_AUTH_HEADER`
- `HAVEAPI_META_NAMESPACE`

## Running locally

```bash
cd bff
npm ci
SESSION_SECRET=... OAUTH_CLIENT_ID=... OAUTH_CLIENT_SECRET=... \
  OAUTH_AUTHORIZE_URL=... OAUTH_TOKEN_URL=... \
  node server.js
```
