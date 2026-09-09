import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('admin ip addresses: filters + keyset pagination (from_id)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chrome', 'Desktop table pagination is covered separately from mobile cards.');

  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  let seenFilterAddr: string | null = null;
  let seenPurpose: string | null = null;
  let seenOrder: string | null = null;

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET locations': () => ({ locations: [] }),
      'GET ip_addresses': (ctx) => {
        const fromId = ctx.searchParams.get('ip_address[from_id]');
        const limitStr = ctx.searchParams.get('ip_address[limit]');
        const limit = limitStr ? Number(limitStr) : 50;

        const addr = ctx.searchParams.get('ip_address[addr]');
        const vps = ctx.searchParams.get('ip_address[vps]');
        const version = ctx.searchParams.get('ip_address[version]');
        seenPurpose = ctx.searchParams.get('ip_address[purpose]');
        seenOrder = ctx.searchParams.get('ip_address[order]');

        if (addr) seenFilterAddr = addr;

        const startId = fromId ? Number(fromId) - 1 : 125;
        const count = Number.isFinite(limit) && limit > 0 ? limit : 50;

        const base = addr && addr.includes('.') ? addr.split('.').slice(0, 3).join('.') : '192.0.2';

        const ip_addresses = Array.from({ length: count }, (_, i) => {
          const id = startId - i;
          const ip = `${base}.${(id % 200) + 1}`;
          return {
            id,
            addr: ip,
            prefix: 32,
            routed: id % 2 === 0,
            user: { id: 1000 + (id % 10), login: `u${id % 10}` },
            vps: { id: 2000 + (id % 10), hostname: `vps${id % 10}` },
            network: { id: 3000, address: '192.0.2.0', prefix: 24 },
            network_interface: id % 2 === 0 ? { id: 4000, name: 'eth0' } : null,
            created_at: '2025-01-01T00:00:00Z',
            _filters: { addr, vps, version },
          };
        }).filter((it) => it.id > 0);

        return { ip_addresses };
      },
    },
  });

  await page.goto('/admin/ip-addresses');

  await expect(page.getByTestId('admin.ip_addresses.row.125')).toBeVisible();
  await expect.poll(() => seenPurpose).toBe('vps');
  expect(seenOrder).toBeNull();
  await expect(page.getByTestId('admin.ip_addresses.row.125')).toHaveAttribute('data-row-variant', 'warn');
  await expect(page.getByTestId('admin.ip_addresses.row.125.dot')).toBeVisible();
  const incidentsAction = page.getByTestId('admin.ip_addresses.row.125.action.incidents');
  const assignmentsAction = page.getByTestId('admin.ip_addresses.row.125.action.assignments');
  const routeAction = page.getByTestId('admin.ip_addresses.row.125.action.route');
  const ownerAction = page.getByTestId('admin.ip_addresses.row.125.action.owner');
  const hostsAction = page.getByTestId('admin.ip_addresses.row.125.action.hosts');
  await expect(incidentsAction).toHaveAttribute('aria-label', 'Incidents');
  await expect(assignmentsAction).toHaveAttribute('aria-label', 'Assignments');
  await expect(routeAction).toHaveAttribute('aria-label', 'Assign route');
  await expect(routeAction).toHaveAttribute('title', 'Assign route');
  await expect(routeAction).toHaveAttribute('href', '/admin/ip-addresses/125#route');
  await expect(ownerAction).toHaveAttribute('aria-label', 'Ownership');
  await expect(hostsAction).toHaveAttribute('aria-label', 'Host IP addresses');
  await expect(incidentsAction).toHaveText('');
  await expect(routeAction).toHaveText('');
  await expect(page.getByTestId('admin.ip_addresses.row.124.action.route')).toHaveAttribute('aria-label', 'Remove route');

  const proofScreenshot = process.env.E2E_IP_ACTIONS_PROOF_SCREENSHOT?.trim();
  if (proofScreenshot) {
    await page.screenshot({ path: proofScreenshot });
  }

  // Apply a server-side filter.
  const sfi = page.getByTestId('admin.ip_addresses.smart_filter.input');
  await sfi.fill('addr:10.0.0.1');
  await expect(sfi).toHaveValue('addr:10.0.0.1');
  await sfi.press('Enter');
  await expect.poll(() => seenFilterAddr).toBe('10.0.0.1');
  await expect(page.getByTestId('admin.ip_addresses.row.125')).toContainText('10.0.0.1');

  // Next page uses from_id.
  await page.getByTestId('admin.ip_addresses.pagination.desktop.next').click();
  await expect(page.getByTestId('admin.ip_addresses.row.75')).toBeVisible();
  await expect(page.getByTestId('admin.ip_addresses.row.75')).toHaveAttribute('data-row-variant', 'warn');
});

test('admin IP address cards keep compact actions on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET locations': () => ({ locations: [] }),
      'GET ip_addresses': () => ({
        ip_addresses: [{
          id: 125,
          addr: '192.0.2.125',
          prefix: 32,
          routed: true,
          user: { id: 7, login: 'alice' },
          vps: { id: 42, hostname: 'vps-42' },
          network: { id: 3000, address: '192.0.2.0', prefix: 24 },
          network_interface: { id: 4000, name: 'eth0' },
          created_at: '2025-01-01T00:00:00Z',
        }],
      }),
    },
  });

  await page.goto('/admin/ip-addresses');

  const card = page.getByTestId('admin.ip_addresses.card.125');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('admin.ip_addresses.card.125.action.incidents')).toHaveAttribute('aria-label', 'Incidents');
  await expect(card.getByTestId('admin.ip_addresses.card.125.action.route')).toHaveAttribute('aria-label', 'Remove route');
  await expect(card.getByTestId('admin.ip_addresses.card.125.action.owner')).toHaveAttribute('aria-label', 'Ownership');
  await expect(card.getByTestId('admin.ip_addresses.card.125.action.hosts')).toHaveAttribute('aria-label', 'Host IP addresses');

  const proofScreenshot = process.env.E2E_IP_ACTIONS_MOBILE_PROOF_SCREENSHOT?.trim();
  if (proofScreenshot) await page.screenshot({ path: proofScreenshot, fullPage: true });
});

test('@pr-smoke @pr-smoke-mobile admin IP address search resolves an exact user login and shows owned addresses', async ({ page }, testInfo) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  const ipRequests: Array<{
    user: string | null;
    q: string | null;
    assigned: string | null;
    version: string | null;
    fromId: string | null;
    limit: string | null;
  }> = [];

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET locations': () => ({ locations: [] }),
      'GET users': (ctx) => ({
        users: ctx.searchParams.get('user[login]') === 'base48'
          ? [{ id: 48, login: 'base48', level: 1 }]
          : [],
      }),
      'POST cluster/search': () => ({ cluster_search: [] }),
      'GET ip_addresses': (ctx) => {
        const request = {
          user: ctx.searchParams.get('ip_address[user]'),
          q: ctx.searchParams.get('ip_address[q]'),
          assigned: ctx.searchParams.get('ip_address[assigned_to_interface]'),
          version: ctx.searchParams.get('ip_address[version]'),
          fromId: ctx.searchParams.get('ip_address[from_id]'),
          limit: ctx.searchParams.get('ip_address[limit]'),
        };
        ipRequests.push(request);

        if (request.user !== '48') return { ip_addresses: [] };
        return {
          ip_addresses: [{
            id: 480,
            addr: '83.167.228.48',
            prefix: 32,
            user: { id: 48, login: 'base48' },
            vps: { id: 148, hostname: 'base48-vps' },
            network: { id: 12, address: '83.167.228.0', prefix: 24 },
            network_interface: { id: 1480, name: 'eth0' },
          }],
        };
      },
    },
  });

  for (const query of ['base48', 'q:base48', 'user:base48']) {
    await page.goto('/admin/ip-addresses?limit=25&page=2&from_id=51');

    const input = page.getByTestId('admin.ip_addresses.smart_filter.input');
    await input.fill(query);
    await input.press('Enter');

    await expect(page).toHaveURL(/(?:\?|&)user=48(?:&|$)/);
    await expect(page).not.toHaveURL(/(?:\?|&)q=/);
    await expect(page).not.toHaveURL(/(?:\?|&)from_id=/);
    await expect(page).toHaveURL(/(?:\?|&)page=1(?:&|$)/);
    await expect(page).toHaveURL(/(?:\?|&)limit=25(?:&|$)/);
    await expect(page.getByTestId('admin.ip_addresses.quick.occupancy.any')).toHaveClass(/bg-surface/);
    const itemKind = testInfo.project.name === 'mobile-chrome' ? 'card' : 'row';
    const address = page.getByTestId(`admin.ip_addresses.${itemKind}.480`);
    await expect(address).toContainText('83.167.228.48');
    await expect(address).toContainText('base48');

    await expect.poll(() => ipRequests.at(-1)).toEqual({
      user: '48',
      q: null,
      assigned: null,
      version: null,
      fromId: null,
      limit: '25',
    });
  }

  await page.goto('/admin/ip-addresses?q=base48&limit=25&page=2&from_id=51');
  await expect(page).toHaveURL(/(?:\?|&)user=48(?:&|$)/);
  await expect(page).not.toHaveURL(/(?:\?|&)q=/);
  await expect(page).not.toHaveURL(/(?:\?|&)from_id=/);
  await expect(page).toHaveURL(/(?:\?|&)page=1(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)limit=25(?:&|$)/);
  await expect.poll(() => ipRequests.at(-1)).toEqual({
    user: '48',
    q: null,
    assigned: null,
    version: null,
    fromId: null,
    limit: '25',
  });

  await page.goto('/admin/ip-addresses');
  const atomicInput = page.getByTestId('admin.ip_addresses.smart_filter.input');
  await atomicInput.fill('version:4 assigned:true user:base48');
  await atomicInput.press('Enter');
  await expect(page).toHaveURL(/(?:\?|&)user=48(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)version=4(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)assigned_to_interface=1(?:&|$)/);
  await expect.poll(() => ipRequests.at(-1)).toEqual({
    user: '48',
    q: null,
    assigned: 'true',
    version: '4',
    fromId: null,
    limit: '50',
  });

  await atomicInput.fill('assigned:any user:base48');
  await atomicInput.press('Enter');
  await expect(page).toHaveURL(/(?:\?|&)occupancy=any(?:&|$)/);
  await expect(page).not.toHaveURL(/(?:\?|&)assigned_to_interface=/);
  await expect(page.getByTestId('admin.ip_addresses.quick.occupancy.any')).toHaveClass(/bg-surface/);
  await expect.poll(() => ipRequests.at(-1)).toEqual({
    user: '48',
    q: null,
    assigned: null,
    version: '4',
    fromId: null,
    limit: '50',
  });
});

test('@pr-smoke @pr-smoke-mobile admin IP address search never falls back to an unfiltered list for an unknown login', async ({ page }, testInfo) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  let ipRequestCount = 0;
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET locations': () => ({ locations: [] }),
      'GET users': () => ({ users: [] }),
      'POST cluster/search': () => ({ cluster_search: [] }),
      'GET ip_addresses': () => {
        ipRequestCount += 1;
        return {
          ip_addresses: [{
            id: 125,
            addr: '192.0.2.125',
            prefix: 32,
            network: { id: 12, address: '192.0.2.0', prefix: 24 },
          }],
        };
      },
    },
  });

  await page.goto('/admin/ip-addresses');
  const itemKind = testInfo.project.name === 'mobile-chrome' ? 'card' : 'row';
  const unrelatedAddress = page.getByTestId(`admin.ip_addresses.${itemKind}.125`);
  await expect(unrelatedAddress).toBeVisible();
  const requestsBeforeSearch = ipRequestCount;

  const input = page.getByTestId('admin.ip_addresses.smart_filter.input');
  await input.fill('missing-user');
  await input.press('Enter');

  await expect(page.getByTestId('admin.ip_addresses.chip.error.0')).toContainText(
    'Cannot resolve user: missing-user'
  );
  await expect(unrelatedAddress).toHaveCount(0);
  await expect(page.getByTestId('admin.ip_addresses.empty')).toBeVisible();
  expect(ipRequestCount).toBe(requestsBeforeSearch);

  await page.getByTestId('admin.ip_addresses.chip.error.0').getByRole('button', { name: 'Remove' }).click();
  await expect(input).toHaveValue('');
  await expect(unrelatedAddress).toBeVisible();

  await page.goto('/admin/ip-addresses?q=missing-user&page=2&from_id=125');
  await expect(page.getByTestId('admin.ip_addresses.chip.error.0')).toContainText(
    'Cannot resolve user: missing-user'
  );
  await expect(unrelatedAddress).toHaveCount(0);
  await page.getByTestId('admin.ip_addresses.chip.error.0').getByRole('button', { name: 'Remove' }).click();
  await expect(page).not.toHaveURL(/(?:\?|&)q=/);
  await expect(page).toHaveURL(/(?:\?|&)page=1(?:&|$)/);
  await expect(page).not.toHaveURL(/(?:\?|&)from_id=/);
  await expect(input).toHaveValue('');
  await expect(unrelatedAddress).toBeVisible();

  await input.fill('missing-user');
  await input.press('Enter');
  await expect(page.getByTestId('admin.ip_addresses.empty')).toBeVisible();
  const requestsBeforeUrlChange = ipRequestCount;

  await page.getByTestId('admin.ip_addresses.quick.shortcut.ipv6').click();
  await expect(page).toHaveURL(/(?:\?|&)version=6(?:&|$)/);
  await expect(page.getByTestId('admin.ip_addresses.chip.error.0')).toHaveCount(0);
  await expect(unrelatedAddress).toBeVisible();
  await expect.poll(() => ipRequestCount).toBeGreaterThan(requestsBeforeUrlChange);
});

test('@pr-smoke @pr-smoke-mobile admin IP address search keeps a newer URL filter when login lookup finishes late', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  let userLookupStarted = false;
  let userLookupFinished = false;
  const ipRequests: Array<{ user: string | null; version: string | null }> = [];
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET locations': () => ({ locations: [] }),
      'GET users': async () => {
        userLookupStarted = true;
        await new Promise<void>((resolve) => setTimeout(resolve, 350));
        userLookupFinished = true;
        return { users: [{ id: 48, login: 'base48', level: 1 }] };
      },
      'GET ip_addresses': (ctx) => {
        ipRequests.push({
          user: ctx.searchParams.get('ip_address[user]'),
          version: ctx.searchParams.get('ip_address[version]'),
        });
        return { ip_addresses: [] };
      },
    },
  });

  await page.goto('/admin/ip-addresses');
  const input = page.getByTestId('admin.ip_addresses.smart_filter.input');
  await input.fill('base48');
  await input.press('Enter');
  await expect.poll(() => userLookupStarted).toBe(true);

  await page.getByTestId('admin.ip_addresses.quick.shortcut.ipv6').click();
  await expect(page).toHaveURL(/(?:\?|&)version=6(?:&|$)/);
  await expect.poll(() => userLookupFinished).toBe(true);

  await expect(page).not.toHaveURL(/(?:\?|&)user=48(?:&|$)/);
  await expect(input).toHaveValue('base48');
  await expect.poll(() => ipRequests.at(-1)).toEqual({ user: null, version: '6' });
});

test('@pr-smoke @pr-smoke-mobile admin IP address search restarts a legacy URL lookup after another filter changes', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  let userLookupCount = 0;
  const ipRequests: Array<{ user: string | null; version: string | null }> = [];
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET locations': () => ({ locations: [] }),
      'GET users': async () => {
        userLookupCount += 1;
        await new Promise<void>((resolve) => setTimeout(resolve, 350));
        return { users: [{ id: 48, login: 'base48', level: 1 }] };
      },
      'GET ip_addresses': (ctx) => {
        ipRequests.push({
          user: ctx.searchParams.get('ip_address[user]'),
          version: ctx.searchParams.get('ip_address[version]'),
        });
        return { ip_addresses: [] };
      },
    },
  });

  await page.goto('/admin/ip-addresses?q=base48');
  await expect.poll(() => userLookupCount).toBeGreaterThan(0);
  await page.getByTestId('admin.ip_addresses.quick.shortcut.ipv6').click();

  await expect(page).toHaveURL(/(?:\?|&)version=6(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)user=48(?:&|$)/);
  await expect(page).not.toHaveURL(/(?:\?|&)q=/);
  await expect.poll(() => ipRequests.at(-1)).toEqual({ user: '48', version: '6' });
});

test('@pr-smoke @pr-smoke-mobile admin IP address search distinguishes lookup failure from a missing user', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET locations': () => ({ locations: [] }),
      'GET users': () => ({ status: false, message: 'lookup unavailable', response: null }),
      'GET ip_addresses': () => ({ ip_addresses: [] }),
    },
  });

  await page.goto('/admin/ip-addresses');
  const input = page.getByTestId('admin.ip_addresses.smart_filter.input');
  await input.fill('base48');
  await input.press('Enter');

  await expect(page.getByTestId('admin.ip_addresses.chip.error.0')).toContainText(
    'Could not verify user base48. Try again.'
  );
  await expect(page).not.toHaveURL(/(?:\?|&)user=/);
});
