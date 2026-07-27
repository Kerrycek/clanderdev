# vpsAdmin WebUI Next project guide

This is the canonical engineering overview for `clankerdev`. It explains how
the repository fits together and points to detailed runbooks instead of
duplicating them.

## 1. Purpose and boundaries

WebUI Next is the modern browser interface for vpsAdmin. It provides public
service information, self-service management for members and an operational
workspace for support/admin users.

The repository owns:

- the React/Vite frontend;
- the minimal OAuth backend-for-frontend;
- frontend API adapters, capability gates and translations;
- deterministic unit and Playwright tests;
- deployment configuration and dev-environment helpers.

It does not own HaveAPI authorization or vpsAdmin business logic. The API is
the final authority for visible data and allowed mutations. Upstream
`vpsfreecz/*` repositories and the legacy WebUI are read-only references unless
a maintainer explicitly requests otherwise.

## 2. Runtime architecture

```text
                       ┌─────────────────────────────┐
                       │ HaveAPI v7                  │
browser                │ schema, data, restrictions │
┌───────────────────┐  │ and mutation authorization │
│ React 19 SPA      │──►                             │
│ React Router      │  └─────────────────────────────┘
│ TanStack Query    │
│ i18n + UI gates   │  ┌─────────────────────────────┐
└─────────┬─────────┘  │ OAuth BFF                   │
          └────────────► /oauth/*, /config.js        │
                        │ server-side client secret  │
                        └─────────────────────────────┘
```

The SPA calls HaveAPI directly. `bff/server.js` handles OAuth login/callback,
keeps the OAuth client secret off the browser and supplies runtime
configuration. It does not proxy normal API calls. See
[`../bff/README.md`](../bff/README.md).

Runtime configuration is read from `window.vpsAdmin` and Vite environment
variables. The important values are the API origin/version, OAuth endpoints,
router basename, HaveAPI auth header/meta namespace and UI-settings storage.
The documented development shape is [`.env.example`](../.env.example).

HaveAPI is self-describing. The client can use injected API metadata or load
the description from `OPTIONS /v7.0/`. API adapters live in `src/lib/api/`.

## 3. Surfaces, scopes and roles

| Surface | Route | Audience | Data scope |
| --- | --- | --- | --- |
| Public | `/` | Anonymous and signed-in visitors | Public API actions |
| User workspace | `/app` | Authenticated users | The current user's objects |
| Admin workspace | `/admin` | Support and admin roles | Global/admin operations |

The frontend derives roles from the API user level:

- level 1–20: `user`;
- level 21–89: `support`;
- level 90 and above: `admin`.

Both support and admin roles can enter the admin workspace, but individual API
actions can have stricter requirements. Ownership, relationships, object state
and action-specific restrictions matter in addition to role.

Frontend authorization rules:

1. Use the correct route scope (`/app` versus `/admin`).
2. Use capability helpers under `src/lib/gates/` for action visibility.
3. Hide fields that the current API action does not expose as writable.
4. Treat frontend checks as UX safeguards only.
5. Handle API denial and validation responses clearly; never assume a visible
   button guarantees authorization.

For the backend model and dynamic actions, read
[`haveapi/AUTHZ_MODEL.md`](haveapi/AUTHZ_MODEL.md) and
[`haveapi/DYNAMIC_EXTENSIONS.md`](haveapi/DYNAMIC_EXTENSIONS.md).

## 4. Source layout

| Path | Responsibility |
| --- | --- |
| `src/main.tsx` | React entry point and Query client |
| `src/routes/` | Public, user and admin route trees and providers |
| `src/pages/` | Route-level screens, grouped by product area |
| `src/components/` | Shared layout and UI components |
| `src/lib/api/` | Typed HaveAPI calls and response normalization |
| `src/lib/gates/` | Capability and mutation visibility rules |
| `src/app/` | Auth, runtime config, settings and app contexts |
| `src/i18n/` | English/Czech dictionaries and translation runtime |
| `src/styles/` | Global styles and design tokens |
| `bff/` | OAuth backend-for-frontend |
| `e2e/` | Playwright fixtures, specs and mock API router |
| `scripts/` | CI audits, Playwright wrapper and maintenance tools |
| `deploy/` | Environment runbooks, service/nginx config and dev helpers |
| `docs/` | Maintained guides, derived references, audits and discovery |

Keep product changes in source. `dist/`, `assets/`, `.vite/` and
`node_modules/` are generated and must not be committed.

## 5. Local development

Supported Node.js versions are declared in `package.json`: `^20.19.0`,
`^22.12.0` or `>=24.0.0`. Node.js 22.12+ on the 22.x LTS line is the usual
baseline.

```bash
cp .env.example .env.local
npm ci
npm run env:check
npm run dev
```

Vite listens on `127.0.0.1:5173` by default. If direct API calls hit CORS in a
local setup, configure the optional Vite proxy described in `.env.example`.
Do not add real access tokens, OAuth secrets or auth storage state to the
repository.

To exercise the BFF separately:

```bash
cd bff
npm ci
# Supply required values in the process environment; never commit them.
node server.js
```

## 6. Verification and CI

Choose checks proportionate to the change, but product changes normally run:

```bash
npm run ci:pr
npm run build
npm run e2e:pr
```

Useful focused commands:

```bash
npm run typecheck
npm test
npm run lint
npm run audit:i18n
npm run e2e:broad
npm run e2e:nightly
```

Playwright has three deterministic mocked layers:

- `e2e:pr`: short desktop/mobile pull-request gate;
- `e2e:broad`: wider desktop/mobile smoke coverage;
- `e2e:nightly`: full mocked desktop suite plus mobile smoke.

Mocked tests are the default because they are repeatable and do not mutate real
systems. Live checks against `dev.crucio.cz` are opt-in, use local credentials
and disposable test objects, and follow
[`../deploy/dev.crucio.cz/live-parity-workflows.md`](../deploy/dev.crucio.cz/live-parity-workflows.md).

After pushing, always inspect GitHub Actions for the exact pushed commit. A
local green run does not replace the repository CI result. Detailed workflow
and artifact instructions are in
[`spec/CI_AND_TESTING_WORKFLOWS.md`](spec/CI_AND_TESTING_WORKFLOWS.md).

## 7. Localization

User-facing text is localized in English and Czech. Dictionaries must keep the
same keys and internal API enum values must be presented through localized
labels rather than shown raw.

When adding or changing UI copy:

1. add matching English and Czech keys under `src/i18n/`;
2. prefer localized labels supplied by HaveAPI for transactions, actions and
   objects when available;
3. localize form enum choices and their rendered values consistently;
4. run `npm run audit:i18n` and relevant tests.

The detailed conventions are in [`spec/I18N_L10N.md`](spec/I18N_L10N.md).
The legacy Czech translation conventions remain a useful read-only reference:
<https://github.com/vpsfreecz/vpsadmin/blob/master/doc/i18n-cs.md>.

## 8. Deployment environments and safety

| Environment | Purpose | API |
| --- | --- | --- |
| `dev.crucio.cz` | Private test UI on `admin.crucio.cz` | Local test API on `127.0.0.1:9292` through nginx |
| `clankerdev.vpsfree.cz` | Shared WebUI Next deployment | Configured vpsFree HaveAPI |
| Legacy/admin UI | Read-only behavior reference | Environment-specific legacy stack |

Environment details and exact commands live under `deploy/`. The source build
produces `dist/`, which deployment tooling syncs to the target webroot.

Safety rules:

- Do not deploy without explicit approval for that change.
- Do not make server, database or secret changes as part of a product fix.
- Never deploy uncommitted or generated-only changes.
- Keep `dev.crucio.cz` test data disposable and clearly named.
- Never push to upstream `vpsfreecz/*` repositories.
- Keep real OAuth/session credentials out of Git and test artifacts.

Repository-level [`../AGENTS.md`](../AGENTS.md) is authoritative for the AI
maintenance workflow. Deployment references:

- [`../deploy/README.md`](../deploy/README.md)
- [`../deploy/dev.crucio.cz/README.md`](../deploy/dev.crucio.cz/README.md)
- [`clankerdev/DEPLOYMENT.md`](clankerdev/DEPLOYMENT.md)

## 9. Contribution workflow

1. Read `AGENTS.md` and confirm the current branch/worktree.
2. Keep the change scoped and preserve unrelated worktree changes.
3. Add unit or Playwright coverage for behavior changes.
4. Run relevant local checks and review the resulting diff.
5. Use a short imperative commit subject and explain what/why in the body.
6. Push only to the `Kerrycek/clankerdev` repository.
7. Record verification, risk and follow-up in the review handoff.
8. Check GitHub CI for the pushed commit.
9. Deploy only after explicit human approval and verify the deployed version.

## 10. Canonical links

- Project repository: <https://github.com/Kerrycek/clankerdev>
- Legacy UI reference: <https://github.com/Kerrycek/vpsadmin>
- Upstream vpsAdmin (read-only): <https://github.com/vpsfreecz/vpsadmin>
- Documentation authority map: [`CANONICAL_DOCS.md`](CANONICAL_DOCS.md)
- Current parity audit: [`audits/webui-parity-audit-2026-07-20.md`](audits/webui-parity-audit-2026-07-20.md)
- HaveAPI resource index: [`haveapi/RESOURCE_INDEX.md`](haveapi/RESOURCE_INDEX.md)
- Test workflow guide: [`spec/CI_AND_TESTING_WORKFLOWS.md`](spec/CI_AND_TESTING_WORKFLOWS.md)
- Security-advisory workflow: [`spec/SECURITY_ADVISORIES.md`](spec/SECURITY_ADVISORIES.md)

## 11. Keeping this guide current

Update this guide in the same change when any of these move:

- SPA/BFF/API responsibility boundaries;
- route scopes or role thresholds;
- primary source directories;
- supported Node.js versions or baseline commands;
- CI/test layers;
- deployment environments or safety boundaries.

Put detailed procedures in their dedicated runbooks and link them here. Keep
dated audits dated; do not silently promote them to canonical requirements.
