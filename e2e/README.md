# E2E tests (Playwright)

This directory contains **end-to-end test fixtures and specs**.

We intentionally keep e2e out of the TypeScript build (`tsconfig.include` does not include this folder)
so we can evolve the suite incrementally without blocking feature development.

Authoritative plan:
- `docs/spec/E2E_TEST_PLAN.md`

Execution workflows:
- `docs/spec/CI_AND_TESTING_WORKFLOWS.md`

Key rules
- Prefer user-facing role/text locators for workflow assertions.
- Use `data-testid` selectors for stable app shell, route identity, and dense data grids (see `docs/spec/TEST_IDS.md`).
- Prefer deterministic fixtures + Playwright network interception.
- Do not store passwords or real tokens in the repo. Use mocked sessions by default; use env variables only for explicit staging runs.
- Use the Design Sandbox for screenshot regression (`docs/spec/DESIGN_SANDBOX.md`).

## Test layers

Playwright is split into three practical layers:

- PR smoke: `npm run e2e:pr`
  Runs the short, deterministic `@pr-smoke` desktop subset plus `@pr-smoke-mobile` on mobile Chrome. This is the pull
  request gate and should stay focused on critical paths that are stable enough to block review.
- Broad smoke: `npm run e2e:broad`
  Runs mocked `@smoke` app/admin coverage on desktop plus `@smoke-mobile` mobile coverage. This is the wider main/manual
  signal for app surfaces, admin surfaces, storage, tasks, transaction details, and session handling.
- Nightly/full: `npm run e2e:nightly`
  Runs the full mocked desktop suite plus the mobile broad smoke subset. This is the overnight/manual parity signal for
  longer user and admin workflows.

Use `npm run e2e:full` when you only want the full desktop parity suite.

## User/admin workflow matrix

The focused matrix is tagged `@workflow-matrix` and is mocked/CI-safe by default:

```bash
E2E_START_SERVER=1 node scripts/playwright.mjs test --grep '@workflow-matrix' --project=chromium
```

Checklist:

| Area | Role | Coverage | Spec |
| --- | --- | --- | --- |
| Dashboard/home load | user | Authenticated dashboard and VPS KPI navigation | `e2e/specs/app/authenticated_home_smoke.spec.ts` |
| Admin landing | admin | Admin diagnostics and shortcut page | `e2e/specs/admin/admin_info_page.spec.ts` |
| VPS list | user/admin | List load, row navigation, and list action containment | `e2e/specs/app/authenticated_home_smoke.spec.ts`, `e2e/specs/app/vps_list_row_click.spec.ts` |
| VPS detail tabs | user/admin | Overview to storage/lifecycle/console tab navigation and direct reload | `e2e/specs/app/vps_detail_tabs_matrix.spec.ts` |
| VPS power actions | user/admin | Start, stop, and restart payloads plus action-state tracking in Tasks | `e2e/specs/app/vps_lifecycle_tab_actions.spec.ts`, `e2e/specs/app/vps_power_stop_confirm.spec.ts` |
| VPS access actions | user | Root-password result and SSH-key deployment with non-modal task tracking | `e2e/specs/app/vps_access_page.spec.ts` |
| Tasks drawer | user/admin | Drawer open, non-modal behavior, action-state inspection | `e2e/specs/app/tasks_drawer_focus_trap.spec.ts` |
| Action state detail | user/admin | Header, cancel dialog, related transactions, payload expansion | `e2e/specs/app/action_state_detail_page.spec.ts` |
| Transaction/action-state detail | user/admin | Transaction detail payloads and admin-only operational links | `e2e/specs/app/transaction_detail_page.spec.ts`, `e2e/specs/app/action_state_detail_page.spec.ts` |
| Create VPS form smoke | user/admin | User-scope and admin-scope create payloads without live mutation | `e2e/specs/app/vps_create_admin_flow.spec.ts` |
| Storage tab | user | Root dataset links and mount create/delete flows with mocked mutations | `e2e/specs/app/vps_storage_tab_mounts.spec.ts` |
| Lifecycle action visibility | user/admin | User-visible actions and admin-only lifecycle controls/gating | `e2e/specs/app/vps_lifecycle_tab_actions.spec.ts` |
| Requests list/detail | user/admin | User request detail without admin controls; admin operational links | `e2e/specs/app/user_requests_smoke.spec.ts`, `e2e/specs/admin/requests_operations_smoke.spec.ts` |
| Console tab smoke | user | Stubbed console iframe and token recreation path | `e2e/specs/app/vps_console_page.spec.ts` |

All specs in the matrix use `bootstrapVpsAdminWindow()` and `installHaveApiMock()` or local Playwright route stubs for
destructive or external actions. They do not require VPN-only services, committed credentials, real cookies, or production
mutations.

Live/manual coverage is intentionally separate from default CI. Any future real-environment smoke should be tagged
outside `@workflow-matrix`, use credentials from env vars or CI secrets only, document its target environment, and remain
opt-in so PRs do not depend on VPN-only services.

## Running locally

```bash
cd clankerdev

# One-time (downloads browsers)
npm run e2e:install

# Run e2e with Playwright starting Vite (see playwright.config.ts)
npm run e2e

# PR smoke, broad smoke, and nightly/full layers
npm run e2e:pr
npm run e2e:broad
npm run e2e:nightly

# Locked-down local/container host with system Chromium and managed URLBlocklist
npm run e2e:container -- --project=chromium e2e/specs/app/dashboard.spec.ts

# Optional: enable screenshot matrix
E2E_START_SERVER=1 E2E_SCREENSHOTS=1 node scripts/playwright.mjs test

# Optional: capture reusable mocked workflow screenshots into docs/e2e-screenshots
npm run e2e:screenshots
```


## Locked-down local/container runs

`npm run e2e:container` is a local harness for environments where Playwright-managed browsers are not installed or where
system Chromium is constrained by a host `URLBlocklist` policy. It is not used by CI. The command is shorthand for the
runner-only `--container` flag, which:

- auto-detects a system Chromium executable when `E2E_CHROMIUM_EXECUTABLE_PATH` is unset,
- sets `E2E_RECORD_ARTIFACTS=0` when the caller has not chosen an artifact mode,
- temporarily removes blocking `"*"` entries from Chromium `URLBlocklist` policy files for the duration of the run,
  stores backups outside the active policy tree, then restores the original files.

Use the lower-level flags when only part of the behavior is needed:

```bash
node scripts/playwright.mjs test --auto-system-chromium --no-artifacts --project=chromium
node scripts/playwright.mjs test --relax-chromium-policy --project=chromium
```

Override discovery with `E2E_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium`, `E2E_CHROMIUM_CANDIDATES=/path/a:/path/b`, or
`E2E_CHROMIUM_POLICY_DIRS=/policy/dir/a:/policy/dir/b`.

## Reusable screenshot capture

`e2e/specs/app/screenshot_capture.spec.ts` is a permanent, opt-in capture harness for mocked product screenshots. It
replaces one-off temporary capture specs for common pages.

```bash
# Capture all default scenarios into docs/e2e-screenshots
npm run e2e:screenshots

# Capture one scenario into a phase-specific docs folder
E2E_SCREENSHOT_DIR=docs/phase31-screenshots \
E2E_SCREENSHOT_SCENARIOS=dashboard \
npm run e2e:screenshots
```

Current scenarios are `dashboard` and `dataset-downloads`; set `E2E_SCREENSHOT_SCENARIOS=all` to run every scenario.

## CI behavior and artifacts

- `.github/workflows/e2e-smoke.yml` runs `npm run e2e:pr` for pull requests and pushes to `main`.
- `.github/workflows/e2e-broad-smoke.yml` runs broad smoke on pushes to `main` and manually.
- `.github/workflows/e2e-nightly.yml` runs full/nightly parity on the Prague morning schedule and manually.
- Workflow concurrency cancels older runs for the same ref, which keeps intermediate commits from producing redundant
  notifications.
- Playwright keeps screenshots, videos, and traces on failure (`playwright.config.ts`). CI uploads `playwright-report`
  and `e2e/test-results` only for failed jobs.
- Download the artifacts from the failed GitHub Actions job. Open `playwright-report/index.html` for the report, or open a
  trace zip with `npx playwright show-trace path/to/trace.zip`.

## Adding workflow coverage

Prefer mocked HaveAPI tests for default CI coverage:

1. Add or extend a spec under `e2e/specs/app`, `e2e/specs/admin`, or `e2e/specs/public`.
2. Bootstrap auth with `bootstrapVpsAdminWindow()` and install deterministic API responses with `installHaveApiMock()`.
3. Name the test with the role, workflow, and expected behavior, for example
   `admin VPS list: action button opens confirm without row navigation`.
4. Use role/text locators for user-visible behavior and `data-testid` locators for dense grids, app shell controls, and
   route identity.
5. Tag only stable critical paths with `@pr-smoke`. Tag broader deterministic app/admin workflows with `@smoke`, and add
   `@smoke-mobile` only when the behavior is mobile-specific or important on mobile.
6. Avoid fixed sleeps. Wait for visible UI, URLs, network requests, or `expect.poll()` when state changes asynchronously.

Real-environment smoke is intentionally separate from default CI. If needed, add a staging-only workflow that uses CI
secrets and document the environment, credentials source, and expected blast radius in that workflow or `deploy/`.

## Live/manual dev checks

Use `npm run e2e:live:manual` only for explicit human-run checks against
`dev.crucio.cz`. The live parity spec is skipped unless `E2E_LIVE_PARITY=1` is
set and object IDs are provided through environment variables. It opens real
VPS and dataset workflows and checks confirmation gates without submitting
destructive actions. See `deploy/dev.crucio.cz/live-parity-workflows.md`.

### Destructive live mutation audit

`scripts/live-mutation-audit.mjs` is the explicit opt-in counterpart to the
readiness spec. It is deliberately limited to one self-contained vertical
slice: an isolated DNS zone and one A record are created, edited, deleted and
verified through the real admin UI on `https://dev.crucio.cz`.

The runner refuses to start unless all safety conditions are satisfied:

- `E2E_LIVE_MUTATIONS=1` is explicitly set;
- `E2E_BASE_URL` is exactly `https://dev.crucio.cz` (a trailing slash is okay);
- an authenticated admin token is provided through
  `E2E_LIVE_SESSION_TOKEN` or `E2E_LIVE_SESSION_TOKEN_FILE`;
- before opening a mutation form, `GET /users/current` must confirm a valid
  administrator (level 90+); its response body is never written to artifacts;
- execution is serial by construction (one browser context, one page, no
  Playwright workers);
- every created object uses a unique `webui-next-live-*` prefix and is written
  as a pending intent before form submission, then immediately to
  `work/live-mutations/<run>/objects.json` after HaveAPI returns its ID;
- a failed create is reconciled by the exact unique zone/record name before
  cleanup, so a request that reached HaveAPI before the UI failed is not lost;
- final cleanup only accepts IDs registered in that run ledger and removes
  child records before their parent zone, even after a test failure;
- immediately before every cleanup DELETE, HaveAPI must return the expected
  resource kind, exact run-owned name, DNS record type and parent zone ID;
  mismatches fail closed and leave the object for manual review;
- if an owned child cannot be removed, its parent zone is deliberately left in
  place and marked `blocked` in the ledger for a safe manual retry;
- the runner rejects output targets with a symlink anywhere in their existing
  ancestor chain; the run directory is mode `0700` and ledgers/reports are mode
  `0600`;
- authenticated screenshots and videos are disabled by default. Set
  `E2E_RECORD_ARTIFACTS=1` only when the private artifacts are explicitly
  needed; capture failures are included in the report and fail the run.

Run it manually with a disposable dev token:

```sh
E2E_LIVE_MUTATIONS=1 \
E2E_BASE_URL=https://dev.crucio.cz \
E2E_LIVE_SESSION_TOKEN_FILE=/secure/path/to/dev-token \
npm run e2e:live:mutations
```

Use `E2E_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` when the managed
Playwright browser is unavailable. This changes only the browser executable;
all target, opt-in and administrator guards remain mandatory.

The mutation report and cleanup ledger are saved under
`work/live-mutations/`; screenshots and videos are added only with the
explicit artifact opt-in above. Never use a production API URL or reuse IDs
from another run. The runner intentionally does not cover users or VPS creation:
those workflows require environment, node, resource-package and ownership
prerequisites that must not be guessed on a live cluster.

### Destructive live VPS beta certification

`scripts/live-vps-certification.mjs` is a separate, deliberately destructive
manual certification for the VPS beta path. It may run only against the exact
origin `https://dev.crucio.cz`; it is not a CI test and has no production mode.
The runner creates at most one stopped VPS through the real admin UI, requests
zero public IPv4, private IPv4 and IPv6 addresses, exercises only UI
start/restart/stop, and then hard-deletes that exact VPS through an independent
HaveAPI client. It never sets a password, deploys an SSH key or opens a console.

The private fixture is an allowlist, not a discovery hint. Every ID and label is
re-fetched before the first POST, relationships must identify one exact
environment/location/node/template combination, the owner must explicitly be
allowed to create another VPS, and the owner allocations must prove enough
`value` and `free` capacity. Resource definitions, bounds and step sizes are
also checked. Missing or ambiguous capacity, node maintenance/lock state, or
any fixture mismatch stops the run before mutation.

Example fixture (replace every placeholder with a separately audited dev
fixture; do not commit this file):

```json
{
  "apiProtocolVersion": "7.0",
  "apiFingerprint": {
    "version": "4.2.1",
    "revision": "4a397464d945772bafe0328d2f2c512381f7400c"
  },
  "fixtures": {
    "owner": { "id": 100, "expectedLabel": "live-cert-owner" },
    "node": { "id": 200, "expectedLabel": "live-cert-node" },
    "osTemplate": { "id": 300, "expectedLabel": "live-cert-template" },
    "environment": { "id": 400, "expectedLabel": "live-cert-environment" },
    "location": { "id": 500, "expectedLabel": "live-cert-location" }
  },
  "resources": {
    "cpu": 1,
    "memory": 1024,
    "diskspace": 1024,
    "swap": 0
  }
}
```

The fixture must be a regular private file (`chmod 600`). The administrator
token may be supplied through `E2E_LIVE_ADMIN_TOKEN`, but a private
`E2E_LIVE_ADMIN_TOKEN_FILE` is preferred so it does not end up in shell history;
when used, that file must also be mode `0600`. The API source version/revision
and exact SHA-256 of the public `/v7.0/` description are pinned in code. The
public description hash proves that the deployed API contract matches the
audited artifact; the revision is a private source attestation, not a
cryptographic proof that the running process contains that Git commit.

The disposable one-hour administrator session is created by the official
`POST /v7.0/user_sessions` `NewTokenDetached` flow. Its `auth_type=token`
credential is sent exclusively as `X-HaveAPI-Auth-Token` on API requests. The
OAuth resume header `X-HaveAPI-OAuth2-Token` is intentionally rejected and no
authentication header is attached to static asset requests.

Run the certification manually with a disposable dev administrator token:

```sh
chmod 600 /secure/path/to/dev-admin-token /secure/path/to/dev-vps-fixture.json

E2E_LIVE_VPS_MUTATIONS=1 \
E2E_BASE_URL=https://dev.crucio.cz \
E2E_LIVE_ADMIN_TOKEN_FILE=/secure/path/to/dev-admin-token \
E2E_LIVE_VPS_FIXTURE_FILE=/secure/path/to/dev-vps-fixture.json \
npm run e2e:live:vps
```

Safety and evidence rules:

- `E2E_LIVE_VPS_MUTATIONS=1`, the exact target, a level-90+ token and the
  complete private fixture are all mandatory. Before any token-bearing request,
  the runner opens TLS with exact `dev.crucio.cz` host/SNI and verifies the
  code-owned SHA-256 pin and validity window of the current self-signed leaf.
  Only that successful proof enables the self-signed TLS exception for the run.
  Every API request then opens its own pinned TLS socket and verifies that exact
  socket before constructing the authentication header or body. Chromium uses
  the code-owned SPKI allowlist and the browser aborts every cross-origin or
  credential-bearing URL. Browser API traffic is fulfilled only through the
  same token-bearing pinned client, while static traffic uses the token-free
  pinned client. Neither path uses browser network continuation; every 3xx is
  aborted before Chromium can follow it or replay a token/body. Certificate
  rotation requires reviewed leaf/SPKI pin and audited trust-state updates; no
  fixture or environment variable can replace them. The private token file is
  validated locally during fail-fast preflight, but no token-bearing network
  context or request exists before a per-connection TLS proof.
- A private intent ledger is written before the create POST. The returned
  action-state ID, transaction-chain proof, exact create payload digest and
  resulting VPS ID are recorded without the token.
- Before any browser request reaches the network, a route-time allowlist permits
  only read-only GET/HEAD requests plus exactly one ordered create, start,
  restart and stop POST. The create body must contain only the top-level `vps`
  key and match the pre-registered canonical payload digest; lifecycle bodies
  must be exactly empty. Every other
  same-origin POST/PUT/PATCH/DELETE, a duplicate submit, or an out-of-order
  lifecycle action is aborted and recorded as a security failure. WebSockets
  are entirely blocked because none is required by this certification path.
- Every mutation passes only when both the action state is finished/successful
  and its transaction chain is `done`. Polling is bounded; timeout, conflicting
  evidence or a missing proof fails the run.
- An ambiguous create is reconciled only by the exact guarded hostname, info
  marker, owner, node, template, nested environment and zero IP assignments.
  The normal response path also requests `_meta[count]=true`, rejects a missing
  or truncated `total_count`, and requires one globally unique candidate to stay
  unique across three bounded observations before it can be verified. Multiple
  exact candidates are all recorded by ID for manual review; none is
  automatically deleted. The runner never retries a create blindly and never
  deletes a merely similar VPS.
- Cleanup runs from `finally`, re-fetches the full identity, requires zero IP
  assignments and an explicit `is_running=false`, sends `lazy=false`, waits for
  both deletion proofs, and confirms object absence only through an
  authenticated exact guarded-identity list query pinned to the ledger's VPS
  ID, hostname, owner and node, whose valid `status:true` envelope has
  `total_count=0` and an empty `vpses` array. Authentication errors, 5xx,
  `status:false`, malformed responses and HTML 404 pages fail closed for manual
  review; none is interpreted as absence.
- Ledgers and reports are under `work/live-vps-certification/` with directory
  mode `0700` and file mode `0600`. Token values are redacted. Authenticated
  screenshots are disabled unless `E2E_RECORD_ARTIFACTS=1` is explicitly set;
  those artifacts remain private and must never be committed.

Use `E2E_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` only when the managed
Playwright browser is unavailable. This does not relax any origin, identity,
capacity, evidence or cleanup gate.

## Auth model

Most tests use `bootstrapVpsAdminWindow()` plus `installHaveApiMock()` to emulate an authenticated HaveAPI session.
This avoids committing credentials and keeps PR tests deterministic.

Real OAuth login against `dev.crucio.cz` is intentionally not part of the default suite. If we add it later, it should
run as an explicit staging-only job with credentials supplied by CI secrets.
