import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

const vps = {
  id: 123,
  hostname: 'vps123.example',
  object_state: 'active',
  is_running: true,
  enable_network: true,
  cpus: 2,
  memory: 2048,
  swap: 0,
  diskspace: 20480,
  used_memory: 768,
  used_swap: 0,
  used_diskspace: 5120,
  uptime: 12345,
  loadavg1: 0.12,
  dataset: { id: 10, name: 'tank/data' },
  node: {
    id: 1,
    domain_name: 'node1.example',
    location: { id: 2, label: 'Praha', remote_console_server: '/_console', environment: { id: 1, label: 'prod' } },
  },
  user: { id: 10, login: 'alice' },
  os_template: { id: 6, label: 'Debian 12' },
  dns_resolver: 'inherit',
};

const dataset = {
  id: 10,
  name: 'tank/data',
  full_name: 'tank/data',
  used: 5120,
  avail: 15360,
  referenced: 4096,
  refquota: 20480,
  quota: 0,
  snapshots_count: 1,
  mount_count: 1,
  export_count: 0,
  object_state: 'active',
};

async function captureOptInScreenshot(page: Page, envName: string): Promise<void> {
  const screenshotPath = process.env[envName]?.trim();
  if (!screenshotPath) return;
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

test('@workflow-matrix @smoke VPS detail tabs expose storage and backups, access, lifecycle, and console routes', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_USER_SESSION' });

  await page.route('**/_console/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>console stub</body></html>',
    });
  });

  await installHaveApiMock(page, {
    user: { id: 10, login: 'alice', level: 1 },
    handlers: {
      'GET vpses': () => ({ vpses: [vps], _meta: { total_count: 1 } }),
      'GET vpses/123': () => ({ vps }),
      'GET dns_resolvers': () => ({ dns_resolvers: [] }),
      'GET user_namespace_maps': () => ({ user_namespace_maps: [] }),
      'GET datasets/10': () => ({ dataset }),
      'GET ip_addresses': () => ({ ip_addresses: [] }),
      'GET vpses/123/statuses': () => ({ statuses: [] }),
      'GET vpses/123/mounts': () => ({
        mounts: [
          {
            id: 1,
            mountpoint: '/mnt/data',
            type: 'nfs',
            mode: 'rw',
            enabled: true,
            on_start_fail: 'ignore',
            use_default_map: true,
            dataset: { id: 10, name: 'tank/data' },
          },
        ],
      }),
      'GET vpses/123/state_logs': () => ({ state_logs: [] }),
      'GET os_templates': () => ({
        os_templates: [{ id: 6, label: 'Debian 12', enabled: true, hypervisor_type: 'vpsadminos' }],
      }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'POST vpses/123/console_token': () => ({
        token: 'T1',
        expiration: '2027-01-31T00:00:00Z',
      }),
    },
  });

  await page.goto('/app/vps');
  await page.getByRole('link', { name: /vps123\.example/i }).click();

  await expect(page).toHaveURL(/\/app\/vps\/123$/);
  await expect(page.getByTestId('vps.header')).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/app\/vps\/123$/);
  await expect(page.getByTestId('vps.header')).toBeVisible();

  const vpsHeader = page.getByTestId('vps.header');
  await expect(vpsHeader.getByRole('link', { name: /^Storage & backups$/ })).toHaveAttribute('href', '/app/vps/123/storage');
  await expect(vpsHeader.getByRole('link', { name: /^Access$/ })).toHaveAttribute('href', '/app/vps/123/access');
  await expect(vpsHeader.getByRole('link', { name: /^Console$/ }).first()).toHaveAttribute('href', '/app/vps/123/console');

  await expect(page.getByTestId('vps.overview.control_center')).toBeVisible();
  await expect(page.getByTestId('vps.overview.health')).toBeVisible();
  await expect(page.getByTestId('vps.overview.resources_usage.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.status_access.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.access.console')).toHaveAttribute('href', '/app/vps/123/console');
  await expect(page.getByTestId('vps.overview.network.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.storage.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.diagnostics.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.lifecycle')).toBeVisible();
  await expect(page.getByTestId('vps.overview.config.owner')).toHaveCount(0);
  await expect(page.getByTestId('vps.overview.admin_ops.card')).toHaveCount(0);
  await expect(page.getByTestId('vps.action.snapshot')).toHaveAttribute(
    'href',
    '/app/datasets/10/snapshots?action=create'
  );
  const moreActions = page.getByTestId('vps.actions.menu');
  await expect(moreActions).toBeVisible();
  await expect(moreActions.locator('option[value="/app/vps/123/lifecycle/reinstall"]')).toHaveCount(1);
  await expect(moreActions.locator('option[value="/app/vps/123/lifecycle/clone"]')).toHaveCount(1);
  await expect(moreActions.locator('option[value="/app/vps/123/lifecycle/swap"]')).toHaveCount(1);
  await expect(moreActions.locator('option[value="/app/vps/123/lifecycle/delete"]')).toHaveCount(1);
  await expect(moreActions.locator('option[value="/app/vps/123/lifecycle/migrate"]')).toHaveCount(0);
  await expect(moreActions.locator('option[value="/app/vps/123/storage"]')).toHaveCount(1);
  await expect(moreActions.locator('option[value="/app/vps/123/access"]')).toHaveCount(1);
  await expect(moreActions.locator('option[value="/app/vps/123/console"]')).toHaveCount(0);

  await captureOptInScreenshot(page, 'E2E_VPS_USER_OVERVIEW_SCREENSHOT');

  await moreActions.selectOption('/app/vps/123/config');
  await expect(page).toHaveURL(/\/app\/vps\/123\/config$/);
  await expect(page.getByText('Boot preferences')).toBeVisible();
  await expect(page.getByText('Basic runtime preferences available to a member.')).toBeVisible();
  await expect(page.getByText('Start menu timeout', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Owner', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CPU limit', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Autostart priority', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Change reason', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Admin lock type', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Admin override', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: /^Storage & backups$/ }).click();
  await expect(page).toHaveURL(/\/app\/vps\/123\/storage$/);
  await expect(page.getByTestId('vps.storage.page')).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await expect(page.getByTestId('vps.storage.mounts.card.1')).toBeVisible();
  } else {
    await expect(page.getByTestId('vps.storage.mounts.table')).toBeVisible();
  }

  await page.goto('/app/vps/123');
  await page.getByTestId('vps.actions.menu').selectOption('/app/vps/123/lifecycle/clone');
  await expect(page).toHaveURL(/\/app\/vps\/123\/lifecycle\/clone$/);
  await expect(page.getByTestId('vps.lifecycle.clone')).toBeVisible();
  await expect(page.getByTestId('vps.lifecycle.replace')).toHaveCount(0);

  await page.getByRole('link', { name: /^Console$/ }).first().click();
  await expect(page).toHaveURL(/\/app\/vps\/123\/console$/);
  await expect(page.getByTestId('vps.console.page')).toBeVisible();
  await expect(page.getByTestId('vps.console.iframe')).toBeVisible();
});

test('@workflow-matrix admin account in user VPS view keeps storage admin controls hidden', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_ADMIN_SESSION' });

  await installHaveApiMock(page, {
    user: { id: 10, login: 'alice-admin', level: 99 },
    handlers: {
      'GET vpses/123': () => ({ vps }),
      'GET datasets/10': () => ({ dataset }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET vpses/123/statuses': () => ({ statuses: [] }),
      'GET vpses/123/mounts': () => ({
        mounts: [
          {
            id: 1,
            mountpoint: '/mnt/data',
            type: 'nfs',
            mode: 'rw',
            enabled: true,
            master_enabled: false,
            on_start_fail: 'ignore',
            use_default_map: true,
            dataset: { id: 10, name: 'tank/data' },
          },
        ],
      }),
    },
  });

  await page.goto('/app/vps/123/storage');

  await expect(page.getByTestId('vps.storage.page')).toBeVisible();
  await expect(page.getByTestId('vps.storage.root_dataset.system_context')).toHaveCount(0);
  await expect(page.getByTestId('vps.storage.mounts.table').locator('th', { hasText: /^Master$/ })).toHaveCount(0);
  await expect(page.getByTestId('vps.storage.mounts.table')).not.toContainText('Master:');

  const editMountTestId = (page.viewportSize()?.width ?? 0) < 768
    ? 'vps.storage.mounts.card.1.edit'
    : 'vps.storage.mounts.row.1.edit';
  await page.getByTestId(editMountTestId).click();
  await expect(page.getByTestId('vps.storage.mounts.edit')).toBeVisible();
  await expect(page.getByTestId('vps.storage.mounts.edit.master_enabled')).toHaveCount(0);
});


test('@workflow-matrix VPS detail shows admin operational metadata in admin mode', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_ADMIN_SESSION' });

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 99 },
    handlers: {
      'GET vpses/123': () => ({
        vps: {
          ...vps,
          pool: { id: 9, name: 'tank' },
          dataset: { id: 10, full_name: 'tank/data', name: 'tank/data' },
          expiration_date: '2027-01-31T00:00:00Z',
          created_at: '2026-01-01T12:00:00Z',
        },
      }),
      'GET ip_addresses': () => ({
        ip_addresses: [
          {
            id: 501,
            addr: '198.51.100.10',
            prefix: 32,
            routed: true,
            network: { id: 55, label: 'public 198.51.100.0/24', role: 'public' },
            user: { id: 10, login: 'alice' },
          },
        ],
      }),
      'GET transaction_chains': () => ({
        transaction_chains: [
          {
            id: 9001,
            label: 'Start VPS',
            state: 'done',
            created_at: '2026-01-02T12:00:00Z',
            finished_at: '2026-01-02T12:01:00Z',
          },
        ],
      }),
      'GET vpses/123/statuses': () => ({ statuses: [] }),
      'GET vpses/123/state_logs': () => ({ state_logs: [] }),
      'GET dns_resolvers': () => ({ dns_resolvers: [] }),
      'GET user_namespace_maps': () => ({ user_namespace_maps: [] }),
    },
  });

  await page.goto('/admin/vps/123');

  await expect(page.getByTestId('vps.header')).toBeVisible();
  await expect(page.getByTestId('vps.overview.control_center')).toBeVisible();
  await expect(page.getByTestId('vps.overview.health')).toBeVisible();
  await expect(page.getByTestId('vps.overview.resources_usage.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.status_access.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.network.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.storage.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.admin_ops.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.admin_ops.owner')).toContainText('alice');
  await expect(page.getByTestId('vps.overview.admin_ops.user_id')).toContainText('#10');
  await expect(page.getByTestId('vps.overview.admin_ops.node')).toContainText('node1.example');
  await expect(page.getByTestId('vps.overview.admin_ops.location_environment')).toContainText('prod');
  await expect(page.getByTestId('vps.overview.admin_ops.dataset')).toContainText('tank/data');
  await expect(page.getByTestId('vps.overview.admin_ops.ips')).toContainText('198.51.100.10/32');
  await expect(page.getByTestId('vps.overview.admin_ops.ips')).toContainText('Owner: alice');
  await expect(page.getByTestId('vps.overview.tx.card')).toBeVisible();
  await expect(page.getByTestId('vps.overview.management.admin_context')).toBeVisible();

  const moreActions = page.getByTestId('vps.actions.menu');
  await expect(moreActions.locator('option[value="/admin/vps/123/lifecycle/migrate"]')).toHaveCount(1);

  await captureOptInScreenshot(page, 'E2E_VPS_ADMIN_OVERVIEW_SCREENSHOT');

  await moreActions.selectOption('/admin/vps/123/config');
  await expect(page).toHaveURL(/\/admin\/vps\/123\/config$/);
  await expect(page.getByText('Start menu timeout', { exact: true })).toBeVisible();
  await expect(page.getByText('Owner', { exact: true })).toBeVisible();
  await expect(page.getByText('CPU limit', { exact: true })).toBeVisible();
  await expect(page.getByText('Autostart priority', { exact: true })).toBeVisible();
  await expect(page.getByText('Change reason', { exact: true })).toBeVisible();
  await expect(page.getByText('Admin lock type', { exact: true })).toBeVisible();
  await expect(page.getByText('Admin override', { exact: true })).toBeVisible();
});
