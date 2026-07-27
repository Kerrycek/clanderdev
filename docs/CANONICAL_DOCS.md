# Canonical documentation map

This map prevents old planning documents and generated audits from being
mistaken for current project truth.

## Current entry points

- [`../README.md`](../README.md) — repository quick start
- [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) — canonical engineering overview
- [`README.md`](README.md) — documentation tree and maintenance rules

The project guide describes the repository as implemented. It does not replace
product decisions, HaveAPI authorization or environment-specific runbooks.

## Sources of authority

| Subject | Authority |
| --- | --- |
| Product behavior and routes | Current `src/` implementation plus reviewed product decisions |
| API schema, fields and authorization | Runtime HaveAPI description and upstream API sources |
| Repository workflow and safety | `AGENTS.md` |
| Build and test commands | `package.json`, GitHub workflows and testing docs |
| Environment operations | The matching runbook under `deploy/` |
| Architecture/onboarding summary | `docs/PROJECT_GUIDE.md` |

The historical pointers to an external `UI_REDESIGN.md` are not usable in this
checkout because that file is not tracked in this repository. They must not be
treated as an available source of truth.

## Active derived documents

These are maintained references, but the authorities above win if they drift:

- `haveapi/README.md`
- `haveapi/AUTHZ_MODEL.md`
- `haveapi/UI_MODULE_MAPPING.md`
- `spec/CI_AND_TESTING_WORKFLOWS.md`
- `spec/ROUTE_COVERAGE_AUDIT.md`
- `spec/MODE_AND_ROUTE_ACCESSIBILITY.md`
- `spec/PAGINATION_AND_SEARCH.md`
- `spec/TEST_IDS.md`
- `spec/AUTH_AND_FAILURE_SURFACES.md`
- `spec/I18N_L10N.md`
- `spec/SECURITY_ADVISORIES.md`
- `clankerdev/DEPLOYMENT.md`

## Point-in-time or generated material

- `audits/` records reviews at a particular commit and date.
- `discovery/` contains generated inventories and legacy/API cross-checks.
- `phase*-screenshots/` contains visual evidence, not specifications.

Before acting on a finding, compare its recorded commit with current `main`.

## Historical or quarantined material

- `chat/`
- quarantined stubs under `spec/`
- root-level `ROADMAP.md`, `STATUS.md`, `TODO*.md` and session handoff files
- `CANON_MAP.md`, retained only for old links

Use these only for archaeology. Do not copy requirements from them without
revalidating the requirement with the maintainer and current implementation.
