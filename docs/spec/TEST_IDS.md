# Stable test IDs (data-testid) conventions

Reliable e2e and UI integration tests require stable selectors.

We **do not** want tests to depend on:
- Tailwind class names
- icon SVG structure
- translated text content (EN/CS)
- DOM ordering that may change with responsive layouts

Therefore, all interactive controls and key page surfaces must expose **`data-testid`**
attributes following a consistent naming scheme.

This spec defines that naming scheme and the minimum required test IDs.

---

## Principles

1) **Stable across languages and themes**
- test IDs must not change when language/theme changes.

2) **Stable across minor layout changes**
- tests should attach to semantic targets, not to exact tree structure.

3) **Human-readable**
- IDs are part of the repo contract; avoid opaque hashes.

4) **Module-prefixed**
- prevent collisions across pages.

5) **Do not encode styling**
- never include e.g. `dense`/`dark` in the id.

6) **Unique in DOM**
- Playwright locators run in strict mode; a given test id must identify **exactly one** element.
- For responsive pages that render both mobile cards and a desktop table at once (with CSS hiding), do **not**
  reuse the same `.row.<id>` id in both variants.
  - Use `.row.<id>` for the desktop table
  - Use `.card.<id>` for the mobile card representation

---

## Naming format

Use dot-separated identifiers:

- `shell.*` for app chrome
- `nav.*` for navigation
- `tasks.*` for tasks drawer
- `vps.*`, `dataset.*`, `dns.*`, `admin.*` for module pages
- `public.*` for public pages

For items that have a numeric id, append the id:

- `vps.row.123`
- `dataset.row.77`
- `dns.zone.row.42`

If an element can exist multiple times within a row, suffix the control:

- `vps.row.123.action.restart`
- `dns.record.row.555.action.delete`

---

## Generic component contracts

### ActionButton disabled-reason modal

When an `ActionButton` is disabled via `disabled={true}` **and** provides a `disabledReason`, clicking it opens a small modal explaining why the action is blocked.

For an `ActionButton` with `testId="X"`, the modal MUST use these IDs:

- `X.reason` (modal container)
- `X.reason.close` (close button)

This keeps gating tests stable across EN/CS copy changes.

### ConfirmDialog modal buttons

When a `ConfirmDialog` is rendered with `testId="X"`, it MUST render these IDs:

- `X` (modal container)
- `X.cancel` (cancel button)
- `X.confirm` (confirm button)

### ErrorState actions and details

When an `ErrorState` is rendered with `testId="X"`, it MUST render these IDs:

- `X` (container)
- `X.retry` (primary action)
- `X.back` (secondary action, if shown)
- `X.status` ("Open status" action, if shown)
- `X.copy_details` (copy button; may appear either in the action row or inside details)
- `X.details` (details disclosure)

### EmptyState action

When an `EmptyState` is rendered with `testId="X"` and also provides an action, it MUST render:

- `X` (container)
- `X.action` (action button)


---

## Required test IDs (minimum)


### Auth and failure surfaces

Auth gate:
- `auth.loading`
- `auth.login-required`
- `auth.session-error`
- `auth.forbidden`
- `auth.admin-required`

OAuth flow pages:
- `oauth.login.page`
- `oauth.callback.page`
- `oauth.logout.page`

Not found / forbidden / unexpected error:
- `notfound.page`
- `forbidden.page`
- `error.page`

Mode gates:
- `mode.gate.advanced` (advanced required surface)
- `mode.gate.advanced.switch`
- `mode.gate.advanced.back`
- `mode.gate.advanced.home`

### App shell

- `shell.header`
- `shell.main`
- `shell.sidebar`
- `shell.mobile-nav-button`
- `shell.user-menu-button`
- `shell.user-menu`
  - `shell.user-menu.scope.mine` (admin only)
  - `shell.user-menu.scope.all` (admin only)
  - `shell.user-menu.mode.advanced`
  - `shell.user-menu.mode.basic`
  - `shell.user-menu.theme.system`
  - `shell.user-menu.theme.light`
  - `shell.user-menu.theme.dark`
  - `shell.user-menu.language.system`
  - `shell.user-menu.language.en`
  - `shell.user-menu.language.cs`
  - `shell.user-menu.account`
  - `shell.user-menu.public-status`
  - `shell.user-menu.logout`

Sync / connection indicator (only rendered when there is a problem):
- `shell.sync-indicator` (header button)
- `shell.sync-panel` (popover)
  - `shell.sync-panel.retry`
  - `shell.sync-panel.reload`
  - `shell.sync-panel.last-error` (only for error state)

Sync banner (rendered on key pages when there is a sync problem):
- `sync.banner` (banner container)
  - `sync.banner.retry`
  - `sync.banner.reload`
  - `sync.banner.last-error` (error state, when an error is available)

Lock-state staleness banner (rendered on object detail pages when lock state is degraded):
- `stale.lock.alert` (banner container)
  - `stale.lock.alert.retry`
  - `stale.lock.alert.reload`
  - `stale.lock.alert.last-known` (when last-known chain ids are available)
  - `stale.lock.alert.last-error` (when an error is available)

### Command palette

- `palette.open` (header launcher button)
- `palette.modal`
- `palette.input`
- `palette.result.<index>`

### Navigation

Navigation is rendered in two variants:
- desktop sidebar (always in DOM; hidden on mobile via CSS)
- mobile drawer (only rendered when opened)

To avoid duplicate test ids, use variant-prefixed IDs:

Mobile drawer container:
- `nav.drawer`
- `nav.drawer.close`

Primary items:
- `nav.sidebar.dashboard` / `nav.drawer.dashboard`
- `nav.sidebar.vps` / `nav.drawer.vps`
- `nav.sidebar.datasets` / `nav.drawer.datasets`
- `nav.sidebar.dns` / `nav.drawer.dns`
- `nav.sidebar.transactions` / `nav.drawer.transactions`
- `nav.sidebar.action-states` / `nav.drawer.action-states`
- `nav.sidebar.status` / `nav.drawer.status`
- `nav.sidebar.account` / `nav.drawer.account`

Admin only:
- `nav.sidebar.nodes` / `nav.drawer.nodes`
- `nav.sidebar.migration-plans` / `nav.drawer.migration-plans`
- `nav.sidebar.admin-info` / `nav.drawer.admin-info`

### Dashboard page

- `app.dashboard.page`
- `app.dashboard.header`
- `app.dashboard.summary-grid`
- `app.dashboard.kpi.vps`
- `app.dashboard.kpi.vps.open`
- `app.dashboard.kpi.tasks`
- `app.dashboard.kpi.tasks.open`
- `app.dashboard.kpi.datasets`
- `app.dashboard.kpi.datasets.open`
- `app.dashboard.kpi.dns`
- `app.dashboard.kpi.dns.open`

---

## Design sandbox

The sandbox is an internal component gallery and the canonical surface for screenshot regressions.

Page + controls:
- `design.page`
- `design.header`
- `design.switch_shell` (admin only; switches between `/app/_design` and `/admin/_design`)
- `design.controls`
  - `design.controls.theme`
  - `design.controls.language`
  - `design.controls.mode`
    - `design.controls.mode.advanced`
    - `design.controls.mode.basic`
  - `design.controls.summary` (data attributes: `data-theme`, `data-language`, `data-mode`)

Sections:
- `design.section.tokens`
- `design.section.typography`
- `design.section.components`
- `design.section.states`
- `design.section.tables`
- `design.section.tasks`
- `design.section.visualization`

Modal/drawer demos:
- `design.modal`
- `design.drawer.left`
- `design.drawer.left.close`
- `design.drawer.right`
- `design.drawer.right.close`
- `design.blocking_modal`

Table + pagination demo:
- `design.tables.tablecard`
- `design.tables.table`
- `design.tables.pagination` (KeysetPagination prefix)
  - `design.tables.pagination.prev`
  - `design.tables.pagination.next`
  - `design.tables.pagination.page.<n>`
  - `design.tables.pagination.limit`

### Tasks drawer

- `tasks.open-button`
- `tasks.drawer`
- `tasks.close-button` (explicit close control; aither feedback)
- `tasks.filter-input`

Transaction chains panel:
- `tasks.chains.section`
- `tasks.chains.row.<id>`
- `tasks.chains.row.<id>.toggle-items`

Action states panel:
- `tasks.actions.section`
- `tasks.actions.row.<id>`
- `tasks.cancel_dialog.*` (ConfirmDialog prefix, used when cancelling an action state)

### Toast notifications

- `toast.viewport`
- `toast.item.<id>`
- `toast.item.<id>.close`
- `toast.item.<id>.action` (if the toast provides an action button)

Additional stable toast action IDs (used when a toast must be asserted across route switches):
- `toast.scope.all.back` (All objects scope warning)
- `toast.mode.basic.switch-to-advanced` (basic-mode redirect warning)

### Progress modals

Blocking action progress modal (used for start/stop/restart):
- `modal.action_progress`
- `modal.action_progress.open_tasks`
- `modal.action_progress.continue`

### Preferences

- `prefs.theme`
- `prefs.language`
- `prefs.ui-mode.advanced`
- `prefs.ui-mode.basic`
- `prefs.scope.mine` (admins only)
- `prefs.scope.all` (admins only)

### Profile / account

- `profile.page`

Top-level sections:
- `profile.header`
- `profile.summary`
- `profile.user.card`
- `profile.prefs.card`
- `profile.tips.card`

SSH keys:
- `profile.keys.card`
- `profile.keys.add`
- `profile.keys.table`
- `profile.keys.row.<id>`
- `profile.keys.row.<id>.edit`
- `profile.keys.row.<id>.delete`

SSH key modal:
- `profile.keys.modal`
- `profile.keys.modal.label`
- `profile.keys.modal.key`
- `profile.keys.modal.auto_add`
- `profile.keys.modal.cancel`
- `profile.keys.modal.save`

SSH key delete confirm:
- `profile.keys.delete_dialog.*` (ConfirmDialog prefix)

Sessions:
- `profile.sessions.card`
- `profile.sessions.refresh`
- `profile.sessions.state`
- `profile.sessions.search`
- `profile.sessions.table`
- `profile.sessions.row.<id>`
- `profile.sessions.row.<id>.rename`
- `profile.sessions.row.<id>.close`

Rename session modal:
- `profile.sessions.rename_modal`
- `profile.sessions.rename_modal.label`
- `profile.sessions.rename_modal.cancel`
- `profile.sessions.rename_modal.save`

Close session confirm:
- `profile.sessions.close_dialog.*` (ConfirmDialog prefix)

### Pagination component

The shared pagination widget uses a **configurable prefix** (default: `pagination`).

For a widget instance with prefix `<p>`:

- `<p>`
- `<p>.prev`
- `<p>.next`
- `<p>.page.<n>` (visited pages only)
- `<p>.limit` (optional limit selector)

Examples:

- `pagination.*` (single instance on a page)
- `vps.pagination.desktop.*` and `vps.pagination.mobile.*` (when we render separate desktop/mobile instances)

### Action states page

- `action_states.page`
- `action_states.list.header`
- `action_states.list.filters`
- `action_states.search.input`
- `action_states.order.select`
- `action_states.refresh`
- `action_states.errors_toggle`
- `action_states.clear_filters`
- `action_states.open_tasks`
- `action_states.loading` (LoadingState)
- `action_states.error` (ErrorState)
- `action_states.empty` (EmptyState)
- `action_states.empty_filtered` (EmptyState)
- `action_states.row.<id>`
- `action_states.pagination.*`

### Action state detail page

- `action_state.detail`
- `action_state.detail.invalid_id` (ErrorState)
- `action_state.detail.loading` (LoadingState)
- `action_state.detail.error` (ErrorState)
- `action_state.detail.not_found` (ErrorState)
- `action_state.detail.header`
- `action_state.detail.refresh`
- `action_state.detail.pin`
- `action_state.detail.track`
- `action_state.detail.dismiss`
- `action_state.detail.open_tasks`
- `action_state.detail.cancel`

Cancel action confirm dialog (shared across tasks / pages):
- `tasks.cancel_dialog.*` (ConfirmDialog prefix)

### VPS module

List:
- `vps.list`
- `vps.list.header`
- `vps.list.filters`
- `vps.list.power_confirm`
- `vps.list.power_confirm.force`
- `vps.search.input`
- `vps.list.loading` (LoadingState)
- `vps.list.error` (ErrorState)
- `vps.list.empty` (EmptyState)
- `vps.row.<id>` (desktop table)
- `vps.card.<id>` (mobile cards)
- `vps.row.<id>.state`
- `vps.row.<id>.ip` (if shown)

Detail layout:
- `vps.detail.loading` (LoadingState)
- `vps.detail.error` (ErrorState)
- `vps.detail.not_found` (ErrorState)

Detail header:
- `vps.header`
- `vps.header.ssh`
- `vps.action.start`
- `vps.action.stop`
- `vps.action.restart`
- `vps.action.root_password`
- `vps.action.more`
- `vps.action.stop_confirm`
- `vps.action.stop_confirm.force`
- `vps.action.restart_confirm`
- `vps.action.restart_confirm.force`
- `vps.action.root_password_confirm`

Overview tab:
- `vps.overview.usage.memory`
- `vps.overview.usage.swap`
- `vps.overview.usage.disk`

Metrics (time-series):
- `vps.overview.metrics.card`
- `vps.overview.metrics.window.24h`
- `vps.overview.metrics.window.7d`
- `vps.overview.metrics.window.30d`
- `vps.overview.metrics.refresh`
- `vps.overview.metrics.grid`
- `vps.overview.metrics.chart.load1`
- `vps.overview.metrics.chart.mem_used`
- `vps.overview.metrics.chart.disk_used`

Network tab:
- `vps.network.page`
- `vps.network.enable`
- `vps.network.disable`
- `vps.network.disable.reason`
- `vps.network.disable_confirm`
- `vps.network.enable_confirm`
- `vps.network.accounting.refresh`
- `vps.network.interfaces.table`
- `vps.network.interfaces.row.<id>`
- `vps.network.interfaces.row.<id>.edit`
- `vps.network.interfaces.card.<id>` (mobile)
- `vps.network.interfaces.card.<id>.edit`
- `vps.network.edit` (modal)
- `vps.network.edit.name`
- `vps.network.edit.enabled`
- `vps.network.edit.max_tx`
- `vps.network.edit.max_rx`
- `vps.network.edit.save`

Storage tab:
- `vps.storage.page`
- `vps.storage.mounts.add`
- `vps.storage.mounts.table`
- `vps.storage.mounts.row.<id>`
- `vps.storage.mounts.row.<id>.edit`
- `vps.storage.mounts.row.<id>.delete`
- `vps.storage.mounts.card.<id>` (mobile)
- `vps.storage.mounts.card.<id>.edit`
- `vps.storage.mounts.card.<id>.delete`
- `vps.storage.mounts.create` (modal)
- `vps.storage.mounts.create.dataset`
- `vps.storage.mounts.create.find_dataset`
- `vps.storage.mounts.create.mountpoint`
- `vps.storage.mounts.create.type`
- `vps.storage.mounts.create.mode`
- `vps.storage.mounts.create.on_start_fail`
- `vps.storage.mounts.create.enabled`
- `vps.storage.mounts.create.master_enabled`
- `vps.storage.mounts.create.use_default_map`
- `vps.storage.mounts.create.submit`
- `vps.storage.mounts.edit` (modal)
- `vps.storage.mounts.edit.mountpoint`
- `vps.storage.mounts.edit.type`
- `vps.storage.mounts.edit.mode`
- `vps.storage.mounts.edit.on_start_fail`
- `vps.storage.mounts.edit.enabled`
- `vps.storage.mounts.edit.master_enabled`
- `vps.storage.mounts.edit.use_default_map`
- `vps.storage.mounts.edit.submit`
- `vps.storage.mounts.delete_confirm`

Features tab:
- `vps.features.page`
- `vps.features.reset`
- `vps.features.save`
- `vps.features.item.<id>`
- `vps.features.confirm`

Maintenance tab:
- `vps.maintenance.page`
- `vps.maintenance.allow_anytime`
- `vps.maintenance.disallow_all`
- `vps.maintenance.reset`
- `vps.maintenance.save`
- `vps.maintenance.day.<wday>`
- `vps.maintenance.day.<wday>.open`
- `vps.maintenance.day.<wday>.opens`
- `vps.maintenance.day.<wday>.closes`

History tab:
- `vps.history.page`
- `vps.history.card`
- `vps.history.refresh`
- `vps.history.filter.event_type`
- `vps.history.filter.clear`
- `vps.history.loading`
- `vps.history.error`
- `vps.history.empty`
- `vps.history.table` (desktop)
- `vps.history.row.<id>` (desktop)
- `vps.history.mobile`
- `vps.history.card.<id>` (mobile)
- `vps.history.pagination`

Console tab:
- `vps.console.page`
- `vps.console.new_session`
- `vps.console.new_session_dialog`
- `vps.console.new_session_dialog.cancel`
- `vps.console.new_session_dialog.confirm`
- `vps.console.open_new_tab`
- `vps.console.iframe`
- `vps.console.server_missing`
- `vps.console.loading`
- `vps.console.error`
- `vps.console.retry`


### Transactions module

Transaction chains list:
- `transactions.list`
- `transactions.list.header`
- `transactions.list.filters`
- `transactions.search.input`
- `transactions.table`
- `transactions.row.<id>`
- `transactions.pagination.*`
- `transactions.list.loading` (LoadingState)
- `transactions.list.error` (ErrorState)
- `transactions.list.empty` (EmptyState)

Individual transactions list:
- `transactions.items.list`
- `transactions.items.list.header`
- `transactions.items.list.filters`
- `transactions.items.open_chains`
- `transactions.items.smart_filter.input`
- `transactions.items.smart_filter.help`
- `transactions.items.active_filters`
- `transactions.items.advanced.open`
- `transactions.items.advanced.drawer`
- `transactions.items.advanced.q`
- `transactions.items.advanced.user`
- `transactions.items.advanced.chain`
- `transactions.items.advanced.node`
- `transactions.items.advanced.vps`
- `transactions.items.advanced.type`
- `transactions.items.advanced.done`
- `transactions.items.advanced.success`
- `transactions.items.copy_link`
- `transactions.items.clear_filters`
- `transactions.items.table`
- `transactions.items.row.<id>`
- `transactions.items.pagination.*`
- `transactions.items.loading` (LoadingState)
- `transactions.items.error` (ErrorState)
- `transactions.items.empty` (EmptyState)


Transaction chain detail:
- `transactions.chain.detail`
- `transactions.chain.detail.invalid_id` (ErrorState)
- `transactions.chain.detail.loading` (LoadingState)
- `transactions.chain.detail.error` (ErrorState)
- `transactions.chain.detail.header`
- `transactions.chain.detail.pin`
- `transactions.chain.detail.open_items`
- `transactions.chain.detail.open_tasks`
- `transactions.chain.detail.info`
- `transactions.chain.detail.transactions`
- `transactions.chain.detail.transactions.loading` (LoadingState)
- `transactions.chain.detail.tx.<id>`
- `transactions.chain.detail.tx.open.<id>`

Individual transaction detail:
- `transactions.items.detail`
- `transactions.items.detail.invalid_id` (ErrorState)
- `transactions.items.detail.loading` (LoadingState)
- `transactions.items.detail.error` (ErrorState)
- `transactions.items.detail.header`
- `transactions.items.detail.open_chain`
- `transactions.items.detail.open_tasks`
- `transactions.items.detail.info`
- `transactions.items.detail.payload`
- `transactions.items.detail.raw`
- `transactions.items.detail.raw.json`

### Dataset module

List:
- `datasets.list`
- `datasets.list.header`
- `datasets.list.filters`
- `datasets.search.input`
- `datasets.row.<id>` (desktop table)
- `datasets.card.<id>` (mobile cards)
- `datasets.pagination.*` (desktop/mobile: `datasets.pagination.desktop.*`, `datasets.pagination.mobile.*`)
- `datasets.list.loading` (LoadingState)
- `datasets.list.error` (ErrorState)
- `datasets.list.empty` (EmptyState)

Detail layout:
- `dataset.detail.invalid_id` (ErrorState)
- `dataset.detail.loading` (LoadingState)
- `dataset.detail.error` (ErrorState)

Detail (single dataset):
- `dataset.header`
- `dataset.header.vps_link`
- `dataset.tabs.overview`
- `dataset.tabs.snapshots`
- `dataset.tabs.downloads`

Overview:
- `dataset.overview`
- `dataset.overview.space`
- `dataset.overview.counts`
- `dataset.overview.details`
- `dataset.overview.actions`
- `dataset.overview.tips`
- `dataset.overview.transactions`
- `dataset.overview.transactions.chain.<id>`

Snapshots:
- `dataset.snapshots.list`
- `dataset.snapshots.loading` (LoadingState)
- `dataset.snapshots.error` (ErrorState)
- `dataset.snapshots.search.input`
- `dataset.snapshots.refresh`
- `dataset.snapshots.create.open`
- `dataset.snapshots.row.<id>` (desktop table)
- `dataset.snapshots.row.<id>.download`
- `dataset.snapshots.row.<id>.rollback`
- `dataset.snapshots.row.<id>.delete`
- `dataset.snapshots.card.<id>` (mobile cards)
- `dataset.snapshots.card.<id>.download`
- `dataset.snapshots.card.<id>.rollback`
- `dataset.snapshots.card.<id>.delete`
- `dataset.snapshots.pagination.*` (desktop/mobile: `dataset.snapshots.pagination.desktop.*`, `dataset.snapshots.pagination.mobile.*`)

Snapshot rollback confirm dialog:
- `dataset.snapshots.rollback_confirm`
- `dataset.snapshots.rollback_confirm.confirm`
- `dataset.snapshots.rollback_confirm.cancel`

Snapshot delete confirm dialog:
- `dataset.snapshots.delete_confirm`
- `dataset.snapshots.delete_confirm.confirm`
- `dataset.snapshots.delete_confirm.cancel`

Snapshot create modal:
- `dataset.snapshots.create.modal`
- `dataset.snapshots.create.label`
- `dataset.snapshots.create.cancel`
- `dataset.snapshots.create.submit`

Snapshot download modal:
- `dataset.snapshots.download.modal`
- `dataset.snapshots.download.format`
- `dataset.snapshots.download.from_snapshot`
- `dataset.snapshots.download.load_more`
- `dataset.snapshots.download.send_mail`
- `dataset.snapshots.download.cancel`
- `dataset.snapshots.download.submit`

Downloads:
- `dataset.downloads.list`
- `dataset.downloads.loading` (LoadingState)
- `dataset.downloads.error` (ErrorState)
- `dataset.downloads.search.input`
- `dataset.downloads.refresh`
- `dataset.downloads.create.open`
- `dataset.downloads.row.<id>` (desktop table)
- `dataset.downloads.row.<id>.download`
- `dataset.downloads.row.<id>.copy_link`
- `dataset.downloads.row.<id>.copy_sha256`
- `dataset.downloads.row.<id>.delete`
- `dataset.downloads.card.<id>` (mobile cards)
- `dataset.downloads.card.<id>.download`
- `dataset.downloads.card.<id>.copy_link`
- `dataset.downloads.card.<id>.copy_sha256`
- `dataset.downloads.card.<id>.delete`
- `dataset.downloads.pagination.*` (desktop/mobile: `dataset.downloads.pagination.desktop.*`, `dataset.downloads.pagination.mobile.*`)

Download delete confirm dialog:
- `dataset.downloads.delete_confirm`
- `dataset.downloads.delete_confirm.confirm`
- `dataset.downloads.delete_confirm.cancel`

Download create modal:
- `dataset.downloads.create.modal`
- `dataset.downloads.create.snapshot`
- `dataset.downloads.create.snapshots.load_more`
- `dataset.downloads.create.format`
- `dataset.downloads.create.from_snapshot`
- `dataset.downloads.create.send_mail`
- `dataset.downloads.create.cancel`
- `dataset.downloads.create.submit`

### DNS module

- `dns.zones.list`
- `dns.zones.list.header`
- `dns.zones.list.filters`
- `dns.zones.search.input`
- `dns.zones.row.<id>` (desktop table)
- `dns.zones.card.<id>` (mobile cards)
- `dns.zones.pagination.*` (desktop/mobile: `dns.zones.pagination.desktop.*`, `dns.zones.pagination.mobile.*`)
- `dns.zones.list.loading` (LoadingState)
- `dns.zones.list.error` (ErrorState)
- `dns.zones.list.empty` (EmptyState)

DNS zones list actions:
- `dns.zones.refresh`
- `dns.zones.create.open`

Zone detail:
- `dns.zone.invalid_id` (ErrorState)
- `dns.zone.loading` (LoadingState)
- `dns.zone.error` (ErrorState)
- `dns.records.list`
- `dns.records.loading` (LoadingState)
- `dns.records.error` (ErrorState)
- `dns.records.search.input`
- `dns.records.refresh`
- `dns.records.create.open`
- `dns.record.row.<id>` (desktop table)
- `dns.record.card.<id>` (mobile cards)
- `dns.record.row.<id>.edit`
- `dns.record.row.<id>.delete`
- `dns.record.row.<id>.ddns_copy` (when DDNS URL is present)
- `dns.record.card.<id>.edit`
- `dns.record.card.<id>.delete`
- `dns.record.card.<id>.ddns_copy` (when DDNS URL is present)
- `dns.records.delete_confirm` (dialog; buttons: `dns.records.delete_confirm.confirm`, `dns.records.delete_confirm.cancel`)
- `dns.records.pagination.*` (desktop/mobile: `dns.records.pagination.desktop.*`, `dns.records.pagination.mobile.*`)

Record create modal:
- `dns.records.create.modal`
- `dns.records.create.name`
- `dns.records.create.type`
- `dns.records.create.content`
- `dns.records.create.ttl`
- `dns.records.create.priority`
- `dns.records.create.comment`
- `dns.records.create.enabled`
- `dns.records.create.dynamic`
- `dns.records.create.cancel`
- `dns.records.create.submit`

Record edit modal:
- `dns.records.edit.modal`
- `dns.records.edit.content`
- `dns.records.edit.ttl`
- `dns.records.edit.priority`
- `dns.records.edit.comment`
- `dns.records.edit.enabled`
- `dns.records.edit.dynamic`
- `dns.records.edit.cancel`
- `dns.records.edit.submit`

Logs:
- `dns.logs.list`
- `dns.logs.loading` (LoadingState)
- `dns.logs.error` (ErrorState)
- `dns.logs.search.input`
- `dns.logs.refresh`
- `dns.logs.row.<id>` (desktop table)
- `dns.logs.card.<id>` (mobile cards)
- `dns.logs.pagination.*` (desktop/mobile: `dns.logs.pagination.desktop.*`, `dns.logs.pagination.mobile.*`)

DNS zone create modal:
- `dns.zones.create.modal`
- `dns.zones.create.name`
- `dns.zones.create.email`
- `dns.zones.create.ttl`
- `dns.zones.create.enabled`
- `dns.zones.create.dnssec`
- `dns.zones.create.cancel`
- `dns.zones.create.submit`

Zone settings:
- `dns.settings.form`
- `dns.settings.label`
- `dns.settings.email`
- `dns.settings.default_ttl`
- `dns.settings.enabled`
- `dns.settings.dnssec`
- `dns.settings.reset`
- `dns.settings.save`

Zone deletion (danger section):
- `dns.settings.danger`
- `dns.settings.delete.open`
- `dns.settings.delete_confirm` (dialog; buttons: `dns.settings.delete_confirm.confirm`, `dns.settings.delete_confirm.cancel`)

Zone detail (single zone):
- `dns.zone.header`
- `dns.records.list`
- `dns.record.row.<id>`

### Public status

Public overview `/`:
- `public.overview.page`
- `public.summary-grid`
- `public.stats.members`
- `public.stats.nodes`
- `public.stats.vps`
- `public.outages.card`
- `public.news.card`
- `public.nodes.section`

Note:
- legacy ids (`public.overview.*`) are deprecated; use `public.stats.*`.
Outages:
- `public.outages.list`
- `public.outage.row.<id>`
- `public.outage.detail`
- `public.outage.updates`

News:
- `public.news.list`
- `public.news.item.<id>`


---

## Implementation guidance

- Prefer a small wrapper helper:
  - e.g. `<div data-testid="vps.row.${id}">...`
- For shared components, allow a `testId?: string` prop.
- When building composite controls (e.g. dropdown menu), put the test id
  on the trigger button.

---

## Review rule

A PR that introduces a new user-visible action or page surface must:
- update this spec if a new test id category is needed
- add `data-testid` for the new surface
- add/extend e2e tests that target the new ids

See also:
- `docs/spec/E2E_TEST_PLAN.md`
- `docs/spec/DESIGN_SANDBOX.md`


## Admin pages

### Admin nodes

- `admin.nodes.page`
- `admin.nodes.list.header`
- `admin.nodes.list.filters`
- `admin.nodes.search.input`
- `admin.nodes.issues_toggle`
- `admin.nodes.refresh`
- `admin.nodes.filter.clear`
- `admin.nodes.summary`
  - `admin.nodes.summary.total`
  - `admin.nodes.summary.down`
  - `admin.nodes.summary.maintenance`
- `admin.nodes.table`
- `admin.nodes.row.<id>` (desktop table; numeric node id when available; status-only fallback rows use a best-effort key)
- `admin.nodes.card.<id>` (mobile cards)
- `admin.nodes.pagination.mobile`
- `admin.nodes.pagination.desktop`
- `admin.nodes.loading` (LoadingState)
- `admin.nodes.error` (ErrorState)
- `admin.nodes.empty` (EmptyState)

### Migration plans

- `admin.migration_plans.page`
- `admin.migration_plans.list.header`
- `admin.migration_plans.list.filters`
- `admin.migration_plans.create.open`
- `admin.migration_plans.create.concurrency`
- `admin.migration_plans.create.stop_on_error`
- `admin.migration_plans.create.send_mail`
- `admin.migration_plans.create.reason`
- `admin.migration_plans.create.submit`
- `admin.migration_plans.filter.state`
- `admin.migration_plans.filter.user`
- `admin.migration_plans.filter.clear`
- `admin.migration_plans.table`
- `admin.migration_plans.row.<id>` (desktop table)
- `admin.migration_plans.card.<id>` (mobile cards)
- `admin.migration_plans.pagination.mobile`
- `admin.migration_plans.pagination.desktop`
- `admin.migration_plans.loading` (LoadingState)
- `admin.migration_plans.error` (ErrorState)
- `admin.migration_plans.empty` (EmptyState)

### Migration plan detail

- `admin.migration_plan.page`
- `admin.migration_plan.loading` (LoadingState)
- `admin.migration_plan.invalid_id` (ErrorState)
- `admin.migration_plan.error` (ErrorState)
- `admin.migration_plan.not_found` (ErrorState)
- `admin.migration_plan.header`
- `admin.migration_plan.refresh`
- `admin.migration_plan.start`
- `admin.migration_plan.cancel`
- `admin.migration_plan.delete`
- `admin.migration_plan.migrations.table`
- `admin.migration_plan.migrations.list.mobile`
- `admin.migration_plan.migrations.row.<id>` (desktop table)
- `admin.migration_plan.migrations.card.<id>` (mobile cards)
- `admin.migration_plan.migrations.pagination`



### Admin info

- `admin.info.page`
- `admin.info.header`
- `admin.info.session.card`
- `admin.info.runtime.card`
- `admin.info.shortcuts.card`
  - `admin.info.shortcuts.transactions`
  - `admin.info.shortcuts.users`
  - `admin.info.shortcuts.ip_addresses`
  - `admin.info.shortcuts.vps`
  - `admin.info.shortcuts.datasets`
  - `admin.info.shortcuts.dns`
  - `admin.info.shortcuts.user_workspace`

### Admin user detail

- `admin.user.page`
- `admin.user.loading` (LoadingState)
- `admin.user.invalid_id` (ErrorState)
- `admin.user.error` (ErrorState)
- `admin.user.header`
- `admin.user.refresh`
- `admin.user.details.card`
- `admin.user.action.vps`
- `admin.user.action.datasets`
- `admin.user.action.dns`

### Admin users list

- `admin.users.page`
- `admin.users.list.header`
- `admin.users.list.filters`
- `admin.users.search.input`
- `admin.users.filter.clear`
- `admin.users.table`
- `admin.users.row.<id>` (desktop table)
- `admin.users.card.<id>` (mobile cards)
- `admin.users.pagination.mobile`
- `admin.users.pagination.desktop`
- `admin.users.loading` (LoadingState)
- `admin.users.error` (ErrorState)
- `admin.users.empty` (EmptyState)

### Admin IP address detail

- `admin.ip_address.page`
- `admin.ip_address.loading` (LoadingState)
- `admin.ip_address.invalid_id` (ErrorState)
- `admin.ip_address.error` (ErrorState)
- `admin.ip_address.header`
- `admin.ip_address.refresh`
- `admin.ip_address.details.card`
- `admin.ip.action.vps`
- `admin.ip.action.user`

### Admin IP addresses list

- `admin.ip_addresses.page`
- `admin.ip_addresses.list.header`
- `admin.ip_addresses.list.filters`
- `admin.ip_addresses.filter.addr`
- `admin.ip_addresses.filter.vps`
- `admin.ip_addresses.filter.version`
- `admin.ip_addresses.filter.network`
- `admin.ip_addresses.filter.assigned_to_interface`
- `admin.ip_addresses.filter.clear`
- `admin.ip_addresses.table`
- `admin.ip_addresses.row.<id>` (desktop table)
- `admin.ip_addresses.card.<id>` (mobile cards)
- `admin.ip_addresses.pagination.mobile`
- `admin.ip_addresses.pagination.desktop`
- `admin.ip_addresses.loading` (LoadingState)
- `admin.ip_addresses.error` (ErrorState)
- `admin.ip_addresses.empty` (EmptyState)

### Admin node detail

- `admin.node.page`
- `admin.node.loading` (LoadingState)
- `admin.node.invalid_id` (ErrorState)
- `admin.node.error` (ErrorState)
- `admin.node.not_found` (ErrorState)
- `admin.node.header`
- `admin.node.refresh`

Node metrics (charts):
- `admin.node.metrics.card`
- `admin.node.metrics.window.6h`
- `admin.node.metrics.window.24h`
- `admin.node.metrics.window.7d`
- `admin.node.metrics.refresh`
- `admin.node.metrics.grid`
- `admin.node.metrics.chart.load1`
- `admin.node.metrics.chart.cpu_idle`
- `admin.node.metrics.chart.mem_used`

Node actions:
- `admin.node.maintenance.lock`
- `admin.node.maintenance.unlock`
- `admin.node.evacuation.start`

Node status samples (embedded list):
- `admin.node.statuses.list`
- `admin.node.statuses.refresh`
- `admin.node.statuses.table`
- `admin.node.statuses.row.<id>`
- `admin.node.statuses.card.<id>`
- `admin.node.statuses.pagination`

Transactions (embedded list):
- `admin.node.transactions.list`
- `admin.node.transactions.refresh`
- `admin.node.transactions.open_all`
- `admin.node.transactions.table`
- `admin.node.transactions.row.<id>`
- `admin.node.transactions.card.<id>`
- `admin.node.transactions.pagination`
