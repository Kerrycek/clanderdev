# Incident report create capability

## Current contract

As of 2026-07-31, incident report creation is an administrator-only action in
WebUI Next:

- the regular-user incident list does not render a create action;
- `/app/incidents/new` resolves to an explicit forbidden state instead of being
  parsed as an incident ID;
- the user-facing route does not send `POST /incident_reports`;
- `/admin/incidents/new` remains the only creation UI.

The frontend therefore does not present a dead action that would fail only
after form submission. This is covered by
`e2e/specs/app/incident_create_permissions.spec.ts`.

## Backend capability needed for user reporting

To safely enable incident reporting for regular users, the API needs an
explicit, object-scoped capability decision. A role or UI-mode check is not
enough. The response should answer whether the current session may create an
incident for a specific owned VPS, for example:

```json
{
  "incident_report": {
    "can_create": true,
    "allowed_vps_ids": [123],
    "allowed_fields": ["subject", "text", "detected_at"]
  }
}
```

The API must still enforce the same rules on `POST /incident_reports` and
return HTTP 403 for a foreign VPS or disallowed field. The UI can expose the
create action only after this capability is true. Until that server contract
exists, regular-user creation intentionally remains unavailable.

## Required verification when the capability is added

1. A least-privileged user can create a report for an owned VPS.
2. The same user receives HTTP 403 for a foreign VPS.
3. Admin-only fields (`codename`, mailbox, CPU limit, VPS action and arbitrary
   IP assignment) are neither rendered nor accepted from a regular user.
4. Direct URL access and the list CTA follow the same capability decision.
