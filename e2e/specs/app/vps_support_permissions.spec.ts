import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

const supportVps = {
  id: 123,
  hostname: 'support-vps.example',
  object_state: 'active',
  expiration_date: '2026-09-01T00:00:00.000Z',
  remind_after_date: '2026-08-20T00:00:00.000Z',
  is_running: false,
  enable_network: true,
  cpu: 2,
  memory: 2048,
  swap: 0,
  diskspace: 20480,
  user: { id: 77, login: 'foreign-owner' },
  node: {
    id: 1,
    domain_name: 'node1.example',
    location: {
      id: 2,
      label: 'Praha-2',
      environment: { id: 1, label: 'Production' },
    },
  },
  os_template: { id: 6, label: 'Debian latest' },
  dataset: { id: 901, name: 'tank/vps/123/root' },
  dns_resolver: 'inherit',
};

test('@pr-smoke support account stays read-only inside the admin VPS shell', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_SUPPORT_SESSION' });

  let nodeRequests = 0;
  const mutatingApiRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/api/v7.0/') || request.method() === 'GET') return;
    const pathname = new URL(request.url()).pathname;
    // Route changes persist the last visited UI section for every authenticated
    // role. That request is unrelated to mutating the inspected VPS.
    if (pathname.endsWith('/webui_user_settings')) return;
    mutatingApiRequests.push(`${request.method()} ${pathname}`);
  });

  await installHaveApiMock(page, {
    user: { id: 21, login: 'support-agent', level: 21 },
    handlers: {
      'GET vpses': () => ({ vpses: [] }),
      'GET vpses/123': () => ({ vps: supportVps }),
      'GET vpses/123/statuses': () => ({ statuses: [] }),
      'GET ip_addresses': () => ({
        ip_addresses: [
          {
            id: 41,
            addr: '192.0.2.10',
            prefix: 32,
            network_interface: { id: 31, name: 'venet0' },
            network: { id: 8, ip_version: 4, role: 'public_access', location: { id: 2, label: 'Praha-2' } },
            user: { id: 77, login: 'foreign-owner' },
          },
        ],
      }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET vpses/123/ssh_host_keys': () => ({ ssh_host_keys: [{ id: 1, key_type: 'ed25519', fingerprint: 'SHA256:test' }] }),
      'GET network_interfaces': () => ({
        network_interfaces: [{ id: 31, name: 'venet0', type: 'veth_routed', enable: true, max_tx: 1048576000, max_rx: 1048576000 }],
      }),
      'GET network_interface_accountings': () => ({ network_interface_accountings: [] }),
      'GET host_ip_addresses': () => ({
        host_ip_addresses: [
          {
            id: 51,
            addr: '192.0.2.10',
            assigned: true,
            reverse_record_value: 'support-vps.example.',
            ip_address: { id: 41, network_interface: { id: 31, name: 'venet0' } },
          },
        ],
      }),
      'GET vpses/123/mounts': () => ({
        mounts: [{ id: 61, mountpoint: '/srv/data', dataset: { id: 902, name: 'tank/data' }, mode: 'rw', type: 'bind', enabled: true }],
      }),
      'GET datasets/901': () => ({ dataset: { id: 901, name: 'tank/vps/123/root', used: 1024, avail: 2048, refquota: 4096, state: 'active' } }),
      'GET vpses/123/features': () => ({ features: [{ id: 71, name: 'fuse', label: 'FUSE', enabled: true }] }),
      'GET vpses/123/maintenance_windows': () => ({
        maintenance_windows: [{ id: 81, weekday: 1, is_open: true, opens_at: 60, closes_at: 120 }],
      }),
      'GET dns_resolvers': () => ({ dns_resolvers: [] }),
      'GET user_namespace_maps': () => ({ user_namespace_maps: [] }),
      'GET locations': () => ({ locations: [{ id: 2, label: 'Praha-2' }] }),
      'GET nodes': () => {
        nodeRequests += 1;
        return { nodes: [] };
      },
    },
  });

  await page.goto('/admin/vps/123');

  await expect(page.getByTestId('vps.overview.lifecycle')).toBeVisible();
  await expect(page.getByTestId('lifetimes.admin.edit')).toHaveCount(0);
  await expect(page.getByTestId('lifetimes.admin.log')).toHaveCount(0);
  await expect(page.getByTestId('lifetimes.user.snooze')).toHaveCount(0);
  await expect(page.getByTestId('vps.action.start')).toHaveCount(0);
  await expect(page.getByTestId('vps.action.restart.header')).toHaveCount(0);
  await expect(page.getByTestId('vps.action.snapshot')).toHaveCount(0);
  await expect(page.getByTestId('vps.action.primary_console')).toBeVisible();
  await expect(page.getByTestId('vps.actions.menu').locator('option[value^="action:"]')).toHaveCount(0);
  await expect(page.getByTestId('vps.actions.menu').locator('option[value*="/lifecycle/"]')).toHaveCount(0);
  await expect(page.getByTestId('vps.actions.menu').locator('option[value$="/config"]')).toHaveCount(1);

  await page.goto('/admin/vps/123/config');

  await expect(page.getByText('Boot preferences')).toBeVisible();
  await expect(page.getByText('Start menu timeout', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Owner', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CPU limit', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Autostart priority', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Change reason', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Admin lock type', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Admin override', { exact: true })).toHaveCount(0);
  await expect(page.getByText('You do not have permission to perform this action.')).toBeVisible();
  await expect(page.locator('fieldset:disabled')).toBeVisible();

  await page.goto('/admin/vps/123/lifecycle');

  await expect(page.getByText('You do not have permission to perform this action.')).toBeVisible();
  await expect(page.getByTestId('vps.lifecycle.daily_actions')).toHaveCount(0);
  await expect(page.getByTestId('vps.lifecycle.action_link.clone')).toHaveCount(0);
  await expect(page.getByTestId('vps.lifecycle.action_link.swap')).toHaveCount(0);
  await expect(page.getByTestId('vps.lifecycle.action_link.delete')).toHaveCount(0);
  await expect(page.getByTestId('vps.lifecycle.admin_actions')).toHaveCount(0);
  await expect(page.getByTestId('vps.lifecycle.action_link.lifetime')).toHaveCount(0);
  await expect(page.getByTestId('vps.lifecycle.action_link.replace')).toHaveCount(0);
  await expect(page.getByTestId('vps.lifecycle.action_link.migrate')).toHaveCount(0);

  await page.goto('/admin/vps/123/lifecycle/migrate');

  await expect(page.getByTestId('vps.lifecycle.page')).toBeVisible();
  await expect(page.getByTestId('vps.lifecycle.migrate')).toHaveCount(0);
  expect(nodeRequests).toBe(0);

  await page.goto('/admin/vps/123/access');

  await expect(page.getByTestId('vps.access.read_only')).toBeVisible();
  await expect(page.getByTestId('vps.access.password_type')).toHaveCount(0);
  await expect(page.getByTestId('vps.access.password.generate')).toHaveCount(0);
  await expect(page.getByTestId('vps.access.ssh.key')).toHaveCount(0);
  await expect(page.getByTestId('vps.access.ssh.deploy')).toHaveCount(0);
  await expect(page.getByTestId('vps.access.host_keys')).toBeVisible();

  await page.goto('/admin/vps/123/network');

  await expect(page.getByTestId('vps.network.read_only')).toBeVisible();
  await expect(page.getByTestId('vps.network.interfaces.row.31')).toBeVisible();
  await expect(page.getByTestId('vps.network.interfaces.row.31.edit')).toHaveCount(0);
  await expect(page.getByTestId('vps.network.ip_addresses.item.41')).toBeVisible();
  await expect(page.getByTestId('vps.network.ip_addresses.add')).toHaveCount(0);
  await expect(page.getByTestId('vps.network.ip_addresses.item.41.free_route')).toHaveCount(0);
  await expect(page.getByTestId('vps.network.host_addresses.row.51')).toBeVisible();
  await expect(page.getByTestId('vps.network.host_addresses.row.51.ptr')).toHaveCount(0);
  await expect(page.getByTestId('vps.network.host_addresses.row.51.free')).toHaveCount(0);
  await expect(page.getByTestId('vps.network.admin_settings')).toHaveCount(0);

  await page.goto('/admin/vps/123/storage');

  await expect(page.getByTestId('vps.storage.read_only')).toBeVisible();
  await expect(page.getByTestId('vps.storage.mounts.add')).toHaveCount(0);
  await expect(page.getByTestId('vps.storage.mounts.row.61')).toBeVisible();
  await expect(page.getByTestId('vps.storage.mounts.row.61.edit')).toHaveCount(0);
  await expect(page.getByTestId('vps.storage.mounts.row.61.delete')).toHaveCount(0);
  await expect(page.getByTestId('vps.storage.root_dataset.create_subdataset')).toHaveCount(0);

  await page.goto('/admin/vps/123/features');

  await expect(page.getByTestId('vps.features.read_only')).toBeVisible();
  await expect(page.getByTestId('vps.features.item.71')).toBeVisible();
  await expect(page.getByTestId('vps.features.item.71').locator('input')).toHaveCount(0);
  await expect(page.getByTestId('vps.features.reset')).toHaveCount(0);
  await expect(page.getByTestId('vps.features.save')).toHaveCount(0);

  await page.goto('/admin/vps/123/maintenance');

  await expect(page.getByTestId('vps.maintenance.read_only')).toBeVisible();
  await expect(page.getByTestId('vps.maintenance.day.1')).toBeVisible();
  await expect(page.getByTestId('vps.maintenance.day.1.open')).toHaveCount(0);
  await expect(page.getByTestId('vps.maintenance.day.1.opens.h')).toHaveCount(0);
  await expect(page.getByTestId('vps.maintenance.reset')).toHaveCount(0);
  await expect(page.getByTestId('vps.maintenance.save')).toHaveCount(0);
  await expect(page.getByTestId('vps.maintenance.allow_anytime')).toHaveCount(0);
  await expect(page.getByTestId('vps.maintenance.disallow_all')).toHaveCount(0);

  expect(mutatingApiRequests).toEqual([]);
});
