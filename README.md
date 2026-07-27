# vpsAdmin WebUI Next

Modern React interface for vpsAdmin. It replaces the legacy PHP WebUI while
keeping HaveAPI as the source of data, permissions and mutations.

The application has three surfaces:

- public status, news, outages and security advisories;
- the signed-in user workspace (`/app`) for the user's own objects;
- the support/admin workspace (`/admin`) for global operations.

## Architecture

WebUI Next is a Vite-built React SPA. The browser calls HaveAPI directly. A
small Node.js backend-for-frontend (BFF) handles OAuth callbacks and runtime
configuration; it is not a HaveAPI proxy.

```text
browser (React/Vite) ───────────────► HaveAPI v7
        │                              data, schema and authorization
        └── /oauth/*, /config.js ───► OAuth BFF
```

Authorization is enforced by HaveAPI. Route, role and capability checks in the
frontend improve safety and usability, but are not a security boundary.

See [Project guide](docs/PROJECT_GUIDE.md) for architecture, source layout,
authorization, development, testing, localization and deployment guidance.

## Local development

Node.js **^20.19.0, ^22.12.0, or >=24.0.0** is required. The recommended local
baseline is Node.js 22.12 or newer on the 22.x LTS line.

```bash
cp .env.example .env.local
npm ci
npm run env:check
npm run dev
```

The default values use the public API. For local CORS proxying, BFF development
or sub-path hosting, follow [.env.example](.env.example) and
[BFF documentation](bff/README.md). Never commit tokens or secrets.

## Verification

```bash
npm run ci:pr       # lint, i18n audit, typecheck and unit/script tests
npm run build       # production build
npm run e2e:pr      # deterministic desktop and mobile Playwright smoke
```

The default Playwright tests use mocked HaveAPI sessions and do not need real
credentials. Broader and live test layers are documented in
[Testing workflows](docs/spec/CI_AND_TESTING_WORKFLOWS.md).

## Documentation

- [Project guide](docs/PROJECT_GUIDE.md) — canonical engineering overview
- [Documentation map](docs/CANONICAL_DOCS.md) — authority and document status
- [HaveAPI reference](docs/haveapi/README.md) — API sources and authorization
- [Security advisories](docs/spec/SECURITY_ADVISORIES.md) — CVE lifecycle,
  privacy and admin workflow
- [Deployment index](deploy/README.md) — environment-specific operations
- [E2E guide](e2e/README.md) — Playwright conventions and test layers

Generated output in `dist/`, `assets/`, `.vite/` and `node_modules/` is not
source and must not be committed.
