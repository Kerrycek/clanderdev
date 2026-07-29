# dev.crucio.cz deployment

`dev.crucio.cz` serves the static web UI from:

```sh
/var/www/dev.crucio.cz/current
```

`dev.crucio.cz` is hosted on the same private test machine as
`admin.crucio.cz` (`172.16.106.176`). Its nginx vhost mirrors the
`clankerdev.vpsfree.cz` layout: static assets are served by nginx, while
`/config.js`, `/session.json`, `/oauth/*`, and `/healthz` are served by the WebUI Next BFF on
`127.0.0.1:3001`.

Unlike the original production deployment, `dev.crucio.cz` keeps API and OAuth
traffic on the test stack. nginx proxies `/v7.0` and `/_auth` directly to the
same local API process used by `admin.crucio.cz`, on `127.0.0.1:9292`.

Deploy the source checkout to `dev.crucio.cz` with:

```sh
deploy-dev
```

`deploy-dev` updates `/srv/clankerdev-deploy/repo` from GitHub, installs
frontend and BFF dependencies, builds the SPA with `npm run build`, syncs
`dist/` to `/var/www/dev.crucio.cz/current`, and restarts the BFF service.

Deploy nginx and BFF units with:

```sh
rsync -az deploy/dev.crucio.cz/webui-next-bff.service \
  root@admin.crucio.cz:/etc/systemd/system/webui-next-bff.service

rsync -az deploy/dev.crucio.cz/nginx-dev.crucio.cz.conf \
  root@admin.crucio.cz:/etc/nginx/sites-available/dev.crucio.cz
```

The `/v7.0` proxy strips `WWW-Authenticate` from unauthenticated API responses.
The API still returns `401`, but browsers do not show a native Basic Auth prompt.

The BFF environment lives on the server in:

```sh
/etc/webui-next/oauth.env
```

Use `oauth.env.example` as the shape of that file. Do not commit the real OAuth
client secret or session secret.

The BFF code is served from the source checkout:

```sh
/srv/clankerdev-deploy/repo/bff
```

`dev.crucio.cz` currently uses the local Debian snakeoil certificate because
the hostname resolves to a private address. Replace it with a trusted internal
or DNS-validated certificate when one is available.

The test API on `admin.crucio.cz` also needs the patch in
`../admin.crucio.cz/vpsadmin-api-user-session-label.patch`. Without it, OAuth
session creation can fail with HTTP 500 when the upstream request does not carry
a user-agent label.

## Dev smoke data

Networking and lifecycle UI smoke tests need disposable test rows in the local
test API. The dev-only helper in `seed-networking-smoke-data.sh` prepares RFC
5737 route and host addresses through the API and is dry-run by default:

```sh
SMOKE_USER_ID=... SMOKE_ENVIRONMENT_ID=... \
  deploy/dev.crucio.cz/seed-networking-smoke-data.sh
```

Review the plan, then rerun with `--apply` against the local test API only. See
`networking-smoke-data.md` for the expected rows and smoke-test checklist.

DNS UI smoke tests need authoritative server metadata, zone assignments, and
disposable forward/reverse zones in the local test API. The dev-only helper in
`seed-dns-smoke-data.sh` is also dry-run by default:

```sh
SMOKE_USER_ID=... SMOKE_DNS_NODE_ID=... \
  deploy/dev.crucio.cz/seed-dns-smoke-data.sh
```

Review the plan, then rerun with `--apply` against the local test API only. See
`dns-smoke-data.md` for the expected DNS rows, nodectld/service dependency
notes, and DNS/PTR smoke-test checklist.

Storage, backup and dataset UI smoke tests need a nested vpsAdminOS storage
node with a live backup-capable pool. The dev-only helper in
`bootstrap-storage-lab-node.sh` prepares the QEMU node config, systemd service,
RabbitMQ node user and guarded local DB seed:

```sh
deploy/dev.crucio.cz/bootstrap-storage-lab-node.sh
```

Review the dry-run output, then rerun with `--apply` on `admin.crucio.cz` only.
See `storage-lab-node.md` for the expected node/pool rows, status commands and
UI smoke path.

Snapshot download URLs are served by nginx from `/var/lib/web/download`, but
the files live on the nested vpsAdminOS node pools. After changing storage
nodes or after a reboot, refresh the dev-only NFS mounts with:

```sh
deploy/dev.crucio.cz/mount-snapshot-downloads.sh
```

The helper mounts the known dev pools below `/var/lib/web/download/<node>/<pool>`
and checks the `_vpsadmin-download-healthcheck` file. It intentionally skips
unavailable pools unless `--strict` is used, because some lab nodes may be
temporarily offline while storage work is in progress.

Install the matching systemd timer when the helper changes:

```sh
rsync -az deploy/dev.crucio.cz/mount-snapshot-downloads.sh \
  root@admin.crucio.cz:/root/vpsadmin-dev-lab/mount-snapshot-downloads.sh
rsync -az deploy/dev.crucio.cz/snapshot-download-mounts.{service,timer} \
  root@admin.crucio.cz:/etc/systemd/system/
ssh root@admin.crucio.cz \
  'systemctl daemon-reload && systemctl enable --now snapshot-download-mounts.timer'
```

## Live parity workflow

Real VPS and dataset operation checks are documented in
`live-parity-workflows.md`. They are human-run on `dev.crucio.cz` only and must
use disposable objects with obvious `webui-next-live-test-*`,
`webui-next-playground-*`, or `webui-next-staging-*` names. The optional
Playwright helper is opt-in via `E2E_LIVE_PARITY=1` and only opens workflows to
verify live labels, previews, and confirmation gates; it does not submit
destructive actions.

## Build source

This repository now contains the WebUI Next source project. Product fixes
should be made in source, reviewed in PRs, then deployed with `deploy-dev`.
