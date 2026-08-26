# Deployment serving-layer parity audit

`scripts/audit-deployment-parity.mjs` compares the anonymous HTTP serving
contract of `dev.crucio.cz` (candidate) with `clankerdev.vpsfree.cz`
(reference). It is safe to run manually or from a scheduled regression job:
it sends only anonymous `GET` requests and never sends cookies, authorization
headers, session tokens or mutations.

The audit covers:

- permanent HTTP-to-HTTPS redirects;
- `/`, `/index.html` and an unknown SPA route, including identical fallback
  content and `no-cache` behavior;
- the versioned `/assets/` manifest discovered from the HTML, asset digests,
  MIME types derived from each asset extension, public immutable caching with
  a positive `max-age`, and missing-asset `404` behavior;
- the structural (redacted) `config.js` contract, including the root `basePath`
  and HaveAPI `_meta` namespace, while allowing the API origin to differ
  between the test and reference environments;
- an anonymous same-origin `/session.json` response, JSON shape and `no-store`;
- `/healthz` status and MIME type;
- CSP (parsed as exact directives and source tokens), HSTS, `nosniff`, frame,
  referrer and permissions headers across every candidate surface.

Response bodies are used in memory only for hashes and structural checks. They
are never printed. Session values are reduced to `null`, `absent` or
`present-redacted`. The report records header presence rather than cookie or
header values.

Run the live audit from a supported Node.js environment:

```sh
node scripts/audit-deployment-parity.mjs --allow-invalid-candidate-cert
```

The certificate flag is currently required because `dev.crucio.cz` uses the
documented local test certificate. It applies only to the candidate; reference
TLS verification remains enabled. Use `--json` for a machine-readable redacted
report. A candidate contract regression or blocking artifact/endpoint parity
difference exits with status 1. Connection/configuration errors exit with
status 2.

The reference nginx is intentionally older. Missing reference security headers
are therefore reported as non-blocking observations, not used to weaken the
candidate contract. In particular, nginx `add_header` directives in nested
locations replace inherited headers unless those headers are repeated (or an
appropriate supported inheritance mechanism is configured).

Unit tests use local HTTP fixtures and are included automatically in:

```sh
npm run test:scripts
```

## Read-only baseline from 2026-08-26

The live audit passed with no candidate or blocking artifact parity violations.
Both origins redirect HTTP with `301`. `/`, `/index.html` and the unknown SPA
route return the same 2,375-byte HTML artifact as `text/html` with `no-cache`.
Both HTML files reference `/assets/index-CpjQHZAf.js`; the asset is byte-for-byte
identical (SHA-256
`b556c30024b8b856b68b1329a6434c4eb9f8ae78f0af73de2f060fb9c8a16f2f`),
served as `application/javascript`, and marked `public, immutable` with a
positive `max-age`.

`config.js` is valid JavaScript with `no-store` on both origins. Its API
version, login/logout paths and OAuth2 header contract match. As intended, the
dev config points to its same-origin test API while the reference config points
to the production API. A same-origin anonymous request to `session.json`
returns HTTP 200 JSON with exactly `accessToken` and `sessionExpiresAt`, both
null, and `no-store`. `/healthz` returns HTTP 200 `text/plain` with the expected
readiness marker on both origins. No tested response set a cookie.

The candidate sends CSP, one-year HSTS, `nosniff`, `SAMEORIGIN`, strict
referrer policy and the locked-down permissions policy on every tested
surface. `config.js` and `session.json` also send same-origin CORP. The reference
is missing the six common security headers on HTML, the SPA fallback and the
versioned asset. Its config/session retain only `nosniff` and CORP; health
retains `nosniff`, frame and referrer headers. This matches the known nginx
`add_header` inheritance issue.

One non-blocking cache difference remains: a missing asset is correctly HTTP
404 on both hosts, but the candidate 404 carries `Cache-Control: public,
immutable`, while the reference has no explicit cache policy. This does not
affect artifact parity, but the candidate policy should be reviewed if deploys
can temporarily expose asset URLs before their files are synchronized.
