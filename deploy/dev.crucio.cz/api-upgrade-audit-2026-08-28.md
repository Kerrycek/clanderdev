# vpsAdmin API upgrade audit — 2026-08-28

This note records the API baseline used while developing WebUI Next. It is an
operational plan, not an authorization to migrate or restart the API.

## Compared versions

| Target | Commit | Version | State |
| --- | --- | --- | --- |
| Official `vpsfreecz/vpsadmin` upstream | `4a397464d945772bafe0328d2f2c512381f7400c` | 4.2.1 | Current reference |
| API serving `dev.crucio.cz` | `10eefaccfef46393dab0b0ec82ef140f760220e8` | 4.1.0 | Running test API |
| Original local reference checkout | `eb9c9dd6b7beedf713a0da50a9be68025285463d` | 4.1.0 | Stale; preserve local files |

The running test API is 191 commits behind the official upstream. The HaveAPI
protocol remains version 7.0, but the implementation and database schema have
changed materially.

A clean, detached reference checkout of the current upstream was created at
`/Users/kerrycze/git/vpsadmin-upstream-current`. The original local checkout
was not reset because it contains user-owned files under `tools/ux-usage/`.

## Why this is not a pull-and-restart upgrade

The transition from the running commit to the current upstream includes:

- 17 new core database migrations;
- 3 new plugin migrations, in addition to one already pending outage-report
  migration on the test machine;
- changes to `api/Gemfile`, `flake.nix`, and `flake.lock`;
- schema and data migrations for localized configuration and news, node and
  security-advisory evidence, DNS transfer cleanup, livepatch events, MFA and
  OOM counters.

The API checkout on the test machine also contains unrelated local console
keyboard changes. It must not be pulled, reset, or used as the next release
checkout.

Updating only the code can leave the API running against an incompatible
schema. Rolling back only the code is likewise insufficient after migrations.

## Required upgrade procedure

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

Until the maintenance upgrade is approved, WebUI Next should use the current
official upstream as the canonical contract while testing important actions
against the currently deployed API commit. A feature that depends on a newer
endpoint or field must be capability-gated and show an honest unavailable
state on the old API; it must not fabricate data or silently submit a different
payload.
