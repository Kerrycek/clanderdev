import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

function visibleAddressItem(page: Page, id: number) {
  return page.locator(
    `[data-testid="network.user.ip.row.${id}"]:visible, ` +
    `[data-testid="network.user.ip.card.${id}"]:visible`
  );
}

test('@pr-smoke @pr-smoke-mobile user network page lists only own addresses and assigns all supported address types', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  const vps = {
    id: 123,
    hostname: 'my-vps.example',
    object_state: 'active',
    user: { id: 7, login: 'member' },
    node: {
      id: 3,
      location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
    },
  };

  const assigned = {
    id: 101,
    addr: '198.51.100.10',
    prefix: 32,
    network: {
      id: 11,
      ip_version: 4,
      role: 'public_access',
      purpose: 'any',
      primary_location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
    },
    network_interface: { id: 501, name: 'eth0', vps: { id: 123 } },
    vps: { id: 123, hostname: 'my-vps.example' },
    user: { id: 7, login: 'member' },
  };

  const ownedDetached = {
    id: 102,
    addr: '2001:db8::10',
    prefix: 128,
    network: {
      id: 12,
      ip_version: 6,
      role: 'public_access',
      primary_location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
    },
    network_interface: null,
    user: { id: 7, login: 'member' },
  };

  const freePrivate = {
    id: 103,
    addr: '10.20.30.40',
    prefix: 32,
    network: {
      id: 13,
      ip_version: 4,
      role: 'private_access',
      primary_location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
    },
    network_interface: null,
    user: null,
  };
  const listRequests: URL[] = [];
  const assignmentRequests: URL[] = [];
  const accountingRequests: URL[] = [];
  const monitorRequests: URL[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  await installHaveApiMock(page, {
    user: { id: 7, login: 'member', level: 1 },
    handlers: {
      'GET vpses': () => ({ vpses: [vps] }),
      'GET network_interfaces': () => ({ network_interfaces: [{ id: 501, name: 'eth0', vps: { id: 123 } }] }),
      'GET ip_address_assignments': (ctx) => {
        assignmentRequests.push(new URL(ctx.url.href));
        return {
          ip_address_assignments: [
            { id: 801, ip_address: assigned, ip_addr: assigned.addr, ip_prefix: 32, vps, user: { id: 7 } },
            {
              id: 802,
              ip_address: {
                ...assigned,
                id: 999,
                addr: '203.0.113.99',
                user: { id: 88, login: 'someone-else' },
                network_interface: { id: 999, name: 'eth0', vps: { id: 999 } },
                vps: { id: 999, hostname: 'foreign-vps.example' },
              },
              vps: { id: 999, hostname: 'foreign-vps.example' },
              user: { id: 88 },
            },
          ],
        };
      },
      'GET network_interface_accountings': (ctx) => {
        accountingRequests.push(new URL(ctx.url.href));
        const year = Number(ctx.searchParams.get('network_interface_accounting[year]'));
        const month = Number(ctx.searchParams.get('network_interface_accounting[month]'));
        if (year === currentYear && month === currentMonth) {
          return {
            network_interface_accountings: [
              {
                id: 701,
                year,
                month,
                bytes_in: 1024 ** 3,
                bytes_out: 2 * 1024 ** 3,
                network_interface: { id: 501, name: 'eth0', vps },
              },
            ],
          };
        }
        return { network_interface_accountings: [] };
      },
      'GET network_interface_monitors': (ctx) => {
        monitorRequests.push(new URL(ctx.url.href));
        return {
          network_interface_monitors: [
            {
              id: 901,
              bytes_in: 4096,
              bytes_out: 8192,
              packets_in: 40,
              packets_out: 80,
              delta: 2,
              updated_at: new Date().toISOString(),
              network_interface: { id: 501, name: 'eth0', vps },
            },
          ],
        };
      },
      'GET ip_addresses': (ctx) => {
        listRequests.push(new URL(ctx.url.href));
        const assignedFilter = ctx.searchParams.get('ip_address[assigned_to_interface]');
        const role = ctx.searchParams.get('ip_address[role]');
        const version = ctx.searchParams.get('ip_address[version]');

        if (role === 'private_access' && version === '4') {
          return { ip_addresses: [freePrivate] };
        }

        return { ip_addresses: [ownedDetached, freePrivate] };
      },
      'POST ip_addresses/103/assign': () => ({
        ip_address: { ...freePrivate, network_interface: { id: 501, name: 'eth0', vps: { id: 123 } } },
      }),
      'POST ip_addresses/102/assign': () => ({
        ip_address: { ...ownedDetached, network_interface: { id: 501, name: 'eth0', vps: { id: 123 } } },
      }),
    },
  });

  await page.goto('/app/networking');

  await expect(page.getByTestId('network.user.page')).toBeVisible();
  await expect(page.getByTestId('nav.sidebar.networking')).toHaveCount(1);
  await expect(page.getByTestId('network.user.tab.addresses')).toHaveAttribute('aria-selected', 'true');
  await expect(visibleAddressItem(page, 101)).toBeVisible();
  await expect(visibleAddressItem(page, 102)).toBeVisible();
  await expect(page.getByTestId('network.user.traffic')).toHaveCount(0);
  expect(accountingRequests).toHaveLength(0);
  expect(monitorRequests).toHaveLength(0);
  expect(assignmentRequests).toHaveLength(1);
  expect(assignmentRequests[0]?.searchParams.get('ip_address_assignment[active]')).toBe('true');
  expect(listRequests.some((url) => url.searchParams.has('ip_address[vps]'))).toBe(false);

  await page.getByTestId('network.user.tab.traffic').click();
  await expect(page).toHaveURL(/tab=traffic/);
  await expect(page.getByTestId('network.user.traffic')).toBeVisible();
  await expect(page.getByTestId('network.user.traffic.stat.total')).toContainText('3.00 GiB');
  await expect(page.getByTestId('network.user.traffic.panel.overview')).toBeVisible();
  await expect(page.getByTestId('network.user.traffic.chart')).toBeVisible();
  await page.getByTestId('network.user.traffic.tab.breakdown').click();
  await expect(page.getByTestId('network.user.traffic.panel.breakdown')).toBeVisible();
  await expect(page.getByTestId('network.user.traffic.table')).toContainText('my-vps.example');
  await expect(page.getByTestId('network.user.traffic.table')).toContainText('eth0');
  expect(accountingRequests).toHaveLength(6);
  expect(monitorRequests).toHaveLength(0);

  await page.getByTestId('network.user.tab.live').click();
  await expect(page).toHaveURL(/tab=live/);
  await expect(page.getByTestId('network.user.live')).toBeVisible();
  await expect(page.getByTestId('network.user.live.stat.in')).toContainText('2.00 KiB/s');
  await expect(page.getByTestId('network.user.live.stat.out')).toContainText('4.00 KiB/s');
  await expect(page.getByTestId('network.user.live.table')).toContainText('my-vps.example');
  expect(monitorRequests).toHaveLength(1);

  await page.getByTestId('network.user.tab.addresses').click();
  await expect(page).not.toHaveURL(/tab=/);
  const monitorRequestsAfterLeaving = monitorRequests.length;
  await page.waitForTimeout(5_500);
  expect(monitorRequests).toHaveLength(monitorRequestsAfterLeaving);
  await expect(page.getByText('203.0.113.99/32')).toHaveCount(0);
  await expect(page.getByText('10.20.30.40/32')).toHaveCount(0);

  const detachedRequest = listRequests.find(
    (url) => url.searchParams.get('ip_address[assigned_to_interface]') === 'false'
  );
  expect(detachedRequest?.searchParams.get('ip_address[purpose]')).toBeNull();
  expect(detachedRequest?.searchParams.get('ip_address[order]')).toBeNull();
  expect(
    listRequests.some(
      (url) =>
        url.searchParams.get('ip_address[assigned_to_interface]') === 'true' &&
        url.searchParams.get('ip_address[vps]') === null
    )
  ).toBe(false);
  expect(accountingRequests.length).toBeGreaterThan(0);
  expect(accountingRequests.some((url) => url.searchParams.has('network_interface_accounting[user]'))).toBe(false);

  await page.getByTestId('network.user.add').click();
  await page.getByTestId('network.user.assign.vps').selectOption('123');
  await page.getByTestId('network.user.assign.kind').selectOption('ipv4_private');
  await page.getByTestId('network.user.assign.continue').click();
  await expect(page.getByTestId('network.user.assign.address')).toContainText('10.20.30.40/32');

  const request = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/api/v7.0/ip_addresses/103/assign')
  );
  await page.getByTestId('network.user.assign.submit').click();

  expect((await request).postDataJSON()).toEqual({
    ip_address: { network_interface: 501 },
  });
  await expect(page.getByTestId('network.user.assign')).toBeHidden();

  await visibleAddressItem(page, 102).getByTestId('network.user.ip.102.assign').click();
  await page.getByTestId('network.user.assign.vps').selectOption('123');
  await page.getByTestId('network.user.assign.continue').click();
  await expect(page.getByTestId('network.user.assign.address')).toContainText('2001:db8::10/128');

  const ownedRequest = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/api/v7.0/ip_addresses/102/assign')
  );
  await page.getByTestId('network.user.assign.submit').click();

  expect((await ownedRequest).postDataJSON()).toEqual({
    ip_address: { network_interface: 501 },
  });
  await expect(page.getByTestId('network.user.assign')).toBeHidden();
});

test('user network assignment offers only VPS compatible with the selected detached IP location', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  const pragueVps = {
    id: 123,
    hostname: 'praha-vps.example',
    object_state: 'active',
    user: { id: 7, login: 'member' },
    node: {
      id: 3,
      location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
    },
  };
  const brnoVps = {
    id: 124,
    hostname: 'brno-vps.example',
    object_state: 'active',
    user: { id: 7, login: 'member' },
    node: {
      id: 4,
      location: { id: 20, label: 'Brno', environment: { id: 1, label: 'Production' } },
    },
  };
  const brnoDetachedIp = {
    id: 301,
    addr: '2001:db8:20::10',
    prefix: 128,
    network: {
      id: 31,
      ip_version: 6,
      role: 'public_access',
      primary_location: { id: 20, label: 'Brno', environment: { id: 1, label: 'Production' } },
    },
    network_interface: null,
    user: { id: 7, login: 'member' },
  };

  await installHaveApiMock(page, {
    user: { id: 7, login: 'member', level: 1 },
    handlers: {
      'GET vpses': () => ({ vpses: [pragueVps, brnoVps] }),
      'GET ip_address_assignments': () => ({ ip_address_assignments: [] }),
      'GET ip_addresses': (ctx) => {
        if (ctx.searchParams.get('ip_address[assigned_to_interface]') === 'false') {
          return { ip_addresses: [brnoDetachedIp] };
        }
        return { ip_addresses: [] };
      },
      'GET network_interfaces': () => ({ network_interfaces: [{ id: 601, name: 'venet0', vps: { id: 124 } }] }),
    },
  });

  await page.goto('/app/networking');

  await expect(visibleAddressItem(page, 301)).toBeVisible();
  await visibleAddressItem(page, 301).getByTestId('network.user.ip.301.assign').click();

  const vpsSelect = page.getByTestId('network.user.assign.vps');
  await expect(vpsSelect.locator('option')).toContainText(['Select VPS…', 'brno-vps.example (#124)']);
  await expect.poll(async () => (await vpsSelect.locator('option').allTextContents()).join('\n')).not.toContain('praha-vps.example');
});

test('admin user view fetches assignments through own user scope instead of the global cluster list', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  const vps = {
    id: 123,
    hostname: 'my-vps.example',
    object_state: 'active',
    user: { id: 7, login: 'admin-member' },
    node: {
      id: 3,
      location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
    },
  };
  const assignedWithoutNestedInterface = {
    id: 201,
    addr: '198.51.100.20',
    prefix: 32,
    network: {
      id: 21,
      ip_version: 4,
      role: 'public_access',
      purpose: 'any',
      primary_location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
    },
    network_interface: null,
    user: null,
  };
  const ownedDetached = {
    id: 202,
    addr: '2001:db8::20',
    prefix: 128,
    network: {
      id: 22,
      ip_version: 6,
      role: 'public_access',
      purpose: 'any',
      primary_location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
    },
    network_interface: null,
    user: { id: 7, login: 'admin-member' },
  };
  const requests: URL[] = [];
  const assignmentRequests: URL[] = [];
  const accountingRequests: URL[] = [];

  await installHaveApiMock(page, {
    user: { id: 7, login: 'admin-member', level: 99 },
    handlers: {
      'GET vpses': (ctx) => {
        expect(ctx.searchParams.get('vps[user]')).toBe('7');
        return { vpses: [vps] };
      },
      'GET network_interface_accountings': (ctx) => {
        accountingRequests.push(new URL(ctx.url.href));
        return { network_interface_accountings: [] };
      },
      'GET ip_address_assignments': (ctx) => {
        assignmentRequests.push(new URL(ctx.url.href));
        return {
          ip_address_assignments: [{
            id: 901,
            ip_address: assignedWithoutNestedInterface,
            ip_addr: assignedWithoutNestedInterface.addr,
            ip_prefix: assignedWithoutNestedInterface.prefix,
            vps,
            user: { id: 7, login: 'admin-member' },
          }],
        };
      },
      'GET ip_addresses': (ctx) => {
        requests.push(new URL(ctx.url.href));
        const assignedFilter = ctx.searchParams.get('ip_address[assigned_to_interface]');
        const ownerId = ctx.searchParams.get('ip_address[user]');

        if (assignedFilter === 'false' && ownerId === '7') return { ip_addresses: [ownedDetached] };

        return {
          ip_addresses: [{ ...assignedWithoutNestedInterface, id: 999, addr: '203.0.113.99' }],
        };
      },
    },
  });

  await page.goto('/app/networking');

  await expect(visibleAddressItem(page, 201)).toBeVisible();
  await expect(visibleAddressItem(page, 202)).toBeVisible();
  await expect(page.getByTestId('network.user.empty')).toHaveCount(0);
  await expect(visibleAddressItem(page, 201).getByText('my-vps.example')).toBeVisible();
  await expect(page.getByText('203.0.113.99/32')).toHaveCount(0);

  expect(assignmentRequests).toHaveLength(1);
  expect(assignmentRequests[0]?.searchParams.get('ip_address_assignment[user]')).toBe('7');
  expect(assignmentRequests[0]?.searchParams.get('ip_address_assignment[active]')).toBe('true');
  expect(requests.some((url) => url.searchParams.has('ip_address[vps]'))).toBe(false);
  expect(accountingRequests).toHaveLength(0);

  await page.getByTestId('network.user.tab.traffic').click();
  await expect(page.getByTestId('network.user.traffic')).toBeVisible();
  expect(accountingRequests).toHaveLength(6);
  expect(
    accountingRequests.every((url) => url.searchParams.get('network_interface_accounting[user]') === '7')
  ).toBe(true);
});
