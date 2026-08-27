# dev.crucio.cz live parity workflow

This checklist is for human-run verification of real VPS and dataset workflows
on `dev.crucio.cz`. It is intentionally manual and opt-in: do not run
destructive operations from CI or the AI issue runner.

## Safety rules

- Use only the development/test deployment at `https://dev.crucio.cz`.
- Do not use production objects, secrets, fixed database IDs, or production API
  endpoints.
- Keep object names obvious. Suggested prefixes:
  - VPS: `webui-next-live-test-*`, `webui-next-playground-*`, or
    `webui-next-staging-*`
  - dataset/snapshot/download labels: `webui-next-live-test-*`
- Before deleting, reinstalling, rolling back, or swapping, confirm the object
  owner, hostname/full dataset name, node/location, expiration, and IP
  assignments in the UI.
- Record returned action-state IDs and final backend/UI state in the PR notes.

## Identify safe objects

1. Create or select a disposable source VPS owned by the tester or a dedicated
   dev test user. It should have no production traffic, no irreplaceable data,
   and a hostname that clearly starts with `webui-next-live-test-`.
2. Create or select a second disposable VPS for swap testing. Its hostname
   should include `playground`, `staging`, `test`, or `dev` so the UI can mark
   it as a likely swap target.
3. Create or select a disposable dataset under the source VPS or another dev
   storage area. Prefer a full name ending in `webui-next-live-test-*`.
4. Create a small test file inside the dataset/VPS if rollback or backup
   verification needs visible state. Do not use private or production data.
5. Store object IDs only in local notes or environment variables for the test
   run; do not commit them.

## Optional non-destructive Playwright readiness check

The live readiness spec opens the real workflows and verifies that labels,
previews, and confirmation gates are present. It does not submit clone, swap,
delete, reinstall, rollback, or download actions.

Example:

```sh
E2E_BASE_URL=https://dev.crucio.cz \
E2E_IGNORE_HTTPS_ERRORS=1 \
E2E_STORAGE_STATE=/path/to/local-dev-auth-state.json \
E2E_LIVE_PARITY=1 \
E2E_LIVE_VPS_ID=... \
E2E_LIVE_SWAP_TARGET_VPS_ID=... \
E2E_LIVE_DATASET_ID=... \
npm run e2e:live:manual
```

For a broader screenshot/video audit of the live UI shell, task drawer,
lifecycle workflows, storage/NAS and requests, run:

```bash
E2E_BASE_URL=https://dev.crucio.cz \
E2E_LIVE_SESSION_TOKEN_FILE=/root/playwright-live-token \
E2E_LIVE_VPS_ID=... \
E2E_LIVE_SWAP_TARGET_VPS_ID=... \
E2E_LIVE_ACTION_STATE_ID=... \
npm run e2e:live:audit
```

The audit writes screenshots, videos and `report.json` under
`work/live-audits/<timestamp>/`. It fails on broken checks or JavaScript assets
served with the wrong MIME type.

### Broad read-only route sweep

For a much broader, mutation-free pass over the public, user and (when the
token permits it) admin UI, run:

```bash
E2E_BASE_URL=https://dev.crucio.cz \
E2E_LIVE_API_URL=https://dev.crucio.cz \
E2E_LIVE_SESSION_TOKEN_FILE=/root/playwright-live-token \
npm run e2e:live:routes
```

The runner has a hard guard for the exact `https://dev.crucio.cz` origin. It
cannot be pointed at production, another host, a sub-path or a non-standard
port. It performs no POST, PUT, PATCH or DELETE requests. It covers:

- anonymous status, outage, news, advisory and 404 pages in English and Czech,
- canonical list/static user routes,
- canonical list/static admin routes allowed for the token's exact role;
  administrator-only security advisory management is not swept with a support
  token,
- public detail routes discovered from an anonymous read-only API response,
- admin detail routes discovered only from an unrestricted admin response (or
  supplied through an `E2E_LIVE_*_ID` variable),
- user detail routes only when an API response filtered to the current user
  also exposes and confirms that same owner; optional
  `E2E_LIVE_APP_*_ID` values are treated only as candidates and must pass that
  ownership check,
- desktop and mobile viewports, including a direct reload of every route,
- an actual visible page surface (a visible main region and heading, or an
  explicit test id), redirects, lingering loaders, HTTP 401/403/404/5xx,
  visible errors, console/page errors, asset MIME types and document-level
  horizontal overflow.

Public screenshots and a redacted `report.json` are written below
`work/live-audits/route-sweep-<timestamp>/`. Directories use mode `0700` and
files mode `0600`; symlinked output paths (including symlinked ancestors) are
rejected. Authenticated full-page screenshots are disabled by default because
they can contain user data. Capture them only for an approved local run with
`E2E_LIVE_SWEEP_AUTH_SCREENSHOTS=1`; screenshot failures are reported as test
failures. Authenticated report entries contain route templates and presence
flags, not real IDs, titles,
headings, tokens, response bodies or user labels. To run only the anonymous
portion without a token, use
`E2E_LIVE_SWEEP_PUBLIC_ONLY=1`. Set `E2E_LIVE_SWEEP_RELOAD=0` only for a quick
diagnostic run; the default audit reloads every page.

Optional admin IDs include `E2E_LIVE_VPS_ID`, `E2E_LIVE_DATASET_ID`,
`E2E_LIVE_NAS_DATASET_ID`, `E2E_LIVE_DNS_ZONE_ID`,
`E2E_LIVE_TRANSACTION_CHAIN_ID`, `E2E_LIVE_TRANSACTION_ID`,
`E2E_LIVE_ACTION_STATE_ID`, `E2E_LIVE_USER_ID`, `E2E_LIVE_NODE_ID` and the
other variables declared in `scripts/live-route-sweep-manifest.mjs`. For app
detail candidates, insert `APP` after `E2E_LIVE`, for example
`E2E_LIVE_APP_VPS_ID`. App candidates are still ignored unless the user-scoped
API result proves they belong to the current user. Use only disposable app
objects with an obvious `webui-next-live-test-*` label. IDs are local run
configuration and must not be committed.

The route sweep authenticates only with
`E2E_LIVE_SESSION_TOKEN`/`E2E_LIVE_SESSION_TOKEN_FILE`; it does not read a
Playwright storage-state file. Keep the token file local with mode `0600` and
never commit it.

## Mocked PR verification baseline

The storage/NAS mocked workflow coverage for issue #127 was verified on the
dev machine after the pull request was opened:

```sh
npm run typecheck
E2E_START_SERVER=1 node scripts/playwright.mjs test e2e/specs/app/nas_smoke.spec.ts e2e/specs/app/vps_storage_tab_mounts.spec.ts --project=chromium --workers=2
```

The Playwright run covered 7/7 tests. This does not replace the live
`dev.crucio.cz` checklist below; it only confirms the stable mocked paths.

## VPS workflows

### Clone

1. Open `/admin/vps/<source-id>/lifecycle`.
2. In `Clone VPS`, confirm the source hostname and owner.
3. For admin mode, select the dev test owner and a suitable dev node. For user
   mode, select a dev location.
4. Set hostname to `webui-next-live-test-clone-<date>`.
5. Keep subdatasets, dataset plans, resources, and features enabled unless the
   specific scenario needs otherwise.
6. Submit only after confirming this is a disposable source.
7. Verify the action-state progress appears, the returned VPS opens, hostname
   and owner are correct, and cloned datasets/resources match expectations.

### Swap with staging/playground VPS

1. Open the source VPS lifecycle page and click `Open swap flow`.
2. Prefer a UI-suggested target whose hostname includes `playground`,
   `staging`, `test`, or `dev`.
3. If needed, enter the target as `#<target-id>`.
4. Review the swap preview table, especially hostname, resources, expiration,
   node/location, owner, and IP assignment direction.
5. In admin mode, decide whether hostname, resources, and expirations should be
   swapped.
6. Submit only when both VPS are disposable.
7. Verify the action-state ID, both VPS detail pages, IP assignments, resource
   values, and expiration dates after completion.

### Delete / lazy delete

1. Open the disposable VPS lifecycle page.
2. Confirm the hostname, owner, and lack of production traffic.
3. Keep `Lazy delete` enabled for the standard dev verification unless a human
   explicitly asks for hard delete testing.
4. Submit the delete action.
5. Verify the action-state ID and resulting object state or list removal.

### Rescue boot / reinstall / template metadata

1. Use only a disposable VPS with known-good backups or throwaway data.
2. For rescue boot, select the intended OS template and decide whether the
   original root dataset should be mounted.
3. Verify the warning copy and submit only when the temporary rescue behavior is
   expected.
4. For reinstall, select the OS template and confirm that root filesystem data
   may be replaced.
5. For template metadata, update only harmless template metadata fields and
   verify the saved values after refresh.
6. Record action-state IDs and final VPS boot/template state.

### Lifetime / expiration update

1. Open the VPS lifecycle page.
2. In the lifetime panel, note the current expiration/reminder values.
3. Change expiration to a short dev-only value, then save.
4. Verify the action-state ID and refreshed expiration display.
5. Restore the previous value if the object will remain available for further
   testing.

## Dataset workflows

### NAS and storage list checks

1. Open `/admin/nas` and verify the page title is `NAS`.
2. Confirm the request returns primary-role datasets and the rows show clear
   dataset names/full names, owner login when available, usage, snapshot count,
   mount count, export count, and object state.
3. Open advanced filters and confirm there is no VPS filter on NAS. In admin
   mode, the owner filter is expected to remain available.
4. Search for one known NAS dataset by a distinctive name fragment, then clear
   filters and verify the unfiltered NAS list returns.
5. Open `/admin/datasets` and compare the same dataset detail links with
   `/admin/nas`; the NAS page should be an alias focused on primary-pool
   datasets, while the general datasets list keeps VPS filtering.

### VPS storage tab

1. Open `/admin/vps/<source-id>/storage` for a disposable VPS with a root
   dataset.
2. Verify the root dataset card shows used/available/refquota/quota/referenced
   values, object state, snapshot count, mount count, and export count.
3. Follow the root dataset links without submitting actions:
   `Open dataset`, `Snapshots and backups`, `Create snapshot`, `Restore or
   rollback`, `Create backup`, and `Downloads`.
4. Return to the storage tab and verify each mount row shows mountpoint,
   dataset link, mode, type, enabled state, on-start-fail behavior, default map,
   current state, expiration, created timestamp, and updated timestamp when the
   API exposes them.
5. In admin mode, confirm the `Master` column and create/edit `Master enabled`
   control are visible. In user mode, confirm they are hidden.
6. Open add/edit/delete mount dialogs, verify validation and confirmation
   gates, then cancel unless a human explicitly asked for mutation testing.

### Create / edit / delete

1. Open `/admin/datasets/<parent-id>`.
2. Create a child dataset named `webui-next-live-test-<date>`.
3. Use small quotas/refquotas and default-safe storage properties unless the
   scenario requires a specific property.
4. Verify navigation to the returned dataset and refreshed full name.
5. Edit a harmless property such as quota/refquota, compression, or sync.
6. Delete only the disposable child dataset. Type the exact full dataset name in
   the confirmation dialog.
7. Verify the action-state/backend result and that the deleted dataset no
   longer appears.

### Snapshot create / delete / rollback

1. Open `/admin/datasets/<dataset-id>/snapshots`.
2. Create a snapshot labeled `webui-next-live-test-before-change`.
3. Verify the action-state ID and that the snapshot appears in the list.
4. For rollback, first make a small reversible test change in the disposable
   dataset.
5. Type the exact snapshot label/name in the rollback confirmation dialog.
6. Verify the rollback action-state ID and resulting dataset contents.
7. Delete only test snapshots, using the exact label/name confirmation.

### Backup/download create and delete

1. Open `/admin/datasets/<dataset-id>/downloads`.
2. Create a download from a test snapshot. Use archive for the simplest check,
   or incremental stream only when both base and target snapshots are
   disposable and understood.
3. Verify the action-state ID, ready/pending state, file name, size, checksum,
   expiration, and download URL when available.
4. If downloading the file, keep it local and do not commit it.
5. Delete the test download record by typing the exact required confirmation
   value.
6. Verify the record is removed or no longer listed.

## Storage and backup parity notes

Current new-UI coverage:

- `/app/nas` and `/admin/nas` list primary-role datasets with NAS-specific
  empty/error copy and no VPS filter.
- `/app/datasets` and `/admin/datasets` list datasets, owner/VPS context,
  usage, snapshot/mount/export counts, state, and links to detail pages.
- Dataset detail supports subdataset create, storage property edit, delete,
  snapshot create/delete, admin rollback, snapshot download creation, ready
  download links, and download deletion when role gates allow them.
- `/app/vps/<id>/storage` and `/admin/vps/<id>/storage` show root dataset
  backup/restore entry links plus mount create/edit/delete flows. Mutating
  actions track returned action-state IDs through the normal task/progress UI.

Legacy `page_backup.php` actions still needing explicit parity follow-up:

- A single legacy backup page combined VPS backup, NAS, restore, snapshot,
  download, and download cleanup flows. The new UI intentionally splits these
  across VPS storage, dataset snapshots, dataset downloads, and NAS list
  surfaces; a dedicated parity review should verify no discoverability gap
  remains for users who expect one backup hub.
- Full restore parity is represented as snapshot rollback on the dataset
  snapshot page. Any legacy VPS-level restore wizard or backup-source chooser
  should be compared against real dev lab objects before marking complete.
- Download-link details depend on API fields (`url`, checksum, size,
  expiration). If the API omits them for a live object, the UI can only show
  pending/metadata state and the missing fields should be recorded in PR notes.
- Retention policy, backup plan, or scheduled backup management is not exposed
  as a first-class new-UI backup screen beyond dataset plans and snapshot
  download entry points. Treat this as a follow-up unless the legacy UI confirms
  it is not part of the target workflow.

## PR verification notes

For the pull request, include:

- Object naming pattern used, not fixed IDs.
- Which NAS/storage nodes or object labels were checked on `dev.crucio.cz`.
- Which VPS workflows were exercised.
- Which dataset, snapshot, and download workflows were exercised.
- Action-state IDs and final state observations.
- Anything skipped because it was unsafe or unavailable on dev.
