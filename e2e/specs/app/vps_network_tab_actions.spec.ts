import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, failEnvelope, installHaveApiMock } from '../../fixtures';

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
  node: { id: 1, domain_name: 'node1.example', location: { id: 10, label: 'Prague' } },
  os_template: { label: 'debian' },
  dns_resolver: 'inherit',
};

const netifs = [
  {
    id: 1,
    name: 'eth0',
    type: 'virtio',
    enable: false,
    max_tx: 100 * 1024 * 1024,
    max_rx: 200 * 1024 * 1024,
  },
];

const ips = [
  {
    id: 1,
    addr: '198.51.100.10',
    network_interface: { id: 1 },
    network: {
      role: 'public_access',
      purpose: 'vps',
      ip_version: 4,
      location: { id: 10, label: 'Prague' },
      primary_location: { id: 10, label: 'Prague' },
    },
    user: { id: 20, login: 'old-owner' },
    routed: true,
  },
  {
    id: 2,
    addr: '198.51.100.20',
    network_interface: null,
    network: {
      role: 'public_access',
      purpose: 'vps',
      ip_version: 4,
      location: { id: 10, label: 'Prague' },
      primary_location: { id: 10, label: 'Prague' },
    },
    user: { id: 20, login: 'old-owner' },
  },
];

const acct = [{ id: 1, bytes_in: 1024, bytes_out: 2048 }];


async function openAdminNetworkSettings(page: Page) {
  await page.getByTestId('vps.network.admin_settings.toggle').click();
}

function interfaceEditButton(page: Page) {
  return page.getByTestId(
    (page.viewportSize()?.width ?? 0) < 768
      ? 'vps.network.interfaces.card.1.edit'
      : 'vps.network.interfaces.row.1.edit'
  );
}

test.describe('@pr-smoke VPS network tab', () => {
  test('edits interface and sends PUT', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: ips }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: [] }),
        'GET environments': () => ({ environments: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
        'PUT network_interfaces/1': () => ({
          network_interface: { ...netifs[0] },
          _meta: { action_state_id: 1201 },
        }),
        'GET action_states/1201': () => ({ action_state: { id: 1201, finished: true, status: true, current: 1, total: 1 } }),
      },
    });

    await page.goto('/admin/vps/123/network');

    await expect(page.getByTestId('vps.network.page')).toBeVisible();
    if ((page.viewportSize()?.width ?? 0) < 768) {
      await expect(page.getByTestId('vps.network.interfaces.card.1')).toBeVisible();
      await expect(page.getByTestId('vps.network.interfaces.card.1.dot')).toBeVisible();
    } else {
      await expect(page.getByTestId('vps.network.interfaces.table')).toBeVisible();
      await expect(page.getByTestId('vps.network.interfaces.row.1')).toHaveAttribute('data-row-variant', 'warn');
      await expect(page.getByTestId('vps.network.interfaces.row.1.dot')).toBeVisible();
    }

    await interfaceEditButton(page).click();
    await expect(page.getByTestId('vps.network.edit')).toBeVisible();

    await page.getByTestId('vps.network.edit.name').fill('eth0-renamed');
    await page.getByTestId('vps.network.edit.max_tx').fill('500');
    await page.getByTestId('vps.network.edit.max_rx').fill('600');

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'PUT' && r.url().includes('/api/v7.0/network_interfaces/1')
    );

    await page.getByTestId('vps.network.edit.save').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      network_interface: {
        name: 'eth0-renamed',
        enable: false,
        max_tx: 500 * 1024 * 1024,
        max_rx: 600 * 1024 * 1024,
      },
    });

    await expect(page.getByTestId('vps.network.edit')).toBeHidden();
  });

  test('keeps an in-flight interface edit bound to its original VPS after route rerender', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let releaseUpdate!: () => void;
    const updateGate = new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET vpses/456': () => ({ vps: { ...vps, id: 456, hostname: 'vps456.example' } }),
        'GET ip_addresses': () => ({ ip_addresses: ips }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: [] }),
        'GET environments': () => ({ environments: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
        'PUT network_interfaces/1': async () => {
          await updateGate;
          return { network_interface: { ...netifs[0] }, _meta: { action_state_id: 1250 } };
        },
        'GET action_states/1250': () => ({ action_state: { id: 1250, finished: true, status: true, current: 1, total: 1 } }),
      },
    });

    await page.goto('/admin/vps/123/network');
    await interfaceEditButton(page).click();
    await page.getByTestId('vps.network.edit.name').fill('vps123-interface');

    const originalRequest = page.waitForRequest(
      (request) => request.method() === 'PUT' && request.url().includes('/api/v7.0/network_interfaces/1')
    );
    await page.getByTestId('vps.network.edit.save').click();
    expect((await originalRequest).postDataJSON()).toMatchObject({ network_interface: { name: 'vps123-interface' } });

    await page.evaluate(() => {
      window.history.pushState({}, '', '/admin/vps/456/network');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByText('vps456.example')).toBeVisible();
    await expect(page.getByTestId('vps.network.edit')).toHaveCount(0);
    await interfaceEditButton(page).click();
    await page.getByTestId('vps.network.edit.name').fill('vps456-unsaved');
    releaseUpdate();

    await expect(page.getByTestId('vps.network.edit')).toBeVisible();
    await expect(page.getByTestId('vps.network.edit.name')).toHaveValue('vps456-unsaved');
  });

  test('disables VPS networking with a change reason', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let enabled = true;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET vpses/123': () => ({ vps: { ...vps, enable_network: enabled } }),
        'GET ip_addresses': () => ({ ip_addresses: ips }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: [] }),
        'GET environments': () => ({ environments: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
        'PUT vpses/123': async () => {
          enabled = false;
          return { vps: { ...vps, enable_network: enabled }, _meta: { action_state_id: 1210 } };
        },
        'GET action_states/1210': () => ({ action_state: { id: 1210, finished: true, status: true, current: 1, total: 1 } }),
      },
    });

    await page.goto('/admin/vps/123/network');

    await openAdminNetworkSettings(page);
    await expect(page.getByTestId('vps.network.disable')).toBeVisible();
    await page.getByTestId('vps.network.disable').click();

    await expect(page.getByTestId('vps.network.disable_confirm')).toBeVisible();

    await page.getByTestId('vps.network.disable.reason').fill('Testing');

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'PUT' && r.url().includes('/api/v7.0/vpses/123')
    );

    await page.getByTestId('vps.network.disable_confirm.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        enable_network: false,
        change_reason: 'Testing',
      },
    });

    await expect(page.getByTestId('vps.network.disable_confirm')).toBeHidden();
  });

  test('assigns routes and manages interface addresses and PTR', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let currentIps = [...ips];
    let hostAddresses = [
      {
        id: 50,
        addr: '198.51.100.10',
        assigned: true,
        reverse_record_value: 'old.example.test.',
        user_created: true,
        ip_address: { id: 1, addr: '198.51.100.10', network_interface: { id: 1 } },
      },
      {
        id: 51,
        addr: '198.51.100.11',
        assigned: false,
        user_created: true,
        ip_address: { id: 1, addr: '198.51.100.10', network_interface: { id: 1 } },
      },
    ];

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: currentIps }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: hostAddresses }),
        'GET environments': () => ({ environments: [{ id: 3, label: 'env-test' }] }),
        'POST ip_addresses/2/assign': () => {
          currentIps = currentIps.map((ip) => (ip.id === 2 ? { ...ip, network_interface: { id: 1 }, routed: true } : ip));
          return { ip_address: currentIps.find((ip) => ip.id === 2), _meta: { action_state_id: 1202 } };
        },
        'POST ip_addresses/1/free': () => {
          currentIps = currentIps.map((ip) => (ip.id === 1 ? { ...ip, network_interface: null, routed: false } : ip));
          return { ip_address: currentIps.find((ip) => ip.id === 1), _meta: { action_state_id: 1203 } };
        },
        'PUT ip_addresses/1': () => {
          currentIps = currentIps.map((ip) => (ip.id === 1 ? { ...ip, user: { id: 77, login: 'new-owner' } } : ip));
          return { ip_address: currentIps.find((ip) => ip.id === 1), _meta: { action_state_id: 1204 } };
        },
        'POST host_ip_addresses/51/assign': () => {
          hostAddresses = hostAddresses.map((h) => (h.id === 51 ? { ...h, assigned: true } : h));
          return { host_ip_address: hostAddresses.find((h) => h.id === 51), _meta: { action_state_id: 1205 } };
        },
        'POST host_ip_addresses/50/free': () => {
          hostAddresses = hostAddresses.map((h) => (h.id === 50 ? { ...h, assigned: false } : h));
          return { host_ip_address: hostAddresses.find((h) => h.id === 50), _meta: { action_state_id: 1206 } };
        },
        'PUT host_ip_addresses/50': () => {
          hostAddresses = hostAddresses.map((h) =>
            h.id === 50 ? { ...h, reverse_record_value: 'new.example.test.' } : h
          );
          return { host_ip_address: hostAddresses[0], _meta: { action_state_id: 1207 } };
        },
        'GET action_states/1202': () => ({ action_state: { id: 1202, finished: true, status: true, current: 1, total: 1 } }),
        'GET action_states/1203': () => ({ action_state: { id: 1203, finished: true, status: true, current: 1, total: 1 } }),
        'GET action_states/1204': () => ({ action_state: { id: 1204, finished: true, status: true, current: 1, total: 1 } }),
        'GET action_states/1205': () => ({ action_state: { id: 1205, finished: true, status: true, current: 1, total: 1 } }),
        'GET action_states/1206': () => ({ action_state: { id: 1206, finished: true, status: true, current: 1, total: 1 } }),
        'GET action_states/1207': () => ({ action_state: { id: 1207, finished: true, status: true, current: 1, total: 1 } }),
      },
    });

    await page.goto('/admin/vps/123/network');
    await expect(page.getByTestId('vps.network.page')).toBeVisible();
    await page.getByTestId('vps.network.ip_addresses.unassigned.2.assign').click();
    await expect(page.getByTestId('vps.network.ip_addresses.add_modal')).toBeVisible();
    await expect(page.getByTestId('network.user.assign.interface')).toHaveValue('1');
    await expect(page.getByTestId('network.user.assign.kind')).toHaveValue('ipv4_public');
    await page.getByTestId('network.user.assign.continue').click();
    await expect(page.getByTestId('network.user.assign.address')).toHaveValue('2');
    await expect(page.getByTestId('network.user.assign.mode')).toHaveValue('route');

    const assignReq = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/ip_addresses/2/assign')
    );
    await page.getByTestId('network.user.assign.submit').click();
    expect((await assignReq).postDataJSON()).toEqual({
      ip_address: {
        network_interface: 1,
      },
    });
    await expect(page.getByTestId('vps.network.ip_addresses.add_modal')).toBeHidden();

    await page.getByTestId('vps.network.host_addresses.row.51.assign').click();
    await expect(page.getByTestId('vps.network.host_addresses.assign.interface')).toHaveValue('1');

    const assignHostReq = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/host_ip_addresses/51/assign')
    );
    await page.getByTestId('vps.network.host_addresses.assign.submit').click();
    expect((await assignHostReq).postDataJSON()).toEqual({
      host_ip_address: {
        network_interface: 1,
      },
    });
    await expect(page.getByTestId('vps.network.host_addresses.assign')).toBeHidden();

    await page.getByTestId('vps.network.host_addresses.row.50.ptr').click();
    await page.getByTestId('vps.network.host_addresses.ptr.value').fill('new.example.test.');

    const ptrReq = page.waitForRequest(
      (r) => r.method() === 'PUT' && r.url().includes('/api/v7.0/host_ip_addresses/50')
    );
    await page.getByTestId('vps.network.host_addresses.ptr.submit').click();
    expect((await ptrReq).postDataJSON()).toEqual({
      host_ip_address: {
        reverse_record_value: 'new.example.test.',
      },
    });

    await page.getByTestId('vps.network.host_addresses.row.50.free').click();
    await expect(page.getByTestId('vps.network.host_addresses.free_confirm')).toBeVisible();
    const freeHostReq = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/host_ip_addresses/50/free')
    );
    await page.getByTestId('vps.network.host_addresses.free_confirm.confirm').click();
    expect((await freeHostReq).postData()).toBe('{}');

    await page.getByTestId('vps.network.ip_addresses.item.1.owner').click();
    await page.getByTestId('vps.network.ip_addresses.owner.user').fill('77');
    await page.getByTestId('vps.network.ip_addresses.owner.environment').selectOption('3');
    const ownerReq = page.waitForRequest(
      (r) => r.method() === 'PUT' && r.url().includes('/api/v7.0/ip_addresses/1')
    );
    await page.getByTestId('vps.network.ip_addresses.owner.submit').click();
    expect((await ownerReq).postDataJSON()).toEqual({
      ip_address: {
        user: 77,
        environment: 3,
      },
    });

    await page.getByTestId('vps.network.ip_addresses.item.1.free_route').click();
    await expect(page.getByTestId('vps.network.ip_addresses.free_route_confirm')).toBeVisible();
    const freeRouteReq = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/ip_addresses/1/free')
    );
    await page.getByTestId('vps.network.ip_addresses.free_route_confirm.confirm').click();
    expect((await freeRouteReq).postData()).toBe('{}');
  });

  test('busy VPS transaction gates networking mutations with an explanation', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: ips }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
        'GET host_ip_addresses': () => ({
          host_ip_addresses: [
            {
              id: 50,
              addr: '198.51.100.10',
              assigned: true,
              reverse_record_value: 'old.example.test.',
              user_created: true,
              ip_address: { id: 1, addr: '198.51.100.10' },
            },
            {
              id: 51,
              addr: '198.51.100.11',
              assigned: false,
              user_created: true,
              ip_address: { id: 1, addr: '198.51.100.10' },
            },
          ],
        }),
        'GET environments': () => ({ environments: [{ id: 3, label: 'env-test' }] }),
        'GET transaction_chains': (ctx) => {
          const cls = ctx.searchParams.get('transaction_chain[class_name]');
          const rowId = ctx.searchParams.get('transaction_chain[row_id]');

          if (cls === 'Vps' && rowId === '123') {
            return {
              transaction_chains: [
                {
                  id: 919,
                  state: 'running',
                  name: 'Vps#123 network operation',
                  progress: 0,
                  size: 1,
                },
              ],
            };
          }

          return { transaction_chains: [] };
        },
        'PUT ip_addresses/1': () => {
          throw new Error('owner update should be blocked by busy gate');
        },
        'POST host_ip_addresses/50/free': () => {
          throw new Error('host address free should be blocked by busy gate');
        },
      },
    });

    await page.goto('/admin/vps/123/network');
    await expect(page.getByTestId('vps.network.page')).toBeVisible();
    await openAdminNetworkSettings(page);

    const disable = page.getByTestId('vps.network.disable');
    await expect(disable).toHaveAttribute('aria-disabled', 'true');
    await expect(disable).toHaveAttribute('title', 'Operation in progress');

    await expect(page.getByTestId('vps.network.ip_addresses.item.1.owner')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('vps.network.ip_addresses.item.1.free_route')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('vps.network.ip_addresses.unassigned.2.assign')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('vps.network.host_addresses.row.50.ptr')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('vps.network.host_addresses.row.50.free')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('vps.network.host_addresses.row.51.assign')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('vps.network.host_addresses.row.51.delete')).toHaveAttribute('aria-disabled', 'true');
  });

  test('keeps ownership and VPS toggles admin-only while exposing user route management', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 2, login: 'user', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: ips }),
        'GET host_ip_addresses': () => ({
          host_ip_addresses: [
            {
              id: 50,
              addr: '198.51.100.10',
              assigned: true,
              reverse_record_value: 'old.example.test.',
              user_created: true,
              ip_address: { id: 1, addr: '198.51.100.10' },
            },
          ],
        }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
      },
    });

    await page.goto('/app/vps/123/network');
    await expect(page.getByTestId('vps.network.page')).toBeVisible();
    await expect(page.getByTestId('vps.network.host_addresses')).toBeVisible();
    await expect(page.getByTestId('vps.network.host_addresses.row.50.ptr')).toBeVisible();
    await expect(page.getByTestId('vps.network.ip_addresses.add')).toBeVisible();
    await expect(page.getByTestId('vps.network.ip_addresses.item.1.owner')).toHaveCount(0);
    await expect(page.getByTestId('vps.network.ip_addresses.item.1.free_route')).toBeVisible();
    await expect(page.getByTestId('vps.network.ip_addresses.unassigned.2.assign')).toBeVisible();
    await expect(page.getByTestId('vps.network.admin_settings')).toHaveCount(0);
    await expect(page.getByTestId('vps.network.disable')).toHaveCount(0);
  });

  test('adds a private IPv4 address from the normal user VPS detail', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const freePrivate = {
      id: 77,
      addr: '10.20.30.40',
      prefix: 32,
      network_interface: null,
      user: null,
      network: { id: 9, role: 'private_access', purpose: 'vps', ip_version: 4 },
    };

    await installHaveApiMock(page, {
      user: { id: 2, login: 'user', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps: { ...vps, user: { id: 2, login: 'user' } } }),
        'GET ip_addresses': (ctx) => {
          if (ctx.searchParams.get('ip_address[role]') === 'private_access') {
            return { ip_addresses: [freePrivate] };
          }
          return { ip_addresses: ips };
        },
        'GET host_ip_addresses': () => ({ host_ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
        'POST ip_addresses/77/assign': () => ({
          ip_address: { ...freePrivate, network_interface: { id: 1 } },
          _meta: { action_state_id: 1277 },
        }),
        'GET action_states/1277': () => ({ action_state: { id: 1277, finished: true, status: true, current: 1, total: 1 } }),
      },
    });

    await page.goto('/app/vps/123/network');
    await page.getByTestId('vps.network.ip_addresses.add').click();
    await expect(page.getByTestId('vps.network.ip_addresses.add_modal')).toBeVisible();
    await page.getByTestId('network.user.assign.kind').selectOption('ipv4_private');
    await page.getByTestId('network.user.assign.continue').click();
    await expect(page.getByTestId('network.user.assign.address')).toContainText('10.20.30.40/32');

    const request = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/api/v7.0/ip_addresses/77/assign')
    );
    await page.getByTestId('network.user.assign.submit').click();
    expect((await request).postDataJSON()).toEqual({
      ip_address: { network_interface: 1 },
    });
  });

  test('@pr-smoke-mobile creates a route and its default host address in one workflow', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const freeIp = {
      id: 201,
      addr: '198.51.100.201',
      prefix: 32,
      network_interface: null,
      user: { id: 2, login: 'user' },
      network: {
        id: 21,
        role: 'public_access',
        purpose: 'vps',
        ip_version: 4,
        primary_location: { id: 10, label: 'Prague' },
      },
    };
    let currentIps = [freeIp];
    let hostAddresses: Array<Record<string, unknown>> = [];
    let assignPayload: unknown;

    await installHaveApiMock(page, {
      user: { id: 2, login: 'user', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps: { ...vps, user: { id: 2, login: 'user' } } }),
        'GET ip_addresses': () => ({ ip_addresses: currentIps }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: hostAddresses }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
        'POST ip_addresses/201/assign_with_host_address': (ctx) => {
          assignPayload = ctx.request.postDataJSON?.();
          currentIps = [{ ...freeIp, network_interface: { id: 1, name: 'eth0' }, routed: true }];
          hostAddresses = [{
            id: 301,
            addr: '198.51.100.201',
            assigned: true,
            user_created: false,
            ip_address: { id: 201, addr: '198.51.100.201', network_interface: { id: 1 } },
          }];
          return { ip_address: currentIps[0], _meta: { action_state_id: 2201 } };
        },
        'GET action_states/2201': () => ({
          action_state: { id: 2201, finished: true, status: true, current: 1, total: 1 },
        }),
      },
    });

    await page.goto('/app/vps/123/network');
    await page.getByTestId('vps.network.ip_addresses.unassigned.201.assign').click();
    await page.getByTestId('network.user.assign.continue').click();
    await page.getByTestId('network.user.assign.mode').selectOption('route_host');
    await page.getByTestId('network.user.assign.submit').click();

    await expect(page.getByTestId('vps.network.ip_addresses.add_modal')).toBeHidden();
    await expect.poll(() => assignPayload).toEqual({
      ip_address: { network_interface: 1 },
    });
    await expect(page.getByTestId('vps.network.ip_addresses.item.201')).toBeVisible();
    await expect(page.getByTestId('vps.network.host_addresses.row.301')).toContainText('198.51.100.201');
  });

  test('routes through an eligible host address and reads the selected hop back', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const freeIp = {
      id: 202,
      addr: '198.51.100.202',
      prefix: 32,
      network_interface: null,
      user: { id: 2, login: 'user' },
      network: {
        id: 22,
        role: 'public_access',
        purpose: 'vps',
        ip_version: 4,
        primary_location: { id: 10, label: 'Prague' },
      },
    };
    const routeVia = {
      id: 350,
      addr: '198.51.100.10',
      assigned: true,
      user_created: true,
      ip_address: { id: 1, addr: '198.51.100.10', network_interface: { id: 1, name: 'eth0' } },
    };
    let currentIps: Array<Record<string, unknown>> = [freeIp];
    let assignPayload: unknown;

    await installHaveApiMock(page, {
      user: { id: 2, login: 'user', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps: { ...vps, user: { id: 2, login: 'user' } } }),
        'GET ip_addresses': () => ({ ip_addresses: currentIps }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: [routeVia] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
        'POST ip_addresses/202/assign': (ctx) => {
          assignPayload = ctx.request.postDataJSON?.();
          currentIps = [{
            ...freeIp,
            network_interface: { id: 1, name: 'eth0' },
            routed: true,
            route_via: { id: 350, addr: '198.51.100.10' },
          }];
          return { ip_address: currentIps[0], _meta: { action_state_id: 2202 } };
        },
        'GET action_states/2202': () => ({
          action_state: { id: 2202, finished: true, status: true, current: 1, total: 1 },
        }),
      },
    });

    await page.goto('/app/vps/123/network');
    await page.getByTestId('vps.network.ip_addresses.unassigned.202.assign').click();
    await page.getByTestId('network.user.assign.continue').click();
    await page.getByTestId('network.user.assign.mode').selectOption('route_via');
    await expect(page.getByTestId('network.user.assign.route_via')).toContainText('198.51.100.10');
    await page.getByTestId('network.user.assign.route_via').selectOption('350');
    await page.getByTestId('network.user.assign.submit').click();

    await expect.poll(() => assignPayload).toEqual({
      ip_address: { network_interface: 1, route_via: 350 },
    });
    await expect(page.getByTestId('vps.network.ip_addresses.item.202')).toContainText('198.51.100.10');
  });

  test('retries only the unfinished suffix after a partial host-address batch failure', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const calls: unknown[] = [];
    const created: Array<Record<string, unknown>> = [];
    let failSecondOnce = true;

    await installHaveApiMock(page, {
      user: { id: 2, login: 'user', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps: { ...vps, user: { id: 2, login: 'user' } } }),
        'GET ip_addresses': () => ({ ip_addresses: [ips[0]] }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: created }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
        'POST host_ip_addresses': (ctx) => {
          const payload = ctx.request.postDataJSON?.();
          calls.push(payload);
          const address = String((payload as any)?.host_ip_address?.addr ?? '');
          if (address === '198.51.100.12' && failSecondOnce) {
            failSecondOnce = false;
            return failEnvelope('Address is temporarily busy');
          }
          const row = {
            id: 400 + created.length,
            addr: address,
            assigned: false,
            user_created: true,
            ip_address: { id: 1, addr: '198.51.100.10', network_interface: { id: 1 } },
          };
          created.push(row);
          return { host_ip_address: row };
        },
      },
    });

    await page.goto('/app/vps/123/network');
    await page.getByTestId('vps.network.ip_addresses.item.1.add_hosts').click();
    const editor = page.getByTestId('vps.network.host_addresses.create.addresses');
    await editor.fill('198.51.100.11\n198.51.100.12\n198.51.100.13');
    await page.getByTestId('vps.network.host_addresses.create.submit').click();

    await expect(page.getByTestId('vps.network.host_addresses.create')).toBeVisible();
    await expect(editor).toHaveValue('198.51.100.12\n198.51.100.13');
    expect(calls).toEqual([
      { host_ip_address: { ip_address: 1, addr: '198.51.100.11' } },
      { host_ip_address: { ip_address: 1, addr: '198.51.100.12' } },
    ]);

    await page.getByTestId('vps.network.host_addresses.create.submit').click();
    await expect(page.getByTestId('vps.network.host_addresses.create')).toBeHidden();
    expect(calls).toEqual([
      { host_ip_address: { ip_address: 1, addr: '198.51.100.11' } },
      { host_ip_address: { ip_address: 1, addr: '198.51.100.12' } },
      { host_ip_address: { ip_address: 1, addr: '198.51.100.12' } },
      { host_ip_address: { ip_address: 1, addr: '198.51.100.13' } },
    ]);
  });

  test('keeps interface limits out of an admin account user view', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: ips }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET network_interfaces': () => ({ network_interfaces: netifs }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: acct }),
      },
    });

    await page.goto('/app/vps/123/network');
    await interfaceEditButton(page).click();

    await expect(page.getByTestId('vps.network.edit.max_tx')).toHaveCount(0);
    await expect(page.getByTestId('vps.network.edit.max_rx')).toHaveCount(0);
    await expect(page.getByTestId('vps.network.edit.enabled')).toHaveCount(0);
  });
});
