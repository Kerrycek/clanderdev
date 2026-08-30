# vpsAdmin API upgrade audit - updated 2026-08-30

This note records the API baseline used while developing WebUI Next. It is an
operational plan, not an authorization to migrate or restart the API.

## Current verified state

| Target | Commit | Version | State |
| --- | --- | --- | --- |
| Official `vpsfreecz/vpsadmin` upstream | `3ded1bb20e9eceab2e47152cc438aaebda98f767` | 4.2.1 | Current reference as of 2026-08-30 11:55 UTC |
| API process serving `dev.crucio.cz` | `4a397464d945772bafe0328d2f2c512381f7400c` | 4.2.1 | Clean release, running since 2026-08-29 18:38 CEST |
| Legacy checkout on the test host (`/opt/vpsadmin`) | `10eefaccfef46393dab0b0ec82ef140f760220e8` | 4.1.0 | Stale and dirty; not used by the API service |
| Original local reference checkout | `eb9c9dd6b7beedf713a0da50a9be68025285463d` | 4.1.0 | Stale; preserve local files |

The running API is on the current 4.2.1 release line. It is one upstream commit
behind; that commit only updates gem dependencies. The HaveAPI protocol remains
version 7.0. No WebUI capability or migration required by this beta pass is
missing from the running release.

A clean, detached reference checkout of the current upstream was created at
`/Users/kerrycze/git/vpsadmin-upstream-current`. The original local checkout
was not reset because it contains user-owned files under `tools/ux-usage/`.

The active systemd process was verified to have its working directory at
`/srv/vpsadmin-release/releases/4a397464d945772bafe0328d2f2c512381f7400c/api`.
The release checkout is clean. The core and plugin migration logs show all 17
core and 3 plugin migrations completing successfully, including the latest OOM
counter migration. The public API description and `dev.crucio.cz` health checks
return HTTP 200.

The unrelated console keyboard changes remain only in `/opt/vpsadmin`; the
running service does not load code from that checkout.

## Dev-only live-certification lifetime fixture

The first guarded live VPS cleanup on 2026-08-30 exposed a configuration gap,
not an API-version mismatch. `DELETE /vpses/:id` with `lazy=false` always asks
the Lifetimes subsystem to derive an expiration for the `hard_delete` state.
Environment `11` (`playground-lab`) had no matching `DefaultLifetimeValue`, so
the official endpoint returned HTTP 500 before it could create a deletion
transaction.

On 2026-08-31 an idempotent, environment-scoped row was created and read back
through the running 4.2.1 application model:

| Field | Verified value |
| --- | --- |
| Row | `default_lifetime_values.id=1` |
| Environment | `11` (`playground-lab`) |
| Object / transition | `Vps`, `enter`, `hard_delete` |
| Added expiration | `0` seconds |
| Reason | `Dev live VPS certification hard delete` |

This is test-environment data only. It does not alter API source, the public
contract, another environment, or production. Its purpose is to let guarded
certification exercise the same official hard-delete endpoint that the UI
uses, with immediate expiry for disposable test VPSes. Remove only this exact
row if the `playground-lab` certification fixture is retired; do not delete
other lifetime defaults by a broad query.

## Why future upgrades are not pull-and-restart operations

The completed transition from the legacy checkout to 4.2.1 included:

- 17 new core database migrations;
- 3 new plugin migrations, in addition to one already pending outage-report
  migration on the test machine;
- changes to `api/Gemfile`, `flake.nix`, and `flake.lock`;
- schema and data migrations for localized configuration and news, node and
  security-advisory evidence, DNS transfer cleanup, livepatch events, MFA and
  OOM counters.

The legacy API checkout on the test machine still contains unrelated local
console keyboard changes. It must not be pulled, reset, or used as a future
release checkout.

Updating only the code can leave the API running against an incompatible
schema. Rolling back only the code is likewise insufficient after migrations.

## Required procedure for the next API upgrade

Perform the API upgrade as a separate, explicitly approved maintenance task:

1. Record the exact running service, repository, configuration, and database
   versions without printing secrets.
2. Preserve the unrelated console-router changes as a patch; do not build a
   release from the dirty checkout.
3. Create a clean release checkout pinned to the approved upstream commit.
4. Back up the database and configuration, and prove that the backup can be
   restored.
5. Build the Nix and Ruby dependencies from the pinned release.
6. Restore a recent database copy in an isolated environment and run all core
   and plugin migrations there first.
7. Run API, nodectld, DNS, payments, outage, node, and WebUI acceptance tests
   against the migrated database copy.
8. In an approved maintenance window, stop or fence all writers, take the
   final database backup, run the reviewed migrations, and start the pinned
   release.
9. Verify API health and authenticated WebUI workflows. A rollback must restore
   both the previous release and the pre-migration database backup.

## WebUI compatibility rule

WebUI Next should use the official 4.2.1 contract while testing important
actions against the exact deployed release commit. Updating the test API by the
single remaining dependency-only commit should be handled as a separate pinned
release after its dependency build and smoke tests pass; it is not required to
certify the current WebUI beta candidate. A feature that depends on a newer
endpoint or field must still be capability-gated and show an honest unavailable
state; it must not fabricate data or silently submit a different payload.
