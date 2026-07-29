# Code health and security audit — 2026-07-29

## Outcome

This pass reduced structural debt, removed confirmed dead code, tightened the
OAuth boundary and added repeatable checks for the security assumptions that
can be verified in this repository. No authentication bypass, unprotected HTML
sink or committed secret was found during the review.

This is not a claim that the application has zero vulnerabilities. The
remaining architectural risks and the limits of the verification are listed
below.

## Security changes

- Runtime public configuration no longer contains an OAuth access token.
- Authenticated runtime data is returned by a separate `/session.json`
  endpoint with `no-store`, JSON `Content-Type`, `nosniff`, same-origin CORP
  and same-origin request validation.
- OAuth state is random, timestamped, single-use and persisted as consumed
  before the token exchange. The session id is rotated after authentication.
- Anonymous login starts are rate-limited and pre-authentication sessions have
  a short lifetime.
- OAuth token and revocation responses are bounded by both time and size. A
  token response without a non-empty access token is rejected.
- Logout rejects cross-site requests, clears the secure session cookie even
  when the backing store fails and does not expose internal errors.
- The test deployment's token and revocation endpoint examples use loopback,
  so credentials are not sent over plaintext HTTP to a public host address.
- Deployment CSP now limits scripts to the same origin plus the exact hash of
  the startup bootstrap. It also defines explicit defaults for forms, frames,
  connections, images, fonts, objects and framing.
- CI recalculates the inline-script hash and rejects stale or unsafe CSP
  declarations.
- Every GitHub Actions workflow declares the least-privilege
  `contents: read` permission instead of inheriting the repository default.
- Rich news and payment content uses one allowlist sanitizer. Event handlers,
  active elements, dangerous protocols and unsafe URL normalization tricks are
  covered by an adversarial XSS corpus.
- External map lookup requires an explicit admin action before the applicant's
  address is sent to Nominatim.
- Generated links and external URLs use shared protocol/origin validation.

## Code cleanup

- Deleted three confirmed unreachable production modules and the obsolete PHP
  OAuth token proxies.
- Split oversized page, header, filter, request-review, profile, audit and
  dashboard concerns along existing domain boundaries.
- Removed unused imports, state, helpers and an always-false request
  confirmation branch.
- Removed a source-level type cycle between the app header and its menus.
- Fixed ambiguous smart-filter resolution: multiple mailbox/environment
  matches now produce an explicit ambiguity result instead of silently using
  the first item.
- Kept the structural baseline from growing:
  - `as any`: 1,119 / 1,156 budget;
  - files over 500 lines: 53 / 53 budget;
  - files over 1,000 lines: 9 / 9 budget.

The budgets are guardrails, not a finished state. New work must continue to
reduce these numbers rather than merely stay below the baseline.

## Automated verification

- Full repository CI check: passed.
- TypeScript typecheck: passed.
- Unit tests: 565 passed in 127 files.
- BFF security tests: 15 passed.
- Script/harness tests: 6 passed.
- Production build: passed.
- Desktop PR Playwright smoke: 56 passed.
- Mobile PR Playwright smoke: 4 passed.
- Admin request workflow Playwright suite: 5 passed.
- Complete desktop Playwright suite: 250 passed, 7 intentionally skipped
  live-manual or visual scenarios.
- Mutation audit: 206 mutation sites, zero warnings.
- i18n parity: 3,648 English and 3,648 Czech keys.
- Page, overlay, component, API-import, lookup, active-doc and structural
  audits: passed.
- Deployment shell syntax and whitespace checks: passed.

GitHub CI provides the independent clean-run result from a fresh install.

## Dependency audit

- BFF production dependencies: zero known vulnerabilities.
- Root production dependencies: one high-severity
  [React Router advisory](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
  is reported through `react-router`/`react-router-dom` 7.18.2. It affects React Server
  Components actions. This project is a client-only Vite SPA and does not use
  React Router RSC APIs, so the vulnerable execution path is not present.
- Pinning an older 7.x release reintroduced several applicable router
  advisories. The complete upstream fix currently requires the separate major
  migration to React Router 8.3 or newer.
- CI fails on critical root production advisories and on high-or-worse BFF
  production advisories. The documented RSC-only high advisory remains visible
  instead of being hidden by an audit override.

## Remaining risks and follow-up

### Priority 1 — keep the access token out of JavaScript

The SPA still calls HaveAPI directly, so `/session.json` must ultimately place
the access token in JavaScript memory. A same-origin XSS could read it. The
stronger long-term design is a full BFF API proxy with an HttpOnly session
cookie and no bearer token in browser JavaScript.

### Priority 2 — finish large-file and untyped-boundary reduction

There are still 53 files over 500 lines, nine over 1,000 lines and 1,119
`as any` assertions. Reduce these incrementally around changed areas, beginning
with API response normalizers and the largest operational pages. Avoid a single
generic CRUD abstraction or a mechanical repository-wide rewrite.

### Priority 2 — narrow CSP destinations

Scripts are strongly restricted, but `connect-src` and `frame-src` currently
allow HTTPS endpoints because API, console and OSM origins are deployment- and
data-dependent. Move these origins into an explicit deployment allowlist once
the complete production endpoint inventory is stable. Inline styles remain
allowed because the current UI sets dynamic style properties.

### Priority 2 — React Router major upgrade

Plan and test the React Router 8.3+ migration separately. It should include
route compatibility tests, deep-link reloads, OAuth redirects and the full
desktop/mobile Playwright matrices.

### Priority 3 — pin GitHub Actions by immutable digest

The workflows use maintained major-version tags for GitHub-owned actions.
Pinning each action to a reviewed commit SHA, with Dependabot keeping those
digests current, would further reduce supply-chain risk.

### Verification limits

- Local Playwright uses deterministic mocked API responses; it verifies UI
  workflows and request payloads, not production authorization policy.
- API/server-side permission enforcement still requires a separate HaveAPI
  review and integration tests with least-privileged accounts.
- The deployment configuration changes in this audit are not live until a
  human-approved deployment is performed.
