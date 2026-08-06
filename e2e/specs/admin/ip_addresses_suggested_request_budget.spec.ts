import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('@smoke @smoke-mobile admin suggested IPs prioritize Prague and Brno with a bounded progressive request budget', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  const locations = [
    { id: 1, label: 'Brno', environment: { id: 1, label: 'Production' } },
    { id: 2, label: 'Playground', environment: { id: 2, label: 'Playground' } },
    { id: 3, label: 'Praha', environment: { id: 1, label: 'Production' } },
    { id: 4, label: 'Staging', environment: { id: 3, label: 'Staging' } },
    { id: 5, label: 'Testing', environment: { id: 4, label: 'Testing' } },
    { id: 6, label: 'Development', environment: { id: 5, label: 'Development' } },
    { id: 7, label: 'Integration', environment: { id: 6, label: 'Integration' } },
    { id: 8, label: 'Overflow', environment: { id: 7, label: 'Overflow' } },
  ];
  const requests: URL[] = [];
  const attempts = new Map<string, number>();
  const releases = new Map<number, () => void>();
  const gates = new Map<number, Promise<void>>(
    locations.map(({ id }) => [id, new Promise<void>((resolve) => releases.set(id, resolve))])
  );

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET locations': () => ({ locations }),
      'GET ip_addresses': async (ctx) => {
        const url = new URL(ctx.url.href);
        requests.push(url);
        const locationId = Number(url.searchParams.get('ip_address[location]'));
        const version = Number(url.searchParams.get('ip_address[version]'));
        const role = url.searchParams.get('ip_address[role]');
        const requestKey = `${locationId}:${version}:${role ?? 'any'}`;
        const attempt = (attempts.get(requestKey) ?? 0) + 1;
        attempts.set(requestKey, attempt);
        if (requestKey === '3:6:any' && attempt === 1) {
          return {
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ status: false, message: 'temporary test failure', response: null }),
          };
        }
        await gates.get(locationId);
        const addr = version === 6
          ? `2001:db8:${locationId}::1`
          : role === 'private_access' ? `10.${locationId}.0.1` : `198.51.${locationId}.1`;
        return {
          ip_addresses: [{
            id: locationId * 10 + (version === 6 ? 3 : role === 'private_access' ? 2 : 1),
            addr,
            prefix: version === 6 ? 128 : 32,
            network: {
              id: 1_000 + locationId,
              ip_version: version,
              role: role ?? 'public_access',
              purpose: 'vps',
              primary_location: locations.find((location) => location.id === locationId),
            },
            user: null,
            network_interface: null,
          }],
        };
      },
    },
  });

  await page.goto('/admin/ip-addresses');
  await expect.poll(() => requests.length).toBe(6);
  expect(requests.map((url) => Number(url.searchParams.get('ip_address[location]')))).toEqual([
    3, 3, 3, 1, 1, 1,
  ]);

  releases.get(1)?.();
  await expect(page.locator('[data-testid="admin.ip_addresses.row.11"]:visible, [data-testid="admin.ip_addresses.card.11"]:visible')).toBeVisible();
  await expect.poll(() => requests.length).toBe(6);
  expect(requests.some((url) => url.searchParams.get('ip_address[location]') === '2')).toBe(false);
  releases.get(3)?.();
  await expect(page.locator('[data-testid="admin.ip_addresses.row.31"]:visible, [data-testid="admin.ip_addresses.card.31"]:visible')).toBeVisible();
  await expect(page.getByTestId('admin.ip_addresses.suggested.loading')).toBeVisible();
  await expect.poll(() => requests.length).toBe(9);
  expect(requests.slice(6).every((url) => url.searchParams.get('ip_address[location]') === '2')).toBe(true);

  for (const location of locations) releases.get(location.id)?.();
  await expect.poll(() => requests.length).toBe(18);
  const initialRequests = requests.slice(0, 18);
  expect(new Set(initialRequests.map((url) => url.searchParams.get('ip_address[location]')))).toEqual(
    new Set(['1', '2', '3', '4', '6', '7'])
  );
  for (const locationId of [3, 1, 2, 4, 6, 7]) {
    const locationRequests = initialRequests.filter(
      (url) => url.searchParams.get('ip_address[location]') === String(locationId)
    );
    expect(locationRequests).toHaveLength(3);
    expect(locationRequests.map((url) => [
      url.searchParams.get('ip_address[version]'),
      url.searchParams.get('ip_address[role]'),
    ])).toEqual([
      ['4', 'public_access'],
      ['4', 'private_access'],
      ['6', null],
    ]);
    locationRequests.forEach((url) => {
      expect(url.searchParams.get('ip_address[limit]')).toBe('50');
      expect(url.searchParams.get('ip_address[assigned_to_interface]')).toBe('false');
      expect(url.searchParams.get('ip_address[purpose]')).toBe('vps');
      expect(url.searchParams.get('ip_address[order]')).toBe('asc');
    });
  }
  await expect(page.getByTestId('admin.ip_addresses.suggested.loading')).toBeHidden();
  await expect(page.getByTestId('admin.ip_addresses.suggested.partial_error')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await page.waitForTimeout(250);
  expect(requests).toHaveLength(18);
  await page.getByTestId('admin.ip_addresses.suggested.retry').click();
  await expect.poll(() => requests.length).toBe(19);
  expect(attempts.get('3:6:any')).toBe(2);
  await expect(page.locator('[data-testid="admin.ip_addresses.row.33"]:visible, [data-testid="admin.ip_addresses.card.33"]:visible')).toBeVisible();
  await expect(page.getByTestId('admin.ip_addresses.suggested.partial_error')).toBeHidden();
  const screenshot = process.env.E2E_NETWORK_ADMIN_SCREENSHOT?.trim();
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
});

test('@smoke admin suggested IPs keep loading while empty priority locations advance', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  const locations = [
    { id: 8, label: 'Praha', environment: { id: 1, label: 'Production' } },
    { id: 7, label: 'Brno', environment: { id: 1, label: 'Production' } },
    { id: 9, label: 'Playground', environment: { id: 2, label: 'Playground' } },
  ];
  let releasePlayground!: () => void;
  const playgroundGate = new Promise<void>((resolve) => {
    releasePlayground = resolve;
  });
  let requestCount = 0;

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET locations': () => ({ locations }),
      'GET ip_addresses': async (ctx) => {
        requestCount += 1;
        const locationId = Number(ctx.searchParams.get('ip_address[location]'));
        const version = Number(ctx.searchParams.get('ip_address[version]'));
        const role = ctx.searchParams.get('ip_address[role]');
        if (locationId !== 9) return { ip_addresses: [] };
        await playgroundGate;
        if (version !== 4 || role !== 'public_access') return { ip_addresses: [] };
        return {
          ip_addresses: [{
            id: 91,
            addr: '198.51.100.91',
            prefix: 32,
            network: {
              id: 109,
              ip_version: 4,
              role: 'public_access',
              purpose: 'vps',
              primary_location: locations[2],
            },
            user: null,
            network_interface: null,
          }],
        };
      },
    },
  });

  await page.goto('/admin/ip-addresses');
  await expect.poll(() => requestCount).toBe(9);
  await expect(page.getByTestId('admin.ip_addresses.loading')).toBeVisible();
  await expect(page.getByTestId('admin.ip_addresses.empty')).toBeHidden();

  releasePlayground();
  await expect(page.locator('[data-testid="admin.ip_addresses.row.91"]:visible, [data-testid="admin.ip_addresses.card.91"]:visible')).toBeVisible();
  await expect(page.getByTestId('admin.ip_addresses.loading')).toBeHidden();
});
