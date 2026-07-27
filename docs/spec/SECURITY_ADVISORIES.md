# Security advisories

This document describes the WebUI Next workflow for security advisories and
their CVEs. HaveAPI remains the authority for data, validation and
authorization.

## Surfaces and access

| Surface | Route | Behavior |
| --- | --- | --- |
| Public list | `/security-advisories` | Lists published and retracted advisories; never drafts |
| Public detail | `/security-advisories/:advisoryId` | Shows published or retracted public information |
| Admin list | `/admin/security-advisories` | Lists drafts, published and retracted advisories |
| Admin detail | `/admin/security-advisories/:advisoryId` | Full management workflow |

The anonymous public surface must never render affected user/VPS counts,
operator notes, reporter identities or administrative actions. A signed-in
user may see only their own impact and their own affected VPS, as returned by
the user-scoped API filters; the public surface must never expose global impact
counts. The admin routes are inside the admin `AppShell`; frontend gates
improve usability, while HaveAPI enforces the actual permission boundary.

## Lifecycle

```text
create draft
    │
    ├── edit localized content and CVEs
    ├── assess every active compute/storage node
    └── publish ──► published ──► post updates
                                      │
                                      └── retract update ──► retracted
```

There is intentionally no advisory delete action. A published advisory is an
operational record; corrections are posted as updates and withdrawal is
represented by a retracted update.

The administration UI enforces the lifecycle policy even though the API
exposes the complete state enum on its low-level update resource:

- advisory metadata, translations and CVEs are directly editable only while
  the advisory is a draft;
- drafts are made public only through the dedicated publish action;
- follow-up updates can be posted only to published advisories and may either
  keep the current state or retract the advisory;
- retracted advisories are terminal. Their public detail and update history
  remain available, but the parent record cannot be edited and no new updates
  can be posted.

Before editing metadata, publishing or posting an update, the UI reloads the
advisory and checks its current state again. This prevents actions from a stale
browser view. The current upstream admin API does not provide an atomic state
precondition, so the frontend check cannot eliminate a narrow
time-of-check/time-of-use race between two administrators. Treat the lifecycle
above as the operator policy; the definitive fix belongs in the upstream
model/action transaction.

## Draft and translation rules

The editor loads the active languages from HaveAPI instead of hard-coding
English and Czech. Every active language requires a summary. Description and
response are optional localized long-form fields.

CVEs are normalized to upper case, deduplicated and validated as
`CVE-YYYY-NNNN...`. They are child resources, not a field of the advisory.
Creating or updating an advisory and reconciling CVEs is therefore not atomic.
New CVE links are created before obsolete links are removed, so a failed create
cannot silently strip the advisory of its previous CVEs. If reconciliation
fails after the parent succeeds, the UI keeps the saved parent, opens its
detail and reports the partial failure. It must not blindly repeat parent
creation and produce a duplicate advisory.

## Node assessment and publishing

Every active node with type `node` or `storage` is assessed explicitly as one
of:

- `unknown`;
- `not_affected`;
- `vulnerable`;
- `mitigated`.

The UI blocks publishing until:

1. at least one CVE is linked;
2. every relevant active node has a status;
3. no relevant node remains `unknown` or `vulnerable`;
4. every `mitigated` status has both `vulnerable_until` and
   `mitigated_since`.

The bulk editor updates nodes sequentially. It records completed node IDs and,
after a partial failure, retries only the remaining nodes. This avoids
repeating successful mutations.

Publishing is always confirmed. The administrator chooses the publication
time and whether HaveAPI should notify affected users. Rebuilding affected VPS
is also confirmed because it can be an expensive operational action.

## Detail tabs

- **Overview** — state, CVEs, publication readiness and all translations.
- **Nodes** — per-node status, timing, note and confirmed bulk changes.
- **Affected** — admin-only user and VPS impact with links to object details.
- **Updates** — localized progress messages and retraction workflow.
- **Outages** — links between an advisory and related outages.

The anonymous public detail uses the same public-safe relations but omits
internal notes and affected-object identities. An authenticated detail can add
a personal-impact section, but only from queries explicitly scoped to the
current user.

### Upstream privacy limitation

The public WebUI never renders node notes or update reporter identities.
HaveAPI is nevertheless the real security boundary, and its current anonymous
responses can include the raw `note` and `reporter_name` fields. Until those
fields are removed from the anonymous API schema, node notes must not contain
personal, confidential or operationally sensitive information. A frontend
redaction is defense in depth, not an access-control guarantee.

## API resources

| Purpose | HaveAPI path |
| --- | --- |
| Advisory CRUD/read | `/security_advisories` |
| Publish | `/security_advisories/:id/publish` |
| Rebuild affected VPS | `/security_advisories/:id/rebuild_affected_vps` |
| CVEs | `/security_advisory_cves` |
| Node assessments | `/security_advisories/:id/node_statuses` |
| Updates/retraction | `/security_advisory_updates` |
| Affected users | `/user_security_advisories` |
| Affected VPS | `/vps_security_advisories` |
| Outage links | `/outage_security_advisories` |

API adapters are in `src/lib/api/securityAdvisories.ts` and
`src/lib/api/securityAdvisoryRelations.ts`. Admin screens are in
`src/pages/app/admin/security/`; public screens are in `src/pages/public/`.

## Verification

At minimum, changes to this workflow should cover:

- API path, namespace, filter and payload tests;
- CVE parsing/reconciliation and partial-failure behavior;
- publish readiness rules;
- node editor normalization and partial bulk retry;
- public privacy (no drafts, operator notes or affected identities);
- admin create, publish, update/retract and outage-link Playwright flows;
- direct user access to an admin route being rejected;
- English/Czech dictionary parity, typecheck and production build.

Live testing must use disposable advisories and follow the test-environment
runbook. Do not publish or mail affected users during a smoke test unless that
side effect was explicitly approved.
