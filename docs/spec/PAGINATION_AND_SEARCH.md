# Pagination and global search

This spec captures two cross-cutting UX requirements:

1) **Pagination** for all list pages (using HaveAPI `from_id`).
2) **Global search / quick-jump** (admin via `Cluster.Search`, non-admin limited unless backend adds support).

Last updated: 2026-02-28

## Pagination

### Why keyset pagination

HaveAPI index actions support keyset pagination via `from_id`.
This is stable and fast on large datasets.

### UX requirements

- Every list page that uses `Index` should have:
  - Next / Previous
  - Numbered pages between (based on visited history)
  - Current page indicator
  - Optional limit selector (e.g. 25/50/100)

### URL shape

We keep pagination in the URL for shareability.

Recommended query params:
- `from_id`: number (cursor)
- `page`: number (1-based, purely presentational)
- `limit`: number

Example (Mine scope preset shown):
- `/app/vps?limit=50&page=3&from_id=12345`

Notes:
- `/app` and `/admin` are **scope presets** (Mine vs All) for admins.
- The pagination query parameters are identical in either scope.

For pages that embed **multiple independent paginated lists** (e.g. an admin node detail page that shows both status samples and transactions), query params must be namespaced to avoid collisions.

Recommended pattern:
- `<prefix>from_id`, `<prefix>page`, `<prefix>limit`

Examples:
- `status_from_id`, `status_page`, `status_limit`
- `tx_from_id`, `tx_page`, `tx_limit`

This is supported by `useKeysetPagination` via the `paramPrefix` option.


### Implementation strategy

Keyset pagination does not support direct random access to page N without walking cursors.
Therefore:
- The UI maintains a **page stack** of cursors for the current filter set.
- Numbered pages represent the visited stack.
- “Previous” navigates back through the stack.

We reset the page stack when:
- filters change
- search query changes

### Cursor calculation

For descending lists (newest first):
- Page 1: no `from_id`
- Next page cursor = the **last item id** on the current page (i.e. the smallest `id` on the page)

For ascending lists (rare):
- Next page cursor = the **last item id** on the current page (i.e. the largest `id` on the page)

(Exact direction must match API defaults per endpoint.)

### Reference implementation

Code:

- Hook: `src/lib/hooks/useKeysetPagination.ts` — maintains a cursor stack, persists it in `sessionStorage`, and keeps `from_id`/`page`/`limit` synchronized with the URL.
- UI component: `src/components/ui/KeysetPagination.tsx` — Prev/Next + visited page numbers + limit selector.

Pages already migrated to the shared implementation:

- VPS list: `src/pages/app/VpsListPage.tsx`
- Transaction chains: `src/pages/app/TransactionChainsPage.tsx`
- Action states: `src/pages/app/ActionStatesPage.tsx`
- Datasets list: `src/pages/app/datasets/DatasetsListPage.tsx`
- NAS list alias: `src/pages/app/datasets/NasDatasetsPage.tsx` (same list implementation, fixed `role=primary`, no VPS filter)
- Exports list: `src/pages/app/exports/ExportsListPage.tsx`
- Dataset snapshots: `src/pages/app/datasets/DatasetSnapshotsPage.tsx` (server-side `q`)
- Dataset downloads: `src/pages/app/datasets/DatasetDownloadsPage.tsx` (server-side `q`)
- DNS zones list: `src/pages/app/dns/DnsZonesPage.tsx`
- DNS zone records: `src/pages/app/dns/DnsZoneRecordsPage.tsx` (server-side `q`)
- DNS zone logs: `src/pages/app/dns/DnsZoneLogsPage.tsx` (server-side `q`)
- Admin node detail (embedded lists): `src/pages/app/admin/NodeDetailPage.tsx`
- Admin node detail (embedded lists with `paramPrefix`): `src/pages/app/admin/NodeDetailPage.tsx`
- Monitoring events list: `src/pages/app/MonitoringEventsPage.tsx`
- Admin requests list: `src/pages/app/admin/RequestsPage.tsx`
- Admin incoming payments list: `src/pages/app/admin/IncomingPaymentsPage.tsx`
- Incident reports list: `src/pages/app/incidents/IncidentsPage.tsx`
- OOM reports list: `src/pages/app/oom/OomReportsPage.tsx`
- Profile / Admin user data templates: `src/components/user/UserDataTemplatesPanel.tsx` (server-side `q`, SFI)
- User namespaces list: `src/components/userNamespaces/UserNamespaceList.tsx` (SFI; numeric-id oriented)
- User namespace maps list: `src/components/userNamespaces/UserNamespaceMapList.tsx` (server-side `q`, SFI)

### Smart Filter Input pages

Some lists use a unified **Smart Filter Input** (SFI) instead of many inline inputs.

Guidelines:
- Plain text becomes a server-side `q` query (when supported by backend).
- `key:value` tokens map to existing backend filter params.
- A single number can act as a quick-jump to the detail page.
- Advanced filters are available via a drawer (for discoverability).
- The active filter set is always reflected in the URL for shareability.

## Global search / quick-jump

### What the backend supports today

- `Cluster.Search` exists and is **admin-only**.
- It can locate objects such as VPSes, users, IP addresses, networks, exports and transaction chains.
- It does **not** currently search datasets or DNS zones/records.

Therefore:
- v1 global search is primarily an **admin/support jump tool**.
- Non-admin users rely on per-page search/filtering (VPS list, datasets list, DNS list), unless we implement a limited “My VPS quick-jump”.

### UX goals

Admins/support must be able to quickly find:
- VPS by hostname or ID
- users (admin)
- IP addresses / networks (admin)
- exports / transaction chains (admin)

The search surface should not overwhelm:
- default to the most likely result group first
- keep secondary result groups behind progressive disclosure when needed

### Interaction model

- Desktop: search entry point in header.
- Shortcut: `Ctrl+K` / `Cmd+K` opens command palette.
- Mobile: search icon opens full-screen search sheet.

### Scope rules (admins)

- Mine vs All is not reliably enforceable inside `Cluster.Search` results (no owner metadata).
- If an admin is in Mine scope and opens a non-owned object, the normal Mine-scope guard applies.

### Results

- Group results by resource type (VPS, User, IP address, Network, Export, Transaction chain).
- Each result is a link.


## Acceptance criteria

- Lists have next/prev + visited page numbers.
- Pagination state is shareable via URL.
- Global search works with keyboard only.
- Admin global search uses `Cluster.Search` and returns results across supported object types.


## Admin lists

Admin pages follow the same keyset pagination rules (`from_id`, `limit`, numeric `page` stack in the URL). The page UI may apply additional client-side filtering/sorting **within the loaded page**.

- **Nodes** (`/admin/nodes`)
  - Primary index: `Node.Index` (`GET /api/v7.0/nodes`) with namespaced params:
    - `node[from_id]`, `node[limit]` (keyset pagination)
    - `node[q]` (server-side search by id/name/domain/fqdn)
    - `node[state]` (`active`/`inactive`/`all`)
  - Health augmentation: `Node.PublicStatus` (`GET /api/v7.0/nodes/public_status`) (not paginated).
  - When the authenticated index is unavailable, the page falls back to the public status list (unpaginated).

- **Migration plans** (`/admin/migration-plans`)
  - Index: `MigrationPlan.Index` (`GET /api/v7.0/migration_plans`) with `migration_plan[from_id]`, `migration_plan[limit]`.
  - Filters:
    - `q` (`migration_plan[q]`)
    - `state` (`migration_plan[state]`)
    - `user` (`migration_plan[user]`)

- **Migration plan migrations** (`/admin/migration-plans/:id`)
  - Index: `VpsMigration.Index` (`GET /api/v7.0/migration_plans/:id/vps_migrations`) with `vps_migration[from_id]`, `vps_migration[limit]`.

- **Admin user history** (`/admin/users/:userId/history`)
  - Specialized audit view over `ObjectHistory.Index` (`GET /api/v7.0/object_histories`) with `object_history[from_id]`, `object_history[limit]`.
  - View modes:
    - `changes` → fixed `object=User`, `object_id=:userId`
    - `actions` → fixed `user=:userId`
  - Search + filters: **server-side** via Smart Filter Input (SFI) + advanced drawer.
    - `q` (`object_history[q]`)
    - `event_type` (`object_history[event_type]`)
    - `user_session` (`object_history[user_session]`)
    - in `actions` view also: `object`, `object_id`

- **Users** (`/admin/users`)
  - Index: `User.Index` (`GET /api/v7.0/users`) with `user[from_id]`, `user[limit]`.
  - Search + filters: **server-side** (admin only).
    - `q` (`user[q]`) – OR-based search across `id/login/full_name/email/address/info`.
    - `role` (`user[role]`) – one of `user/support/admin`.
    - `level` (`user[level]`) – exact numeric level.
    - `mailer_enabled` (`user[mailer_enabled]`)
    - `lockout` (`user[lockout]`)
    - `password_reset` (`user[password_reset]`)
    - `enable_multi_factor_auth` (`user[enable_multi_factor_auth]`)
  - UI uses Smart Filter Input (SFI) + an advanced drawer; shareable links preserve filter state.

- **Mailer log** (`/admin/mailer/log`)
  - Index: `MailLog.Index` (`GET /api/v7.0/mail_logs`) with `mail_log[from_id]`, `mail_log[limit]`.
  - Filters:
    - `q` (`mail_log[q]`)
    - `mail_template` (`mail_log[mail_template]`)
    - `user` (`mail_log[user]`)
    - `created_after`, `created_before`

- **Mailer templates** (`/admin/mailer/templates`)
  - Index: `MailTemplate.Index` (`GET /api/v7.0/mail_templates`) with `mail_template[from_id]`, `mail_template[limit]`.
  - The current API exposes only keyset pagination for this index. The UI loads a bounded first 500 templates and applies search, exact `template_id`, and exact `user_visibility` filters locally; a visible warning explains when that bound is reached.
  - `q` searches id / `#id` / name / label / `template_id` in the loaded set.
  - Role, public and language filters are not sent because they are not part of the current API action contract.
  - Filter and numbered client-page state remains shareable in the URL.
  - Create supports all four API fields. On edit, `name` and `template_id` are intentionally read-only because they are operational identifiers used by the mailer and template registry; only `label` and `user_visibility` are submitted.
  - An ambiguous create response (transport loss, malformed response, or retryable/server HTTP status) blocks another create and offers a bounded, read-only keyset reconciliation instead of blindly repeating the POST. Translation creation follows the same rule per language.
  - Template deletion is intentionally disabled: the current API model does not cascade or restrict every user-template preference relation, so a direct delete could leave orphaned records. Translation and template-recipient relation deletes remain available.

- **Mailer recipients** (`/admin/mailer/recipients`)
  - Index: `MailRecipient.Index` (`GET /api/v7.0/mail_recipients`) with `mail_recipient[from_id]`, `mail_recipient[limit]`.
  - The current API has no search inputs. The UI loads a bounded first 500 recipients and applies `q`, `label`, `to`, `cc`, and `bcc` locally; a visible warning explains when that bound is reached.
  - UI uses Smart Filter Input (SFI) + an advanced drawer; shareable filter and numbered client-page state remains in the URL.
  - Recipient deletion is intentionally disabled because the current API model does not cascade or restrict its mail-template relations.

- **Mailer mailboxes** (`/admin/mailer/mailboxes`)
  - Index: `Mailbox.Index` (`GET /api/v7.0/mailboxes`) with `mailbox[from_id]`, `mailbox[limit]`.
  - Search + filters: **server-side**.
    - `q` (`mailbox[q]`) – label / server / user / `#id`
    - `server` (`mailbox[server]`)
    - `user` (`mailbox[user]`)
    - `enable_ssl` (`mailbox[enable_ssl]`)
  - UI uses Smart Filter Input (SFI) + an advanced drawer; shareable links preserve filter state.

- **IP addresses** (`/admin/ip-addresses`)
  - Index: `IpAddress.Index` (`GET /api/v7.0/ip_addresses`) with `ip_address[from_id]`, `ip_address[limit]`.
  - Filters are applied **server-side**. The smart input resolves an exact user login to its ID before requesting the list; `IpAddress.Index` itself has no full-text `q` parameter.
    - `addr` (`ip_address[addr]`) – exact IP address match
    - `prefix` (`ip_address[prefix]`) – exact prefix length
    - `vps` (`ip_address[vps]`) – VPS id
    - `user` (`ip_address[user]`) – user id (admin)
    - `network` (`ip_address[network]`) – network id
    - `network_interface` (`ip_address[network_interface]`) – interface id
    - `location` (`ip_address[location]`) – location id
    - `version` (`ip_address[version]`) – 4 or 6
    - `assigned_to_interface` (`ip_address[assigned_to_interface]`) – boolean
    - `order` (`ip_address[order]`) – `desc` (newest), `asc` (oldest), `interface`
  - UI uses Smart Filter Input (SFI) + an advanced drawer; shareable links preserve filter state.

- **Cluster DNS resolvers** (`/admin/cluster/dns-resolvers`)
  - Index: `DnsResolver.Index` (`GET /api/v7.0/dns_resolvers`) with `dns_resolver[from_id]`, `dns_resolver[limit]`.
  - Search + filters: **server-side**.
    - `q` (`dns_resolver[q]`) – label / IP / `#id`
    - `is_universal` (`dns_resolver[is_universal]`)
    - `location` (`dns_resolver[location]`)
  - UI now uses Smart Filter Input (SFI) + an advanced drawer; shareable links preserve filter state.

- **Cluster OS templates** (`/admin/cluster/os-templates`)
  - Index: `OsTemplate.Index` (`GET /api/v7.0/os_templates`) with server-side filtering.
  - Search + filters: **server-side**.
    - `q` (`os_template[q]`) – label / name / `#id`
    - `os_family` (`os_template[os_family]`)
    - `enabled` / `supported`
    - `hypervisor_type` / `cgroup_version`
    - `enable_script` / `enable_cloud_init`
  - UI now uses Smart Filter Input (SFI) + an advanced drawer; shareable links preserve filter state.

- **Cluster environments** (`/admin/cluster/environments`)
  - Index: `Environment.Index` (`GET /api/v7.0/environments`).
  - Search + filters: **server-side**.
    - `q` (`environment[q]`) – label / domain / description / `#id`
    - `has_hypervisor`, `has_storage`
  - UI now uses Smart Filter Input (SFI) + an advanced drawer; shareable links preserve filter state.

- **Cluster locations** (`/admin/cluster/locations`)
  - Index: `Location.Index` (`GET /api/v7.0/locations`).
  - Search + filters: **server-side**.
    - `q` (`location[q]`) – label / domain / description / environment label / `#id`
    - `environment`, `has_hypervisor`, `has_storage`, `hypervisor_type`
    - `shares_v4_networks_with`, `shares_v6_networks_with`, `shares_any_networks_with`, `shares_networks_primary`
  - UI now uses Smart Filter Input (SFI) + an advanced drawer; shareable links preserve filter state.

- **Cluster networks** (`/admin/cluster/networks`)
  - Index: `Network.Index` (`GET /api/v7.0/networks`) with `network[from_id]`, `network[limit]`.
  - Filters mapped to API inputs:
    - `q` (`network[q]`) (label/address search)
    - `location` (`network[location]`)
    - `ip_version` (`network[ip_version]`)
    - `role` (`network[role]`)
    - `managed` (`network[managed]`)
    - `purpose` (`network[purpose]`)
  - UI now uses Smart Filter Input (SFI) + an advanced drawer; shareable links preserve filter state.

- **Cluster resource packages** (`/admin/cluster/resource-packages`)
  - Index: `ClusterResourcePackage.Index` (`GET /api/v7.0/cluster_resource_packages`) with `cluster_resource_package[from_id]`, `cluster_resource_package[limit]`.
  - Search + filters: **server-side**.
    - `q` (`cluster_resource_package[q]`) – label / `#id`
    - `is_personal` (`cluster_resource_package[is_personal]`)
    - `environment` (`cluster_resource_package[environment]`)
    - `user` (`cluster_resource_package[user]`)
  - UI now uses Smart Filter Input (SFI) + an advanced drawer; shareable links preserve filter state.

- **System config** (`/admin/cluster/system-config`)
  - List is currently loaded in full from `SystemConfig.Index` and filtered client-side.
  - UI now uses Smart Filter Input (SFI) + an advanced drawer for:
    - free-text search (`q`) over key / label / category / description
    - exact `category` filtering
  - URLs stay shareable even though filtering is local because the dataset is loaded eagerly.



## User requests

- Route: `/app/requests`
- Same server-side request filters as the admin queue, but scoped to the current user by the API.
- Smart Filter Input is available; admin-only keys are rejected in user mode.

## DNS family additions

- DNS zone transfers: keyset pagination by `from_id` inside zone detail; no free-text search yet.
- DNSSEC records: read-only list inside zone detail; no free-text search.
- DNS zone servers status: keyset pagination by `from_id` inside zone detail; admin add/remove actions.
- Admin DNS servers: server-side `q`, `hidden`, `enable_user_dns_zones`, keyset pagination.
- Admin DNS TSIG keys: server-side `q`, `user`, `algorithm`, keyset pagination.


- **Admin networking / Host IP addresses** (`/admin/networking/host-ip-addresses`)
  - Index: `HostIpAddress.Index` (`GET /api/v7.0/host_ip_addresses`) with keyset pagination.
  - Filters:
    - `q`
    - `user`
    - `vps`
    - `assigned`

- **Admin networking / IP assignment audit** (`/admin/networking/ip-address-assignments`)
  - Index: `IpAddressAssignment.Index` (`GET /api/v7.0/ip_address_assignments`) with keyset pagination.
  - Filters:
    - `q`
    - `user`
    - `vps`
    - `active`
    - `order`

- **Admin networking / Live monitor** (`/admin/networking/live`)
  - Index: `NetworkInterfaceMonitor.Index` (`GET /api/v7.0/network_interface_monitors`).
  - Filters:
    - `q`
    - `user`
    - `vps`
    - `node`
    - `order`
  - Polling list; no keyset cursor.

- **Admin networking / Top users** (`/admin/networking/traffic-users`)
  - Index: `NetworkInterfaceAccounting.UserTop` (`GET /api/v7.0/network_interface_accountings/user_top`).
  - Filters:
    - `q`
    - `year`
    - `month`
  - Cursor: `from_bytes`.
